from pyrogram import Client
from pyrogram.file_id import FileId
from typing import Optional, Any
from datetime import datetime


def get_media_from_message(message) -> Any:
    for attr in ("document", "video", "audio", "photo", "animation", "voice", "video_note", "sticker"):
        media = getattr(message, attr, None)
        if media:
            return media
    return None


async def get_file_ids(client: Client, chat_id, message_id: int) -> Optional[FileId]:
    message = await client.get_messages(chat_id, int(message_id))
    if message.empty:
        raise Exception("FileNotFound")
    media = get_media_from_message(message)
    if not media:
        raise Exception("No media in message")
    file_id = FileId.decode(media.file_id)
    setattr(file_id, "file_size", getattr(media, "file_size", 0))
    setattr(file_id, "mime_type", getattr(media, "mime_type", "application/pdf"))
    setattr(file_id, "file_name", getattr(media, "file_name", f"file_{message_id}.pdf"))
    setattr(file_id, "file_id", media.file_id)
    return file_id
