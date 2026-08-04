#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(ROOT, 'plugins', 'card-skill');
const TARGET = path.join(PLUGIN_ROOT, 'skills', 'card-skill');

const REQUIRED_ENTRIES = [
  'SKILL.md',
  'README.md',
  'README.zh-CN.md',
  'LICENSE',
  'VERSION',
  'package.json',
  'package-lock.json',
  'assets',
  'evals',
  'references',
  'schemas',
  'scripts',
];

function assertInsideRoot(target) {
  const relative = path.relative(ROOT, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside repo: ${target}`);
  }
}

function copyEntry(entry) {
  const source = path.join(ROOT, entry);
  const destination = path.join(TARGET, entry);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing required source entry: ${entry}`);
  }
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    dereference: false,
    filter: sourcePath => !sourcePath.includes(`${path.sep}node_modules${path.sep}`),
  });
}

assertInsideRoot(TARGET);
fs.rmSync(TARGET, { recursive: true, force: true });
fs.mkdirSync(TARGET, { recursive: true });

for (const entry of REQUIRED_ENTRIES) {
  copyEntry(entry);
}

console.log(`Packaged card-skill into ${path.relative(ROOT, TARGET)}`);
