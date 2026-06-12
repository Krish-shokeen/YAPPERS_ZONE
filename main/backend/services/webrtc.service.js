import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1,
    });
    redis.on('error', (err) => console.error('[Redis/WebRTC]', err.message));
  }
  return redis;
}

const SESSION_TTL = 60;       // seconds — active call session
const MISS_TIMEOUT = 30_000;  // 30s to accept before call:missed
const ICE_TIMEOUT  = 30_000;  // 30s for ICE to complete

/**
 * createSession — store a pending call session in Redis.
 */
export async function createSession(callerId, recipientId, callType, sdpOffer) {
  const callId = uuidv4();
  await getRedis().hset(`call:${callId}`, {
    callId, callerId, recipientId, callType, sdpOffer, state: 'pending',
  });
  await getRedis().expire(`call:${callId}`, SESSION_TTL);
  return callId;
}

/**
 * getSession — fetch a call session.
 */
export async function getSession(callId) {
  return getRedis().hgetall(`call:${callId}`);
}

/**
 * updateSession — update fields on a call session.
 */
export async function updateSession(callId, fields) {
  await getRedis().hset(`call:${callId}`, fields);
  await getRedis().expire(`call:${callId}`, SESSION_TTL);
}

/**
 * deleteSession — clean up after call:end or timeout.
 */
export async function deleteSession(callId) {
  await getRedis().del(`call:${callId}`);
}

/**
 * isInActiveCall — check if a user is already in a call.
 * Used to emit call:busy (Requirement 11.8).
 */
export async function isInActiveCall(userId) {
  // Scan for any session where user is caller or recipient and state != 'pending'
  const keys = await getRedis().keys('call:*');
  for (const key of keys) {
    const session = await getRedis().hgetall(key);
    if (!session) continue;
    if ((session.callerId === userId || session.recipientId === userId) && session.state === 'active') {
      return true;
    }
  }
  return false;
}

export { MISS_TIMEOUT, ICE_TIMEOUT };
