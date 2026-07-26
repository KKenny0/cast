#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const {
  materializeRenderContract,
  sha256Bytes,
  sha256Json,
  validateVisualJob,
} = require('./lib/visual-job');
const { pathEntryExists, publishArtifacts } = require('./lib/publish-artifacts');
const { isWithin, pathKey, realpathExisting } = require('./lib/file-access');

function usage() {
  console.log('Usage: node scripts/render-job.mjs --input <visual-job.json> --output-dir <directory> [--json]');
}

function arg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function stableError(error) {
  const text = String(error || '');
  if (/Validation failed|Unknown mode|render_contract/.test(text)) return 'input_contract';
  if (/safety\.|asset_blocked|path|sensitive|outside repo/i.test(text)) return 'safety';
  if (/Output check failed|bitmap_/.test(text)) return 'quality_gate';
  if (/overflow|collision|cannot fit|crop/i.test(text)) return 'content_fit';
  return 'runtime';
}

function receipt(job, output, contract, artifact, index) {
  const png = fs.readFileSync(artifact.path);
  return {
    schema_version: 1,
    job_id: job.job_id,
    output_id: output.id,
    artifact_index: index,
    card_skill_version: fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(),
    mode: contract.mode,
    tier: job.decision.tier,
    tone: artifact.tone,
    design: artifact.resolved_design,
    render_contract_sha256: sha256Json(contract),
    png: {
      basename: artifact.basename,
      width: artifact.width,
      height: artifact.height,
      sha256: sha256Bytes(png),
    },
    checker: artifact.checker,
    job_success: true,
  };
}

function existingCaseFoldedNames(outputDir) {
  if (!pathEntryExists(outputDir)) return new Set();
  return new Set(fs.readdirSync(outputDir).map(name => name.toLocaleLowerCase('en-US')));
}

function launchPostJobUpdate() {
  if (process.env.CARD_SKILL_DISABLE_AUTO_UPDATE === '1') return;
  try {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'check-update.mjs'), '--auto-update'], {
      cwd: os.homedir(),
      detached: true,
      env: { ...process.env, CARD_SKILL_CALLER_CWD: process.cwd() },
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // Rendering and publication are already complete; a later request can retry.
  }
}

const inputPath = arg('--input');
const outputDirArg = arg('--output-dir');
const json = process.argv.includes('--json');
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}
if (!inputPath || !outputDirArg) {
  usage();
  process.exit(2);
}

let job;
try {
  job = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
} catch (error) {
  console.error(`input_contract: cannot read Visual Job: ${error.message}`);
  process.exit(1);
}
const validated = validateVisualJob(job);
if (!validated.valid) {
  console.error(`input_contract:\n${validated.errors.map(error => `- ${error}`).join('\n')}`);
  process.exit(1);
}

const outputDir = path.resolve(outputDirArg);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), `card-skill-job-${job.job_id}-`));
const stagedArtifacts = [];
const targetKeys = new Set();

try {
  for (const output of job.outputs) {
    const outputStage = path.join(stage, 'outputs', output.id);
    fs.mkdirSync(outputStage, { recursive: true });
    const contract = materializeRenderContract(job, output);
    const input = path.join(outputStage, 'contract.json');
    const requestedPng = path.join(outputStage, output.basename);
    const reportPath = path.join(outputStage, 'card-report.json');
    fs.writeFileSync(input, JSON.stringify(contract));
    const run = spawnSync(process.execPath, [
      path.join(ROOT, 'scripts', 'card.js'),
      '--input', input,
      '--output', requestedPng,
      '--report', reportPath,
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, CARD_SKILL_DISABLE_AUTO_UPDATE: '1' },
    });
    if (run.status !== 0) {
      throw new Error(`${stableError(run.stderr || run.stdout)}: ${run.stderr || run.stdout || 'renderer failed'}`);
    }
    const cardReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (!Array.isArray(cardReport.artifacts) || cardReport.artifacts.length === 0) {
      throw new Error(`runtime: output ${output.id} returned no artifacts`);
    }

    for (const [artifactOffset, artifact] of cardReport.artifacts.entries()) {
      const artifactPath = realpathExisting(artifact.path);
      const expectedRoot = realpathExisting(outputStage);
      if (!artifactPath || !expectedRoot || !isWithin(expectedRoot, artifactPath) || !pathEntryExists(artifactPath)) {
        throw new Error(`safety: renderer returned an artifact outside its staging directory`);
      }
      const basename = path.basename(artifactPath);
      const targetKey = pathKey(path.join(outputDir, basename));
      if (targetKeys.has(targetKey)) throw new Error(`safety: duplicate publication target ${basename}`);
      targetKeys.add(targetKey);
      const artifactRecord = {
        ...artifact,
        path: artifactPath,
        basename,
        tone: cardReport.tone,
        resolved_design: cardReport.resolved_design,
      };
      const receiptData = receipt(job, output, contract, artifactRecord, artifactOffset + 1);
      const receiptPath = path.join(outputStage, `${path.basename(basename, '.png')}.receipt.json`);
      fs.writeFileSync(receiptPath, `${JSON.stringify(receiptData, null, 2)}\n`);
      stagedArtifacts.push({
        png: artifactPath,
        receipt: receiptPath,
        basename,
        receiptBasename: path.basename(receiptPath),
      });
    }
  }

  const existingNames = existingCaseFoldedNames(outputDir);
  for (const artifact of stagedArtifacts) {
    for (const basename of [artifact.basename, artifact.receiptBasename]) {
      if (existingNames.has(basename.toLocaleLowerCase('en-US'))) {
        throw new Error(`safety: publication target already exists: ${path.join(outputDir, basename)}`);
      }
    }
  }

  const publicationEntries = stagedArtifacts.flatMap(artifact => [
    { stagedPath: artifact.png, finalPath: path.join(outputDir, artifact.basename) },
    { stagedPath: artifact.receipt, finalPath: path.join(outputDir, artifact.receiptBasename) },
  ]);
  publishArtifacts(publicationEntries, { allowOverwrite: false });
  launchPostJobUpdate();
  const result = {
    pass: true,
    job_id: job.job_id,
    outputs: stagedArtifacts.map(artifact => artifact.basename),
  };
  console.log(json ? JSON.stringify(result) : `Published ${stagedArtifacts.length} Visual Job artifact(s) to ${outputDir}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
