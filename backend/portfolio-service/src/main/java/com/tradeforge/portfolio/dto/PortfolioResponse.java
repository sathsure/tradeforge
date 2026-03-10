package com.tradeforge.portfolio.dto;

import java.util.List;

/**
 * WHY a wrapper PortfolioResponse?
 * The GET /api/portfolio endpoint returns both holdings AND summary.
 * A wrapper record bundles them into a single JSON object:
 * { "holdings": [...], "summary": {...} }
 *
 * This matches the Angular portfolio state shape, making NgRx integration clean.
 * Angular destructures: { holdings, summary } = response
 */
public record PortfolioResponse(
        List<HoldingDto> holdings,
        PortfolioSummaryDto summary
) {}
