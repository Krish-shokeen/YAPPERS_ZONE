import mongoose from 'mongoose';
import dotenv from 'dotenv';
import assert from 'node:assert';
import { addReaction, Message } from '../../services/message.service.js';
import User from '../../models/User.js';

dotenv.config();

async function runPropertyTests() {
  console.log('Connecting to database for Reaction property tests...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  let testUser = null;
  let testMsg = null;

  try {
    // 1. Create mock user & message
    testUser = await User.create({
      displayName: 'Property Test User',
      email: `prop-test-${Date.now()}@example.com`,
      firebaseUid: `prop-mock-uid-${Date.now()}`,
      provider: 'email',
    });

    const mockMessageId = `msg-id-${Date.now()}`;
    testMsg = new Message({
      messageId: mockMessageId,
      senderId: testUser._id,
      content: 'Property testing message reactions!',
      recipientId: testUser._id,
    });
    await testMsg.save();

    console.log('Initial setup completed. Running Property-based reactions test...');

    // List of emojis to pick from (more than 20)
    const emojiPool = [
      '👍', '❤️', '😂', '😮', '😢', '🙏', '👏', '🎉', '🔥', '✨',
      '🤔', '👀', '💯', '🚀', '💖', '💡', '🌟', '🥳', '😎', '😜',
      '🥺', '😡', '😱', '💩', '🤡', '🤖', '👾', '🌈', '🍕', '🍺'
    ];

    // Running 100 randomized actions to check invariants
    // Invariants to check:
    // 1. Distinct emoji reactions count is never > 20
    // 2. If a user reacts twice to same emoji, it gets toggled off (removed)
    // 3. If an emoji's userIds array becomes empty, that emoji entry is completely removed
    const reactionState = {}; // { emoji: boolean (true if user has reacted) }

    for (let i = 0; i < 100; i++) {
      // Pick a random emoji from the pool
      const randomEmoji = emojiPool[Math.floor(Math.random() * emojiPool.length)];
      const currentlyReacted = !!reactionState[randomEmoji];

      const currentDistinctCount = Object.values(reactionState).filter(Boolean).length;

      // Add reaction
      let threwCapError = false;
      let result;
      try {
        result = await addReaction(mockMessageId, testUser._id, randomEmoji);
      } catch (err) {
        if (err.code === 'REACTION_CAP_EXCEEDED') {
          threwCapError = true;
        } else {
          throw err;
        }
      }

      if (threwCapError) {
        // Enforce that cap error ONLY occurs when adding a new emoji AND distinct count is already 20
        assert.strictEqual(currentlyReacted, false, 'Should not get cap error for removing/toggling off a reaction');
        assert.strictEqual(currentDistinctCount >= 20, true, 'Cap error thrown but distinct count is less than 20');
      } else {
        // Update local state
        if (currentlyReacted) {
          // It was toggled off
          reactionState[randomEmoji] = false;
        } else {
          // If we add it, verify distinct count didn't exceed 20
          if (currentDistinctCount >= 20) {
            // Wait, did we toggle off or add?
            // If it wasn't currently reacted and distinct count was >= 20, it should have thrown cap error.
            // Since it did not throw, it means the API let it through. Let's make sure that's correct:
            assert.fail('Expected REACTION_CAP_EXCEEDED error when adding 21st reaction');
          }
          reactionState[randomEmoji] = true;
        }

        // Verify database state matches expected local state
        const dbMsg = await Message.findOne({ messageId: mockMessageId });
        const activeEmojisInDB = dbMsg.reactions.map(r => r.emoji);
        const expectedActiveEmojis = Object.keys(reactionState).filter(k => reactionState[k]);

        // 1. DB distinct count <= 20
        assert.ok(dbMsg.reactions.length <= 20, `DB reactions length exceeds 20: ${dbMsg.reactions.length}`);

        // 2. DB has exactly the expected active emojis (in any order)
        assert.strictEqual(activeEmojisInDB.length, expectedActiveEmojis.length, `Length mismatch: DB has ${activeEmojisInDB.length}, expected ${expectedActiveEmojis.length}`);
        for (const e of expectedActiveEmojis) {
          assert.ok(activeEmojisInDB.includes(e), `Expected emoji ${e} to be present in DB`);
          const dbRx = dbMsg.reactions.find(r => r.emoji === e);
          assert.strictEqual(dbRx.userIds.length, 1, `Expected exactly 1 user reaction for emoji ${e}`);
          assert.strictEqual(dbRx.userIds[0].toString(), testUser._id.toString(), 'User ID mismatch in DB reaction');
        }

        // 3. No empty emoji structures exist in DB
        for (const r of dbMsg.reactions) {
          assert.ok(r.userIds.length > 0, `Found empty userIds array for emoji ${r.emoji} in DB`);
        }
      }
    }

    console.log('✅ Reaction property test passed: 100 randomized actions verified successfully.');

  } catch (error) {
    console.error('❌ Reaction property test failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    console.log('Cleaning up reaction test documents...');
    if (testMsg) {
      await Message.deleteOne({ _id: testMsg._id });
    }
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

runPropertyTests();
