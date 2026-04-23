# AirNotes — Netflix-Style Frontend

> "Netflix for Study Notes" — A cinematic card-browsing experience for your PDF notes.

---

## 🚀 Quick Start

```bash
# 1. Go into the frontend folder
cd frontend

# 2. Install dependencies
npm install

# 3. Set your backend URL (copy .env.example → .env.local)
echo "VITE_API_URL=http://localhost:8000/api" > .env.local

# 4. Run the dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🗂 New Component Structure

```
src/
├── components/
│   ├── netflix/
│   │   ├── Navbar.jsx          ← Top nav with search, profile dropdown
│   │   ├── HeroBanner.jsx      ← Hero section (last opened PDF + blurred bg)
│   │   ├── ContentRow.jsx      ← Horizontal scrollable row with drag support
│   │   ├── PDFCard.jsx         ← Card with thumbnail, progress bar, hover actions
│   │   ├── SearchOverlay.jsx   ← Full-page search results grid
│   │   ├── SkeletonRows.jsx    ← Loading skeleton UI
│   │   └── NetflixHome.jsx     ← Main page — orchestrates all rows
│   ├── reader/                 ← Existing PDF/Video readers (unchanged)
│   └── ui/                     ← Existing UI components (unchanged)
├── utils/
│   ├── thumbnails.js           ← PDF first-page thumbnail generator (pdf.js)
│   ├── api.js                  ← API client (unchanged)
│   └── storage.js              ← IndexedDB for progress/bookmarks (unchanged)
└── pages/
    └── MainApp.jsx             ← Updated: renders NetflixHome + readers
```

---

## ✨ Features Implemented

### 🎬 Netflix-Style Home
- **Hero Banner** — Shows the last opened PDF with a blurred first-page background, resume button, and progress bar
- **Continue Reading row** — PDFs you've opened, ordered by recency
- **Recently Added row** — Sorted by upload date
- **Favorites row** — Your starred notes (persisted in localStorage)
- **Subject rows** — Auto-detected from filenames: Physics, Chemistry, Math, CS, Biology, etc.
- **All Notes row** — Every PDF in your library

### 🃏 Card Design
- **Auto-generated thumbnails** — First page of each PDF rendered via pdf.js
- **Colorful placeholder** — Letter-based avatar if thumbnail fails
- **Progress bar** — Visual reading progress from IndexedDB
- **Hover effects** — Scale zoom + overlay with "Resume/Open" button
- **Favorite button** — Star overlay, persists across sessions
- **Context menu** — Open, Duplicate, Delete

### 🔍 Search
- Live search as you type (debounced 350ms)
- Results shown in a full-page grid overlay
- ESC or clear to return to home

### ⚡ Performance
- Thumbnails generated in batches of 4 (no memory overload)
- Thumbnail cache (in-memory, so no re-renders)
- Lazy horizontal scroll — only visible cards loaded
- SSE real-time updates — new Telegram uploads appear instantly

### 📱 Responsive
- Mobile: 2 columns
- Tablet: 3–4 columns  
- Desktop: 5–6 columns
- Horizontal rows adapt fluidly

---

## 🎨 Design System

| Token | Value |
|-------|-------|
| Background | `#0a0a0a` |
| Card bg | `#1a1a1a` |
| Accent blue | `#3b82f6` |
| Accent purple | `#6366f1` |
| Font | Playfair Display (headings) + DM Sans (body) |

---

## 🔧 Backend Requirements

The frontend expects these existing endpoints:
- `GET /api/files` — list all files
- `GET /api/files/:id/stream` — PDF stream (with Bearer token)
- `GET /api/search?q=` — search
- `GET /api/folders` + `GET /api/assignments`
- `DELETE /api/files/:id`
- `POST /api/files/:id/copy`
- `GET /api/events` (SSE for real-time uploads)

All unchanged from the original AirNotes backend.

---

## 📦 Build for Production

```bash
npm run build
# Output: frontend/dist/
```
