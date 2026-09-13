import React, { useState } from 'react';
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';

export default function Login() {
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const auth = getAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (!email) {
            return setError('Please enter your email address to reset your password.');
        }

        setLoading(true);
        try {
            await sendPasswordResetEmail(auth, email);
            setMessage('Success! Check your email inbox for password reset instructions.');
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
                    <h2 style={{ margin: "0 0 8px 0", color: "#38bdf8", fontSize: "24px" }}>
                        {isResettingPassword ? "Reset Password" : "Sign In"}
                    </h2>
                    <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>
                        {isResettingPassword ? "Enter your email to receive a recovery link" : "Access your NSE Market Dashboard"}
                    </p>
                </div>

                {error && (
                    <div style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", color: "#f87171", padding: "10px", borderRadius: "6px", fontSize: "13px", marginBottom: "20px", textAlign: "center" }}>
                        {error}
                    </div>
                )}
                {message && (
                    <div style={{ backgroundColor: "rgba(74, 222, 128, 0.1)", border: "1px solid #4ade80", color: "#4ade80", padding: "10px", borderRadius: "6px", fontSize: "13px", marginBottom: "20px", textAlign: "center" }}>
                        {message}
                    </div>
                )}

                <form onSubmit={isResettingPassword ? handlePasswordReset : handleSubmit}>
                    <div style={{ marginBottom: "18px" }}>
                        <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "6px" }}>Email Address</label>
                        <input 
                            type="email" 
                            required 
                            placeholder="user@example.com"
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            style={{ width: "100%", padding: "12px", backgroundColor: "#0f172a", border: "1px solid #475569", borderRadius: "6px", color: "white", outline: "none", boxSizing: "border-box" }}
                        />
                    </div>

                    {!isResettingPassword && (
                        <div style={{ marginBottom: "25px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                <label style={{ display: "block", fontSize: "13px", color: "#94a3b8" }}>Password</label>
                                <button 
                                    type="button" 
                                    onClick={() => { setIsResettingPassword(true); setError(''); setMessage(''); }}
                                    style={{ background: "none", border: "none", color: "#38bdf8", fontSize: "12px", cursor: "pointer", padding: 0 }}
                                >
                                    Forgot Password?
                                </button>
                            </div>
                            <input 
                                type="password" 
                                required 
                                placeholder="••••••••"
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ width: "100%", padding: "12px", backgroundColor: "#0f172a", border: "1px solid #475569", borderRadius: "6px", color: "white", outline: "none", boxSizing: "border-box" }}
                            />
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={loading}
                        style={{ width: "100%", padding: "12px", backgroundColor: "#38bdf8", color: "#0f172a", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "15px", cursor: loading ? "not-allowed" : "pointer" }}
                    >
                        {loading ? "Processing..." : (isResettingPassword ? "Send Reset Link" : "Sign In")}
                    </button>
                </form>

                {isResettingPassword && (
                    <div style={{ textAlign: "center", marginTop: "20px" }}>
                        <button 
                            onClick={() => { setIsResettingPassword(false); setError(''); setMessage(''); }}
                            style={{ background: "none", border: "none", color: "#38bdf8", cursor: "pointer", textDecoration: "underline", fontWeight: "bold", fontSize: "13px" }}
                        >
                            Back to Login
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}