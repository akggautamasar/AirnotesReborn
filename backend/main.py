"""
AirNotes 2.0 Backend
====================
Uses Pyrogram MTProto (same engine as Beyonddrive) for unlimited file streaming.
No Bot API 20MB limit — streams directly via Telegram's MTProto protocol.

Required environment variables:
  API_ID            - From https://my.telegram.org/auth
  API_HASH          - From https://my.telegram.org/auth
  BOT_TOKENS        - Comma-separated bot tokens
  STORAGE_CHANNEL   - Telegram channel ID (e.g. -1001234567890)
  DATABASE_BACKUP_MSG_ID - Any message ID in the channel (for startup verification)
  ADMIN_PASSWORD    - Login password (default: airnotes123)
  JWT_SECRET        - Secret for JWT tokens
  FRONTEND_URL      - Your Vercel URL (for CORS)
  WEBSITE_URL       - This backend URL (for auto-ping on Render free tier)
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt as pyjwt

import config
from utils.clients import initialize_clients, get_client
from utils.streamer import media_streamer
from utils.extra import auto_ping_website
from utils.logger import Logger

logger = Logger(__name__)

# ─── File Cache ───────────────────────────────────────────────────────────────
file_cache: Dict[str, Dict] = {}

# ─── Auth ─────────────────────────────────────────────────────────────────────
security = HTTPBearer()

def create_jwt(data: dict, expires_hours: int = 24 * 7) -> str:
    payload = {**data, "exp": datetime.utcnow() + timedelta(hours=expires_hours)}
    return pyjwt.encode(payload, config.JWT_SECRET, algorithm="HS256")

def verify_jwt(token: str) -> dict:
    return pyjwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])

async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return verify_jwt(credentials.credentials)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await initialize_clients()
    asyncio.create_task(refresh_file_cache())
    if config.WEBSITE_URL:
        asyncio.create_task(auto_ping_website(config.WEBSITE_URL))
    yield

app = FastAPI(title="AirNotes 2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Channel Scanner ──────────────────────────────────────────────────────────

async def refresh_file_cache():
    """
    Scan channel for PDFs using bot-compatible get_messages().
    Bots cannot use get_chat_history() — that's a user-only method.
    Instead we batch-fetch by message ID, same approach as Beyonddrive.
    """
    global file_cache
    try:
        client = get_client()
        new_cache = {}

        anchor_id = config.DATABASE_BACKUP_MSG_ID
        scan_limit = 2000
        batch_size = 200

        # Probe forward from anchor to find the highest existing message ID
        upper_id = anchor_id
        probe_ids = list(range(anchor_id + 1, anchor_id + 501, 50))
        if probe_ids:
            try:
                probe_msgs = await client.get_messages(config.STORAGE_CHANNEL, probe_ids)
                for m in probe_msgs:
                    if m and not m.empty and m.id > upper_id:
                        upper_id = m.id
            except Exception:
                pass

        # Fine probe just above upper_id to catch very recent uploads
        fine_ids = list(range(upper_id + 1, upper_id + 101))
        try:
            fine_msgs = await client.get_messages(config.STORAGE_CHANNEL, fine_ids)
            for m in fine_msgs:
                if m and not m.empty and m.id > upper_id:
                    upper_id = m.id
        except Exception:
            pass

        # Walk backwards from upper_id in batches of 200
        start_id = max(1, upper_id - scan_limit)

        for batch_start in range(upper_id, start_id - 1, -batch_size):
            batch_end = max(batch_start - batch_size + 1, start_id)
            ids = list(range(batch_start, batch_end - 1, -1))

            try:
                messages = await client.get_messages(config.STORAGE_CHANNEL, ids)
            except Exception as e:
                logger.warning(f"Batch fetch failed (ids {batch_start}..{batch_end}): {e}")
                continue

            for message in messages:
                if not message or message.empty:
                    continue

                media = (
                    getattr(message, "document", None) or
                    getattr(message, "video", None)
                )
                if not media:
                    continue

                mime = getattr(media, "mime_type", "") or ""
                fname = getattr(media, "file_name", "") or f"file_{message.id}.pdf"

                if mime != "application/pdf" and not fname.lower().endswith(".pdf"):
                    continue

                key = f"msg_{message.id}"
                new_cache[key] = {
                    "id": key,
                    "message_id": message.id,
                    "name": fname,
                    "size": getattr(media, "file_size", 0),
                    "date": message.date.timestamp() if message.date else 0,
                    "caption": message.caption or "",
                }

            await asyncio.sleep(0.3)

        file_cache = new_cache
        logger.info(f"File cache refreshed: {len(file_cache)} PDFs found (scanned {start_id}–{upper_id})")

    except Exception as e:
        logger.error(f"Failed to refresh file cache: {e}")


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "files_cached": len(file_cache), "version": "2.0.0"}

@app.post("/api/auth/login")
async def login(request: Request):
    body = await request.json()
    password = body.get("password", "")
    if password != config.ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_jwt({"authenticated": True})
    return {"token": token, "message": "Login successful"}

@app.get("/api/auth/verify")
async def verify(user=Depends(require_auth)):
    return {"valid": True}

@app.get("/api/files")
async def list_files(user=Depends(require_auth)):
    await refresh_file_cache()
    files = sorted(file_cache.values(), key=lambda f: f["date"], reverse=True)
    return {"files": files, "total": len(files)}

@app.get("/api/files/{file_id}/stream")
async def stream_file(file_id: str, request: Request, user=Depends(require_auth)):
    if file_id not in file_cache:
        await refresh_file_cache()
    if file_id not in file_cache:
        raise HTTPException(status_code=404, detail="File not found. Try refreshing the library.")

    file_info = file_cache[file_id]
    return await media_streamer(
        config.STORAGE_CHANNEL,
        file_info["message_id"],
        file_info["name"],
        request,
    )

@app.options("/api/files/{file_id}/stream")
async def stream_options(file_id: str):
    return Response(
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Range",
        }
    )

@app.get("/api/search")
async def search(q: str = "", user=Depends(require_auth)):
    if not q:
        return {"files": []}
    query = q.lower()
    results = [
        f for f in file_cache.values()
        if query in f["name"].lower() or query in f["caption"].lower()
    ]
    return {"files": results, "query": q}

@app.post("/api/files/refresh")
async def force_refresh(user=Depends(require_auth)):
    await refresh_file_cache()
    return {"files_found": len(file_cache)}
