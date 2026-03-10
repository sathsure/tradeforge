# ===========================================================================
# WebSocket Gateway Dockerfile — Multi-Stage Build
#
# WHY multi-stage build? Stage 1 compiles with Maven (heavy JDK image).
# Stage 2 runs with JRE only — final image is ~200MB instead of ~600MB.
# Build tools (Maven, JDK compiler) never reach production — reduces attack surface.
# ===========================================================================

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-21-alpine AS build
# WHY eclipse-temurin? Adoptium's OpenJDK — production-grade, free, widely supported.
# WHY alpine? Base image is ~180MB instead of ~500MB for Ubuntu/Debian.

WORKDIR /app

# Copy POM first (before source code)
# WHY? Docker layer caching: pom.xml changes → rebuild deps. src/ changes → use cached deps.
# With this order: code changes only take ~30 seconds (dependencies cached).
COPY pom.xml .
RUN mvn dependency:go-offline -B

COPY src ./src
RUN mvn clean package -DskipTests
# WHY -DskipTests? Tests run in CI/CD pipeline separately.
# Docker build should produce artifact; CI/CD should run tests.

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine
# WHY JRE not JDK? JRE only runs code. JDK compiles and debugs.
# Production only needs to RUN the JAR, not compile. JRE is ~100MB smaller.

WORKDIR /app

# WHY non-root user? Security best practice — process runs with minimal privileges.
# If container is compromised, attacker gets 'spring' user (limited permissions), not root.
RUN addgroup -S spring && adduser -S spring -G spring

COPY --from=build /app/target/*.jar app.jar

RUN chown spring:spring app.jar

USER spring:spring

# Expose port websocket-gateway listens on (matches server.port in application.yml)
EXPOSE 8088

# WHY these JVM flags?
# -XX:+UseContainerSupport: JVM reads cgroup limits (CPU/memory) not host resources.
# -XX:MaxRAMPercentage=75.0: Use 75% of container memory for JVM heap.
# -XX:+UseG1GC: G1 Garbage Collector — good balance of throughput and low pause times.
# -Dfile.encoding=UTF-8: Ensure consistent encoding.
ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-XX:+UseG1GC", \
    "-Dfile.encoding=UTF-8", \
    "-jar", "app.jar"]
