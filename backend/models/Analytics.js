const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact'
  },
  email: {
    type: String,
    required: true
  },
  event: {
    type: String,
    enum: ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed'],
    required: true
  },
  provider: {
    type: String,
    enum: ['postmark', 'smtp']
  },
  metadata: {
    type: Map,
    of: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

analyticsSchema.index({ campaignId: 1, event: 1 });
analyticsSchema.index({ campaignId: 1, timestamp: -1 });
analyticsSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Analytics', analyticsSchema);

