import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { addReaction, removeReaction, insertMessage, insertThreadReply, getThreadHistory, Message } from './services/message.service.js';
import User from './models/User.js';

dotenv.config();

async function runTests() {
  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  let testUser = null;
  let testMsg = null;
  const replyIds = [];

  try {
    // 1. Create a mock user
    testUser = await User.create({
      displayName: 'Test User',
      email: `test-${Date.now()}@example.com`,
      firebaseUid: `mock-uid-${Date.now()}`,
      yapperHandle: `testuser#${Math.floor(1000 + Math.random() * 9000)}`,
      provider: 'email',
    });
    console.log('Mock User Created:', testUser.displayName, testUser.yapperHandle);

    // 2. Insert a top-level message
    testMsg = await insertMessage({
      senderId: testUser._id,
      content: 'Testing reactions and threads!',
      recipientId: testUser._id, // dm to self
    });
    console.log('Top-level message created:', testMsg.messageId);

    // ─── Test 1: Add a reaction ───
    console.log('Running Test 1: Add reaction...');
    let result = await addReaction(testMsg.messageId, testUser._id, '👍');
    if (result.reactions.length !== 1 || result.reactions[0].emoji !== '👍' || result.reactions[0].count !== 1) {
      throw new Error('Test 1 failed: reaction 👍 not added properly');
    }
    console.log('Test 1 passed.');

    // ─── Test 2: Toggle reaction (remove it) ───
    console.log('Running Test 2: Toggle reaction off...');
    result = await addReaction(testMsg.messageId, testUser._id, '👍');
    if (result.reactions.length !== 0) {
      throw new Error('Test 2 failed: reaction 👍 not toggled off');
    }
    console.log('Test 2 passed.');

    // ─── Test 3: Reaction Cap Invariant (Max 20 distinct emojis) ───
    console.log('Running Test 3: Enforcing reaction cap (max 20)...');
    const emojis = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋']; // 21 emojis
    
    // Add 20 emojis
    for (let i = 0; i < 20; i++) {
      result = await addReaction(testMsg.messageId, testUser._id, emojis[i]);
    }
    if (result.reactions.length !== 20) {
      throw new Error(`Test 3 failed: expected 20 reactions, got ${result.reactions.length}`);
    }

    // Try to add the 21st emoji (should fail)
    try {
      await addReaction(testMsg.messageId, testUser._id, emojis[20]);
      throw new Error('Test 3 failed: 21st reaction was not rejected');
    } catch (err) {
      if (err.code !== 'REACTION_CAP_EXCEEDED') {
        throw new Error(`Test 3 failed: expected REACTION_CAP_EXCEEDED, got code ${err.code}`);
      }
      console.log('21st reaction correctly rejected.');
    }
    console.log('Test 3 passed.');

    // ─── Test 4: Thread Replies & Pagination ───
    console.log('Running Test 4: Thread replies & pagination...');
    for (let i = 1; i <= 5; i++) {
      const reply = await insertThreadReply(testMsg._id, {
        senderId: testUser._id,
        content: `Thread reply #${i}`,
      });
      replyIds.push(reply._id);
    }
    console.log('Created 5 thread replies.');

    // Fetch replies without cursor
    let threadHistory = await getThreadHistory(testMsg._id, null, 3);
    if (threadHistory.messages.length !== 3 || !threadHistory.hasMore) {
      throw new Error('Test 4 failed: pagination limits or hasMore mismatch');
    }
    // Verify descending sort (newest first)
    if (threadHistory.messages[0].content !== 'Thread reply #5') {
      throw new Error('Test 4 failed: incorrect sorting of replies');
    }

    // Page 2 using cursor
    const cursor = threadHistory.messages[2].createdAt;
    let threadHistoryPage2 = await getThreadHistory(testMsg._id, cursor, 3);
    if (threadHistoryPage2.messages.length !== 2 || threadHistoryPage2.hasMore) {
      throw new Error('Test 4 failed: page 2 cursor pagination mismatch');
    }
    if (threadHistoryPage2.messages[0].content !== 'Thread reply #2' || threadHistoryPage2.messages[1].content !== 'Thread reply #1') {
      throw new Error('Test 4 failed: page 2 sorting mismatch');
    }
    console.log('Test 4 passed.');

    console.log('\n=============================================');
    console.log('🎉 SUCCESS: All backend reaction & thread tests passed!');
    console.log('=============================================\n');

  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error(error.stack);
  } finally {
    // Clean up
    console.log('Cleaning up test documents...');
    if (testMsg) {
      await Message.deleteOne({ _id: testMsg._id });
    }
    if (replyIds.length > 0) {
      await Message.deleteMany({ _id: { $in: replyIds } });
    }
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

runTests();
