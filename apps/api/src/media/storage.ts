import { readFile } from 'fs/promises';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export function storageDriver() {
  return (process.env.STORAGE_DRIVER || 'local').toLowerCase() === 's3' ? 's3' : 'local';
}

export function publicUrlFor(key: string) {
  if (storageDriver() === 'local') return `/uploads/${key}`;
  const base = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');
  return `${base}/${key}`;
}

export async function publishObject(key: string, filePath: string, contentType: string) {
  if (storageDriver() !== 's3') return publicUrlFor(key);
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
  const client = s3();
  const body = await readFile(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return publicUrlFor(key);
}

export async function removeObject(key: string | null | undefined) {
  if (storageDriver() !== 's3' || !key) return;
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return;
  await s3()
    .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    .catch(() => undefined);
}

function s3() {
  return new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY || '',
    },
  });
}
