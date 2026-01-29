#!/bin/bash
# FACECONTROL — serverda deploy (CI/CD). GitHub Actions yoki qo'lda: ./deploy.sh
set -e

APP_DIR="${APP_DIR:-/opt/FACECONTROL}"
cd "$APP_DIR"

echo "[deploy] Pulling latest from origin/main..."
git fetch origin main
git reset --hard origin/main

echo "[deploy] Building and starting containers..."
docker compose build --no-cache backend
docker compose up -d

echo "[deploy] Done."
docker compose ps
