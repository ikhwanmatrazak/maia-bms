#!/bin/bash

echo "[start] Running database migrations..."
alembic upgrade head 2>&1 || echo "[start] ERROR: Migration failed (see above). Continuing anyway..."

echo "[start] Starting application server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
