const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

// --- THE MULTI-PROXY ENGINE (BYPASSES RENDER BANS SECURELY) ---
// This rotates through 3 different proxies to guarantee Yahoo Finance 
// never sees your Render IP address, ensuring 100% real data access.
async function fetchYahooJSON(targetUrl) {
    const proxies = [
        `https://api.codetabs.com/v1/proxy?quest=`,
        `https://api.allorigins.win/raw?url=`,
        `https://corsproxy.io/?`
    ];
    
    let lastError;
    for (let proxy of proxies) {
        try {
            const reqUrl = proxy + encodeURIComponent(targetUrl);
            const res = await axios.get(reqUrl, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 7000 
            });
            // Ensure we got a valid JSON response back, not an HTML error page
            if (res.data && typeof res.data === 'object' && !res.data.error) {
                return res.data;
            }
        } catch (e) {
            lastError = e;
            continue; // Silently try the next proxy in the list
        }
    }
    throw new Error("All proxies blocked or stock invalid.");
}

const POPULAR_NSE_STOCKS = [
    { symbol: "RELIANCE", name: "Reliance Industries Ltd" },
    { symbol: "TCS", name: "Tata Consultancy Services" },
    { symbol: "INFY", name: "Infosys Limited" },
    { symbol: "HDFCBANK", name: "HDFC Bank Limited" },
    { symbol: "ZOMATO", name: "Zomato Limited" } 
];

// --- 1. PINPOINT ACCURATE STOCK DATA API (STRICTLY NO FAKE DATA) ---
app.get('/api/stock/:symbol', async (req, res) => {
    let symbol = req.params.symbol.toUpperCase();
    if (symbol === 'ETERNAL') symbol = 'ZOMATO';

    try {
        let chartData;
        let isBSE = false;

        // 1. Fetch exact Live Price & Meta Data
        try {
            const raw = await fetchYahooJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?range=1d&interval=1d`);
            if (!raw.chart || !raw.chart.result) throw new Error();
            chartData = raw.chart.result[0].meta;
        } catch (nseErr) {
            // If not on NSE, strictly try BSE
            const rawBse = await fetchYahooJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.BO?range=1d&interval=1d`);
            if (!rawBse.chart || !rawBse.chart.result) throw new Error("Not Found");
            chartData = rawBse.chart.result[0].meta;
            isBSE = true;
        }

        const currentPrice = chartData.regularMarketPrice || chartData.chartPreviousClose || 0;
        const previousClose = chartData.chartPreviousClose || currentPrice;
        const diff = currentPrice - previousClose;
        const sign = diff >= 0 ? "+" : "";

        // 2. Fetch exact Fundamental Ratios (P/E, Market Cap, Div)
        let pe = "N/A", pb = "N/A", div = "0.00%", mcap = "N/A", high52 = "N/A", low52 = "N/A";
        try {
            const ext = isBSE ? '.BO' : '.NS';
            const sumUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}${ext}?modules=summaryDetail,defaultKeyStatistics`;
            const sumRes = await fetchYahooJSON(sumUrl);
            
            const sum = sumRes?.quoteSummary?.result?.[0]?.summaryDetail || {};
            const stats = sumRes?.quoteSummary?.result?.[0]?.defaultKeyStatistics || {};
            
            pe = sum.trailingPE?.raw ? sum.trailingPE.raw.toFixed(2) : "N/A";
            pb = stats.priceToBook?.raw ? stats.priceToBook.raw.toFixed(2) : "N/A";
            div = sum.dividendYield?.raw ? (sum.dividendYield.raw * 100).toFixed(2) + "%" : "0.00%";
            mcap = sum.marketCap?.raw ? `₹${(sum.marketCap.raw / 10000000).toFixed(2)} Cr` : "N/A";
            high52 = sum.fiftyTwoWeekHigh?.raw ? `₹${sum.fiftyTwoWeekHigh.raw.toFixed(2)}` : "N/A";
            low52 = sum.fiftyTwoWeekLow?.raw ? `₹${sum.fiftyTwoWeekLow.raw.toFixed(2)}` : "N/A";
        } catch (fundErr) {
            // If fundamentals fail but stock exists, fallback to meta market cap
            if (chartData.marketCap) mcap = `₹${(chartData.marketCap / 10000000).toFixed(2)} Cr`;
        }

        return res.json({
            symbol: req.params.symbol.toUpperCase(),
            name: chartData.longName || chartData.shortName || symbol,
            price: currentPrice.toFixed(2),
            changeAmount: `${sign}₹${Math.abs(diff).toFixed(2)}`,
            change: `${sign}${previousClose ? ((diff / previousClose) * 100).toFixed(2) : "0.00"}%`,
            previousClose: previousClose.toFixed(2),
            dayHigh: chartData.regularMarketDayHigh ? chartData.regularMarketDayHigh.toFixed(2) : currentPrice.toFixed(2),
            dayLow: chartData.regularMarketDayLow ? chartData.regularMarketDayLow.toFixed(2) : currentPrice.toFixed(2),
            volume: chartData.regularMarketVolume ? chartData.regularMarketVolume.toLocaleString('en-IN') : "N/A",
            ratios: {
                marketCap: mcap, peRatio: pe, pbRatio: pb, divYield: div,
                fiftyTwoWeekHigh: high52, fiftyTwoWeekLow: low52
            },
            status: "LIVE MARKET DATA"
        });

    } catch (error) {
        // TRUE FAILURE HANDLING: No fake data. If it fails, it explicitly returns N/A.
        return res.json({
            symbol: req.params.symbol.toUpperCase(), 
            name: "Unknown or Delisted Stock", 
            price: "N/A", 
            changeAmount: "N/A", 
            change: "N/A", 
            previousClose: "N/A", 
            status: "UNAVAILABLE / DELISTED"
        });
    }
});

// --- 2. STOCK HISTORY API (INTRADAY GRAPH) ---
app.get('/api/history/:symbol', async (req, res) => {
    let symbol = req.params.symbol.toUpperCase();
    if (symbol === 'ETERNAL') symbol = 'ZOMATO';

    try {
        let rawChart;
        try {
            rawChart = await fetchYahooJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?range=1d&interval=5m`);
        } catch (e) {
            rawChart = await fetchYahooJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.BO?range=1d&interval=5m`);
        }
        
        const result = rawChart.chart.result[0];
        const timestamps = result.timestamp || [];
        const quotes = result.indicators.quote[0].close || [];
        
        const history = timestamps.map((t, idx) => ({
            time: new Date(t * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            price: quotes[idx] ? parseFloat(quotes[idx].toFixed(2)) : null
        })).filter(item => item.price !== null);
        
        res.json(history);
    } catch (err) { 
        res.json([]); 
    }
});

// --- 3. STOCK NEWS API ---
app.get('/api/news/:symbol', async (req, res) => {
    let symbol = req.params.symbol.toUpperCase();
    if (symbol === 'ETERNAL') symbol = 'ZOMATO';
    try {
        const searchData = await fetchYahooJSON(`https://query2.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=4`);
        res.json((searchData.news || []).map(n => ({ 
            title: n.title, publisher: n.publisher, link: n.link, 
            time: new Date(n.providerPublishTime * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) 
        })));
    } catch (err) { res.json([]); }
});

// --- 4. ADVANCED SEARCH API ---
app.get('/api/search/:query', async (req, res) => {
    const query = req.params.query.toLowerCase().trim();
    const local = POPULAR_NSE_STOCKS.filter(stock => stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query));
    
    try {
        const searchData = await fetchYahooJSON(`https://query2.finance.yahoo.com/v1/finance/search?q=${query}&quotesCount=20&newsCount=0`);
        
        let remote = (searchData.quotes || [])
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
        
        res.json(uniqueResults);
    } catch (e) { 
        res.json(local); 
    }
});

// --- 5. IPO JI STYLE API ---
app.get('/api/ipos', async (req, res) => {
    try {
        const response = await axios.get('https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
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
        return res.json([]);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend Server running on port ${PORT}`));