#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { sha256Bytes } = require('./lib/visual-job');
const { validateVisualReview } = require('./lib/visual-review');
const { pathEntryExists, publishArtifacts } = require('./lib/publish-artifacts');

function arg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function usage() {
  console.log('Usage: node scripts/publish-reviewed-job.mjs --candidate-dir <directory> --output-dir <directory> [--json]');
}

const candidateArg = arg('--candidate-dir');
const outputArg = arg('--output-dir');
const json = process.argv.includes('--json');
if (process.argv.includes('--help') || process.argv.includes('-h')) { usage(); process.exit(0); }
if (!candidateArg || !outputArg) { usage(); process.exit(2); }

const candidateDir = path.resolve(candidateArg);
const outputDir = path.resolve(outputArg);
const CHECK_SCRIPT = path.join(ROOT, 'scripts', 'check-output.mjs');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function rerunChecker(receipt, htmlPath, pngPath) {
  const capture = receipt.capture || {};
  if (!Number.isInteger(capture.width) || !Number.isInteger(capture.height) || typeof capture.dpr !== 'number') {
    throw new Error('receipt has no valid capture contract');
  }
  const args = [CHECK_SCRIPT, '--html', htmlPath, '--png', pngPath, '--width', String(capture.width), '--height', String(capture.height), '--dpr', String(capture.dpr), '--json'];
  if (capture.fullpage) args.push('--fullpage');
  const checked = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  let report;
  try { report = JSON.parse(checked.stdout); } catch { report = null; }
  if (checked.status !== 0 || report?.pass !== true) throw new Error(`trusted check-output failed: ${checked.stderr || checked.stdout || 'no report'}`);
}

try {
  if (!fs.statSync(candidateDir).isDirectory()) throw new Error('candidate-dir must be a directory');
  const manifestPath = path.join(candidateDir, 'candidate-manifest.json');
  const manifest = readJson(manifestPath);
  if (manifest?.schema_version !== 1 || !Array.isArray(manifest.expected_output_ids) || !manifest.expected_output_ids.length || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) {
    throw new Error('candidate-manifest.json is incomplete');
  }
  const expectedFiles = new Set(['candidate-manifest.json']);
  const expectedOutputs = new Set(manifest.expected_output_ids);
  const seenOutputs = new Set();
  const identities = new Set();
  for (const artifact of manifest.artifacts) {
    for (const field of ['png', 'receipt', 'checked_html']) {
      if (typeof artifact[field] !== 'string' || path.basename(artifact[field]) !== artifact[field]) throw new Error(`manifest artifact has invalid ${field}`);
      expectedFiles.add(artifact[field]);
    }
    expectedFiles.add(`${path.basename(artifact.png, '.png')}.review.json`);
    if (!expectedOutputs.has(artifact.output_id)) throw new Error(`manifest contains unexpected output ${artifact.output_id}`);
    seenOutputs.add(artifact.output_id);
    const identity = `${artifact.output_id}:${artifact.artifact_index}`;
    if (identities.has(identity)) throw new Error(`manifest duplicates artifact ${identity}`);
    identities.add(identity);
  }
  if (seenOutputs.size !== expectedOutputs.size || [...expectedOutputs].some(id => !seenOutputs.has(id))) throw new Error('candidate is missing one or more job outputs');
  const actualFiles = fs.readdirSync(candidateDir);
  if (actualFiles.length !== expectedFiles.size || actualFiles.some(name => !expectedFiles.has(name))) throw new Error('candidate file set does not match its manifest');
  const entries = [];
  const published = [];

  for (const artifact of manifest.artifacts) {
    const receiptName = artifact.receipt;
    const receiptPath = path.join(candidateDir, receiptName);
    const receipt = readJson(receiptPath);
    if (sha256Bytes(fs.readFileSync(receiptPath)) !== artifact.receipt_sha256) throw new Error(`${receiptName}: hash does not match manifest`);
    const pngName = path.basename(receipt?.png?.basename || '');
    if (!pngName.endsWith('.png') || pngName !== artifact.png) throw new Error(`${receiptName}: invalid PNG basename`);
    const pngPath = path.join(candidateDir, pngName);
    const reviewName = `${path.basename(pngName, '.png')}.review.json`;
    const reviewPath = path.join(candidateDir, reviewName);
    const review = readJson(reviewPath);
    const htmlPath = path.join(candidateDir, artifact.checked_html);
    const checked = validateVisualReview(review);
    if (!checked.valid) throw new Error(`${reviewName}: ${checked.errors.join('; ')}`);
    const actualPngHash = sha256Bytes(fs.readFileSync(pngPath));
    if (receipt.job_id !== manifest.job_id || receipt.output_id !== artifact.output_id || receipt.artifact_index !== artifact.artifact_index) throw new Error(`${receiptName}: identity does not match manifest`);
    if (!receipt.job_success || receipt.checker?.pass !== true) throw new Error(`${receiptName}: renderer receipt did not pass`);
    if (review.verdict !== 'pass') throw new Error(`${reviewName}: review did not pass`);
    if (review.job_id !== receipt.job_id || review.output_id !== receipt.output_id || review.artifact_index !== receipt.artifact_index) throw new Error(`${reviewName}: review identity does not match receipt`);
    if (review.render_contract_sha256 !== receipt.render_contract_sha256) throw new Error(`${reviewName}: render contract hash does not match receipt`);
    if (review.png_sha256 !== receipt.png.sha256 || review.png_sha256 !== actualPngHash) throw new Error(`${reviewName}: PNG hash does not match candidate`);
    if (review.metaphor_required !== receipt.metaphor_required) throw new Error(`${reviewName}: metaphor applicability does not match receipt`);
    if (receipt.checked_html?.basename !== artifact.checked_html || receipt.checked_html.sha256 !== sha256Bytes(fs.readFileSync(htmlPath))) throw new Error(`${receiptName}: checked HTML hash does not match candidate`);
    rerunChecker(receipt, htmlPath, pngPath);

    for (const name of [pngName, receiptName, reviewName]) {
      if (pathEntryExists(path.join(outputDir, name))) throw new Error(`publication target already exists: ${path.join(outputDir, name)}`);
    }
    entries.push(
      { stagedPath: pngPath, finalPath: path.join(outputDir, pngName) },
      { stagedPath: receiptPath, finalPath: path.join(outputDir, receiptName) },
      { stagedPath: reviewPath, finalPath: path.join(outputDir, reviewName) },
    );
    published.push(pngName);
  }

  publishArtifacts(entries, { allowOverwrite: false });
  const result = { pass: true, outputs: published };
  console.log(json ? JSON.stringify(result) : `Published ${published.length} reviewed artifact(s) to ${outputDir}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
