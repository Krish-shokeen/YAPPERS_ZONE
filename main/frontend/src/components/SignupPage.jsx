import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebaseClient';
import AuthLayout from './AuthLayout';
import { useAuth } from '../AuthContext';
import { PRESET_AVATARS } from '../utils/avatars.js';

function SignupPage() {
  const navigate = useNavigate();
  const { updateProfile: updateDbProfile } = useAuth();
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0].url);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Update Firebase Profile
      await updateProfile(cred.user, { displayName: name, photoURL: selectedAvatar });
      // Update MongoDB Profile
      await updateDbProfile({ displayName: name, photoURL: selectedAvatar });
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
      title="Create your zone"
      subtitle="Join Yappers Zone and enter the spatial canvas"
    >
      {error && <div className="ac-error">{error}</div>}

      <form className="ac-form" onSubmit={handleSubmit}>
        <div className="ac-field">
          <label className="ac-label" htmlFor="name">Display Name</label>
          <input
            id="name"
            className="ac-input"
            type="text"
            placeholder="Your name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

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
          <label className="ac-label" htmlFor="password">Password</label>
          <input
            id="password"
            className="ac-input"
            type="password"
            placeholder="Create a strong password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="ac-field">
          <label className="ac-label">Select Cosmic Avatar</label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
            {PRESET_AVATARS.map((av) => (
              <button
                key={av.id}
                type="button"
                onClick={() => setSelectedAvatar(av.url)}
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  border: selectedAvatar === av.url ? '2px solid #00e5ff' : '2px solid transparent',
                  background: 'transparent',
                  padding: '0',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                  boxShadow: selectedAvatar === av.url ? '0 0 10px rgba(0,229,255,0.5)' : 'none',
                  transform: selectedAvatar === av.url ? 'scale(1.1)' : 'scale(1)'
                }}
                title={av.name}
              >
                <img src={av.url} alt={av.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="ac-btn-primary" disabled={loading}>
          {loading ? 'Creating account…' : 'Launch Into Space →'}
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
        Already have an account?{' '}
        <Link to="/login" className="ac-link">Log in</Link>
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

export default SignupPage;
