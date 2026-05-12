// ─── packages/storage public API ─────────────────────────────────────────────

// Storage key utilities
export {
  buildStorageKey,
  extractOrganizationId,
  verifyKeyOwnership,
} from './keys.js';

// MIME type validation
export {
  MAX_UPLOAD_BYTES,
  ALLOWED_PATTERNS,
  isAllowedMimeType,
  isWithinSizeLimit,
} from './mime.js';

// S3/MinIO client operations
export {
  getS3Client,
  uploadObject,
  getDownloadUrl,
  deleteObject,
  objectExists,
} from './client.js';

// Type re-exports
export type {
  UploadObjectInput,
  GetDownloadUrlInput,
  GetDownloadUrlOutput,
  DeleteObjectInput,
  ObjectExistsInput,
} from './client.js';
