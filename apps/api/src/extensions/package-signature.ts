import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'crypto';

export interface PackageFile {
  path: string;
  data: Buffer;
}

export interface PackageSignature {
  version: 1;
  algorithm: 'ed25519';
  keyId: string;
  hash: string;
  signature: string;
}

const SIG_NAME = 'openpress-signature.json';

/** Stable hash of every file except the signature itself. */
export function hashPackageFiles(files: PackageFile[]) {
  const lines = files
    .filter((file) => file.path !== SIG_NAME && file.path.length > 0)
    .map((file) => ({
      path: file.path.replace(/\\/g, '/').replace(/^\/+/, ''),
      hex: createHash('sha256').update(file.data).digest('hex'),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((file) => `${file.path}\n${file.hex}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

export function createSigningKey(name = 'openpress') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { name, publicPem, privatePem, keyId: keyIdOf(publicPem) };
}

export function keyIdOf(publicPem: string) {
  return createHash('sha256').update(publicPem).digest('hex').slice(0, 16);
}

export function signPackageHash(privatePem: string, hash: string): PackageSignature {
  const key = createPrivateKey(privatePem);
  const signature = sign(null, Buffer.from(hash), key).toString('base64');
  const publicPem = createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString();
  return { version: 1, algorithm: 'ed25519', keyId: keyIdOf(publicPem), hash, signature };
}

export function verifyPackageHash(publicPem: string, hash: string, signature: PackageSignature) {
  if (signature.algorithm !== 'ed25519' || signature.hash !== hash) return false;
  if (signature.keyId !== keyIdOf(publicPem)) return false;
  return verify(null, Buffer.from(hash), createPublicKey(publicPem), Buffer.from(signature.signature, 'base64'));
}

export function compareVersions(left: string, right: string) {
  const parse = (value: string) => value.split('.').map((part) => Number(part.replace(/\D.*/, '')) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0) ? -1 : 1;
  }
  return 0;
}

export const SIGNATURE_FILE = SIG_NAME;
