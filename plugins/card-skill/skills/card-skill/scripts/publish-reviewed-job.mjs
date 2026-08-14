#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { artifactContractProjection, artifactPlansForOutput, materializeRenderContract, sha256Bytes, sha256Json, validateVisualJob } = require('./lib/visual-job');
const { validateVisualReview } = require('./lib/visual-review');
const { pathEntryExists, publishArtifacts } = require('./lib/publish-artifacts');
const { allowedLocalFilesForInput, validateCaptureSpec } = require('./lib/file-access');
const { validate } = require('./lib/schema');
const { snapshotCandidateDirectory } = require('./lib/candidate-snapshot');

function arg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function usage() {
  console.log('Usage: node scripts/publish-reviewed-job.mjs --candidate-dir <directory> --output-dir <directory> --expected-candidate-sha256 <approved-sha256> [--allow-legacy-v1] [--json]');
}

const candidateArg = arg('--candidate-dir');
const outputArg = arg('--output-dir');
const expectedCandidateSha256 = arg('--expected-candidate-sha256');
const allowLegacyV1 = process.argv.includes('--allow-legacy-v1');
const json = process.argv.includes('--json');
if (process.argv.includes('--help') || process.argv.includes('-h')) { usage(); process.exit(0); }
if (!candidateArg || !outputArg || !/^[a-f0-9]{64}$/.test(expectedCandidateSha256 || '')) { usage(); process.exit(2); }

const sourceCandidateDir = path.resolve(candidateArg);
const outputDir = path.resolve(outputArg);
const CHECK_SCRIPT = path.join(ROOT, 'scripts', 'check-output.mjs');
const CAPTURE_SCRIPT = path.join(ROOT, 'assets', 'capture4k.js');
const PUBLISH_DEADLINE = Date.now() + 10 * 60 * 1000;
const MAX_JSON_BYTES = 4 * 1024 * 1024;

function subprocessTimeout() {
  const remaining = PUBLISH_DEADLINE - Date.now();
  if (remaining <= 0) throw new Error('reviewed publication exceeded its 10-minute job deadline');
  return Math.min(60000, remaining);
}

function readJson(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_JSON_BYTES) {
    throw new Error(`${path.basename(file)} is not a bounded JSON file`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function embeddedImageInventory(html) {
  const digests = [];
  let invalid = 0;
  const activeMarkup = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const candidates = [];
  for (const pattern of [
    /\b(?:src|srcset|href|xlink:href|data|poster)\s*=\s*["'](data:image\/[^"']+)["']/gi,
    /url\s*\(\s*["']?(data:image\/[^"')\s]+)["']?\s*\)/gi,
  ]) {
    for (const match of activeMarkup.matchAll(pattern)) candidates.push(match[1]);
  }
  for (const candidate of candidates) {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(candidate);
    if (!match || match[2].length % 4 !== 0) { invalid += 1; continue; }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.toString('base64') !== match[2]) { invalid += 1; continue; }
    digests.push(sha256Bytes(bytes));
  }
  return { digests, invalid, total: candidates.length };
}

function validateEffectiveContract(plannedContract, effectiveContract) {
  const clean = JSON.parse(JSON.stringify(effectiveContract));
  delete clean.__articleDiagramSalvage;
  const checked = validate(clean, { checkLocalFiles: false });
  if (!checked.valid) throw new Error(`effective render contract is invalid: ${checked.errors.join('; ')}`);
  if (effectiveContract.mode !== plannedContract.mode) throw new Error('effective render contract changed renderer mode');
  const plannedFiles = allowedLocalFilesForInput(plannedContract);
  const effectiveFiles = allowedLocalFilesForInput(effectiveContract);
  if (JSON.stringify(plannedFiles) !== JSON.stringify(effectiveFiles)) throw new Error('effective render contract changed the sealed local asset set');
  if (sha256Json(effectiveContract) === sha256Json(plannedContract)) return;
  if (effectiveContract.mode !== 'article-diagram') throw new Error('effective render contract changed a non-adaptive renderer contract');
  const plannedStable = JSON.parse(JSON.stringify(plannedContract));
  const effectiveStable = JSON.parse(JSON.stringify(effectiveContract));
  delete plannedStable.aspect;
  delete effectiveStable.aspect;
  delete plannedStable.__articleDiagramSalvage;
  delete effectiveStable.__articleDiagramSalvage;
  if (sha256Json(plannedStable) !== sha256Json(effectiveStable)) throw new Error('effective article-diagram contract changed fields outside the adaptation boundary');
}

function rerunChecker(receipt, htmlPath, pngPath, allowedFiles, expectedImageDigests) {
  const capture = receipt.capture || {};
  if (typeof capture.fullpage !== 'boolean') throw new Error('receipt has no valid fullpage capture flag');
  try { validateCaptureSpec(capture); } catch (error) {
    throw new Error(`receipt has no valid capture contract: ${error.message}`);
  }
  if (!Number.isInteger(capture.width) || !Number.isInteger(capture.height) || typeof capture.dpr !== 'number') {
    throw new Error('receipt has no valid capture contract');
  }
  const args = [CHECK_SCRIPT, '--html', htmlPath, '--png', pngPath, '--width', String(capture.width), '--height', String(capture.height), '--dpr', String(capture.dpr), '--json'];
  if (capture.fullpage) args.push('--fullpage');
  for (const file of allowedFiles) args.push('--allow-file', file);
  args.push('--sealed-images');
  for (const digest of expectedImageDigests) args.push('--expect-image-sha', digest);
  const checked = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: subprocessTimeout(),
    env: { ...process.env, CARD_SKILL_SEALED_CAPTURE: '1' },
  });
  let report;
  try { report = JSON.parse(checked.stdout); } catch { report = null; }
  if (checked.status !== 0 || report?.pass !== true) throw new Error(`trusted check-output failed: ${checked.stderr || checked.stdout || 'no report'}`);
}

function recaptureAndVerify(receipt, htmlPath, pngPath, allowedFiles) {
  const capture = receipt.capture || {};
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-publish-recapture-'));
  const recapturedPath = path.join(tempDir, 'recaptured.png');
  try {
    const args = [
      CAPTURE_SCRIPT,
      htmlPath,
      recapturedPath,
      String(capture.width),
      String(capture.height),
      String(capture.dpr),
    ];
    if (capture.fullpage) args.push('fullpage');
    for (const file of allowedFiles) args.push('--allow-file', file);
    const result = spawnSync(process.execPath, args, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: subprocessTimeout(),
      env: { ...process.env, CARD_SKILL_SEALED_CAPTURE: '1' },
    });
    if (result.status !== 0) throw new Error(`trusted recapture failed: ${result.stderr || result.stdout || 'no output'}`);
    if (sha256Bytes(fs.readFileSync(recapturedPath)) !== sha256Bytes(fs.readFileSync(pngPath))) {
      throw new Error('candidate PNG does not match a trusted recapture of its sealed checked HTML');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const candidateSnapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-candidate-snapshot-'));
try {
  const candidateSnapshot = snapshotCandidateDirectory(sourceCandidateDir, candidateSnapshotRoot);
  const candidateDir = candidateSnapshot.directory;
  if (candidateSnapshot.sha256 !== expectedCandidateSha256) throw new Error('candidate directory does not match the externally approved SHA-256');
  if (!fs.statSync(candidateDir).isDirectory()) throw new Error('candidate-dir must be a directory');
  const manifestPath = path.join(candidateDir, 'candidate-manifest.json');
  const manifest = readJson(manifestPath);
  if (![1, 2].includes(manifest?.schema_version) || !Array.isArray(manifest.expected_output_ids) || !manifest.expected_output_ids.length || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) {
    throw new Error('candidate-manifest.json is incomplete');
  }
  if (manifest.schema_version === 1 && !allowLegacyV1) {
    throw new Error('legacy Visual Job v1 publication requires explicit --allow-legacy-v1 approval');
  }
  if (manifest.schema_version !== 1 && allowLegacyV1) {
    throw new Error('--allow-legacy-v1 is only valid for a Visual Job v1 candidate');
  }
  if (manifest.expected_output_ids.length > 20 || manifest.artifacts.length > 20) {
    throw new Error('candidate manifest exceeds the Visual Job limit of 20 outputs and 20 artifacts');
  }
  if (manifest.expected_output_ids.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
      || new Set(manifest.expected_output_ids).size !== manifest.expected_output_ids.length) {
    throw new Error('candidate manifest expected_output_ids must be unique safe IDs');
  }
  if ((manifest.schema_version === 1 && manifest.visual_job_version !== 1)
      || (manifest.schema_version === 2 && ![2, 3].includes(manifest.visual_job_version))) {
    throw new Error('candidate manifest Visual Job version does not match its schema');
  }
  const expectedFiles = new Set(['candidate-manifest.json']);
  let visualJob = null;
  const plannedArtifacts = new Map();
  if (manifest.schema_version === 2) {
    if (manifest.visual_job !== 'visual-job.json') throw new Error('candidate manifest has invalid Visual Job snapshot');
    expectedFiles.add(manifest.visual_job);
    visualJob = readJson(path.join(candidateDir, manifest.visual_job));
    const validatedJob = validateVisualJob(visualJob, { checkLocalFiles: false });
    if (!validatedJob.valid || visualJob.schema_version !== manifest.visual_job_version) throw new Error(`candidate Visual Job is invalid: ${validatedJob.errors.join('; ')}`);
    if (visualJob.job_id !== manifest.job_id || sha256Json(visualJob) !== manifest.visual_job_sha256) throw new Error('candidate Visual Job identity or hash does not match manifest');
    if (JSON.stringify(visualJob.outputs.map(output => output.id)) !== JSON.stringify(manifest.expected_output_ids)) throw new Error('candidate Visual Job outputs do not match manifest');
    for (const output of visualJob.outputs) {
      for (const plan of artifactPlansForOutput(visualJob, output)) plannedArtifacts.set(`${output.id}:${plan.artifact_index}`, plan);
    }
    if (plannedArtifacts.size !== manifest.artifacts.length) throw new Error('candidate manifest does not contain the complete Visual Job artifact set');
  }
  const expectedOutputs = new Set(manifest.expected_output_ids);
  const seenOutputs = new Set();
  const identities = new Set();
  for (const artifact of manifest.artifacts) {
    for (const field of ['png', 'receipt', 'checked_html']) {
      if (typeof artifact[field] !== 'string' || path.basename(artifact[field]) !== artifact[field]) throw new Error(`manifest artifact has invalid ${field}`);
      expectedFiles.add(artifact[field]);
    }
    const artifactStem = path.basename(artifact.png, '.png');
    if (!artifact.png.endsWith('.png')
        || artifact.receipt !== `${artifactStem}.receipt.json`
        || artifact.checked_html !== `${artifactStem}.checked.html`) {
      throw new Error('manifest artifact filenames must share the PNG stem');
    }
    expectedFiles.add(`${artifactStem}.review.json`);
    if (!expectedOutputs.has(artifact.output_id)) throw new Error(`manifest contains unexpected output ${artifact.output_id}`);
    if (artifact.allowed_local_files !== undefined && (!Array.isArray(artifact.allowed_local_files) || artifact.allowed_local_files.some(file => typeof file !== 'string' || !path.isAbsolute(file)))) {
      throw new Error('manifest artifact has invalid local asset allow-list');
    }
    if (manifest.schema_version === 1 && (artifact.allowed_local_files || []).length > 0) throw new Error('legacy candidate manifests cannot authorize local assets');
    if (manifest.schema_version === 1 && ['artifact_id', 'artifact_role', 'artifact_plan_sha256'].some(field => Object.hasOwn(artifact, field))) {
      throw new Error('legacy candidate manifest contains Visual Job v3 artifact fields');
    }
    if (artifact.artifact_id !== undefined && (typeof artifact.artifact_id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(artifact.artifact_id))) {
      throw new Error('manifest artifact has invalid artifact_id');
    }
    if (manifest.schema_version === 2) {
      if (typeof artifact.artifact_role !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(artifact.artifact_role)) throw new Error('manifest artifact has invalid artifact_role');
      if (!/^[a-f0-9]{64}$/.test(artifact.artifact_plan_sha256 || '')) throw new Error('manifest artifact has invalid artifact_plan_sha256');
      const plan = plannedArtifacts.get(`${artifact.output_id}:${artifact.artifact_index}`);
      if (!plan || artifact.artifact_id !== plan.id || artifact.artifact_role !== plan.role || artifact.png !== plan.basename || artifact.artifact_plan_sha256 !== sha256Json(plan)) {
        throw new Error('manifest artifact does not match the Visual Job plan');
      }
    }
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
    let plannedMediaCount = 0;
    let plannedLogoCount = 0;
    const receiptName = artifact.receipt;
    const receiptPath = path.join(candidateDir, receiptName);
    const receipt = readJson(receiptPath);
    if (sha256Bytes(fs.readFileSync(receiptPath)) !== artifact.receipt_sha256) throw new Error(`${receiptName}: hash does not match manifest`);
    if (receipt.visual_job_version !== manifest.visual_job_version) throw new Error(`${receiptName}: Visual Job version does not match manifest`);
    const pngName = path.basename(receipt?.png?.basename || '');
    if (!pngName.endsWith('.png') || pngName !== artifact.png) throw new Error(`${receiptName}: invalid PNG basename`);
    const pngPath = path.join(candidateDir, pngName);
    const reviewName = `${path.basename(pngName, '.png')}.review.json`;
    const reviewPath = path.join(candidateDir, reviewName);
    const review = readJson(reviewPath);
    const htmlPath = path.join(candidateDir, artifact.checked_html);
    const checked = validateVisualReview(review);
    if (!checked.valid) throw new Error(`${reviewName}: ${checked.errors.join('; ')}`);
    if (manifest.schema_version === 1) {
      const v3ReceiptFields = ['artifact_id', 'artifact_role', 'visual_job_sha256', 'artifact_plan_sha256', 'artifact_contract_sha256', 'source_evidence_sha256', 'artifact_plan'];
      const v3ReviewFields = ['visual_job_sha256', 'artifact_plan_sha256', 'artifact_contract_sha256'];
      if (v3ReceiptFields.some(field => Object.hasOwn(receipt, field)) || v3ReviewFields.some(field => Object.hasOwn(review, field))) {
        throw new Error(`${receiptName}: legacy candidate cannot contain Visual Job v3 evidence bindings`);
      }
    }
    const actualPngHash = sha256Bytes(fs.readFileSync(pngPath));
    if (receipt.job_id !== manifest.job_id || receipt.output_id !== artifact.output_id || receipt.artifact_index !== artifact.artifact_index) throw new Error(`${receiptName}: identity does not match manifest`);
    if (artifact.artifact_id !== undefined && receipt.artifact_id !== artifact.artifact_id) throw new Error(`${receiptName}: artifact id does not match manifest`);
    if (manifest.schema_version === 2) {
      const plan = plannedArtifacts.get(`${artifact.output_id}:${artifact.artifact_index}`);
      const plannedOutput = visualJob.outputs.find(output => output.id === artifact.output_id);
      const plannedContract = materializeRenderContract(visualJob, plannedOutput);
      const effectiveContract = receipt.effective_render_contract || plannedContract;
      plannedMediaCount = artifactContractProjection(plannedContract, artifact.artifact_index).card?.body?.filter(element => element?.type === 'media').length || 0;
      // Poster branding is a last-card colophon; earlier artifacts in the
      // same series intentionally carry no logo resource.
      plannedLogoCount = plannedContract.logo
        && (plannedContract.mode !== 'poster' || artifact.artifact_index === plannedContract.cards.length)
        ? 1 : 0;
      validateEffectiveContract(plannedContract, effectiveContract);
      const evidence = plan.source_unit_ids.map(id => visualJob.source_units.find(unit => unit.id === id));
      if (receipt.artifact_role !== artifact.artifact_role || receipt.artifact_plan_sha256 !== artifact.artifact_plan_sha256 || sha256Json(receipt.artifact_plan) !== artifact.artifact_plan_sha256) throw new Error(`${receiptName}: artifact plan does not match manifest`);
      if (receipt.visual_job_sha256 !== manifest.visual_job_sha256 || receipt.source_evidence_sha256 !== sha256Json(evidence)) throw new Error(`${receiptName}: Visual Job evidence binding does not match manifest`);
      if (receipt.requested_render_contract_sha256 !== sha256Json(plannedContract)) throw new Error(`${receiptName}: requested render contract does not match the sealed Visual Job`);
      if (receipt.render_contract_sha256 !== sha256Json(effectiveContract) || receipt.artifact_contract_sha256 !== sha256Json(artifactContractProjection(effectiveContract, artifact.artifact_index))) throw new Error(`${receiptName}: effective render contract binding is invalid`);
      if (manifest.visual_job_version === 3) {
        const evidenceDigests = new Set(evidence.filter(unit => unit?.evidence?.strength === 'primary' && unit?.evidence?.freshness === 'current').map(unit => unit.digest).filter(Boolean));
        const snapshots = Array.isArray(receipt.media_snapshots) ? receipt.media_snapshots : [];
        if (snapshots.length !== plannedMediaCount) throw new Error(`${receiptName}: media snapshot count does not match the sealed poster contract`);
        if (snapshots.some(snapshot => !/^[a-f0-9]{64}$/.test(snapshot?.sha256 || '') || !evidenceDigests.has(snapshot.sha256))) throw new Error(`${receiptName}: media snapshot does not match sealed source evidence`);
      }
      const logoSnapshot = receipt.logo_snapshot;
      if (plannedLogoCount > 0 && (!logoSnapshot || !/^[a-f0-9]{64}$/.test(logoSnapshot.sha256 || '') || !Number.isInteger(logoSnapshot.bytes) || !Number.isInteger(logoSnapshot.width) || !Number.isInteger(logoSnapshot.height))) {
        throw new Error(`${receiptName}: logo snapshot is missing or invalid`);
      }
      if (plannedLogoCount === 0 && logoSnapshot) throw new Error(`${receiptName}: receipt contains an unplanned logo snapshot`);
    }
    if (!receipt.job_success || receipt.checker?.pass !== true) throw new Error(`${receiptName}: renderer receipt did not pass`);
    if (review.verdict !== 'pass') throw new Error(`${reviewName}: review did not pass`);
    if (review.job_id !== receipt.job_id || review.output_id !== receipt.output_id || review.artifact_index !== receipt.artifact_index) throw new Error(`${reviewName}: review identity does not match receipt`);
    if (manifest.schema_version === 2 && (review.visual_job_sha256 !== receipt.visual_job_sha256 || review.artifact_plan_sha256 !== receipt.artifact_plan_sha256 || review.artifact_contract_sha256 !== receipt.artifact_contract_sha256)) throw new Error(`${reviewName}: Visual Job, artifact plan, or artifact contract hash does not match receipt`);
    if (review.render_contract_sha256 !== receipt.render_contract_sha256) throw new Error(`${reviewName}: render contract hash does not match receipt`);
    if (review.png_sha256 !== receipt.png.sha256 || review.png_sha256 !== actualPngHash) throw new Error(`${reviewName}: PNG hash does not match candidate`);
    if (review.metaphor_required !== receipt.metaphor_required) throw new Error(`${reviewName}: metaphor applicability does not match receipt`);
    const checkedHtml = fs.readFileSync(htmlPath, 'utf8');
    if (receipt.checked_html?.basename !== artifact.checked_html || receipt.checked_html.sha256 !== sha256Bytes(Buffer.from(checkedHtml))) throw new Error(`${receiptName}: checked HTML hash does not match candidate`);
    if (/<template\b[^>]*\bshadowrootmode\s*=/i.test(checkedHtml)) throw new Error(`${receiptName}: checked HTML contains an unauditable declarative shadow root`);
    const embedded = embeddedImageInventory(checkedHtml);
    if (embedded.invalid > 0) throw new Error(`${receiptName}: checked HTML contains an unsupported embedded image resource`);
    const embeddedDigests = embedded.digests;
    const snapshotDigests = [
      ...(receipt.media_snapshots || []).map(snapshot => snapshot.sha256),
      ...(receipt.logo_snapshot ? [receipt.logo_snapshot.sha256] : []),
    ];
    // Snapshot slots are validated against the sealed contract above. At this
    // boundary we compare resource identities: one approved image may appear
    // in both authored content and renderer chrome without becoming a new
    // resource.
    const sortedEmbedded = [...new Set(embeddedDigests)].sort();
    const sortedSnapshots = [...new Set(snapshotDigests)].sort();
    if (JSON.stringify(sortedEmbedded) !== JSON.stringify(sortedSnapshots)) {
      throw new Error(`${receiptName}: embedded images do not exactly match the sealed snapshots (${embeddedDigests.join(',') || 'none'} vs ${snapshotDigests.join(',') || 'none'})`);
    }
    const expectedAllowedFiles = [];
    const artifactAllowedFiles = artifact.allowed_local_files || [];
    if (manifest.schema_version === 2 && JSON.stringify(artifactAllowedFiles) !== JSON.stringify(expectedAllowedFiles)) {
      throw new Error(`${receiptName}: local asset allow-list does not match the sealed Visual Job`);
    }
    rerunChecker(receipt, htmlPath, pngPath, manifest.schema_version === 2 ? expectedAllowedFiles : artifactAllowedFiles, snapshotDigests);
    recaptureAndVerify(receipt, htmlPath, pngPath, manifest.schema_version === 2 ? expectedAllowedFiles : artifactAllowedFiles);

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
} finally {
  fs.rmSync(candidateSnapshotRoot, { recursive: true, force: true });
}
