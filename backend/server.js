const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// Validate required environment variables
const jwtSecret = process.env.JWT_SECRET?.trim();

if (!jwtSecret) {
  console.error('❌ ERROR: JWT_SECRET is not set in environment variables!');
  console.error('   Please set JWT_SECRET in your .env file');
  console.error('   Run: npm run setup-env');
  process.exit(1);
}

if (jwtSecret.length < 32) {
  console.error('❌ ERROR: JWT_SECRET must be at least 32 characters long!');
  console.error('   Current length:', jwtSecret.length);
  console.error('   Run: npm run setup-env (to regenerate)');
  process.exit(1);
}

// Update process.env with trimmed value
process.env.JWT_SECRET = jwtSecret;

console.log('✅ JWT_SECRET is configured (length:', jwtSecret.length, ')');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection (no deprecated driver options)
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/email_automation')
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// Socket.io for real-time updates
io.on('connection', (socket) => {
  socket.on('join-campaign', (campaignId) => {
    socket.join(`campaign-${campaignId}`);
  });
});

// Make io available to routes and globally for queue service
app.set('io', io);
global.io = io;

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/email', require('./routes/email'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Export io for use in routes
module.exports = { app, server, io };

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    mongoose.connection.close();
    console.log('Process terminated');
  });
});

