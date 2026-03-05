import secrets
from cryptography.fernet import Fernet

# --- USER: REPLACE THESE DETAILS ---
DB_USER = "root"
DB_PASS = "password"
DB_NAME = "bms"
# ----------------------------------

db_url = f"mysql+aiomysql://{DB_USER}:{DB_PASS}@localhost:3306/{DB_NAME}"

env_content = f"""# Database
DATABASE_URL={db_url}

# JWT Secrets
JWT_SECRET={secrets.token_hex(32)}
JWT_REFRESH_SECRET={secrets.token_hex(32)}
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Application
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000

# Encryption key
ENCRYPTION_KEY={Fernet.generate_key().decode()}

# File Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=10

# Rate Limiting
RATE_LIMIT_REQUESTS=10
RATE_LIMIT_WINDOW=60
"""

with open('.env', 'w', encoding='utf-8') as f:
    f.write(env_content)

print("---")
print("Successfully rebuilt .env for LOCAL MySQL.")
print("---")
