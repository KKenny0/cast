const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

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

function createFileAccessPolicy({ htmlPath, assetRoot, allowedFiles = [] }) {
  const htmlRoot = realpathExisting(path.dirname(htmlPath));
  const assets = realpathExisting(assetRoot);
  const roots = [htmlRoot, assets].filter(Boolean);
  const files = new Set(allowedFiles.map(realpathExisting).filter(Boolean).map(pathKey));

  function inspect(url) {
    if (url.startsWith('data:')) return { allowed: true, scheme: 'data' };
    if (!url.startsWith('file:')) return { allowed: false, scheme: 'remote' };
    let requested;
    try {
      requested = realpathExisting(fileURLToPath(url));
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

module.exports = { createFileAccessPolicy, isWithin, pathKey, realpathExisting };
