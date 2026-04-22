import asyncio
from typing import Dict
from pyrogram import Client
from pyrogram.file_id import FileId
from utils.streamer.file_properties import get_file_ids
from utils.logger import Logger

logger = Logger(__name__)


class ByteStreamer:
    def __init__(self, client: Client):
        self.client: Client = client
        self.cached_file_ids: Dict[int, FileId] = {}
        asyncio.create_task(self.clean_cache())

    async def get_file_properties(self, channel, message_id: int) -> FileId:
        if message_id not in self.cached_file_ids:
            file_id = await get_file_ids(self.client, channel, message_id)
            if not file_id:
                raise Exception("FileNotFound")
            self.cached_file_ids[message_id] = file_id
        return self.cached_file_ids[message_id]

    async def yield_file(self, file_id: FileId, offset: int, first_part_cut: int,
                         last_part_cut: int, part_count: int, chunk_size: int):
        """Async generator — yields bytes via Pyrogram MTProto, no size limit."""
        chunk_offset = offset // chunk_size
        current_part = 1

        try:
            async for chunk in self.client.stream_media(
                file_id.file_id,
                offset=chunk_offset,
                limit=part_count
            ):
                if not chunk:
                    break
                if part_count == 1:
                    yield chunk[first_part_cut:last_part_cut]
                elif current_part == 1:
                    yield chunk[first_part_cut:]
                elif current_part == part_count:
                    yield chunk[:last_part_cut]
                else:
                    yield chunk
                current_part += 1
                if current_part > part_count:
                    break
        except (TimeoutError, AttributeError) as e:
            logger.warning(f"Stream interrupted: {e}")
        except Exception as e:
            logger.error(f"Stream error: {e}")
            raise

    async def clean_cache(self):
        while True:
            await asyncio.sleep(30 * 60)
            self.cached_file_ids.clear()
            logger.debug("File ID cache cleared")
