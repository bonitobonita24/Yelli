/**
 * MIME type validation for uploaded files.
 *
 * SECURITY (security.md File Upload Safety):
 * - Blocklist is checked FIRST — explicitly dangerous types are always rejected.
 * - Allowlist is checked second — only declared safe types are accepted.
 * - SVG and HTML are BLOCKED regardless of any allowlist entry (XSS vector —
 *   these formats can contain embedded JavaScript executed in browser context).
 * - File size is enforced at 100 MB by default (configurable per use-case).
 * - Caller is responsible for magic-byte validation when the runtime supports it;
 *   this module validates the declared content-type string.
 */

// ─── Limits ───────────────────────────────────────────────────────────────────

/** Maximum upload size in bytes (100 MB). Enforced before upload reaches S3/MinIO. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// ─── Blocklist ─────────────────────────────────────────────────────────────────

/**
 * MIME types that are ALWAYS rejected — regardless of any allowlist entry.
 * These formats can contain or execute embedded scripts in a browser context.
 */
const BLOCKED_TYPES: ReadonlySet<string> = new Set([
  // HTML variants — can contain <script> tags
  'text/html',
  'text/html; charset=utf-8',
  'application/xhtml+xml',
  // SVG — an XML format that supports embedded scripts and event handlers
  'image/svg+xml',
  // JavaScript / executable
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'text/ecmascript',
  // Flash (legacy but still blocked for completeness)
  'application/x-shockwave-flash',
  // XML may reference external entities (XXE) or xsl:script
  'text/xml',
  'application/xml',
  // Shell scripts and executables
  'application/x-sh',
  'application/x-csh',
  'application/x-bat',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-elf',
]);

// ─── Allowlist ─────────────────────────────────────────────────────────────────

/**
 * MIME type patterns allowed for upload.
 * A declared content-type must match one of these patterns (blocklist already cleared).
 *
 * Pattern format:
 *   - Exact match: 'image/png'
 *   - Wildcard prefix: 'image/*' matches any type starting with 'image/'
 *
 * Add new types via Phase 7 Feature Update — do NOT add SVG, HTML, or scripts here.
 */
export const ALLOWED_PATTERNS: ReadonlyArray<string> = [
  // Images (raster — safe for direct browser display)
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/tiff',
  'image/bmp',
  'image/heic',
  'image/heif',
  // Video — recordings and meeting exports
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/3gpp',
  // Audio
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/aac',
  'audio/mp4',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Plain text and CSV (no script execution risk)
  'text/plain',
  'text/csv',
  // Archives — uploaded as-is, not served inline
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-tar',
];

// ─── Validation helpers ────────────────────────────────────────────────────────

/**
 * Normalise a MIME type string for comparison.
 * Strips parameters (e.g. "; charset=utf-8") and lowercases.
 */
function normalizeMime(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Returns true if the MIME type is permitted for upload.
 *
 * Evaluation order (security.md mandate):
 *   1. Blocklist — if matched, ALWAYS reject (returns false immediately)
 *   2. Allowlist — accept if the normalised type matches any pattern
 *   3. Default-deny — reject anything not explicitly allowed
 */
export function isAllowedMimeType(mimeType: string): boolean {
  const normalized = normalizeMime(mimeType);

  // Step 1 — blocklist (checked first, always)
  if (BLOCKED_TYPES.has(normalized) || BLOCKED_TYPES.has(mimeType.toLowerCase())) {
    return false;
  }

  // Step 2 — allowlist
  for (const pattern of ALLOWED_PATTERNS) {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // 'image/' from 'image/*'
      if (normalized.startsWith(prefix)) {
        return true;
      }
    } else if (normalized === pattern) {
      return true;
    }
  }

  // Step 3 — default-deny
  return false;
}

/**
 * Returns true if the file size is within the allowed upload limit.
 *
 * @param bytes - File size in bytes
 * @param maxBytes - Optional override; defaults to MAX_UPLOAD_BYTES (100 MB)
 */
export function isWithinSizeLimit(bytes: number, maxBytes: number = MAX_UPLOAD_BYTES): boolean {
  return bytes > 0 && bytes <= maxBytes;
}
