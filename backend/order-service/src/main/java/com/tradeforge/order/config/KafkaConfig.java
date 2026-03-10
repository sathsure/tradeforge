package com.tradeforge.order.config;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

import java.util.HashMap;
import java.util.Map;

/**
 * WHY Kafka in order-service?
 * When an order is COMPLETE, order-service publishes an 'order.completed' event.
 * portfolio-service consumes this event to update the user's holdings.
 *
 * This event-driven approach means:
 * - order-service doesn't need to know portfolio-service exists
 * - portfolio-service doesn't poll order-service for changes
 * - They're independently deployable and scalable
 *
 * WHY not use REST for order → portfolio communication?
 * If portfolio-service is down when an order completes, a REST call would fail
 * and the portfolio would never be updated. Kafka guarantees delivery —
 * portfolio-service will process the event when it recovers.
 */
@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers:localhost:9092}")
    private String bootstrapServers;

    @Bean
    public ProducerFactory<String, String> producerFactory() {
        Map<String, Object> config = new HashMap<>();
        config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        // WHY acks = "all"?
        // For order events, we want confirmation from all in-sync replicas.
        // Losing an order event would cause the portfolio to be wrong — unacceptable.
        // "all" is slower than "1" but provides the strongest durability guarantee.
        config.put(ProducerConfig.ACKS_CONFIG, "all");
        return new DefaultKafkaProducerFactory<>(config);
    }

    @Bean
    public KafkaTemplate<String, String> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }
}
