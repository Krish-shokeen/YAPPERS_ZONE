import express from 'express';
import jwt from 'jsonwebtoken';
import { auth } from '../config/firebase.js';
import User from '../models/User.js';
import { generateOTP, sendOTPEmail, verifyOTP } from '../services/otp.service.js';

const router = express.Router();

// Middleware to verify Firebase token
export const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Generate JWT token for additional security (optional)
const generateJWT = (user) => {
  return jwt.sign(
    { 
      userId: user._id,
      firebaseUid: user.firebaseUid,
      email: user.email 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Register or login user (dual storage)
router.post('/register', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    // Verify the Firebase token
    const decodedToken = await auth.verifyIdToken(idToken);
    const { uid, email, name, picture, firebase } = decodedToken;
    
    // Determine provider
    const provider = firebase.sign_in_provider === 'google.com' ? 'google' : 'email';
    
    // Check if user already exists in MongoDB
    let user = await User.findOne({ firebaseUid: uid });
    
    if (!user) {
      // Create new user in MongoDB
      user = new User({
        firebaseUid: uid,
        email: email,
        displayName: name || '',
        photoURL: picture || '',
        provider: provider,
        createdAt: new Date(),
        lastLoginAt: new Date()
      });
      
      await user.save();
      console.log('New user created in MongoDB:', user._id);
    } else {
      // Update last login time and ensure createdAt exists
      user.lastLoginAt = new Date();
      if (!user.createdAt) {
        user.createdAt = new Date();
      }
      await user.save();
      console.log('User login updated in MongoDB:', user._id);
    }
    
    // Generate JWT token (optional)
    const jwtToken = generateJWT(user);
    
    const responseData = {
      message: 'User authenticated successfully',
      user: {
        id: user._id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        provider: user.provider,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      },
      token: jwtToken
    };
    
    console.log('=== SENDING RESPONSE ===');
    console.log('User ID:', user._id);
    console.log('Created At:', user.createdAt);
    console.log('Last Login At:', user.lastLoginAt);
    console.log('Response user object:', JSON.stringify(responseData.user, null, 2));
    console.log('========================');
    
    res.status(200).json(responseData);
    
  } catch (error) {
    console.error('Registration/Login error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Get user profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: {
        id: user._id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        provider: user.provider,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { displayName, photoURL } = req.body;
    
    const user = await User.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      { 
        displayName: displayName || '',
        photoURL: photoURL || ''
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        provider: user.provider,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Send OTP to email
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if email already registered to prevent duplicates
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const otp = await generateOTP(email);
    await sendOTPEmail(email, otp);

    res.json({ message: 'Verification code sent successfully' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: error.message || 'Failed to send verification code' });
  }
});

// Verify OTP code
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    const isValid = await verifyOTP(email, otp);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    res.json({ success: true, message: 'Verification code verified successfully' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

export default router;