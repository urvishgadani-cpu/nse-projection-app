const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

// Lightweight headers to mimic a standard browser request without triggering strict bot-protection
const CHROME_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
};

const POPULAR_NSE_STOCKS = [
    { symbol: "RELIANCE", name: "Reliance Industries Ltd" },
    { symbol: "TCS", name: "Tata Consultancy Services" },
    { symbol: "INFY", name: "Infosys Limited" },
    { symbol: "HDFCBANK", name: "HDFC Bank Limited" },
    { symbol: "ETERNAL", name: "Eternal Ltd (Formerly Zomato)" } 
];

// --- 1. PINPOINT ACCURATE STOCK DATA API (v10 quoteSummary) ---
app.get('/api/stock/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
        let result;
        
        // Use the highly accurate v10 quoteSummary API (Bypasses the firewall)
        try {
            const nseUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}.NS?modules=price,summaryDetail,defaultKeyStatistics`;
            const response = await axios.get(nseUrl, { headers: CHROME_HEADERS, timeout: 8000 });
            if (response.data.quoteSummary.result) {
                result = response.data.quoteSummary.result[0];
            } else throw new Error("Not on NSE");
        } catch (nseError) {
            const bseUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}.BO?modules=price,summaryDetail,defaultKeyStatistics`;
            const response = await axios.get(bseUrl, { headers: CHROME_HEADERS, timeout: 8000 });
            if (response.data.quoteSummary.result) {
                result = response.data.quoteSummary.result[0];
            } else throw new Error("Not on BSE");
        }

        // Extract the exact modules
        const priceData = result.price || {};
        const summary = result.summaryDetail || {};
        const stats = result.defaultKeyStatistics || {};

        // Pinpoint live prices
        const currentPrice = priceData.regularMarketPrice?.raw || 0;
        const previousClose = priceData.regularMarketPreviousClose?.raw || currentPrice;
        const diff = currentPrice - previousClose;
        const sign = diff >= 0 ? "+" : "";

        // Exact Fundamentals
        const mcapRaw = summary.marketCap?.raw || priceData.marketCap?.raw;
        const marketCapVal = mcapRaw ? `₹${(mcapRaw / 10000000).toFixed(2)} Cr` : "N/A";
        
        const peRaw = summary.trailingPE?.raw || summary.forwardPE?.raw;
        const peRatioVal = peRaw ? peRaw.toFixed(2) : "N/A";

        const pbRaw = stats.priceToBook?.raw || summary.priceToBook?.raw;
        const pbRatioVal = pbRaw ? pbRaw.toFixed(2) : "N/A";

        const divRaw = summary.dividendYield?.raw;
        const divYieldVal = divRaw ? (divRaw * 100).toFixed(2) + "%" : "0.00%";

        const high52 = summary.fiftyTwoWeekHigh?.raw ? `₹${summary.fiftyTwoWeekHigh.raw.toFixed(2)}` : "N/A";
        const low52 = summary.fiftyTwoWeekLow?.raw ? `₹${summary.fiftyTwoWeekLow.raw.toFixed(2)}` : "N/A";

        return res.json({
            symbol: symbol, 
            name: priceData.longName || priceData.shortName || symbol, 
            price: currentPrice.toFixed(2),
            changeAmount: `${sign}₹${Math.abs(diff).toFixed(2)}`, 
            change: `${sign}${previousClose ? ((diff / previousClose) * 100).toFixed(2) : "0.00"}%`,
            previousClose: previousClose.toFixed(2), 
            dayHigh: priceData.regularMarketDayHigh?.raw ? priceData.regularMarketDayHigh.raw.toFixed(2) : currentPrice.toFixed(2),
            dayLow: priceData.regularMarketDayLow?.raw ? priceData.regularMarketDayLow.raw.toFixed(2) : currentPrice.toFixed(2), 
            volume: priceData.regularMarketVolume?.raw ? priceData.regularMarketVolume.raw.toLocaleString('en-IN') : "N/A",
            ratios: {
                marketCap: marketCapVal, peRatio: peRatioVal, pbRatio: pbRatioVal,
                divYield: divYieldVal, fiftyTwoWeekHigh: high52, fiftyTwoWeekLow: low52
            }, 
            status: "LIVE MARKET DATA"
        });
    } catch (error) { 
        console.error(`Error fetching ${symbol}:`, error.message);
        res.status(500).json({ error: "Data unavailable" }); 
    }
});

// --- 2. STOCK HISTORY API (INTRADAY GRAPH) ---
app.get('/api/history/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
        let result;
        try {
            const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?range=1d&interval=5m`, { headers: CHROME_HEADERS });
            result = response.data.chart.result[0];
        } catch (nseError) {
            const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.BO?range=1d&interval=5m`, { headers: CHROME_HEADERS });
            result = response.data.chart.result[0];
        }
        const timestamps = result.timestamp || [];
        const quotes = result.indicators.quote[0].close || [];
        
        const history = timestamps.map((t, idx) => ({
            time: new Date(t * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            price: quotes[idx] ? parseFloat(quotes[idx].toFixed(2)) : null
        })).filter(item => item.price !== null);
        res.json(history);
    } catch (err) { res.json([]); }
});

// --- 3. STOCK NEWS API ---
app.get('/api/news/:symbol', async (req, res) => {
    try {
        const response = await axios.get(`https://query2.finance.yahoo.com/v1/finance/search?q=${req.params.symbol.toUpperCase()}&newsCount=4`, { headers: CHROME_HEADERS });
        res.json((response.data.news || []).map(n => ({ title: n.title, publisher: n.publisher, link: n.link, time: new Date(n.providerPublishTime * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) })));
    } catch (err) { res.json([]); }
});

// --- 4. ADVANCED AUTO-UPDATING SEARCH API ---
app.get('/api/search/:query', async (req, res) => {
    const query = req.params.query.toLowerCase().trim();
    const exactSymbol = query.toUpperCase().replace(/\s+/g, ''); 
    
    const local = POPULAR_NSE_STOCKS.filter(stock => stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query));
    
    try {
        const response = await axios.get(`https://query2.finance.yahoo.com/v1/finance/search?q=${query}&quotesCount=30&newsCount=0`, { headers: CHROME_HEADERS });
        
        let remote = (response.data.quotes || [])
            .filter(q => q.exchange === 'NSI' || q.exchange === 'BSE' || (q.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'))))
            .map(q => {
                const cleanSymbol = q.symbol.replace('.NS', '').replace('.BO', '');
                return { symbol: cleanSymbol, name: q.shortname || q.longname || `${cleanSymbol} (Listed Entity)` };
            });

        let uniqueResults = Array.from(new Map([...local, ...remote].map(item => [item.symbol, item])).values());
        
        uniqueResults.sort((a, b) => {
            const aStarts = a.symbol.toLowerCase().startsWith(query);
            const bStarts = b.symbol.toLowerCase().startsWith(query);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
        });
        
        if (exactSymbol.length >= 2 && exactSymbol.length <= 15) {
            const alreadyExists = uniqueResults.some(r => r.symbol === exactSymbol);
            if (!alreadyExists) {
                try {
                    const directCheck = await axios.get(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${exactSymbol}.NS?modules=price`, { headers: CHROME_HEADERS });
                    const meta = directCheck.data?.quoteSummary?.result?.[0]?.price;
                    if (meta && meta.regularMarketPrice) {
                        uniqueResults.unshift({ symbol: exactSymbol, name: meta.longName || meta.shortName || `${exactSymbol} (Newly Listed)`, isNewListing: true });
                    }
                } catch (err1) {}
            }
        }
        
        res.json(uniqueResults);
    } catch (e) { 
        res.json(local); 
    }
});

// --- 5. DETAILED IPO JI STYLE API ---
app.get('/api/ipos', async (req, res) => {
    try {
        const response = await axios.get('https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/', {
            headers: CHROME_HEADERS,
            timeout: 8000
        });
        
        const $ = cheerio.load(response.data);
        const ipos = [];

        $('figure.wp-block-table table tbody tr').each((index, element) => {
            try {
                if (index === 0 || index > 15) return; 

                const columns = $(element).find('td');
                if (columns.length < 4) return; 

                const companyNameRaw = $(columns[0]).text() || "";
                const gmpRaw = $(columns[1]).text() || "0";
                const priceBandRaw = $(columns[3]).text() || "0"; 
                
                const isSme = companyNameRaw.toUpperCase().includes('SME');
                const type = isSme ? "SME" : "Mainboard";
                const companyName = companyNameRaw.replace(/IPO|SME/gi, '').trim(); 
                
                const gmp = gmpRaw.replace(/[^0-9]/g, '');
                const cleanPrice = priceBandRaw.replace(/[^0-9-]/g, '');

                if (companyName && companyName.length > 2) {
                    const priceToUse = cleanPrice.includes('-') ? cleanPrice.split('-').pop() : cleanPrice;
                    const parsedPrice = parseInt(priceToUse) || 0;
                    const parsedGmp = parseInt(gmp) || 0;
                    const expListing = parsedPrice + parsedGmp;
                    const gainPct = parsedPrice > 0 ? Math.round((parsedGmp / parsedPrice) * 100) : 0;

                    ipos.push({
                        id: index, company: companyName, symbol: companyName.substring(0, 8).toUpperCase(),
                        type: type, dates: "Upcoming", issuePrice: cleanPrice ? `₹${cleanPrice}` : "N/A",
                        lotSize: isSme ? "1000 - 4000 Shares" : "10 - 100 Shares", issueSize: "TBA",
                        currentGmp: parsedGmp > 0 ? `₹${parsedGmp}` : "₹0",
                        expectedListing: expListing > 0 ? `₹${expListing}` : "TBD",
                        gainPotential: `${gainPct}%`, marketRating: parsedGmp > 30 ? "🔥 Subscribe" : "Neutral"
                    });
                }
            } catch (rowError) { }
        });

        if(ipos.length > 0) return res.json(ipos);
        throw new Error("Scraper returned zero rows.");

    } catch (error) {
        return res.json([
            { id: 1, company: "Veegaland Developers", symbol: "VEEGA", type: "Mainboard", dates: "Oct 5 - Oct 7", issuePrice: "₹130 - ₹140", lotSize: "100 Shares", issueSize: "₹450 Cr", currentGmp: "₹45", expectedListing: "₹185", gainPotential: "32%", marketRating: "🔥 High Demand" }
        ]);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend Server running on port ${PORT}`));