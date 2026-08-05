#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { validate } = require('./lib/schema');
const {
  sha256Bytes,
  sha256Json,
  validateVisualJob,
} = require('./lib/visual-job');
const { modeTier, selectMode } = require('./lib/mode-selector');
const { computedOverall, validateVisualReview } = require('./lib/visual-review');
const { publishArtifacts } = require('./lib/publish-artifacts');

function baseJob(overrides = {}) {
  return {
    schema_version: 1,
    job_id: 'visual-job-self-test',
    publish_target: 'social-series',
    source: { kind: 'pasted-text', language: 'en' },
    source_units: [
      { id: 'claim', excerpt: 'One claim.' },
      { id: 'formula', excerpt: 'A + B = C.' },
    ],
    decision: {
      mode: 'mixed',
      tier: 'stable',
      tone: 'sharp',
      reason: 'The source contains two distinct visual units.',
    },
    outputs: [
      {
        id: 'claim-card',
        basename: 'claim.png',
        source_unit_ids: ['claim'],
        transformation: 'preserve',
        render_contract: { mode: 'big', tone: 'sharp', phrase: 'One claim' },
      },
      {
        id: 'formula-card',
        basename: 'formula.png',
        source_unit_ids: ['formula'],
        transformation: 'visualize',
        render_contract: {
          mode: 'article-diagram',
          family: 'concept-map',
          tone: 'sharp',
          title: 'A compact formula',
          nodes: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'c', label: 'C' },
          ],
          links: [
            { from: 'a', to: 'c', label: 'contributes' },
            { from: 'b', to: 'c', label: 'contributes' },
          ],
        },
      },
    ],
    ...overrides,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const valid = validateVisualJob(baseJob());
assert.equal(valid.valid, true, valid.errors.join('\n'));

function visualPlan(overrides = {}) {
  return {
    core_message: 'One claim should dominate the card.',
    content_type: 'idea',
    argument_structure: 'single-claim',
    visual_metaphor: null,
    layout_strategy: 'one typographic focal point',
    visual_hierarchy: ['claim'],
    avoid_patterns: ['generic AI brain'],
    ...overrides,
  };
}

function v2Job(overrides = {}) {
  const job = {
    schema_version: 2,
    job_id: 'visual-job-v2-test',
    publish_target: 'social-single',
    source: { kind: 'pasted-text', language: 'en' },
    source_units: [{ id: 'claim', excerpt: 'One claim.' }],
    decision: {
      mode: 'big',
      tier: 'stable',
      tone: 'sharp',
      selection_source: 'taxonomy',
      reason: 'A single claim maps to the typographic card.',
    },
    outputs: [{
      id: 'claim-card',
      basename: 'claim.png',
      source_unit_ids: ['claim'],
      transformation: 'preserve',
      visual_plan: visualPlan(),
      render_contract: { mode: 'big', tone: 'sharp', phrase: 'One claim' },
    }],
  };
  return { ...job, ...overrides };
}

assert.equal(validateVisualJob(v2Job()).valid, true, validateVisualJob(v2Job()).errors.join('\n'));
const missingPlan = v2Job();
delete missingPlan.outputs[0].visual_plan;
assert.match(validateVisualJob(missingPlan).errors.join('\n'), /visual_plan/);
const wrongTaxonomy = v2Job();
wrongTaxonomy.decision.mode = 'long';
wrongTaxonomy.outputs[0].render_contract = { mode: 'long', title: 'Wrong route', body: [{ type: 'paragraph', text: 'One claim.' }] };
assert.match(validateVisualJob(wrongTaxonomy).errors.join('\n'), /taxonomy mode "big"/);
wrongTaxonomy.decision.selection_source = 'user-override';
assert.equal(validateVisualJob(wrongTaxonomy).valid, true, validateVisualJob(wrongTaxonomy).errors.join('\n'));

const selectorCases = [
  ['wechat-cover', visualPlan(), 'editorial-image'],
  ['blog-hero', visualPlan(), 'editorial-image'],
  ['social-series', visualPlan(), 'poster'],
  ['reading-notes', visualPlan(), 'poster'],
  ['long-read', visualPlan(), 'long'],
  ['whiteboard', visualPlan(), 'whiteboard'],
  ['social-single', visualPlan(), 'big'],
  ['social-single', visualPlan({ content_type: 'mechanism', argument_structure: 'cause-effect' }), 'article-diagram'],
  ['social-single', visualPlan({ content_type: 'argument', argument_structure: 'cause-effect' }), 'article-diagram'],
  ['social-single', visualPlan({ content_type: 'comparison', argument_structure: 'compare-contrast' }), 'infograph'],
  ['social-single', visualPlan({ content_type: 'story', argument_structure: 'conflict-turn' }), 'comic'],
  ['social-single', visualPlan({ content_type: 'story', argument_structure: 'reflective-arc' }), 'sketchnote'],
  ['social-single', visualPlan({ content_type: 'argument', argument_structure: 'conflict-turn' }), 'comic'],
  ['social-single', visualPlan({ content_type: 'idea', argument_structure: 'reflective-arc' }), 'sketchnote'],
  ['article-body', visualPlan({ visual_metaphor: 'a drawer with a visible handle' }), 'editorial-image'],
  ['article-body', visualPlan({ content_type: 'argument', argument_structure: 'linear-argument' }), 'article-diagram'],
];
for (const [target, plan, expected] of selectorCases) assert.equal(selectMode(target, plan), expected, `${target}/${plan.content_type}/${plan.argument_structure}`);
assert.equal(modeTier('infograph'), 'studio');
assert.equal(modeTier('editorial-image', { composition_required: true }), 'studio');
assert.equal(modeTier('editorial-image', { use: 'cover' }), 'stable');

const articleMetaphor = v2Job({
  publish_target: 'article-body',
  decision: { ...v2Job().decision, mode: 'editorial-image', tier: 'stable' },
  outputs: [{ ...v2Job().outputs[0], visual_plan: visualPlan({ visual_metaphor: 'a visible hinge' }), render_contract: { mode: 'editorial-image', title: 'A visible hinge', use: 'cover' } }],
});
assert.match(validateVisualJob(articleMetaphor).errors.join('\n'), /complete Studio composition/);

assert.doesNotThrow(() => validateVisualJob({ ...v2Job(), source_units: {} }));
assert.match(validateVisualJob({ ...v2Job(), source_units: {} }).errors.join('\n'), /source_units/);
assert.doesNotThrow(() => validateVisualJob({ ...v2Job(), outputs: {} }));
assert.match(validateVisualJob({ ...v2Job(), outputs: {} }).errors.join('\n'), /outputs/);

function validReview(overrides = {}) {
  return {
    schema_version: 1,
    job_id: 'visual-job-v2-test',
    output_id: 'claim-card',
    artifact_index: 1,
    attempt: 0,
    render_contract_sha256: 'a'.repeat(64),
    png_sha256: 'b'.repeat(64),
    checker_pass: true,
    metaphor_required: false,
    scores: { message_clarity: 4, visual_hierarchy: 4, cognitive_load: 4, style_consistency: 4, metaphor_quality: null },
    overall_score: 8,
    issues: [],
    verdict: 'pass',
    ...overrides,
  };
}

assert.equal(computedOverall(validReview().scores), 8);
assert.equal(validateVisualReview(validReview()).valid, true, validateVisualReview(validReview()).errors.join('\n'));
assert.match(validateVisualReview(validReview({ overall_score: 8.1 })).errors.join('\n'), /normalized score/);
assert.match(validateVisualReview(validReview({ png_sha256: 'bad' })).errors.join('\n'), /SHA-256/);
assert.match(validateVisualReview(validReview({ issues: [{ type: 'collision', severity: 'blocker', suggestion: 'Separate the labels.' }] })).errors.join('\n'), /verdict/);
assert.match(validateVisualReview(validReview({ issues: [{ type: 'collision', severity: 'blocker', suggestion: '' }], verdict: 'revise', overall_score: 8 })).errors.join('\n'), /suggestion/);
assert.match(validateVisualReview(validReview({ attempt: 1, scores: { message_clarity: 3, visual_hierarchy: 3, cognitive_load: 3, style_consistency: 3 }, overall_score: 6, verdict: 'revise' })).errors.join('\n'), /attempt 0/);
assert.match(validateVisualReview(validReview({ attempt: 0, scores: { message_clarity: 3, visual_hierarchy: 3, cognitive_load: 3, style_consistency: 3 }, overall_score: 6, verdict: 'fail' })).errors.join('\n'), /attempt 1/);
assert.match(validateVisualReview(validReview({ metaphor_required: true })).errors.join('\n'), /must be scored/);
assert.match(validateVisualReview(validReview({ scores: { ...validReview().scores, metaphor_quality: 4 } })).errors.join('\n'), /must be null/);

const duplicate = clone(baseJob());
duplicate.outputs[1].basename = 'CLAIM.PNG';
assert.equal(validateVisualJob(duplicate).valid, false, 'case-folded output duplicates must fail');

const unknownNested = clone(baseJob());
unknownNested.decision.provider = 'hidden';
assert.match(validateVisualJob(unknownNested).errors.join('\n'), /Unknown decision field|sensitive/i);

const studio = {
  mode: 'infograph',
  title: 'Evidence chain',
  composition_required: true,
  content_html: '<main><h2>Input</h2><p>Render</p></main>',
  custom_css: 'main { display: grid; }',
  tone: 'technical',
};
assert.equal(validate(studio).valid, true, validate(studio).errors.join('\n'));
assert.equal(validate({ ...studio, content_html: '<img src="file:///etc/passwd">' }).valid, true,
  'The schema may accept ordinary image markup; the browser file policy is the final local-resource boundary');
assert.equal(validate({ ...studio, custom_css: 'main { background:url(file:///etc/passwd) }' }).valid, false);
assert.equal(validate({ ...studio, custom_css: 'main{} </style><script>alert(1)</script><style>' }).valid, false);
assert.equal(validate({
  mode: 'editorial-image', title: 'Unsafe', use: 'metaphor', composition_required: true,
  content_html: '<main><script>alert(1)</script></main>', custom_css: 'main{}',
}).valid, false);
assert.equal(validate({ ...studio, composition_required: false }).valid, false);
assert.match(validate({
  mode: 'whiteboard', title: 'Broken chain', steps: [{ type: 'chain', nodes: [{ label: 'invisible' }] }],
}).errors.join('\n'), /requires non-empty "text"/);
assert.equal(validate({
  mode: 'whiteboard', title: 'Visible chain', steps: [{ type: 'chain', nodes: [{ text: '事实', highlight: true }, { text: '约束', muted: true }] }],
}).valid, true);

const bytes = Buffer.from([0, 1, 2, 3, 255]);
assert.equal(sha256Bytes(bytes), crypto.createHash('sha256').update(bytes).digest('hex'));
assert.equal(sha256Json({ b: 2, a: 1 }), sha256Json({ a: 1, b: 2 }), 'contract hash must use canonical key order');

const visualJobSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'visual-job.json'), 'utf8'));
const publicDecisionModes = new Set(visualJobSchema.properties.decision.properties.mode.enum);
for (const mode of ['big', 'long', 'whiteboard', 'poster', 'editorial-image', 'article-diagram', 'infograph', 'comic', 'sketchnote', 'mixed']) {
  assert.ok(publicDecisionModes.has(mode), `public Visual Job schema is missing decision mode ${mode}`);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-visual-job-self-test-'));
try {
  const firstSource = path.join(temp, 'first.stage');
  const secondSource = path.join(temp, 'second.stage');
  const firstFinal = path.join(temp, 'first.png');
  const secondFinal = path.join(temp, 'second.png');
  fs.writeFileSync(firstSource, 'new-first');
  fs.writeFileSync(secondSource, 'new-second');
  fs.writeFileSync(firstFinal, 'old-first');
  fs.writeFileSync(secondFinal, 'old-second');
  let renameCount = 0;
  assert.throws(
    () => publishArtifacts([
      { stagedPath: firstSource, finalPath: firstFinal },
      { stagedPath: secondSource, finalPath: secondFinal },
    ], {
      allowOverwrite: true,
      rename(from, to) {
        renameCount += 1;
        if (renameCount === 4) throw new Error('injected rename failure');
        fs.renameSync(from, to);
      },
    }),
    /injected rename failure/,
  );
  assert.equal(fs.readFileSync(firstFinal, 'utf8'), 'old-first', 'failed publication must restore overwritten files');
  assert.equal(fs.readFileSync(secondFinal, 'utf8'), 'old-second', 'failed publication must restore the artifact that failed mid-commit');
  assert.deepEqual(
    fs.readdirSync(temp).filter(name => /\.(?:tmp|bak)(?:-|$)/.test(name)),
    [],
    'failed publication must not leave transaction files',
  );

  const preparationFinal = path.join(temp, 'preparation.png');
  assert.throws(
    () => publishArtifacts([
      { stagedPath: firstSource, finalPath: preparationFinal },
      { stagedPath: path.join(temp, 'missing.stage'), finalPath: path.join(temp, 'missing.png') },
    ]),
    /ENOENT/,
  );
  assert.equal(fs.existsSync(preparationFinal), false, 'preparation failure must not publish partial output');
  assert.deepEqual(
    fs.readdirSync(temp).filter(name => name.includes('preparation.png') && name.endsWith('.tmp')),
    [],
    'preparation failure must remove target-adjacent staging files',
  );

  fs.writeFileSync(firstFinal, 'old-first');
  fs.writeFileSync(secondFinal, 'old-second');
  const cleanupResult = publishArtifacts([
    { stagedPath: firstSource, finalPath: firstFinal },
    { stagedPath: secondSource, finalPath: secondFinal },
  ], {
    allowOverwrite: true,
    unlink(target) {
      if (target.endsWith('.bak')) throw new Error('injected backup cleanup failure');
      fs.unlinkSync(target);
    },
    onCleanupWarning() {},
  });
  assert.equal(fs.readFileSync(firstFinal, 'utf8'), 'new-first', 'backup cleanup failure must preserve committed output');
  assert.equal(fs.readFileSync(secondFinal, 'utf8'), 'new-second', 'backup cleanup failure must preserve every committed output');
  assert.equal(cleanupResult.cleanupWarnings.length, 2, 'backup cleanup failures must be reported without rollback');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
assert.ok(visualJobSchema.allOf[0].else, 'public Visual Job schema must prohibit v2-only fields in v1');

const reviewedTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-reviewed-publish-self-test-'));
try {
  const candidateDir = path.join(reviewedTemp, 'candidate');
  const outputDir = path.join(reviewedTemp, 'published');
  fs.mkdirSync(candidateDir, { recursive: true });
  const reviewedJob = v2Job({ job_id: 'reviewed-job', outputs: [{ ...v2Job().outputs[0], id: 'reviewed-output', basename: 'reviewed.png' }] });
  const reviewedJobPath = path.join(reviewedTemp, 'job.json');
  fs.writeFileSync(reviewedJobPath, JSON.stringify(reviewedJob));
  const rendered = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'render-job.mjs'), '--input', reviewedJobPath,
    '--output-dir', candidateDir, '--candidate', '--json',
  ], { encoding: 'utf8' });
  assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout);
  const receipt = JSON.parse(fs.readFileSync(path.join(candidateDir, 'reviewed.receipt.json'), 'utf8'));
  fs.writeFileSync(path.join(candidateDir, 'reviewed.review.json'), JSON.stringify(validReview({
    job_id: receipt.job_id,
    output_id: receipt.output_id,
    render_contract_sha256: receipt.render_contract_sha256,
    png_sha256: receipt.png.sha256,
    metaphor_required: receipt.metaphor_required,
  })));
  const published = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'publish-reviewed-job.mjs'),
    '--candidate-dir', candidateDir,
    '--output-dir', outputDir,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(published.status, 0, published.stderr || published.stdout);
  assert.deepEqual(fs.readdirSync(outputDir).sort(), ['reviewed.png', 'reviewed.receipt.json', 'reviewed.review.json']);

  const partialCandidate = path.join(reviewedTemp, 'partial-candidate');
  fs.cpSync(candidateDir, partialCandidate, { recursive: true });
  const partialManifestPath = path.join(partialCandidate, 'candidate-manifest.json');
  const partialManifest = JSON.parse(fs.readFileSync(partialManifestPath, 'utf8'));
  partialManifest.expected_output_ids.push('missing-output');
  fs.writeFileSync(partialManifestPath, JSON.stringify(partialManifest));
  const partialRejected = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'publish-reviewed-job.mjs'), '--candidate-dir', partialCandidate,
    '--output-dir', path.join(reviewedTemp, 'partial-output'), '--json',
  ], { encoding: 'utf8' });
  assert.notEqual(partialRejected.status, 0, 'reviewed publication must reject an incomplete job output set');

  const badCandidate = path.join(reviewedTemp, 'bad-candidate');
  const badOutput = path.join(reviewedTemp, 'bad-output');
  fs.cpSync(candidateDir, badCandidate, { recursive: true });
  const badReviewPath = path.join(badCandidate, 'reviewed.review.json');
  const badReview = JSON.parse(fs.readFileSync(badReviewPath, 'utf8'));
  badReview.png_sha256 = 'c'.repeat(64);
  fs.writeFileSync(badReviewPath, JSON.stringify(badReview));
  const rejected = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'publish-reviewed-job.mjs'),
    '--candidate-dir', badCandidate,
    '--output-dir', badOutput,
    '--json',
  ], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0, 'reviewed publication must reject a mismatched PNG hash');
  assert.equal(fs.existsSync(badOutput), false, 'failed reviewed publication must not create final artifacts');
} finally {
  fs.rmSync(reviewedTemp, { recursive: true, force: true });
}

const help = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'render-job.mjs'), '--help'], { encoding: 'utf8' });
assert.equal(help.status, 0, help.stderr || help.stdout);

const evalRunner = path.join(ROOT, 'evals', 'run-fresh-context.mjs');
function listEvalCases(args) {
  const result = spawnSync(process.execPath, [evalRunner, '--list-cases', ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const singleScope = listEvalCases(['--cardbench', '--case', 'conflict-comic']);
assert.equal(singleScope.scope.kind, 'single');
assert.equal(singleScope.scope.complete, false);
assert.deepEqual(singleScope.scope.case_ids, ['conflict-comic']);
assert.deepEqual(singleScope.cases.map(item => item.id), ['conflict-comic']);

const agentCases = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'agent-cases.json'), 'utf8')).cases;
const tailStart = agentCases.findIndex(item => item.id === 'revise-flat-hierarchy');
const tailScope = listEvalCases(['--cardbench', '--from', 'revise-flat-hierarchy']);
assert.equal(tailScope.scope.kind, 'tail');
assert.deepEqual(tailScope.scope.case_ids, agentCases.slice(tailStart).map(item => item.id));

const conflictingSelection = spawnSync(process.execPath, [evalRunner, '--list-cases', '--cardbench', '--case', 'conflict-comic', '--from', 'revise-flat-hierarchy'], { encoding: 'utf8' });
assert.notEqual(conflictingSelection.status, 0);
assert.match(conflictingSelection.stderr, /mutually exclusive/);

const unknownStarted = Date.now();
const unknownSelection = spawnSync(process.execPath, [evalRunner, '--cardbench', '--case', 'does-not-exist'], { encoding: 'utf8' });
assert.notEqual(unknownSelection.status, 0);
assert.match(unknownSelection.stderr, /Unknown fresh-context case/);
assert.ok(Date.now() - unknownStarted < 5000, 'unknown case did not fail before isolated installation');

const revisionWithoutCardBench = spawnSync(process.execPath, [evalRunner, '--list-cases', '--case', 'revise-flat-hierarchy'], { encoding: 'utf8' });
assert.notEqual(revisionWithoutCardBench.status, 0);
assert.match(revisionWithoutCardBench.stderr, /requires --cardbench/);

const officialCardBenchReport = path.join(ROOT, 'evals', 'cardbench-results.json');
const officialBefore = fs.existsSync(officialCardBenchReport) ? fs.readFileSync(officialCardBenchReport) : null;
const protectedReport = spawnSync(process.execPath, [evalRunner, '--cardbench', '--case', 'conflict-comic', '--report', officialCardBenchReport], { encoding: 'utf8' });
assert.notEqual(protectedReport.status, 0);
assert.match(protectedReport.stderr, /cannot overwrite/);
if (officialBefore) assert.deepEqual(fs.readFileSync(officialCardBenchReport), officialBefore, 'partial run changed the official CardBench report');

const fullScope = listEvalCases(['--cardbench']);
assert.equal(fullScope.scope.kind, 'full');
assert.equal(fullScope.scope.complete, true);
assert.equal(fullScope.scope.selected, 20);
assert.equal(fullScope.scope.total, 20);

const packagedRoot = path.join(ROOT, 'plugins', 'card-skill', 'skills', 'card-skill');
const rootEvalSource = spawnSync(process.execPath, [
  path.join(ROOT, 'evals', 'run-fresh-context.mjs'),
  '--print-package-source',
], { encoding: 'utf8' });
assert.equal(rootEvalSource.status, 0, rootEvalSource.stderr || rootEvalSource.stdout);
assert.equal(path.resolve(rootEvalSource.stdout.trim()), packagedRoot, 'source checkout fresh eval must select generated package mirror');
const packagedEvalSource = spawnSync(process.execPath, [
  path.join(packagedRoot, 'evals', 'run-fresh-context.mjs'),
  '--print-package-source',
], { encoding: 'utf8' });
assert.equal(packagedEvalSource.status, 0, packagedEvalSource.stderr || packagedEvalSource.stdout);
assert.equal(path.resolve(packagedEvalSource.stdout.trim()), packagedRoot, 'packaged fresh eval must bootstrap from its own install root');

console.log('Visual Job regression tests passed: v1 compatibility, v2 plans/taxonomy, reviews, reviewed publication, Studio gates, hashes, rollback, public modes, and CLI help.');
