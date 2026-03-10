package com.tradeforge.portfolio.repository;

import com.tradeforge.portfolio.entity.Holding;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * WHY JpaRepository<Holding, UUID>?
 * Spring Data JPA generates implementations for all these methods at runtime.
 * No SQL boilerplate needed. Works out of the box with our schema.
 */
@Repository
public interface HoldingRepository extends JpaRepository<Holding, UUID> {

    /**
     * WHY findByUserId?
     * Portfolio page shows all holdings for the authenticated user.
     * DB-level filter: more efficient and secure than loading all holdings.
     */
    List<Holding> findByUserId(UUID userId);

    /**
     * WHY findByUserIdAndSymbol?
     * When an order completes (BUY RELIANCE), we need to find the existing
     * RELIANCE holding for that user to update it (or create one if it doesn't exist).
     * The UNIQUE(user_id, symbol) constraint means at most one row exists.
     */
    Optional<Holding> findByUserIdAndSymbol(UUID userId, String symbol);
}
