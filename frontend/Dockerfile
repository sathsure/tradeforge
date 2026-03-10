# WHY multi-stage build?
# Stage 1 (builder): Node.js environment — compiles Angular to static files.
# Stage 2 (runtime): Nginx — serves static files. No Node.js in production image.
# Result: Final image is ~25MB (Nginx) vs ~800MB (Node.js with all dev dependencies).
# Smaller image = faster deployments, less attack surface, lower storage cost.

# ── STAGE 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# WHY copy package.json first, then npm install, then copy source?
# Docker caches layers. If package.json didn't change, npm install layer is cached.
# Only rebuilds npm install if dependencies changed — saves minutes per build.
COPY package*.json ./
RUN npm ci --legacy-peer-deps
# WHY npm ci instead of npm install?
# ci = clean install — removes node_modules first, installs exact versions from package-lock.json
# Reproducible builds — same packages every time. No "it worked yesterday" surprises.

COPY . .
RUN npm run build
# ng build --configuration production
# Output: /app/dist/tradeforge-frontend/browser/ (static HTML/CSS/JS)

# ── STAGE 2: Serve ────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime
# WHY Nginx? Production-grade static file server.
# Handles compression, caching headers, SSL termination.
# Can serve thousands of concurrent users on minimal resources.

# Copy Angular build output into Nginx web root
COPY --from=builder /app/dist/tradeforge-frontend/browser /usr/share/nginx/html

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
# WHY daemon off? Docker containers need a foreground process to stay alive.
# Nginx's daemon mode runs in background — container would immediately exit.
