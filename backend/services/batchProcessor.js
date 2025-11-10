const Contact = require('../models/Contact');
const Job = require('../models/Job');
const { emailQueue } = require('./queueService');

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
    }

    return jobs;
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
