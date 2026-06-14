import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  email:       { type: String, required: true, unique: true },
  displayName: { type: String, default: '' },
  photoURL:    { type: String, default: '' },
  provider:    { type: String, enum: ['google', 'email'], required: true },

  // Yapper ID — unique handle like krish#9999
  yapperHandle: { type: String, unique: true, sparse: true },
  yapperTag:    { type: String, default: '' }, // the 4-digit discriminator

  // Custom status text ("In the coding zone…")
  statusText: { type: String, default: '' },

  // Status mode: online | idle | dnd | offline
  statusMode: {
    type: String,
    enum: ['online', 'idle', 'dnd', 'offline'],
    default: 'offline',
  },

  // Friend/connection system
  friends:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // incoming

  createdAt:   { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now },
  lastSeenAt:  { type: Date, default: Date.now },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

// Index for fast prefix search on handle
userSchema.index({ yapperHandle: 1 });
userSchema.index({ displayName: 1 });

// Generate a unique Yapper handle on first save if not set
userSchema.pre('save', function () {
  if (!this.yapperHandle && this.displayName) {
    const base = this.displayName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 16) || 'yapper';
    const tag  = String(Math.floor(1000 + Math.random() * 9000));
    this.yapperHandle = `${base}#${tag}`;
    this.yapperTag    = tag;
  }
});

export default mongoose.model('User', userSchema);
