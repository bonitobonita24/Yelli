import { createId } from '@paralleldrive/cuid2';

/**
 * Build a tenant-prefixed storage key.
 * Pattern: {organizationId}/{entityType}/{randomCuid}.{ext}
 *
 * NEVER use the original user-submitted filename as the storage key —
 * it is an untrusted input and could be used to overwrite other files
 * or expose internal paths. Always generate a random key.
 *
 * @param organizationId - The tenant's organization ID (required, non-empty)
 * @param entityType     - The logical category (e.g. "recording", "report", "avatar")
 * @param ext            - File extension WITHOUT leading dot (e.g. "mp4", "pdf", "png")
 *                         Pass an empty string to omit the extension.
 * @returns A storage key safe for use as an S3/MinIO object key.
 */
export function buildStorageKey(
  organizationId: string,
  entityType: string,
  ext: string,
): string {
  if (!organizationId) {
    throw new Error('buildStorageKey: organizationId must be a non-empty string');
  }
  if (!entityType) {
    throw new Error('buildStorageKey: entityType must be a non-empty string');
  }

  const randomId = createId();
  const filename = ext ? `${randomId}.${ext}` : randomId;
  return `${organizationId}/${entityType}/${filename}`;
}

/**
 * Extract the organizationId from a storage key.
 * Storage keys follow: {organizationId}/{entityType}/{filename}
 *
 * Returns null if the key is malformed (fewer than 3 path segments).
 */
export function extractOrganizationId(storageKey: string): string | null {
  const parts = storageKey.split('/');
  // Must have at least organizationId / entityType / filename
  if (parts.length < 3) {
    return null;
  }
  const orgId = parts[0];
  return orgId !== undefined && orgId.length > 0 ? orgId : null;
}

/**
 * Verify that the storage key belongs to the given organization.
 *
 * SECURITY (security.md Queue Safety + File Upload Safety):
 * Download and delete endpoints MUST call this before serving or removing
 * any object. Return 404 (not 403) on mismatch to avoid revealing whether
 * the object exists under a different tenant.
 *
 * @returns true if the key's first path segment matches organizationId
 */
export function verifyKeyOwnership(
  storageKey: string,
  organizationId: string,
): boolean {
  const owner = extractOrganizationId(storageKey);
  return owner !== null && owner === organizationId;
}
