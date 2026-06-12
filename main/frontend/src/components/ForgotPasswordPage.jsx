import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebaseClient';
import AuthLayout from './AuthLayout';

function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState('');
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
      if (err.code === 'auth/user-not-found')  setError('No account found with this email.');
      else if (err.code === 'auth/invalid-email') setError('Please enter a valid email address.');
      else setError('Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset password"
      subtitle="Enter your email and we'll send you a reset link"
    >
      {error   && <div className="ac-error">{error}</div>}
      {success && (
        <div className="ac-success">
          Reset link sent! Check your inbox and follow the instructions.
        </div>
      )}

      <form className="ac-form" onSubmit={handleSubmit}>
        <div className="ac-field">
          <label className="ac-label" htmlFor="email">Email Address</label>
          <input
            id="email"
            className="ac-input"
            type="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={success}
          />
        </div>

        <button type="submit" className="ac-btn-primary" disabled={loading || success}>
          {loading ? 'Sending…' : success ? '✓ Email Sent' : 'Send Reset Link →'}
        </button>
      </form>

      <div className="ac-footer-links">
        <Link to="/login"  className="ac-link">← Back to Login</Link>
        <span className="ac-dot">·</span>
        <Link to="/signup" className="ac-link">Create Account</Link>
      </div>
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
