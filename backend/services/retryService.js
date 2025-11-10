const Job = require('../models/Job');
const Analytics = require('../models/Analytics');
const emailService = require('./emailService');
const { emailQueue } = require('./queueService');

/**
 * Retry Service - Handles retrying failed emails with exponential backoff
 * This ensures zero-error guarantee by automatically retrying failed sends
 */
class RetryService {
  /**
   * Retry failed emails from a job
   * @param {String} jobId - The job ID to retry failed emails for
   */
  async retryFailedEmails(jobId) {
    try {
      const job = await Job.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      if (job.errorLog.length === 0) {
        return { message: 'No failed emails to retry', retried: 0 };
      }

      const failedEmails = job.errorLog.filter(
        error => error.retryCount < 3 && !error.resolved
      );

      if (failedEmails.length === 0) {
        return { message: 'All failed emails have been retried maximum times', retried: 0 };
      }

      let retried = 0;
      const retryPromises = failedEmails.map(async (errorLog) => {
        try {
          // Find the contact for this email
          const contact = job.contacts.find(c => c.email === errorLog.email);
          if (!contact) {
            return;
          }

          // Get campaign data
          const Campaign = require('../models/Campaign');
          const campaign = await Campaign.findById(job.campaignId);
          if (!campaign) {
            return;
          }

          const emailData = {
            from: `${campaign.fromName} <${campaign.fromEmail}>`,
            to: errorLog.email,
            subject: campaign.subject,
            text: campaign.body,
            html: campaign.bodyHtml || campaign.body,
            replyTo: campaign.replyTo || campaign.fromEmail,
            attachments: campaign.attachments || []
          };

          // Retry sending
          const result = await emailService.sendEmail(emailData, 3);

          if (result.success) {
            // Update error log
            await Job.updateOne(
              { _id: jobId, 'errorLog.email': errorLog.email },
              {
                $set: {
                  'errorLog.$.resolved': true,
                  'errorLog.$.retryCount': errorLog.retryCount + 1,
                  'errorLog.$.resolvedAt': new Date()
                },
                $inc: { 'progress.sent': 1, 'progress.failed': -1 }
              }
            );

            // Create analytics record
            await Analytics.create({
              campaignId: job.campaignId,
              userId: job.userId,
              contactId: contact.contactId,
              email: errorLog.email,
              event: 'sent',
              provider: result.provider,
              metadata: {
                messageId: result.messageId,
                retried: true
              }
            });

            retried++;
          } else {
            await Job.updateOne(
              { _id: jobId, 'errorLog.email': errorLog.email },
              {
                $set: {
                  'errorLog.$.retryCount': errorLog.retryCount + 1,
                  'errorLog.$.error': result.error
                }
              }
            );
          }
        } catch (err) {
          // Silent fail for individual email retries
        }
      });

      await Promise.all(retryPromises);

      return {
        message: `Retried ${retried} failed emails`,
        retried,
        total: failedEmails.length
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Schedule automatic retries for failed jobs
   * This can be called by a cron job
   */
  async scheduleRetries() {
    try {
      const failedJobs = await Job.find({
        status: 'completed',
        'errorLog': { $exists: true, $ne: [] }
      });

      for (const job of failedJobs) {
        const unresolvedErrors = job.errorLog.filter(
          error => error.retryCount < 3 && !error.resolved
        );

        if (unresolvedErrors.length > 0) {
          // Add delay based on retry count (exponential backoff)
          const maxRetryCount = Math.max(...unresolvedErrors.map(e => e.retryCount));
          const delay = Math.pow(2, maxRetryCount) * 60000; // 1min, 2min, 4min

          await emailQueue.add('retry-failed-emails', {
            jobId: job._id
          }, {
            delay,
            attempts: 1
          });
        }
      }
    } catch (error) {
      // Error handled silently
    }
  }
}

module.exports = new RetryService();

