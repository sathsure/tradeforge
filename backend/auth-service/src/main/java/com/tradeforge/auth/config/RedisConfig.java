package com.tradeforge.auth.config;

import io.lettuce.core.ClientOptions;
import io.lettuce.core.SocketOptions;
import org.springframework.boot.autoconfigure.data.redis.LettuceClientConfigurationBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;

/**
 * WHY RedisConfig?
 * Spring Boot auto-configures Redis connection from application.yml.
 * But the DEFAULT StringRedisTemplate serialization needs explicit configuration
 * for clarity and consistency.
 *
 * ARCHITECTURE DECISION: We use StringRedisTemplate (not RedisTemplate).
 * WHY StringRedisTemplate?
 * We store refresh tokens as plain strings. The key is the email.
 * StringRedisTemplate: stores keys and values as UTF-8 strings — human readable.
 * RedisTemplate<Object, Object>: stores as binary by default — debug with redis-cli is painful.
 * Human-readable Redis keys are critical for debugging:
 *   redis-cli GET "auth:refresh_token:user@example.com" → shows the actual token
 *   With binary serialization: → shows garbled binary data
 *
 * MONITORING: Human-readable keys enable:
 * - Ops team to check Redis state with redis-cli
 * - Security team to audit active sessions: redis-cli KEYS "auth:refresh_token:*"
 * - Debugging: redis-cli TTL "auth:refresh_token:user@example.com"
 *
 * WHY @Configuration?
 * Declares this class as a source of @Bean definitions.
 * Spring registers the returned StringRedisTemplate as a singleton bean.
 */
@Configuration
public class RedisConfig {

    /**
     * Configures StringRedisTemplate with explicit serializers.
     *
     * WHY explicit serializers when StringRedisTemplate defaults to String?
     * Explicit configuration documents intent.
     * If someone changes this to RedisTemplate, the serializer config reminds them
     * to set appropriate serializers.
     *
     * WHY method parameter (RedisConnectionFactory)?
     * Spring injects the auto-configured connection factory.
     * Connection factory is created from application.yml:
     *   spring.data.redis.host, port, password
     * In Docker: REDIS_HOST environment variable overrides localhost.
     */
    /**
     * Sets Lettuce TCP connect timeout to 3 seconds.
     *
     * WHY? spring.data.redis.timeout sets the command/read timeout (how long to wait for
     * a Redis command to complete). It does NOT control the TCP connection timeout.
     * Without this, Lettuce falls back to the OS-level TCP timeout (~2 minutes) when
     * the Redis host is unreachable — causing login to hang silently for 2 minutes
     * before returning an error to the frontend.
     * 3 seconds = fast failure UX without being too aggressive for cloud Redis.
     */
    @Bean
    public LettuceClientConfigurationBuilderCustomizer lettuceConnectTimeout() {
        return builder -> builder.clientOptions(
            ClientOptions.builder()
                .socketOptions(SocketOptions.builder()
                    .connectTimeout(Duration.ofSeconds(3))
                    .build())
                .build()
        );
    }

    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        StringRedisTemplate template = new StringRedisTemplate();
        template.setConnectionFactory(connectionFactory);

        // StringRedisSerializer: serializes/deserializes as plain UTF-8 strings
        // This is already the default for StringRedisTemplate, but being explicit is good.
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new StringRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(new StringRedisSerializer());

        // WHY afterPropertiesSet()?
        // Triggers RedisTemplate initialization after all properties are set.
        // Without this: the first operation on the template might fail.
        template.afterPropertiesSet();

        return template;
    }
}
