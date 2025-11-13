const Contact = require('../models/Contact');
const Job = require('../models/Job');
const Campaign = require('../models/Campaign');
const Analytics = require('../models/Analytics');
const emailService = require('./emailService');
const { emailQueue } = require('./queueService');

// Configurable sync fallback performance knobs (safe defaults)
const SYNC_SEND_CONCURRENCY = parseInt(process.env.SYNC_SEND_CONCURRENCY || '10');
const SYNC_SEND_RETRIES = parseInt(process.env.SYNC_SEND_RETRIES || process.env.EMAIL_SEND_RETRIES_SYNC || '1');

class BatchProcessor {
  constructor() {
    this.batchSize = parseInt(process.env.MAX_EMAILS_PER_BATCH || '1000');
  }

  async createBatches(campaignId, userId, contactFilters = {}) {
    const query = { userId, status: 'active' };
    
    if (contactFilters.tags && contactFilters.tags.length > 0) {
      query.tags = { $in: contactFilters.tags };
    }
    
    if (contactFilters.status && contactFilters.status.length > 0) {
      query.status = { $in: contactFilters.status };
    }

    const contacts = await Contact.find(query).select('_id email name');
    const totalContacts = contacts.length;

    if (totalContacts === 0) {
      throw new Error('No contacts found matching the filters');
    }

    const batches = [];
    const totalBatches = Math.ceil(totalContacts / this.batchSize);

    for (let i = 0; i < totalContacts; i += this.batchSize) {
      const batchContacts = contacts.slice(i, i + this.batchSize).map(contact => ({
        contactId: contact._id,
        email: contact.email,
        name: contact.name || ''
      }));

      const batchNumber = Math.floor(i / this.batchSize) + 1;

      const job = await Job.create({
        campaignId,
        userId,
        batchNumber,
        contacts: batchContacts,
        status: 'pending',
        progress: {
          total: batchContacts.length,
          sent: 0,
          failed: 0
        }
      });

      batches.push({
        jobId: job._id,
        batchNumber,
        contacts: batchContacts,
        total: batchContacts.length
      });
    }

    return {
      totalContacts,
      totalBatches,
      batches
    };
  }

  async processBatches(campaignId, userId, campaignData, batches) {
    const jobs = [];

    for (const batch of batches) {
      try {
        const job = await emailQueue.add('send-batch', {
          jobId: batch.jobId,
          campaignId,
          userId,
          contacts: batch.contacts,
          campaignData
        }, {
          priority: 1,
          attempts: 1
        });

        jobs.push({
          jobId: batch.jobId,
          queueJobId: job.id,
          batchNumber: batch.batchNumber
        });
      } catch (err) {
        // Fallback: process this batch synchronously if queueing fails (e.g., Redis down)
        await this.processBatchSynchronously(batch, campaignId, userId, campaignData);
        jobs.push({
          jobId: batch.jobId,
          queueJobId: null,
          batchNumber: batch.batchNumber
        });
      }
    }

    return jobs;
  }

  async processBatchSynchronously(batch, campaignId, userId, campaignData) {
    const { jobId, contacts } = batch;
    // Mark job processing
    await Job.updateOne({ _id: jobId }, {
      status: 'processing',
      startedAt: new Date()
    });

    const totalContacts = contacts.length;

    // Process contacts in parallel chunks for speed, with safe concurrency
    for (let i = 0; i < contacts.length; i += SYNC_SEND_CONCURRENCY) {
      const slice = contacts.slice(i, i + SYNC_SEND_CONCURRENCY);
      await Promise.all(slice.map(async (contact) => {
        const emailData = {
          from: `${campaignData.fromName} <${campaignData.fromEmail}>`,
          to: contact.email,
          subject: campaignData.subject,
          text: campaignData.body,
          html: campaignData.bodyHtml || campaignData.body,
          replyTo: campaignData.replyTo || campaignData.fromEmail,
          attachments: campaignData.attachments || []
        };

        const result = await emailService.sendEmail(emailData, SYNC_SEND_RETRIES);

        if (result.success) {
          await Job.updateOne(
            { _id: jobId },
            {
              $inc: { 'progress.sent': 1 },
              $set: { 'progress.total': totalContacts }
            }
          );

          // Record analytics similar to queue path
          try {
            await Analytics.create({
              campaignId,
              userId,
              contactId: contact.contactId,
              email: emailData.to,
              event: 'sent',
              provider: result.provider,
              metadata: { messageId: result.messageId, sync: true }
            });
          } catch (_) {}
        } else {
          await Job.updateOne(
            { _id: jobId },
            {
              $inc: { 'progress.failed': 1 },
              $push: {
                errorLog: {
                  email: emailData.to,
                  error: result.error,
                  retryCount: 0
                }
              }
            }
          );

          try {
            await Analytics.create({
              campaignId,
              userId,
              contactId: contact.contactId,
              email: emailData.to,
              event: 'failed',
              metadata: { error: result.error, attempts: result.attempts, sync: true }
            });
          } catch (_) {}
        }
      }));
    }

    // Finalize job and update campaign stats
    const updatedJob = await Job.findById(jobId);
    const sentCount = updatedJob.progress.sent;
    const failedCount = updatedJob.progress.failed;

    await Job.updateOne({ _id: jobId }, {
      status: 'completed',
      completedAt: new Date()
    });

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

    // Emit events if socket is available
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
    } catch (_) {}

    // If this was the last pending/processing job, mark campaign completed
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
        const io = global.io;
        if (io) {
          io.to(`campaign-${campaignId}`).emit('campaign-completed', { campaignId });
        }
      } catch (_) {}
    }
  }

  async getBatchStatus(jobId) {
    const job = await Job.findById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    return {
      jobId: job._id,
      status: job.status,
      progress: job.progress,
      batchNumber: job.batchNumber,
      startedAt: job.startedAt,
      completedAt: job.completedAt
    };
  }

  async getAllBatchStatuses(campaignId) {
    const jobs = await Job.find({ campaignId }).sort({ batchNumber: 1 });
    
    const totalProgress = {
      total: 0,
      sent: 0,
      failed: 0
    };

    jobs.forEach(job => {
      totalProgress.total += job.progress.total;
      totalProgress.sent += job.progress.sent;
      totalProgress.failed += job.progress.failed;
    });

    return {
      jobs: jobs.map(job => ({
        jobId: job._id,
        batchNumber: job.batchNumber,
        status: job.status,
        progress: job.progress
      })),
      totalProgress
    };
  }
}

module.exports = new BatchProcessor();
