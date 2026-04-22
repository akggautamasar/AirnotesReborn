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
file_cache: Dict[str, Dict] = {}
security = HTTPBearer()

# ── refresh state ──────────────────────────────────────────────────────────────
_refresh_lock = asyncio.Lock()
_refresh_in_progress = False
_last_refresh: datetime = None
REFRESH_INTERVAL_SECONDS = 5 * 60   # background auto-refresh every 5 min
FULL_SCAN_LIMIT = 10_000            # scan up to 10k messages (was hardcoded 2000)


# ── JWT helpers ────────────────────────────────────────────────────────────────

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


# ── lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await initialize_clients()
    # Kick off initial cache build in background (non-blocking startup)
    asyncio.create_task(refresh_file_cache())
    # Background periodic refresh
    asyncio.create_task(_periodic_refresh())
    try:
        from bot_handler import setup_bot_handlers
        from utils.clients import multi_clients
        for client in multi_clients.values():
            setup_bot_handlers(client, file_cache)
            logger.info("Bot handlers registered")
            break
    except Exception as e:
        logger.error(f"Bot handler setup failed: {e}")
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


# ── cache refresh ──────────────────────────────────────────────────────────────

async def refresh_file_cache():
    """
    Rebuild the PDF cache from Telegram.

    FIX 1: Protected by a lock — concurrent requests no longer spawn duplicate scans.
    FIX 2: Scans up to FULL_SCAN_LIMIT (10k) messages instead of the old 2000 cap,
           so all PDFs in the channel are discovered.
    FIX 3: No longer called on every GET /api/files — only on startup, periodic
           background task, and explicit POST /api/files/refresh.
    """
    global file_cache, _refresh_in_progress, _last_refresh

    if _refresh_in_progress:
        logger.info("Refresh already in progress, skipping duplicate")
        return

    async with _refresh_lock:
        _refresh_in_progress = True
        try:
            client = get_client()
            new_cache: Dict[str, Dict] = {}

            # ── find the real upper bound of message IDs ───────────────────
            anchor_id = config.DATABASE_BACKUP_MSG_ID
            upper_id = anchor_id

            for probe_ids in [
                list(range(anchor_id + 1, anchor_id + 501, 50)),
                list(range(upper_id + 1, upper_id + 101)),
            ]:
                try:
                    msgs = await client.get_messages(config.STORAGE_CHANNEL, probe_ids)
                    for m in msgs:
                        if m and not m.empty and m.id > upper_id:
                            upper_id = m.id
                except Exception:
                    pass

            # ── scan backwards in 200-msg batches ─────────────────────────
            start_id = max(1, upper_id - FULL_SCAN_LIMIT)
            logger.info(
                f"Cache scan: msg range {start_id}–{upper_id} "
                f"({upper_id - start_id + 1} IDs)"
            )

            for batch_start in range(upper_id, start_id - 1, -200):
                batch_end = max(batch_start - 199, start_id)
                ids = list(range(batch_start, batch_end - 1, -1))
                try:
                    messages = await client.get_messages(config.STORAGE_CHANNEL, ids)
                except Exception as e:
                    logger.warning(f"Batch fetch failed: {e}")
                    continue

                for message in messages:
                    if not message or message.empty:
                        continue
                    media = (
                        getattr(message, "document", None)
                        or getattr(message, "video", None)
                    )
                    if not media:
                        continue
                    mime = getattr(media, "mime_type", "") or ""
                    fname = (
                        getattr(media, "file_name", "")
                        or f"file_{message.id}.pdf"
                    )
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

                await asyncio.sleep(0.1)

            file_cache = new_cache
            _last_refresh = datetime.utcnow()
            logger.info(f"Cache refreshed: {len(file_cache)} PDFs")

        except Exception as e:
            logger.error(f"Cache refresh failed: {e}")
        finally:
            _refresh_in_progress = False


async def _periodic_refresh():
    """Background task: refresh cache every REFRESH_INTERVAL_SECONDS."""
    await asyncio.sleep(90)  # wait for startup to settle
    while True:
        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)
        logger.info("Periodic cache refresh triggered")
        await refresh_file_cache()


# ── routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
@app.head("/health")
async def health():
    """
    FIX: Now handles both GET and HEAD.
    Render's health check probe sends HEAD /health — the original code only
    registered GET, so every probe returned 405 Method Not Allowed.
    """
    return {
        "status": "ok",
        "files_cached": len(file_cache),
        "last_refresh": _last_refresh.isoformat() if _last_refresh else None,
        "refresh_in_progress": _refresh_in_progress,
    }


@app.post("/api/auth/login")
async def login(request: Request):
    body = await request.json()
    if body.get("password", "") != config.ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"token": create_jwt({"authenticated": True}), "message": "Login successful"}


@app.get("/api/auth/verify")
async def verify(user=Depends(require_auth)):
    return {"valid": True}


@app.get("/api/files")
async def list_files(user=Depends(require_auth)):
    """
    FIX: No longer triggers a blocking Telegram scan on every call.
    Returns in-memory cache instantly. Freshness maintained by background task.
    """
    return {
        "files": sorted(file_cache.values(), key=lambda f: f["date"], reverse=True),
        "total": len(file_cache),
        "last_refresh": _last_refresh.isoformat() if _last_refresh else None,
        "refresh_in_progress": _refresh_in_progress,
    }


@app.get("/api/files/{file_id}/stream")
async def stream_file(file_id: str, request: Request, user=Depends(require_auth)):
    if file_id not in file_cache:
        # Trigger background refresh without blocking the request
        if not _refresh_in_progress:
            asyncio.create_task(refresh_file_cache())
        raise HTTPException(
            status_code=404,
            detail="File not found — cache may be refreshing, please retry shortly"
        )
    info = file_cache[file_id]
    return await media_streamer(config.STORAGE_CHANNEL, info["message_id"], info["name"], request)


@app.options("/api/files/{file_id}/stream")
async def stream_options(file_id: str):
    return Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Range",
    })


@app.delete("/api/files/{file_id}")
async def delete_file(file_id: str, user=Depends(require_auth)):
    if file_id not in file_cache:
        raise HTTPException(status_code=404, detail="File not found")
    info = file_cache[file_id]
    try:
        client = get_client()
        await client.delete_messages(config.STORAGE_CHANNEL, info["message_id"])
        del file_cache[file_id]
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")


@app.patch("/api/files/{file_id}/rename")
async def rename_file(file_id: str, request: Request, user=Depends(require_auth)):
    if file_id not in file_cache:
        raise HTTPException(status_code=404, detail="File not found")
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    file_cache[file_id]["name"] = name
    return {"success": True, "file": file_cache[file_id]}


@app.post("/api/files/{file_id}/copy")
async def copy_file(file_id: str, user=Depends(require_auth)):
    if file_id not in file_cache:
        raise HTTPException(status_code=404, detail="File not found")
    info = file_cache[file_id]
    try:
        client = get_client()
        orig = await client.get_messages(config.STORAGE_CHANNEL, info["message_id"])
        copied = await orig.copy(config.STORAGE_CHANNEL)
        media = getattr(copied, "document", None) or getattr(copied, "video", None)
        if not media:
            raise HTTPException(status_code=500, detail="Copy failed")
        new_key = f"msg_{copied.id}"
        base = info["name"].replace(".pdf", "")
        file_cache[new_key] = {
            "id": new_key,
            "message_id": copied.id,
            "name": f"{base} (copy).pdf",
            "size": info["size"],
            "date": copied.date.timestamp() if copied.date else info["date"],
            "caption": info["caption"],
        }
        return {"success": True, "file": file_cache[new_key]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Copy failed: {e}")


@app.get("/api/search")
async def search(q: str = "", user=Depends(require_auth)):
    if not q:
        return {"files": []}
    query = q.lower()
    return {
        "files": [
            f for f in file_cache.values()
            if query in f["name"].lower() or query in f["caption"].lower()
        ],
        "query": q,
    }


@app.post("/api/files/refresh")
async def force_refresh(user=Depends(require_auth)):
    """
    FIX: No longer blocks for 30+ seconds.
    Fires refresh as a background task and returns immediately.
    Poll GET /api/files — the 'refresh_in_progress' field goes false when done.
    """
    if _refresh_in_progress:
        return {
            "message": "Refresh already in progress",
            "files_cached": len(file_cache),
        }
    asyncio.create_task(refresh_file_cache())
    return {
        "message": "Refresh started in background",
        "files_cached": len(file_cache),
        "hint": "Poll GET /api/files — refresh_in_progress turns false when done",
    }
