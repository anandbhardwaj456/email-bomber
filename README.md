# Email Automation Platform

A high-performance bulk email automation platform built with MERN stack (MongoDB, Express, React, Node.js) and Tailwind CSS. Features include high-speed sending (10K+ emails/hour), smart automation, in-app mail composition, and zero-error guarantee reliability.

## Features

⚡ **High-Speed Sending**: Process 10,000+ emails per hour per user
🧠 **Smart Automation**: Auto-distribution, retries, and analytics
💌 **In-App Mail Composition**: Rich text editor for creating beautiful emails
🔒 **Zero-Error Guarantee**: Reliable sending with retry mechanisms, load balancing, and failover protection
📊 **Real-Time Analytics**: Live tracking of delivery rates, opens, clicks, and bounces
📁 **Contact Management**: CSV/XLSX import, tagging, and segmentation
🎯 **Campaign Management**: Create, schedule, and track email campaigns
🌙 **Dark Mode**: Beautiful dark/light theme toggle

## Tech Stack

### Frontend
- React 18
- Tailwind CSS
- React Router
- React Quill (Rich Text Editor)
- React Dropzone (File Upload)
- Socket.io Client (Real-time Updates)
- Recharts (Analytics Charts)
- React Hot Toast (Notifications)

### Backend
- Node.js + Express
- MongoDB (Mongoose)
- Redis + Bull (Queue System)
- Socket.io (WebSocket)
- Brevo API (Primary Email Provider)
- Nodemailer (SMTP Fallback)
- JWT Authentication

## Installation

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- Redis (local or Redis Cloud)

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd email_bomber
```

2. **Install dependencies**
```bash
npm run install-all
```

3. **Configure environment variables**

Create `.env` file in the `backend` directory:
```env
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/email_automation

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=7d

# Brevo (Primary)
BREVO_API_KEY=your_brevo_api_key

# Brevo Backup (for failover)
BREVO_API_KEY_BACKUP=your_backup_brevo_api_key

# SMTP (Fallback)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password

# Rate Limiting
MAX_EMAILS_PER_HOUR=10000
MAX_EMAILS_PER_BATCH=1000
```

Create `.env` file in the `frontend` directory:
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SOCKET_URL=http://localhost:5000
```

4. **Start the development servers**

```bash
# Start both frontend and backend
npm run dev

# Or start them separately
npm run server  # Backend only
npm run client  # Frontend only
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Project Structure

```
email_bomber/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Contact.js
│   │   ├── Campaign.js
│   │   ├── Job.js
│   │   └── Analytics.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── contacts.js
│   │   ├── campaigns.js
│   │   ├── jobs.js
│   │   ├── analytics.js
│   │   └── upload.js
│   ├── services/
│   │   ├── emailService.js
│   │   ├── queueService.js
│   │   └── batchProcessor.js
│   ├── middleware/
│   │   └── auth.js
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth/
│   │   │   ├── Contacts/
│   │   │   ├── Campaigns/
│   │   │   ├── Analytics/
│   │   │   └── Layout/
│   │   ├── context/
│   │   │   ├── AuthContext.js
│   │   │   └── ThemeContext.js
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
└── package.json
```

## Key Features Explained

### Zero-Error Guarantee

The platform implements multiple layers of reliability:

1. **Multi-Provider Support**: Primary Brevo, optional backup Brevo key, and SMTP fallback
2. **Automatic Retry**: Failed emails are automatically retried up to 3 times
3. **Load Balancing**: Round-robin distribution across multiple providers
4. **Failover Protection**: If one provider fails, the system automatically switches to the next
5. **Error Logging**: Comprehensive error tracking for every failed email

### High-Speed Sending

- **Batch Processing**: Emails are split into batches of 1000 for efficient processing
- **Queue System**: Redis-based queue with Bull for async processing
- **Rate Limiting**: Configurable rate limits to prevent exceeding provider limits
- **Concurrent Processing**: Multiple emails sent simultaneously within batch limits

### Real-Time Updates

- **WebSocket Integration**: Live progress updates via Socket.io
- **Dashboard Refresh**: Campaign status updates in real-time
- **Progress Tracking**: Live progress bars and statistics

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Contacts
- `GET /api/contacts` - Get all contacts (paginated)
- `POST /api/contacts` - Create a contact
- `POST /api/contacts/bulk` - Create multiple contacts
- `PUT /api/contacts/:id` - Update a contact
- `DELETE /api/contacts/:id` - Delete a contact
- `GET /api/contacts/stats` - Get contact statistics

### Campaigns
- `GET /api/campaigns` - Get all campaigns (paginated)
- `GET /api/campaigns/:id` - Get a single campaign
- `POST /api/campaigns` - Create a campaign
- `PUT /api/campaigns/:id` - Update a campaign
- `POST /api/campaigns/:id/send` - Send a campaign
- `DELETE /api/campaigns/:id` - Delete a campaign

### Analytics
- `GET /api/analytics/campaign/:campaignId` - Get campaign analytics
- `GET /api/analytics/overview` - Get overall analytics

### Upload
- `POST /api/upload/contacts` - Upload contacts from CSV/XLSX

## Usage

1. **Register/Login**: Create an account or login
2. **Import Contacts**: Upload a CSV or XLSX file with contacts
3. **Create Campaign**: Compose your email using the rich text editor
4. **Send Campaign**: Click "Send Campaign" to queue emails for sending
5. **Monitor Progress**: View real-time progress and analytics

## CSV Import Format

Your CSV/XLSX file should have the following columns:
- `email` (required)
- `name` (optional)
- `phone` (optional)
- `tags` (optional, comma-separated)

Example:
```csv
email,name,phone,tags
john@example.com,John Doe,1234567890,customer,vip
jane@example.com,Jane Smith,0987654321,prospect
```

## Deployment

### Backend Deployment
1. Deploy to Render, AWS EC2, or similar
2. Set up MongoDB Atlas
3. Set up Redis Cloud
4. Configure environment variables

### Frontend Deployment
1. Deploy to Vercel, Netlify, or similar
2. Update API URL in environment variables

## Security

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting on API endpoints
- Input validation and sanitization
- CORS configuration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License

## Support

For issues and questions, please open an issue on GitHub.

