# ===========================================================================
# Auth Service Dockerfile — Multi-Stage Build
#
# WHY multi-stage build?
# Stage 1 (build): needs Maven, JDK 21, all source code — heavy (~600MB)
# Stage 2 (runtime): needs only JRE + the JAR — lean (~180MB)
# Final image is only the runtime stage. Build tools never reach production.
#
# SECURITY: Build tools (Maven, JDK compiler) are ATTACK SURFACE.
# If they're in the production image and the container is compromised,
# attacker can compile and execute arbitrary code.
# Multi-stage removes them from the final image.
# ===========================================================================

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-21-alpine AS build
# WHY eclipse-temurin? Adoptium's OpenJDK — production-grade, free, widely supported.
# WHY alpine? Base image is ~180MB instead of ~500MB for Ubuntu/Debian.
# Fewer packages = smaller attack surface.

WORKDIR /app

# Copy POM first (before source code)
# WHY? Docker layer caching:
# Layer 1: pom.xml changes → REBUILD from here (all dependencies downloaded)
# Layer 2: src/ changes → pom.xml layer is CACHED, only source is rebuilt
# If we copied source first: any code change triggers full dependency download (~2-5 min).
# With this order: code changes only take ~30 seconds (dependencies cached).
COPY pom.xml .
RUN mvn dependency:go-offline -B
# WHY -B? Batch mode — no interactive prompts. Required for Docker builds.
# WHY go-offline? Downloads ALL dependencies into the Maven local cache.
# Subsequent builds use cache even if Maven Central is temporarily unavailable.

COPY src ./src
RUN mvn clean package -DskipTests
# WHY -DskipTests? Tests run in CI/CD pipeline separately.
# Running tests in Docker build:
# - Requires PostgreSQL/Redis connections (not available during build)
# - Increases build time by 2-3 minutes
# - Docker build should produce artifact, CI/CD should run tests

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine
# WHY JRE not JDK? JRE = Java Runtime Environment (only runs code).
# JDK = Development Kit (compiles, debugs, profiles).
# Production only needs to RUN the JAR, not compile.
# JRE is ~100MB smaller than JDK.

WORKDIR /app

# Create a non-root user for running the application
# WHY non-root? Security principle of least privilege.
# If container is compromised, attacker gets 'tradeforge' user (limited permissions).
# If running as root: attacker gets root in the container — potentially can escape.
RUN addgroup -S tradeforge && adduser -S tradeforge -G tradeforge

# Copy JAR from build stage — only the artifact, not build tools or source
COPY --from=build /app/target/*.jar app.jar

# Change ownership to our non-root user
RUN chown tradeforge:tradeforge app.jar

# Switch to non-root user
USER tradeforge

# Expose the port auth-service listens on (matches server.port in application.yml)
EXPOSE 8081
# WHY EXPOSE? Documents which port the container listens on.
# Required for docker-compose port mapping and Kubernetes service discovery.

# JVM tuning for containers
# WHY these flags?
# -XX:+UseContainerSupport: JVM reads cgroup limits (CPU/memory) not host resources.
#   Without this: JVM sees all 32GB host RAM, allocates 8GB heap → OOM kill at 512MB limit.
# -XX:MaxRAMPercentage=75.0: Use 75% of container memory for JVM heap.
#   Leave 25% for OS, off-heap memory (NIO buffers, Redis connections), Metaspace.
# -XX:+UseG1GC: G1 Garbage Collector — good balance of throughput and low pause times.
# -Dfile.encoding=UTF-8: Ensure consistent encoding for email addresses, names.
ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-XX:+UseG1GC", \
    "-Dfile.encoding=UTF-8", \
    "-jar", "app.jar"]
