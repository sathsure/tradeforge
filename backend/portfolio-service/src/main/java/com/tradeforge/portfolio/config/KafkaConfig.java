package com.tradeforge.portfolio.config;

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
 * WHY KafkaConfig in portfolio-service?
 * portfolio-service is a Kafka CONSUMER — it reads 'order.events' messages
 * published by order-service to update holdings.
 *
 * WHY not use Spring Boot auto-configuration?
 * Auto-configuration works with just application.yml settings.
 * We define explicit beans here so each property has an explanatory WHY comment.
 * In a production service, you'd typically use application.yml only.
 */
@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers:localhost:9092}")
    private String bootstrapServers;

    /**
     * WHY consumer-group-id = "portfolio-service"?
     * Kafka tracks which messages each consumer group has processed.
     * If portfolio-service restarts, it resumes from where it left off.
     * A unique group ID ensures portfolio-service gets ALL order events,
     * not just new ones since the last consumer joined.
     *
     * WHY this matters: If two instances of portfolio-service run (horizontal scaling),
     * they share the group — Kafka splits partitions between them so each event
     * is processed exactly once (not duplicated across instances).
     */
    @Bean
    public ConsumerFactory<String, String> consumerFactory() {
        Map<String, Object> config = new HashMap<>();
        config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        config.put(ConsumerConfig.GROUP_ID_CONFIG, "portfolio-service");

        // WHY EARLIEST?
        // On first startup, start consuming from the beginning of the topic.
        // Ensures no order events are missed if portfolio-service was down when they arrived.
        // Once the offset is committed, EARLIEST has no effect — it only matters for the
        // first time a consumer group reads a topic.
        config.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        return new DefaultKafkaConsumerFactory<>(config);
    }

    /**
     * WHY ConcurrentKafkaListenerContainerFactory?
     * This factory creates the listener container that runs @KafkaListener methods.
     * ConcurrentKafkaListenerContainerFactory supports multiple concurrent consumers
     * (concurrency = N means N threads, each consuming one partition).
     * For Sprint 2, default concurrency (1 thread) is sufficient.
     */
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> kafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory());
        return factory;
    }
}
