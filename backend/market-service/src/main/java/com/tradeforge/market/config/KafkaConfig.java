package com.tradeforge.market.config;

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
 * WHY a manual KafkaConfig instead of relying on auto-configuration?
 * Spring Boot auto-configures Kafka when spring.kafka.bootstrap-servers
 * is set in application.yml. We could just use that.
 *
 * We define explicit @Bean methods here so each setting has a WHY comment
 * (educational requirement), and so we can add custom serializers or
 * interceptors in future sprints without touching application.yml.
 *
 * WHY @Configuration?
 * Marks this as a source of @Bean definitions.
 * Spring processes it at startup and registers all @Bean methods.
 */
@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers:localhost:9092}")
    private String bootstrapServers;

    /**
     * WHY ProducerFactory<String, String>?
     * Market ticks are key=symbol (String), value=JSON string (String).
     * No Avro/Protobuf needed for a single-team internal system.
     * StringSerializer handles both key and value.
     */
    @Bean
    public ProducerFactory<String, String> producerFactory() {
        Map<String, Object> config = new HashMap<>();
        // WHY BOOTSTRAP_SERVERS_CONFIG?
        // Tells the producer where to find the Kafka cluster.
        // 'localhost:9092' is the default Docker Kafka port.
        config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);

        // WHY StringSerializer for key and value?
        // Our messages are: key = "RELIANCE", value = "{...json...}"
        // No binary serialization needed at this scale.
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);

        // WHY acks = "1"?
        // Leader broker acknowledges the write before responding.
        // Balances durability vs throughput. "all" would be safer (wait for all replicas)
        // but adds latency — acceptable trade-off for live market tick data.
        config.put(ProducerConfig.ACKS_CONFIG, "1");

        return new DefaultKafkaProducerFactory<>(config);
    }

    /**
     * WHY KafkaTemplate?
     * High-level abstraction over the raw Kafka Producer API.
     * kafkaTemplate.send(topic, key, value) handles async sending,
     * retries, and error callbacks. PriceSimulatorService uses this.
     */
    @Bean
    public KafkaTemplate<String, String> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }
}
