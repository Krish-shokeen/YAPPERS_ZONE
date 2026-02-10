import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import ProfileDropdown from './ProfileDropdown';
import './ProfileDashboard.css';

function ProfileDashboard() {
  const { user, userProfile, loading, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    photoURL: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (userProfile) {
      console.log('User Profile Data:', userProfile);
      console.log('Created At:', userProfile.createdAt);
      console.log('Last Login At:', userProfile.lastLoginAt);
      setFormData({
        displayName: userProfile.displayName || '',
        photoURL: userProfile.photoURL || ''
      });
    }
  }, [userProfile]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-loading">
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file.' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image size should be less than 5MB.' });
      return;
    }

    setUploadingImage(true);
    setMessage({ type: '', text: '' });

    try {
      // Convert image to base64 or upload to a service
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          photoURL: reader.result
        }));
        setUploadingImage(false);
        setMessage({ type: 'success', text: 'Image uploaded! Click "Save Changes" to update your profile.' });
      };
      reader.onerror = () => {
        setUploadingImage(false);
        setMessage({ type: 'error', text: 'Failed to upload image. Please try again.' });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setUploadingImage(false);
      setMessage({ type: 'error', text: 'Failed to upload image. Please try again.' });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage({ type: '', text: '' });

    try {
      await updateProfile(formData);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setIsEditing(false);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      displayName: userProfile?.displayName || '',
      photoURL: userProfile?.photoURL || ''
    });
    setIsEditing(false);
    setMessage({ type: '', text: '' });
  };

  const displayName = userProfile?.displayName || user.displayName || user.email?.split('@')[0];
  const photoURL = formData.photoURL || userProfile?.photoURL || user.photoURL;

  // Format dates properly
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  // Get dates from Firebase user metadata if MongoDB doesn't have them
  const createdAt = userProfile?.createdAt || user?.metadata?.creationTime;
  const lastLoginAt = userProfile?.lastLoginAt || user?.metadata?.lastSignInTime;

  return (
    <div className="profile-page">
      <nav className="profile-navbar">
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
            <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
              Dashboard
            </button>
            <ProfileDropdown />
          </div>
        </div>
      </nav>

      <div className="profile-container">
        <div className="profile-header">
          <h1 className="profile-title">Profile Dashboard</h1>
          <p className="profile-subtitle">Manage your account information</p>
        </div>

        {message.text && (
          <div className={`profile-message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="profile-card">
          <div className="profile-avatar-section">
            {photoURL ? (
              <img src={photoURL} alt="Profile" className="profile-avatar-large" />
            ) : (
              <div className="profile-avatar-large-placeholder">
                {displayName?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="profile-avatar-info">
              <h2>{displayName}</h2>
              <p className="profile-email">{user.email}</p>
              <span className="profile-badge">
                {userProfile?.provider === 'google' ? '🔗 Google Account' : '📧 Email Account'}
              </span>
            </div>
          </div>

          <div className="profile-divider"></div>

          <div className="profile-details">
            <h3 className="profile-section-title">Account Information</h3>

            <div className="profile-field">
              <label className="profile-label">Display Name</label>
              {isEditing ? (
                <input
                  type="text"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleInputChange}
                  className="profile-input"
                  placeholder="Enter your display name"
                />
              ) : (
                <p className="profile-value">{userProfile?.displayName || 'Not set'}</p>
              )}
            </div>

            <div className="profile-field">
              <label className="profile-label">Email</label>
              <p className="profile-value">{user.email}</p>
              <span className="profile-hint">Email cannot be changed</span>
            </div>

            <div className="profile-field">
              <label className="profile-label">Profile Photo</label>
              {isEditing ? (
                <div className="profile-upload-section">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="btn-upload"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? '📤 Uploading...' : '📷 Upload Photo'}
                  </button>
                  <span className="profile-hint">Max size: 5MB. Formats: JPG, PNG, GIF</span>
                </div>
              ) : (
                <p className="profile-value">{photoURL ? 'Photo uploaded' : 'No photo'}</p>
              )}
            </div>

            <div className="profile-field">
              <label className="profile-label">Account Created</label>
              <p className="profile-value">
                {formatDate(createdAt)}
              </p>
            </div>

            <div className="profile-field">
              <label className="profile-label">Last Login</label>
              <p className="profile-value">
                {formatDateTime(lastLoginAt)}
              </p>
            </div>
          </div>

          <div className="profile-actions">
            {isEditing ? (
              <>
                <button 
                  className="btn-primary" 
                  onClick={handleSave}
                  disabled={isSaving || uploadingImage}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button 
                  className="btn-secondary" 
                  onClick={handleCancel}
                  disabled={isSaving || uploadingImage}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button className="btn-primary" onClick={() => setIsEditing(true)}>
                Edit Profile
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileDashboard;