#!/bin/bash

echo "[start] Running database migrations..."
alembic upgrade head || echo "[start] WARNING: Migrations failed, continuing anyway..."

echo "[start] Starting application server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
