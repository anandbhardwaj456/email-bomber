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
    const apiKey = process.env.POSTMARK_API_KEY || process.env.POSTMARK_SERVER_TOKEN;

    // Debug logging for env visibility (can be removed later)
    logger.info(
      'Postmark env lengths:',
      'POSTMARK_API_KEY =',
      process.env.POSTMARK_API_KEY ? process.env.POSTMARK_API_KEY.length : 0,
      'POSTMARK_SERVER_TOKEN =',
      process.env.POSTMARK_SERVER_TOKEN ? process.env.POSTMARK_SERVER_TOKEN.length : 0
    );

    if (!apiKey) {
      logger.error('POSTMARK_API_KEY / POSTMARK_SERVER_TOKEN is not set. Email sending will fail.');
      this.client = null;
      return;
    }

    // Initialize Postmark client only when a key is present
    this.client = new postmark.ServerClient(apiKey);
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

  async sendEmail(emailData, maxRetries = 3) {
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Ensure client is initialized with the latest env value if not already
        if (!this.client) {
          const apiKey = process.env.POSTMARK_API_KEY || process.env.POSTMARK_SERVER_TOKEN;
          if (!apiKey) {
            throw new Error('Postmark API key is not configured in environment variables');
          }
          this.client = new postmark.ServerClient(apiKey);
        }

        const fromParsed = this.parseEmailAddress(
          emailData.from || process.env.EMAIL_FROM_ADDRESS,
          process.env.EMAIL_FROM_NAME
        );

        const recipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
        const to = recipients.map((r) => {
          const parsed = this.parseEmailAddress(r);
          return {
            email: parsed.email,
            name: parsed.name
          };
        });

        const replyToEmail = emailData.replyTo || fromParsed.email;

        // Postmark payload format
        const payload = {
          From: fromParsed.name
            ? `${fromParsed.name} <${fromParsed.email}>`
            : fromParsed.email,
          To: to
            .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
            .join(', '),
          Subject: emailData.subject,
          HtmlBody: emailData.html || undefined,
          TextBody: emailData.text || undefined,
          ReplyTo: replyToEmail
        };

        if (emailData.attachments && emailData.attachments.length > 0) {
          payload.Attachments = await Promise.all(
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

        const result = await this.client.sendEmail(payload);

        logger.info('Email sent successfully via Postmark', {
          to: emailData.to,
          provider: 'postmark',
          attempt: attempt + 1
        });

        return {
          success: true,
          provider: 'postmark',
          messageId: result?.MessageID || result?.MessageId || 'unknown',
          result
        };
      } catch (error) {
        lastError = error;
        logger.error('Failed to send email via Postmark', {
          to: emailData.to,
          provider: 'postmark',
          error: error.message,
          attempt: attempt + 1
        });
      }

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

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
