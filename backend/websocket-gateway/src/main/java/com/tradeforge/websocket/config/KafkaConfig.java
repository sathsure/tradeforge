package com.tradeforge.websocket.config;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;

import java.util.HashMap;
import java.util.Map;

/**
 * WHY KafkaConfig in websocket-gateway?
 * websocket-gateway is a Kafka CONSUMER — it reads from 'market.ticks' topic
 * and broadcasts each tick to Angular WebSocket subscribers via STOMP.
 *
 * WHY configure manually (not just application.yml)?
 * Both work. Explicit @Bean gives us a place to add WHY comments.
 * In production, application.yml config is simpler and sufficient.
 *
 * WHY concurrency in the container factory?
 * Default is 1 consumer thread. If market.ticks has multiple partitions
 * (e.g., one per stock category), we can set concurrency > 1 to process
 * partitions in parallel. Sprint 2: single partition, concurrency=1 is fine.
 */
@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers:localhost:9092}")
    private String bootstrapServers;

    @Bean
    public ConsumerFactory<String, String> consumerFactory() {
        Map<String, Object> config = new HashMap<>();
        config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        config.put(ConsumerConfig.GROUP_ID_CONFIG, "websocket-gateway");
        // WHY LATEST? Market ticks are real-time — no point processing old ticks from before startup.
        config.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        return new DefaultKafkaConsumerFactory<>(config);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> kafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory());
        return factory;
    }
}
