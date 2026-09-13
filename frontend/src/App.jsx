import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import Login from './pages/login'; // Kept lowercase to fix your Windows file error
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard'; 
import { useAuth } from './contexts/AuthContext';

function Navbar() {
    const { currentUser, logout } = useAuth();

    return (
        <nav style={{ display: "flex", justifyContent: "space-between", padding: "15px 30px", backgroundColor: "#1e293b", color: "white", alignItems: "center", borderBottom: "1px solid #334155" }}>
            <h3 style={{ margin: 0 }}>NSE Stock App</h3>
            <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                <Link to="/" style={{ color: "white", textDecoration: "none" }}>Dashboard</Link>
                {currentUser ? (
                    <button onClick={logout} style={{ padding: "6px 12px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>
                        Log Out
                    </button>
                ) : (
                    <>
                        <Link to="/login" style={{ color: "white", textDecoration: "none" }}>Log In</Link>
                        <Link to="/signup" style={{ padding: "6px 12px", backgroundColor: "#38bdf8", color: "#0f172a", borderRadius: "4px", textDecoration: "none", fontWeight: "bold" }}>Sign Up</Link>
                    </>
                )}
            </div>
        </nav>
    );
}

export default function App() {
    const { currentUser, loading } = useAuth();

    if (loading) {
        return <div style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}><h2>Loading...</h2></div>;
    }

    return (
        <Router>
            <div style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#f8fafc" }}>
                <Navbar />
                <Routes>
                    {/* If logged in, redirect away from auth pages. If not, show them. */}
                    <Route path="/signup" element={!currentUser ? <Signup /> : <Navigate to="/" />} />
                    
                    {/* Notice the capital L in <Login /> here! */}
                    <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />
                    
                    {/* STRICT GATE: If NOT logged in, redirect immediately to /login */}
                    <Route path="/" element={currentUser ? <Dashboard /> : <Navigate to="/login" />} />
                </Routes>
            </div>
        </Router>
    );
}