import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireEnv } from "@/lib/env";

/** Minimal object storage contract (lets tests inject an in-memory fake). */
export type ObjectStorage = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  remove(key: string): Promise<void>;
  removePrefix(prefix: string): Promise<number>;
};

type R2 = { client: S3Client; bucket: string };

let cached: R2 | null = null;

/** Lazily builds the S3 client pointed at Cloudflare R2 (private bucket). */
export function getR2(): R2 {
  if (cached) return cached;
  const [accountId, accessKeyId, secretAccessKey, bucket] = requireEnv(
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  );
  cached = {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      // R2 does not support the newer default checksum headers of the AWS SDK.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
  return cached;
}

export const PRESIGNED_GET_TTL_SECONDS = 60 * 60;

export const r2Storage: ObjectStorage = {
  async put(key, bytes, contentType) {
    const { client, bucket } = getR2();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }));
  },
  async signedUrl(key, expiresInSeconds = PRESIGNED_GET_TTL_SECONDS) {
    const { client, bucket } = getR2();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
  },
  async remove(key) {
    const { client, bucket } = getR2();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
  async removePrefix(prefix) {
    const { client, bucket } = getR2();
    let removed = 0;
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! })).filter((o) => Boolean(o.Key));
      if (keys.length > 0) {
        await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
        removed += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return removed;
  },
};

/** Object key of a meal photo: everything of a user lives under one prefix. */
export function mealImageKey(userId: string, mealId: string): string {
  return `meals/${userId}/${mealId}.jpg`;
}
