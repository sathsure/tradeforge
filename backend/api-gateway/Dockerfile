# ===========================================================================
# API Gateway Dockerfile — Multi-Stage Build
# Same pattern as auth-service — see auth-service/Dockerfile for detailed WHY comments.
# ===========================================================================

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-21-alpine AS build

WORKDIR /app

# Copy POM first for Docker layer caching (dependencies cached separately from source)
COPY pom.xml .
RUN mvn dependency:go-offline -B

COPY src ./src
RUN mvn clean package -DskipTests

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Non-root user — security principle of least privilege
RUN addgroup -S tradeforge && adduser -S tradeforge -G tradeforge

COPY --from=build /app/target/*.jar app.jar
RUN chown tradeforge:tradeforge app.jar

USER tradeforge

# API Gateway listens on 8080 (all traffic flows through here)
EXPOSE 8080

# WHY these JVM flags? See auth-service/Dockerfile for full explanation.
# -XX:+UseContainerSupport: respect container memory limits
# -XX:MaxRAMPercentage=75.0: use 75% of container RAM for heap
ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-XX:+UseG1GC", \
    "-Dfile.encoding=UTF-8", \
    "-jar", "app.jar"]
