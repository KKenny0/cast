const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const crypto = require('crypto');

const MAX_LOCAL_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_LOCAL_IMAGE_DIMENSION = 8192;
const MAX_LOCAL_IMAGE_PIXELS = 40_000_000;
const MAX_POSTER_MEDIA_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_POSTER_MEDIA_TOTAL_PIXELS = 40_000_000;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_LOGO_DIMENSION = 2048;
const MAX_LOGO_PIXELS = 4_000_000;
const MAX_PNG_BYTES = 32 * 1024 * 1024;
const MAX_CAPTURE_DIMENSION = 4096;
const MAX_CAPTURE_DPR = 4;
const MAX_FULLPAGE_HEIGHT = 16384;
const MAX_CAPTURE_PIXELS = 80_000_000;
const MAX_CARD_INPUT_JSON_BYTES = 2 * 1024 * 1024;

function realpathExisting(value) {
  try {
    return fs.realpathSync.native(path.resolve(value));
  } catch {
    return null;
  }
}

function pathKey(value) {
  const normalized = path.normalize(value);
  return process.platform === 'win32' || process.platform === 'darwin'
    ? normalized.toLocaleLowerCase('en-US')
    : normalized;
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function createFileAccessPolicy({ htmlPath, assetRoot, allowedFiles = [], allowHtmlSiblings = true }) {
  const htmlRoot = realpathExisting(path.dirname(htmlPath));
  const assets = realpathExisting(assetRoot);
  const roots = [allowHtmlSiblings ? htmlRoot : null, assets].filter(Boolean);
  const files = new Set(allowedFiles
    .filter(isSafeAbsoluteLocalPath)
    .map(realpathExisting)
    .filter(Boolean)
    .map(pathKey));

  function inspect(url) {
    if (url.startsWith('data:')) return { allowed: true, scheme: 'data' };
    if (!url.startsWith('file:')) return { allowed: false, scheme: 'remote' };
    let requested;
    try {
      const localPath = fileURLToPath(url);
      if (!isSafeAbsoluteLocalPath(localPath)) return { allowed: false, scheme: 'file', reason: 'unsafe-local-path' };
      requested = realpathExisting(localPath);
    } catch {
      return { allowed: false, scheme: 'file', reason: 'invalid-file-url' };
    }
    if (!requested) return { allowed: false, scheme: 'file', reason: 'missing-file' };
    if (files.has(pathKey(requested))) return { allowed: true, scheme: 'file' };
    if (roots.some(root => isWithin(root, requested))) return { allowed: true, scheme: 'file' };
    return { allowed: false, scheme: 'file', reason: 'outside-allowed-roots' };
  }

  return { inspect };
}

function isSafeAbsoluteLocalPath(value) {
  if (typeof value !== 'string' || value.length === 0 || !path.isAbsolute(value)) return false;
  const slashNormalized = value.replace(/\//g, '\\');
  if (/^\\\\/.test(slashNormalized)) return false;
  if (/^\\\\[?.]\\/.test(slashNormalized)) return false;
  return true;
}

function validateCaptureSpec({ width, height, dpr, fullpage = false, fullpageHeight = null }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_CAPTURE_DIMENSION || height > MAX_CAPTURE_DIMENSION) {
    throw new Error(`Capture width and height must be integers from 1 to ${MAX_CAPTURE_DIMENSION}`);
  }
  if (typeof dpr !== 'number' || !Number.isFinite(dpr) || dpr < 1 || dpr > MAX_CAPTURE_DPR) throw new Error(`Capture DPR must be from 1 to ${MAX_CAPTURE_DPR}`);
  const effectiveHeight = fullpageHeight === null ? height : fullpageHeight;
  if (!Number.isInteger(effectiveHeight) || effectiveHeight < 1 || (fullpage && effectiveHeight > MAX_FULLPAGE_HEIGHT)) throw new Error(`Full-page capture height must be at most ${MAX_FULLPAGE_HEIGHT}`);
  if (width * effectiveHeight * dpr * dpr > MAX_CAPTURE_PIXELS) throw new Error(`Capture exceeds ${MAX_CAPTURE_PIXELS} output pixels`);
  return true;
}

function allowedLocalFilesForInput(input) {
  const files = new Set();
  if (input?.logo && isSafeAbsoluteLocalPath(input.logo)) files.add(path.resolve(input.logo));
  return [...files];
}

function imageMetadata(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
    let offset = 8;
    let metadata = null;
    let sawEnd = false;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
      if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw new Error('Poster media must be a static PNG image, not APNG');
      const next = offset + 12 + length;
      if (next > buffer.length) break;
      if (type === 'IHDR' && offset === 8 && length === 13) {
        metadata = { mimeType: 'image/png', width: buffer.readUInt32BE(offset + 8), height: buffer.readUInt32BE(offset + 12) };
      }
      if (type === 'IEND' && length === 0) { sawEnd = true; break; }
      offset = next;
    }
    if (metadata && sawEnd) return metadata;
    throw new Error('Poster media contains a truncated or malformed PNG image');
  }
  if (buffer.length >= 12 && buffer.subarray(0, 2).toString('hex') === 'ffd8') {
    const endMarker = buffer.lastIndexOf(Buffer.from([0xff, 0xd9]));
    if (endMarker < 2 || endMarker < buffer.length - 64) throw new Error('Poster media contains a truncated JPEG image');
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { mimeType: 'image/jpeg', height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
      }
      offset += length;
    }
  }
  if (buffer.length >= 30 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    const declaredSize = buffer.readUInt32LE(4) + 8;
    if (declaredSize > buffer.length) throw new Error('Poster media contains a truncated WebP image');
    for (let offset = 12; offset + 8 <= declaredSize;) {
      const chunk = buffer.subarray(offset, offset + 4).toString('ascii');
      const chunkLength = buffer.readUInt32LE(offset + 4);
      if (chunk === 'ANIM' || chunk === 'ANMF') throw new Error('Poster media must be a static WebP image, not animated WebP');
      offset += 8 + chunkLength + (chunkLength % 2);
    }
    const kind = buffer.subarray(12, 16).toString('ascii');
    if (kind === 'VP8X') {
      return {
        mimeType: 'image/webp',
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (kind === 'VP8L' && buffer[20] === 0x2f) {
      return {
        mimeType: 'image/webp',
        width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
        height: 1 + (buffer[22] >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10),
      };
    }
    if (kind === 'VP8 ' && buffer.subarray(23, 26).toString('hex') === '9d012a') {
      return { mimeType: 'image/webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
  }
  throw new Error('Poster media must contain a valid PNG, JPEG, or WebP image');
}

function readStableLocalImage(sourcePath, options = {}) {
  const {
    label = 'Local image',
    maxBytes = MAX_LOCAL_IMAGE_BYTES,
    maxDimension = MAX_LOCAL_IMAGE_DIMENSION,
    maxPixels = MAX_LOCAL_IMAGE_PIXELS,
  } = options;
  if (!isSafeAbsoluteLocalPath(sourcePath)) throw new Error(`${label} path is not a safe absolute local path`);
  const source = path.resolve(sourcePath);
  const sourceFd = fs.openSync(source, 'r');
  try {
    const before = fs.fstatSync(sourceFd);
    if (!before.isFile() || before.size <= 0 || before.size > maxBytes) throw new Error(`${label} must be a non-empty file within its byte budget`);
    const hash = crypto.createHash('sha256');
    const bytes = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < before.size) {
      const count = fs.readSync(sourceFd, bytes, offset, Math.min(1024 * 1024, before.size - offset), offset);
      if (count <= 0) throw new Error(`${label} changed while creating its private snapshot`);
      offset += count;
      if (offset > maxBytes) throw new Error(`${label} exceeds its byte budget while being read`);
    }
    const after = fs.fstatSync(sourceFd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || offset !== before.size) throw new Error(`${label} changed while creating its private snapshot`);
    hash.update(bytes);
    const metadata = imageMetadata(bytes);
    if (metadata.width < 1 || metadata.height < 1 || metadata.width > maxDimension || metadata.height > maxDimension || metadata.width * metadata.height > maxPixels) {
      throw new Error(`${label} dimensions exceed ${maxDimension}px or ${maxPixels} decoded pixels`);
    }
    return { buffer: bytes, sha256: hash.digest('hex'), bytes: offset, width: metadata.width, height: metadata.height, mime_type: metadata.mimeType };
  } finally {
    fs.closeSync(sourceFd);
  }
}

function inspectLocalImage(sourcePath, options = {}) {
  const { buffer, ...metadata } = readStableLocalImage(sourcePath, options);
  return metadata;
}

function snapshotLocalImage(sourcePath, destinationPath, options = {}) {
  const snapshot = readStableLocalImage(sourcePath, options);
  const destinationFd = fs.openSync(destinationPath, 'wx');
  try {
    fs.writeSync(destinationFd, snapshot.buffer, 0, snapshot.buffer.length);
    fs.fsyncSync(destinationFd);
  } finally {
    fs.closeSync(destinationFd);
  }
  const { buffer, ...metadata } = snapshot;
  return { path: destinationPath, ...metadata };
}

function accountUniqueImageSnapshot(seenDigests, totals, snapshot) {
  if (seenDigests.has(snapshot.sha256)) return false;
  seenDigests.add(snapshot.sha256);
  totals.bytes += snapshot.bytes;
  totals.pixels += snapshot.width * snapshot.height;
  return true;
}

module.exports = {
  MAX_LOCAL_IMAGE_BYTES,
  MAX_LOCAL_IMAGE_DIMENSION,
  MAX_LOCAL_IMAGE_PIXELS,
  MAX_LOGO_BYTES,
  MAX_LOGO_DIMENSION,
  MAX_LOGO_PIXELS,
  MAX_PNG_BYTES,
  MAX_CAPTURE_DIMENSION,
  MAX_CAPTURE_DPR,
  MAX_FULLPAGE_HEIGHT,
  MAX_CAPTURE_PIXELS,
  MAX_CARD_INPUT_JSON_BYTES,
  MAX_POSTER_MEDIA_TOTAL_BYTES,
  MAX_POSTER_MEDIA_TOTAL_PIXELS,
  accountUniqueImageSnapshot,
  allowedLocalFilesForInput,
  createFileAccessPolicy,
  imageMetadata,
  inspectLocalImage,
  isSafeAbsoluteLocalPath,
  isWithin,
  pathKey,
  realpathExisting,
  snapshotLocalImage,
  validateCaptureSpec,
};
