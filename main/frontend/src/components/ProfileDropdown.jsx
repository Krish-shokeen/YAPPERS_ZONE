import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import './ProfileDropdown.css';

function ProfileDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, userProfile, logout } = useAuth();
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    setIsOpen(false);
  };

  const handleProfileClick = () => {
    navigate('/profile');
    setIsOpen(false);
  };

  if (!user) return null;

  const displayName = userProfile?.displayName || user.displayName || user.email?.split('@')[0];
  const photoURL = userProfile?.photoURL || user.photoURL;

  return (
    <div className="profile-dropdown" ref={dropdownRef}>
      <button 
        className="profile-button" 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Profile menu"
      >
        {photoURL ? (
          <img src={photoURL} alt="Profile" className="profile-avatar" />
        ) : (
          <div className="profile-avatar-placeholder">
            {displayName?.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="dropdown-menu">
          <div className="dropdown-header">
            <div className="dropdown-user-info">
              {photoURL ? (
                <img src={photoURL} alt="Profile" className="dropdown-avatar" />
              ) : (
                <div className="dropdown-avatar-placeholder">
                  {displayName?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="dropdown-user-details">
                <p className="dropdown-user-name">{displayName}</p>
                <p className="dropdown-user-email">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="dropdown-divider"></div>

          <button className="dropdown-item" onClick={handleProfileClick}>
            <span className="dropdown-icon">👤</span>
            Profile Dashboard
          </button>

          <button className="dropdown-item" onClick={() => { navigate('/dashboard'); setIsOpen(false); }}>
            <span className="dropdown-icon">🏠</span>
            Dashboard
          </button>

          <div className="dropdown-divider"></div>

          <button className="dropdown-item dropdown-item-danger" onClick={handleLogout}>
            <span className="dropdown-icon">🚪</span>
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

export default ProfileDropdown;