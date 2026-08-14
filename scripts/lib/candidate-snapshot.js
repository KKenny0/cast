const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MAX_PNG_BYTES } = require('./file-access');

// A valid Visual Job has at most 20 artifacts. A v2/v3 reviewed candidate
// needs manifest/job metadata plus four files per artifact.
const MAX_FILES = 82;
const MAX_FILE_BYTES = 48 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;

function visitCandidateDirectory(directory, onFile) {
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('candidate-dir must be a regular directory, not a link');
  const names = fs.readdirSync(directory).sort();
  if (names.length < 1 || names.length > MAX_FILES) throw new Error(`candidate-dir must contain 1 to ${MAX_FILES} files`);
  let totalBytes = 0;
  for (const name of names) {
    if (path.basename(name) !== name) throw new Error('candidate-dir contains an invalid filename');
    const file = path.join(directory, name);
    const maximum = /\.png$/i.test(name) ? MAX_PNG_BYTES : (/\.json$/i.test(name) ? MAX_JSON_BYTES : MAX_FILE_BYTES);
    const beforePath = fs.lstatSync(file);
    if (!beforePath.isFile() || beforePath.isSymbolicLink() || beforePath.size < 1 || beforePath.size > maximum) throw new Error(`candidate file is not a bounded regular file: ${name}`);
    totalBytes += beforePath.size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('candidate-dir exceeds the 256 MiB snapshot budget');
    const sourceFd = fs.openSync(file, 'r');
    try {
      const before = fs.fstatSync(sourceFd);
      if (!before.isFile() || before.size !== beforePath.size) throw new Error(`candidate file changed before snapshot: ${name}`);
      onFile({ name, size: before.size, sourceFd, before });
      const after = fs.fstatSync(sourceFd);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error(`candidate file changed during snapshot: ${name}`);
    } finally { fs.closeSync(sourceFd); }
  }
  if (JSON.stringify(fs.readdirSync(directory).sort()) !== JSON.stringify(names)) throw new Error('candidate-dir changed during snapshot');
}

function streamFile(sourceFd, size, onChunk) {
  const buffer = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, size));
  let offset = 0;
  while (offset < size) {
    const count = fs.readSync(sourceFd, buffer, 0, Math.min(buffer.length, size - offset), offset);
    if (count <= 0) throw new Error('candidate file changed during snapshot');
    onChunk(buffer.subarray(0, count), offset);
    offset += count;
  }
}

function addDigestHeader(digest, name, size) {
  const nameBytes = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(16);
  header.writeBigUInt64BE(BigInt(nameBytes.length), 0);
  header.writeBigUInt64BE(BigInt(size), 8);
  digest.update(header).update(nameBytes);
}

function candidateDirectorySha256(directory) {
  const digest = crypto.createHash('sha256');
  visitCandidateDirectory(directory, ({ name, size, sourceFd }) => {
    addDigestHeader(digest, name, size);
    streamFile(sourceFd, size, chunk => digest.update(chunk));
  });
  return digest.digest('hex');
}

function snapshotCandidateDirectory(source, root) {
  const destination = path.join(root, 'candidate');
  fs.mkdirSync(destination);
  const digest = crypto.createHash('sha256');
  visitCandidateDirectory(source, ({ name, size, sourceFd }) => {
    addDigestHeader(digest, name, size);
    const destinationFd = fs.openSync(path.join(destination, name), 'wx');
    try {
      streamFile(sourceFd, size, (chunk, offset) => {
        digest.update(chunk);
        fs.writeSync(destinationFd, chunk, 0, chunk.length, offset);
      });
      fs.fsyncSync(destinationFd);
    } finally { fs.closeSync(destinationFd); }
  });
  return { directory: destination, sha256: digest.digest('hex') };
}

module.exports = { candidateDirectorySha256, snapshotCandidateDirectory };
