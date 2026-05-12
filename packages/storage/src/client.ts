import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── Global singleton ──────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __yelliS3Client: S3Client | undefined;
}

/**
 * Build and return a singleton S3Client from environment variables.
 * Works against MinIO in dev (S3-compatible) and AWS S3 / Cloudflare R2 in prod.
 *
 * Required env vars:
 *   STORAGE_ENDPOINT    - e.g. http://localhost:9000 (MinIO) or https://s3.amazonaws.com
 *   STORAGE_REGION      - e.g. us-east-1
 *   STORAGE_ACCESS_KEY  - Access key ID
 *   STORAGE_SECRET_KEY  - Secret access key
 */
export function getS3Client(): S3Client {
  if (globalThis.__yelliS3Client) {
    return globalThis.__yelliS3Client;
  }

  const endpoint = process.env['STORAGE_ENDPOINT'];
  const region = process.env['STORAGE_REGION'] ?? 'us-east-1';
  const accessKeyId = process.env['STORAGE_ACCESS_KEY'];
  const secretAccessKey = process.env['STORAGE_SECRET_KEY'];

  if (!endpoint) {
    throw new Error('[storage] STORAGE_ENDPOINT env var is required');
  }
  if (!accessKeyId) {
    throw new Error('[storage] STORAGE_ACCESS_KEY env var is required');
  }
  if (!secretAccessKey) {
    throw new Error('[storage] STORAGE_SECRET_KEY env var is required');
  }

  const client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // Required for MinIO path-style URLs (http://localhost:9000/bucket/key).
    // AWS S3 uses virtual-hosted-style by default; this setting is ignored there.
    forcePathStyle: true,
  });

  globalThis.__yelliS3Client = client;
  return client;
}

/**
 * Return the configured bucket name from environment.
 * Throws if STORAGE_BUCKET is not set.
 */
function getBucket(): string {
  const bucket = process.env['STORAGE_BUCKET'];
  if (!bucket) {
    throw new Error('[storage] STORAGE_BUCKET env var is required');
  }
  return bucket;
}

// ─── Operations ────────────────────────────────────────────────────────────────

export interface UploadObjectInput {
  /** Tenant-prefixed storage key — use buildStorageKey() from ./keys */
  storageKey: string;
  /** Raw file content as Buffer or Uint8Array */
  body: Buffer | Uint8Array;
  /** Validated content-type — use isAllowedMimeType() from ./mime before calling */
  contentType: string;
  /** File size in bytes — used to set Content-Length */
  contentLength: number;
}

/**
 * Upload an object to S3/MinIO.
 *
 * SECURITY:
 * - Caller MUST validate MIME type via isAllowedMimeType() before calling this.
 * - Caller MUST use buildStorageKey() to generate the storageKey (never user input).
 * - Content-Disposition is set to 'attachment' to prevent inline execution in browsers.
 */
export async function uploadObject(input: UploadObjectInput): Promise<void> {
  const client = getS3Client();
  const bucket = getBucket();

  const command: PutObjectCommandInput = {
    Bucket: bucket,
    Key: input.storageKey,
    Body: input.body,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
    // Force browsers to download rather than render inline — prevents XSS
    // even if the content-type were somehow misidentified.
    ContentDisposition: 'attachment',
  };

  await client.send(new PutObjectCommand(command));
}

export interface GetDownloadUrlInput {
  /** Tenant-prefixed storage key */
  storageKey: string;
  /**
   * URL expiry in seconds.
   * Default: 3600 (1 hour). Maximum recommended: 86400 (24 hours).
   */
  expiresInSeconds?: number;
}

export interface GetDownloadUrlOutput {
  /** Pre-signed URL valid for the requested duration */
  url: string;
  /** ISO timestamp when the URL expires */
  expiresAt: string;
}

/**
 * Generate a pre-signed download URL for a stored object.
 *
 * SECURITY:
 * - Caller MUST verify key ownership via verifyKeyOwnership() before calling this.
 *   Return 404 (not 403) if ownership verification fails.
 * - The pre-signed URL embeds time-limited credentials — do not cache indefinitely.
 */
export async function getDownloadUrl(
  input: GetDownloadUrlInput,
): Promise<GetDownloadUrlOutput> {
  const client = getS3Client();
  const bucket = getBucket();
  const expiresIn = input.expiresInSeconds ?? 3600;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: input.storageKey,
    // Override response headers so browsers download instead of display
    ResponseContentDisposition: 'attachment',
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return { url, expiresAt };
}

export interface DeleteObjectInput {
  /** Tenant-prefixed storage key */
  storageKey: string;
}

/**
 * Permanently delete an object from S3/MinIO.
 *
 * SECURITY:
 * - Caller MUST verify key ownership via verifyKeyOwnership() before calling this.
 *   Return 404 (not 403) if ownership verification fails.
 * - This operation is irreversible. Soft-delete at the DB layer first if needed.
 */
export async function deleteObject(input: DeleteObjectInput): Promise<void> {
  const client = getS3Client();
  const bucket = getBucket();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: input.storageKey,
    }),
  );
}

export interface ObjectExistsInput {
  /** Tenant-prefixed storage key */
  storageKey: string;
}

/**
 * Check whether an object exists in S3/MinIO without downloading it.
 * Returns false if the object does not exist or if access is denied.
 *
 * SECURITY:
 * - Caller MUST verify key ownership before calling this if the result is
 *   returned to the client — do not reveal cross-tenant existence.
 */
export async function objectExists(input: ObjectExistsInput): Promise<boolean> {
  const client = getS3Client();
  const bucket = getBucket();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: input.storageKey,
      }),
    );
    return true;
  } catch (err) {
    // HeadObject returns a 404 NotFound or 403 Forbidden for missing objects
    if (
      err instanceof Error &&
      ('$metadata' in err
        ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404 ||
          (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 403
        : false)
    ) {
      return false;
    }
    throw err;
  }
}
