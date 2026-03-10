package com.tradeforge.market.service;

import com.tradeforge.market.dto.CorporateActionDto;
import com.tradeforge.market.dto.StockDetailDto;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * WHY StockDetailService?
 * Provides fundamental analysis data and corporate actions for each stock.
 * This data is loaded once at startup and served on demand — it does not change
 * every second like live prices. Separating it from MarketDataService keeps
 * each service focused on one concern (SRP — Single Responsibility Principle).
 *
 * WHY mock/seed data?
 * Real fundamental data requires paid NSE/BSE data feeds or a financial data API
 * (Refinitiv, Bloomberg, Finnhub). For a learning project, realistic mock data
 * is functionally equivalent and avoids external dependencies and rate limits.
 * In production: replace initFundamentals() with a data vendor API call.
 */
@Service
public class StockDetailService {

    private final MarketDataService marketDataService;

    // WHY Map<String, StockDetailDto>? O(1) lookup by symbol.
    private final Map<String, StockDetailDto> fundamentals = new HashMap<>();
    private final Map<String, List<CorporateActionDto>> corporateActions = new HashMap<>();

    public StockDetailService(MarketDataService marketDataService) {
        this.marketDataService = marketDataService;
        initFundamentals();
        initCorporateActions();
    }

    /**
     * Returns stock detail with live price merged in.
     * WHY merge live price? The detail DTO includes price/change/changePercent
     * for the panel header. Fetching from MarketDataService ensures it uses
     * the latest tick price, not the stale seed price from initialization.
     */
    public Optional<StockDetailDto> getDetail(String symbol) {
        StockDetailDto base = fundamentals.get(symbol.toUpperCase());
        if (base == null) return Optional.empty();

        // Merge live price from MarketDataService into the otherwise-static detail DTO
        return marketDataService.getQuote(symbol).map(quote ->
            new StockDetailDto(
                base.symbol(), base.name(), base.sector(), base.industry(),
                base.marketCap(), base.marketCapRaw(),
                base.peRatio(), base.pbRatio(), base.eps(), base.roe(), base.roce(),
                base.debtToEquity(), base.dividendYield(), base.dividendPerShare(),
                base.fiftyTwoWeekHigh(), base.fiftyTwoWeekLow(), base.avgVolume20D(),
                quote.price(), quote.change(), quote.changePercent(),
                base.description(), base.faceValue(), base.isin(), base.exchange()
            )
        );
    }

    public List<StockDetailDto> getAllDetails() {
        return fundamentals.values().stream()
                .map(base -> getDetail(base.symbol()).orElse(base))
                .sorted(Comparator.comparingLong(StockDetailDto::marketCapRaw).reversed())
                .toList();
    }

    /**
     * Screener search: filter by query + sector, sort by metric.
     * WHY sort in service? Keeps the controller thin (no business logic).
     */
    public List<StockDetailDto> search(String query, String sector, String sortBy) {
        String q = query == null ? "" : query.toLowerCase();
        String sec = sector == null ? "" : sector.toLowerCase();

        List<StockDetailDto> result = getAllDetails().stream()
                .filter(d -> q.isEmpty() ||
                        d.symbol().toLowerCase().contains(q) ||
                        d.name().toLowerCase().contains(q) ||
                        d.sector().toLowerCase().contains(q))
                .filter(d -> sec.isEmpty() || sec.equals("all") ||
                        d.sector().toLowerCase().contains(sec))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));

        if (sortBy != null) {
            switch (sortBy) {
                case "pe_asc"    -> result.sort(Comparator.comparingDouble(StockDetailDto::peRatio));
                case "pe_desc"   -> result.sort(Comparator.comparingDouble(StockDetailDto::peRatio).reversed());
                case "mcap"      -> result.sort(Comparator.comparingLong(StockDetailDto::marketCapRaw).reversed());
                case "roe"       -> result.sort(Comparator.comparingDouble(StockDetailDto::roe).reversed());
                case "div_yield" -> result.sort(Comparator.comparingDouble(StockDetailDto::dividendYield).reversed());
                case "change"    -> result.sort(Comparator.comparingDouble(StockDetailDto::changePercent).reversed());
            }
        }
        return result;
    }

    public List<CorporateActionDto> getCorporateActions(String symbol) {
        return corporateActions.getOrDefault(symbol.toUpperCase(), List.of());
    }

    // ─── Data Initialization ─────────────────────────────────────────────────

    private void initFundamentals() {
        // add(symbol, name, sector, industry, mcapFmt, mcapRaw,
        //     pe, pb, eps, roe, roce, dte, divYield, divPerShare,
        //     52wHigh, 52wLow, avgVol, description, faceValue, isin, exchange)
        add("RELIANCE", "Reliance Industries Ltd", "Energy", "Diversified",
                "\u20B919.2L Cr", 1920000, 28.5, 2.1, 99.5, 11.2, 13.8, 0.42, 0.4, 10.0,
                3100.0, 2180.0, 4521000,
                "Reliance Industries Limited is India's largest private sector corporation. " +
                "Operating across energy, petrochemicals, retail, digital services, and media, " +
                "it is the flagship company of the Mukesh Ambani-led Reliance Group.",
                10.0, "INE002A01018", "NSE");

        add("TCS", "Tata Consultancy Services", "Information Technology", "IT Services",
                "\u20B914.3L Cr", 1430000, 30.2, 11.8, 130.5, 48.2, 60.1, 0.0, 1.8, 72.0,
                4250.0, 3200.0, 1234000,
                "Tata Consultancy Services is an Indian multinational IT company, " +
                "a subsidiary of Tata Group, operating in 150+ locations across 46 countries.",
                1.0, "INE467B01029", "NSE");

        add("INFY", "Infosys Ltd", "Information Technology", "IT Services",
                "\u20B97.7L Cr", 770000, 23.8, 7.2, 77.8, 31.4, 38.2, 0.0, 2.6, 46.0,
                1980.0, 1350.0, 3456000,
                "Infosys Limited provides business consulting, information technology, and " +
                "outsourcing services. Founded in 1981 by N. R. Narayana Murthy.",
                5.0, "INE009A01021", "NSE");

        add("HDFCBANK", "HDFC Bank Ltd", "Banking", "Private Sector Bank",
                "\u20B912.8L Cr", 1280000, 18.5, 2.4, 91.3, 17.2, 2.1, 7.2, 1.2, 19.0,
                1850.0, 1430.0, 2890000,
                "HDFC Bank Limited is the largest private sector bank in India by assets. " +
                "Incorporated in 1994 as a subsidiary of Housing Development Finance Corporation.",
                1.0, "INE040A01034", "NSE");

        add("ICICIBANK", "ICICI Bank Ltd", "Banking", "Private Sector Bank",
                "\u20B97.9L Cr", 790000, 17.2, 2.9, 65.4, 18.5, 2.2, 4.8, 0.8, 10.0,
                1210.0, 890.0, 5123000,
                "ICICI Bank Limited is the second-largest private sector bank in India. " +
                "Established in 1994, headquartered in Mumbai.",
                2.0, "INE090A01021", "NSE");

        add("WIPRO", "Wipro Ltd", "Information Technology", "IT Services",
                "\u20B92.8L Cr", 280000, 19.5, 3.2, 28.1, 16.8, 20.4, 0.0, 0.2, 1.0,
                598.0, 380.0, 2340000,
                "Wipro Limited provides IT, consulting and business process services. " +
                "Founded in 1945 by Mohamed Premji.",
                2.0, "INE075A01022", "NSE");

        add("BAJFINANCE", "Bajaj Finance Ltd", "Financial Services", "NBFC",
                "\u20B94.4L Cr", 440000, 32.1, 7.8, 221.8, 24.2, 4.2, 3.8, 0.5, 4.0,
                8200.0, 6200.0, 890000,
                "Bajaj Finance Limited is an Indian NBFC and the lending arm of Bajaj Finserv. " +
                "Accepts public deposits and offers diversified loan products.",
                2.0, "INE296A01024", "NSE");

        add("MARUTI", "Maruti Suzuki India Ltd", "Automobiles", "Passenger Vehicles",
                "\u20B93.8L Cr", 380000, 26.8, 4.5, 465.2, 18.2, 22.8, 0.0, 1.3, 162.5,
                13200.0, 9500.0, 432000,
                "Maruti Suzuki India Limited is a 58.19% owned subsidiary of Suzuki Motor Corporation. " +
                "Sells more than 50% of cars sold in India.",
                5.0, "INE585B01010", "NSE");

        add("SUNPHARMA", "Sun Pharmaceutical Industries", "Pharmaceuticals", "Specialty Pharma",
                "\u20B93.8L Cr", 380000, 37.2, 5.8, 42.5, 16.5, 19.8, 0.0, 1.0, 15.0,
                1680.0, 1250.0, 1230000,
                "Sun Pharmaceutical Industries is the largest pharmaceutical company in India " +
                "and the fourth largest specialty generic pharmaceutical company globally.",
                1.0, "INE044A01036", "NSE");

        add("TITAN", "Titan Company Ltd", "Consumer Discretionary", "Jewellery & Watches",
                "\u20B92.9L Cr", 290000, 88.5, 22.1, 37.2, 35.8, 42.1, 0.0, 0.4, 11.0,
                3580.0, 2620.0, 654000,
                "Titan Company Limited is a Tata Group subsidiary manufacturing and selling " +
                "jewellery, watches, eyecare, fragrances, handbags, and other accessories.",
                1.0, "INE280A01028", "NSE");

        add("LTIM", "LTIMindtree Ltd", "Information Technology", "IT Services",
                "\u20B91.7L Cr", 170000, 35.2, 8.4, 159.8, 25.4, 30.2, 0.0, 1.5, 85.0,
                6200.0, 4800.0, 345000,
                "LTIMindtree Limited formed by the merger of Larsen & Toubro Infotech and Mindtree. " +
                "A subsidiary of Larsen & Toubro.",
                1.0, "INE214T01019", "NSE");

        add("AXISBANK", "Axis Bank Ltd", "Banking", "Private Sector Bank",
                "\u20B93.4L Cr", 340000, 12.8, 1.9, 85.2, 17.8, 2.1, 5.2, 0.1, 1.0,
                1185.0, 880.0, 3210000,
                "Axis Bank Limited is the third largest private sector bank in India, " +
                "offering products across large corporations, MSME, and retail businesses.",
                2.0, "INE238A01034", "NSE");

        add("KOTAKBANK", "Kotak Mahindra Bank Ltd", "Banking", "Private Sector Bank",
                "\u20B93.5L Cr", 350000, 19.8, 2.8, 87.9, 14.2, 1.8, 2.1, 0.1, 2.0,
                1920.0, 1580.0, 1890000,
                "Kotak Mahindra Bank Limited was granted a banking license by RBI in February 2003. " +
                "Headquartered in Mumbai.",
                5.0, "INE237A01028", "NSE");

        add("SBIN", "State Bank of India", "Banking", "Public Sector Bank",
                "\u20B96.9L Cr", 690000, 9.2, 1.5, 84.5, 16.8, 1.2, 8.5, 1.8, 14.0,
                850.0, 580.0, 6780000,
                "State Bank of India is a government corporation and the largest bank in India " +
                "by assets, headquartered in Mumbai, Maharashtra.",
                1.0, "INE062A01020", "NSE");

        add("HINDUNILVR", "Hindustan Unilever Ltd", "FMCG", "Personal Care",
                "\u20B95.6L Cr", 560000, 54.8, 12.5, 43.8, 42.5, 52.8, 0.0, 1.9, 48.0,
                2680.0, 2100.0, 876000,
                "Hindustan Unilever Limited (HUL) is a subsidiary of Unilever, a British company. " +
                "Products include foods, beverages, cleaning agents, and personal care items.",
                1.0, "INE030A01027", "NSE");

        // ── Technology ──────────────────────────────────────────────────────
        add("HCLTECH", "HCL Technologies Ltd", "Information Technology", "IT Services",
                "\u20B94.9L Cr", 490000, 26.4, 7.8, 68.2, 22.1, 27.4, 0.0, 4.2, 75.0,
                1880.0, 1320.0, 1120000,
                "HCL Technologies Limited is an Indian multinational IT company, " +
                "providing software-led IT solutions, remote infrastructure management and BPO services.",
                2.0, "INE860A01027", "NSE");

        add("TECHM", "Tech Mahindra Ltd", "Information Technology", "IT Services",
                "\u20B91.5L Cr", 150000, 18.2, 3.4, 83.7, 18.8, 22.1, 0.0, 1.8, 27.0,
                1620.0, 1080.0, 980000,
                "Tech Mahindra Limited is a Mahindra Group subsidiary providing IT services and solutions. " +
                "Serves telecom, manufacturing, BFSI and retail verticals globally.",
                5.0, "INE669C01036", "NSE");

        add("MPHASIS", "Mphasis Ltd", "Information Technology", "IT Services",
                "\u20B91.5L Cr", 150000, 32.1, 6.8, 88.6, 22.4, 28.8, 0.0, 2.1, 58.0,
                2980.0, 2200.0, 234000,
                "Mphasis Limited delivers applied technology services using cloud and cognitive, " +
                "primarily serving the banking, financial services and insurance sector.",
                10.0, "INE356A01018", "NSE");

        // ── Banking ─────────────────────────────────────────────────────────
        add("INDUSINDBK", "IndusInd Bank Ltd", "Banking & Finance", "Private Sector Bank",
                "\u20B98.6L Cr", 86000, 11.2, 1.6, 98.2, 14.8, 1.9, 6.8, 1.6, 17.5,
                1580.0, 930.0, 2340000,
                "IndusInd Bank Limited is a private sector bank in India offering " +
                "commercial, transactional and electronic banking products and services.",
                10.0, "INE095A01012", "NSE");

        add("PNB", "Punjab National Bank", "Banking & Finance", "Public Sector Bank",
                "\u20B91.3L Cr", 130000, 7.8, 0.9, 14.7, 11.2, 0.8, 10.5, 1.6, 1.8,
                142.0, 82.0, 8920000,
                "Punjab National Bank is the second largest public sector bank in India, " +
                "with a network of 10,000+ branches spread across India.",
                2.0, "INE160A01022", "NSE");

        add("BANKBARODA", "Bank of Baroda", "Banking & Finance", "Public Sector Bank",
                "\u20B91.3L Cr", 130000, 6.4, 0.9, 38.8, 14.5, 1.1, 7.8, 2.5, 6.0,
                298.0, 178.0, 5670000,
                "Bank of Baroda is an Indian government-owned banking and financial services company, " +
                "headquartered in Vadodara, Gujarat.",
                2.0, "INE028A01039", "NSE");

        // ── FMCG ────────────────────────────────────────────────────────────
        add("ITC", "ITC Ltd", "FMCG", "Diversified FMCG",
                "\u20B952.5L Cr", 525000, 28.4, 7.2, 14.8, 28.2, 35.8, 0.0, 3.8, 15.5,
                504.0, 380.0, 7890000,
                "ITC Limited is a diversified conglomerate with interests in cigarettes, hotels, " +
                "paperboards, packaging, agri-business and fast-moving consumer goods.",
                1.0, "INE154A01025", "NSE");

        add("NESTLEIND", "Nestle India Ltd", "FMCG", "Food & Beverages",
                "\u20B922.0L Cr", 220000, 72.4, 88.2, 314.8, 112.5, 138.4, 0.0, 1.4, 320.0,
                23450.0, 20200.0, 98000,
                "Nestle India Limited is a subsidiary of Nestle S.A., Switzerland. " +
                "Known for iconic brands: Maggi, Nescafe, KitKat, Munch, Milkmaid, Nestea.",
                1.0, "INE239A01024", "NSE");

        add("BRITANNIA", "Britannia Industries Ltd", "FMCG", "Food & Beverages",
                "\u20B91.2L Cr", 120000, 55.8, 48.2, 86.4, 54.8, 68.2, 0.0, 1.5, 72.0,
                5180.0, 4200.0, 145000,
                "Britannia Industries Limited is a leading food company in India, " +
                "manufacturing biscuits, bread, cakes, rusk and dairy products.",
                1.0, "INE216A01030", "NSE");

        // ── Pharma ──────────────────────────────────────────────────────────
        add("DRREDDY", "Dr Reddy's Laboratories", "Pharmaceuticals", "Generics",
                "\u20B920.8L Cr", 208000, 18.8, 3.8, 66.4, 21.2, 25.8, 0.0, 0.6, 8.0,
                1380.0, 1100.0, 412000,
                "Dr. Reddy's Laboratories is a pharmaceutical company based in Hyderabad. " +
                "Products include pharmaceutical services, APIs, generic drugs and biosimilars.",
                5.0, "INE089A01023", "NSE");

        add("CIPLA", "Cipla Ltd", "Pharmaceuticals", "Generics",
                "\u20B91.2L Cr", 120000, 24.2, 4.2, 59.8, 18.4, 22.8, 0.0, 0.5, 8.0,
                1580.0, 1180.0, 890000,
                "Cipla Limited is an Indian pharmaceutical company, known for " +
                "affordable generic medicines in HIV, oncology and respiratory segments.",
                2.0, "INE059A01026", "NSE");

        add("LUPIN", "Lupin Ltd", "Pharmaceuticals", "Generics",
                "\u20B986K Cr", 860000, 28.4, 5.8, 66.6, 22.1, 26.8, 0.0, 0.8, 14.0,
                2050.0, 1480.0, 678000,
                "Lupin Limited is a global pharmaceutical company with a global presence " +
                "across 100+ countries. Specializes in cardiovascular and anti-infective medicines.",
                2.0, "INE326A01037", "NSE");

        // ── Auto ────────────────────────────────────────────────────────────
        add("TATAMOTORS", "Tata Motors Ltd", "Automobiles", "Passenger & Commercial Vehicles",
                "\u20B93.3L Cr", 330000, 8.4, 2.2, 107.4, 28.8, 18.4, 1.2, 0.0, 0.0,
                1050.0, 780.0, 3450000,
                "Tata Motors Limited is a multinational automotive company, " +
                "including Jaguar Land Rover acquired in 2008.",
                2.0, "INE155A01022", "NSE");

        add("BAJAJ-AUTO", "Bajaj Auto Ltd", "Automobiles", "Two-Wheelers",
                "\u20B92.5L Cr", 250000, 32.4, 8.8, 273.2, 28.4, 35.2, 0.0, 0.9, 80.0,
                9500.0, 7200.0, 198000,
                "Bajaj Auto Limited is the world's third-largest and India's second-largest " +
                "motorcycle manufacturer, based in Pune.",
                10.0, "INE917I01010", "NSE");

        add("HEROMOTOCO", "Hero MotoCorp Ltd", "Automobiles", "Two-Wheelers",
                "\u20B995.8K Cr", 95800, 22.8, 6.4, 209.8, 28.8, 34.2, 0.0, 2.2, 105.0,
                5200.0, 3980.0, 289000,
                "Hero MotoCorp Limited is the world's largest manufacturer of two-wheelers. " +
                "Sells more than 7 million motorcycles and scooters per year.",
                2.0, "INE158A01026", "NSE");

        // ── Energy ──────────────────────────────────────────────────────────
        add("NTPC", "NTPC Ltd", "Energy", "Power Generation",
                "\u20B93.7L Cr", 370000, 14.2, 1.8, 26.8, 13.5, 9.8, 0.8, 2.8, 10.0,
                430.0, 302.0, 4560000,
                "NTPC Limited is India's largest power utility company, " +
                "with a generation capacity of over 72 GW across coal, gas, solar and wind.",
                10.0, "INE733E01010", "NSE");

        add("POWERGRID", "Power Grid Corp of India", "Energy", "Power Transmission",
                "\u20B93.2L Cr", 320000, 16.8, 2.5, 20.5, 15.8, 11.2, 0.6, 4.5, 15.5,
                390.0, 270.0, 3210000,
                "Power Grid Corporation of India Limited is the central transmission utility " +
                "of India, operating 170,000+ circuit km of transmission lines.",
                10.0, "INE752E01010", "NSE");

        add("COALINDIA", "Coal India Ltd", "Energy", "Mining & Extraction",
                "\u20B92.9L Cr", 290000, 7.2, 3.8, 64.8, 55.2, 68.4, 0.0, 6.8, 31.5,
                530.0, 380.0, 2890000,
                "Coal India Limited is the world's largest coal mining company and " +
                "a Government of India Maharatna public enterprise.",
                10.0, "INE522F01014", "NSE");

        // ── Metals ──────────────────────────────────────────────────────────
        add("TATASTEEL", "Tata Steel Ltd", "Metals", "Steel",
                "\u20B92.1L Cr", 210000, 12.4, 1.8, 13.8, 14.8, 8.4, 1.2, 2.4, 4.0,
                188.0, 128.0, 8920000,
                "Tata Steel Limited is one of the world's most geographically-diversified " +
                "steel producers with operations in 26 countries.",
                1.0, "INE081A01020", "NSE");

        add("JSWSTEEL", "JSW Steel Ltd", "Metals", "Steel",
                "\u20B92.2L Cr", 220000, 14.8, 2.4, 61.2, 16.8, 10.8, 1.8, 1.1, 10.0,
                1020.0, 750.0, 1890000,
                "JSW Steel Limited is an Indian steel manufacturing company " +
                "with an installed capacity of 28 million TPA.",
                1.0, "INE019A01038", "NSE");

        add("HINDALCO", "Hindalco Industries Ltd", "Metals", "Aluminium & Copper",
                "\u20B91.4L Cr", 140000, 14.2, 1.6, 44.2, 11.5, 9.8, 0.8, 0.8, 5.0,
                720.0, 490.0, 3120000,
                "Hindalco Industries Limited is a metals flagship company of the Aditya Birla Group. " +
                "Largest aluminium company in Asia and a major copper producer.",
                1.0, "INE038A01020", "NSE");

        // ── Consumer Discretionary ──────────────────────────────────────────
        add("ASIANPAINT", "Asian Paints Ltd", "Consumer Discretionary", "Paints & Coatings",
                "\u20B924.9L Cr", 249000, 60.2, 18.4, 43.2, 31.8, 40.5, 0.0, 1.2, 31.0,
                3200.0, 2350.0, 765000,
                "Asian Paints Limited is India's largest paint company and ranks among the " +
                "top ten decorative coatings companies in the world.",
                1.0, "INE021A01026", "NSE");

        // ── Technology (additional) ──────────────────────────────────────────
        add("PERSISTENT", "Persistent Systems Ltd", "Technology", "IT Services & Consulting",
                "\u20B972,200 Cr", 72200, 58.4, 14.8, 82.8, 28.6, 34.2, 0.0, 0.8, 40.0,
                5180.0, 3420.0, 198000,
                "Persistent Systems is a global software product and technology services company " +
                "with expertise in digital engineering, cloud, and data analytics.",
                10.0, "INE262H01021", "NSE");

        add("LTTS", "L&T Technology Services Ltd", "Technology", "Engineering R&D Services",
                "\u20B955,400 Cr", 55400, 42.8, 11.2, 122.6, 28.4, 32.8, 0.0, 1.6, 85.0,
                5680.0, 3980.0, 145000,
                "L&T Technology Services is a leading global engineering R&D services company " +
                "serving clients in mobility, sustainability, and tech convergence.",
                2.0, "INE010V01017", "NSE");

        add("COFORGE", "Coforge Ltd", "Technology", "IT Services & Consulting",
                "\u20B944,800 Cr", 44800, 52.6, 13.4, 138.4, 30.2, 36.4, 0.2, 1.0, 72.5,
                7680.0, 4820.0, 112000,
                "Coforge is a global digital services and solutions provider delivering " +
                "transformational outcomes for clients across industries.",
                10.0, "INE694P01018", "NSE");

        // ── Banking & Finance (additional) ──────────────────────────────────
        add("FEDERALBNK", "Federal Bank Ltd", "Banking & Finance", "Private Sector Banking",
                "\u20B933,800 Cr", 33800, 10.4, 1.4, 16.2, 14.8, 12.4, 6.4, 1.4, 2.4,
                200.0, 128.0, 7820000,
                "Federal Bank is one of India's leading private sector banks with a strong " +
                "presence in Kerala and growing pan-India operations.",
                2.0, "INE171A01029", "NSE");

        add("IDFCFIRSTB", "IDFC First Bank Ltd", "Banking & Finance", "Private Sector Banking",
                "\u20B957,400 Cr", 57400, 18.6, 1.8, 4.4, 10.6, 9.8, 7.2, 0.0, 0.0,
                98.0, 56.0, 9450000,
                "IDFC First Bank is a new-age private bank offering retail and corporate banking " +
                "services with a focus on digital-first customer experience.",
                10.0, "INE092T01019", "NSE");

        add("BANDHANBNK", "Bandhan Bank Ltd", "Banking & Finance", "Private Sector Banking",
                "\u20B931,500 Cr", 31500, 11.8, 1.6, 16.6, 14.2, 12.8, 5.8, 1.8, 3.5,
                280.0, 168.0, 4320000,
                "Bandhan Bank is a universal bank with roots in microfinance, serving millions " +
                "of customers across rural and semi-urban India.",
                10.0, "INE545U01014", "NSE");

        // ── FMCG (additional) ───────────────────────────────────────────────
        add("MARICO", "Marico Ltd", "FMCG", "Personal Care & Foods",
                "\u20B974,800 Cr", 74800, 48.2, 14.6, 12.0, 36.8, 44.2, 0.0, 1.6, 9.0,
                690.0, 498.0, 1560000,
                "Marico is a leading consumer goods company operating in the beauty, wellness " +
                "and foods space with iconic brands like Parachute, Saffola and Set Wet.",
                1.0, "INE196A01026", "NSE");

        add("DABUR", "Dabur India Ltd", "FMCG", "Ayurvedic & Natural Products",
                "\u20B992,400 Cr", 92400, 52.6, 12.8, 9.9, 24.6, 28.4, 0.0, 1.4, 7.4,
                648.0, 488.0, 1890000,
                "Dabur India is one of India's leading FMCG companies with a portfolio of " +
                "over 250 herbal and natural healthcare products.",
                1.0, "INE016A01026", "NSE");

        // ── Pharma (additional) ─────────────────────────────────────────────
        add("BIOCON", "Biocon Ltd", "Pharma", "Biopharmaceuticals",
                "\u20B935,800 Cr", 35800, 42.4, 2.8, 7.0, 6.8, 8.4, 0.8, 0.6, 1.8,
                380.0, 218.0, 3450000,
                "Biocon is Asia's premier biopharmaceuticals company developing affordable " +
                "innovations for chronic conditions including oncology and diabetes.",
                5.0, "INE376G01013", "NSE");

        add("DIVISLAB", "Divi's Laboratories Ltd", "Pharma", "Active Pharmaceutical Ingredients",
                "\u20B91,27,800 Cr", 127800, 56.8, 9.4, 84.8, 17.8, 21.4, 0.0, 0.8, 40.0,
                5480.0, 3480.0, 312000,
                "Divi's Laboratories is one of the world's largest manufacturers of active " +
                "pharmaceutical ingredients and intermediates, serving global innovator companies.",
                2.0, "INE361B01024", "NSE");

        // ── Financial Services (additional) ─────────────────────────────────
        add("CHOLAFIN", "Cholamandalam Investment & Finance Co", "Financial Services", "NBFC - Retail",
                "\u20B994,400 Cr", 94400, 28.6, 5.4, 39.9, 20.8, 14.6, 5.2, 0.4, 4.6,
                1380.0, 820.0, 890000,
                "Cholamandalam Investment and Finance is a diversified financial services company " +
                "offering vehicle finance, home loans and SME loans.",
                2.0, "INE121A01024", "NSE");

        add("BAJAJFINSV", "Bajaj Finserv Ltd", "Financial Services", "Diversified Financial Services",
                "\u20B92,58,600 Cr", 258600, 18.4, 3.2, 88.2, 18.4, 15.8, 1.2, 0.1, 1.6,
                1980.0, 1312.0, 678000,
                "Bajaj Finserv is the holding company for Bajaj Finance, Bajaj Allianz Life " +
                "Insurance and Bajaj Allianz General Insurance.",
                1.0, "INE918I01026", "NSE");

        // ── Auto (additional) ───────────────────────────────────────────────
        add("EICHERMOT", "Eicher Motors Ltd", "Auto", "Two & Three Wheelers",
                "\u20B91,32,600 Cr", 132600, 29.4, 8.4, 164.8, 31.8, 38.4, 0.0, 1.8, 87.0,
                5180.0, 3482.0, 234000,
                "Eicher Motors is the parent company of Royal Enfield, the world's largest " +
                "manufacturer of mid-sized motorcycles.",
                1.0, "INE066A01021", "NSE");

        add("MM", "Mahindra & Mahindra Ltd", "Auto", "Automobiles - Diversified",
                "\u20B93,51,200 Cr", 351200, 24.8, 4.8, 113.6, 20.6, 18.4, 0.4, 0.8, 22.0,
                3280.0, 1448.0, 1120000,
                "Mahindra & Mahindra is India's leading SUV maker and the world's largest " +
                "tractor manufacturer by volume.",
                5.0, "INE101A01026", "NSE");

        // ── Consumer Durables (additional) ──────────────────────────────────
        add("VOLTAS", "Voltas Ltd", "Consumer Discretionary", "Consumer Durables - Cooling",
                "\u20B949,200 Cr", 49200, 68.4, 7.8, 21.7, 11.8, 14.6, 0.0, 0.4, 6.0,
                1680.0, 948.0, 456000,
                "Voltas is India's No. 1 room air conditioner brand, offering a wide range " +
                "of cooling products and engineering solutions.",
                1.0, "INE226A01021", "NSE");

        add("HAVELLS", "Havells India Ltd", "Consumer Discretionary", "Consumer Durables - Electricals",
                "\u20B91,07,800 Cr", 107800, 72.6, 14.8, 23.8, 21.4, 26.8, 0.0, 0.6, 10.4,
                1980.0, 1248.0, 567000,
                "Havells India is a leading Fast Moving Electrical Goods company with pan-India " +
                "presence, offering a wide range of consumer electrical products.",
                1.0, "INE176B01034", "NSE");

        // ── Energy (additional) ─────────────────────────────────────────────
        add("ADANIGREEN", "Adani Green Energy Ltd", "Energy", "Renewable Energy",
                "\u20B91,77,400 Cr", 177400, 148.6, 18.4, 7.6, 12.8, 8.6, 4.2, 0.0, 0.0,
                1980.0, 892.0, 2340000,
                "Adani Green Energy is one of the world's largest renewable energy companies, " +
                "developing, building and operating solar and wind power plants.",
                10.0, "INE364U01010", "NSE");

        add("TATAPOWER", "Tata Power Company Ltd", "Energy", "Integrated Power Utility",
                "\u20B91,32,200 Cr", 132200, 28.6, 4.2, 14.5, 15.8, 12.4, 1.6, 0.6, 2.6,
                480.0, 248.0, 3780000,
                "Tata Power is India's largest integrated private power company with presence " +
                "across the entire power value chain from generation to distribution.",
                1.0, "INE245A01021", "NSE");

        // ── Metals (additional) ─────────────────────────────────────────────
        add("VEDL", "Vedanta Ltd", "Metals", "Diversified Metals & Mining",
                "\u20B91,69,800 Cr", 169800, 8.4, 2.4, 54.5, 28.6, 22.8, 1.8, 8.2, 37.5,
                560.0, 228.0, 5670000,
                "Vedanta is a diversified natural resources company with interests in zinc, " +
                "lead, silver, aluminium, copper, iron ore and oil & gas.",
                1.0, "INE205A01025", "NSE");

        add("SAIL", "Steel Authority of India Ltd", "Metals", "Integrated Steel",
                "\u20B952,800 Cr", 52800, 7.8, 0.8, 16.4, 10.4, 9.8, 1.2, 3.2, 4.1,
                168.0, 88.0, 9870000,
                "SAIL is India's largest steel-making company and one of the Maharatna " +
                "Central Public Sector Enterprises of the Government of India.",
                10.0, "INE114A01011", "NSE");
    }

    private void add(String symbol, String name, String sector, String industry,
                     String mcapFmt, long mcapRaw,
                     double pe, double pb, double eps, double roe, double roce,
                     double dte, double divYield, double divPerShare,
                     double w52High, double w52Low, long avgVol,
                     String description, double faceValue, String isin, String exchange) {
        fundamentals.put(symbol, new StockDetailDto(
                symbol, name, sector, industry, mcapFmt, mcapRaw,
                pe, pb, eps, roe, roce, dte, divYield, divPerShare,
                w52High, w52Low, avgVol,
                0, 0, 0,  // price/change/changePercent — merged from live data at query time
                description, faceValue, isin, exchange
        ));
    }

    private CorporateActionDto ca(String sym, String type, String exDate, String recDate,
                                   String desc, double val, String status) {
        return new CorporateActionDto(sym, type, exDate, recDate, desc, val, status);
    }

    private void initCorporateActions() {
        corporateActions.put("RELIANCE", List.of(
            ca("RELIANCE","DIVIDEND","2024-08-19","2024-08-20","\u20B910/share — Final Dividend FY2024",10.0,"PAST"),
            ca("RELIANCE","DIVIDEND","2023-08-21","2023-08-22","\u20B99/share — Final Dividend FY2023",9.0,"PAST"),
            ca("RELIANCE","BONUS","2017-09-19","2017-09-20","Bonus Issue 1:1 (1 bonus share for every 1 held)",1.0,"PAST"),
            ca("RELIANCE","RIGHTS","2020-05-20","2020-05-20","Rights Issue at \u20B91,257/share (1 right for every 15 held)",1257.0,"PAST")));

        corporateActions.put("TCS", List.of(
            ca("TCS","DIVIDEND","2024-10-18","2024-10-19","\u20B966/share — Special Dividend FY2025",66.0,"PAST"),
            ca("TCS","DIVIDEND","2024-07-25","2024-07-26","\u20B910/share — Interim Dividend Q1 FY2025",10.0,"PAST"),
            ca("TCS","BUYBACK","2023-12-01","2023-12-01","Buyback at \u20B94,150/share (total \u20B917,000 Cr)",4150.0,"PAST"),
            ca("TCS","DIVIDEND","2025-10-15","2025-10-16","\u20B970/share — Special Dividend FY2026 (Upcoming)",70.0,"UPCOMING")));

        corporateActions.put("INFY", List.of(
            ca("INFY","DIVIDEND","2024-10-25","2024-10-26","\u20B921/share — Interim Dividend Q2 FY2025",21.0,"PAST"),
            ca("INFY","SPLIT","2018-06-20","2018-06-21","Stock Split 2:1 — FV reduced from \u20B910 to \u20B95",2.0,"PAST"),
            ca("INFY","BUYBACK","2022-06-25","2022-06-25","Buyback at \u20B91,750/share (total \u20B99,300 Cr)",1750.0,"PAST"),
            ca("INFY","DIVIDEND","2025-10-20","2025-10-21","\u20B922/share — Interim Dividend FY2026 (Upcoming)",22.0,"UPCOMING")));

        corporateActions.put("HDFCBANK", List.of(
            ca("HDFCBANK","DIVIDEND","2024-06-20","2024-06-21","\u20B919.50/share — Final Dividend FY2024",19.5,"PAST"),
            ca("HDFCBANK","SPLIT","2019-09-19","2019-09-20","Stock Split 2:1 — FV \u20B92 to \u20B91",2.0,"PAST"),
            ca("HDFCBANK","DIVIDEND","2023-06-21","2023-06-22","\u20B919/share — Final Dividend FY2023",19.0,"PAST"),
            ca("HDFCBANK","DIVIDEND","2025-07-15","2025-07-16","\u20B922/share — Interim Dividend FY2026 (Upcoming)",22.0,"UPCOMING")));

        corporateActions.put("ICICIBANK", List.of(
            ca("ICICIBANK","DIVIDEND","2024-08-07","2024-08-08","\u20B910/share — Final Dividend FY2024",10.0,"PAST"),
            ca("ICICIBANK","DIVIDEND","2023-08-08","2023-08-09","\u20B98/share — Final Dividend FY2023",8.0,"PAST"),
            ca("ICICIBANK","SPLIT","2010-07-10","2010-07-11","Stock Split 5:1 — FV \u20B910 to \u20B92",5.0,"PAST")));

        corporateActions.put("WIPRO", List.of(
            ca("WIPRO","DIVIDEND","2024-10-24","2024-10-25","\u20B91/share — Interim Dividend Q2 FY2025",1.0,"PAST"),
            ca("WIPRO","BONUS","2019-03-14","2019-03-15","Bonus Issue 1:3 (1 bonus share for every 3 held)",1.0,"PAST"),
            ca("WIPRO","SPLIT","2004-07-06","2004-07-07","Stock Split 2:1",2.0,"PAST")));

        corporateActions.put("BAJFINANCE", List.of(
            ca("BAJFINANCE","DIVIDEND","2024-07-01","2024-07-02","\u20B936/share — Final Dividend FY2024",36.0,"PAST"),
            ca("BAJFINANCE","SPLIT","2016-09-07","2016-09-08","Stock Split 5:1 — FV \u20B910 to \u20B92",5.0,"PAST"),
            ca("BAJFINANCE","DIVIDEND","2025-07-10","2025-07-11","\u20B940/share — Final Dividend FY2026 (Upcoming)",40.0,"UPCOMING")));

        corporateActions.put("MARUTI", List.of(
            ca("MARUTI","DIVIDEND","2024-07-24","2024-07-25","\u20B9125/share — Final Dividend FY2024",125.0,"PAST"),
            ca("MARUTI","DIVIDEND","2023-08-22","2023-08-23","\u20B990/share — Final Dividend FY2023",90.0,"PAST"),
            ca("MARUTI","DIVIDEND","2025-07-20","2025-07-21","\u20B9150/share — Expected Final Dividend FY2026 (Upcoming)",150.0,"UPCOMING")));

        corporateActions.put("SUNPHARMA", List.of(
            ca("SUNPHARMA","DIVIDEND","2024-07-19","2024-07-20","\u20B95/share — Final Dividend FY2024",5.0,"PAST"),
            ca("SUNPHARMA","DIVIDEND","2023-07-12","2023-07-13","\u20B93.50/share — Final Dividend FY2023",3.5,"PAST"),
            ca("SUNPHARMA","BONUS","2023-01-18","2023-01-19","Bonus Issue 1:1 (1 bonus share for every 1 held)",1.0,"PAST")));

        corporateActions.put("TITAN", List.of(
            ca("TITAN","DIVIDEND","2024-08-02","2024-08-03","\u20B911/share — Final Dividend FY2024",11.0,"PAST"),
            ca("TITAN","SPLIT","2022-08-15","2022-08-16","Stock Split 5:1 (face value reduction)",5.0,"PAST"),
            ca("TITAN","DIVIDEND","2023-07-21","2023-07-22","\u20B910/share — Final Dividend FY2023",10.0,"PAST")));

        corporateActions.put("LTIM", List.of(
            ca("LTIM","DIVIDEND","2024-08-09","2024-08-10","\u20B945/share — Final Dividend FY2024",45.0,"PAST"),
            ca("LTIM","DIVIDEND","2023-08-11","2023-08-12","\u20B940/share — Final Dividend FY2023",40.0,"PAST")));

        corporateActions.put("AXISBANK", List.of(
            ca("AXISBANK","DIVIDEND","2024-07-17","2024-07-18","\u20B91/share — Final Dividend FY2024",1.0,"PAST"),
            ca("AXISBANK","SPLIT","2010-04-13","2010-04-14","Stock Split 2:1 — FV \u20B910 to \u20B95",2.0,"PAST")));

        corporateActions.put("KOTAKBANK", List.of(
            ca("KOTAKBANK","DIVIDEND","2024-07-05","2024-07-06","\u20B92/share — Final Dividend FY2024",2.0,"PAST"),
            ca("KOTAKBANK","SPLIT","2020-09-04","2020-09-05","Stock Split 5:1 — FV \u20B95 to \u20B91",5.0,"PAST"),
            ca("KOTAKBANK","DIVIDEND","2023-07-07","2023-07-08","\u20B91.50/share — Final Dividend FY2023",1.5,"PAST")));

        corporateActions.put("SBIN", List.of(
            ca("SBIN","DIVIDEND","2024-07-22","2024-07-23","\u20B913.70/share — Final Dividend FY2024",13.7,"PAST"),
            ca("SBIN","DIVIDEND","2023-07-21","2023-07-22","\u20B911.30/share — Final Dividend FY2023",11.3,"PAST"),
            ca("SBIN","BONUS","2017-10-05","2017-10-06","Bonus Issue 1:1 (1 bonus share for every 1 held)",1.0,"PAST"),
            ca("SBIN","DIVIDEND","2025-08-01","2025-08-02","\u20B914/share — Interim Dividend FY2026 (Upcoming)",14.0,"UPCOMING")));

        corporateActions.put("HINDUNILVR", List.of(
            ca("HINDUNILVR","DIVIDEND","2024-07-09","2024-07-10","\u20B924/share — Final Dividend FY2024",24.0,"PAST"),
            ca("HINDUNILVR","DIVIDEND","2024-01-24","2024-01-25","\u20B919/share — Interim Dividend H2 FY2024",19.0,"PAST"),
            ca("HINDUNILVR","DIVIDEND","2023-07-10","2023-07-11","\u20B922/share — Final Dividend FY2023",22.0,"PAST")));
    }
}
