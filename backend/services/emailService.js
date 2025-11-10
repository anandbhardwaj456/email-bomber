const mailgun = require('mailgun-js');
const nodemailer = require('nodemailer');

// Simple logger (console only)
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args)
};

class EmailService {
  constructor() {
    this.providers = [];
    this.currentProviderIndex = 0;
    this.initializeProviders();
  }

  initializeProviders() {
    // Primary Mailgun
    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
      this.providers.push({
        name: 'mailgun',
        instance: mailgun({
          apiKey: process.env.MAILGUN_API_KEY,
          domain: process.env.MAILGUN_DOMAIN
        }),
        priority: 1
      });
    }

    // Backup Mailgun
    if (process.env.MAILGUN_API_KEY_BACKUP && process.env.MAILGUN_DOMAIN_BACKUP) {
      this.providers.push({
        name: 'mailgun-backup',
        instance: mailgun({
          apiKey: process.env.MAILGUN_API_KEY_BACKUP,
          domain: process.env.MAILGUN_DOMAIN_BACKUP
        }),
        priority: 2
      });
    }

    // SendGrid (if configured)
    if (process.env.SENDGRID_API_KEY) {
      // SendGrid would require @sendgrid/mail package
      this.providers.push({
        name: 'sendgrid',
        instance: null, // Would initialize SendGrid client here
        priority: 3
      });
    }

    // SMTP Fallback
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      this.providers.push({
        name: 'smtp',
        instance: transporter,
        priority: 4
      });
    }

    // Sort by priority
    this.providers.sort((a, b) => a.priority - b.priority);
    logger.info(`Initialized ${this.providers.length} email providers`);
  }

  getNextProvider() {
    if (this.providers.length === 0) {
      throw new Error('No email providers configured');
    }

    const provider = this.providers[this.currentProviderIndex];
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
    return provider;
  }

  async sendWithMailgun(mailgunInstance, emailData) {
    return new Promise((resolve, reject) => {
      const data = {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html,
        'h:Reply-To': emailData.replyTo || emailData.from
      };

      if (emailData.attachments && emailData.attachments.length > 0) {
        data.attachment = emailData.attachments.map(att => att.path);
      }

      mailgunInstance.messages().send(data, (error, body) => {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      });
    });
  }

  async sendWithSMTP(transporter, emailData) {
    const mailOptions = {
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      replyTo: emailData.replyTo || emailData.from
    };

    if (emailData.attachments && emailData.attachments.length > 0) {
      mailOptions.attachments = emailData.attachments.map(att => ({
        filename: att.filename,
        path: att.path
      }));
    }

    return await transporter.sendMail(mailOptions);
  }

  async sendEmail(emailData, maxRetries = 3) {
    let lastError = null;
    const providersToTry = [...this.providers];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (const provider of providersToTry) {
        try {
          let result;

          if (provider.name === 'mailgun' || provider.name === 'mailgun-backup') {
            result = await this.sendWithMailgun(provider.instance, emailData);
          } else if (provider.name === 'smtp') {
            result = await this.sendWithSMTP(provider.instance, emailData);
          } else if (provider.name === 'sendgrid') {
            // SendGrid implementation would go here
            throw new Error('SendGrid not yet implemented');
          }

          logger.info(`Email sent successfully via ${provider.name}`, {
            to: emailData.to,
            provider: provider.name,
            attempt: attempt + 1
          });

          return {
            success: true,
            provider: provider.name,
            messageId: result.id || result.message || 'unknown',
            result
          };
        } catch (error) {
          lastError = error;
          logger.error(`Failed to send email via ${provider.name}`, {
            to: emailData.to,
            provider: provider.name,
            error: error.message,
            attempt: attempt + 1
          });

          // If this is not the last provider, try next one
          if (providersToTry.indexOf(provider) < providersToTry.length - 1) {
            continue;
          }
        }
      }

      // If all providers failed, wait before retry
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    // All retries exhausted
    logger.error('All email providers failed after retries', {
      to: emailData.to,
      error: lastError?.message
    });

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      attempts: maxRetries
    };
  }
}

module.exports = new EmailService();

