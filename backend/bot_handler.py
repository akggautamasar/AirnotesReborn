"""
AirNotes Bot Handler — Full Featured
Features:
  - Send PDF/Video → instantly visible on website (no delay)
  - /set_folder    — Set upload destination folder
  - /current_folder — Show current folder
  - /create_folder  — Create new folder (bot or website)
  - /list_folders   — List all folders
  - /batch          — Bulk import by message link range
  - /fast_import    — Import directly from channel (no copy needed)
  - /cancel         — Cancel any ongoing operation
  - /start /help
"""

import asyncio
import re
from pathlib import Path
from pyrogram import Client, filters
from pyrogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton
import config
from utils.logger import Logger

logger = Logger(__name__)

_pending = {}
_upload_folder: dict = {}  # chat_id -> folder_id (or None for root)

VIDEO_MIMES = {
    "video/mp4", "video/x-matroska", "video/webm", "video/x-msvideo",
    "video/quicktime", "video/x-flv", "video/x-ms-wmv", "video/3gpp",
    "video/mp2t", "video/mpeg",
}
VIDEO_EXTS = {".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v", ".flv", ".wmv", ".3gp", ".ts", ".mpeg"}

HELP_TEXT = """📚 **AirNotes Bot**

**Upload Files:**
Just send any PDF or Video — it saves instantly and appears on the website right away.

**Commands:**
/set_folder — Set folder for uploads
/current_folder — Check current folder
/create_folder <name> — Create a new folder
/list_folders — List all folders
/batch — Bulk import files by link range
/fast_import — Import directly from a channel
/cancel — Cancel current operation

**Supported:** PDF, MP4, MKV, WebM, AVI, MOV, and more.
**Note:** Files are visible on website INSTANTLY after upload."""


def _is_admin(user_id: int) -> bool:
    return user_id in config.TELEGRAM_ADMIN_IDS


def _get_file_type(mime: str, fname: str) -> str:
    if mime == "application/pdf" or fname.lower().endswith(".pdf"):
        return "pdf"
    if mime in VIDEO_MIMES or Path(fname).suffix.lower() in VIDEO_EXTS:
        return "video"
    return "other"


def _add_to_cache(message: Message, file_cache: dict) -> bool:
    """Instantly add a file to the in-memory cache → visible on website immediately."""
    media = getattr(message, "document", None) or getattr(message, "video", None)
    if not media:
        return False
    mime = getattr(media, "mime_type", "") or ""
    fname = getattr(media, "file_name", "") or f"file_{message.id}"
    ftype = _get_file_type(mime, fname)
    if ftype == "other":
        return False
    key = f"msg_{message.id}"
    file_cache[key] = {
        "id": key,
        "message_id": message.id,
        "name": fname,
        "size": getattr(media, "file_size", 0),
        "date": message.date.timestamp() if message.date else 0,
        "caption": message.caption or "",
        "type": ftype,
        "mime": mime,
    }
    return True


async def _ask(client, chat_id, text, timeout=300):
    queue = asyncio.Queue(1)
    _pending[chat_id] = queue
    await client.send_message(chat_id, text)
    try:
        msg = await asyncio.wait_for(queue.get(), timeout=timeout)
        return msg
    except asyncio.TimeoutError:
        raise
    finally:
        _pending.pop(chat_id, None)


def _parse_link(link: str):
    m = re.match(r'https?://t\.me/([^/]+)/(\d+)', link.strip())
    if m:
        ch = m.group(1)
        try:
            ch = int(ch)
        except ValueError:
            pass
        return ch, int(m.group(2))
    return None


def _folder_name(folder_id, folder_db):
    if not folder_id:
        return "📁 Root (no folder)"
    folder = folder_db["folders"].get(folder_id)
    return f"📂 {folder['name']}" if folder else "📁 Root"


def setup_bot_handlers(bot: Client, file_cache: dict, folder_db: dict, save_folders_fn):

    @bot.on_message(filters.private & filters.command(["start", "help"]))
    async def cmd_start(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        await message.reply_text(HELP_TEXT)

    @bot.on_message(filters.private & filters.command("cancel"))
    async def cmd_cancel(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        if message.chat.id in _pending:
            _pending.pop(message.chat.id, None)
            await message.reply_text("❌ Cancelled.")
        else:
            await message.reply_text("Nothing to cancel.")

    # ── Folder management ────────────────────────────────────────────────

    @bot.on_message(filters.private & filters.command("list_folders"))
    async def cmd_list_folders(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        folders = list(folder_db["folders"].values())
        if not folders:
            await message.reply_text("📭 No folders yet. Use /create_folder <name> to make one.")
            return
        lines = ["📁 **Your Folders:**\n"]
        for f in folders:
            lines.append(f"• `{f['id']}` — **{f['name']}**")
        await message.reply_text("\n".join(lines))

    @bot.on_message(filters.private & filters.command("current_folder"))
    async def cmd_current_folder(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        fid = _upload_folder.get(message.chat.id)
        name = _folder_name(fid, folder_db)
        await message.reply_text(f"📍 **Current upload folder:** {name}")

    @bot.on_message(filters.private & filters.command("set_folder"))
    async def cmd_set_folder(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        folders = list(folder_db["folders"].values())
        if not folders:
            await message.reply_text(
                "📭 No folders exist yet.\n\nCreate one first with /create_folder <name>"
            )
            return
        lines = ["📁 **Choose a folder** — reply with folder ID or name:\n",
                 "• `none` — Upload to root (no folder)\n"]
        for f in folders:
            lines.append(f"• `{f['id']}` — {f['name']}")
        try:
            reply = await _ask(client, message.chat.id, "\n".join(lines))
        except asyncio.TimeoutError:
            await client.send_message(message.chat.id, "⏰ Timed out.")
            return
        if reply.text.strip().lower() in ("/cancel", "cancel"):
            await message.reply_text("❌ Cancelled.")
            return
        val = reply.text.strip()
        if val.lower() == "none":
            _upload_folder[message.chat.id] = None
            await client.send_message(message.chat.id, "✅ Upload folder set to **Root** (no folder).")
            return
        # match by id or name
        matched = None
        for f in folders:
            if f["id"] == val or f["name"].lower() == val.lower():
                matched = f
                break
        if not matched:
            await client.send_message(message.chat.id, f"❌ Folder `{val}` not found. Use /list_folders to see IDs.")
            return
        _upload_folder[message.chat.id] = matched["id"]
        await client.send_message(message.chat.id, f"✅ Upload folder set to **{matched['name']}**")

    @bot.on_message(filters.private & filters.command("create_folder"))
    async def cmd_create_folder(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        args = message.text.split(maxsplit=1)
        if len(args) > 1:
            folder_name = args[1].strip()
        else:
            try:
                reply = await _ask(client, message.chat.id,
                    "📁 **Create Folder**\n\nSend the folder name (or /cancel):")
            except asyncio.TimeoutError:
                await client.send_message(message.chat.id, "⏰ Timed out.")
                return
            if reply.text.strip().lower() in ("/cancel", "cancel"):
                await message.reply_text("❌ Cancelled.")
                return
            folder_name = reply.text.strip()

        if not folder_name or len(folder_name) > 50:
            await client.send_message(message.chat.id, "❌ Invalid folder name.")
            return

        import uuid
        folder_id = str(uuid.uuid4())[:8]
        folder = {"id": folder_id, "name": folder_name, "parent_id": None,
                  "created_at": __import__("datetime").datetime.utcnow().isoformat()}
        folder_db["folders"][folder_id] = folder
        save_folders_fn()
        await client.send_message(message.chat.id,
            f"✅ **Folder Created!**\n\n📂 **{folder_name}**\nID: `{folder_id}`\n\n"
            f"Use /set_folder to start uploading files here.")

    # ── File upload handler ──────────────────────────────────────────────

    @bot.on_message(filters.private & (filters.document | filters.video | filters.audio | filters.photo))
    async def handle_file(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        if message.chat.id in _pending:
            await _pending[message.chat.id].put(message)
            return
        media = (getattr(message, "document", None) or getattr(message, "video", None) or
                 getattr(message, "audio", None) or getattr(message, "photo", None))
        mime = getattr(media, "mime_type", "") or ""
        fname = getattr(media, "file_name", "file") or "file"
        size_mb = getattr(media, "file_size", 0) / (1024 * 1024)
        ftype = _get_file_type(mime, fname)

        if ftype == "other":
            await message.reply_text(
                f"⚠️ **Unsupported type**\n\nFile: {fname}\nOnly PDFs and Videos are supported."
            )
            return

        current_folder_id = _upload_folder.get(message.chat.id)
        folder_label = _folder_name(current_folder_id, folder_db)
        type_label = "📄 PDF" if ftype == "pdf" else "🎬 Video"
        status = await message.reply_text(
            f"⏳ Saving {type_label} **{fname}**...\n📁 Folder: {folder_label}"
        )
        try:
            copied = await message.copy(config.STORAGE_CHANNEL)
            added = _add_to_cache(copied, file_cache)
            if added:
                file_id = f"msg_{copied.id}"
                # assign to folder if set
                if current_folder_id:
                    folder_db["file_assignments"][file_id] = current_folder_id
                    save_folders_fn()
                await status.edit_text(
                    f"✅ **Saved & Visible Instantly!**\n\n"
                    f"{type_label} **{fname}**\n"
                    f"💾 {size_mb:.1f} MB\n"
                    f"📁 {folder_label}\n\n"
                    f"Now visible on the website right away."
                )
            else:
                await status.edit_text(f"✅ Copied (msg {copied.id}) — type not recognized for library.")
        except Exception as e:
            logger.error(f"File upload error: {e}")
            await status.edit_text(f"❌ Failed: {e}")

    # ── /batch (bulk import by link range) ──────────────────────────────

    @bot.on_message(filters.private & filters.command("batch"))
    async def cmd_batch(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        if message.chat.id in _pending:
            await message.reply_text("Already in a conversation. Send /cancel first.")
            return

        current_folder_id = _upload_folder.get(message.chat.id)
        folder_label = _folder_name(current_folder_id, folder_db)

        await message.reply_text(
            "📦 **Batch Import**\n\n"
            f"📁 Destination: {folder_label}\n\n"
            "Imports all PDFs and Videos between two Telegram message links.\n"
            "**Format:** `https://t.me/channelname/123`\n\nSend /cancel anytime."
        )

        try:
            start_msg = await _ask(client, message.chat.id,
                "📎 **Step 1/2 — Start link**\n\nSend the link of the **first** message:")
        except asyncio.TimeoutError:
            await client.send_message(message.chat.id, "⏰ Timed out.")
            return
        if start_msg.text.strip().lower() == "/cancel":
            await message.reply_text("❌ Cancelled.")
            return
        start_parsed = _parse_link(start_msg.text)
        if not start_parsed:
            await client.send_message(message.chat.id, "❌ Invalid link.")
            return
        start_channel, start_id = start_parsed

        try:
            end_msg = await _ask(client, message.chat.id,
                f"📎 **Step 2/2 — End link**\n\nStart: `{start_msg.text.strip()}`\n\nNow send the **last** message link:")
        except asyncio.TimeoutError:
            await client.send_message(message.chat.id, "⏰ Timed out.")
            return
        if end_msg.text.strip().lower() == "/cancel":
            await message.reply_text("❌ Cancelled.")
            return
        end_parsed = _parse_link(end_msg.text)
        if not end_parsed:
            await client.send_message(message.chat.id, "❌ Invalid link.")
            return
        end_channel, end_id = end_parsed

        if str(start_channel) != str(end_channel):
            await client.send_message(message.chat.id, "❌ Both links must be from the same channel.")
            return
        if start_id >= end_id:
            await client.send_message(message.chat.id, "❌ Start ID must be less than End ID.")
            return
        total = end_id - start_id + 1
        if total > 5000:
            await client.send_message(message.chat.id, f"❌ Range too large ({total}). Max 5000.")
            return

        try:
            confirm = await _ask(client, message.chat.id,
                f"✅ **Confirm Batch Import**\n\n"
                f"Channel: `{start_channel}`\n"
                f"Range: {start_id} → {end_id} ({total} messages)\n"
                f"📁 Folder: {folder_label}\n\n"
                f"Type **YES** to start:")
        except asyncio.TimeoutError:
            await client.send_message(message.chat.id, "⏰ Timed out.")
            return
        if confirm.text.strip().upper() not in ("YES", "Y"):
            await client.send_message(message.chat.id, "❌ Cancelled.")
            return

        asyncio.create_task(
            _run_batch_import(client, message.chat.id, start_channel, start_id, end_id,
                              file_cache, folder_db, save_folders_fn, current_folder_id)
        )

    # ── /fast_import (import without copying) ───────────────────────────

    @bot.on_message(filters.private & filters.command("fast_import"))
    async def cmd_fast_import(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        if message.chat.id in _pending:
            await message.reply_text("Already waiting for input. Send /cancel first.")
            return

        current_folder_id = _upload_folder.get(message.chat.id)
        folder_label = _folder_name(current_folder_id, folder_db)

        await message.reply_text(
            "⚡ **Fast Import**\n\n"
            "Imports files directly from a channel **without copying** — streamed from source.\n\n"
            f"📁 Destination: {folder_label}\n\n"
            "Requirements:\n• Bot must be admin in source channel\n\n"
            "Send /cancel anytime."
        )

        try:
            ch_msg = await _ask(client, message.chat.id,
                "📺 **Channel**\n\nSend channel username or ID (e.g. @mychannel or -1001234567890):")
        except asyncio.TimeoutError:
            await client.send_message(message.chat.id, "⏰ Timed out.")
            return
        if ch_msg.text.strip().lower() == "/cancel":
            await message.reply_text("❌ Cancelled.")
            return
        channel_id = ch_msg.text.strip()

        try:
            range_msg = await _ask(client, message.chat.id,
                f"📋 **Message Range**\n\nChannel: `{channel_id}`\n\n"
                "• Send `all` to import all files\n"
                "• Send `range` to specify start/end message IDs\n"
                "• Send /cancel to cancel")
        except asyncio.TimeoutError:
            await client.send_message(message.chat.id, "⏰ Timed out.")
            return
        if range_msg.text.strip().lower() == "/cancel":
            await message.reply_text("❌ Cancelled.")
            return

        start_mid = end_mid = None
        if range_msg.text.strip().lower() == "range":
            try:
                s = await _ask(client, message.chat.id, "🔢 Start Message ID:")
                start_mid = int(s.text.strip())
                e = await _ask(client, message.chat.id, "🔢 End Message ID:")
                end_mid = int(e.text.strip())
            except (asyncio.TimeoutError, ValueError):
                await client.send_message(message.chat.id, "❌ Invalid input or timed out.")
                return

        asyncio.create_task(
            _run_fast_import(client, message.chat.id, channel_id, start_mid, end_mid,
                             file_cache, folder_db, save_folders_fn, current_folder_id)
        )

    # ── Text handler (pending queue) ─────────────────────────────────────

    @bot.on_message(filters.private & filters.text)
    async def handle_text(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        chat_id = message.chat.id
        if chat_id in _pending:
            await _pending[chat_id].put(message)


# ── Batch import task ────────────────────────────────────────────────────────

async def _run_batch_import(client, chat_id, channel, start_id, end_id,
                            file_cache, folder_db, save_folders_fn, folder_id):
    total = end_id - start_id + 1
    imported = skipped = errors = 0
    status_msg = await client.send_message(chat_id,
        f"🚀 **Batch import started** — {total} messages\n"
        f"✅ 0 imported | ⏭ 0 skipped | ❌ 0 errors")

    for msg_id in range(start_id, end_id + 1):
        try:
            source = await client.get_messages(channel, msg_id)
            if not source or source.empty:
                skipped += 1
            else:
                media = (getattr(source, "document", None) or getattr(source, "video", None) or
                         getattr(source, "audio", None) or getattr(source, "photo", None))
                if not media:
                    skipped += 1
                else:
                    copied = await source.copy(config.STORAGE_CHANNEL)
                    if _add_to_cache(copied, file_cache):
                        fid = f"msg_{copied.id}"
                        if folder_id:
                            folder_db["file_assignments"][fid] = folder_id
                        imported += 1
                    else:
                        skipped += 1
        except Exception as e:
            logger.warning(f"Batch msg {msg_id}: {e}")
            errors += 1

        done = imported + skipped + errors
        if done % 50 == 0 or msg_id == end_id:
            pct = done / total * 100
            try:
                await status_msg.edit_text(
                    f"📊 **Batch import** — {pct:.0f}%\n"
                    f"✅ {imported} | ⏭ {skipped} | ❌ {errors}\n({done}/{total})"
                )
            except Exception:
                pass
        await asyncio.sleep(0.3)

    if imported and folder_id:
        save_folders_fn()

    await client.send_message(chat_id,
        f"🎉 **Done!**\n\n✅ Imported: **{imported}**\n⏭ Skipped: {skipped}\n❌ Errors: {errors}\n\n"
        f"All files are now visible on the website instantly.")


# ── Fast import task ─────────────────────────────────────────────────────────

async def _run_fast_import(client, chat_id, channel_id, start_mid, end_mid,
                           file_cache, folder_db, save_folders_fn, folder_id):
    status_msg = await client.send_message(chat_id, "⚡ Starting fast import...")
    imported = skipped = errors = 0

    try:
        if start_mid and end_mid:
            msg_ids = list(range(start_mid, end_mid + 1))
            total = len(msg_ids)
            await status_msg.edit_text(f"⚡ Fast importing {total} messages...")
            for i in range(0, total, 200):
                batch = msg_ids[i:i+200]
                try:
                    messages = await client.get_messages(channel_id, batch)
                    for msg in messages:
                        if not msg or msg.empty:
                            skipped += 1
                            continue
                        media = getattr(msg, "document", None) or getattr(msg, "video", None)
                        if not media:
                            skipped += 1
                            continue
                        mime = getattr(media, "mime_type", "") or ""
                        fname = getattr(media, "file_name", "") or f"file_{msg.id}"
                        ftype_val = _get_file_type(mime, fname)
                        if ftype_val == "other":
                            skipped += 1
                            continue
                        key = f"msg_{msg.id}"
                        file_cache[key] = {
                            "id": key, "message_id": msg.id, "name": fname,
                            "size": getattr(media, "file_size", 0),
                            "date": msg.date.timestamp() if msg.date else 0,
                            "caption": msg.caption or "", "type": ftype_val, "mime": mime,
                        }
                        if folder_id:
                            folder_db["file_assignments"][key] = folder_id
                        imported += 1
                except Exception as e:
                    errors += len(batch)
                    logger.warning(f"Fast import batch: {e}")
                done = imported + skipped + errors
                await status_msg.edit_text(
                    f"⚡ Fast import: {done/total*100:.0f}%\n"
                    f"✅ {imported} | ⏭ {skipped} | ❌ {errors}"
                )
                await asyncio.sleep(0.5)
        else:
            # import all from channel (iterate history)
            total = 0
            async for msg in client.get_chat_history(channel_id):
                media = getattr(msg, "document", None) or getattr(msg, "video", None)
                if not media:
                    skipped += 1
                else:
                    mime = getattr(media, "mime_type", "") or ""
                    fname = getattr(media, "file_name", "") or f"file_{msg.id}"
                    ftype_val = _get_file_type(mime, fname)
                    if ftype_val == "other":
                        skipped += 1
                    else:
                        key = f"msg_{msg.id}"
                        file_cache[key] = {
                            "id": key, "message_id": msg.id, "name": fname,
                            "size": getattr(media, "file_size", 0),
                            "date": msg.date.timestamp() if msg.date else 0,
                            "caption": msg.caption or "", "type": ftype_val, "mime": mime,
                        }
                        if folder_id:
                            folder_db["file_assignments"][key] = folder_id
                        imported += 1
                total += 1
                if total % 100 == 0:
                    try:
                        await status_msg.edit_text(
                            f"⚡ Fast import: scanned {total}\n"
                            f"✅ {imported} | ⏭ {skipped}"
                        )
                    except Exception:
                        pass
                await asyncio.sleep(0.05)

        if imported and folder_id:
            save_folders_fn()

        await client.send_message(chat_id,
            f"🎉 **Fast Import Complete!**\n\n"
            f"✅ Imported: **{imported}**\n⏭ Skipped: {skipped}\n❌ Errors: {errors}\n\n"
            f"All files are now visible on the website instantly. (No copying needed!)")
    except Exception as e:
        logger.error(f"Fast import error: {e}")
        await client.send_message(chat_id, f"❌ Fast import failed: {e}")
