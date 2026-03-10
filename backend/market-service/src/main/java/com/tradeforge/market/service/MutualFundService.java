package com.tradeforge.market.service;

import com.tradeforge.market.dto.CandleDto;
import com.tradeforge.market.dto.MutualFundDto;
import com.tradeforge.market.dto.MutualFundDto.FundHoldingDto;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

/**
 * WHY MutualFundService?
 * Provides mutual fund data for the MF Screener page.
 * Uses realistic mock data for 12 popular Indian mutual funds — actual NAV values,
 * historical returns, AUM, and top holdings are modelled on real fund data.
 *
 * WHY 12 funds? Covers the major categories:
 * - Equity: Large Cap, Mid Cap, Small Cap, Flexi Cap
 * - Debt: Low Duration
 * - Hybrid: Balanced Advantage
 * - Index: Nifty 50
 * Gives enough variety for a meaningful screener experience.
 */
@Service
public class MutualFundService {

    private final Map<String, MutualFundDto> funds = new LinkedHashMap<>();
    private final Random random = new Random(42); // WHY seed 42? Deterministic — same data on every startup.

    public MutualFundService() {
        initFunds();
    }

    public List<MutualFundDto> searchFunds(String query, String category) {
        String q = query == null ? "" : query.toLowerCase();
        String cat = category == null ? "" : category.toUpperCase();

        return funds.values().stream()
                .filter(f -> q.isEmpty() ||
                        f.name().toLowerCase().contains(q) ||
                        f.amcName().toLowerCase().contains(q) ||
                        f.subCategory().toLowerCase().contains(q))
                .filter(f -> cat.isEmpty() || cat.equals("ALL") || f.category().equalsIgnoreCase(cat))
                .sorted(Comparator.comparingDouble(MutualFundDto::returns1Y).reversed())
                .collect(Collectors.toList());
    }

    public Optional<MutualFundDto> getFund(String code) {
        return Optional.ofNullable(funds.get(code.toUpperCase()));
    }

    /**
     * Generates NAV history for chart display.
     * Uses the fund's 1Y/3Y/5Y returns to reverse-engineer a realistic NAV curve.
     * The curve ends at the current NAV and walks backward using the return rates.
     */
    public List<CandleDto> getNavHistory(String code, String period) {
        MutualFundDto fund = funds.get(code.toUpperCase());
        if (fund == null) return List.of();

        int days = switch (period.toUpperCase()) {
            case "1Y" -> 365;
            case "3Y" -> 365 * 3;
            case "5Y" -> 365 * 5;
            default -> 365;
        };

        double annualReturn = switch (period.toUpperCase()) {
            case "1Y" -> fund.returns1Y() / 100;
            case "3Y" -> fund.returns3Y() / 100;
            case "5Y" -> fund.returns5Y() / 100;
            default -> fund.returns1Y() / 100;
        };

        // MF NAV volatility (lower than stocks — diversification effect)
        double sigma = switch (fund.riskLevel()) {
            case "LOW" -> 0.003;
            case "MODERATE" -> 0.006;
            case "MODERATELY_HIGH" -> 0.009;
            case "HIGH" -> 0.012;
            case "VERY_HIGH" -> 0.015;
            default -> 0.007;
        };

        // Reverse-calculate start NAV from current NAV and annual return
        double dailyReturn = Math.pow(1 + annualReturn, 1.0 / 365) - 1;
        double startNav = fund.nav() / Math.pow(1 + annualReturn, (double) days / 365);

        // Walk forward with drift matching the target return
        double[] navValues = new double[days + 1];
        navValues[0] = startNav;
        for (int i = 1; i <= days; i++) {
            navValues[i] = navValues[i - 1] * (1 + dailyReturn + random.nextGaussian() * sigma);
        }

        // Scale so last value matches current NAV exactly
        double scale = fund.nav() / navValues[days];
        for (int i = 0; i <= days; i++) navValues[i] *= scale;

        // Build candle list (MF uses daily area/line chart, not candlestick)
        // We set open=high=low=close=nav for line chart compatibility
        List<CandleDto> candles = new ArrayList<>(days);
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

        for (int i = 0; i < days; i++) {
            LocalDate date = today.minusDays(days - i);
            if (date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY) continue;

            double nav = Math.round(navValues[i + 1] * 100.0) / 100.0;
            long epochSec = date.atStartOfDay(ZoneOffset.UTC).toEpochSecond();
            candles.add(new CandleDto(epochSec, nav, nav, nav, nav, 0));
        }
        return candles;
    }

    private void initFunds() {
        funds.put("MIRAE-LARGE-CAP", new MutualFundDto(
                "MIRAE-LARGE-CAP", "Mirae Asset Large Cap Fund", "EQUITY", "Large Cap",
                "Neelesh Surana", "Mirae Asset",
                124.50, "2026-03-04", 42000, "₹42,000 Cr", 0.51,
                32.4, 18.2, 15.8, "MODERATELY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 8.2),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 7.8),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 6.5),
                        new FundHoldingDto("INFY", "Infosys", 5.9),
                        new FundHoldingDto("TCS", "TCS", 5.1)
                ),
                "NIFTY 100", 28.4
        ));

        funds.put("AXIS-BLUECHIP", new MutualFundDto(
                "AXIS-BLUECHIP", "Axis Bluechip Fund", "EQUITY", "Large Cap",
                "Shreyash Devalkar", "Axis Mutual Fund",
                58.32, "2026-03-04", 34000, "₹34,000 Cr", 0.55,
                28.1, 16.4, 14.2, "MODERATELY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("TCS", "TCS", 9.1),
                        new FundHoldingDto("INFY", "Infosys", 8.4),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 7.2),
                        new FundHoldingDto("BAJFINANCE", "Bajaj Finance", 6.8),
                        new FundHoldingDto("TITAN", "Titan Company", 5.5)
                ),
                "NIFTY 100", 28.4
        ));

        funds.put("HDFC-MIDCAP", new MutualFundDto(
                "HDFC-MIDCAP", "HDFC Mid-Cap Opportunities Fund", "EQUITY", "Mid Cap",
                "Chirag Setalvad", "HDFC Mutual Fund",
                148.75, "2026-03-04", 68000, "₹68,000 Cr", 0.72,
                45.2, 24.8, 21.5, "HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("LTIM", "LTIMindtree", 4.2),
                        new FundHoldingDto("AXISBANK", "Axis Bank", 3.8),
                        new FundHoldingDto("WIPRO", "Wipro", 3.5),
                        new FundHoldingDto("MARUTI", "Maruti Suzuki", 3.2),
                        new FundHoldingDto("SUNPHARMA", "Sun Pharma", 3.0)
                ),
                "NIFTY MIDCAP 150", 38.9
        ));

        funds.put("SBI-SMALL-CAP", new MutualFundDto(
                "SBI-SMALL-CAP", "SBI Small Cap Fund", "EQUITY", "Small Cap",
                "R. Srinivasan", "SBI Mutual Fund",
                192.48, "2026-03-04", 28000, "₹28,000 Cr", 0.64,
                38.5, 28.4, 24.2, "VERY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("HINDUNILVR", "HUL", 3.5),
                        new FundHoldingDto("TITAN", "Titan", 3.1),
                        new FundHoldingDto("SBIN", "SBI", 2.8),
                        new FundHoldingDto("WIPRO", "Wipro", 2.6),
                        new FundHoldingDto("KOTAKBANK", "Kotak Bank", 2.4)
                ),
                "NIFTY SMALLCAP 250", 32.1
        ));

        funds.put("PPFAS-FLEXI-CAP", new MutualFundDto(
                "PPFAS-FLEXI-CAP", "Parag Parikh Flexi Cap Fund", "EQUITY", "Flexi Cap",
                "Rajeev Thakkar", "PPFAS Mutual Fund",
                76.84, "2026-03-04", 58000, "₹58,000 Cr", 0.58,
                35.2, 22.1, 19.8, "MODERATELY_HIGH",
                1000, 5000,
                List.of(
                        new FundHoldingDto("BAJFINANCE", "Bajaj Finance", 7.1),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 6.5),
                        new FundHoldingDto("MARUTI", "Maruti Suzuki", 5.8),
                        new FundHoldingDto("LTIM", "LTIMindtree", 5.2),
                        new FundHoldingDto("AXISBANK", "Axis Bank", 4.9)
                ),
                "NIFTY 500", 29.8
        ));

        funds.put("UTI-NIFTY-50", new MutualFundDto(
                "UTI-NIFTY-50", "UTI Nifty 50 Index Fund", "INDEX", "Large Cap Index",
                "Sharwan Kumar Goyal", "UTI Mutual Fund",
                142.35, "2026-03-04", 18000, "₹18,000 Cr", 0.18,
                26.8, 15.2, 13.8, "MODERATELY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 10.1),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 13.2),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 7.8),
                        new FundHoldingDto("TCS", "TCS", 6.9),
                        new FundHoldingDto("INFY", "Infosys", 5.4)
                ),
                "NIFTY 50", 26.8
        ));

        funds.put("ICICI-BAF", new MutualFundDto(
                "ICICI-BAF", "ICICI Pru Balanced Advantage Fund", "HYBRID", "Balanced Advantage",
                "Sankaran Naren", "ICICI Prudential",
                68.92, "2026-03-04", 52000, "₹52,000 Cr", 0.78,
                18.4, 13.2, 12.5, "MODERATE",
                500, 5000,
                List.of(
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 5.8),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 5.2),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 4.8),
                        new FundHoldingDto("INFY", "Infosys", 4.1),
                        new FundHoldingDto("TCS", "TCS", 3.8)
                ),
                "NIFTY 50 Hybrid Composite 65:35", 16.2
        ));

        funds.put("KOTAK-EMERGING", new MutualFundDto(
                "KOTAK-EMERGING", "Kotak Emerging Equity Fund", "EQUITY", "Mid Cap",
                "Pankaj Tibrewal", "Kotak Mahindra",
                116.42, "2026-03-04", 38000, "₹38,000 Cr", 0.44,
                42.1, 23.5, 19.8, "HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("LTIM", "LTIMindtree", 4.8),
                        new FundHoldingDto("WIPRO", "Wipro", 4.2),
                        new FundHoldingDto("TITAN", "Titan", 3.9),
                        new FundHoldingDto("AXISBANK", "Axis Bank", 3.6),
                        new FundHoldingDto("SUNPHARMA", "Sun Pharma", 3.2)
                ),
                "NIFTY MIDCAP 150", 38.9
        ));

        funds.put("DSP-MIDCAP", new MutualFundDto(
                "DSP-MIDCAP", "DSP Midcap Fund", "EQUITY", "Mid Cap",
                "Vinit Sambre", "DSP Mutual Fund",
                112.84, "2026-03-04", 22000, "₹22,000 Cr", 0.58,
                38.8, 21.4, 18.4, "HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("MARUTI", "Maruti Suzuki", 4.5),
                        new FundHoldingDto("BAJFINANCE", "Bajaj Finance", 4.1),
                        new FundHoldingDto("KOTAKBANK", "Kotak Bank", 3.8),
                        new FundHoldingDto("LTIM", "LTIMindtree", 3.5),
                        new FundHoldingDto("AXISBANK", "Axis Bank", 3.2)
                ),
                "NIFTY MIDCAP 150", 38.9
        ));

        funds.put("NIPPON-SMALL", new MutualFundDto(
                "NIPPON-SMALL", "Nippon India Small Cap Fund", "EQUITY", "Small Cap",
                "Samir Rachh", "Nippon India",
                162.35, "2026-03-04", 48000, "₹48,000 Cr", 0.68,
                48.2, 31.2, 26.8, "VERY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("SBIN", "SBI", 3.2),
                        new FundHoldingDto("HINDUNILVR", "HUL", 2.9),
                        new FundHoldingDto("WIPRO", "Wipro", 2.7),
                        new FundHoldingDto("SUNPHARMA", "Sun Pharma", 2.5),
                        new FundHoldingDto("TITAN", "Titan", 2.3)
                ),
                "NIFTY SMALLCAP 250", 32.1
        ));

        funds.put("QUANT-ACTIVE", new MutualFundDto(
                "QUANT-ACTIVE", "Quant Active Fund", "EQUITY", "Multi Cap",
                "Ankit Pande", "Quant Mutual Fund",
                584.72, "2026-03-04", 8200, "₹8,200 Cr", 0.58,
                52.4, 35.8, 32.1, "VERY_HIGH",
                1000, 5000,
                List.of(
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 8.9),
                        new FundHoldingDto("SBIN", "SBI", 8.2),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 7.8),
                        new FundHoldingDto("BAJFINANCE", "Bajaj Finance", 7.1),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 6.5)
                ),
                "NIFTY 500", 29.8
        ));

        funds.put("CANARA-HYBRID", new MutualFundDto(
                "CANARA-HYBRID", "Canara Robeco Equity Hybrid Fund", "HYBRID", "Aggressive Hybrid",
                "Shridatta Bhandwaldar", "Canara Robeco",
                312.48, "2026-03-04", 9800, "₹9,800 Cr", 0.52,
                22.1, 15.8, 14.2, "MODERATELY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 6.8),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 5.9),
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 5.4),
                        new FundHoldingDto("TCS", "TCS", 4.8),
                        new FundHoldingDto("INFY", "Infosys", 4.2)
                ),
                "NIFTY 50 Hybrid Composite 65:35", 16.2
        ));

        // ── ELSS (Tax Saving) ────────────────────────────────────────────────
        funds.put("AXIS-ELSS", new MutualFundDto(
                "AXIS-ELSS", "Axis ELSS Tax Saver Fund", "ELSS", "ELSS",
                "Shreyash Devalkar", "Axis Mutual Fund",
                84.42, "2026-03-04", 36000, "₹36,000 Cr", 0.53,
                29.4, 17.8, 15.2, "HIGH",
                500, 500,
                List.of(
                        new FundHoldingDto("TCS", "TCS", 8.8),
                        new FundHoldingDto("INFY", "Infosys", 7.9),
                        new FundHoldingDto("BAJFINANCE", "Bajaj Finance", 6.4),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 5.8),
                        new FundHoldingDto("TITAN", "Titan", 5.1)
                ),
                "NIFTY 500", 26.4
        ));

        funds.put("MIRAE-ELSS", new MutualFundDto(
                "MIRAE-ELSS", "Mirae Asset ELSS Tax Saver Fund", "ELSS", "ELSS",
                "Neelesh Surana", "Mirae Asset",
                38.56, "2026-03-04", 14800, "₹14,800 Cr", 0.47,
                32.1, 19.2, 16.8, "HIGH",
                500, 500,
                List.of(
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 9.2),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 8.4),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 7.1),
                        new FundHoldingDto("INFY", "Infosys", 5.8),
                        new FundHoldingDto("TCS", "TCS", 4.9)
                ),
                "NIFTY 500", 26.4
        ));

        funds.put("DSP-TAXSAVER", new MutualFundDto(
                "DSP-TAXSAVER", "DSP Tax Saver Fund", "ELSS", "ELSS",
                "Rohit Singhania", "DSP Mutual Fund",
                112.84, "2026-03-04", 11200, "₹11,200 Cr", 0.74,
                35.8, 20.4, 17.2, "HIGH",
                500, 500,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 7.2),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 6.5),
                        new FundHoldingDto("MARUTI", "Maruti Suzuki", 5.8),
                        new FundHoldingDto("TATAMOTORS", "Tata Motors", 5.2),
                        new FundHoldingDto("SBIN", "SBI", 4.8)
                ),
                "NIFTY 500", 26.4
        ));

        // ── Debt ─────────────────────────────────────────────────────────────
        funds.put("HDFC-SHORT-DEBT", new MutualFundDto(
                "HDFC-SHORT-DEBT", "HDFC Short Term Debt Fund", "DEBT", "Short Duration",
                "Anil Bamboli", "HDFC Mutual Fund",
                28.84, "2026-03-04", 14200, "₹14,200 Cr", 0.18,
                7.2, 6.8, 7.1, "LOW",
                5000, 10000,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank Bonds", 8.4),
                        new FundHoldingDto("RELIANCE", "Reliance Bonds", 6.2),
                        new FundHoldingDto("NTPC", "NTPC Bonds", 5.8),
                        new FundHoldingDto("POWERGRID", "Power Grid Bonds", 5.4),
                        new FundHoldingDto("SBIN", "SBI Bonds", 5.1)
                ),
                "NIFTY Short Duration Debt Index", 7.1
        ));

        funds.put("ICICI-CORP-BOND", new MutualFundDto(
                "ICICI-CORP-BOND", "ICICI Pru Corporate Bond Fund", "DEBT", "Corporate Bond",
                "Manish Banthia", "ICICI Prudential",
                26.92, "2026-03-04", 22400, "₹22,400 Cr", 0.35,
                7.8, 7.4, 7.6, "LOW",
                5000, 10000,
                List.of(
                        new FundHoldingDto("ICICIBANK", "ICICI Bank Bonds", 9.2),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank Bonds", 7.8),
                        new FundHoldingDto("COALINDIA", "Coal India Bonds", 6.4),
                        new FundHoldingDto("NTPC", "NTPC Bonds", 5.9),
                        new FundHoldingDto("BAJFINANCE", "Bajaj Finance Bonds", 5.4)
                ),
                "NIFTY Corporate Bond Index", 7.6
        ));

        funds.put("ABSL-LOW-DURATION", new MutualFundDto(
                "ABSL-LOW-DURATION", "Aditya Birla Low Duration Fund", "DEBT", "Low Duration",
                "Kaustubh Gupta", "Aditya Birla Sun Life",
                614.28, "2026-03-04", 8800, "₹8,800 Cr", 0.38,
                6.8, 6.5, 6.9, "LOW",
                1000, 5000,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank CPs", 8.8),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank CPs", 7.2),
                        new FundHoldingDto("KOTAKBANK", "Kotak Bank CPs", 6.4),
                        new FundHoldingDto("BAJFINANCE", "Bajaj Finance NCDs", 5.8),
                        new FundHoldingDto("SBIN", "SBI CDs", 5.2)
                ),
                "NIFTY Low Duration Debt Index", 6.8
        ));

        // ── Index / ETF ───────────────────────────────────────────────────────
        funds.put("NIPPON-NIFTY50-ETF", new MutualFundDto(
                "NIPPON-NIFTY50-ETF", "Nippon India ETF Nifty 50 BeES", "INDEX", "ETF",
                "Mehul Dama", "Nippon India",
                248.72, "2026-03-04", 21000, "₹21,000 Cr", 0.04,
                24.8, 13.8, 12.4, "MODERATELY_HIGH",
                0, 0,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 13.2),
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 10.1),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 7.8),
                        new FundHoldingDto("TCS", "TCS", 6.9),
                        new FundHoldingDto("INFY", "Infosys", 5.4)
                ),
                "NIFTY 50", 24.8
        ));

        funds.put("HDFC-INDEX-NIFTY", new MutualFundDto(
                "HDFC-INDEX-NIFTY", "HDFC Index Fund Nifty 50 Plan", "INDEX", "Large Cap Index",
                "Krishan Daga", "HDFC Mutual Fund",
                182.48, "2026-03-04", 9200, "₹9,200 Cr", 0.20,
                24.8, 13.8, 12.4, "MODERATELY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 13.2),
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 10.1),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 7.8),
                        new FundHoldingDto("TCS", "TCS", 6.9),
                        new FundHoldingDto("INFY", "Infosys", 5.4)
                ),
                "NIFTY 50", 24.8
        ));

        funds.put("UTI-NIFTY-NEXT50", new MutualFundDto(
                "UTI-NIFTY-NEXT50", "UTI Nifty Next 50 Index Fund", "INDEX", "Mid Cap Index",
                "Sharwan Kumar Goyal", "UTI Mutual Fund",
                78.42, "2026-03-04", 4800, "₹4,800 Cr", 0.32,
                38.4, 18.8, 15.2, "HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("BAJFINANCE", "Bajaj Finance", 4.8),
                        new FundHoldingDto("TATAMOTORS", "Tata Motors", 4.2),
                        new FundHoldingDto("HCLTECH", "HCL Technologies", 3.9),
                        new FundHoldingDto("ASIANPAINT", "Asian Paints", 3.6),
                        new FundHoldingDto("TITAN", "Titan Company", 3.4)
                ),
                "NIFTY NEXT 50", 36.8
        ));

        // ── Hybrid (additional) ───────────────────────────────────────────────
        funds.put("HDFC-BAF", new MutualFundDto(
                "HDFC-BAF", "HDFC Balanced Advantage Fund", "HYBRID", "Balanced Advantage",
                "Gopal Agarwal", "HDFC Mutual Fund",
                428.84, "2026-03-04", 88000, "₹88,000 Cr", 0.74,
                21.8, 14.4, 13.2, "MODERATE",
                500, 5000,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 8.2),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 6.8),
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 5.9),
                        new FundHoldingDto("INFY", "Infosys", 5.2),
                        new FundHoldingDto("TCS", "TCS", 4.8)
                ),
                "NIFTY 50 Hybrid Composite 65:35", 18.4
        ));

        // ══════════════════════════════════════════════════════════════════════
        // EQUITY — Small Cap & Flexi Cap
        // ══════════════════════════════════════════════════════════════════════
        funds.put("SBI-SMALLCAP", new MutualFundDto(
                "SBI-SMALLCAP", "SBI Small Cap Fund", "EQUITY", "Small Cap",
                "R. Srinivasan", "SBI Mutual Fund",
                164.28, "2026-03-04", 31200, "₹31,200 Cr", 0.68,
                38.6, 28.4, 24.8, "VERY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("PERSISTENT", "Persistent Systems", 4.8),
                        new FundHoldingDto("COFORGE", "Coforge", 4.2),
                        new FundHoldingDto("CHOLAFIN", "Cholamandalam Finance", 3.9),
                        new FundHoldingDto("VOLTAS", "Voltas", 3.6),
                        new FundHoldingDto("EICHERMOT", "Eicher Motors", 3.2)
                ),
                "BSE 250 SmallCap Index", 22.4
        ));

        funds.put("PPFAS-FLEXI", new MutualFundDto(
                "PPFAS-FLEXI", "Parag Parikh Flexi Cap Fund", "EQUITY", "Flexi Cap",
                "Rajeev Thakkar", "PPFAS Mutual Fund",
                82.14, "2026-03-04", 78400, "₹78,400 Cr", 0.58,
                34.2, 22.8, 20.6, "MODERATELY_HIGH",
                1000, 5000,
                List.of(
                        new FundHoldingDto("BAJFINANCE", "Bajaj Finance", 7.4),
                        new FundHoldingDto("COALINDIA", "Coal India", 5.8),
                        new FundHoldingDto("INFY", "Infosys", 5.4),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 4.9),
                        new FundHoldingDto("ITC", "ITC", 4.2)
                ),
                "NIFTY 500", 18.6
        ));

        funds.put("QUANT-ACTIVE", new MutualFundDto(
                "QUANT-ACTIVE", "Quant Active Fund", "EQUITY", "Multi Cap",
                "Ankit Pande", "Quant Mutual Fund",
                624.58, "2026-03-04", 12800, "₹12,800 Cr", 0.58,
                42.8, 30.6, 28.4, "VERY_HIGH",
                1000, 5000,
                List.of(
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 9.2),
                        new FundHoldingDto("JSWSTEEL", "JSW Steel", 6.8),
                        new FundHoldingDto("VEDL", "Vedanta", 5.6),
                        new FundHoldingDto("SAIL", "SAIL", 4.8),
                        new FundHoldingDto("TATAMOTORS", "Tata Motors", 4.4)
                ),
                "NIFTY 500", 24.8
        ));

        funds.put("NIPPON-FLEXI", new MutualFundDto(
                "NIPPON-FLEXI", "Nippon India Flexi Cap Fund", "EQUITY", "Flexi Cap",
                "Manish Gunwani", "Nippon India Mutual Fund",
                18.42, "2026-03-04", 18600, "₹18,600 Cr", 0.82,
                28.6, 18.4, 16.2, "MODERATELY_HIGH",
                100, 5000,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 8.4),
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 7.2),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 6.8),
                        new FundHoldingDto("INFY", "Infosys", 5.4),
                        new FundHoldingDto("MM", "Mahindra & Mahindra", 4.2)
                ),
                "NIFTY 500", 16.8
        ));

        funds.put("DSP-MIDCAP", new MutualFundDto(
                "DSP-MIDCAP", "DSP Midcap Fund", "EQUITY", "Mid Cap",
                "Vinit Sambre", "DSP Mutual Fund",
                124.68, "2026-03-04", 22400, "₹22,400 Cr", 0.74,
                36.4, 24.2, 21.8, "HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("CHOLAFIN", "Cholamandalam Finance", 5.8),
                        new FundHoldingDto("PERSISTENT", "Persistent Systems", 5.2),
                        new FundHoldingDto("HAVELLS", "Havells India", 4.8),
                        new FundHoldingDto("VOLTAS", "Voltas", 4.4),
                        new FundHoldingDto("DIVISLAB", "Divi's Labs", 4.0)
                ),
                "NIFTY Midcap 150", 21.2
        ));

        // ══════════════════════════════════════════════════════════════════════
        // DEBT — Liquid, Short Duration, Corporate Bond, Dynamic Bond
        // ══════════════════════════════════════════════════════════════════════
        funds.put("SBI-LIQUID", new MutualFundDto(
                "SBI-LIQUID", "SBI Liquid Fund", "DEBT", "Liquid",
                "Rahul Ghosh", "SBI Mutual Fund",
                3848.24, "2026-03-04", 68400, "₹68,400 Cr", 0.20,
                7.2, 6.4, 5.8, "LOW",
                500, 5000,
                List.of(
                        new FundHoldingDto("T-BILL", "91-Day T-Bill", 18.4),
                        new FundHoldingDto("CD", "Bank CDs", 22.8),
                        new FundHoldingDto("CP", "Commercial Paper", 34.6),
                        new FundHoldingDto("CBLO", "Tri-party Repo", 18.2),
                        new FundHoldingDto("SDL", "State Dev Loans", 6.0)
                ),
                "NIFTY Liquid Index", 7.0
        ));

        funds.put("KOTAK-CORP-BOND", new MutualFundDto(
                "KOTAK-CORP-BOND", "Kotak Corporate Bond Fund", "DEBT", "Corporate Bond",
                "Deepak Agrawal", "Kotak Mutual Fund",
                3248.84, "2026-03-04", 14800, "₹14,800 Cr", 0.39,
                7.8, 6.8, 7.2, "MODERATE",
                5000, 5000,
                List.of(
                        new FundHoldingDto("PSU-BOND", "PSU Bonds AAA", 42.4),
                        new FundHoldingDto("CORP-AAA", "Corporate AAA", 38.2),
                        new FundHoldingDto("SDL", "State Dev Loans", 12.8),
                        new FundHoldingDto("GSEC", "G-Sec", 4.8),
                        new FundHoldingDto("CP", "Commercial Paper", 1.8)
                ),
                "NIFTY Corporate Bond Index", 7.4
        ));

        funds.put("FRANKLIN-ST", new MutualFundDto(
                "FRANKLIN-ST", "Franklin India Short Term Income Plan", "DEBT", "Short Duration",
                "Sachin Padwal-Desai", "Franklin Templeton",
                5148.42, "2026-03-04", 4200, "₹4,200 Cr", 0.84,
                7.4, 6.6, 7.8, "MODERATE",
                5000, 25000,
                List.of(
                        new FundHoldingDto("AA-BOND", "AA Rated Bonds", 48.6),
                        new FundHoldingDto("AAA-BOND", "AAA Rated Bonds", 32.4),
                        new FundHoldingDto("SDL", "State Dev Loans", 12.4),
                        new FundHoldingDto("CP", "Commercial Paper", 4.8),
                        new FundHoldingDto("CASH", "CBLO/Repo", 1.8)
                ),
                "CRISIL Short Term Bond Index", 7.0
        ));

        funds.put("ABSL-DYNAMIC", new MutualFundDto(
                "ABSL-DYNAMIC", "Aditya BSL Dynamic Bond Fund", "DEBT", "Dynamic Bond",
                "Maneesh Dangi", "Aditya Birla Sun Life",
                42.84, "2026-03-04", 6800, "₹6,800 Cr", 0.68,
                8.2, 7.4, 7.8, "MODERATELY_HIGH",
                1000, 5000,
                List.of(
                        new FundHoldingDto("GSEC", "Government Securities", 58.4),
                        new FundHoldingDto("SDL", "State Dev Loans", 24.8),
                        new FundHoldingDto("AAA-BOND", "AAA Bonds", 12.4),
                        new FundHoldingDto("REPO", "Repo & Reverse Repo", 2.8),
                        new FundHoldingDto("CP", "Commercial Paper", 1.6)
                ),
                "CRISIL Dynamic Bond Index", 8.0
        ));

        // ══════════════════════════════════════════════════════════════════════
        // HYBRID — Aggressive, Conservative, Equity Savings
        // ══════════════════════════════════════════════════════════════════════
        funds.put("SBI-EQ-HYBRID", new MutualFundDto(
                "SBI-EQ-HYBRID", "SBI Equity Hybrid Fund", "HYBRID", "Aggressive Hybrid",
                "R. Srinivasan", "SBI Mutual Fund",
                248.64, "2026-03-04", 68400, "₹68,400 Cr", 0.76,
                24.8, 16.2, 14.8, "MODERATELY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 7.8),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 6.4),
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 5.8),
                        new FundHoldingDto("GSEC", "Government Securities", 18.4),
                        new FundHoldingDto("TCS", "TCS", 4.2)
                ),
                "NIFTY 50 Hybrid Composite 65:35", 18.4
        ));

        funds.put("CANROB-EQ-HYBRID", new MutualFundDto(
                "CANROB-EQ-HYBRID", "Canara Robeco Equity Hybrid Fund", "HYBRID", "Aggressive Hybrid",
                "Vishal Mishra", "Canara Robeco",
                314.28, "2026-03-04", 12400, "₹12,400 Cr", 0.58,
                26.4, 17.8, 15.6, "MODERATELY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("INFY", "Infosys", 7.4),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 6.8),
                        new FundHoldingDto("TITAN", "Titan", 5.6),
                        new FundHoldingDto("GSEC", "Government Securities", 22.4),
                        new FundHoldingDto("BAJFINANCE", "Bajaj Finance", 4.8)
                ),
                "NIFTY 50 Hybrid Composite 65:35", 19.2
        ));

        funds.put("UTI-EQ-SAVINGS", new MutualFundDto(
                "UTI-EQ-SAVINGS", "UTI Equity Savings Fund", "HYBRID", "Equity Savings",
                "Sharwan Goyal", "UTI Mutual Fund",
                18.84, "2026-03-04", 8200, "₹8,200 Cr", 0.48,
                14.2, 10.8, 9.4, "LOW",
                500, 5000,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 6.4),
                        new FundHoldingDto("GSEC", "Government Securities", 28.4),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 5.2),
                        new FundHoldingDto("ARBITRAGE", "Arbitrage Positions", 38.4),
                        new FundHoldingDto("CP", "Commercial Paper", 4.8)
                ),
                "NIFTY Equity Savings Index", 12.4
        ));

        // ══════════════════════════════════════════════════════════════════════
        // SOLUTION ORIENTED — Retirement & Children's Funds
        // ══════════════════════════════════════════════════════════════════════
        funds.put("HDFC-RETIRE", new MutualFundDto(
                "HDFC-RETIRE", "HDFC Retirement Savings Fund - Equity", "HYBRID", "Retirement Fund",
                "Shobhit Mehrotra", "HDFC Mutual Fund",
                48.68, "2026-03-04", 5800, "₹5,800 Cr", 0.68,
                28.6, 18.4, 16.2, "MODERATELY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 8.4),
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 7.2),
                        new FundHoldingDto("TCS", "TCS", 6.4),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 5.8),
                        new FundHoldingDto("INFY", "Infosys", 5.2)
                ),
                "NIFTY 50", 22.4
        ));

        funds.put("SBI-RETIRE", new MutualFundDto(
                "SBI-RETIRE", "SBI Retirement Benefits Fund - Aggressive", "HYBRID", "Retirement Fund",
                "R. Srinivasan", "SBI Mutual Fund",
                24.48, "2026-03-04", 3600, "₹3,600 Cr", 0.84,
                24.8, 16.4, 14.2, "MODERATELY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 7.8),
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 6.8),
                        new FundHoldingDto("SBIN", "SBI", 6.4),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 5.6),
                        new FundHoldingDto("GSEC", "Government Securities", 20.4)
                ),
                "NIFTY 500", 18.6
        ));

        funds.put("TATA-RETIRE", new MutualFundDto(
                "TATA-RETIRE", "Tata Retirement Savings Fund - Progressive", "HYBRID", "Retirement Fund",
                "Sonam Udasi", "Tata Mutual Fund",
                62.48, "2026-03-04", 2400, "₹2,400 Cr", 0.84,
                22.4, 14.8, 13.6, "MODERATELY_HIGH",
                150, 5000,
                List.of(
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 7.4),
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 6.8),
                        new FundHoldingDto("TCS", "TCS", 5.8),
                        new FundHoldingDto("TITAN", "Titan", 5.2),
                        new FundHoldingDto("GSEC", "Government Securities", 18.4)
                ),
                "NIFTY 200", 16.8
        ));

        // ══════════════════════════════════════════════════════════════════════
        // FUND OF FUNDS — International & Multi-Asset
        // ══════════════════════════════════════════════════════════════════════
        funds.put("MOTILAL-SP500", new MutualFundDto(
                "MOTILAL-SP500", "Motilal Oswal S&P 500 Index Fund", "EQUITY", "Fund of Funds - Overseas",
                "Swapnil Mayekar", "Motilal Oswal",
                24.84, "2026-03-04", 4800, "₹4,800 Cr", 0.48,
                28.4, 18.6, 16.4, "HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("APPLE", "Apple Inc (via underlying)", 7.4),
                        new FundHoldingDto("MICROSOFT", "Microsoft (via underlying)", 6.8),
                        new FundHoldingDto("AMAZON", "Amazon (via underlying)", 3.8),
                        new FundHoldingDto("NVIDIA", "Nvidia (via underlying)", 3.4),
                        new FundHoldingDto("ALPHABET", "Alphabet (via underlying)", 2.8)
                ),
                "S&P 500 Index", 26.4
        ));

        funds.put("KOTAK-REIT-FOF", new MutualFundDto(
                "KOTAK-REIT-FOF", "Kotak International REIT Fund of Funds", "EQUITY", "Fund of Funds - Overseas",
                "Arjun Khanna", "Kotak Mutual Fund",
                11.84, "2026-03-04", 2200, "₹2,200 Cr", 0.68,
                12.4, 8.6, 7.8, "MODERATELY_HIGH",
                500, 5000,
                List.of(
                        new FundHoldingDto("REIT-GLOBAL", "Global REIT ETFs", 82.4),
                        new FundHoldingDto("LIQUID", "Liquid/Cash", 8.4),
                        new FundHoldingDto("BOND-INT", "International Bonds", 5.6),
                        new FundHoldingDto("HEDGE", "Currency Hedge", 3.6),
                        new FundHoldingDto("CASH", "Cash & Equivalents", 0.0)
                ),
                "FTSE NAREIT All REITs", 8.4
        ));

        // ══════════════════════════════════════════════════════════════════════
        // ETF — Nifty, Sensex, Bank, Pharma, IT
        // ══════════════════════════════════════════════════════════════════════
        funds.put("NIP-ETF-NIFTY50", new MutualFundDto(
                "NIP-ETF-NIFTY50", "Nippon India ETF Nifty 50 BeES", "INDEX", "ETF - Large Cap",
                "Mehul Dama", "Nippon India",
                248.64, "2026-03-04", 24800, "₹24,800 Cr", 0.04,
                22.4, 14.8, 13.2, "MODERATELY_HIGH",
                1, 0,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 13.8),
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 10.4),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 8.4),
                        new FundHoldingDto("INFY", "Infosys", 6.8),
                        new FundHoldingDto("TCS", "TCS", 5.4)
                ),
                "NIFTY 50", 22.4
        ));

        funds.put("SBI-ETF-SENSEX", new MutualFundDto(
                "SBI-ETF-SENSEX", "SBI ETF Sensex", "INDEX", "ETF - Large Cap",
                "Raviprakash Sharma", "SBI Mutual Fund",
                824.28, "2026-03-04", 84000, "₹84,000 Cr", 0.07,
                22.8, 15.2, 13.6, "MODERATELY_HIGH",
                1, 0,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 14.2),
                        new FundHoldingDto("RELIANCE", "Reliance Industries", 11.8),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 8.8),
                        new FundHoldingDto("INFY", "Infosys", 7.2),
                        new FundHoldingDto("TCS", "TCS", 6.4)
                ),
                "S&P BSE SENSEX", 22.8
        ));

        funds.put("KOTAK-NIFTY-BANK", new MutualFundDto(
                "KOTAK-NIFTY-BANK", "Kotak Nifty Bank ETF", "INDEX", "ETF - Sectoral",
                "Devender Singhal", "Kotak Mutual Fund",
                512.48, "2026-03-04", 12400, "₹12,400 Cr", 0.19,
                18.4, 12.8, 11.4, "HIGH",
                1, 0,
                List.of(
                        new FundHoldingDto("HDFCBANK", "HDFC Bank", 28.4),
                        new FundHoldingDto("ICICIBANK", "ICICI Bank", 22.8),
                        new FundHoldingDto("KOTAKBANK", "Kotak Bank", 12.4),
                        new FundHoldingDto("AXISBANK", "Axis Bank", 10.8),
                        new FundHoldingDto("SBIN", "SBI", 8.4)
                ),
                "NIFTY Bank Index", 14.8
        ));
    }
}
