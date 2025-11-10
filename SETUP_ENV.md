# Environment Variables Setup Guide

## Backend Environment Variables

1. **Navigate to the backend folder**:
   ```bash
   cd backend
   ```

2. **Create a `.env` file** (copy from `env.example`):
   ```bash
   # On Windows PowerShell:
   Copy-Item env.example .env
   
   # Or manually create .env file
   ```

3. **Edit the `.env` file** and fill in your actual values:

   ### Required Variables:
   - `MONGODB_URI` - Your MongoDB connection string
     - Local: `mongodb://localhost:27017/email_automation`
     - MongoDB Atlas: `mongodb+srv://username:password@cluster.mongodb.net/email_automation`
   
   - `JWT_SECRET` - A random secret string for JWT tokens (generate a strong random string)
   
   - `MAILGUN_API_KEY` - Your Mailgun API key
   - `MAILGUN_DOMAIN` - Your Mailgun domain
   
   ### Optional Variables (for failover):
   - `MAILGUN_API_KEY_BACKUP` - Backup Mailgun API key
   - `MAILGUN_DOMAIN_BACKUP` - Backup Mailgun domain
   - `SENDGRID_API_KEY` - SendGrid API key (alternative provider)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - SMTP fallback

   ### Redis (Required for queue system):
   - `REDIS_HOST` - Redis server host (default: localhost)
   - `REDIS_PORT` - Redis server port (default: 6379)
   
   For Redis Cloud, get these from your Redis Cloud dashboard.

## Frontend Environment Variables

1. **Navigate to the frontend folder**:
   ```bash
   cd frontend
   ```

2. **Create a `.env` file**:
   ```bash
   # On Windows PowerShell:
   Copy-Item env.example .env
   ```

3. **Edit the `.env` file**:
   - `REACT_APP_API_URL` - Backend API URL (default: http://localhost:5000/api)
   - `REACT_APP_SOCKET_URL` - WebSocket URL (default: http://localhost:5000)

## Quick Setup

### For Development (Local):

1. **Backend `.env`** - Minimum required:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/email_automation
   JWT_SECRET=your_random_secret_here
   MAILGUN_API_KEY=your_mailgun_key
   MAILGUN_DOMAIN=your_mailgun_domain
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

2. **Frontend `.env`**:
   ```env
   REACT_APP_API_URL=http://localhost:5000/api
   REACT_APP_SOCKET_URL=http://localhost:5000
   ```

## Getting API Keys

### Mailgun:
1. Sign up at https://www.mailgun.com/
2. Verify your domain
3. Get API key from Dashboard → Settings → API Keys
4. Get domain from Dashboard → Sending → Domains

### MongoDB Atlas (Cloud):
1. Sign up at https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Create database user
4. Whitelist IP (or 0.0.0.0/0 for development)
5. Get connection string: Connect → Connect your application

### Redis Cloud:
1. Sign up at https://redis.com/try-free/
2. Create a free database
3. Get connection details (host, port, password)

## Security Notes

- **Never commit `.env` files to Git** (they're in `.gitignore`)
- Use strong, random strings for `JWT_SECRET`
- Keep your API keys secure
- Use environment variables in production, not hardcoded values

## Testing the Setup

After creating your `.env` files:

1. **Start MongoDB** (if using local):
   ```bash
   mongod
   ```

2. **Start Redis** (if using local):
   ```bash
   redis-server
   ```

3. **Start Backend**:
   ```bash
   cd backend
   npm start
   ```

4. **Start Frontend** (in a new terminal):
   ```bash
   cd frontend
   npm start
   ```

If you see connection errors, check your `.env` file values!

