const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  batchNumber: {
    type: Number,
    required: true
  },
  contacts: [{
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact'
    },
    email: String,
    name: String
  }],
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  progress: {
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 }
  },
  provider: {
    type: String,
    enum: ['mailgun', 'mailgun-backup', 'sendgrid', 'smtp'],
    default: 'mailgun'
  },
  errorLog: [{
    email: String,
    error: String,
    timestamp: { type: Date, default: Date.now },
    retryCount: { type: Number, default: 0 }
  }],
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

jobSchema.index({ campaignId: 1, status: 1 });
jobSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Job', jobSchema);

