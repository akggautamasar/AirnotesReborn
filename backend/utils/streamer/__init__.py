"""
AirNotes 2.0 — Media streaming via Pyrogram MTProto.
Supports unlimited file sizes with HTTP Range requests for seeking.
"""
import math
import mimetypes
from pathlib import Path
from fastapi.responses import StreamingResponse, Response
from utils.logger import Logger
from utils.streamer.custom_dl import ByteStreamer
from utils.clients import get_client
from urllib.parse import quote

logger = Logger(__name__)

_streamer_cache = {}


def parse_range_header(range_header: str, file_size: int) -> tuple:
    if not range_header or not range_header.startswith("bytes="):
        return 0, file_size - 1
    spec = range_header[6:]
    try:
        if spec.startswith("-"):
            start = max(0, file_size - int(spec[1:]))
            end = file_size - 1
        elif spec.endswith("-"):
            start = int(spec[:-1])
            end = file_size - 1
        elif "-" in spec:
            parts = spec.split("-", 1)
            start = int(parts[0])
            end = int(parts[1]) if parts[1] else file_size - 1
        else:
            return 0, file_size - 1
        start = max(0, min(start, file_size - 1))
        end = max(start, min(end, file_size - 1))
        return start, end
    except (ValueError, IndexError):
        return 0, file_size - 1


async def media_streamer(channel: int, message_id: int, file_name: str, request):
    """
    Stream any Telegram file via MTProto — no Bot API 20MB limit.
    Handles HTTP Range requests for PDF seeking/jumping pages.
    """
    global _streamer_cache

    range_header = request.headers.get("Range", "")
    logger.info(f"Stream: {file_name} | channel={channel} | msg={message_id} | range={range_header!r}")

    client = get_client()
    if client not in _streamer_cache:
        _streamer_cache[client] = ByteStreamer(client)
    streamer = _streamer_cache[client]

    try:
        file_id = await streamer.get_file_properties(channel, message_id)
        file_size = file_id.file_size
        if file_size == 0:
            return Response(status_code=404, content="File empty or not found")
    except Exception as e:
        logger.error(f"Failed to get file properties: {e}")
        return Response(status_code=500, content=f"Failed to retrieve file: {e}")

    from_bytes, until_bytes = parse_range_header(range_header, file_size)

    if from_bytes >= file_size:
        return Response(
            status_code=416,
            content="Range Not Satisfiable",
            headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"},
        )

    until_bytes = min(until_bytes, file_size - 1)
    chunk_size = 1024 * 1024  # 1MB chunks
    offset = from_bytes - (from_bytes % chunk_size)
    first_part_cut = from_bytes - offset
    last_part_cut = (until_bytes % chunk_size) + 1
    req_length = until_bytes - from_bytes + 1
    part_count = math.ceil((until_bytes + 1) / chunk_size) - math.floor(offset / chunk_size)

    body = streamer.yield_file(file_id, offset, first_part_cut, last_part_cut, part_count, chunk_size)

    mime_type = mimetypes.guess_type(file_name)[0] or "application/pdf"
    is_range = bool(range_header)

    headers = {
        "Content-Type": mime_type,
        "Content-Length": str(req_length),
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{quote(file_name)}"',
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
        "Cache-Control": "public, max-age=3600",
    }
    if is_range:
        headers["Content-Range"] = f"bytes {from_bytes}-{until_bytes}/{file_size}"

    logger.info(f"Streaming bytes {from_bytes}-{until_bytes}/{file_size} ({req_length} bytes)")

    return StreamingResponse(
        status_code=206 if is_range else 200,
        content=body,
        headers=headers,
        media_type=mime_type,
    )
