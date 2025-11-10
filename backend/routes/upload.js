const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const Contact = require('../models/Contact');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and XLSX files are allowed.'));
    }
  }
});

// @route   POST /api/upload/contacts
// @desc    Upload contacts from CSV/XLSX file
// @access  Private
router.post('/contacts', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const contacts = [];

    // Parse CSV file
    if (fileExt === '.csv') {
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => {
            // Map common CSV columns to contact fields
            const contact = {
              email: row.email || row.Email || row.EMAIL || '',
              name: row.name || row.Name || row.NAME || row.fullname || row.FullName || '',
              phone: row.phone || row.Phone || row.PHONE || '',
              tags: row.tags ? row.tags.split(',').map(t => t.trim()) : []
            };

            if (contact.email) {
              contacts.push(contact);
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });
    }
    // Parse XLSX file
    else if (fileExt === '.xlsx' || fileExt === '.xls') {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);

      data.forEach(row => {
        const contact = {
          email: row.email || row.Email || row.EMAIL || '',
          name: row.name || row.Name || row.NAME || row.fullname || row.FullName || '',
          phone: row.phone || row.Phone || row.PHONE || '',
          tags: row.tags ? (typeof row.tags === 'string' ? row.tags.split(',').map(t => t.trim()) : []) : []
        };

        if (contact.email) {
          contacts.push(contact);
        }
      });
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    if (contacts.length === 0) {
      return res.status(400).json({ message: 'No valid contacts found in file' });
    }

    // Import contacts
    const contactsToInsert = contacts.map(contact => ({
      ...contact,
      userId: req.user._id
    }));

    // Use insertMany with ordered: false to continue on duplicates
    let result;
    try {
      result = await Contact.insertMany(contactsToInsert, {
        ordered: false
      });
    } catch (error) {
      // Handle partial success
      if (error.writeErrors) {
        const imported = error.result.insertedIds ? Object.keys(error.result.insertedIds).length : 0;
        return res.status(207).json({
          message: 'Partially imported contacts',
          imported,
          total: contacts.length,
          errors: error.writeErrors.length,
          duplicateCount: contacts.length - imported
        });
      }
      throw error;
    }

    res.json({
      message: 'Contacts imported successfully',
      imported: result.length,
      total: contacts.length
    });
  } catch (error) {
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

