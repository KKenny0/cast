#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { candidateDirectorySha256 } = require('./lib/candidate-snapshot');

const index = process.argv.indexOf('--candidate-dir');
const candidate = index >= 0 ? process.argv[index + 1] : null;
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/hash-reviewed-candidate.mjs --candidate-dir <reviewed-candidate-directory>');
  process.exit(0);
}
if (!candidate) {
  console.error('Missing --candidate-dir <reviewed-candidate-directory>');
  process.exit(2);
}

try {
  console.log(candidateDirectorySha256(path.resolve(candidate)));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
