import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebaseClient';
import './LandingPage.css';

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess(true);
      setEmail('');
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email address.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Failed to send reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <nav className="navbar">
        <div className="nav-container">
          <button
            type="button"
            className="logo logo-button"
            onClick={() => navigate('/')}
          >
            <span className="logo-icon">💬</span>
            <span className="logo-text">Yappers Zone</span>
          </button>
        </div>
      </nav>

      <section className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">Reset your password</h1>
          <p className="auth-subtitle">
            Enter your email address and we'll send you a link to reset your password.
          </p>

          {error && <p className="auth-error">{error}</p>}
          
          {success && (
            <div className="auth-success">
              <p>
                ✅ Password reset email sent! Check your inbox and follow the instructions 
                to reset your password.
              </p>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="reset-email">Email Address</label>
              <input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={success}
              />
            </div>

            <button 
              type="submit" 
              className="btn-primary auth-submit" 
              disabled={loading || success}
            >
              {loading ? 'Sending...' : success ? 'Email Sent!' : 'Send Reset Link'}
            </button>
          </form>

          <div className="auth-footer-links">
            <Link to="/login" className="auth-link">
              ← Back to Login
            </Link>
            <span className="auth-divider-dot">•</span>
            <Link to="/signup" className="auth-link">
              Create Account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ForgotPasswordPage;