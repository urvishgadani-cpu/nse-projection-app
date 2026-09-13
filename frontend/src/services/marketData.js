export async function fetchStockData(symbol) {
    try {
        const response = await fetch(`http://localhost:5000/api/stock/${symbol}`);
        if (!response.ok) throw new Error(`Failed to connect to backend for ${symbol}`);
        return await response.json();
    } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error);
        return null; 
    }
}

export async function fetchStockHistory(symbol) {
    try {
        const response = await fetch(`http://localhost:5000/api/history/${symbol}`);
        if (!response.ok) throw new Error("History API failed");
        return await response.json();
    } catch (error) {
        return [];
    }
}

export async function fetchStockNews(symbol) {
    try {
        const response = await fetch(`http://localhost:5000/api/news/${symbol}`);
        if (!response.ok) throw new Error("News API failed");
        return await response.json();
    } catch (error) {
        return [];
    }
}

export async function searchStocks(query) {
    try {
        if (!query) return [];
        const response = await fetch(`http://localhost:5000/api/search/${query}`);
        if (!response.ok) throw new Error("Search API failed");
        return await response.json();
    } catch (error) {
        return [];
    }
}

export async function fetchIpoData() {
    try {
        const response = await fetch('http://localhost:5000/api/ipos');
        if (!response.ok) throw new Error("IPO API failed");
        return await response.json();
    } catch (error) {
        return [];
    }
}