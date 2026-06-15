import { useEffect } from 'react';
import './LandingPage.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import ProfileDropdown from './ProfileDropdown';
import { LogoMark } from './AuthLayout';


function DashboardPage() {
  const { user, userProfile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="auth-page">
        <section className="auth-container">
          <div className="auth-card">
            <p>Loading your dashboard...</p>
          </div>
        </section>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const displayName = userProfile?.displayName || user.displayName || user.email?.split('@')[0];

  return (
    <div className="landing-page">
      <nav className="navbar">
        <div className="nav-container">
          <button
            type="button"
            className="logo logo-button"
            onClick={() => navigate('/')}
          >
            <LogoMark size={24} />
            <span className="logo-text">Yappers Zone</span>
          </button>
          <div className="nav-buttons">
            <ProfileDropdown />
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-container">
          <div className="hero-content">
            <h1 className="hero-title">
              Welcome back,
              {' '}
              <span className="gradient-text">
                {displayName}
              </span>
            </h1>
            <p className="hero-description">
              This is your Yappers Zone dashboard. Soon you&apos;ll see your chats,
              friends, and favorite conversations all in one place.
            </p>
            <div style={{ marginTop: 24 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate('/chat')}
                style={{ fontSize: 15, padding: '12px 28px', borderRadius: 12 }}
              >
                💬 Open Chat
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;


