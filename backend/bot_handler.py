"""
AirNotes Bot Handler
- Send any PDF → auto-saved to storage channel
- /batch → bulk import by link range (same as Beyonddrive)
- /start, /help, /cancel
"""

import asyncio
import re
from pyrogram import Client, filters
from pyrogram.types import Message
import config
from utils.logger import Logger

logger = Logger(__name__)

_pending = {}

def _is_admin(user_id: int) -> bool:
    return user_id in config.TELEGRAM_ADMIN_IDS

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

def _add_to_cache(message: Message, file_cache: dict):
    media = getattr(message, "document", None) or getattr(message, "video", None)
    if not media:
        return False
    mime = getattr(media, "mime_type", "") or ""
    fname = getattr(media, "file_name", "") or f"file_{message.id}.pdf"
    if mime != "application/pdf" and not fname.lower().endswith(".pdf"):
        return False
    key = f"msg_{message.id}"
    file_cache[key] = {
        "id": key,
        "message_id": message.id,
        "name": fname,
        "size": getattr(media, "file_size", 0),
        "date": message.date.timestamp() if message.date else 0,
        "caption": message.caption or "",
    }
    return True

def setup_bot_handlers(bot: Client, file_cache: dict):

    @bot.on_message(filters.private & filters.command(["start", "help"]))
    async def cmd_start(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        await message.reply_text(
            "📚 **AirNotes Bot**\n\n"
            "**Send any PDF** to this bot and it saves to the storage channel automatically.\n\n"
            "**Commands:**\n"
            "/batch — Bulk import files from a channel by link range\n"
            "/cancel — Cancel any ongoing operation"
        )

    @bot.on_message(filters.private & filters.command("cancel"))
    async def cmd_cancel(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        if message.chat.id in _pending:
            _pending.pop(message.chat.id, None)
            await message.reply_text("❌ Cancelled.")
        else:
            await message.reply_text("Nothing to cancel.")

    @bot.on_message(
        filters.private &
        (filters.document | filters.video | filters.audio | filters.photo)
    )
    async def handle_file(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        if message.chat.id in _pending:
            return
        media = (
            getattr(message, "document", None) or getattr(message, "video", None) or
            getattr(message, "audio", None) or getattr(message, "photo", None)
        )
        fname = getattr(media, "file_name", "file") or "file"
        size_mb = getattr(media, "file_size", 0) / (1024 * 1024)
        status = await message.reply_text(f"⏳ Saving **{fname}**...")
        try:
            copied = await message.copy(config.STORAGE_CHANNEL)
            added = _add_to_cache(copied, file_cache)
            if added:
                await status.edit_text(
                    f"✅ **Saved!**\n\n📄 {fname}\n💾 {size_mb:.1f} MB\n\nNow visible on the website."
                )
            else:
                await status.edit_text(f"✅ Copied (msg {copied.id}) — not a PDF, won't appear in library.")
        except Exception as e:
            logger.error(f"File upload error: {e}")
            await status.edit_text(f"❌ Failed: {e}")

    @bot.on_message(filters.private & filters.command("batch"))
    async def cmd_batch(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        if message.chat.id in _pending:
            await message.reply_text("Already in a conversation. Send /cancel first.")
            return

        await message.reply_text(
            "📦 **Batch Import**\n\n"
            "Imports all files between two message links from the same channel.\n\n"
            "**Link format:** `https://t.me/channelname/123`\n\nSend /cancel anytime."
        )

        try:
            start_msg = await _ask(client, message.chat.id,
                "📎 **Step 1/2 — Start link**\n\nSend the link of the **first** message:")
        except asyncio.TimeoutError:
            await client.send_message(message.chat.id, "⏰ Timed out. Use /batch to try again.")
            return

        if start_msg.text.strip().lower() == "/cancel":
            await message.reply_text("❌ Cancelled.")
            return

        start_parsed = _parse_link(start_msg.text)
        if not start_parsed:
            await client.send_message(message.chat.id, "❌ Invalid link. Use /batch to try again.")
            return
        start_channel, start_id = start_parsed

        try:
            end_msg = await _ask(client, message.chat.id,
                f"📎 **Step 2/2 — End link**\n\nStart: `{start_msg.text.strip()}`\n\nNow send the **last** message link:")
        except asyncio.TimeoutError:
            await client.send_message(message.chat.id, "⏰ Timed out. Use /batch to try again.")
            return

        if end_msg.text.strip().lower() == "/cancel":
            await message.reply_text("❌ Cancelled.")
            return

        end_parsed = _parse_link(end_msg.text)
        if not end_parsed:
            await client.send_message(message.chat.id, "❌ Invalid link. Use /batch to try again.")
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
            await client.send_message(message.chat.id, f"❌ Range too large ({total}). Max is 5000.")
            return

        try:
            confirm = await _ask(client, message.chat.id,
                f"✅ **Confirm**\n\nChannel: `{start_channel}`\nRange: {start_id} → {end_id}\n"
                f"Total: **{total}** messages\n\nType **YES** to start:")
        except asyncio.TimeoutError:
            await client.send_message(message.chat.id, "⏰ Timed out.")
            return

        if confirm.text.strip().upper() not in ("YES", "Y"):
            await client.send_message(message.chat.id, "❌ Cancelled.")
            return

        asyncio.create_task(
            _run_batch_import(client, message.chat.id, start_channel, start_id, end_id, file_cache)
        )

    @bot.on_message(filters.private & filters.text)
    async def handle_text(client: Client, message: Message):
        if not _is_admin(message.from_user.id):
            return
        chat_id = message.chat.id
        if chat_id in _pending:
            await _pending[chat_id].put(message)


async def _run_batch_import(client, chat_id, channel, start_id, end_id, file_cache):
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
                media = (
                    getattr(source, "document", None) or getattr(source, "video", None) or
                    getattr(source, "audio", None) or getattr(source, "photo", None)
                )
                if not media:
                    skipped += 1
                else:
                    copied = await source.copy(config.STORAGE_CHANNEL)
                    _add_to_cache(copied, file_cache)
                    imported += 1
        except Exception as e:
            logger.warning(f"Batch msg {msg_id}: {e}")
            errors += 1

        done = imported + skipped + errors
        if done % 50 == 0 or msg_id == end_id:
            pct = done / total * 100
            try:
                await status_msg.edit_text(
                    f"📊 **Batch import** — {pct:.0f}%\n"
                    f"✅ {imported} imported | ⏭ {skipped} skipped | ❌ {errors} errors\n"
                    f"({done}/{total})"
                )
            except Exception:
                pass
        await asyncio.sleep(0.3)

    await client.send_message(chat_id,
        f"🎉 **Done!**\n\n✅ Imported: **{imported}**\n⏭ Skipped: {skipped}\n❌ Errors: {errors}\n\n"
        f"All files are now visible on the website.")
