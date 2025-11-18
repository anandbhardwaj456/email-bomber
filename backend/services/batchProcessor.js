const Contact = require('../models/Contact');
const Job = require('../models/Job');
const Campaign = require('../models/Campaign');
const Analytics = require('../models/Analytics');
const emailService = require('./emailService');

// Global performance settings
const CONCURRENCY = parseInt(process.env.EMAIL_CONCURRENCY || '20'); // 20 parallel sends
const MAX_RETRIES = parseInt(process.env.EMAIL_RETRIES || '2');      // retry failed emails
const BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || '500');  // contacts per batch

class FastBatchProcessor {
  constructor() {
    this.batchSize = BATCH_SIZE;
  }

  // -----------------------------
  //  CREATE BATCHES
  // -----------------------------
  async createBatches(campaignId, userId, filters = {}) {
    const query = { userId };

    if (filters.tags) query.tags = { $in: filters.tags };
    if (filters.status) query.status = { $in: filters.status };

    const contacts = await Contact.find(query).select('_id email name');
    const totalContacts = contacts.length;

    if (!totalContacts) throw new Error("No contacts found");

    const batches = [];
    for (let i = 0; i < contacts.length; i += this.batchSize) {
      const items = contacts.slice(i, i + this.batchSize).map(c => ({
        contactId: c._id,
        email: c.email,
        name: c.name || ""
      }));

      const job = await Job.create({
        campaignId,
        userId,
        batchNumber: batches.length + 1,
        contacts: items,
        status: "pending",
        progress: { total: items.length, sent: 0, failed: 0 }
      });

      batches.push({ jobId: job._id, batchNumber: batches.length + 1, contacts: items });
    }

    return { totalContacts, totalBatches: batches.length, batches };
  }

  // -----------------------------
  //  PROCESS ALL BATCHES
  // -----------------------------
  async processBatches(campaignId, userId, campaignData, batches) {
    const output = [];

    for (const batch of batches) {
      await this.processSingleBatch(campaignId, userId, campaignData, batch);
      output.push({
        jobId: batch.jobId,
        batchNumber: batch.batchNumber
      });
    }

    return output;
  }

  // -----------------------------
  //  PROCESS INDIVIDUAL BATCH (FAST, PARALLEL)
  // -----------------------------
  async processSingleBatch(campaignId, userId, campaignData, batch) {
    const { jobId, contacts } = batch;

    await Job.updateOne(
      { _id: jobId },
      { status: "processing", startedAt: new Date() }
    );

    let index = 0;

    // Process emails in parallel groups
    while (index < contacts.length) {
      const slice = contacts.slice(index, index + CONCURRENCY);
      index += CONCURRENCY;

      await Promise.all(
        slice.map(contact => this.sendToContact(jobId, campaignId, userId, contact, campaignData))
      );
    }

    // Mark completion
    const job = await Job.findById(jobId);
    await Job.updateOne(
      { _id: jobId },
      { status: "completed", completedAt: new Date() }
    );

    // Update campaign stats
    await Campaign.updateOne(
      { _id: campaignId },
      {
        $inc: {
          "stats.sent": job.progress.sent,
          "stats.failed": job.progress.failed
        }
      }
    );

    // Emit socket event
    if (global.io) {
      global.io.to(`campaign-${campaignId}`).emit("batch-completed", {
        campaignId,
        jobId,
        sent: job.progress.sent,
        failed: job.progress.failed
      });
    }

    // If this was last batch → complete campaign
    const pending = await Job.countDocuments({
      campaignId,
      status: { $in: ["pending", "processing"] }
    });

    if (pending === 0) {
      await Campaign.updateOne(
        { _id: campaignId },
        { status: "completed", completedAt: new Date() }
      );

      if (global.io) {
        global.io.to(`campaign-${campaignId}`).emit("campaign-completed", { campaignId });
      }
    }
  }

  // -----------------------------
  //  SEND EMAIL TO SINGLE CONTACT
  // -----------------------------
  async sendToContact(jobId, campaignId, userId, contact, campaignData) {
    const emailData = {
      from: `${campaignData.fromName} <${campaignData.fromEmail}>`,
      to: contact.email,
      subject: campaignData.subject,
      text: campaignData.body,
      html: campaignData.bodyHtml || campaignData.body,
      replyTo: campaignData.replyTo || campaignData.fromEmail,
      attachments: campaignData.attachments || []
    };

    // Retry sending email
    let attempt = 0;
    let result = null;

    while (attempt < MAX_RETRIES) {
      result = await emailService.sendEmail(emailData, 1);

      if (result.success) break;
      attempt++;
    }

    if (result.success) {
      await Job.updateOne(
        { _id: jobId },
        { $inc: { "progress.sent": 1 } }
      );

      await Analytics.create({
        campaignId,
        userId,
        contactId: contact.contactId,
        email: emailData.to,
        provider: result.provider,
        event: "sent",
        metadata: { messageId: result.messageId }
      });
    } else {
      await Job.updateOne(
        { _id: jobId },
        {
          $inc: { "progress.failed": 1 },
          $push: {
            errorLog: {
              email: emailData.to,
              error: result.error,
              attempts: MAX_RETRIES
            }
          }
        }
      );

      await Analytics.create({
        campaignId,
        userId,
        contactId: contact.contactId,
        email: emailData.to,
        event: "failed",
        metadata: { error: result.error }
      });
    }
  }

  // -----------------------------
  //  STATUS HELPERS
  // -----------------------------
  async getBatchStatus(jobId) {
    return Job.findById(jobId);
  }

  async getAllBatchStatuses(campaignId) {
    const jobs = await Job.find({ campaignId }).sort({ batchNumber: 1 });

    const totals = jobs.reduce(
      (acc, j) => {
        acc.total += j.progress.total;
        acc.sent += j.progress.sent;
        acc.failed += j.progress.failed;
        return acc;
      },
      { total: 0, sent: 0, failed: 0 }
    );

    return { jobs, totals };
  }
}

module.exports = new FastBatchProcessor();
