# AirNotes 2.0 📚

**Unlimited-size PDF library powered by Telegram MTProto**

> Unlike the original AirNotes (which used Telegram Bot API and was limited to 20MB),
> AirNotes 2.0 uses **Pyrogram MTProto** — the same protocol as the official Telegram app —
> so there is **no file size limit** (up to 2GB per file, 4GB with premium sessions).

---

## Architecture

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Vercel (Frontend)  │◄──────►│  Render (Backend)        │
│  React + Vite       │  HTTPS │  FastAPI + Pyrogram       │
│  PDF.js (local)     │        │  MTProto streaming        │
└─────────────────────┘        └──────────┬───────────────┘
                                          │ MTProto
                                          ▼
                                ┌─────────────────────┐
                                │  Telegram Channel   │
                                │  (your PDFs live    │
                                │   here, any size)   │
                                └─────────────────────┘
```

---

## Prerequisites

1. **Telegram API credentials** — get from https://my.telegram.org/auth
   - `API_ID` and `API_HASH`

2. **A Telegram bot** — create via @BotFather
   - Get the bot token
   - Add the bot as **admin** to your storage channel

3. **A Telegram channel** — where your PDFs are stored
   - Get the channel ID (it looks like `-1001234567890`)
   - Upload PDFs directly to this channel (not forwarded from other places)

---

## Backend Setup (Render)

### 1. Deploy to Render

- Create a new **Web Service** on [render.com](https://render.com)
- Connect your GitHub repo
- Set **Root Directory** to `backend`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Runtime:** Python 3.11

### 2. Environment Variables (set in Render dashboard)

| Variable | Description | Example |
|----------|-------------|---------|
| `API_ID` | Telegram API ID from my.telegram.org | `12345678` |
| `API_HASH` | Telegram API Hash | `abcdef1234...` |
| `BOT_TOKENS` | Bot token(s), comma-separated | `123:ABC,456:DEF` |
| `STORAGE_CHANNEL` | Channel ID (with -100 prefix) | `-1001234567890` |
| `DATABASE_BACKUP_MSG_ID` | Any message ID in the channel | `1` |
| `ADMIN_PASSWORD` | Your app login password | `mypassword` |
| `JWT_SECRET` | Random secret for JWT | `some_random_string` |
| `FRONTEND_URL` | Your Vercel URL | `https://airnotes.vercel.app` |
| `WEBSITE_URL` | This Render URL (for auto-ping) | `https://airnotes.onrender.com` |

### 3. First-run note

On first deploy, Pyrogram will generate a session file in `./cache/`.
This is normal — it persists across restarts on Render's persistent disk.

---

## Frontend Setup (Vercel)

### 1. Deploy to Vercel

- Import your GitHub repo on [vercel.com](https://vercel.com)
- Set **Root Directory** to `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

### 2. Environment Variables (set in Vercel dashboard)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Your Render backend URL + `/api` e.g. `https://airnotes.onrender.com/api` |

---

## Local Development

```bash
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in your values
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

---

## How to add PDFs

Simply **send PDF files directly to your Telegram channel** (the one in `STORAGE_CHANNEL`).
- Make sure your bot is an admin of the channel
- Files are detected on the next `/api/files` call (or after clicking Refresh)
- **Any size works** — Pyrogram streams them via MTProto regardless of file size

---

## Features

- ✅ Unlimited file size (MTProto, not Bot API)
- ✅ HTTP Range request support (seek to any page instantly)
- ✅ Full PDF reader with dark/sepia/light modes
- ✅ Page thumbnails sidebar
- ✅ Text highlighting (4 colors)
- ✅ Bookmarks per page
- ✅ Reading progress tracking
- ✅ Local folder organization (stored in browser IndexedDB)
- ✅ Full-text search
- ✅ Mobile responsive (swipe to navigate, overlay sidebars)
- ✅ Keyboard shortcuts (←/→ navigate, Ctrl+K search, Esc close)

---

## Troubleshooting

**"No clients initialized"** — Check `BOT_TOKENS` is set correctly and bot is admin of channel.

**"File not found"** — The channel cache is built on startup. Hit the refresh button in the library.

**PDF loads but shows blank** — The PDF worker file wasn't copied. Run `npm run build` again locally to verify `dist/pdf.worker.min.mjs` exists.

**Render goes to sleep** — Set `WEBSITE_URL` to your Render URL. The backend auto-pings itself every 5 minutes to stay awake.
