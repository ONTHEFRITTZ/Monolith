#!/bin/bash
set -e

echo "🚀 Monolith Deployment Starting..."

cd /srv/Monolith

# Stop services

echo "⏹️ Stopping services..."
sudo systemctl stop monolith-web || true
sudo systemctl stop monolith-api || true

# Pull latest

echo "📥 Pulling latest code..."
git pull origin main

# Clean builds

echo "🧹 Cleaning old builds..."
rm -rf apps/web/.next apps/api/dist .turbo

# Install dependencies

echo "📦 Installing dependencies..."
npm ci

# Generate Prisma Client (CRITICAL!)

echo "🔧 Generating Prisma Client..."
cd apps/api
npx prisma generate
cd ../..

# Build API

echo "🏗️ Building API..."
NODE_OPTIONS="--max-old-space-size=1536" npm run build -- --filter=@mon-olith/api

# Build Web

echo "🏗️ Building Web..."
NODE_OPTIONS="--max-old-space-size=1536" npm run build -- --filter=@mon-olith/web

# Verify builds

if [ ! -f "apps/api/dist/main.js" ]; then
echo "❌ API build failed!"
exit 1
fi

if [ ! -d "apps/web/.next" ]; then
echo "❌ Web build failed!"
exit 1
fi

# Start services

echo "▶️ Starting services..."
sudo systemctl start monolith-api
sudo systemctl start monolith-web

# Wait and check

sleep 3
echo ""
echo "📊 Service Status:"
sudo systemctl status monolith-api --no-pager -l
echo ""
sudo systemctl status monolith-web --no-pager -l

echo ""
echo "✅ Deployment complete!"
echo "🌐 Site: https://monolith-labs.xyz"
