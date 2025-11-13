const express = require('express');
const { protect } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   POST /api/email/send
// @desc    Send a direct email to a provided email id
// @access  Private
router.post('/send', async (req, res) => {
  try {
    const {
      to,
      subject,
      text,
      html,
      fromEmail,
      fromName,
      replyTo,
      attachments
    } = req.body || {};

    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({
        message: 'Missing required fields: to, subject, and one of text or html'
      });
    }

    const senderEmail = fromEmail || req.user.email;

    const emailData = {
      from: fromName ? `${fromName} <${senderEmail}>` : senderEmail,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      replyTo: replyTo || senderEmail,
      attachments: Array.isArray(attachments) ? attachments : []
    };

    const result = await emailService.sendEmail(emailData, 3);

    if (result.success) {
      return res.json({
        message: 'Email sent successfully',
        provider: result.provider,
        messageId: result.messageId,
        to
      });
    }

    return res.status(502).json({
      message: 'Failed to send email',
      error: result.error,
      to
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
});

module.exports = router;
