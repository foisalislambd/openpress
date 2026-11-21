export interface DetectedUpload {
  mime: string;
  ext: string;
}

/** Identify an upload from its bytes. Client MIME types and filenames are not trusted. */
export function detectUpload(bytes: Buffer): DetectedUpload | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: '.png' };
  }
  const head = bytes.subarray(0, 16).toString('ascii');
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return { mime: 'image/gif', ext: '.gif' };
  if (head.startsWith('RIFF') && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: '.webp' };
  }
  if (head.startsWith('%PDF-')) return { mime: 'application/pdf', ext: '.pdf' };
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { mime: 'video/webm', ext: '.webm' };
  }
  if (head.startsWith('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { mime: 'audio/mpeg', ext: '.mp3' };
  }
  if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand.startsWith('avif') || brand === 'avis') return { mime: 'image/avif', ext: '.avif' };
    const mp4 = ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash', 'msnv', 'ndsc', 'ndsh', 'ndsm', 'ndsp', 'ndss', 'ndxc', 'ndxh', 'ndxm', 'ndxp', 'ndxs'];
    if (mp4.includes(brand) || brand.startsWith('mp4')) return { mime: 'video/mp4', ext: '.mp4' };
  }
  return null;
}
