const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up environment files...\n');

// Run backend setup
console.log('📦 Setting up backend environment...');
try {
  execSync('node backend/setup-env.js', { stdio: 'inherit', cwd: __dirname });
} catch (error) {
  console.error('❌ Error setting up backend environment');
}

console.log('\n');

// Run frontend setup
console.log('📦 Setting up frontend environment...');
try {
  execSync('node frontend/setup-env.js', { stdio: 'inherit', cwd: __dirname });
} catch (error) {
  console.error('❌ Error setting up frontend environment');
}

console.log('\n✅ Environment setup complete!');
console.log('\n📋 Next steps:');
console.log('   1. Edit backend/.env and add your:');
console.log('      - SMTP credentials (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)');
console.log('      - MONGODB_URI (MongoDB connection string)');
console.log('      - REDIS credentials (if using Redis Cloud)');
console.log('   2. Make sure MongoDB and Redis are running');
console.log('   3. Start the backend: cd backend && npm start');
console.log('   4. Start the frontend: cd frontend && npm start');

