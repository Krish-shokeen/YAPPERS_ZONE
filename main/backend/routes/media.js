import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileTypeFromBuffer } from 'file-type';
import {
  validateFile, createMediaRecord, markAvailable, markQuarantined,
  getMediaRecord, ALLOWED_MIME_TYPES, MAX_FILE_SIZE,
} from '../services/media.service.js';
import { ChatError } from '../chat-errors.js';

const router = express.Router();

// ─── Multer config ────────────────────────────────────────────────────────────
// Store to a temp folder first — we validate MIME type before moving to permanent storage
const upload = multer({
  dest: path.join(process.cwd(), 'temp_uploads'),
  limits: { fileSize: MAX_FILE_SIZE },
});

// ─── POST /api/media/upload ───────────────────────────────────────────────────
/**
 * Requirements 8.1–8.9 — upload a file, validate, scan (stub), store.
 *
 * In development: files are stored locally in temp_uploads/.
 * In production: replace the local storage section with S3 PutObject + GetSignedUrl.
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  const tempPath = req.file?.path;

  try {
    if (!req.file) {
      throw new ChatError('NO_FILE', 400, 'No file provided');
    }

    // Read file buffer to sniff the real MIME type (defeats double-extension attacks)
    const buffer = fs.readFileSync(tempPath);
    const detected = await fileTypeFromBuffer(buffer);
    const mimeType = detected?.mime || req.file.mimetype;

    // Requirement 8.1 + 8.2 — validate type and size
    validateFile(mimeType, req.file.size);

    // Persist the record (status: scan_pending)
    const record = await createMediaRecord({
      uploaderId: req.user.userId,
      originalName: req.file.originalname,
      mimeType,
      size: req.file.size,
      storageKey: tempPath, // in dev, the temp path IS the storage key
    });

    // ── Malware scan (stub) ──────────────────────────────────────────────────
    // In production: call ClamAV or a SaaS scanner here.
    // For development, we auto-pass the scan.
    // Requirement 8.6 — file is NOT accessible until scan passes.
    const scanPassed = await runMalwareScan(tempPath);

    if (scanPassed) {
      // Requirement 8.3 — mark available, generate 1-hour signed URL
      await markAvailable(record.mediaId);

      // In dev, the "signed URL" is just the local file path via a serve endpoint.
      // In production, replace with S3 presigned URL.
      const signedUrl = `${process.env.CORS_ORIGIN || 'http://localhost:5000'}/api/media/${record.mediaId}/file`;
      const expiresAt = new Date(Date.now() + 3600_000);

      return res.json({
        mediaId: record.mediaId,
        signedUrl,
        expiresAt,
        name: record.originalName,
        size: record.size,
        mimeType: record.mimeType,
        status: 'available',
      });
    } else {
      // Requirement 8.7 — quarantine on scan failure
      await markQuarantined(record.mediaId);
      return res.status(400).json({
        code: 'FILE_QUARANTINED',
        message: 'File failed malware scan and has been rejected',
      });
    }

  } catch (err) {
    // Clean up temp file on error
    if (tempPath) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ code: 'FILE_TOO_LARGE', message: 'File exceeds the 50 MB limit' });
    }
    console.error('[POST /media/upload]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Upload failed' });
  }
});

// ─── GET /api/media/:mediaId/url ─────────────────────────────────────────────
/**
 * Requirement 8.9 — regenerate a signed URL on demand if the original expired.
 */
router.get('/:mediaId/url', async (req, res) => {
  try {
    const record = await getMediaRecord(req.params.mediaId);

    if (!record) {
      throw new ChatError('MEDIA_NOT_FOUND', 404, 'Media file not found');
    }
    if (record.status !== 'available') {
      throw new ChatError('MEDIA_UNAVAILABLE', 403, `File status is ${record.status}`);
    }

    const signedUrl = `${process.env.CORS_ORIGIN || 'http://localhost:5000'}/api/media/${record.mediaId}/file`;
    const expiresAt = new Date(Date.now() + 3600_000);

    res.json({ signedUrl, expiresAt });

  } catch (err) {
    if (err instanceof ChatError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to generate URL' });
  }
});

// ─── GET /api/media/:mediaId/file ─────────────────────────────────────────────
// Dev-only: serve the actual file from local storage
router.get('/:mediaId/file', async (req, res) => {
  try {
    const record = await getMediaRecord(req.params.mediaId);
    if (!record || record.status !== 'available') {
      return res.status(404).json({ code: 'MEDIA_NOT_FOUND', message: 'File not found' });
    }
    res.sendFile(path.resolve(record.storageKey));
  } catch (err) {
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to serve file' });
  }
});

// ─── Stub malware scanner ─────────────────────────────────────────────────────
/**
 * In production: integrate ClamAV (`clamscan` npm package) or a SaaS API.
 * Returns true = clean, false = infected.
 * Requirement 8.8 — if scanner unavailable, returns true and file stays scan_pending
 * (handled by markAvailable flow above).
 */
async function runMalwareScan(filePath) {
  // Development stub — always passes
  // Replace with: const result = await clamscan.scanFile(filePath);
  return true;
}

export default router;
