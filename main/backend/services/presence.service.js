import Redis from 'ioredis';

let redis;

/**
 * getRedis — lazy singleton Redis connection.
 * We defer connection until first use so the server starts even if Redis is down.
 */
function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const options = {
      lazyConnect: true,
      enableOfflineQueue: false, // don't queue commands when disconnected
      maxRetriesPerRequest: 1,
    };
    if (redisUrl.startsWith('rediss://')) {
      options.tls = { rejectUnauthorized: false };
    }
    redis = new Redis(redisUrl, options);

    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
  }
  return redis;
}

const PRESENCE_TTL = 15;       // seconds — renewed by heartbeat every 10s
const TYPING_TTL   = 3;        // seconds — auto-expires if no typing:start received

// ─── Presence ─────────────────────────────────────────────────────────────────

/**
 * setOnline — mark a user as online in Redis.
 * Retries up to 3 times at 1-second intervals on failure (Requirement 5.5).
 */
export async function setOnline(userId) {
  await withRetry(() =>
    getRedis().hset(`presence:${userId}`, { status: 'online', lastSeen: Date.now() })
      .then(() => getRedis().expire(`presence:${userId}`, PRESENCE_TTL))
  );
}

/**
 * setOffline — mark a user as offline (delete their presence key).
 */
export async function setOffline(userId) {
  await withRetry(() => getRedis().del(`presence:${userId}`));
}

/**
 * renewPresence — called every 10s by the socket heartbeat to keep the TTL alive.
 */
export async function renewPresence(userId) {
  await withRetry(() => getRedis().expire(`presence:${userId}`, PRESENCE_TTL));
}

/**
 * getStatuses — batch fetch presence for up to 500 users (Requirement 5.6).
 * Returns 'offline' for any userId not found in Redis.
 *
 * @param {string[]} userIds
 * @returns {Promise<Record<string, 'online'|'offline'>>}
 */
export async function getStatuses(userIds) {
  if (!userIds || userIds.length === 0) return {};

  // Use a pipeline for efficiency — one round trip for all keys
  const pipeline = getRedis().pipeline();
  userIds.forEach((id) => pipeline.hget(`presence:${id}`, 'status'));

  let results;
  try {
    results = await pipeline.exec();
  } catch {
    // If Redis is down, return everyone as offline rather than crashing
    return Object.fromEntries(userIds.map((id) => [id, 'offline']));
  }

  const map = {};
  userIds.forEach((id, i) => {
    const [err, val] = results[i];
    map[id] = (!err && val === 'online') ? 'online' : 'offline';
  });
  return map;
}

/**
 * setStatusMode — update the live presence status in Redis if the user is online.
 */
export async function setStatusMode(userId, mode) {
  try {
    const exists = await getRedis().exists(`presence:${userId}`);
    if (exists) {
      await withRetry(() => getRedis().hset(`presence:${userId}`, 'status', mode));
      return true;
    }
  } catch (err) {
    console.error('[Redis] setStatusMode error:', err.message);
  }
  return false;
}

// ─── Typing ───────────────────────────────────────────────────────────────────

/**
 * setTyping — record that a user is typing in a conversation.
 * Key auto-expires after TYPING_TTL seconds.
 */
export async function setTyping(conversationId, userId) {
  try {
    await getRedis().set(`typing:${conversationId}:${userId}`, '1', 'EX', TYPING_TTL);
  } catch {
    // Typing is best-effort — don't crash if Redis is unavailable
  }
}

/**
 * clearTyping — remove the typing indicator for a user.
 */
export async function clearTyping(conversationId, userId) {
  try {
    await getRedis().del(`typing:${conversationId}:${userId}`);
  } catch {}
}

/**
 * getTypingUsers — returns all userIds currently typing in a conversation.
 */
export async function getTypingUsers(conversationId) {
  try {
    const keys = await getRedis().keys(`typing:${conversationId}:*`);
    return keys.map((k) => k.split(':').pop());
  } catch {
    return [];
  }
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

/**
 * withRetry — retry a Redis operation up to 3 times at 1-second intervals.
 * On 4th failure, logs and continues (Requirement 5.5).
 */
async function withRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) {
        console.error(`[Redis] Operation failed after ${attempts} attempts:`, err.message);
        return; // swallow — don't crash the caller
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
