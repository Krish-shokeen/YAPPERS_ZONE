import { useState } from 'react';
import './LandingPage.css';

function LandingPage() {
  const [isSignupOpen, setIsSignupOpen] = useState(false);

  const handleSignupClick = () => {
    setIsSignupOpen(true);
    // TODO: Navigate to signup page or open signup modal
    console.log('Signup clicked');
  };

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="navbar">
        <div className="nav-container">
          <div className="logo">
            <span className="logo-icon">💬</span>
            <span className="logo-text">ChatApp</span>
          </div>
          <div className="nav-buttons">
            <button className="btn-secondary" onClick={() => console.log('Login clicked')}>
              Login
            </button>
            <button className="btn-primary" onClick={handleSignupClick}>
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-container">
          <div className="hero-content">
            <h1 className="hero-title">
              Connect with <span className="gradient-text">Everyone</span>
              <br />
              Instantly, Securely
            </h1>
            <p className="hero-description">
              Experience real-time messaging like never before. Send messages, share files, 
              and stay connected with your friends and family - all in one beautiful, 
              secure platform.
            </p>
            <div className="hero-buttons">
              <button className="btn-hero-primary" onClick={handleSignupClick}>
                Get Started Free
              </button>
              <button className="btn-hero-secondary" onClick={() => console.log('Learn more')}>
                Learn More
              </button>
            </div>
            <div className="hero-stats">
              <div className="stat-item">
                <div className="stat-number">10K+</div>
                <div className="stat-label">Active Users</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">1M+</div>
                <div className="stat-label">Messages Daily</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">99.9%</div>
                <div className="stat-label">Uptime</div>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="phone-mockup">
              <div className="phone-screen">
                <div className="chat-preview">
                  <div className="chat-header">Chat Preview</div>
                  <div className="chat-messages">
                    <div className="message received">
                      <div className="message-content">Hey! How are you?</div>
                      <div className="message-time">10:30 AM</div>
                    </div>
                    <div className="message sent">
                      <div className="message-content">I'm doing great! Thanks for asking 😊</div>
                      <div className="message-time">10:31 AM</div>
                    </div>
                    <div className="message received">
                      <div className="message-content">Want to grab coffee later?</div>
                      <div className="message-time">10:32 AM</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="features-container">
          <h2 className="section-title">Why Choose ChatApp?</h2>
          <p className="section-subtitle">
            Everything you need for seamless communication
          </p>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3 className="feature-title">Lightning Fast</h3>
              <p className="feature-description">
                Real-time messaging with instant delivery. Your messages reach recipients 
                in milliseconds, no matter where they are.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3 className="feature-title">End-to-End Encrypted</h3>
              <p className="feature-description">
                Your conversations are private and secure. We use industry-leading encryption 
                to protect your messages and data.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📱</div>
              <h3 className="feature-title">Cross-Platform</h3>
              <p className="feature-description">
                Available on all devices. Chat seamlessly across web, mobile, and desktop 
                with synchronized messages everywhere.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🎨</div>
              <h3 className="feature-title">Beautiful Design</h3>
              <p className="feature-description">
                Enjoy a clean, modern interface that's intuitive and easy to use. 
                Focus on what matters - your conversations.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📎</div>
              <h3 className="feature-title">File Sharing</h3>
              <p className="feature-description">
                Share photos, videos, documents, and more. No file size limits, 
                no compromises.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <h3 className="feature-title">Group Chats</h3>
              <p className="feature-description">
                Create groups with up to 1000 members. Perfect for teams, families, 
                and communities.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="cta-container">
          <h2 className="cta-title">Ready to Get Started?</h2>
          <p className="cta-description">
            Join thousands of users who are already connecting on ChatApp
          </p>
          <button className="btn-cta" onClick={handleSignupClick}>
            Sign Up Now - It's Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-content">
            <div className="footer-brand">
              <span className="logo-icon">💬</span>
              <span className="logo-text">ChatApp</span>
            </div>
            <div className="footer-links">
              <a href="#features">Features</a>
              <a href="#about">About</a>
              <a href="#privacy">Privacy</a>
              <a href="#terms">Terms</a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2024 ChatApp. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;

