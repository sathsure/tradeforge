package com.tradeforge.portfolio.repository;

import com.tradeforge.portfolio.entity.CashBalance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * WHY JpaRepository<CashBalance, UUID>?
 * Spring Data JPA auto-generates CRUD methods at runtime:
 * - findById(userId) → Optional<CashBalance>
 * - save(cashBalance) → CashBalance (INSERT or UPDATE)
 * No SQL needed for simple operations — Spring generates the queries.
 *
 * WHY UUID as the ID type?
 * CashBalance.userId is a UUID and also the primary key.
 * JpaRepository's <T, ID> second type param is the PK type.
 */
public interface CashBalanceRepository extends JpaRepository<CashBalance, UUID> {
    // WHY no extra methods?
    // findById(userId) from JpaRepository is all we need.
    // Deposit and withdraw go through PortfolioService which calls findById + save.
}
