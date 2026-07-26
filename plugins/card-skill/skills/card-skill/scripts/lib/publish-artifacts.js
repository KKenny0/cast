const fs = require('fs');
const path = require('path');
const { pathKey } = require('./file-access');

function pathEntryExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function publishArtifacts(entries, options = {}) {
  const allowOverwrite = options.allowOverwrite !== false;
  const rename = options.rename || fs.renameSync;
  const copyFile = options.copyFile || fs.copyFileSync;
  const unlink = options.unlink || fs.unlinkSync;
  const onCleanupWarning = options.onCleanupWarning || (warning => {
    process.emitWarning(`Committed publication left backup ${warning.path}: ${warning.message}`);
  });
  const publishId = `${process.pid}-${Date.now()}`;
  const prepared = [];
  const committed = [];
  const targetKeys = new Set();
  const cleanupWarnings = [];

  try {
    for (const [index, entry] of entries.entries()) {
      const stagedPath = path.resolve(entry.stagedPath);
      const finalPath = path.resolve(entry.finalPath);
      const key = pathKey(finalPath);
      if (targetKeys.has(key)) throw new Error(`Duplicate publication target: ${finalPath}`);
      targetKeys.add(key);
      const sourceStat = fs.statSync(stagedPath);
      if (!sourceStat.isFile()) throw new Error(`Publication source is not a file: ${stagedPath}`);
      const outputDir = path.dirname(finalPath);
      fs.mkdirSync(outputDir, { recursive: true });
      const exists = pathEntryExists(finalPath);
      if (exists && !allowOverwrite) throw new Error(`Publication target already exists: ${finalPath}`);
      if (exists) {
        const targetStat = fs.lstatSync(finalPath);
        if (!targetStat.isFile() && !targetStat.isSymbolicLink()) {
          throw new Error(`Output path is not a file: ${finalPath}`);
        }
      }
      const stagingPath = path.join(outputDir, `.${path.basename(finalPath)}.${publishId}-${index}.tmp`);
      const backupPath = exists
        ? path.join(outputDir, `.${path.basename(finalPath)}.${publishId}-${index}.bak`)
        : null;
      const item = { finalPath, stagingPath, backupPath };
      prepared.push(item);
      copyFile(stagedPath, stagingPath);
    }

    for (const item of prepared) {
      if (item.backupPath) rename(item.finalPath, item.backupPath);
      try {
        rename(item.stagingPath, item.finalPath);
      } catch (error) {
        if (item.backupPath && pathEntryExists(item.backupPath)) rename(item.backupPath, item.finalPath);
        throw error;
      }
      committed.push(item);
    }
  } catch (error) {
    for (const item of committed.reverse()) {
      if (pathEntryExists(item.finalPath)) unlink(item.finalPath);
      if (item.backupPath && pathEntryExists(item.backupPath)) rename(item.backupPath, item.finalPath);
    }
    throw error;
  } finally {
    for (const item of prepared) {
      if (pathEntryExists(item.stagingPath)) unlink(item.stagingPath);
      if (item.backupPath && pathEntryExists(item.backupPath) && !pathEntryExists(item.finalPath)) {
        rename(item.backupPath, item.finalPath);
      }
    }
  }

  // Publication is committed at this point. Backup cleanup must never turn a
  // successful transaction into a destructive rollback.
  for (const item of committed) {
    if (!item.backupPath || !pathEntryExists(item.backupPath)) continue;
    try {
      unlink(item.backupPath);
    } catch (error) {
      const warning = { path: item.backupPath, message: error.message };
      cleanupWarnings.push(warning);
      try {
        onCleanupWarning(warning);
      } catch {
        // A reporting hook cannot change the already-committed transaction.
      }
    }
  }
  return { cleanupWarnings };
}

module.exports = { pathEntryExists, publishArtifacts };
