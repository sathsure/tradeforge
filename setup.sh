#!/bin/bash

# ╔═══════════════════════════════════════════════════════════════════════╗
# ║          TRADEFORGE — ONE COMMAND LOCAL SETUP                        ║
# ║  Run this ONCE after cloning the repo.                               ║
# ║  After that, use: docker-compose up  (to start everything)           ║
# ╚═══════════════════════════════════════════════════════════════════════╝

set -e  # Exit immediately if any command fails
# WHY set -e? If npm install fails (network issue), script stops immediately.
# Without it, script continues and later steps fail with confusing errors.

echo "╔══════════════════════════════════════════╗"
echo "║     TradeForge Setup Starting...         ║"
echo "╚══════════════════════════════════════════╝"

# ── CHECK PREREQUISITES ───────────────────────────────────────────────────
echo ""
echo "📋 Checking prerequisites..."

check_command() {
  if ! command -v $1 &> /dev/null; then
    echo "❌ $1 not found. Please install it first."
    echo "   See README.md for installation instructions."
    exit 1
  else
    echo "✅ $1 found: $($1 --version 2>&1 | head -1)"
  fi
}

check_command node
check_command npm
check_command java
check_command mvn
check_command docker

# Check Docker is running
if ! docker info &> /dev/null; then
  echo "❌ Docker is not running. Please start Docker Desktop."
  exit 1
fi
echo "✅ Docker is running"

# ── FRONTEND SETUP ────────────────────────────────────────────────────────
echo ""
echo "📦 Installing Angular dependencies..."
cd frontend
npm install --legacy-peer-deps
echo "✅ Angular dependencies installed"
cd ..

# ── BUILD BACKEND SERVICES ───────────────────────────────────────────────
echo ""
echo "☕ Building Java microservices..."
echo "   (This takes 2-3 minutes on first run — Maven downloads dependencies)"

for service in auth-service api-gateway market-service order-service portfolio-service websocket-gateway; do
  if [ -f "backend/$service/pom.xml" ]; then
    echo "   Building $service..."
    cd backend/$service
    mvn clean package -DskipTests -q
    # WHY -q (quiet)? Maven is very verbose. -q shows only errors.
    # Remove -q if you want to see the build output for learning.
    echo "   ✅ $service built"
    cd ../..
  fi
done

# ── START INFRASTRUCTURE ─────────────────────────────────────────────────
echo ""
echo "🐳 Starting Docker services..."
echo "   PostgreSQL, Redis, Kafka, Eureka..."
docker-compose up -d postgres redis kafka eureka-server
# WHY -d (detached)? Run in background so terminal stays free.

echo "   Waiting for services to be healthy..."
sleep 15
# WHY sleep? Services need time to start. Kafka takes ~10 seconds.
# In production CI/CD, use health checks instead of sleep.

# ── VERIFY EVERYTHING ────────────────────────────────────────────────────
echo ""
echo "🔍 Verifying services..."

check_service() {
  if curl -s "http://localhost:$1$2" > /dev/null 2>&1; then
    echo "✅ $3 is running on port $1"
  else
    echo "⚠️  $3 may still be starting (port $1)"
  fi
}

check_service 5432 "" "PostgreSQL"
check_service 6379 "" "Redis"
check_service 8761 "/actuator/health" "Eureka Server"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                                       ║"
echo "║                                                           ║"
echo "║  Next steps:                                              ║"
echo "║  1. Start Spring Boot services in IntelliJ               ║"
echo "║     (Run each service from the backend/ folder)          ║"
echo "║                                                           ║"
echo "║  2. Start Angular:                                        ║"
echo "║     cd frontend && ng serve                               ║"
echo "║                                                           ║"
echo "║  3. Open browser:                                         ║"
echo "║     http://localhost:4200                                 ║"
echo "║                                                           ║"
echo "║  Test credentials:                                        ║"
echo "║  Email:    trader@tradeforge.com                          ║"
echo "║  Password: Test@1234                                      ║"
echo "║                                                           ║"
echo "║  OR run everything in Docker:                             ║"
echo "║     docker-compose up                                     ║"
echo "║     http://localhost:4200                                 ║"
echo "╚══════════════════════════════════════════════════════════╝"
