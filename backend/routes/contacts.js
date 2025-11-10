const express = require('express');
const Contact = require('../models/Contact');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   GET /api/contacts
// @desc    Get all contacts for user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const tags = req.query.tags ? req.query.tags.split(',') : [];

    const query = { userId: req.user._id };
    if (status) query.status = status;
    if (tags.length > 0) query.tags = { $in: tags };

    const contacts = await Contact.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Contact.countDocuments(query);

    res.json({
      contacts,
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

// @route   POST /api/contacts
// @desc    Create a new contact
// @access  Private
router.post('/', async (req, res) => {
  try {
    const contact = await Contact.create({
      ...req.body,
      userId: req.user._id
    });

    res.status(201).json(contact);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Contact with this email already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/contacts/bulk
// @desc    Create multiple contacts
// @access  Private
router.post('/bulk', async (req, res) => {
  try {
    const { contacts } = req.body;
    
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ message: 'Contacts array is required' });
    }

    const contactsToInsert = contacts.map(contact => ({
      ...contact,
      userId: req.user._id
    }));

    // Use insertMany with ordered: false to continue on duplicates
    const result = await Contact.insertMany(contactsToInsert, {
      ordered: false
    });

    res.status(201).json({
      message: `Successfully imported ${result.length} contacts`,
      imported: result.length,
      total: contacts.length
    });
  } catch (error) {
    // Handle partial success
    if (error.writeErrors) {
      const imported = error.result.insertedIds ? Object.keys(error.result.insertedIds).length : 0;
      return res.status(207).json({
        message: 'Partially imported contacts',
        imported,
        total: contacts.length,
        errors: error.writeErrors.length
      });
    }
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/contacts/:id
// @desc    Update a contact
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    res.json(contact);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/contacts/:id
// @desc    Delete a contact
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/contacts/stats
// @desc    Get contact statistics
// @access  Private
router.get('/stats', async (req, res) => {
  try {
    const stats = await Contact.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const total = await Contact.countDocuments({ userId: req.user._id });

    res.json({
      total,
      byStatus: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

