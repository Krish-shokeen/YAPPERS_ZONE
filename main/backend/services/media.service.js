import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { ChatError } from '../chat-errors.js';

// ─── Media File Schema ─────────────────────────────────────────────────────────

const mediaFileSchema = new mongoose.Schema(
  {
    mediaId: { type: String, required: true, unique: true },
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    originalName: String,
    mimeType: String,
    size: Number,
    storageKey: String,       // S3 / local path
    status: {
      type: String,
      enum: ['scan_pending', 'available', 'quarantined'],
      default: 'scan_pending',
    },
    signedUrlExpiry: Date,
  },
  { timestamps: true }
);

export const MediaFile = mongoose.model('MediaFile', mediaFileSchema);

// ─── MIME allowlist ────────────────────────────────────────────────────────────

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export const MAX_FILE_SIZE = 52_428_800; // 50 MB in bytes

/**
 * validateFile — check MIME type and size before storage.
 * Requirement 8.1 + 8.2
 */
export function validateFile(mimeType, size) {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ChatError('UNSUPPORTED_TYPE', 400, `File type ${mimeType} is not allowed`);
  }
  if (size > MAX_FILE_SIZE) {
    throw new ChatError('FILE_TOO_LARGE', 400, 'File exceeds the 50 MB limit');
  }
}

/**
 * createMediaRecord — persist a media file record after upload.
 * Status starts as 'scan_pending' — made 'available' only after scan passes.
 * Requirement 8.6 — never accessible before scan.
 */
export async function createMediaRecord({ uploaderId, originalName, mimeType, size, storageKey }) {
  const record = await MediaFile.create({
    mediaId: uuidv4(),
    uploaderId,
    originalName,
    mimeType,
    size,
    storageKey,
    status: 'scan_pending',
  });
  return record;
}

/**
 * markAvailable — called after a successful malware scan.
 * Generates a 1-hour signed URL (placeholder — real S3 signing happens in the route).
 */
export async function markAvailable(mediaId) {
  await MediaFile.updateOne({ mediaId }, { status: 'available', signedUrlExpiry: new Date(Date.now() + 3600_000) });
}

/**
 * markQuarantined — called when malware scan fails. Requirement 8.7
 */
export async function markQuarantined(mediaId) {
  await MediaFile.updateOne({ mediaId }, { status: 'quarantined' });
}

/**
 * getMediaRecord — fetch a media file record by mediaId.
 */
export async function getMediaRecord(mediaId) {
  return MediaFile.findOne({ mediaId }).lean();
}
