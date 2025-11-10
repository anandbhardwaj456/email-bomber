const express = require('express');
const Campaign = require('../models/Campaign');
const batchProcessor = require('../services/batchProcessor');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   GET /api/campaigns
// @desc    Get all campaigns for user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const query = { userId: req.user._id };
    if (status) query.status = status;

    const campaigns = await Campaign.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Campaign.countDocuments(query);

    res.json({
      campaigns,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/campaigns/:id
// @desc    Get a single campaign
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Get batch statuses
    const batchStatuses = await batchProcessor.getAllBatchStatuses(campaign._id);

    res.json({
      campaign,
      batches: batchStatuses
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/campaigns
// @desc    Create a new campaign
// @access  Private
router.post('/', async (req, res) => {
  try {
    const campaign = await Campaign.create({
      ...req.body,
      userId: req.user._id,
      fromEmail: req.body.fromEmail || req.user.email
    });

    res.status(201).json(campaign);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/campaigns/:id
// @desc    Update a campaign
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/campaigns/:id/send
// @desc    Send a campaign
// @access  Private
router.post('/:id/send', async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    if (campaign.status === 'sending') {
      return res.status(400).json({ message: 'Campaign is already being sent' });
    }

    // Update campaign status
    campaign.status = 'sending';
    campaign.startedAt = new Date();
    await campaign.save();

    // Create batches
    const { batches, totalContacts, totalBatches } = await batchProcessor.createBatches(
      campaign._id,
      req.user._id,
      campaign.contactFilters
    );

    // Prepare campaign data
    const campaignData = {
      subject: campaign.subject,
      body: campaign.body,
      bodyHtml: campaign.bodyHtml || campaign.body,
      fromEmail: campaign.fromEmail,
      fromName: campaign.fromName || '',
      replyTo: campaign.replyTo || campaign.fromEmail,
      attachments: campaign.attachments || []
    };

    // Process batches (io is available globally)
    await batchProcessor.processBatches(
      campaign._id,
      req.user._id,
      campaignData,
      batches
    );

    res.json({
      message: 'Campaign queued for sending',
      campaignId: campaign._id,
      totalContacts,
      totalBatches,
      batches: batches.map(b => ({
        jobId: b.jobId,
        batchNumber: b.batchNumber
      }))
    });
  } catch (error) {
    // Reset campaign status on error
    await Campaign.updateOne(
      { _id: req.params.id },
      { status: 'draft' }
    );

    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/campaigns/:id
// @desc    Delete a campaign
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

