import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebaseClient';
import AuthLayout from './AuthLayout';

function LoginPage() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [gLoading, setGLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setGLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue yapping with your zones and friends"
    >
      {error && <div className="ac-error">{error}</div>}

      <form className="ac-form" onSubmit={handleSubmit}>
        <div className="ac-field">
          <label className="ac-label" htmlFor="email">Email</label>
          <input
            id="email"
            className="ac-input"
            type="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="ac-field">
          <div className="ac-label-row">
            <label className="ac-label" htmlFor="password">Password</label>
            <Link to="/forgot-password" className="ac-forgot">Forgot password?</Link>
          </div>
          <input
            id="password"
            className="ac-input"
            type="password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="ac-btn-primary" disabled={loading}>
          {loading ? 'Logging in…' : 'Log In →'}
        </button>
      </form>

      <div className="ac-divider">
        <span className="ac-divider-line" />
        <span className="ac-divider-text">or</span>
        <span className="ac-divider-line" />
      </div>

      <button className="ac-btn-google" onClick={handleGoogle} disabled={gLoading}>
        <GoogleIcon />
        {gLoading ? 'Connecting…' : 'Continue with Google'}
      </button>

      <p className="ac-footer-text">
        No account?{' '}
        <Link to="/signup" className="ac-link">Sign up free</Link>
      </p>
    </AuthLayout>
  );
}

function GoogleIcon() {
  return (
    <svg className="ac-google-icon" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default LoginPage;
