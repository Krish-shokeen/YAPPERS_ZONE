import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import { Message } from './services/message.service.js';

dotenv.config();

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  const users = await User.find({}).select('email displayName friends').lean();
  console.log('--- ALL USERS ---');
  console.log(users);

  const messages = await Message.find({}).sort({ createdAt: -1 }).limit(10).lean();
  console.log('--- RECENT 10 MESSAGES ---');
  messages.forEach(m => {
    console.log({
      messageId: m.messageId,
      senderId: m.senderId,
      recipientId: m.recipientId,
      channelId: m.channelId,
      content: m.content,
      deliveryStatus: m.deliveryStatus,
      createdAt: m.createdAt
    });
  });

  await mongoose.connection.close();
  console.log('Connection closed.');
}

run().catch(console.error);
