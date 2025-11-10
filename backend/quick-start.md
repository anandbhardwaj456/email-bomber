# Quick Start Guide

## Automatic Environment Setup

Run this command from the project root:
```bash
npm run setup-env
```

Or manually:
```bash
node backend/setup-env.js
node frontend/setup-env.js
```

## What Gets Set Automatically

✅ **JWT_SECRET** - Auto-generated secure random string  
✅ **Port numbers** - Default 5000 for backend, 3000 for frontend  
✅ **Redis defaults** - Localhost configuration  
✅ **Rate limits** - 10,000 emails/hour, 1000 per batch  
✅ **Frontend API URLs** - Configured to connect to local backend  

## What You Need to Set Manually

### 1. MongoDB Connection

**Option A: Local MongoDB**
```env
MONGODB_URI=mongodb://localhost:27017/email_automation
```

**Option B: MongoDB Atlas (Cloud)**
1. Sign up at https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Create database user
4. Whitelist your IP (or 0.0.0.0/0 for development)
5. Get connection string and update:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/email_automation
```

### 2. Mailgun API (REQUIRED for sending emails)

1. Sign up at https://www.mailgun.com/
2. Verify your domain (or use sandbox domain for testing)
3. Get API key from Dashboard → Settings → API Keys
4. Get domain from Dashboard → Sending → Domains
5. Update `.env`:
```env
MAILGUN_API_KEY=your_actual_api_key_here
MAILGUN_DOMAIN=your_domain_or_sandbox.mailgun.org
```

### 3. Redis (Required for queue system)

**Option A: Local Redis**
- Install Redis locally
- Default settings work: `REDIS_HOST=localhost`, `REDIS_PORT=6379`

**Option B: Redis Cloud**
1. Sign up at https://redis.com/try-free/
2. Create a free database
3. Get connection details and update:
```env
REDIS_HOST=your_redis_host.redis.cloud
REDIS_PORT=12345
REDIS_PASSWORD=your_redis_password
```

### 4. Optional: Backup Email Providers

For failover protection, you can add:
- **SendGrid**: Get API key from https://sendgrid.com/
- **SMTP**: Configure SMTP settings (Gmail, etc.)
- **Backup Mailgun**: Second Mailgun account

## Testing Your Setup

1. **Start MongoDB** (if local):
   ```bash
   mongod
   ```

2. **Start Redis** (if local):
   ```bash
   redis-server
   ```

3. **Start Backend**:
   ```bash
   cd backend
   npm start
   ```
   Look for: `✅ MongoDB Connected` and `🚀 Server running on port 5000`

4. **Start Frontend** (new terminal):
   ```bash
   cd frontend
   npm start
   ```

5. **Test the API**:
   ```bash
   curl http://localhost:5000/api/health
   ```
   Should return: `{"status":"OK","timestamp":"..."}`

## Common Issues

### MongoDB Connection Error
- Check if MongoDB is running
- Verify connection string format
- Check IP whitelist (if using Atlas)

### Redis Connection Error
- Check if Redis is running
- Verify host and port
- Check password (if using Redis Cloud)

### Mailgun Error
- Verify API key is correct
- Check domain is verified
- Make sure you're not in sandbox mode (or use sandbox domain)

## Need Help?

Check the main `README.md` or `SETUP_ENV.md` for more detailed instructions.

