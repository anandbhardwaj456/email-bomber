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
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
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
    max: parseInt(process.env.MAX_EMAILS_PER_HOUR || '10000'),
    duration: 3600000 // 1 hour
  }
});

// Process email jobs
emailQueue.process('send-email', async (job) => {
  const { emailData, jobId, campaignId, contactId } = job.data;

  try {
    const result = await emailService.sendEmail(emailData, 3);

    if (result.success) {
      // Update job progress
      await Job.updateOne(
        { _id: jobId },
        {
          $inc: { 'progress.sent': 1 },
          $set: { 'progress.total': job.data.total || 0 }
        }
      );

      // Create analytics record
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

      // Emit real-time update via socket (if available)
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
        // Socket not available, continue without real-time update
      }

      return { success: true, result };
    } else {
      // Handle failure
      await Job.updateOne(
        { _id: jobId },
        {
          $inc: { 'progress.failed': 1 },
          $push: {
            errorLog: {
              email: emailData.to,
              error: result.error,
              retryCount: job.attemptsMade
            }
          }
        }
      );

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

      throw new Error(result.error);
    }
  } catch (error) {
    // Log error and retry
    throw error;
  }
});

// Process batch jobs
emailQueue.process('send-batch', async (job) => {
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

    // Process emails with concurrency control
    const batchSize = 50; // Process 50 emails at a time
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
          attempts: 3
        });
      });

      await Promise.all(promises);
    }

    // Wait a bit for jobs to be added to queue
    await new Promise(resolve => setTimeout(resolve, 2000));

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

