import asyncio
import aiohttp
from utils.logger import Logger

logger = Logger(__name__)


async def auto_ping_website(url: str):
    """
    Keep Render free tier alive by pinging /health every 5 minutes.

    FIX: Was pinging the bare root URL which returns 404, so Render logged
    constant 404 noise and the ping was meaningless. Now pings /health which
    returns 200 and also confirms the app is truly healthy.
    """
    if not url:
        return

    # Normalise — strip trailing slash, point at /health
    health_url = url.rstrip("/") + "/health"

    await asyncio.sleep(60)
    while True:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    health_url, timeout=aiohttp.ClientTimeout(total=10)
                ) as r:
                    logger.debug(f"Auto-ping {health_url} -> {r.status}")
        except Exception as e:
            logger.warning(f"Auto-ping failed: {e}")
        await asyncio.sleep(300)
