# Deployment Guide

This guide covers deploying the Email Automation Platform to production.

## Prerequisites

- Node.js 16+ installed
- MongoDB Atlas account (or self-hosted MongoDB)
- Redis Cloud account (or self-hosted Redis)
- SMTP credentials from your email provider
- Domain name (optional but recommended)

## Backend Deployment

### Option 1: Render.com

1. **Create a new Web Service** on Render
2. **Connect your repository**
3. **Configure build settings**:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Environment: Node

4. **Set environment variables**:
   ```
   PORT=5000
   NODE_ENV=production
   MONGODB_URI=your_mongodb_atlas_uri
   REDIS_HOST=your_redis_host
   REDIS_PORT=6379
   JWT_SECRET=your_secure_jwt_secret
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@example.com
   SMTP_PASS=your_app_password
   ```

### Option 2: AWS EC2

1. **Launch an EC2 instance** (Ubuntu 20.04 LTS recommended)
2. **Install Node.js**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Install PM2** (Process Manager):
   ```bash
   sudo npm install -g pm2
   ```

4. **Clone and setup**:
   ```bash
   git clone <your-repo>
   cd email_bomber/backend
   npm install
   ```

5. **Create PM2 ecosystem file** (`ecosystem.config.js`):
   ```javascript
   module.exports = {
     apps: [{
       name: 'email-automation-api',
       script: './server.js',
       instances: 2,
       exec_mode: 'cluster',
       env: {
         NODE_ENV: 'production',
         PORT: 5000
       }
     }]
   };
   ```

6. **Start with PM2**:
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

### Option 3: Heroku

1. **Install Heroku CLI**
2. **Login**: `heroku login`
3. **Create app**: `heroku create your-app-name`
4. **Set config vars**:
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set MONGODB_URI=your_mongodb_uri
   heroku config:set JWT_SECRET=your_secret
   # ... add all other env vars
   ```
5. **Deploy**: `git push heroku main`

## Frontend Deployment

### Option 1: Vercel (Recommended)

1. **Install Vercel CLI**: `npm i -g vercel`
2. **Navigate to frontend**: `cd frontend`
3. **Deploy**: `vercel`
4. **Set environment variables** in Vercel dashboard:
   ```
   REACT_APP_API_URL=https://your-backend-url.com/api
   REACT_APP_SOCKET_URL=https://your-backend-url.com
   ```

### Option 2: Netlify

1. **Build the project**: `cd frontend && npm run build`
2. **Drag and drop** the `build` folder to Netlify
3. **Set environment variables** in Netlify dashboard
4. **Configure redirects** (create `_redirects` file in `public` folder):
   ```
   /*    /index.html   200
   ```

### Option 3: AWS S3 + CloudFront

1. **Build**: `cd frontend && npm run build`
2. **Upload** `build` folder to S3 bucket
3. **Configure S3** for static website hosting
4. **Set up CloudFront** distribution
5. **Update API URLs** in build

## Database Setup

### MongoDB Atlas

1. **Create a cluster** on MongoDB Atlas
2. **Whitelist your server IP** (or 0.0.0.0/0 for all)
3. **Create a database user**
4. **Get connection string** and update `MONGODB_URI`

### Redis Setup

#### Option 1: Redis Cloud (Recommended)

1. **Sign up** for Redis Cloud
2. **Create a database**
3. **Get connection details** (host, port, password)
4. **Update environment variables**

#### Option 2: Self-Hosted Redis

1. **Install Redis** on your server:
   ```bash
   sudo apt-get update
   sudo apt-get install redis-server
   ```

2. **Configure Redis** for production:
   ```bash
   sudo nano /etc/redis/redis.conf
   # Set: bind 127.0.0.1
   # Set: requirepass your_redis_password
   ```

3. **Restart Redis**:
   ```bash
   sudo systemctl restart redis-server
   ```

## Email Provider Setup

### SMTP (Nodemailer)

1. **Use Gmail SMTP** or your email provider (or a transactional email service exposing SMTP)
2. **Set environment variables**:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_app_password
   ```

## Security Checklist

- [ ] Use strong `JWT_SECRET` (random string, 32+ characters)
- [ ] Enable HTTPS (SSL/TLS certificates)
- [ ] Set up CORS properly (only allow your frontend domain)
- [ ] Use environment variables for all secrets
- [ ] Enable MongoDB authentication
- [ ] Set up Redis password
- [ ] Configure rate limiting
- [ ] Set up firewall rules
- [ ] Enable database backups
- [ ] Set up monitoring and logging

## Monitoring

### Recommended Tools

1. **PM2 Monitoring** (if using PM2):
   ```bash
   pm2 monit
   pm2 logs
   ```

2. **Application Monitoring**:
   - New Relic
   - Datadog
   - Sentry (for error tracking)

3. **Database Monitoring**:
   - MongoDB Atlas Monitoring
   - Redis Cloud Monitoring

## Scaling

### Horizontal Scaling

1. **Use Load Balancer** (AWS ELB, Nginx)
2. **Run multiple instances** of the backend
3. **Use Redis** for shared session storage
4. **Configure MongoDB** replica set

### Vertical Scaling

1. **Increase server resources** (CPU, RAM)
2. **Optimize database queries**
3. **Use connection pooling**
4. **Cache frequently accessed data**

## Backup Strategy

1. **MongoDB Backups**:
   - Enable automated backups in MongoDB Atlas
   - Or set up `mongodump` cron job

2. **Redis Backups**:
   - Enable persistence (RDB snapshots)
   - Or use Redis Cloud automated backups

3. **Application Backups**:
   - Backup uploaded files (contacts, attachments)
   - Backup environment configuration

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**:
   - Check Redis server is running
   - Verify connection credentials
   - Check firewall rules

2. **MongoDB Connection Failed**:
   - Verify connection string
   - Check IP whitelist
   - Verify credentials

3. **Email Sending Failed**:
   - Verify SMTP credentials (username/password)
   - Ensure app passwords are enabled if required (e.g., Gmail)
   - Check provider SMTP limits and allowlist settings

4. **Socket.io Connection Issues**:
   - Verify CORS settings
   - Check WebSocket support on server
   - Verify Socket.io version compatibility

## Support

For deployment issues, check:
- Application logs
- Server logs
- Database logs
- Email provider logs

