package com.tradeforge.market.dto;

/**
 * WHY CorporateActionDto?
 * Corporate actions are events that alter shares or dividends and affect stock price:
 * - DIVIDEND:  Cash paid to shareholders on ex-date (price drops by dividend amount)
 * - SPLIT:     Shares subdivided — price halves, quantity doubles
 * - BONUS:     Free shares issued from company reserves
 * - BUYBACK:   Company buys back its own shares — reduces float, boosts EPS
 * - RIGHTS:    Existing shareholders offered new shares at a discount
 *
 * WHY exDate vs recordDate?
 * Ex-date: first day stock trades WITHOUT the right to the corporate action.
 * Record date: company registers which holders are entitled.
 * Traders must hold shares BEFORE ex-date to receive dividends/bonuses.
 *
 * WHY status field (PAST or UPCOMING)?
 * Angular can split the list into historical actions and upcoming events
 * without needing a separate API call or additional filtering logic.
 */
public record CorporateActionDto(
        String symbol,
        String type,         // DIVIDEND | SPLIT | BONUS | BUYBACK | RIGHTS
        String exDate,       // Ex-date (ISO: 2024-08-19)
        String recordDate,   // Record date (ISO: 2024-08-20)
        String description,  // Human-readable description
        double value,        // Dividend amount / split ratio / buyback price
        String status        // "PAST" | "UPCOMING"
) {}
