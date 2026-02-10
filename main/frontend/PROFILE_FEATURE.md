# Profile Feature Documentation

## Overview

The profile feature includes a profile dropdown button in the top-right corner and a comprehensive profile dashboard where users can view and edit their account information.

## Components

### 1. ProfileDropdown Component
**Location:** `src/components/ProfileDropdown.jsx`

A dropdown menu that appears when clicking the profile avatar in the top-right corner.

**Features:**
- User avatar display (photo or initial)
- User name and email display
- Navigation to Profile Dashboard
- Navigation to Dashboard
- Logout functionality
- Click-outside-to-close behavior

**Usage:**
```jsx
import ProfileDropdown from './components/ProfileDropdown';

<ProfileDropdown />
```

### 2. ProfileDashboard Component
**Location:** `src/components/ProfileDashboard.jsx`

A full-page dashboard for viewing and editing user profile information.

**Features:**
- Display user avatar (large)
- Show account information:
  - Display name (editable)
  - Email (read-only)
  - Photo URL (editable)
  - Account creation date
  - Last login date
  - Account provider (Google/Email)
- Edit mode with save/cancel
- Success/error messages
- Responsive design
- Dark mode support

**Routes:**
- `/profile` - Profile Dashboard page

## User Flow

1. **Access Profile Dropdown:**
   - User clicks profile avatar in top-right corner
   - Dropdown menu appears with options

2. **Navigate to Profile Dashboard:**
   - Click "Profile Dashboard" in dropdown
   - Or navigate directly to `/profile`

3. **Edit Profile:**
   - Click "Edit Profile" button
   - Modify display name or photo URL
   - Click "Save Changes" to update
   - Or "Cancel" to discard changes

4. **View Account Info:**
   - See account creation date
   - View last login timestamp
   - Check account provider type

## Styling

### ProfileDropdown.css
- Smooth animations
- Hover effects
- Dark mode support
- Responsive design

### ProfileDashboard.css
- Gradient background
- Card-based layout
- Form styling
- Button states
- Mobile-responsive
- Dark mode support

## Integration with Backend

The profile feature integrates with the backend API:

### API Endpoints Used:
- `GET /api/auth/profile` - Fetch user profile
- `PUT /api/auth/profile` - Update user profile

### Data Flow:
1. User data is fetched from AuthContext
2. Profile updates are sent to backend via `updateProfile()` function
3. Backend updates MongoDB user document
4. Frontend state is updated with new data

## AuthContext Integration

The profile components use the following from AuthContext:
- `user` - Firebase user object
- `userProfile` - MongoDB user profile
- `loading` - Loading state
- `updateProfile()` - Function to update profile
- `logout()` - Function to log out

## Features

### Profile Dropdown
- ✅ Avatar display (photo or initial)
- ✅ User info display
- ✅ Quick navigation
- ✅ Logout option
- ✅ Click-outside-to-close
- ✅ Smooth animations

### Profile Dashboard
- ✅ Large avatar display
- ✅ Account information display
- ✅ Edit mode
- ✅ Form validation
- ✅ Success/error messages
- ✅ Responsive design
- ✅ Dark mode support
- ✅ Loading states

## Responsive Design

### Mobile (< 768px)
- Stacked layout
- Full-width buttons
- Centered avatar section
- Adjusted font sizes

### Desktop
- Side-by-side layout
- Inline buttons
- Larger spacing

## Dark Mode

Both components support dark mode via CSS media queries:
```css
@media (prefers-color-scheme: dark) {
  /* Dark mode styles */
}
```

## Future Enhancements

Potential improvements:
- [ ] Image upload for avatar
- [ ] Password change functionality
- [ ] Two-factor authentication
- [ ] Account deletion
- [ ] Privacy settings
- [ ] Notification preferences
- [ ] Activity log
- [ ] Connected devices

## Testing

To test the profile feature:

1. **Start the application:**
   ```bash
   cd main/frontend
   npm run dev
   ```

2. **Login to your account**

3. **Test Profile Dropdown:**
   - Click profile avatar in top-right
   - Verify dropdown appears
   - Test all menu items
   - Click outside to close

4. **Test Profile Dashboard:**
   - Navigate to profile dashboard
   - Click "Edit Profile"
   - Modify display name
   - Save changes
   - Verify update in dropdown

## Troubleshooting

### Profile dropdown not appearing
- Check if user is logged in
- Verify AuthContext is providing user data
- Check browser console for errors

### Profile updates not saving
- Verify backend is running
- Check network tab for API calls
- Verify Firebase token is valid
- Check backend logs for errors

### Avatar not displaying
- Verify photoURL is valid
- Check if image URL is accessible
- Fallback to initial should work

## Code Examples

### Using ProfileDropdown in a component:
```jsx
import ProfileDropdown from './components/ProfileDropdown';

function MyComponent() {
  return (
    <nav>
      <div className="nav-buttons">
        <ProfileDropdown />
      </div>
    </nav>
  );
}
```

### Navigating to Profile Dashboard:
```jsx
import { useNavigate } from 'react-router-dom';

function MyComponent() {
  const navigate = useNavigate();
  
  const goToProfile = () => {
    navigate('/profile');
  };
  
  return <button onClick={goToProfile}>View Profile</button>;
}
```
