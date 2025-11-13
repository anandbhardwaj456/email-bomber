const Bull = require('bull');
const emailService = require('./emailService');
const Job = require('../models/Job');
const Campaign = require('../models/Campaign');
const Analytics = require('../models/Analytics');

const logger = {
  info: (...args) => console.log('[QUEUE]', ...args),
  error: (...args) => console.error('[QUEUE ERROR]', ...args),
  warn: (...args) => console.warn('[QUEUE WARN]', ...args)
};

// Create Bull queue
const emailQueue = new Bull('email-queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  defaultJobOptions: {
    attempts: parseInt(process.env.JOB_ATTEMPTS || '1'),
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.BACKOFF_DELAY || '500')
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000
    },
    removeOnFail: {
      age: 24 * 3600 // Keep failed jobs for 24 hours
    }
  },
  limiter: {
    max: parseInt(process.env.MAX_EMAILS_PER_HOUR || '50000'),
    duration: parseInt(process.env.RATE_DURATION_MS || '3600000')
  }
});

// Concurrency and batching controls (tunable via env)
const EMAIL_CONCURRENCY = parseInt(process.env.EMAIL_CONCURRENCY || '10');
const BATCH_CONCURRENCY = parseInt(process.env.BATCH_CONCURRENCY || '2');
const BATCH_ENQUEUE_SIZE = parseInt(process.env.BATCH_ENQUEUE_SIZE || '200');

// Feature toggles for speed vs. observability
const ANALYTICS_ENABLED = String(process.env.ANALYTICS_ENABLED || 'true').toLowerCase() !== 'false';
const SOCKET_EMIT_PER_EMAIL = String(process.env.SOCKET_EMIT_PER_EMAIL || 'true').toLowerCase() !== 'false';

// Reduce DB writes by batching progress increments
const PROGRESS_BATCHING = String(process.env.PROGRESS_BATCHING || 'false').toLowerCase() === 'true';
const PROGRESS_BATCH_SIZE = parseInt(process.env.PROGRESS_BATCH_SIZE || '10');

// In-memory cache for batched progress
const progressCache = new Map(); // jobId -> { sent: number, failed: number, total: number }

async function flushProgress(jobId) {
  const cached = progressCache.get(String(jobId));
  if (!cached) return;
  const { sent, failed, total } = cached;
  if (sent === 0 && failed === 0) return;
  await Job.updateOne(
    { _id: jobId },
    {
      $inc: { 'progress.sent': sent, 'progress.failed': failed },
      ...(total ? { $set: { 'progress.total': total } } : {})
    }
  );
  progressCache.set(String(jobId), { sent: 0, failed: 0, total });
}

async function incProgress(jobId, { sent = 0, failed = 0, total = 0 }) {
  if (!PROGRESS_BATCHING) {
    await Job.updateOne(
      { _id: jobId },
      {
        $inc: { 'progress.sent': sent, 'progress.failed': failed },
        ...(total ? { $set: { 'progress.total': total } } : {})
      }
    );
    return;
  }
  const key = String(jobId);
  const existing = progressCache.get(key) || { sent: 0, failed: 0, total: 0 };
  const next = {
    sent: existing.sent + sent,
    failed: existing.failed + failed,
    total: total || existing.total
  };
  progressCache.set(key, next);
  const batchCount = next.sent + next.failed;
  if (batchCount >= PROGRESS_BATCH_SIZE) {
    await flushProgress(jobId);
  }
}

// Process email jobs with configurable concurrency
emailQueue.process('send-email', EMAIL_CONCURRENCY, async (job) => {
  const { emailData, jobId, campaignId, contactId, userId } = job.data;

  try {
    const result = await emailService.sendEmail(emailData, 1);

    if (result.success) {
      // Update job progress (batched if enabled)
      await incProgress(jobId, { sent: 1, failed: 0, total: job.data.total || 0 });

      // Create analytics record (optional)
      if (ANALYTICS_ENABLED) {
        await Analytics.create({
          campaignId,
          userId,
          contactId,
          email: emailData.to,
          event: 'sent',
          provider: result.provider,
          metadata: {
            messageId: result.messageId
          }
        });
      }

      // Emit real-time update via socket (optional)
      if (SOCKET_EMIT_PER_EMAIL) {
        try {
          const io = global.io;
          if (io) {
            io.to(`campaign-${campaignId}`).emit('email-sent', {
              campaignId,
              email: emailData.to,
              status: 'sent'
            });
          }
        } catch (e) {
          // ignore socket errors
        }
      }

      // After progress update, check if job has completed and finalize if so
      try {
        // Flush any batched progress before checking completion
        await flushProgress(jobId);
        const updatedJob = await Job.findById(jobId);
        const total = job.data.total || updatedJob.progress.total || 0;
        const done = (updatedJob.progress.sent + updatedJob.progress.failed) >= total && total > 0;
        if (done && updatedJob.status !== 'completed') {
          await Job.updateOne(
            { _id: jobId, status: { $ne: 'completed' } },
            { status: 'completed', completedAt: new Date() }
          );

          // Update campaign stats once per job completion
          await Campaign.updateOne(
            { _id: campaignId },
            {
              $inc: {
                'stats.sent': updatedJob.progress.sent,
                'stats.failed': updatedJob.progress.failed
              },
              $set: { 'stats.total': total }
            }
          );

          // If no remaining jobs, mark campaign completed
          const remaining = await Job.countDocuments({
            campaignId,
            status: { $in: ['pending', 'processing'] }
          });
          if (remaining === 0) {
            await Campaign.updateOne(
              { _id: campaignId },
              { $set: { status: 'completed', completedAt: new Date() } }
            );
            try {
              const io2 = global.io;
              if (io2) {
                io2.to(`campaign-${campaignId}`).emit('campaign-completed', { campaignId });
              }
            } catch (_) {}
          }
        }
      } catch (_) {}

      return { success: true, result };
    } else {
      // Handle failure
      await incProgress(jobId, { sent: 0, failed: 1, total: job.data.total || 0 });
      if (ANALYTICS_ENABLED) {
        await Analytics.create({
          campaignId,
          userId,
          contactId,
          email: emailData.to,
          event: 'failed',
          metadata: {
            error: result.error,
            attempts: result.attempts
          }
        });
      }

      // After progress update on failure, check if job has completed
      try {
        const updatedJob = await Job.findById(jobId);
        const total = job.data.total || updatedJob.progress.total || 0;
        const done = (updatedJob.progress.sent + updatedJob.progress.failed) >= total && total > 0;
        if (done && updatedJob.status !== 'completed') {
          await Job.updateOne(
            { _id: jobId, status: { $ne: 'completed' } },
            { status: 'completed', completedAt: new Date() }
          );

          await Campaign.updateOne(
            { _id: campaignId },
            {
              $inc: {
                'stats.sent': updatedJob.progress.sent,
                'stats.failed': updatedJob.progress.failed
              },
              $set: { 'stats.total': total }
            }
          );

          const remaining = await Job.countDocuments({
            campaignId,
            status: { $in: ['pending', 'processing'] }
          });
          if (remaining === 0) {
            await Campaign.updateOne(
              { _id: campaignId },
              { $set: { status: 'completed', completedAt: new Date() } }
            );
            try {
              const io2 = global.io;
              if (io2) {
                io2.to(`campaign-${campaignId}`).emit('campaign-completed', { campaignId });
              }
            } catch (_) {}
          }
        }
      } catch (_) {}

      throw new Error(result.error);
    }
  } catch (error) {
    // Log error and retry
    throw error;
  }
});

// Process batch jobs with configurable concurrency
emailQueue.process('send-batch', BATCH_CONCURRENCY, async (job) => {
  const { jobId, campaignId, userId, contacts, campaignData } = job.data;

  try {
    const jobDoc = await Job.findById(jobId);
    if (!jobDoc) {
      throw new Error('Job not found');
    }

    // Update job status
    await Job.updateOne({ _id: jobId }, { 
      status: 'processing',
      startedAt: new Date()
    });

    const totalContacts = contacts.length;

    // Enqueue emails in chunks to avoid massive single add bursts
    const batchSize = BATCH_ENQUEUE_SIZE; // number of enqueues per chunk
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      
      const promises = batch.map(async (contact) => {
        const emailData = {
          from: `${campaignData.fromName} <${campaignData.fromEmail}>`,
          to: contact.email,
          subject: campaignData.subject,
          text: campaignData.body,
          html: campaignData.bodyHtml || campaignData.body,
          replyTo: campaignData.replyTo || campaignData.fromEmail,
          attachments: campaignData.attachments || []
        };

        // Add email to queue
        await emailQueue.add('send-email', {
          emailData,
          jobId,
          campaignId,
          userId,
          contactId: contact.contactId,
          total: totalContacts
        }, {
          priority: 1,
          attempts: parseInt(process.env.JOB_ATTEMPTS_EMAIL || process.env.JOB_ATTEMPTS || '1')
        });
      });

      await Promise.all(promises);
    }

    // Short wait to allow last enqueues to register
    await new Promise(resolve => setTimeout(resolve, 200));

    // Get actual progress from database
    const updatedJob = await Job.findById(jobId);
    const sentCount = updatedJob.progress.sent;
    const failedCount = updatedJob.progress.failed;

    // Update job status if all emails are processed
    if (sentCount + failedCount >= totalContacts) {
      await Job.updateOne(
        { _id: jobId },
        {
          status: 'completed',
          completedAt: new Date()
        }
      );

      // Update campaign stats
      await Campaign.updateOne(
        { _id: campaignId },
        {
          $inc: {
            'stats.sent': sentCount,
            'stats.failed': failedCount
          },
          $set: {
            'stats.total': totalContacts
          }
        }
      );

      // Emit completion event
      try {
        const io = global.io;
        if (io) {
          io.to(`campaign-${campaignId}`).emit('batch-completed', {
            campaignId,
            jobId,
            sent: sentCount,
            failed: failedCount
          });
        }
      } catch (e) {
        // Socket not available
      }
      
      // If no remaining jobs for this campaign, mark campaign as completed
      const remaining = await Job.countDocuments({
        campaignId,
        status: { $in: ['pending', 'processing'] }
      });
      if (remaining === 0) {
        await Campaign.updateOne(
          { _id: campaignId },
          {
            $set: {
              status: 'completed',
              completedAt: new Date()
            }
          }
        );

        // Emit campaign completion event
        try {
          const io = global.io;
          if (io) {
            io.to(`campaign-${campaignId}`).emit('campaign-completed', {
              campaignId
            });
          }
        } catch (e) {
          // ignore socket errors
        }
      }
    }

    return { success: true, sent: sentCount, failed: failedCount };
  } catch (error) {
    await Job.updateOne(
      { _id: jobId },
      {
        status: 'failed',
        completedAt: new Date()
      }
    );
    throw error;
  }
});

// Queue event listeners
emailQueue.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

emailQueue.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed:`, err.message);
});

emailQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`);
});

// Add retry processor
const retryService = require('./retryService');
emailQueue.process('retry-failed-emails', async (job) => {
  const { jobId } = job.data;
  return await retryService.retryFailedEmails(jobId);
});

module.exports = { emailQueue };

