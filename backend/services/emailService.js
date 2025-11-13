const nodemailer = require('nodemailer');
const postmark = require('postmark');
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
    // Postmark (HTTP API) - Primary if configured
    if (process.env.POSTMARK_API_TOKEN) {
      const client = new postmark.ServerClient(process.env.POSTMARK_API_TOKEN);
      this.providers.push({
        name: 'postmark',
        instance: client,
        priority: 1
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
        priority: 2
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

  // Send using Postmark HTTP API
  async sendWithPostmark(pmClient, emailData) {
    const fromParsed = this.parseEmailAddress(emailData.from, emailData.fromName);
    const recipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];

    const toList = recipients
      .map((r) => {
        const p = this.parseEmailAddress(r);
        return p.name ? `${p.name} <${p.email}>` : p.email;
      })
      .join(', ');

    let attachments;
    if (emailData.attachments && emailData.attachments.length > 0) {
      attachments = await Promise.all(
        emailData.attachments.map(async (att) => {
          const filePath = att.path;
          const buffer = await fs.promises.readFile(filePath);
          return {
            Name: att.filename || path.basename(filePath),
            Content: buffer.toString('base64')
          };
        })
      );
    }

    const payload = {
      From: fromParsed.name ? `${fromParsed.name} <${fromParsed.email}>` : fromParsed.email,
      To: toList,
      Subject: emailData.subject,
      HtmlBody: emailData.html,
      TextBody: emailData.text,
      ReplyTo: emailData.replyTo || fromParsed.email,
      Attachments: attachments
    };

    const res = await pmClient.sendEmail(payload);
    return { messageId: res.MessageID || res.MessageId || res.MessageID?.toString?.(), raw: res };
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
          if (provider.name === 'postmark') {
            const pmResult = await this.sendWithPostmark(provider.instance, emailData);
            result = { messageId: pmResult.messageId, messageIds: [pmResult.messageId], raw: pmResult.raw };
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

