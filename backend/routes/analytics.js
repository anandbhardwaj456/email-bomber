const express = require('express');
const Analytics = require('../models/Analytics');
const Campaign = require('../models/Campaign');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   GET /api/analytics/campaign/:campaignId
// @desc    Get analytics for a campaign
// @access  Private
router.get('/campaign/:campaignId', async (req, res) => {
  try {
    // Verify campaign belongs to user
    const campaign = await Campaign.findOne({
      _id: req.params.campaignId,
      userId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Get event counts
    const eventCounts = await Analytics.aggregate([
      { $match: { campaignId: campaign._id } },
      {
        $group: {
          _id: '$event',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get timeline data
    const timeline = await Analytics.aggregate([
      { $match: { campaignId: campaign._id } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            event: '$event'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    // Get provider stats
    const providerStats = await Analytics.aggregate([
      { $match: { campaignId: campaign._id, event: 'sent' } },
      {
        $group: {
          _id: '$provider',
          count: { $sum: 1 }
        }
      }
    ]);

    const eventStats = eventCounts.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    res.json({
      campaignId: campaign._id,
      stats: {
        ...campaign.stats,
        events: eventStats
      },
      timeline,
      providers: providerStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/analytics/overview
// @desc    Get overall analytics for user
// @access  Private
router.get('/overview', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    // Get overall stats
    const stats = await Analytics.aggregate([
      {
        $match: {
          userId: req.user._id,
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$event',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get daily stats
    const dailyStats = await Analytics.aggregate([
      {
        $match: {
          userId: req.user._id,
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            event: '$event'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    res.json({
      period: { startDate, endDate },
      stats: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      dailyStats
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

