# TradeForge 📈
### A Zerodha-like Trading Platform — Built for Learning Full Stack Architecture

> Angular 18 + Java 21 + Spring Boot 3 + Kafka + Redis + PostgreSQL | $0 Hosting

---

## ⚡ Run in 3 Commands

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/tradeforge.git
cd tradeforge

# 2. Setup (installs dependencies, builds services, starts Docker infrastructure)
chmod +x setup.sh && ./setup.sh

# 3. Start Angular
cd frontend && ng serve
```

**Open:** http://localhost:4200
**Login:** trader@tradeforge.com / Test@1234

---

## 🏗️ Project Structure

```
tradeforge/
├── frontend/                    ← Angular 18 SPA
│   ├── src/app/
│   │   ├── core/               ← Guards, Interceptors, Services (app-wide)
│   │   ├── features/           ← Auth, Dashboard, Markets, Orders, Portfolio
│   │   └── shared/             ← Reusable components, models
│   ├── Dockerfile              ← Multi-stage: Node build → Nginx serve
│   └── nginx.conf              ← SPA routing + security headers + gzip
│
├── backend/
│   ├── api-gateway/            ← Spring Cloud Gateway — single entry point :8080
│   ├── auth-service/           ← JWT Auth — login/register/refresh :8081
│   ├── market-service/         ← Finnhub WS → Kafka producer :8083
│   ├── order-service/          ← Place/manage orders :8084
│   ├── portfolio-service/      ← Holdings, P&L :8085
│   └── websocket-gateway/      ← Kafka → WebSocket broadcast :8088
│
├── infrastructure/
│   └── init.sql                ← DB schemas + seed data
│
├── .github/workflows/
│   └── deploy.yml              ← GitHub Actions CI/CD
│
├── docker-compose.yml          ← Full local stack
└── setup.sh                    ← One-command setup
```

---

## 🔧 Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 20 LTS | nodejs.org |
| Angular CLI | 18.x | `npm i -g @angular/cli` |
| JDK | 21 (Temurin) | adoptium.net |
| Maven | 3.9+ | maven.apache.org |
| Docker Desktop | Latest | docker.com |
| IntelliJ IDEA | Community | jetbrains.com |

---

## 🖥️ Local Development

### Option A — Docker Everything (Simplest)
```bash
docker-compose up
# Starts ALL services + frontend at http://localhost:4200
```

### Option B — Hybrid (Recommended for Learning)
```bash
# Terminal 1: Infrastructure
docker-compose up postgres redis kafka eureka-server

# Terminal 2: Angular (hot reload — changes appear instantly)
cd frontend && ng serve

# IntelliJ: Run each service individually
# backend/auth-service → AuthServiceApplication.java → Run
# backend/api-gateway  → ApiGatewayApplication.java  → Run
# backend/market-service → MarketServiceApplication.java → Run
```

### Service URLs
| Service | URL | Purpose |
|---------|-----|---------|
| Angular App | http://localhost:4200 | Frontend |
| API Gateway | http://localhost:8080 | All API traffic |
| Auth Service | http://localhost:8081 | Direct auth testing |
| Market Service | http://localhost:8083 | Market data |
| Eureka Dashboard | http://localhost:8761 | See registered services |
| PostgreSQL | localhost:5432 | Connect via DBeaver/TablePlus |
| Redis | localhost:6379 | Connect via RedisInsight |

---

## 🚀 Free Deployment

### Step 1 — Push to GitHub
```bash
git remote add origin https://github.com/YOUR_USERNAME/tradeforge.git
git push -u origin main
```

### Step 2 — Vercel (Frontend)
1. Go to vercel.com → New Project → Import your GitHub repo
2. Root Directory: `frontend`
3. Build Command: `npm run build`
4. Output Directory: `dist/tradeforge-frontend/browser`
5. Deploy ✅

### Step 3 — Supabase (Database)
1. supabase.com → New Project
2. Copy connection string
3. Add to Render environment variables as `DB_URL`

### Step 4 — Upstash (Redis + Kafka)
1. upstash.com → Create Redis → Copy `REDIS_URL`
2. upstash.com → Create Kafka → Copy `KAFKA_BOOTSTRAP`

### Step 5 — Render (Backend Services)
For EACH microservice:
1. render.com → New Web Service → Connect GitHub
2. Root Directory: `backend/auth-service` (change per service)
3. Environment: Docker
4. Add environment variables from Step 3+4
5. Deploy ✅

### Step 6 — GitHub Secrets (for CI/CD)
Add these in GitHub → Settings → Secrets → Actions:
```
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
DOCKERHUB_USERNAME
DOCKERHUB_TOKEN
RENDER_DEPLOY_HOOK_AUTH
RENDER_DEPLOY_HOOK_MARKET
```

---

## 🔐 Security Features (Learning Focus)

| Feature | Where | What You Learn |
|---------|-------|----------------|
| JWT with HS256 | Auth Service | Stateless auth, token anatomy |
| Refresh token rotation | Auth + Redis | Session management |
| BCrypt password hashing | Auth Service | Why MD5 is dangerous |
| Spring Security filter chain | Auth Service | Request lifecycle |
| CORS whitelist | API Gateway | Cross-origin attack prevention |
| Rate limiting | API Gateway | Brute force prevention |
| HTTPS only in prod | Nginx + env | Transport security |
| UUID primary keys | All services | Enumeration attack prevention |

---

## 📚 Why Each Technology Was Chosen

Every file in this project contains `// WHY` comments explaining architectural decisions.
Read the code + comments together — that's the learning layer built into this project.

Key learning files:
- `backend/auth-service/src/.../SecurityConfig.java` — Spring Security explained
- `backend/auth-service/src/.../JwtAuthenticationFilter.java` — JWT flow
- `frontend/src/app/core/interceptors/auth.interceptor.ts` — Angular JWT handling
- `frontend/src/app/core/services/websocket.service.ts` — Real-time architecture
- `docker-compose.yml` — Why each infrastructure component exists

---

*Built for learning Full Stack Architecture — Angular 18 + Java 21 + Microservices + Security*
