import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getDatabase, ref, set, onValue } from 'firebase/database';
import { getAuth, signOut } from 'firebase/auth';
import { fetchStockData, searchStocks, fetchIpoData, fetchStockHistory, fetchStockNews } from '../services/marketData';

export default function Dashboard() {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('stocks'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    
    const [selectedStock, setSelectedStock] = useState(null);
    
    // Use a ref to always track the latest selected stock without breaking useEffect triggers
    const selectedStockRef = useRef(selectedStock);
    useEffect(() => {
        selectedStockRef.current = selectedStock;
    }, [selectedStock]);

    const [stockHistory, setStockHistory] = useState([]);
    const [stockNews, setStockNews] = useState([]);
    const [watchlist, setWatchlist] = useState([]);
    const [ipos, setIpos] = useState([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [years, setYears] = useState(3);
    const [expectedGrowth, setExpectedGrowth] = useState(12);

    const db = getDatabase(); 
    const [nseStocks, setNseStocks] = useState([
        { symbol: "RELIANCE", name: "Reliance Industries Ltd", price: "...", change: "...", status: "FETCHING" },
        { symbol: "TCS", name: "Tata Consultancy Services", price: "...", change: "...", status: "FETCHING" },
        { symbol: "INFY", name: "Infosys Limited", price: "...", change: "...", status: "FETCHING" },
        { symbol: "ETERNAL", name: "Eternal Ltd (Formerly Zomato)", price: "...", change: "...", status: "FETCHING" }
    ]);

    // Background Refresher (Updates core grid without stealing user focus)
    const loadRealMarketData = async () => {
        setIsRefreshing(true);
        const updatedData = await Promise.all(nseStocks.map(s => fetchStockData(s.symbol)));
        
        setNseStocks(prev => prev.map(stock => updatedData.find(d => d && d.symbol === stock.symbol) || stock));

        // Safely update selected stock prices in the background *only if* the user is actively viewing one
        if (selectedStockRef.current) {
            const freshActive = updatedData.find(d => d && d.symbol === selectedStockRef.current.symbol);
            if (freshActive) {
                setSelectedStock(prev => ({ ...prev, ...freshActive }));
            }
        }

        const ipoData = await fetchIpoData();
        setIpos(ipoData);
        setIsRefreshing(false);
    };

    // Global Grid Poll (Every 60s)
    useEffect(() => {
        loadRealMarketData();
        const interval = setInterval(loadRealMarketData, 60000); 
        return () => clearInterval(interval);
    }, []);

    // Dedicated effect for when the user explicitly clicks a new stock
    useEffect(() => {
        if (selectedStock && selectedStock.symbol) {
            fetchStockHistory(selectedStock.symbol).then(setStockHistory);
            fetchStockNews(selectedStock.symbol).then(setStockNews);
        }
    }, [selectedStock?.symbol]);

    useEffect(() => {
        if (currentUser) return onValue(ref(db, `watchlists/${currentUser.uid}`), (snapshot) => setWatchlist(snapshot.val() || []));
    }, [currentUser, db]);

    useEffect(() => {
        const delaySearch = setTimeout(async () => {
            if (searchTerm.trim().length > 1) {
                setIsSearching(true); setSearchResults(await searchStocks(searchTerm)); setIsSearching(false);
            } else setSearchResults([]);
        }, 300);
        return () => clearTimeout(delaySearch);
    }, [searchTerm]);

    const handleSelectSearchResult = async (result) => {
        setSearchTerm(''); setSearchResults([]);
        const temp = { symbol: result.symbol, name: result.name, price: "...", status: "FETCHING" };
        setSelectedStock(temp);
        const liveData = await fetchStockData(result.symbol);
        setSelectedStock(liveData ? { ...temp, ...liveData } : { ...temp, status: "UNAVAILABLE" });
    };

    const toggleWatchlist = () => {
        if (!selectedStock || !currentUser) return;
        const isSaved = watchlist.some(s => s.symbol === selectedStock.symbol);
        set(ref(db, `watchlists/${currentUser.uid}`), isSaved ? watchlist.filter(s => s.symbol !== selectedStock.symbol) : [...watchlist, selectedStock]);
    };

    // --- GRAPH CALCULATIONS ---
    const currentVal = selectedStock && !isNaN(parseFloat(selectedStock.price)) ? parseFloat(selectedStock.price) : 0;
    const prevClose = selectedStock && !isNaN(parseFloat(selectedStock.previousClose)) ? parseFloat(selectedStock.previousClose) : 0;
    const histPrices = stockHistory.map(h => h.price);
    
    const rawMax = histPrices.length > 0 ? Math.max(...histPrices, prevClose) : 100;
    const rawMin = histPrices.length > 0 ? Math.min(...histPrices, prevClose) : 0;
    const maxHist = rawMax + (rawMax - rawMin) * 0.1;
    const minHist = rawMin - (rawMax - rawMin) * 0.1;
    
    const chartHeight = 180, chartWidth = 750, marginLeft = 45;
    const lineColor = currentVal >= prevClose ? "#4ade80" : "#ef4444"; 
    const prevCloseY = chartHeight - ((prevClose - minHist) / (maxHist - minHist || 1)) * chartHeight;

    const histPoints = stockHistory.map((h, idx) => {
        const x = marginLeft + (idx / (stockHistory.length - 1 || 1)) * (chartWidth - marginLeft);
        const y = chartHeight - ((h.price - minHist) / (maxHist - minHist || 1)) * chartHeight;
        return `${x},${y}`;
    }).join(' ');

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
        const val = minHist + (maxHist - minHist) * ratio;
        return { val: val.toFixed(0), y: chartHeight - ratio * chartHeight };
    });

    const projChartData = Array.from({ length: years + 1 }, (_, i) => parseFloat((currentVal * Math.pow(1 + expectedGrowth / 100, i)).toFixed(2)));
    const maxProj = Math.max(...projChartData, currentVal * 1.1);
    const minProj = Math.min(...projChartData, currentVal * 0.9);
    const projPoints = projChartData.map((val, idx) => `${(idx / (years || 1)) * chartWidth},${chartHeight - ((val - minProj) / (maxProj - minProj || 1)) * chartHeight}`).join(' ');

    return (
        <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "1000px", margin: "0 auto", color: "white" }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <div>
                    <h2>NSE Market Dashboard</h2>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
                        <span style={{ color: "#4ade80", display: "flex", alignItems: "center", gap: "5px" }}><span style={{ height: "8px", width: "8px", backgroundColor: "#4ade80", borderRadius: "50%", display: "inline-block" }}></span> Live Data Connected</span>
                    </div>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <button onClick={() => setActiveTab('stocks')} style={{ padding: "8px 14px", backgroundColor: activeTab === 'stocks' ? "#38bdf8" : "#1e293b", color: activeTab === 'stocks' ? "#0f172a" : "white", border: "1px solid #475569", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>Stocks & Analysis</button>
                    <button onClick={() => setActiveTab('ipos')} style={{ padding: "8px 14px", backgroundColor: activeTab === 'ipos' ? "#38bdf8" : "#1e293b", color: activeTab === 'ipos' ? "#0f172a" : "white", border: "1px solid #475569", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>🚀 Active IPO Tracker</button>
                    <button onClick={loadRealMarketData} disabled={isRefreshing} style={{ padding: "8px 14px", backgroundColor: "#334155", color: "white", border: "1px solid #475569", borderRadius: "6px", cursor: "pointer" }}>🔄</button>
                    <button onClick={() => signOut(getAuth())} style={{ padding: "8px 12px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>Sign Out</button>
                </div>
            </div>

            {activeTab === 'stocks' && (
                <>
                    <div style={{ marginBottom: "30px", position: "relative" }}>
                        <input type="text" placeholder="Search ANY NSE stock to inspect (e.g. ETERNAL, TATAMOTORS)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: "100%", padding: "14px", backgroundColor: "#1e293b", color: "white", border: "1px solid #475569", borderRadius: "8px", fontSize: "16px", outline: "none", boxSizing: "border-box" }} />
                        {(searchResults.length > 0 || isSearching) && (
                            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, backgroundColor: "#0f172a", border: "1px solid #38bdf8", borderRadius: "8px", marginTop: "5px", zIndex: 10, maxHeight: "300px", overflowY: "auto" }}>
                                {isSearching ? <div style={{ padding: "15px", color: "#94a3b8", textAlign: "center" }}>Searching NSE...</div> : searchResults.map((res, idx) => (
                                    <div key={idx} onClick={() => handleSelectSearchResult(res)} style={{ padding: "15px", borderBottom: "1px solid #1e293b", cursor: "pointer" }}>
                                        <span style={{ fontWeight: "bold", color: "#38bdf8", marginRight: "10px" }}>{res.symbol}</span><span style={{ color: "#94a3b8" }}>{res.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
                        {nseStocks.map((stock) => (
                            <div key={stock.symbol} onClick={() => setSelectedStock(stock)} style={{ padding: "20px", backgroundColor: "#1e293b", border: selectedStock?.symbol === stock.symbol ? "2px solid #38bdf8" : "1px solid #334155", borderRadius: "10px", cursor: "pointer" }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <h3 style={{ margin: "0 0 2px 0", color: "#38bdf8" }}>{stock.symbol}</h3>
                                    <span style={{ color: String(stock.change).startsWith("+") ? "#4ade80" : "#f87171", fontSize: "14px", fontWeight: "bold" }}>{stock.change}</span>
                                </div>
                                <p style={{ margin: "10px 0 15px 0", fontSize: "13px", color: "#94a3b8", height: "32px", overflow: "hidden" }}>{stock.name}</p>
                                <p style={{ margin: "0", fontWeight: "bold", fontSize: "22px" }}>₹{stock.price}</p>
                            </div>
                        ))}
                    </div>

                    {selectedStock && (
                        <div style={{ marginTop: "40px", padding: "25px", backgroundColor: "#1e293b", border: "1px solid #38bdf8", borderRadius: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                                <div>
                                    <h3 style={{ margin: "0", color: "#38bdf8" }}>{selectedStock.name} ({selectedStock.symbol})</h3>
                                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>Status: {selectedStock.status}</span>
                                </div>
                                <div style={{ display: "flex", gap: "10px" }}>
                                    <a href={`https://www.screener.in/company/${selectedStock.symbol}/consolidated/#documents`} target="_blank" rel="noreferrer" style={{ padding: "8px 12px", backgroundColor: "#38bdf8", color: "#0f172a", textDecoration: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "14px" }}>
                                        📄 Annual Reports (Screener)
                                    </a>
                                    <button onClick={toggleWatchlist} style={{ padding: "8px 12px", backgroundColor: watchlist.some(s => s.symbol === selectedStock.symbol) ? "#ef4444" : "#eab308", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
                                        {watchlist.some(s => s.symbol === selectedStock.symbol) ? "❌ Remove Watchlist" : "⭐ Save Watchlist"}
                                    </button>
                                </div>
                            </div>

                            {/* Financials & Key Ratios */}
                            {selectedStock.ratios && (
                                <div style={{ padding: "20px", backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155", marginBottom: "25px" }}>
                                    <h4 style={{ margin: "0 0 15px 0", color: "#38bdf8" }}>📊 Key Ratios & Valuation</h4>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "15px" }}>
                                        <div><span style={{ fontSize: "11px", color: "#94a3b8" }}>Market Cap</span><p style={{ margin: "4px 0 0 0", fontWeight: "bold" }}>{selectedStock.ratios.marketCap}</p></div>
                                        <div><span style={{ fontSize: "11px", color: "#94a3b8" }}>P/E Ratio</span><p style={{ margin: "4px 0 0 0", fontWeight: "bold" }}>{selectedStock.ratios.peRatio}</p></div>
                                        <div><span style={{ fontSize: "11px", color: "#94a3b8" }}>P/B Ratio</span><p style={{ margin: "4px 0 0 0", fontWeight: "bold" }}>{selectedStock.ratios.pbRatio}</p></div>
                                        <div><span style={{ fontSize: "11px", color: "#94a3b8" }}>Dividend Yield</span><p style={{ margin: "4px 0 0 0", fontWeight: "bold" }}>{selectedStock.ratios.divYield}</p></div>
                                        <div><span style={{ fontSize: "11px", color: "#94a3b8" }}>52W High</span><p style={{ margin: "4px 0 0 0", fontWeight: "bold", color: "#4ade80" }}>{selectedStock.ratios.fiftyTwoWeekHigh}</p></div>
                                        <div><span style={{ fontSize: "11px", color: "#94a3b8" }}>52W Low</span><p style={{ margin: "4px 0 0 0", fontWeight: "bold", color: "#f87171" }}>{selectedStock.ratios.fiftyTwoWeekLow}</p></div>
                                    </div>
                                </div>
                            )}

                            {/* Intraday Market Graph */}
                            <div style={{ padding: "20px", backgroundColor: "#1c1c1c", borderRadius: "8px", border: "1px solid #333", marginBottom: "25px" }}>
                                <div style={{ position: "relative" }}>
                                    {stockHistory.length > 0 ? (
                                        <>
                                            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: "100%", height: "200px", overflow: "visible" }}>
                                                {yTicks.map((tick, i) => (
                                                    <g key={i}>
                                                        <text x="0" y={tick.y + 4} fill="#64748b" fontSize="12px">{tick.val}</text>
                                                        <line x1={marginLeft} y1={tick.y} x2={chartWidth} y2={tick.y} stroke="#333" strokeDasharray="2 4" />
                                                    </g>
                                                ))}

                                                <line x1={marginLeft} y1={prevCloseY} x2={chartWidth} y2={prevCloseY} stroke="#94a3b8" strokeDasharray="2 4" strokeWidth="1.5" />
                                                <text x={chartWidth - 65} y={prevCloseY - 15} fill="#94a3b8" fontSize="11px">Prev close</text>
                                                <text x={chartWidth - 55} y={prevCloseY - 3} fill="#94a3b8" fontSize="11px">{prevClose.toFixed(2)}</text>
                                                
                                                <polyline fill="none" stroke={lineColor} strokeWidth="2.5" points={histPoints} />
                                                <circle cx={chartWidth} cy={chartHeight - ((histPrices[histPrices.length - 1] - minHist) / (maxHist - minHist || 1)) * chartHeight} r="4" fill={lineColor} />
                                            </svg>
                                            <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: "12px", marginTop: "15px", paddingLeft: `${marginLeft}px` }}>
                                                <span>10 AM</span><span>11 AM</span><span>12 PM</span><span>1 PM</span><span>2 PM</span><span>3 PM</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ color: "#94a3b8", textAlign: "center", padding: "50px 0" }}>Loading intraday data...</div>
                                    )}
                                </div>
                            </div>

                            {/* Trust-Backed Pros & Cons Section */}
                            <div style={{ padding: "20px", backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155", marginBottom: "25px" }}>
                                <h4 style={{ margin: "0 0 15px 0", color: "#f8fafc" }}>⚖️ Pros & Cons of Investing in {selectedStock.name} (Listed Equity)</h4>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                                    <div style={{ padding: "15px", backgroundColor: "rgba(74, 222, 128, 0.05)", borderLeft: "3px solid #4ade80", borderRadius: "4px" }}>
                                        <h5 style={{ color: "#4ade80", margin: "0 0 10px 0" }}>Pros (Advantages)</h5>
                                        <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#94a3b8", lineHeight: "1.6" }}>
                                            <li><strong>High Liquidity:</strong> Regulated exchanges like the NSE provide continuous markets, allowing investors to buy or sell shares instantly during standard trading hours without being locked into illiquid assets.</li>
                                            <li><strong>Strict Regulatory Transparency:</strong> Listed entities are bound by SEBI regulations, strictly mandating quarterly financial audits, corporate governance disclosures, and annual reports. (Access real-time reports via the Screener link above).</li>
                                            <li><strong>Fair Price Discovery:</strong> Prices are driven by transparent, algorithmic exchange order books based on supply and demand, preventing extreme price manipulation frequently seen in unlisted or private grey markets.</li>
                                        </ul>
                                    </div>
                                    <div style={{ padding: "15px", backgroundColor: "rgba(239, 68, 68, 0.05)", borderLeft: "3px solid #ef4444", borderRadius: "4px" }}>
                                        <h5 style={{ color: "#ef4444", margin: "0 0 10px 0" }}>Cons (Risks)</h5>
                                        <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#94a3b8", lineHeight: "1.6" }}>
                                            <li><strong>Systematic Market Risk:</strong> Listed shares are highly vulnerable to macroeconomic volatility. Even fundamentally solid companies can suffer sharp price drops due to external factors like inflation data, geopolitical tensions, or broad sector selloffs.</li>
                                            <li><strong>Valuation Bubbles:</strong> Heavy public retail demand can drive a company's Price-to-Earnings (P/E) ratio far beyond its intrinsic fundamental value, leading to severe capital losses when market sentiment inevitably corrects.</li>
                                            <li><strong>No Operational Control:</strong> Retail investors hold negligible voting power compared to institutional investors and company promoters, leaving them subject to management decisions they cannot realistically influence.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Sector News Feed */}
                            <div style={{ padding: "20px", backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155", marginBottom: "25px" }}>
                                <h4 style={{ margin: "0 0 15px 0", color: "#f8fafc" }}>📰 Sector & Company News</h4>
                                {stockNews.length > 0 ? (
                                    <div style={{ display: "grid", gap: "10px" }}>
                                        {stockNews.map((news, idx) => (
                                            <a key={idx} href={news.link} target="_blank" rel="noreferrer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", backgroundColor: "#1e293b", borderRadius: "6px", textDecoration: "none", color: "white", border: "1px solid #334155", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#334155'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1e293b'}>
                                                <span style={{ fontSize: "14px", fontWeight: "bold", color: "#38bdf8" }}>{news.title}</span>
                                                <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "15px", whiteSpace: "nowrap" }}>{news.publisher} ({news.time})</span>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: "#94a3b8", fontSize: "13px" }}>No recent news headlines available for this company.</p>
                                )}
                            </div>

                            {/* Growth Projection Engine */}
                            <div style={{ padding: "20px", backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155" }}>
                                <h4 style={{ margin: "0 0 15px 0", color: "#f8fafc" }}>📊 Interactive Estimation Engine</h4>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                                    <div><label style={{ fontSize: "13px", color: "#94a3b8" }}>Horizon: {years} Yrs</label><input type="range" min="1" max="10" value={years} onChange={(e) => setYears(Number(e.target.value))} style={{ width: "100%" }} /></div>
                                    <div><label style={{ fontSize: "13px", color: "#94a3b8" }}>Expected CAGR: {expectedGrowth}%</label><input type="range" min="1" max="30" value={expectedGrowth} onChange={(e) => setExpectedGrowth(Number(e.target.value))} style={{ width: "100%" }} /></div>
                                </div>
                                <svg viewBox={`0 0 ${chartWidth} 160`} style={{ width: "100%", height: "160px", overflow: "visible" }}>
                                    <polyline fill="none" stroke="#38bdf8" strokeWidth="2.5" points={projPoints} />
                                    {projChartData.map((val, idx) => <circle key={idx} cx={(idx / (years || 1)) * chartWidth} cy={160 - ((val - minProj) / (maxProj - minProj || 1)) * 160} r="4" fill="#38bdf8" />)}
                                </svg>
                            </div>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'ipos' && (
                <div style={{ backgroundColor: "#1e293b", padding: "25px", borderRadius: "10px", border: "1px solid #38bdf8" }}>
                    <h3 style={{ color: "#38bdf8", marginTop: 0 }}>🚀 September 2026 Active IPOs</h3>
                    <div style={{ display: "grid", gap: "15px" }}>
                        {ipos.map((ipo, idx) => (
                            <div key={idx} style={{ padding: "18px", backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", alignItems: "center", gap: "15px" }}>
                                <div><h4 style={{ margin: "0 0 4px 0", color: "#f8fafc" }}>{ipo.company}</h4><span style={{ fontSize: "12px", color: "#38bdf8" }}>Sector: {ipo.sector} | Opens: {ipo.openDate}</span></div>
                                <div><span style={{ fontSize: "11px", color: "#94a3b8" }}>Issue Price</span><p style={{ margin: "2px 0 0 0", fontWeight: "bold" }}>{ipo.issuePrice}</p></div>
                                <div><span style={{ fontSize: "11px", color: "#94a3b8" }}>GMP (Est.)</span><p style={{ margin: "2px 0 0 0", fontWeight: "bold", color: "#4ade80" }}>{ipo.currentGmp}</p></div>
                                <div><span style={{ fontSize: "11px", color: "#94a3b8" }}>Exp. Listing</span><p style={{ margin: "2px 0 0 0", fontWeight: "bold", color: "#38bdf8" }}>{ipo.expectedListing} ({ipo.gainPotential})</p></div>
                                <div style={{ textAlign: "right" }}><span style={{ padding: "4px 8px", backgroundColor: "#1e293b", color: "#eab308", border: "1px solid #eab308", borderRadius: "4px", fontSize: "11px", fontWeight: "bold" }}>{ipo.marketRating}</span></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}