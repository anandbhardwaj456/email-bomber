const Brevo = require('@getbrevo/brevo');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

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
    // Primary Brevo
    if (process.env.BREVO_API_KEY) {
      this.providers.push({
        name: 'brevo',
        instance: this.createBrevoClient(process.env.BREVO_API_KEY),
        priority: 1
      });
    }

    // Backup Brevo
    if (process.env.BREVO_API_KEY_BACKUP) {
      this.providers.push({
        name: 'brevo-backup',
        instance: this.createBrevoClient(process.env.BREVO_API_KEY_BACKUP),
        priority: 2
      });
    }

    // SMTP Fallback (with pooling for high throughput)
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        // Performance settings
        pool: true,
        maxConnections: parseInt(process.env.SMTP_MAX_CONNECTIONS || '10'),
        maxMessages: parseInt(process.env.SMTP_MAX_MESSAGES || '100'),
        // Optional soft rate limiting for providers that require it
        rateDelta: parseInt(process.env.SMTP_RATE_DELTA || '1000'), // window in ms
        rateLimit: parseInt(process.env.SMTP_RATE_LIMIT || '100')   // msgs per window
      });

      this.providers.push({
        name: 'smtp',
        instance: transporter,
        priority: 3
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

  createBrevoClient(apiKey) {
    const apiInstance = new Brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      Brevo.TransactionalEmailsApiApiKeys.apiKey,
      apiKey
    );
    return apiInstance;
  }  

  parseEmailAddress(address, fallbackName) {
    if (!address) {
      throw new Error('Email address is required');
    }

    if (typeof address === 'object' && address.email) {
      return {
        email: address.email,
        name: address.name || fallbackName || undefined
      };
    }

    const addressStr = String(address);
    const match = addressStr.match(/^(.*)<(.+)>$/);
    if (match) {
      const name = match[1].trim();
      const email = match[2].trim();
      return {
        email,
        name: fallbackName || (name.length > 0 ? name : undefined)
      };
    }

    return {
      email: addressStr.trim(),
      name: fallbackName || undefined
    };
  }

  async sendWithBrevo(brevoClient, emailData) {
    const sendEmail = new Brevo.SendSmtpEmail();

    const fromParsed = this.parseEmailAddress(emailData.from, emailData.fromName);
    sendEmail.sender = {
      email: fromParsed.email,
      name: fromParsed.name
    };

    const recipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
    sendEmail.to = recipients.map((recipient) => {
      const parsed = this.parseEmailAddress(recipient);
      return {
        email: parsed.email,
        name: parsed.name
      };
    });

    sendEmail.subject = emailData.subject;

    if (emailData.html) {
      sendEmail.htmlContent = emailData.html;
    }

    if (emailData.text) {
      sendEmail.textContent = emailData.text;
    }

    const replyToAddress = emailData.replyTo || fromParsed.email;
    if (replyToAddress) {
      const parsedReply = this.parseEmailAddress(replyToAddress);
      sendEmail.replyTo = {
        email: parsedReply.email,
        name: parsedReply.name
      };
    }

    if (emailData.attachments && emailData.attachments.length > 0) {
      sendEmail.attachment = await Promise.all(
        emailData.attachments.map(async (att) => {
          const filePath = att.path;
          const buffer = await fs.promises.readFile(filePath);
          return {
            name: att.filename || path.basename(filePath),
            content: buffer.toString('base64')
          };
        })
      );
    }

    return await brevoClient.sendTransacEmail(sendEmail);
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

          if (provider.name === 'brevo' || provider.name === 'brevo-backup') {
            result = await this.sendWithBrevo(provider.instance, emailData);
          } else if (provider.name === 'smtp') {
            result = await this.sendWithSMTP(provider.instance, emailData);
          }

          logger.info(`Email sent successfully via ${provider.name}`, {
            to: emailData.to,
            provider: provider.name,
            attempt: attempt + 1
          });

          return {
            success: true,
            provider: provider.name,
            messageId: result?.messageId || result?.messageIds?.[0] || 'unknown',
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

