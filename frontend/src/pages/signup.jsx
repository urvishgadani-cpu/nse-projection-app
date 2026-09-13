import React, { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { Link } from 'react-router-dom';

export default function Signup() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const auth = getAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            return setError('Passwords do not match.');
        }
        if (password.length < 6) {
            return setError('Password must be at least 6 characters.');
        }

        setLoading(true);

        try {
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: "85vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "white", padding: "20px" }}>
            <div style={{ width: "100%", maxWidth: "400px", backgroundColor: "#1e293b", padding: "35px", borderRadius: "12px", border: "1px solid #334155", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
                
                <div style={{ textAlign: "center", marginBottom: "25px" }}>
                    <h2 style={{ margin: "0 0 8px 0", color: "#38bdf8", fontSize: "24px" }}>Create an Account</h2>
                    <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>Join the NSE Market Portal</p>
                </div>

                {error && (
                    <div style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", color: "#f87171", padding: "10px", borderRadius: "6px", fontSize: "13px", marginBottom: "20px", textAlign: "center" }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: "15px" }}>
                        <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "5px" }}>Email Address</label>
                        <input 
                            type="email" 
                            required 
                            placeholder="user@example.com"
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            style={{ width: "100%", padding: "12px", backgroundColor: "#0f172a", border: "1px solid #475569", borderRadius: "6px", color: "white", outline: "none", boxSizing: "border-box" }}
                        />
                    </div>

                    <div style={{ marginBottom: "15px" }}>
                        <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "5px" }}>Password</label>
                        <input 
                            type="password" 
                            required 
                            placeholder="••••••••"
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ width: "100%", padding: "12px", backgroundColor: "#0f172a", border: "1px solid #475569", borderRadius: "6px", color: "white", outline: "none", boxSizing: "border-box" }}
                        />
                    </div>

                    <div style={{ marginBottom: "20px" }}>
                        <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "5px" }}>Confirm Password</label>
                        <input 
                            type="password" 
                            required 
                            placeholder="••••••••"
                            value={confirmPassword} 
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            style={{ width: "100%", padding: "12px", backgroundColor: "#0f172a", border: "1px solid #475569", borderRadius: "6px", color: "white", outline: "none", boxSizing: "border-box" }}
                        />
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        style={{ width: "100%", padding: "12px", backgroundColor: "#38bdf8", color: "#0f172a", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "15px", cursor: loading ? "not-allowed" : "pointer" }}
                    >
                        {loading ? "Creating Account..." : "Sign Up"}
                    </button>
                </form>

                <div style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#94a3b8" }}>
                    Already have an account?{" "}
                    <Link to="/login" style={{ color: "#38bdf8", textDecoration: "none", fontWeight: "bold" }}>
                        Log In
                    </Link>
                </div>
            </div>
        </div>
    );
}