# Prompza — AI Prompt Library

#[Visit prompza](https://prompza.onrender.com)
##The live link is https://prompza.onrender.com/    or   click above 

A full-stack web application for discovering, sharing, and managing AI prompts. Built with Express.js and MongoDB, served as a single deployable unit.

## Tech Stack

- **Backend:** Node.js, Express.js, MongoDB (native driver)
- **Frontend:** Vanilla HTML/CSS/JS (server-rendered pages)
- **Database:** MongoDB Atlas
- **Bots:** Telegram Bot API (alerts, requests, analytics)
- **Deployment:** Render (Web Service)

## Project Structure

```
prompza/
├── backend/
│   ├── server.js              # Entry point — HTTP server + graceful shutdown
│   └── src/
│       ├── app.js             # Express app — routes, middleware, static serving
│       ├── config/
│       │   └── env.js         # Environment variable loader + validation
│       ├── controllers/       # Route handlers (prompt, admin, cron, telegram)
│       ├── middleware/        # Auth, rate limiter, error handler, request context
│       ├── routes/            # Express route definitions
│       └── services/          # DB, Telegram, logging, analytics services
├── frontend/
│   ├── assets/                # CSS, JS, icons, logos
│   ├── components/            # Reusable HTML components (navbar, footer, cards)
│   └── pages/                 # HTML pages served by Express
├── docs/                      # API and feature documentation
├── render.yaml                # Render deployment blueprint
├── .env.example               # Required environment variables
└── package.json               # Single package.json for entire project
```

## Local Development

```bash
# 1. Clone the repo
git clone https://github.com/your-username/prompza.git
cd prompza

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example backend/.env
# Edit backend/.env with your MongoDB URI and other secrets

# 4. Start the development server
npm run dev
# → http://localhost:3000
```

## Deployment on Render

### Option A: Using render.yaml (Recommended)

1. Push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **New → Blueprint** and connect your repo
4. Render auto-detects `render.yaml` and creates the service
5. Set the secret environment variables in Render's Environment tab:
   - `MONGODB_URI` — your MongoDB Atlas connection string
   - `PUBLIC_APP_URL` — your Render URL (e.g., `https://prompza.onrender.com`)
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — admin dashboard credentials
   - `CRON_SECRET` — secret for cron endpoint auth
   - Telegram bot tokens and chat IDs (optional)

### Option B: Manual Setup

1. Go to [Render Dashboard](https://dashboard.render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `node backend/server.js`
   - **Health Check Path:** `/api/health`
4. Add all environment variables from `.env.example`

### Important Notes

- Set `PUBLIC_APP_URL` to your Render URL (no trailing slash)
- The Telegram bot webhook URL must be re-registered after deployment:
  ```
  https://api.telegram.org/bot<ACTIVITY_BOT_TOKEN>/setWebhook?url=<PUBLIC_APP_URL>/webhook/activity-bot/<ACTIVITY_BOT_TOKEN>
  ```
- Render's free tier sleeps after 15 minutes of inactivity. First request after sleep takes ~30s.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `MONGODB_DB` | No | Database name (default: `prompza`) |
| `PORT` | No | Server port (default: `3000`, Render uses `10000`) |
| `HOST` | No | Bind address (default: `0.0.0.0`) |
| `NODE_ENV` | No | `production` or `development` |
| `PUBLIC_APP_URL` | ✅ | Full public URL of the deployed app |
| `ADMIN_USERNAME` | ✅ | Admin login email |
| `ADMIN_PASSWORD` | ✅ | Admin login password |
| `CRON_SECRET` | ✅ | Secret token for cron endpoint |
| `ADMIN_SESSION_TTL_HOURS` | No | Admin session duration (default: `12`) |
| `ADMIN_ALERT_BOT_TOKEN` | No | Telegram bot for admin alerts |
| `ADMIN_ALERT_CHAT_ID` | No | Telegram chat for admin alerts |
| `REQUEST_BOT_TOKEN` | No | Telegram bot for contact requests |
| `REQUEST_BOT_CHAT_ID` | No | Telegram chat for contact requests |
| `ACTIVITY_BOT_TOKEN` | No | Telegram bot for prompt search/analytics |
| `ACTIVITY_BOT_CHAT_ID` | No | Telegram chat for analytics |

## API Endpoints

- `GET /api/health` — Health check
- `GET /api/prompts` — List prompts
- `POST /api/prompts/:id/like` — Like a prompt
- `GET /api/image-prompts` — List image prompts
- `POST /api/admin/login` — Admin authentication
- `DELETE /api/admin/prompts/:id` — Delete a prompt (admin only)

## License

ISC © Nitesh Chaurasiya
