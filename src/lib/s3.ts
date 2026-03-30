import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  type ListObjectsV2CommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export const s3Client = new S3Client({
  region: process.env.S3_REGION ?? "ru-central1",
  endpoint: process.env.S3_ENDPOINT ?? "https://storage.yandexcloud.net",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET!;

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 600
) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600
) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function listObjects(prefix?: string, maxKeys = 50, continuationToken?: string) {
  const params: ListObjectsV2CommandInput = {
    Bucket: BUCKET,
    Prefix: prefix,
    MaxKeys: maxKeys,
    ContinuationToken: continuationToken,
  };
  const command = new ListObjectsV2Command(params);
  return s3Client.send(command);
}

export async function deleteObject(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return s3Client.send(command);
}

export function getPublicUrl(key: string) {
  return `https://${BUCKET}.storage.yandexcloud.net/${key}`;
}

const MAX_SIZES: Record<string, number> = {
  video: 2 * 1024 * 1024 * 1024,  // 2GB
  image: 10 * 1024 * 1024,         // 10MB
  document: 50 * 1024 * 1024,      // 50MB
};

export function validateFileSize(size: number, type: string): boolean {
  const category = type.startsWith("video/")
    ? "video"
    : type.startsWith("image/")
      ? "image"
      : "document";
  return size <= (MAX_SIZES[category] ?? MAX_SIZES.document);
}
