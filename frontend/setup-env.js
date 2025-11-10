const fs = require('fs');
const path = require('path');

// Default environment variables for frontend
const envContent = `REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SOCKET_URL=http://localhost:5000
`;

const envPath = path.join(__dirname, '.env');

// Write the .env file
fs.writeFileSync(envPath, envContent, 'utf8');

console.log('✅ Frontend .env file created/updated successfully!');
console.log('📝 Frontend is configured to connect to:');
console.log('   - API: http://localhost:5000/api');
console.log('   - Socket: http://localhost:5000');

