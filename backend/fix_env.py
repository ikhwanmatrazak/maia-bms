import secrets
from cryptography.fernet import Fernet

env_template = """# Database
# REPLACE the placeholders below with your actual Azure MySQL details
# DO NOT keep the < > brackets!
DATABASE_URL=mysql+aiomysql://YOUR_USERNAME:YOUR_PASSWORD@YOUR_HOSTNAME:3306/YOUR_DATABASE_NAME

# JWT Secrets
JWT_SECRET={jwt_secret}
JWT_REFRESH_SECRET={jwt_refresh_secret}
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Application
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000

# Encryption key
ENCRYPTION_KEY={enc_key}

# File Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=10

# Rate Limiting
RATE_LIMIT_REQUESTS=10
RATE_LIMIT_WINDOW=60
"""

with open('.env', 'w', encoding='utf-8') as f:
    f.write(env_template.format(
        jwt_secret=secrets.token_hex(32),
        jwt_refresh_secret=secrets.token_hex(32),
        enc_key=Fernet.generate_key().decode()
    ))
print("Successfully rebuilt .env")
