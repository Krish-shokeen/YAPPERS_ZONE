import './LandingPage.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

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
    navigate('/login');
    return null;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="landing-page">
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
          <div className="nav-buttons">
            <button className="btn-secondary" onClick={handleLogout}>
              Log Out
            </button>
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
                {user.displayName || user.email}
              </span>
            </h1>
            <p className="hero-description">
              This is your Yappers Zone dashboard. Soon you&apos;ll see your chats,
              friends, and favorite conversations all in one place.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;


