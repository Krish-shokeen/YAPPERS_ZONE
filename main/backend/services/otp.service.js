import Redis from 'ioredis';
import Otp from '../models/Otp.js';
import nodemailer from 'nodemailer';

let redis;

function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const options = {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    };
    if (redisUrl.startsWith('rediss://')) {
      options.tls = { rejectUnauthorized: false };
    }
    redis = new Redis(redisUrl, options);
    redis.on('error', (err) => console.error('[Redis/OTP]', err.message));
  }
  return redis;
}

/**
 * generateOTP — create a 6-digit verification code and save it
 */
export async function generateOTP(email) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const key = `otp:${email}`;

  // 1. Try saving to Redis
  try {
    const client = getRedis();
    await client.set(key, code, 'EX', 300); // 5 minutes TTL
    console.log(`[OTP] Code saved in Redis for ${email}`);
  } catch (err) {
    console.warn(`[OTP] Redis save failed, falling back to MongoDB:`, err.message);
  }

  // 2. Backup to MongoDB (upsert so only one active OTP exists per email)
  try {
    await Otp.findOneAndUpdate(
      { email },
      { otp: code, createdAt: new Date() },
      { upsert: true, new: true }
    );
    console.log(`[OTP] Code saved/backed up in MongoDB for ${email}`);
  } catch (err) {
    console.error(`[OTP] MongoDB save failed:`, err.message);
    throw new Error('Failed to save verification code');
  }

  return code;
}

/**
 * sendOTPEmail — sends the code to the user's email or prints it to console if SMTP is missing
 */
export async function sendOTPEmail(email, otp) {
  if (!process.env.SMTP_HOST) {
    console.log(`
======================================================
🔥 [DEVELOPMENT OTP DELIVERY]
📧 TO:      ${email}
🔑 CODE:    ${otp}
⏰ EXPIRES: 5 minutes
======================================================
`);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || '"Yappers Zone" <no-reply@yappers.zone>',
      to: email,
      subject: 'Yappers Zone - Email Verification Code',
      text: `Welcome to Yappers Zone! Your 6-digit verification code is: ${otp}. This code is valid for 5 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #1e293b; border-radius: 12px; background-color: #0b0f19; color: #ffffff;">
          <h2 style="color: #00e5ff; text-align: center;">Yappers Zone</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #94a3b8;">Welcome to Yappers Zone! Use the verification code below to complete your registration process:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; margin: 30px 0; color: #00e5ff; background: rgba(0, 229, 255, 0.08); padding: 15px; border-radius: 8px; border: 1px dashed rgba(0, 229, 255, 0.3);">
            ${otp}
          </div>
          <p style="font-size: 12px; text-align: center; color: #64748b;">This code is valid for 5 minutes. If you did not request this code, please ignore this email.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[OTP] Email sent successfully to ${email}`);
  } catch (err) {
    console.error(`[OTP] Email sending failed:`, err.message);
    throw new Error('Failed to deliver verification email');
  }
}

/**
 * verifyOTP — checks if user code is correct, deletes it if so
 */
export async function verifyOTP(email, otp) {
  if (!email || !otp) return false;

  // Development backdoor for testing
  if (process.env.NODE_ENV === 'development' && otp.trim() === '000000') {
    console.log(`[OTP] Development override code '000000' used for ${email}`);
    return true;
  }

  const key = `otp:${email}`;
  let match = false;

  // 1. Try checking Redis
  try {
    const client = getRedis();
    const cachedOtp = await client.get(key);
    if (cachedOtp === otp.trim()) {
      match = true;
      await client.del(key); // consume key
    }
  } catch (err) {
    console.warn(`[OTP] Redis lookup failed, trying MongoDB:`, err.message);
  }

  // 2. Try checking MongoDB if not matched in Redis
  if (!match) {
    try {
      const dbRecord = await Otp.findOne({ email });
      if (dbRecord && dbRecord.otp === otp.trim()) {
        match = true;
      }
    } catch (err) {
      console.error(`[OTP] MongoDB query failed:`, err.message);
    }
  }

  // 3. Clean up database entry if matched
  if (match) {
    try {
      await Otp.deleteOne({ email });
      console.log(`[OTP] Successfully consumed verification code for ${email}`);
    } catch (err) {
      console.error(`[OTP] Cleanup from MongoDB failed:`, err.message);
    }
    return true;
  }

  return false;
}
