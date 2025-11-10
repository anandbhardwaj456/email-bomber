const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ['active', 'bounced', 'unsubscribed', 'invalid'],
    default: 'active'
  },
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Index for faster queries
contactSchema.index({ userId: 1, email: 1 }, { unique: true });
contactSchema.index({ userId: 1, status: 1 });
contactSchema.index({ userId: 1, tags: 1 });

module.exports = mongoose.model('Contact', contactSchema);

