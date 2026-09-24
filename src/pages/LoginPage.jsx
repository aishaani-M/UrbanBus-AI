import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Mail, Eye, EyeOff, UserPlus, LogIn } from 'lucide-react';

export default function LoginPage() {
  const { isAuthenticated, loading: authLoading, login, signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  // Already logged in — redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Show loading while checking session
  if (authLoading) {
    return (
      <div className="login-page">
        <div className="gov-tricolour" />
        <div className="login-container">
          <div className="login-loading">Verifying session...</div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const result = await signup(email.trim(), password);
        if (!result.success) {
          setError(result.error);
        } else {
          setSuccess('Account created! Check your email for a confirmation link, or sign in if email confirmation is disabled.');
          setIsSignUp(false);
        }
      } else {
        const result = await login(email.trim(), password);
        if (!result.success) {
          setError(result.error);
        }
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className="login-page">
      {/* Tricolour stripe */}
      <div className="gov-tricolour" />

      <div className="login-container">
        {/* Emblem + branding */}
        <div className="login-branding">
          <div className="login-emblem">
            <svg viewBox="0 0 40 40" width="48" height="48" fill="none">
              <circle cx="20" cy="20" r="18" stroke="#003366" strokeWidth="2" fill="#fff" />
              <circle cx="20" cy="20" r="7" stroke="#003366" strokeWidth="1.5" fill="none" />
              {Array.from({ length: 24 }, (_, i) => {
                const angle = (i * 15) * Math.PI / 180;
                const x1 = 20 + 7 * Math.cos(angle);
                const y1 = 20 + 7 * Math.sin(angle);
                const x2 = 20 + 16 * Math.cos(angle);
                const y2 = 20 + 16 * Math.sin(angle);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#003366" strokeWidth="0.5" />;
              })}
            </svg>
          </div>
          <div className="login-branding-text">
            <div className="login-ministry">Government of India</div>
            <div className="login-dept">Bharat Electronics Pvt. Ltd</div>
          </div>
        </div>

        {/* Title */}
        <div className="login-title-bar">
          <h1 className="login-app-title">UrbanBus</h1>
          <p className="login-app-subtitle">Urban Intelligence Platform</p>
        </div>

        {/* Login card */}
        <div className="login-card">
          <div className="login-card-header">
            {isSignUp ? <UserPlus size={18} /> : <Lock size={18} />}
            <span>{isSignUp ? 'Create New Account' : 'Authorized Personnel Login'}</span>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            {success && (
              <div className="login-success">
                {success}
              </div>
            )}

            <div className="login-field">
              <label className="login-label" htmlFor="login-email">
                Email Address
              </label>
              <div className="login-input-wrapper">
                <Mail size={16} className="login-input-icon" />
                <input
                  id="login-email"
                  type="email"
                  className="login-input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="login-password">
                Password
              </label>
              <div className="login-input-wrapper">
                <Lock size={16} className="login-input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder={isSignUp ? 'Create a password (min 6 chars)' : 'Enter your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  className="login-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-submit"
              disabled={loading}
            >
              {loading
                ? (isSignUp ? 'Creating account...' : 'Signing in...')
                : (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {isSignUp ? <UserPlus size={16} /> : <LogIn size={16} />}
                    {isSignUp ? 'Create Account' : 'Sign In'}
                  </span>
                )
              }
            </button>

            <div className="login-switch">
              {isSignUp ? (
                <span>Already have an account? <button type="button" className="login-switch-btn" onClick={() => { setIsSignUp(false); setError(''); setSuccess(''); }}>Sign In</button></span>
              ) : (
                <span>Don&apos;t have an account? <button type="button" className="login-switch-btn" onClick={() => { setIsSignUp(true); setError(''); setSuccess(''); }}>Create Account</button></span>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="login-footer">
        <div className="login-footer-text">
          &copy; {new Date().getFullYear()} Government of India. All Rights Reserved.
        </div>
        <div className="login-footer-text">
          Designed &amp; Created by SIH Team Intelligent Fleet
        </div>
      </div>

      <div className="gov-tricolour" />
    </div>
  );
}
