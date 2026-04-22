import asyncio
import aiohttp
from utils.logger import Logger

logger = Logger(__name__)


async def auto_ping_website(url: str):
    """Keep Render free tier alive by self-pinging every 5 minutes."""
    if not url:
        return
    await asyncio.sleep(60)
    while True:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                    logger.debug(f"Auto-ping {url} -> {r.status}")
        except Exception as e:
            logger.warning(f"Auto-ping failed: {e}")
        await asyncio.sleep(300)
