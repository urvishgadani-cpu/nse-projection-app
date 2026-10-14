const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

// --- 1. PINPOINT ACCURATE STOCK DATA API (TRADINGVIEW ENGINE) ---
app.get('/api/stock/:symbol', async (req, res) => {
    let symbol = req.params.symbol.toUpperCase();
    if (symbol === 'ETERNAL') symbol = 'ZOMATO';

    try {
        const response = await axios.post('https://scanner.tradingview.com/india/scan', {
            symbols: { tickers: [`NSE:${symbol}`, `BSE:${symbol}`] },
            columns: [
                "close", "change", "change_abs", 
                "market_cap_basic", "price_earnings_ttm", "price_book_ratio", 
                "dividend_yield_recent", "price_52_week_high", "price_52_week_low", 
                "volume", "description", "high", "low"
            ]
        }, { timeout: 5000 }); 

        if (!response.data || !response.data.data || response.data.data.length === 0) {
            throw new Error("Symbol not found on exchange");
        }

        const tvData = response.data.data;
        const match = tvData.find(item => item.s.startsWith("NSE:")) || tvData[0];
        const data = match.d;
        
        const currentPrice = data[0] || 0;
        const changePct = data[1] || 0;
        const changeAbs = data[2] || 0;
        const mcap = data[3];
        const pe = data[4];
        const pb = data[5];
        const div = data[6];
        const high52 = data[7];
        const low52 = data[8];
        const volume = data[9] || 0;
        const name = data[10] || symbol;
        const dayHigh = data[11] || currentPrice;
        const dayLow = data[12] || currentPrice;

        const sign = changeAbs > 0 ? "+" : "";
        const previousClose = currentPrice - changeAbs;

        return res.json({
            symbol: symbol,
            name: name,
            price: currentPrice.toFixed(2),
            changeAmount: `${sign}₹${Math.abs(changeAbs).toFixed(2)}`,
            change: `${sign}${changePct.toFixed(2)}%`,
            previousClose: previousClose.toFixed(2),
            dayHigh: dayHigh.toFixed(2),
            dayLow: dayLow.toFixed(2),
            volume: volume.toLocaleString('en-IN'),
            ratios: {
                marketCap: mcap ? `₹${(mcap / 10000000).toFixed(2)} Cr` : "N/A",
                peRatio: pe ? pe.toFixed(2) : "N/A",
                pbRatio: pb ? pb.toFixed(2) : "N/A",
                divYield: div ? div.toFixed(2) + "%" : "0.00%",
                fiftyTwoWeekHigh: high52 ? `₹${high52.toFixed(2)}` : "N/A",
                fiftyTwoWeekLow: low52 ? `₹${low52.toFixed(2)}` : "N/A"
            },
            status: "LIVE MARKET DATA"
        });

    } catch (error) {
        return res.json({
            symbol: req.params.symbol.toUpperCase(), 
            name: "Unknown or Delisted Stock", 
            price: "N/A", changeAmount: "N/A", change: "N/A", 
            previousClose: "N/A", status: "UNAVAILABLE / DELISTED"
        });
    }
});

// --- 2. STOCK HISTORY API ---
app.get('/api/history/:symbol', async (req, res) => {
    let symbol = req.params.symbol.toUpperCase();
    if (symbol === 'ETERNAL') symbol = 'ZOMATO';

    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?range=1d&interval=5m`;
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
        const result = response.data.chart.result[0];
        
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
    let symbol = req.params.symbol.toUpperCase();
    if (symbol === 'ETERNAL') symbol = 'ZOMATO';
    try {
        const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=4`;
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
        res.json((response.data.news || []).map(n => ({ 
            title: n.title, publisher: n.publisher, link: n.link, 
            time: new Date(n.providerPublishTime * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) 
        })));
    } catch (err) { res.json([]); }
});

// --- 4. ADVANCED SEARCH API ---
app.get('/api/search/:query', async (req, res) => {
    const query = req.params.query.toLowerCase().trim();
    try {
        const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${query}&quotesCount=15&newsCount=0`;
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
        
        let remote = (response.data.quotes || [])
            .filter(q => q.exchange === 'NSI' || q.exchange === 'BSE' || (q.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'))))
            .map(q => {
                const cleanSymbol = q.symbol.replace('.NS', '').replace('.BO', '');
                return { symbol: cleanSymbol, name: q.shortname || q.longname || `${cleanSymbol} (Listed Entity)` };
            });

        let uniqueResults = Array.from(new Map(remote.map(item => [item.symbol, item])).values());
        
        uniqueResults.sort((a, b) => {
            const aStarts = a.symbol.toLowerCase().startsWith(query);
            const bStarts = b.symbol.toLowerCase().startsWith(query);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
        });
        
        res.json(uniqueResults);
    } catch (e) { res.json([]); }
});

// --- 5. DETAILED IPO JI STYLE API ---
app.get('/api/ipos', async (req, res) => {
    try {
        const response = await axios.get('https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 8000
        });
        
        const $ = cheerio.load(response.data);
        const ipos = [];

        // FIX: Ultra-forgiving selector that scans all tables and filters dynamically
        $('table tr').each((index, element) => {
            try {
                if (ipos.length >= 15) return; // Limit to 15 IPOs to prevent parsing footer tables

                const columns = $(element).find('td');
                if (columns.length < 4) return; // Skip headers (th) or empty rows

                const companyNameRaw = $(columns[0]).text().trim();
                const gmpRaw = $(columns[1]).text().trim();
                const col2 = $(columns[2]).text().trim();
                const col3 = $(columns[3]).text().trim();
                
                // Skip if this row is actually a header row pretending to be data
                if (companyNameRaw.toLowerCase().includes('ipo name') || companyNameRaw.toLowerCase().includes('company')) return;

                // FIX: Column Shifting Protection (Price is sometimes in col 2, sometimes col 3)
                const priceBandRaw = (/\d/.test(col2)) ? col2 : col3;
                
                const isSme = companyNameRaw.toUpperCase().includes('SME');
                const type = isSme ? "SME" : "Mainboard";
                const companyName = companyNameRaw.replace(/IPO|SME/gi, '').trim(); 
                
                const gmp = gmpRaw.replace(/[^0-9]/g, '') || "0";
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
                        dates: "Upcoming / Active", 
                        issuePrice: parsedPrice > 0 ? `₹${parsedPrice}` : "TBA",
                        lotSize: isSme ? "1000 - 4000 Shares" : "10 - 100 Shares", 
                        issueSize: "TBA",
                        currentGmp: parsedGmp > 0 ? `₹${parsedGmp}` : "₹0",
                        expectedListing: expListing > 0 ? `₹${expListing}` : "TBD",
                        gainPotential: `${gainPct}%`, 
                        marketRating: parsedGmp > 30 ? "🔥 Subscribe" : "Neutral"
                    });
                }
            } catch (rowError) { 
                // Ignore silent parsing errors on individual weird rows
            }
        });

        if(ipos.length > 0) return res.json(ipos);
        throw new Error("Scraper returned zero rows.");
    } catch (error) { 
        console.error("IPO Scraper Error:", error.message);
        return res.json([]); 
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend Server running on port ${PORT}`));