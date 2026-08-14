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
  artifactContractProjection,
  artifactPlansForOutput,
  materializeRenderContract,
  sha256Bytes,
  sha256Json,
  validateVisualJob,
} = require('./lib/visual-job');
const { pathEntryExists, publishArtifacts } = require('./lib/publish-artifacts');
const { MAX_POSTER_MEDIA_TOTAL_BYTES, isWithin, pathKey, realpathExisting } = require('./lib/file-access');
const MAX_CANDIDATE_BYTES = 256 * 1024 * 1024;

function usage() {
  console.log('Usage: node scripts/render-job.mjs --input <visual-job.json> --output-dir <directory> [--candidate] [--json]');
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

function receipt(job, output, artifactPlan, contract, artifact, index, binding) {
  const png = fs.readFileSync(artifact.path);
  const effectiveContract = artifact.effective_contract || contract;
  const effectiveDiffers = sha256Json(effectiveContract) !== binding.requestedContractSha256;
  return {
    schema_version: 1,
    visual_job_version: job.schema_version,
    job_id: job.job_id,
    output_id: output.id,
    artifact_index: index,
    ...([2, 3].includes(job.schema_version) ? {
      artifact_id: artifactPlan.id,
      artifact_role: artifactPlan.role,
      visual_job_sha256: binding.visualJobSha256,
      artifact_plan_sha256: sha256Json(artifactPlan),
      artifact_contract_sha256: sha256Json(artifactContractProjection(effectiveContract, index)),
      source_evidence_sha256: sha256Json(artifactPlan.source_unit_ids.map(id => job.source_units.find(unit => unit.id === id))),
      artifact_plan: artifactPlan,
    } : {}),
    card_skill_version: fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(),
    mode: contract.mode,
    tier: job.decision.tier,
    tone: artifact.tone,
    design: artifact.resolved_design,
    requested_render_contract_sha256: binding.requestedContractSha256,
    render_contract_sha256: sha256Json(effectiveContract),
    effective_render_contract: effectiveDiffers ? effectiveContract : null,
    media_snapshots: artifact.media_snapshots || [],
    logo_snapshot: artifact.logo_snapshot || null,
    metaphor_required: Boolean(artifactPlan.visual_plan?.visual_metaphor),
    png: {
      basename: artifact.basename,
      width: artifact.width,
      height: artifact.height,
      sha256: sha256Bytes(png),
    },
    capture: artifact.capture,
    checked_html: artifact.checkedHtmlPath ? {
      basename: artifact.checkedHtmlBasename || path.basename(artifact.checkedHtmlPath),
      sha256: sha256Bytes(fs.readFileSync(artifact.checkedHtmlPath)),
    } : null,
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
const candidate = process.argv.includes('--candidate');
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
  const resolvedInput = path.resolve(inputPath);
  if (fs.statSync(resolvedInput).size > 32 * 1024 * 1024) throw new Error('Visual Job JSON must be at most 32 MiB');
  job = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
} catch (error) {
  console.error(`input_contract: cannot read Visual Job: ${error.message}`);
  process.exit(1);
}
const validated = validateVisualJob(job);
if (!validated.valid) {
  console.error(`input_contract:\n${validated.errors.map(error => `- ${error}`).join('\n')}`);
  process.exit(1);
}
if ([2, 3].includes(job.schema_version) && !candidate) {
  console.error('input_contract: Visual Job v2/v3 must render with --candidate and pass Visual Review before publication');
  process.exit(1);
}

const outputDir = path.resolve(outputDirArg);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), `card-skill-job-${job.job_id}-`));
const visualJobSha256 = sha256Json(job);
const stagedArtifacts = [];
const targetKeys = new Set();

try {
  for (const output of job.outputs) {
    const outputStage = path.join(stage, 'outputs', output.id);
    fs.mkdirSync(outputStage, { recursive: true });
    const contract = materializeRenderContract(job, output);
    const requestedContractSha256 = sha256Json(contract);
    const artifactPlans = artifactPlansForOutput(job, output);
    const input = path.join(outputStage, 'contract.json');
    const requestedPng = path.join(outputStage, job.schema_version === 3 ? `${output.id}.png` : output.basename);
    const reportPath = path.join(outputStage, 'card-report.json');
    fs.writeFileSync(input, JSON.stringify(contract));
    const cardArgs = [
      path.join(ROOT, 'scripts', 'card.js'),
      '--input', input,
      '--output', requestedPng,
      '--report', reportPath,
    ];
    if (candidate) cardArgs.push('--checked-html-dir', outputStage);
    const run = spawnSync(process.execPath, cardArgs, {
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
    if (job.schema_version === 3 && cardReport.artifacts.length !== artifactPlans.length) {
      throw new Error(`runtime: output ${output.id} returned ${cardReport.artifacts.length} artifacts but Visual Job v3 planned ${artifactPlans.length}`);
    }

    const reportIndices = new Set();
    for (const artifact of cardReport.artifacts) {
      if (!Number.isInteger(artifact.index) || artifact.index < 1 || artifact.index > cardReport.artifacts.length || reportIndices.has(artifact.index)) {
        throw new Error(`runtime: output ${output.id} returned invalid artifact indices`);
      }
      reportIndices.add(artifact.index);
    }

    for (const artifact of cardReport.artifacts) {
      const artifactPlan = job.schema_version === 3
        ? artifactPlans.find(plan => plan.artifact_index === artifact.index)
        : (artifactPlans.find(plan => plan.artifact_index === artifact.index)
          || { ...artifactPlans[0], artifact_index: artifact.index, id: output.id });
      if (!artifactPlan) throw new Error(`runtime: output ${output.id} has no plan for renderer artifact ${artifact.index}`);
      const artifactPath = realpathExisting(artifact.path);
      const expectedRoot = realpathExisting(outputStage);
      if (!artifactPath || !expectedRoot || !isWithin(expectedRoot, artifactPath) || !pathEntryExists(artifactPath)) {
        throw new Error(`safety: renderer returned an artifact outside its staging directory`);
      }
      const basename = job.schema_version === 3 ? artifactPlan.basename : path.basename(artifactPath);
      const checkedHtmlPath = artifact.checked_html?.path ? realpathExisting(artifact.checked_html.path) : null;
      if (candidate && (!checkedHtmlPath || !expectedRoot || !isWithin(expectedRoot, checkedHtmlPath) || !pathEntryExists(checkedHtmlPath))) {
        throw new Error('safety: renderer did not preserve checked HTML inside its staging directory');
      }
      const targetKey = pathKey(path.join(outputDir, basename));
      if (targetKeys.has(targetKey)) throw new Error(`safety: duplicate publication target ${basename}`);
      targetKeys.add(targetKey);
      const artifactRecord = {
        ...artifact,
        path: artifactPath,
        basename,
        tone: cardReport.tone,
        resolved_design: cardReport.resolved_design,
        checkedHtmlPath,
        checkedHtmlBasename: checkedHtmlPath ? `${path.basename(basename, '.png')}.checked.html` : null,
      };
      const mediaSnapshots = Array.isArray(artifact.media_snapshots) ? artifact.media_snapshots : [];
      const plannedMediaCount = artifactContractProjection(contract, artifact.index).card?.body?.filter(element => element?.type === 'media').length || 0;
      if (mediaSnapshots.length !== plannedMediaCount) throw new Error(`safety: renderer media snapshot count does not match artifact ${artifact.index}`);
      if (job.schema_version === 3) {
        const evidenceDigests = new Set(artifactPlan.source_unit_ids.map(id => job.source_units.find(unit => unit.id === id)).filter(unit => unit?.evidence?.strength === 'primary' && unit?.evidence?.freshness === 'current').map(unit => unit.digest).filter(Boolean));
        if (mediaSnapshots.some(snapshot => !evidenceDigests.has(snapshot.sha256))) {
          throw new Error(`safety: renderer media snapshot does not match artifact ${artifact.index} source evidence`);
        }
      }
      const receiptData = receipt(job, output, artifactPlan, contract, artifactRecord, artifact.index, { visualJobSha256, requestedContractSha256 });
      const receiptPath = path.join(outputStage, `${path.basename(basename, '.png')}.receipt.json`);
      fs.writeFileSync(receiptPath, `${JSON.stringify(receiptData, null, 2)}\n`);
      stagedArtifacts.push({
        png: artifactPath,
        receipt: receiptPath,
        basename,
        receiptBasename: path.basename(receiptPath),
        checkedHtml: checkedHtmlPath,
        checkedHtmlBasename: artifactRecord.checkedHtmlBasename,
        outputId: output.id,
        artifactId: artifactPlan.id,
        artifactRole: artifactPlan.role,
        artifactPlanSha256: sha256Json(artifactPlan),
        artifactIndex: artifact.index,
        mediaSnapshots: receiptData.media_snapshots,
        // card.js embeds every untrusted local image from a private bounded snapshot.
        // Candidate HTML therefore needs no original caller path in the browser allow-list.
        allowedLocalFiles: [],
      });
    }
  }

  const actualMediaByDigest = new Map();
  for (const snapshot of stagedArtifacts.flatMap(artifact => artifact.mediaSnapshots || [])) {
    if (!actualMediaByDigest.has(snapshot.sha256)) actualMediaByDigest.set(snapshot.sha256, snapshot.bytes);
  }
  const actualMediaBytes = [...actualMediaByDigest.values()].reduce((sum, bytes) => sum + bytes, 0);
  if (actualMediaBytes > MAX_POSTER_MEDIA_TOTAL_BYTES) {
    throw new Error(`safety: rendered poster media exceeds the ${MAX_POSTER_MEDIA_TOTAL_BYTES} byte job-wide candidate budget`);
  }

  const existingNames = existingCaseFoldedNames(outputDir);
  for (const artifact of stagedArtifacts) {
    for (const basename of [artifact.basename, artifact.receiptBasename, artifact.checkedHtmlBasename].filter(Boolean)) {
      if (existingNames.has(basename.toLocaleLowerCase('en-US'))) {
        throw new Error(`safety: publication target already exists: ${path.join(outputDir, basename)}`);
      }
    }
  }

  const publicationEntries = stagedArtifacts.flatMap(artifact => [
    { stagedPath: artifact.png, finalPath: path.join(outputDir, artifact.basename) },
    { stagedPath: artifact.receipt, finalPath: path.join(outputDir, artifact.receiptBasename) },
    ...(artifact.checkedHtml ? [{ stagedPath: artifact.checkedHtml, finalPath: path.join(outputDir, artifact.checkedHtmlBasename) }] : []),
  ]);
  if (candidate) {
    const manifestPath = path.join(stage, 'candidate-manifest.json');
    const manifest = {
      schema_version: [2, 3].includes(job.schema_version) ? 2 : 1,
      visual_job_version: job.schema_version,
      job_id: job.job_id,
      ...([2, 3].includes(job.schema_version) ? { visual_job_sha256: visualJobSha256, visual_job: 'visual-job.json' } : {}),
      expected_output_ids: job.outputs.map(output => output.id),
      artifacts: stagedArtifacts.map(artifact => ({
        output_id: artifact.outputId,
        artifact_index: artifact.artifactIndex,
        png: artifact.basename,
        receipt: artifact.receiptBasename,
        checked_html: artifact.checkedHtmlBasename,
        allowed_local_files: artifact.allowedLocalFiles,
        receipt_sha256: sha256Bytes(fs.readFileSync(artifact.receipt)),
        ...([2, 3].includes(job.schema_version) ? {
          artifact_id: artifact.artifactId,
          artifact_role: artifact.artifactRole,
          artifact_plan_sha256: artifact.artifactPlanSha256,
        } : {}),
      })),
    };
    if ([2, 3].includes(job.schema_version)) {
      const visualJobPath = path.join(stage, 'visual-job.json');
      // Keep the persisted snapshot byte-for-byte within the same compact
      // 4 MiB representation validated by validateVisualJob.
      fs.writeFileSync(visualJobPath, JSON.stringify(job));
      publicationEntries.push({ stagedPath: visualJobPath, finalPath: path.join(outputDir, 'visual-job.json') });
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    publicationEntries.push({ stagedPath: manifestPath, finalPath: path.join(outputDir, 'candidate-manifest.json') });
  }
  if (candidate) {
    const candidateBytes = publicationEntries.reduce((sum, entry) => sum + fs.statSync(entry.stagedPath).size, 0);
    if (candidateBytes > MAX_CANDIDATE_BYTES) throw new Error('safety: rendered candidate exceeds the 256 MiB closed-set budget');
  }
  publishArtifacts(publicationEntries, { allowOverwrite: false });
  if (!candidate) launchPostJobUpdate();
  const result = {
    pass: true,
    candidate,
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
