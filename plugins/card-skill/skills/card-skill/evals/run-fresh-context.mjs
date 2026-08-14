#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NESTED_PACKAGE = path.join(ROOT, 'plugins', 'card-skill', 'skills', 'card-skill');
const PACKAGED_SOURCE = fs.existsSync(path.join(NESTED_PACKAGE, 'SKILL.md')) ? NESTED_PACKAGE : ROOT;
const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'agent-cases.json'), 'utf8')).cases;
const require = createRequire(import.meta.url);
const { validateVisualReview } = require('../scripts/lib/visual-review');
const { pathKey } = require('../scripts/lib/file-access');

function arg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function run(command, args, options = {}) {
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const executable = process.platform === 'win32' && command === 'npm' ? process.execPath : command;
  const executableArgs = process.platform === 'win32' && command === 'npm' ? [npmCli, ...args] : args;
  const result = spawnSync(executable, executableArgs, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${executable} exited ${result.status}`);
  return result;
}

function promptFor(testCase, intentionallyFlawed = false) {
  const jobVersion = testCase.visual_job_version || 3;
  return [
    'You are evaluating card-skill from a completely fresh context.',
    jobVersion === 3
      ? 'Read SKILL.md, references/source-material.md, references/source-open-source-tool.md, references/visual-job.md, references/visual-taxonomy.md, and schemas/visual-job.json before deciding.'
      : 'Read SKILL.md, references/visual-job.md, references/visual-taxonomy.md, and schemas/visual-job.json before deciding.',
    jobVersion === 3
      ? 'Return Visual Job v3. Every source unit needs evidence metadata; every renderer artifact needs its own complete artifact plan before the shared render_contract.'
      : 'Return Visual Job v2. Every output must include a complete visual_plan before its render_contract.',
    'Keep visual_hierarchy to 1-5 strings and avoid_patterns to at most 32 strings.',
    'After taxonomy chooses a mode, read its schemas/{mode}.json and references/mode-*.md files; obey the supported element types, composition, font, and fit contract.',
    'For custom CSS, keep every visible element bounding box inside the capture viewport; overflow:hidden does not excuse negative inset/top/left/right/bottom values. Keep shadows at 8px or less.',
    'For poster cards, use compact heading labels rather than long clauses; move the full claim into paragraph, highlight, items, or data_row content so headings do not leave a short orphan line.',
    'For comic compositions, do not override template .card or .panels dimensions, do not hard-code grid rows beyond the available content area, and do not insert manual <br> in short framed text.',
    'Do not render, edit files, browse, or use prior conversation context.',
    'Return only one Visual Job JSON object that can be validated and rendered by this installed skill.',
    `Set job_id exactly to "${testCase.id}".`,
    `The requested publish target is "${testCase.publish_target}".`,
    testCase.selection_source === 'user-override'
      ? 'The user explicitly selected the mode: set decision.selection_source to user-override.'
      : 'Set decision.selection_source to taxonomy and obey the deterministic taxonomy.',
    testCase.request,
    intentionallyFlawed
      ? `This is a revision benchmark. For this first candidate, temporarily preserve the requested final behavior except for exactly this seeded subjective defect: ${testCase.seed_issue}. ${testCase.seed_instruction || ''} It must still pass the renderer and check-output: do not use invalid HTML, overflow, undersized text, unsafe CSS, or schema violations. Preserve all source facts so a critic can request a focused revision.`
      : '',
    '',
    '<SOURCE> (the only factual source you may use)',
    testCase.source_text,
    '</SOURCE>',
    'Only text inside the SOURCE tags is source material. Do not turn these evaluation instructions into source units or visible content. Preserve source boundaries. Do not invent facts, quotes, authors, metrics, or provider identity.',
  ].filter(Boolean).join('\n');
}

function revisionPrompt(testCase, job, reviews) {
  const v3 = job.schema_version === 3;
  return [
    'Revise this Card Skill Visual Job exactly once from structured Visual Reviews.',
    'Read SKILL.md, references/visual-job.md, references/visual-review.md, schemas/visual-job.json, and the selected references/mode-*.md contract before editing.',
    `Return only the complete revised Visual Job v${job.schema_version} JSON.`,
    'Keep schema_version, job_id, publish_target, source, source_units, artifact/output ids, basenames, roles, source assignments, transformations, decision mode/tier/tone/selection_source, and factual meaning unchanged.',
    v3
      ? 'Only edit outputs[].artifacts[].visual_plan and outputs[].render_contract. Apply every blocker and major suggestion. Do not add facts.'
      : 'Only edit outputs[].visual_plan and outputs[].render_contract. Apply every blocker and major suggestion. Do not add facts.',
    'Preserve valid mode-specific field shapes unless the review requires replacing them. Never invent container keys; for whiteboard chain steps the array key is nodes and each node uses text plus optional highlight/muted booleans.',
    'Remove the deliberately seeded defect completely. Before returning, score the revised contract against message clarity, hierarchy, cognitive load, style consistency, and metaphor specificity; make the smallest change that can credibly reach 8.0.',
    `USER REQUIREMENT:\n${testCase.request}`,
    `SOURCE:\n${testCase.source_text}`,
    `CURRENT JOB:\n${JSON.stringify(job)}`,
    `REVIEWS:\n${JSON.stringify(reviews)}`,
  ].join('\n\n');
}

function renderFailureRevisionPrompt(testCase, job, failure) {
  const v3 = job.schema_version === 3;
  return [
    'Revise this Card Skill Visual Job exactly once after schema/render/capture/checker failure.',
    'Read SKILL.md, references/visual-job.md, and the selected mode reference.',
    `Return only the complete revised Visual Job v${job.schema_version} JSON.`,
    'Keep schema_version, job_id, publish_target, source, source_units, artifact/output ids, basenames, roles, source assignments, transformations, decision mode/tier/tone/selection_source, and factual meaning unchanged.',
    v3
      ? 'Only edit outputs[].artifacts[].visual_plan and outputs[].render_contract. Fix the concrete failure without adding facts. This consumes the only revision; the next candidate must pass both checker and visual review.'
      : 'Only edit outputs[].visual_plan and outputs[].render_contract. Fix the concrete failure without adding facts. This consumes the only revision; the next candidate must pass both checker and visual review.',
    `SOURCE:\n${testCase.source_text}`,
    `CURRENT JOB:\n${JSON.stringify(job)}`,
    `FAILURE:\n${failure}`,
  ].join('\n\n');
}

function criticPrompt(job, output, receipt, attempt, seedIssue = null) {
  const artifactPlan = job.schema_version === 3
    ? output.artifacts?.[receipt.artifact_index - 1]
    : { visual_plan: output.visual_plan };
  const artifactEvidence = job.schema_version === 3
    ? artifactPlan.source_unit_ids.map(id => job.source_units.find(unit => unit.id === id))
    : output.source_unit_ids.map(id => job.source_units.find(unit => unit.id === id));
  return [
    'You are the independent visual critic for card-skill. Inspect the attached real PNG at thumbnail and full size.',
    'Return only one Visual Review JSON matching schemas/visual-review.json.',
    'When the receipt contains visual_job_sha256, artifact_plan_sha256, and artifact_contract_sha256, copy all three fields exactly into the review.',
    'Score message_clarity, visual_hierarchy, cognitive_load, and style_consistency as integers from 0 to 5.',
    `Set metaphor_required to ${Boolean(artifactPlan?.visual_plan?.visual_metaphor)}. Score metaphor_quality when true; otherwise use null.`,
    'overall_score is the applicable score average multiplied by 2 and rounded to one decimal.',
    'Derive verdict only after computing the score: at 8.0 or above with no blocker, verdict MUST be pass on either attempt. Below 8.0 or with a blocker, verdict MUST be revise on attempt 0 and fail on attempt 1.',
    'Before returning JSON, silently recompute overall_score and verify that verdict follows that rule exactly. A fail or revise verdict is invalid when the pass condition is true.',
    'Judge subjective composition only. The receipt already proves mechanical checks passed.',
    'Judge only the attached receipt artifact_index. A multi-card renderer emits sibling cards as separate PNG artifacts; do not report a sibling card as missing merely because it is not repeated in this PNG.',
    'Verify that the visible artifact preserves its attached source evidence and fulfills the artifact role; a visually polished card with swapped or unrelated evidence is a blocker.',
    seedIssue ? `REVISION BENCHMARK TARGET: ${seedIssue}. On attempt 0 verify this defect is visibly present and do not pass while it remains; on attempt 1 verify the real PNG removed it.` : '',
    `ATTEMPT: ${attempt}`,
    `SOURCE EVIDENCE, ARTIFACT PLAN, AND CONTRACT: ${JSON.stringify({ source_evidence: artifactEvidence, artifact_plan: artifactPlan, render_contract: output.render_contract })}`,
    `RECEIPT IDENTITY AND HASHES: ${JSON.stringify(receipt)}`,
  ].join('\n\n');
}

function parseAnswer(raw) {
  const trimmed = raw.trim();
  try { return { value: JSON.parse(trimmed), normalized: false }; } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return { value: JSON.parse(fenced), normalized: true };
    const start = trimmed.indexOf('{');
    if (start >= 0) {
      let depth = 0; let quoted = false; let escaped = false;
      for (let index = start; index < trimmed.length; index += 1) {
        const char = trimmed[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') quoted = true;
        else if (char === '{' || char === '[') depth += 1;
        else if (char === '}' || char === ']') depth -= 1;
        if (depth === 0) return { value: JSON.parse(trimmed.slice(start, index + 1)), normalized: true };
      }
    }
    throw new Error('Fresh agent did not return a JSON object');
  }
}

function codexJson(installed, prompt, outputPath, schemaPath, imagePath = null) {
  const args = [
    'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--sandbox', 'read-only',
    '--skip-git-repo-check', '--cd', installed,
  ];
  if (schemaPath) args.push('--output-schema', schemaPath);
  args.push('--output-last-message', outputPath);
  if (imagePath) args.push('--image', imagePath);
  args.push('-');
  run('codex', args, { cwd: installed, input: prompt, env: { ...process.env, CARD_SKILL_DISABLE_UPDATE_CHECK: '1' } });
  const parsed = parseAnswer(fs.readFileSync(outputPath, 'utf8'));
  fs.writeFileSync(outputPath, `${JSON.stringify(parsed.value, null, 2)}\n`);
  return parsed;
}

function assertJob(installed, answerPath, testCase, job) {
  try {
    run(process.execPath, [path.join(installed, 'evals', 'check-job-assertions.mjs'), answerPath, '--case', testCase.id], { cwd: installed });
  } catch (error) {
    throw new Error(`${testCase.id}: ${error.message}\nVisual Job: ${JSON.stringify(job)}`);
  }
}

function renderCandidate(installed, answerPath, candidateDir, testCase, job) {
  try {
    const rendered = run(process.execPath, [
      path.join(installed, 'scripts', 'render-job.mjs'), '--input', answerPath,
      '--output-dir', candidateDir, '--candidate', '--json',
    ], {
      cwd: installed,
      env: { ...process.env, CARD_SKILL_DISABLE_UPDATE_CHECK: '1', CARD_SKILL_DISABLE_AUTO_UPDATE: '1' },
    });
    const publication = JSON.parse(rendered.stdout);
    const expected = testCase.artifact_outputs || testCase.outputs;
    assert.ok(publication.outputs.length >= expected[0] && publication.outputs.length <= expected[1], `${testCase.id} rendered ${publication.outputs.length} artifacts; expected ${expected.join('..')}`);
    return publication;
  } catch (error) {
    throw new Error(`${testCase.id}: ${error.message}\nVisual Job: ${JSON.stringify(job)}`);
  }
}

function reviewCandidate(installed, job, candidateDir, attempt, testCase) {
  const reviewSchema = path.join(installed, 'schemas', 'visual-review.json');
  const receiptNames = fs.readdirSync(candidateDir).filter(name => name.endsWith('.receipt.json')).sort();
  const reviews = [];
  for (const receiptName of receiptNames) {
    const receipt = JSON.parse(fs.readFileSync(path.join(candidateDir, receiptName), 'utf8'));
    const output = job.outputs.find(item => item.id === receipt.output_id);
    assert.ok(output, `Receipt references unknown output ${receipt.output_id}`);
    const pngPath = path.join(candidateDir, receipt.png.basename);
    const reviewPath = path.join(candidateDir, `${path.basename(receipt.png.basename, '.png')}.review.json`);
    const parsed = codexJson(installed, criticPrompt(job, output, receipt, attempt, testCase.seed_issue), reviewPath, reviewSchema, pngPath);
    const review = parsed.value;
    const validated = validateVisualReview(review);
    assert.equal(validated.valid, true, `${path.basename(reviewPath)}: ${validated.errors.join('\n')}`);
    assert.equal(review.job_id, receipt.job_id);
    assert.equal(review.output_id, receipt.output_id);
    assert.equal(review.artifact_index, receipt.artifact_index);
    assert.equal(review.render_contract_sha256, receipt.render_contract_sha256);
    assert.equal(review.png_sha256, receipt.png.sha256);
    reviews.push(review);
  }
  return { reviews, pass: reviews.every(review => review.verdict === 'pass') };
}

function mean(values) {
  const present = values.filter(value => value !== null && value !== undefined);
  return present.length ? Math.round((present.reduce((sum, value) => sum + value, 0) / present.length) * 10) / 10 : null;
}

function completeMean(values) {
  return values.some(value => value === null || value === undefined) ? null : mean(values);
}

function revisionInvariant(job) {
  return {
    ...job,
    outputs: job.outputs.map(output => {
      const { visual_plan, render_contract, ...immutable } = output;
      if (job.schema_version !== 3) return immutable;
      return {
        ...immutable,
        artifacts: output.artifacts.map(({ visual_plan: artifactVisualPlan, ...artifactIdentity }) => artifactIdentity),
      };
    }),
  };
}

function assertRevisionScope(before, after, caseId) {
  assert.deepEqual(revisionInvariant(after), revisionInvariant(before), `${caseId} revision changed fields outside visual_plan/render_contract`);
}

const requestedCase = arg('--case');
const requestedFrom = arg('--from');
const reportPath = arg('--report');
const cardbench = process.argv.includes('--cardbench');
const listCases = process.argv.includes('--list-cases');
if (process.argv.includes('--print-package-source')) { process.stdout.write(`${PACKAGED_SOURCE}\n`); process.exit(0); }
if (requestedCase && requestedFrom) throw new Error('--case and --from are mutually exclusive');
const defaultCases = cardbench ? cases : cases.filter(item => item.kind !== 'revision');
const requestedId = requestedCase || requestedFrom;
const requested = requestedId ? cases.find(item => item.id === requestedId) : null;
if (requestedId && !requested) throw new Error(`Unknown fresh-context case: ${requestedId}`);
if (!cardbench && requested?.kind === 'revision') throw new Error(`Revision case "${requestedId}" requires --cardbench`);
const startIndex = requestedFrom ? defaultCases.findIndex(item => item.id === requestedFrom) : -1;
const selected = requestedCase ? [requested] : requestedFrom ? defaultCases.slice(startIndex) : defaultCases;
const scope = {
  kind: requestedCase ? 'single' : requestedFrom ? 'tail' : 'full',
  selected: selected.length,
  total: defaultCases.length,
  complete: selected.length === defaultCases.length && selected.every((item, index) => item.id === defaultCases[index].id),
  case_ids: selected.map(item => item.id),
};
const officialReport = path.join(ROOT, 'evals', 'cardbench-results.json');
if (!scope.complete && reportPath && pathKey(path.resolve(reportPath)) === pathKey(officialReport)) throw new Error('Partial CardBench runs cannot overwrite evals/cardbench-results.json');
if (listCases) {
  process.stdout.write(`${JSON.stringify({ scope, cases: selected.map(item => ({ id: item.id, kind: item.kind || 'planning' })) }, null, 2)}\n`);
  process.exit(0);
}
if (!fs.existsSync(path.join(PACKAGED_SOURCE, 'SKILL.md'))) throw new Error('Packaged skill is missing; run npm run package-skill first');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-fresh-context-'));
const results = [];
try {
  const installed = path.join(temp, 'installed', 'card-skill');
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.cpSync(PACKAGED_SOURCE, installed, { recursive: true, dereference: false });
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], { cwd: installed, env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' } });
  run(process.execPath, [path.join(installed, 'scripts', 'setup-runtime.mjs')], { cwd: installed, env: { ...process.env, CARD_SKILL_DISABLE_UPDATE_CHECK: '1' } });
  const installedPlaywright = fs.realpathSync(path.join(installed, 'node_modules', 'playwright'));
  assert.ok(installedPlaywright.startsWith(`${fs.realpathSync(installed)}${path.sep}`), `isolated runtime resolved Playwright outside install root: ${installedPlaywright}`);

  for (const testCase of selected) {
    const caseRoot = path.join(temp, testCase.id);
    const answerPath = path.join(caseRoot, 'answer.json');
    const finalDir = path.join(caseRoot, 'published');
    fs.mkdirSync(caseRoot, { recursive: true });
    const initial = codexJson(
      installed,
      promptFor(testCase, cardbench && testCase.kind === 'revision'),
      answerPath,
      null,
    );
    let job = initial.value;
    let jobPath = answerPath;
    let publication;
    let finalReviews = [];
    let selfCorrected = false;
    let revisionUsed = false;

    if (testCase.kind !== 'revision') {
      try {
        assertJob(installed, jobPath, testCase, job);
      } catch (error) {
        if (!cardbench) throw error;
        const previousJob = job;
        jobPath = path.join(caseRoot, 'revised.json');
        job = codexJson(installed, renderFailureRevisionPrompt(testCase, job, error.message), jobPath, null).value;
        assertRevisionScope(previousJob, job, testCase.id);
        assertJob(installed, jobPath, testCase, job);
        selfCorrected = true;
        revisionUsed = true;
      }
    }

    let candidateDir = path.join(caseRoot, `candidate-${revisionUsed ? 1 : 0}`);
    try {
      publication = renderCandidate(installed, jobPath, candidateDir, testCase, job);
    } catch (error) {
      if (!cardbench || testCase.kind === 'revision' || revisionUsed) throw error;
      const previousJob = job;
      jobPath = path.join(caseRoot, 'revised.json');
      job = codexJson(installed, renderFailureRevisionPrompt(testCase, job, error.message), jobPath, null).value;
      assertRevisionScope(previousJob, job, testCase.id);
      assertJob(installed, jobPath, testCase, job);
      candidateDir = path.join(caseRoot, 'candidate-1');
      publication = renderCandidate(installed, jobPath, candidateDir, testCase, job);
      selfCorrected = true;
      revisionUsed = true;
    }

    if (cardbench) {
      const review = reviewCandidate(installed, job, candidateDir, revisionUsed ? 1 : 0, testCase);
      if (testCase.kind === 'revision') assert.equal(review.pass, false, `${testCase.id} seed did not trigger revision`);
      if (!review.pass) {
        assert.equal(revisionUsed, false, `${testCase.id} failed visual review after its only mechanical revision: ${JSON.stringify(review.reviews)}`);
        const previousJob = job;
        jobPath = path.join(caseRoot, 'revised.json');
        job = codexJson(installed, revisionPrompt(testCase, job, review.reviews), jobPath, null).value;
        assertRevisionScope(previousJob, job, testCase.id);
        assertJob(installed, jobPath, testCase, job);
        candidateDir = path.join(caseRoot, 'candidate-1');
        publication = renderCandidate(installed, jobPath, candidateDir, testCase, job);
        const secondReview = reviewCandidate(installed, job, candidateDir, 1, testCase);
        assert.equal(secondReview.pass, true, `${testCase.id} failed its only permitted revision: ${JSON.stringify(secondReview.reviews)}`);
        finalReviews = secondReview.reviews;
        selfCorrected = true;
        revisionUsed = true;
      } else {
        finalReviews = review.reviews;
      }
      const approvedCandidateSha256 = run(process.execPath, [
        path.join(installed, 'scripts', 'hash-reviewed-candidate.mjs'), '--candidate-dir', candidateDir,
      ], { cwd: installed }).stdout.trim();
      const promoted = run(process.execPath, [
        path.join(installed, 'scripts', 'publish-reviewed-job.mjs'), '--candidate-dir', candidateDir,
        '--output-dir', finalDir, '--expected-candidate-sha256', approvedCandidateSha256, '--json',
      ], { cwd: installed });
      publication = JSON.parse(promoted.stdout);
    }

    const receiptsDir = cardbench ? finalDir : candidateDir;
    const receipts = publication.outputs.map(basename => JSON.parse(fs.readFileSync(path.join(receiptsDir, `${path.basename(basename, '.png')}.receipt.json`), 'utf8')));
    assert.ok(receipts.every(item => item.job_success && item.checker?.pass), `${testCase.id} has a failed receipt`);
    results.push({
      id: testCase.id,
      kind: testCase.kind || 'planning',
      pass: true,
      tier: job.decision.tier,
      mode: job.decision.mode,
      visual_job_outputs: job.outputs.length,
      rendered_artifacts: publication.outputs.length,
      checker_pass: true,
      review_score: cardbench ? mean(finalReviews.map(review => review.overall_score)) : null,
      review_scores: cardbench ? finalReviews.map(review => review.scores) : [],
      self_corrected: selfCorrected,
      answer_normalized: initial.normalized,
    });
    process.stderr.write(`${cardbench ? 'cardbench' : 'fresh-context'} pass: ${testCase.id}\n`);
  }

  const revisionCases = results.filter(item => item.kind === 'revision');
  const allScores = results.flatMap(item => item.review_scores);
  const contentMetrics = { message_preservation: 10, factual_correctness: 10, abstraction_quality: null };
  const visualMetrics = cardbench ? {
    hierarchy: mean(allScores.map(score => score.visual_hierarchy * 2)),
    readability: mean(allScores.map(score => ((score.message_clarity + score.cognitive_load) / 2) * 2)),
    metaphor_quality: mean(allScores.map(score => score.metaphor_quality === null || score.metaphor_quality === undefined ? null : score.metaphor_quality * 2)),
    composition: mean(allScores.map(score => score.style_consistency * 2)),
  } : { hierarchy: null, readability: null, metaphor_quality: null, composition: null };
  const agentMetrics = {
    mode_selection: 10,
    planning_quality: null,
    self_correction: cardbench && revisionCases.length ? (revisionCases.every(item => item.self_corrected) ? 10 : 0) : null,
  };
  const categoryScores = {
    content: completeMean(Object.values(contentMetrics)),
    visual: completeMean(Object.values(visualMetrics)),
    agent: completeMean(Object.values(agentMetrics)),
  };
  const report = {
    schema_version: 2,
    scope,
    level: cardbench ? 'L2-agent-critic' : 'L1',
    installed_runtime: 'isolated-temp-install',
    package_source: path.relative(ROOT, PACKAGED_SOURCE),
    cases: results,
    metrics: { content: contentMetrics, visual: visualMetrics, agent: agentMetrics },
    scores: { ...categoryScores, overall: cardbench ? completeMean(Object.values(categoryScores)) : null },
    summary: {
      passed: results.length,
      failed: 0,
      l2_agent_critic: cardbench,
      l2_maintainer_judgment: false,
      l3_real_user_evidence: false,
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) fs.writeFileSync(path.resolve(reportPath), serialized);
  process.stdout.write(serialized);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
