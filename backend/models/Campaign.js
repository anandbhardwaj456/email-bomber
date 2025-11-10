const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Campaign name is required'],
    trim: true
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  body: {
    type: String,
    required: [true, 'Email body is required']
  },
  bodyHtml: {
    type: String,
    default: ''
  },
  attachments: [{
    filename: String,
    path: String,
    size: Number,
    mimetype: String
  }],
  fromEmail: {
    type: String,
    required: true
  },
  fromName: {
    type: String,
    default: ''
  },
  replyTo: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'completed', 'paused', 'failed'],
    default: 'draft'
  },
  scheduledAt: {
    type: Date
  },
  contactFilters: {
    tags: [String],
    status: [String]
  },
  stats: {
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    failed: { type: Number, default: 0 }
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

campaignSchema.index({ userId: 1, status: 1 });
campaignSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Campaign', campaignSchema);

