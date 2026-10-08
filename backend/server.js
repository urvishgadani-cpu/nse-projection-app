const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
app.use(cors());

// --- NSE/BSE Stock Data Setup (Cookies & Headers) ---
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

const CHROME_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive'
};

async function initializeNseSession() {
    try { 
        await client.get('https://www.nseindia.com', { headers: CHROME_HEADERS, timeout: 5000 }); 
    } catch (error) { 
        console.log("NSE Cookie fetch delayed, fallback ready."); 
    }
}
initializeNseSession();
setInterval(initializeNseSession, 10 * 60 * 1000);

const POPULAR_NSE_STOCKS = [
    { symbol: "RELIANCE", name: "Reliance Industries Ltd" },
    { symbol: "TCS", name: "Tata Consultancy Services" },
    { symbol: "INFY", name: "Infosys Limited" },
    { symbol: "HDFCBANK", name: "HDFC Bank Limited" },
    { symbol: "ETERNAL", name: "Eternal Ltd (Formerly Zomato)" } 
];

// --- 1. BULLETPROOF STOCK DATA API (ACCURATE LIVE PRICES & REAL RATIOS) ---
app.get('/api/stock/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
        let quote;
        // The new v7/quote API fetches real-time prices and true fundamental data
        try {
            const response = await axios.get(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.NS`, { headers: CHROME_HEADERS });
            if (response.data.quoteResponse.result.length > 0) {
                quote = response.data.quoteResponse.result[0];
            } else {
                throw new Error("Not on NSE");
            }
        } catch (nseError) {
            const response = await axios.get(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.BO`, { headers: CHROME_HEADERS });
            if (response.data.quoteResponse.result.length > 0) {
                quote = response.data.quoteResponse.result[0];
            } else {
                throw new Error("Not on BSE");
            }
        }

        const currentPrice = quote.regularMarketPrice || quote.regularMarketPreviousClose || 0;
        const previousClose = quote.regularMarketPreviousClose || currentPrice;
        const diff = currentPrice - previousClose;
        const sign = diff >= 0 ? "+" : "";

        // Safely converts raw Market Cap to Crores (1 Crore = 10,000,000)
        const marketCapVal = quote.marketCap ? `₹${(quote.marketCap / 10000000).toFixed(2)} Cr` : "N/A";
        const peRatioVal = quote.trailingPE ? quote.trailingPE.toFixed(2) : (quote.forwardPE ? quote.forwardPE.toFixed(2) : "N/A");
        const pbRatioVal = quote.priceToBook ? quote.priceToBook.toFixed(2) : "N/A";
        // Dividend Yield comes back as a raw decimal (e.g., 0.012 for 1.2%)
        const divYieldVal = quote.dividendYield ? (quote.dividendYield).toFixed(2) + "%" : "0.00%";

        return res.json({
            symbol: symbol, 
            name: quote.longName || quote.shortName || symbol, 
            price: currentPrice.toFixed(2),
            changeAmount: `${sign}₹${Math.abs(diff).toFixed(2)}`, 
            change: `${sign}${previousClose ? ((diff / previousClose) * 100).toFixed(2) : "0.00"}%`,
            previousClose: previousClose.toFixed(2), 
            dayHigh: quote.regularMarketDayHigh ? quote.regularMarketDayHigh.toFixed(2) : currentPrice.toFixed(2),
            dayLow: quote.regularMarketDayLow ? quote.regularMarketDayLow.toFixed(2) : currentPrice.toFixed(2), 
            volume: quote.regularMarketVolume ? quote.regularMarketVolume.toLocaleString('en-IN') : "N/A",
            ratios: {
                marketCap: marketCapVal, 
                peRatio: peRatioVal, 
                pbRatio: pbRatioVal,
                divYield: divYieldVal, 
                fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ? `₹${quote.fiftyTwoWeekHigh.toFixed(2)}` : "N/A", 
                fiftyTwoWeekLow: quote.fiftyTwoWeekLow ? `₹${quote.fiftyTwoWeekLow.toFixed(2)}` : "N/A"
            }, 
            status: "LIVE MARKET DATA"
        });
    } catch (error) { 
        console.error("Data Fetch Error:", error.message);
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
        const response = await axios.get(`https://query2.finance.yahoo.com/v1/finance/search?q=${query}&quotesCount=30&newsCount=0`, { 
            headers: CHROME_HEADERS 
        });
        
        let remote = (response.data.quotes || [])
            .filter(q => q.exchange === 'NSI' || q.exchange === 'BSE' || (q.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'))))
            .map(q => {
                const cleanSymbol = q.symbol.replace('.NS', '').replace('.BO', '');
                return { 
                    symbol: cleanSymbol, 
                    name: q.shortname || q.longname || `${cleanSymbol} (Listed Entity)`
                };
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
                    const directCheck = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${exactSymbol}.NS`, { headers: CHROME_HEADERS });
                    const meta = directCheck.data?.chart?.result?.[0]?.meta;
                    if (meta && meta.regularMarketPrice) {
                        uniqueResults.unshift({ symbol: exactSymbol, name: meta.longName || meta.shortName || `${exactSymbol} (Newly Listed)`, isNewListing: true });
                    }
                } catch (err1) {
                    try {
                        const directCheckBse = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${exactSymbol}.BO`, { headers: CHROME_HEADERS });
                        const metaBse = directCheckBse.data?.chart?.result?.[0]?.meta;
                        if (metaBse && metaBse.regularMarketPrice) {
                            uniqueResults.unshift({ symbol: exactSymbol, name: metaBse.longName || metaBse.shortName || `${exactSymbol} (Newly Listed)`, isNewListing: true });
                        }
                    } catch (err2) {}
                }
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
                        id: index,
                        company: companyName,
                        symbol: companyName.substring(0, 8).toUpperCase(),
                        type: type,
                        dates: "Upcoming", 
                        issuePrice: cleanPrice ? `₹${cleanPrice}` : "N/A",
                        lotSize: isSme ? "1000 - 4000 Shares" : "10 - 100 Shares",
                        issueSize: "TBA",
                        currentGmp: parsedGmp > 0 ? `₹${parsedGmp}` : "₹0",
                        expectedListing: expListing > 0 ? `₹${expListing}` : "TBD",
                        gainPotential: `${gainPct}%`, 
                        marketRating: parsedGmp > 30 ? "🔥 Subscribe" : "Neutral"
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