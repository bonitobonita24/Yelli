// ─── packages/storage public API ─────────────────────────────────────────────

// Storage key utilities
export {
  buildStorageKey,
  extractOrganizationId,
  verifyKeyOwnership,
} from './keys';

// MIME type validation
export {
  MAX_UPLOAD_BYTES,
  ALLOWED_PATTERNS,
  isAllowedMimeType,
  isWithinSizeLimit,
} from './mime';

// S3/MinIO client operations
export {
  getS3Client,
  uploadObject,
  getPresignedUploadUrl,
  getDownloadUrl,
  deleteObject,
  objectExists,
} from './client';

// Type re-exports
export type {
  UploadObjectInput,
  GetPresignedUploadUrlInput,
  GetPresignedUploadUrlOutput,
  GetDownloadUrlInput,
  GetDownloadUrlOutput,
  DeleteObjectInput,
  ObjectExistsInput,
} from './client';
