from dotenv import load_dotenv
import os

load_dotenv()

# Telegram API credentials from https://my.telegram.org/auth
API_ID = int(os.getenv("API_ID", "0"))
API_HASH = os.getenv("API_HASH", "")

# Bot tokens (comma-separated) - used for file operations
BOT_TOKENS = os.getenv("BOT_TOKENS", "").strip(", ").split(",")
BOT_TOKENS = [t.strip() for t in BOT_TOKENS if t.strip()]

# Premium string sessions (comma-separated) - enables files up to 4GB
STRING_SESSIONS = os.getenv("STRING_SESSIONS", "").strip(", ").split(",")
STRING_SESSIONS = [s.strip() for s in STRING_SESSIONS if s.strip()]

# The Telegram channel where PDFs are stored
STORAGE_CHANNEL = int(os.getenv("STORAGE_CHANNEL", "0"))

# Message ID used for database backup storage
DATABASE_BACKUP_MSG_ID = int(os.getenv("DATABASE_BACKUP_MSG_ID", "0"))

# App password for login
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "airnotes123")

# JWT secret
JWT_SECRET = os.getenv("JWT_SECRET", "airnotes_super_secret_key_change_me")

# Max file size: 2GB without premium, 4GB with premium sessions
if not STRING_SESSIONS:
    MAX_FILE_SIZE = 1.98 * 1024 * 1024 * 1024
else:
    MAX_FILE_SIZE = 3.98 * 1024 * 1024 * 1024

# Backup interval in seconds
DATABASE_BACKUP_TIME = int(os.getenv("DATABASE_BACKUP_TIME", "300"))

# Flood wait sleep threshold
SLEEP_THRESHOLD = int(os.getenv("SLEEP_THRESHOLD", "60"))

# Auto-ping URL to keep Render alive
WEBSITE_URL = os.getenv("WEBSITE_URL", None)

# CORS origins
FRONTEND_URL = os.getenv("FRONTEND_URL", "*")
