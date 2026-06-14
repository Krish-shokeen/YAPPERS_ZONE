import mongoose from 'mongoose';
import dotenv from 'dotenv';
import assert from 'node:assert';
import { insertMessage, insertThreadReply, getThreadHistory, Message } from '../../services/message.service.js';
import User from '../../models/User.js';

dotenv.config();

async function runThreadPropertyTests() {
  console.log('Connecting to database for Thread property tests...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  let testUser = null;
  let testMsg = null;
  const replyIds = [];

  try {
    // 1. Create mock user & parent message
    testUser = await User.create({
      displayName: 'Thread Property User',
      email: `thread-prop-${Date.now()}@example.com`,
      firebaseUid: `thread-mock-uid-${Date.now()}`,
      provider: 'email',
    });

    testMsg = await insertMessage({
      senderId: testUser._id,
      content: 'Parent Message for Thread Property Testing',
      recipientId: testUser._id,
    });

    console.log('Parent message created. Creating replies with random sizes and offsets...');

    // 2. Validate reply content invariants (1-4000 characters)
    // 0 characters (empty) should throw
    await assert.rejects(
      insertThreadReply(testMsg._id, { senderId: testUser._id, content: '' }),
      { code: 'THREAD_REPLY_INVALID' },
      'Expected empty thread reply content to throw THREAD_REPLY_INVALID'
    );

    // > 4000 characters should throw
    const longContent = 'A'.repeat(4001);
    await assert.rejects(
      insertThreadReply(testMsg._id, { senderId: testUser._id, content: longContent }),
      { code: 'THREAD_REPLY_INVALID' },
      'Expected >4000 char thread reply to throw THREAD_REPLY_INVALID'
    );

    // 3. Create a randomized sequence of replies
    // We will generate 25 replies with specific sequential contents
    const totalReplies = 25;
    const repliesData = [];

    for (let i = 1; i <= totalReplies; i++) {
      const reply = await insertThreadReply(testMsg._id, {
        senderId: testUser._id,
        content: `Reply #${i}`,
      });
      replyIds.push(reply._id);
      repliesData.push(reply);
      // Brief sleep to ensure distinct timestamps
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    console.log(`Created ${totalReplies} valid replies. Checking pagination property invariants...`);

    // Invariants to verify:
    // 1. If we paginate with a limit L, we get min(L, remaining_items) replies.
    // 2. Sort order is always descending by createdAt (newest first).
    // 3. hasMore is correct: true if there are more replies left, false otherwise.
    // 4. Cursor-based pagination returns the exact contiguous slice.

    let cursor = null;
    let fetchedCount = 0;
    const pageSize = 7;
    const paginatedContents = [];

    while (true) {
      const history = await getThreadHistory(testMsg._id, cursor, pageSize);
      
      // Check limit invariant
      const expectedLimit = Math.min(pageSize, totalReplies - fetchedCount);
      assert.strictEqual(history.messages.length, expectedLimit, `Expected to fetch ${expectedLimit} replies, got ${history.messages.length}`);

      // Check sorting invariant (descending order of createdAt)
      for (let i = 0; i < history.messages.length - 1; i++) {
        const t1 = new Date(history.messages[i].createdAt).getTime();
        const t2 = new Date(history.messages[i + 1].createdAt).getTime();
        assert.ok(t1 >= t2, `Sorting mismatch: ${history.messages[i].content} is older than ${history.messages[i+1].content}`);
      }

      // Collect contents to verify all replies are fetched once
      for (const msg of history.messages) {
        paginatedContents.push(msg.content);
      }

      fetchedCount += history.messages.length;

      // Check hasMore invariant
      const moreExpected = fetchedCount < totalReplies;
      assert.strictEqual(history.hasMore, moreExpected, `hasMore mismatch: got ${history.hasMore}, expected ${moreExpected}`);

      if (!history.hasMore) {
        break;
      }

      // Update cursor to the last message's createdAt time
      cursor = history.messages[history.messages.length - 1].createdAt;
    }

    // Verify all replies were fetched in correct descending order (Reply #25 down to Reply #1)
    assert.strictEqual(paginatedContents.length, totalReplies, `Expected ${totalReplies} messages in total, got ${paginatedContents.length}`);
    for (let i = 0; i < totalReplies; i++) {
      const expectedContent = `Reply #${totalReplies - i}`;
      assert.strictEqual(paginatedContents[i], expectedContent, `Expected content at index ${i} to be "${expectedContent}", got "${paginatedContents[i]}"`);
    }

    console.log('✅ Thread property tests passed: content validation, pagination slicing, sorting, and hasMore correctly verified.');

  } catch (error) {
    console.error('❌ Thread property test failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    console.log('Cleaning up thread test documents...');
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

runThreadPropertyTests();
