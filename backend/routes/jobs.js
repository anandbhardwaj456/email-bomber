const express = require('express');
const Job = require('../models/Job');
const batchProcessor = require('../services/batchProcessor');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   GET /api/jobs/campaign/:campaignId
// @desc    Get all jobs for a campaign
// @access  Private
router.get('/campaign/:campaignId', async (req, res) => {
  try {
    const jobs = await Job.find({
      campaignId: req.params.campaignId,
      userId: req.user._id
    }).sort({ batchNumber: 1 });

    res.json(jobs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/jobs/:id
// @desc    Get a single job status
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const job = await batchProcessor.getBatchStatus(req.params.id);
    res.json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

