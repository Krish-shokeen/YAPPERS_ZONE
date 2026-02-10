import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const fixUserDates = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://krishshokeen55_db_user:bqotb5ABhEezXzad@yapperszone.fr7whdm.mongodb.net/?appName=YAPPERSZONE');
    console.log('Connected to MongoDB');

    // Find all users without createdAt or lastLoginAt
    const users = await User.find({
      $or: [
        { createdAt: { $exists: false } },
        { lastLoginAt: { $exists: false } }
      ]
    });

    console.log(`Found ${users.length} users to update`);

    // Update each user
    for (const user of users) {
      const now = new Date();
      if (!user.createdAt) {
        user.createdAt = now;
      }
      if (!user.lastLoginAt) {
        user.lastLoginAt = now;
      }
      await user.save();
      console.log(`Updated user: ${user.email}`);
    }

    console.log('All users updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

fixUserDates();
