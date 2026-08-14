#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { validate } = require('./lib/schema');
const { candidateDirectorySha256 } = require('./lib/candidate-snapshot');
const {
  artifactContractProjection,
  sha256Bytes,
  sha256Json,
  validateVisualJob,
} = require('./lib/visual-job');
const { modeTier, selectMode } = require('./lib/mode-selector');
const { computedOverall, validateVisualReview } = require('./lib/visual-review');
const { publishArtifacts } = require('./lib/publish-artifacts');
const {
  MAX_POSTER_MEDIA_TOTAL_BYTES,
  accountUniqueImageSnapshot,
} = require('./lib/file-access');

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

function v3Job(overrides = {}) {
  const cards = [
    { body: [{ type: 'heading', text: 'Known input' }, { type: 'paragraph', text: 'Start from repository files.' }] },
    { body: [{ type: 'heading', text: 'Exact command' }, { type: 'paragraph', text: 'npx example-tool@latest' }] },
    { body: [{ type: 'heading', text: 'Inspectable output' }, { type: 'paragraph', text: 'Review one generated artifact.' }] },
  ];
  const units = [
    ['input', 'claim', 'Repository files are the input.'],
    ['command', 'command', 'npx example-tool@latest'],
    ['output', 'output', 'One inspectable artifact is produced.'],
  ].map(([id, kind, excerpt]) => ({
    id,
    excerpt,
    evidence: { kind, strength: 'primary', freshness: 'current' },
  }));
  const artifacts = units.map((unit, index) => ({
    artifact_index: index + 1,
    id: `${unit.id}-card`,
    basename: `route-${index + 1}.png`,
    role: ['problem', 'command', 'output'][index],
    source_unit_ids: [unit.id],
    transformation: index === 1 ? 'preserve' : 'compress',
    visual_plan: visualPlan({
      core_message: unit.excerpt,
      layout_strategy: index === 1 ? 'command-led documentary card' : 'one evidence responsibility',
    }),
  }));
  const job = {
    schema_version: 3,
    job_id: 'visual-job-v3-test',
    publish_target: 'social-series',
    source: { kind: 'normalized-adapter', language: 'en' },
    source_units: units,
    decision: {
      mode: 'poster',
      tier: 'stable',
      tone: 'sharp',
      selection_source: 'taxonomy',
      reason: 'Three independent current evidence units produce three cards.',
    },
    outputs: [{
      id: 'adaptive-series',
      artifacts,
      render_contract: { mode: 'poster', tone: 'sharp', title: 'Evidence route', cards },
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

assert.equal(validateVisualJob(v3Job()).valid, true, validateVisualJob(v3Job()).errors.join('\n'));
const missingEvidence = v3Job();
delete missingEvidence.source_units[0].evidence;
assert.match(validateVisualJob(missingEvidence).errors.join('\n'), /evidence/);
const stalePrimary = v3Job();
stalePrimary.source_units[0].evidence.freshness = 'stale';
stalePrimary.source_units[0].evidence.reason = 'Historical screenshot.';
assert.match(validateVisualJob(stalePrimary).errors.join('\n'), /current primary evidence/);
const unknownWithoutReason = v3Job();
unknownWithoutReason.source_units[0].evidence.freshness = 'unknown';
assert.match(validateVisualJob(unknownWithoutReason).errors.join('\n'), /reason is required/);
const wrongArtifactCount = v3Job();
wrongArtifactCount.outputs[0].artifacts.pop();
assert.match(validateVisualJob(wrongArtifactCount).errors.join('\n'), /exactly 3 entries/);
const wrongArtifactIndex = v3Job();
wrongArtifactIndex.outputs[0].artifacts[1].artifact_index = 9;
assert.match(validateVisualJob(wrongArtifactIndex).errors.join('\n'), /must equal 2/);
const oversizedArtifactBasename = v3Job();
oversizedArtifactBasename.outputs[0].artifacts[0].basename = `${'a'.repeat(200)}.png`;
assert.match(validateVisualJob(oversizedArtifactBasename).errors.join('\n'), /at most 200 characters/);
for (const legacyJob of [baseJob(), v2Job()]) {
  legacyJob.outputs[0].basename = `${'a'.repeat(200)}.png`;
  assert.match(validateVisualJob(legacyJob).errors.join('\n'), /at most 200 characters/, 'Visual Job v1/v2 accepted a basename that fails only after rendering');
}
const v2EvidenceLeak = v2Job();
v2EvidenceLeak.source_units[0].evidence = { kind: 'claim', strength: 'primary', freshness: 'current' };
assert.match(validateVisualJob(v2EvidenceLeak).errors.join('\n'), /only supported by Visual Job v3/);
const v2PosterMedia = v2Job({
  decision: { ...v2Job().decision, mode: 'poster' },
  outputs: [{
    ...v2Job().outputs[0],
    render_contract: {
      mode: 'poster',
      title: 'Legacy media',
      cards: [{ body: [{ type: 'media', path: path.join(ROOT, 'assets', 'gallery', 'article-formula.png'), alt: 'Evidence' }] }],
    },
  }],
});
assert.match(validateVisualJob(v2PosterMedia).errors.join('\n'), /poster media requires Visual Job v3 evidence binding/);
const unsafeV3PosterMedia = v3Job();
unsafeV3PosterMedia.source_units[0].digest = '5'.repeat(64);
unsafeV3PosterMedia.outputs[0].render_contract.cards[0].body = [{ type: 'media', path: '//server/share/evidence.png', alt: 'Unsafe network evidence' }];
assert.doesNotThrow(() => validateVisualJob(unsafeV3PosterMedia), 'Visual Job media budget touched a network/device path before schema rejection');
assert.match(validateVisualJob(unsafeV3PosterMedia).errors.join('\n'), /not a network share or device path/);
const oversizedLegacyArtifactBatch = baseJob({
  outputs: Array.from({ length: 2 }, (_, outputIndex) => ({
    id: `series-${outputIndex + 1}`,
    basename: `series-${outputIndex + 1}.png`,
    source_unit_ids: ['claim'],
    transformation: 'compress',
    render_contract: {
      mode: 'poster', title: `Series ${outputIndex + 1}`,
      cards: Array.from({ length: 11 }, (_, cardIndex) => ({ body: [{ type: 'paragraph', text: `Card ${cardIndex + 1}` }] })),
    },
  })),
});
assert.match(validateVisualJob(oversizedLegacyArtifactBatch).errors.join('\n'), /at most 20 rendered artifacts/, 'Visual Job accepted a legacy batch that amplifies reviewed browser launches');
const emptyEvidencePayload = v3Job();
delete emptyEvidencePayload.source_units[0].excerpt;
assert.match(validateVisualJob(emptyEvidencePayload).errors.join('\n'), /non-empty excerpt or SHA-256 digest/);
const digestOnlyCommand = v3Job();
delete digestOnlyCommand.source_units[1].excerpt;
digestOnlyCommand.source_units[1].digest = '1'.repeat(64);
assert.match(validateVisualJob(digestOnlyCommand).errors.join('\n'), /excerpt is required for exact command evidence/);
const oversizedVisualJob = v2Job({ padding: 'x'.repeat(4 * 1024 * 1024) });
assert.match(validateVisualJob(oversizedVisualJob).errors.join('\n'), /serialize to at most 4 MiB/, 'Visual Job accepted a payload larger than the reviewed candidate JSON budget');
const oversizedRenderContract = v2Job();
oversizedRenderContract.decision.selection_source = 'user-override';
oversizedRenderContract.outputs[0].render_contract.phrase = 'x'.repeat(2 * 1024 * 1024);
assert.match(validateVisualJob(oversizedRenderContract).errors.join('\n'), /render_contract must serialize to at most 2097152 bytes/, 'Visual Job accepted a render contract larger than card.js can read');
const repeatedMediaBudget = { bytes: 0, pixels: 0 };
const repeatedMediaDigests = new Set();
const repeatedMediaSnapshot = {
  sha256: 'f'.repeat(64),
  bytes: Math.floor(2.78 * 1024 * 1024),
  width: 1600,
  height: 1200,
};
for (let index = 0; index < 13; index += 1) {
  accountUniqueImageSnapshot(repeatedMediaDigests, repeatedMediaBudget, repeatedMediaSnapshot);
}
assert.equal(repeatedMediaBudget.bytes, repeatedMediaSnapshot.bytes, 'reusing one media resource spent the poster byte budget more than once');
assert.equal(repeatedMediaBudget.pixels, repeatedMediaSnapshot.width * repeatedMediaSnapshot.height, 'reusing one media resource spent the poster pixel budget more than once');
assert.ok(repeatedMediaBudget.bytes < MAX_POSTER_MEDIA_TOTAL_BYTES, 'one 2.78 MiB media resource reused in 13 slots exceeded the unique-resource budget');
assert.doesNotMatch(
  fs.readFileSync(path.join(ROOT, 'scripts', 'render-job.mjs'), 'utf8'),
  /JSON\.stringify\(job,\s*null,\s*2\)/,
  'render-job pretty-prints a Visual Job beyond the byte representation enforced by runtime validation',
);
const mixedRejectedEvidence = v3Job();
mixedRejectedEvidence.source_units.push({
  id: 'old-output',
  excerpt: 'Historical output.',
  evidence: { kind: 'output', strength: 'unusable', freshness: 'stale', reason: 'Old product output.' },
});
mixedRejectedEvidence.outputs[0].artifacts[0].source_unit_ids.push('old-output');
assert.match(validateVisualJob(mixedRejectedEvidence).errors.join('\n'), /stale, unknown, or unusable evidence/);
const reusedPrimary = v3Job();
reusedPrimary.outputs[0].artifacts[1].source_unit_ids = ['input'];
assert.match(validateVisualJob(reusedPrimary).errors.join('\n'), /not used by another artifact/);
const duplicatePrimaryDigest = v3Job();
duplicatePrimaryDigest.source_units[0].digest = '2'.repeat(64);
duplicatePrimaryDigest.source_units[1].digest = '2'.repeat(64);
assert.match(validateVisualJob(duplicatePrimaryDigest).errors.join('\n'), /not used by another artifact/, 'identical evidence bytes must not become independent primary units through id splitting');
const duplicatePrimaryExcerpt = v3Job();
duplicatePrimaryExcerpt.source_units[1].evidence.kind = duplicatePrimaryExcerpt.source_units[0].evidence.kind;
duplicatePrimaryExcerpt.source_units[1].excerpt = duplicatePrimaryExcerpt.source_units[0].excerpt;
assert.match(validateVisualJob(duplicatePrimaryExcerpt).errors.join('\n'), /not used by another artifact/, 'identical digest-free evidence text must not become independent primary units through id splitting');
const duplicatePrimaryTextWithDifferentDigests = v3Job();
duplicatePrimaryTextWithDifferentDigests.source_units[0].digest = '3'.repeat(64);
duplicatePrimaryTextWithDifferentDigests.source_units[1].digest = '4'.repeat(64);
duplicatePrimaryTextWithDifferentDigests.source_units[1].evidence.kind = duplicatePrimaryTextWithDifferentDigests.source_units[0].evidence.kind;
duplicatePrimaryTextWithDifferentDigests.source_units[1].excerpt = duplicatePrimaryTextWithDifferentDigests.source_units[0].excerpt;
assert.match(validateVisualJob(duplicatePrimaryTextWithDifferentDigests).errors.join('\n'), /not used by another artifact/, 'different arbitrary digests must not make identical primary evidence text independent');
const unicodeEquivalentPrimary = v3Job();
unicodeEquivalentPrimary.source_units[0].excerpt = 'Caf\u00e9 input';
unicodeEquivalentPrimary.source_units[2].excerpt = 'Cafe\u0301 input';
unicodeEquivalentPrimary.source_units[2].evidence.kind = unicodeEquivalentPrimary.source_units[0].evidence.kind;
assert.match(validateVisualJob(unicodeEquivalentPrimary).errors.join('\n'), /not used by another artifact/, 'Unicode-equivalent primary excerpts must share one evidence identity');
for (const unsafeExcerpt of ['Same claim\u0000', 'Same claim\ufe0f', `Same claim${String.fromCharCode(0xd800)}`]) {
  const unsafePrimaryText = v3Job();
  unsafePrimaryText.source_units[0].excerpt = unsafeExcerpt;
  assert.match(validateVisualJob(unsafePrimaryText).errors.join('\n'), /must not contain control, surrogate, or default-ignorable Unicode characters/, 'Visual Job accepted an evidence identity containing invisible or non-scalar text');
}
const unknownPrimary = v3Job();
unknownPrimary.source_units[0].evidence.freshness = 'unknown';
unknownPrimary.source_units[0].evidence.reason = 'Freshness not confirmed.';
assert.match(validateVisualJob(unknownPrimary).errors.join('\n'), /cannot classify unknown evidence as primary/);
const rewrittenQuote = v3Job();
rewrittenQuote.source_units[0].evidence.kind = 'quote';
rewrittenQuote.outputs[0].artifacts[0].transformation = 'rewrite';
assert.match(validateVisualJob(rewrittenQuote).errors.join('\n'), /must be preserve/);
assert.doesNotThrow(() => validateVisualJob({ ...v3Job(), outputs: [{ ...v3Job().outputs[0], artifacts: [null] }] }));
assert.match(validateVisualJob({ ...v3Job(), outputs: [{ ...v3Job().outputs[0], artifacts: [null] }] }).errors.join('\n'), /must be an object/);
const swappedEvidenceCards = v3Job();
swappedEvidenceCards.outputs[0].render_contract.cards = [
  swappedEvidenceCards.outputs[0].render_contract.cards[1],
  swappedEvidenceCards.outputs[0].render_contract.cards[0],
  swappedEvidenceCards.outputs[0].render_contract.cards[2],
];
assert.match(validateVisualJob(swappedEvidenceCards).errors.join('\n'), /must preserve exact command evidence/);
const commandOnlyInSeriesTitle = v3Job();
commandOnlyInSeriesTitle.source_units[1].excerpt = 'Evidence route';
commandOnlyInSeriesTitle.outputs[0].artifacts[1].visual_plan.core_message = 'Evidence route';
commandOnlyInSeriesTitle.outputs[0].render_contract.cards[1].body[1].text = 'No exact command on this artifact.';
assert.match(validateVisualJob(commandOnlyInSeriesTitle).errors.join('\n'), /must preserve exact command evidence/, 'poster series title must not satisfy exact evidence for later artifacts');
const commandOnlyInSingleCardKicker = v3Job({
  publish_target: 'social-single',
  source_units: [{ id: 'command', excerpt: 'npx exact-command', evidence: { kind: 'command', strength: 'primary', freshness: 'current' } }],
  decision: { mode: 'poster', tier: 'stable', tone: 'sharp', selection_source: 'user-override', reason: 'Explicit single-card poster test.' },
  outputs: [{
    id: 'single-card-poster',
    artifacts: [{
      artifact_index: 1,
      id: 'single-command-card',
      basename: 'single-command.png',
      role: 'command',
      source_unit_ids: ['command'],
      transformation: 'preserve',
      visual_plan: visualPlan({ core_message: 'npx exact-command' }),
    }],
    render_contract: {
      mode: 'poster',
      tone: 'sharp',
      kicker: 'npx exact-command',
      title: 'No command here',
      cards: [{ body: [{ type: 'paragraph', text: 'The hidden kicker is not rendered in a single-card poster.' }] }],
    },
  }],
});
assert.match(validateVisualJob(commandOnlyInSingleCardKicker).errors.join('\n'), /must preserve exact command evidence/, 'single-card poster kicker must not satisfy exact evidence because it is not rendered');
const quotedCommand = v3Job();
quotedCommand.source_units[1].excerpt = `node -e "console.log('ok')"`;
quotedCommand.outputs[0].artifacts[1].visual_plan.core_message = quotedCommand.source_units[1].excerpt;
quotedCommand.outputs[0].render_contract.cards[1].body[1].text = quotedCommand.source_units[1].excerpt;
assert.equal(validateVisualJob(quotedCommand).valid, true, validateVisualJob(quotedCommand).errors.join('\n'));
const unstableWhitespaceCommand = v3Job();
unstableWhitespaceCommand.source_units[1].excerpt = 'npx  example-tool@latest';
unstableWhitespaceCommand.outputs[0].render_contract.cards[1].body[1].text = unstableWhitespaceCommand.source_units[1].excerpt;
assert.match(validateVisualJob(unstableWhitespaceCommand).errors.join('\n'), /browser-stable whitespace/, 'exact command evidence accepted whitespace that HTML rendering collapses');
const invisibleFormatCommand = v3Job();
invisibleFormatCommand.source_units[1].excerpt = 'npx\u200b example-tool@latest';
invisibleFormatCommand.outputs[0].render_contract.cards[1].body[1].text = invisibleFormatCommand.source_units[1].excerpt;
assert.match(validateVisualJob(invisibleFormatCommand).errors.join('\n'), /browser-stable whitespace/, 'exact command evidence accepted an invisible Unicode format character');
const bidiFormatQuote = v3Job();
bidiFormatQuote.source_units[1].excerpt = 'npx\u200e example-tool@latest';
bidiFormatQuote.outputs[0].render_contract.cards[1].body[1].text = bidiFormatQuote.source_units[1].excerpt;
assert.match(validateVisualJob(bidiFormatQuote).errors.join('\n'), /browser-stable whitespace/, 'exact evidence accepted a bidi formatting character');
const nonBreakingSpaceCommand = v3Job();
nonBreakingSpaceCommand.source_units[1].excerpt = 'npx\u00a0example-tool@latest';
nonBreakingSpaceCommand.outputs[0].render_contract.cards[1].body[1].text = nonBreakingSpaceCommand.source_units[1].excerpt;
assert.match(validateVisualJob(nonBreakingSpaceCommand).errors.join('\n'), /browser-stable whitespace/, 'exact evidence accepted non-ASCII whitespace');
const itemLabelCommand = v3Job();
itemLabelCommand.source_units[1].excerpt = 'lowercase command';
itemLabelCommand.outputs[0].artifacts[1].visual_plan.core_message = 'lowercase command';
itemLabelCommand.outputs[0].render_contract.cards[1].body = [{ type: 'items', entries: [{ label: 'lowercase command', text: 'Visible but unrelated body.' }] }];
assert.match(validateVisualJob(itemLabelCommand).errors.join('\n'), /must preserve exact command evidence/, 'poster item label transformed to uppercase was accepted as exact evidence');
const layerLabelQuote = v3Job({
  publish_target: 'long-read',
  source_units: [{ id: 'quote', excerpt: 'lowercase quote', evidence: { kind: 'quote', strength: 'primary', freshness: 'current' } }],
  decision: { mode: 'long', tier: 'stable', selection_source: 'user-override', reason: 'Exact label projection regression.' },
  outputs: [{
    id: 'long-output',
    artifacts: [{ artifact_index: 1, id: 'long-card', basename: 'long-card.png', role: 'quote', source_unit_ids: ['quote'], transformation: 'preserve', visual_plan: visualPlan({ core_message: 'lowercase quote' }) }],
    render_contract: { mode: 'long', title: 'Unrelated title', body: [{ type: 'layer_card', label: 'lowercase quote', text: 'Visible but unrelated body.' }] },
  }],
});
assert.match(validateVisualJob(layerLabelQuote).errors.join('\n'), /must preserve exact quote evidence/, 'long layer label transformed to uppercase was accepted as exact evidence');
const commandOnlyInPosterSource = v3Job();
commandOnlyInPosterSource.source_units[2].evidence.kind = 'quote';
commandOnlyInPosterSource.source_units[2].excerpt = 'Source-only exact evidence';
commandOnlyInPosterSource.outputs[0].artifacts[2].transformation = 'preserve';
commandOnlyInPosterSource.outputs[0].render_contract.source = 'Source-only exact evidence';
assert.match(validateVisualJob(commandOnlyInPosterSource).errors.join('\n'), /must preserve exact quote evidence/, 'poster source chrome must not satisfy exact evidence');
const cssOnlyCommand = v3Job({
  publish_target: 'social-single',
  source_units: [{ id: 'command', excerpt: 'npx exact-command', evidence: { kind: 'command', strength: 'primary', freshness: 'current' } }],
  decision: { mode: 'infograph', tier: 'studio', selection_source: 'user-override', reason: 'Explicit test override.' },
  outputs: [{
    id: 'css-only-command',
    artifacts: [{
      artifact_index: 1,
      id: 'command-card',
      basename: 'command.png',
      role: 'command',
      source_unit_ids: ['command'],
      transformation: 'preserve',
      visual_plan: visualPlan(),
    }],
    render_contract: {
      mode: 'infograph',
      title: 'Unrelated',
      composition_required: true,
      content_html: '<main>Unrelated visible text</main>',
      custom_css: '/* npx exact-command */ main { display: grid; }',
    },
  }],
});
assert.match(validateVisualJob(cssOnlyCommand).errors.join('\n'), /cannot bind exact command or quote evidence to a renderer/, 'Studio CSS cannot be trusted as an exact-evidence visibility surface');

const typeOnlyExactQuote = v3Job({
  publish_target: 'long-read',
  source_units: [{ id: 'quote', excerpt: 'paragraph', evidence: { kind: 'quote', strength: 'primary', freshness: 'current' } }],
  decision: { mode: 'long', tier: 'stable', selection_source: 'user-override', reason: 'Exact visibility projection test.' },
  outputs: [{
    id: 'long-output',
    artifacts: [{ artifact_index: 1, id: 'long-card', basename: 'long.png', role: 'quote', source_unit_ids: ['quote'], transformation: 'preserve', visual_plan: visualPlan() }],
    render_contract: { mode: 'long', title: 'Visible title', body: [{ type: 'paragraph', text: 'Visible unrelated copy.' }] },
  }],
});
assert.match(validateVisualJob(typeOnlyExactQuote).errors.join('\n'), /must preserve exact quote evidence/, 'non-visible discriminator fields must not satisfy exact evidence');
const paragraphLabelExactQuote = clone(typeOnlyExactQuote);
paragraphLabelExactQuote.source_units[0].excerpt = 'hidden paragraph label';
paragraphLabelExactQuote.outputs[0].render_contract.body[0].label = 'hidden paragraph label';
assert.match(validateVisualJob(paragraphLabelExactQuote).errors.join('\n'), /unknown field "label" for paragraph|renderer contract is invalid/, 'long paragraph label must neither validate nor satisfy exact evidence');

for (const [mode, renderContract] of [
  ['big', { mode: 'big', phrase: '<span class="accent">verbatim</span>' }],
  ['whiteboard', { mode: 'whiteboard', title: 'Quoted note', steps: [{ type: 'annotation', text: '**quoted exact**' }] }],
]) {
  const excerpt = mode === 'big' ? '<span class="accent">verbatim</span>' : '**quoted exact**';
  const markupJob = v3Job({
    publish_target: mode === 'big' ? 'social-single' : 'whiteboard',
    source_units: [{ id: 'quote', excerpt, evidence: { kind: 'quote', strength: 'primary', freshness: 'current' } }],
    decision: { mode, tier: 'stable', selection_source: 'user-override', reason: 'Exact markup must not be interpreted.' },
    outputs: [{
      id: `${mode}-output`,
      artifacts: [{ artifact_index: 1, id: `${mode}-card`, basename: `${mode}.png`, role: 'quote', source_unit_ids: ['quote'], transformation: 'preserve', visual_plan: visualPlan() }],
      render_contract: renderContract,
    }],
  });
  assert.match(validateVisualJob(markupJob).errors.join('\n'), /cannot bind exact command or quote evidence to a renderer/, `${mode} interpreted markup but accepted it as exact evidence`);
}

const suppressedLinkQuote = v3Job({
  publish_target: 'social-single',
  source_units: [{ id: 'quote', excerpt: '叠加', evidence: { kind: 'quote', strength: 'primary', freshness: 'current' } }],
  decision: { mode: 'article-diagram', tier: 'stable', selection_source: 'user-override', reason: 'Suppressed link labels are not reliable exact evidence.' },
  outputs: [{
    id: 'link-output',
    artifacts: [{ artifact_index: 1, id: 'link-card', basename: 'link.png', role: 'quote', source_unit_ids: ['quote'], transformation: 'preserve', visual_plan: visualPlan({ content_type: 'mechanism', argument_structure: 'cause-effect' }) }],
    render_contract: {
      mode: 'article-diagram', family: 'concept-map', title: 'Visible relationship',
      nodes: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }],
      links: [{ from: 'a', to: 'b', label: '叠加' }, { from: 'b', to: 'c', label: '叠加' }],
    },
  }],
});
assert.match(validateVisualJob(suppressedLinkQuote).errors.join('\n'), /cannot bind exact command or quote evidence to a renderer/, 'article-diagram labels that may be suppressed must not satisfy exact evidence');

const swappedCompressionEvidence = v3Job({
  publish_target: 'article-body',
  source_units: [
    { id: 'formula', excerpt: 'Exact formula', evidence: { kind: 'quote', strength: 'primary', freshness: 'current' } },
    { id: 'node', excerpt: 'Exact node', evidence: { kind: 'quote', strength: 'primary', freshness: 'current' } },
  ],
  decision: { mode: 'article-diagram', tier: 'stable', selection_source: 'user-override', reason: 'Split article evidence must bind to the rendered view.' },
  outputs: [{
    id: 'split-output',
    artifacts: [
      { artifact_index: 1, id: 'summary-card', basename: 'summary.png', role: 'summary', source_unit_ids: ['node'], transformation: 'preserve', visual_plan: visualPlan({ content_type: 'mechanism', argument_structure: 'cause-effect' }) },
      { artifact_index: 2, id: 'structure-card', basename: 'structure.png', role: 'structure', source_unit_ids: ['formula'], transformation: 'preserve', visual_plan: visualPlan({ content_type: 'mechanism', argument_structure: 'cause-effect' }) },
    ],
    render_contract: {
      mode: 'article-diagram', title: 'Hidden title', formula: 'Exact formula', sentence: 'Visible theorem', render_plan: 'split',
      structure: { nodes: [{ id: 'a', label: 'Exact node' }, { id: 'b', label: 'Other node' }], relations: [{ from: 'a', to: 'b', label: 'leads to' }] },
    },
  }],
});
assert.match(validateVisualJob(swappedCompressionEvidence).errors.join('\n'), /cannot bind exact command or quote evidence to a renderer/, 'compression summary and structure artifacts must not claim exact text that the renderer may normalize or truncate');
const v2DuplicateReference = v2Job();
v2DuplicateReference.outputs[0].source_unit_ids = ['claim', 'claim'];
assert.equal(validateVisualJob(v2DuplicateReference).valid, true, 'Visual Job v2 duplicate source references must remain compatible');

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

function publishReviewed(candidateDir, outputDir, approvedSha256 = candidateDirectorySha256(candidateDir), allowLegacyV1 = false) {
  const args = [
    path.join(ROOT, 'scripts', 'publish-reviewed-job.mjs'),
    '--candidate-dir', candidateDir,
    '--output-dir', outputDir,
    '--expected-candidate-sha256', approvedSha256,
    '--json',
  ];
  if (allowLegacyV1) args.push('--allow-legacy-v1');
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
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
assert.deepEqual(visualJobSchema.properties.schema_version.enum, [1, 2, 3]);
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

  const racedFinal = path.join(temp, 'raced.png');
  assert.throws(
    () => publishArtifacts([{ stagedPath: firstSource, finalPath: racedFinal }], {
      allowOverwrite: false,
      link(from, to) {
        fs.writeFileSync(to, 'concurrent-owner');
        fs.linkSync(from, to);
      },
    }),
    /EEXIST/,
  );
  assert.equal(fs.readFileSync(racedFinal, 'utf8'), 'concurrent-owner', 'no-overwrite publication replaced a target created during commit');
  fs.rmSync(racedFinal);

  const unlinkFailureFinal = path.join(temp, 'unlink-failure.png');
  let injectedUnlinkFailure = false;
  assert.throws(
    () => publishArtifacts([{ stagedPath: firstSource, finalPath: unlinkFailureFinal }], {
      allowOverwrite: false,
      unlink(target) {
        if (target.endsWith('.tmp') && !injectedUnlinkFailure) {
          injectedUnlinkFailure = true;
          throw new Error('injected staging unlink failure');
        }
        fs.unlinkSync(target);
      },
    }),
    /injected staging unlink failure/,
  );
  assert.equal(fs.existsSync(unlinkFailureFinal), false, 'failed no-overwrite publication left a committed final after staging cleanup failed');

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
    visual_job_sha256: receipt.visual_job_sha256,
    artifact_plan_sha256: receipt.artifact_plan_sha256,
    artifact_contract_sha256: receipt.artifact_contract_sha256,
    render_contract_sha256: receipt.render_contract_sha256,
    png_sha256: receipt.png.sha256,
    metaphor_required: receipt.metaphor_required,
  })));
  const approvedCandidateSha256 = candidateDirectorySha256(candidateDir);
  const published = publishReviewed(candidateDir, outputDir, approvedCandidateSha256);
  assert.equal(published.status, 0, published.stderr || published.stdout);
  assert.deepEqual(fs.readdirSync(outputDir).sort(), ['reviewed.png', 'reviewed.receipt.json', 'reviewed.review.json']);

  const oversizedUppercaseJson = path.join(reviewedTemp, 'oversized-uppercase-json');
  fs.mkdirSync(oversizedUppercaseJson);
  fs.writeFileSync(path.join(oversizedUppercaseJson, 'receipt.JSON'), Buffer.alloc((4 * 1024 * 1024) + 1, 0x20));
  assert.throws(
    () => candidateDirectorySha256(oversizedUppercaseJson),
    /bounded regular file/,
    'candidate snapshot treated uppercase JSON as an unrestricted generic file',
  );

  const nonCanonicalReceiptCandidate = path.join(reviewedTemp, 'noncanonical-receipt');
  fs.cpSync(candidateDir, nonCanonicalReceiptCandidate, { recursive: true });
  const nonCanonicalManifestPath = path.join(nonCanonicalReceiptCandidate, 'candidate-manifest.json');
  const nonCanonicalManifest = JSON.parse(fs.readFileSync(nonCanonicalManifestPath, 'utf8'));
  fs.renameSync(path.join(nonCanonicalReceiptCandidate, 'reviewed.receipt.json'), path.join(nonCanonicalReceiptCandidate, 'reviewed.bin'));
  nonCanonicalManifest.artifacts[0].receipt = 'reviewed.bin';
  fs.writeFileSync(nonCanonicalManifestPath, JSON.stringify(nonCanonicalManifest));
  const nonCanonicalReceiptPublish = publishReviewed(nonCanonicalReceiptCandidate, path.join(reviewedTemp, 'noncanonical-receipt-output'));
  assert.notEqual(nonCanonicalReceiptPublish.status, 0, 'publisher accepted a receipt outside the canonical .receipt.json boundary');
  assert.match(nonCanonicalReceiptPublish.stderr, /filenames must share the PNG stem/);

  const postApprovalCandidate = path.join(reviewedTemp, 'post-approval-tamper');
  fs.cpSync(candidateDir, postApprovalCandidate, { recursive: true });
  fs.appendFileSync(path.join(postApprovalCandidate, 'reviewed.review.json'), ' ');
  const postApprovalPublish = publishReviewed(postApprovalCandidate, path.join(reviewedTemp, 'post-approval-output'), approvedCandidateSha256);
  assert.notEqual(postApprovalPublish.status, 0, 'reviewed publication accepted a candidate changed after external approval');
  assert.match(postApprovalPublish.stderr, /externally approved SHA-256/);

  const partialCandidate = path.join(reviewedTemp, 'partial-candidate');
  fs.cpSync(candidateDir, partialCandidate, { recursive: true });
  const partialManifestPath = path.join(partialCandidate, 'candidate-manifest.json');
  const partialManifest = JSON.parse(fs.readFileSync(partialManifestPath, 'utf8'));
  partialManifest.expected_output_ids.push('missing-output');
  fs.writeFileSync(partialManifestPath, JSON.stringify(partialManifest));
  const partialRejected = publishReviewed(partialCandidate, path.join(reviewedTemp, 'partial-output'));
  assert.notEqual(partialRejected.status, 0, 'reviewed publication must reject an incomplete job output set');

  const badCandidate = path.join(reviewedTemp, 'bad-candidate');
  const badOutput = path.join(reviewedTemp, 'bad-output');
  fs.cpSync(candidateDir, badCandidate, { recursive: true });
  const badReviewPath = path.join(badCandidate, 'reviewed.review.json');
  const badReview = JSON.parse(fs.readFileSync(badReviewPath, 'utf8'));
  badReview.png_sha256 = 'c'.repeat(64);
  fs.writeFileSync(badReviewPath, JSON.stringify(badReview));
  const rejected = publishReviewed(badCandidate, badOutput);
  assert.notEqual(rejected.status, 0, 'reviewed publication must reject a mismatched PNG hash');
  assert.equal(fs.existsSync(badOutput), false, 'failed reviewed publication must not create final artifacts');

  const detachedPngCandidate = path.join(reviewedTemp, 'detached-png-candidate');
  fs.cpSync(candidateDir, detachedPngCandidate, { recursive: true });
  const alternateInputPath = path.join(reviewedTemp, 'alternate-card.json');
  const alternatePngPath = path.join(reviewedTemp, 'alternate-card.png');
  fs.writeFileSync(alternateInputPath, JSON.stringify({ mode: 'big', phrase: 'Different but valid' }));
  const alternateRender = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'card.js'), '--input', alternateInputPath, '--output', alternatePngPath,
  ], { encoding: 'utf8', env: { ...process.env, CARD_SKILL_DISABLE_AUTO_UPDATE: '1' } });
  assert.equal(alternateRender.status, 0, alternateRender.stderr || alternateRender.stdout);
  fs.copyFileSync(alternatePngPath, path.join(detachedPngCandidate, 'reviewed.png'));
  const detachedHash = sha256Bytes(fs.readFileSync(path.join(detachedPngCandidate, 'reviewed.png')));
  const detachedReceiptPath = path.join(detachedPngCandidate, 'reviewed.receipt.json');
  const detachedReceipt = JSON.parse(fs.readFileSync(detachedReceiptPath, 'utf8'));
  detachedReceipt.png.sha256 = detachedHash;
  fs.writeFileSync(detachedReceiptPath, JSON.stringify(detachedReceipt));
  const detachedReviewPath = path.join(detachedPngCandidate, 'reviewed.review.json');
  const detachedReview = JSON.parse(fs.readFileSync(detachedReviewPath, 'utf8'));
  detachedReview.png_sha256 = detachedHash;
  fs.writeFileSync(detachedReviewPath, JSON.stringify(detachedReview));
  const detachedManifestPath = path.join(detachedPngCandidate, 'candidate-manifest.json');
  const detachedManifest = JSON.parse(fs.readFileSync(detachedManifestPath, 'utf8'));
  detachedManifest.artifacts[0].receipt_sha256 = sha256Bytes(fs.readFileSync(detachedReceiptPath));
  fs.writeFileSync(detachedManifestPath, JSON.stringify(detachedManifest));
  const detachedPublish = publishReviewed(detachedPngCandidate, path.join(reviewedTemp, 'detached-png-output'));
  assert.notEqual(detachedPublish.status, 0, 'reviewed publication accepted a PNG detached from its sealed checked HTML');
  assert.match(detachedPublish.stderr, /does not match a trusted recapture/);

  const v3CandidateDir = path.join(reviewedTemp, 'v3-candidate');
  const v3OutputDir = path.join(reviewedTemp, 'v3-published');
  const reviewedV3Job = v3Job({ job_id: 'reviewed-v3-job' });
  const reviewedV3Path = path.join(reviewedTemp, 'v3-job.json');
  fs.writeFileSync(reviewedV3Path, JSON.stringify(reviewedV3Job));
  const renderedV3 = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'render-job.mjs'), '--input', reviewedV3Path,
    '--output-dir', v3CandidateDir, '--candidate', '--json',
  ], { encoding: 'utf8' });
  assert.equal(renderedV3.status, 0, renderedV3.stderr || renderedV3.stdout);
  for (const artifact of reviewedV3Job.outputs[0].artifacts) {
    const stem = path.basename(artifact.basename, '.png');
    const artifactReceipt = JSON.parse(fs.readFileSync(path.join(v3CandidateDir, `${stem}.receipt.json`), 'utf8'));
    assert.equal(artifactReceipt.artifact_id, artifact.id);
    assert.equal(artifactReceipt.artifact_role, artifact.role);
    fs.writeFileSync(path.join(v3CandidateDir, `${stem}.review.json`), JSON.stringify(validReview({
      job_id: artifactReceipt.job_id,
      output_id: artifactReceipt.output_id,
      artifact_index: artifactReceipt.artifact_index,
      visual_job_sha256: artifactReceipt.visual_job_sha256,
      artifact_plan_sha256: artifactReceipt.artifact_plan_sha256,
      artifact_contract_sha256: artifactReceipt.artifact_contract_sha256,
      render_contract_sha256: artifactReceipt.render_contract_sha256,
      png_sha256: artifactReceipt.png.sha256,
      metaphor_required: artifactReceipt.metaphor_required,
    })));
  }
  const publishedV3 = publishReviewed(v3CandidateDir, v3OutputDir);
  assert.equal(publishedV3.status, 0, publishedV3.stderr || publishedV3.stdout);
  assert.deepEqual(
    fs.readdirSync(v3OutputDir).filter(name => name.endsWith('.png')).sort(),
    ['route-1.png', 'route-2.png', 'route-3.png'],
  );

  const unrelatedDataImageCandidate = path.join(reviewedTemp, 'unrelated-data-image-candidate');
  fs.cpSync(v3CandidateDir, unrelatedDataImageCandidate, { recursive: true });
  const unrelatedManifestPath = path.join(unrelatedDataImageCandidate, 'candidate-manifest.json');
  const unrelatedManifest = JSON.parse(fs.readFileSync(unrelatedManifestPath, 'utf8'));
  const unrelatedArtifact = unrelatedManifest.artifacts[0];
  const unrelatedHtmlPath = path.join(unrelatedDataImageCandidate, unrelatedArtifact.checked_html);
  const unrelatedDataUri = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'assets', 'gallery', 'article-formula.png')).toString('base64')}`;
  fs.writeFileSync(unrelatedHtmlPath, fs.readFileSync(unrelatedHtmlPath, 'utf8').replace('</body>', `<img alt="decorative data image" hidden src="${unrelatedDataUri}"></body>`));
  const unrelatedReceiptPath = path.join(unrelatedDataImageCandidate, unrelatedArtifact.receipt);
  const unrelatedReceipt = JSON.parse(fs.readFileSync(unrelatedReceiptPath, 'utf8'));
  unrelatedReceipt.checked_html.sha256 = sha256Bytes(fs.readFileSync(unrelatedHtmlPath));
  fs.writeFileSync(unrelatedReceiptPath, JSON.stringify(unrelatedReceipt));
  unrelatedArtifact.receipt_sha256 = sha256Bytes(fs.readFileSync(unrelatedReceiptPath));
  fs.writeFileSync(unrelatedManifestPath, JSON.stringify(unrelatedManifest));
  const unrelatedDataImagePublish = publishReviewed(unrelatedDataImageCandidate, path.join(reviewedTemp, 'unrelated-data-image-output'));
  assert.notEqual(unrelatedDataImagePublish.status, 0, 'reviewed publication accepted an unplanned embedded data image');
  assert.match(unrelatedDataImagePublish.stderr, /embedded images do not exactly match/);

  const shadowCandidate = path.join(reviewedTemp, 'shadow-root-candidate');
  fs.cpSync(v3CandidateDir, shadowCandidate, { recursive: true });
  const shadowManifestPath = path.join(shadowCandidate, 'candidate-manifest.json');
  const shadowManifest = JSON.parse(fs.readFileSync(shadowManifestPath, 'utf8'));
  const shadowArtifact = shadowManifest.artifacts[0];
  const shadowHtmlPath = path.join(shadowCandidate, shadowArtifact.checked_html);
  fs.writeFileSync(shadowHtmlPath, fs.readFileSync(shadowHtmlPath, 'utf8').replace('</body>', '<div><template shadowrootmode="closed"><img src="data&#58;image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="></template></div></body>'));
  const shadowReceiptPath = path.join(shadowCandidate, shadowArtifact.receipt);
  const shadowReceipt = JSON.parse(fs.readFileSync(shadowReceiptPath, 'utf8'));
  shadowReceipt.checked_html.sha256 = sha256Bytes(fs.readFileSync(shadowHtmlPath));
  fs.writeFileSync(shadowReceiptPath, JSON.stringify(shadowReceipt));
  shadowArtifact.receipt_sha256 = sha256Bytes(fs.readFileSync(shadowReceiptPath));
  fs.writeFileSync(shadowManifestPath, JSON.stringify(shadowManifest));
  const shadowPublish = publishReviewed(shadowCandidate, path.join(reviewedTemp, 'shadow-root-output'));
  assert.notEqual(shadowPublish.status, 0, 'reviewed publication accepted a closed declarative shadow root that cannot be inventoried');
  assert.match(shadowPublish.stderr, /unauditable declarative shadow root/);

  const mediaEvidencePath = path.join(reviewedTemp, 'current-output.png');
  fs.copyFileSync(path.join(ROOT, 'assets', 'gallery', 'article-formula.png'), mediaEvidencePath);
  const mediaCandidateDir = path.join(reviewedTemp, 'media-candidate');
  const mediaOutputDir = path.join(reviewedTemp, 'media-published');
  const mediaJob = v3Job({
    job_id: 'reviewed-media-job',
    source_units: [{
      id: 'current-output',
      excerpt: 'Current output screenshot.',
      digest: sha256Bytes(fs.readFileSync(mediaEvidencePath)),
      evidence: { kind: 'output', strength: 'primary', freshness: 'current' },
    }],
    outputs: [{
      id: 'media-output',
      artifacts: [{
        artifact_index: 1,
        id: 'media-card',
        basename: 'media-card.png',
        role: 'output',
        source_unit_ids: ['current-output'],
        transformation: 'compress',
        visual_plan: visualPlan({ core_message: 'Current output screenshot.', layout_strategy: 'evidence-led media field' }),
      }],
      render_contract: {
        mode: 'poster',
        tone: 'sharp',
        title: 'Current output',
        source: 'Owned validation fixture',
        cards: [{ body: [
          { type: 'media', path: mediaEvidencePath, alt: 'Current output screenshot', caption: 'Current output screenshot.', fit: 'cover' },
          { type: 'paragraph', text: 'The source occupies the primary reading field.' },
        ] }],
      },
    }],
  });
  const mediaJobPath = path.join(reviewedTemp, 'media-job.json');
  fs.writeFileSync(mediaJobPath, JSON.stringify(mediaJob));
  const renderedMedia = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'render-job.mjs'), '--input', mediaJobPath,
    '--output-dir', mediaCandidateDir, '--candidate', '--json',
  ], { encoding: 'utf8' });
  assert.equal(renderedMedia.status, 0, renderedMedia.stderr || renderedMedia.stdout);
  const supportingMediaJob = clone(mediaJob);
  supportingMediaJob.source_units[0].evidence.strength = 'supporting';
  supportingMediaJob.source_units.push({
    id: 'unrelated-primary', excerpt: 'Unrelated primary record.', digest: 'a'.repeat(64),
    evidence: { kind: 'output', strength: 'primary', freshness: 'current' },
  });
  supportingMediaJob.outputs[0].artifacts[0].source_unit_ids.push('unrelated-primary');
  assert.match(validateVisualJob(supportingMediaJob).errors.join('\n'), /media digest must match a referenced current primary source unit/, 'supporting evidence digest plus an unrelated primary digest satisfied poster media binding');
  const mediaReceipt = JSON.parse(fs.readFileSync(path.join(mediaCandidateDir, 'media-card.receipt.json'), 'utf8'));
  const mediaManifest = JSON.parse(fs.readFileSync(path.join(mediaCandidateDir, 'candidate-manifest.json'), 'utf8'));
  assert.deepEqual(mediaManifest.artifacts[0].allowed_local_files, [], 'candidate manifest must not authorize the original poster-media path');
  assert.deepEqual(mediaReceipt.media_snapshots.map(snapshot => snapshot.sha256), [mediaJob.source_units[0].digest], 'receipt did not bind the private media snapshot to source evidence');
  assert.match(fs.readFileSync(path.join(mediaCandidateDir, 'media-card.checked.html'), 'utf8'), /src="data:image\/png;base64,/, 'checked HTML did not seal poster media as an embedded snapshot');
  fs.writeFileSync(path.join(mediaCandidateDir, 'media-card.review.json'), JSON.stringify(validReview({
    job_id: mediaReceipt.job_id,
    output_id: mediaReceipt.output_id,
    artifact_index: mediaReceipt.artifact_index,
    visual_job_sha256: mediaReceipt.visual_job_sha256,
    artifact_plan_sha256: mediaReceipt.artifact_plan_sha256,
    artifact_contract_sha256: mediaReceipt.artifact_contract_sha256,
    render_contract_sha256: mediaReceipt.render_contract_sha256,
    png_sha256: mediaReceipt.png.sha256,
    metaphor_required: mediaReceipt.metaphor_required,
  })));
  fs.rmSync(mediaEvidencePath);
  const publishedMedia = publishReviewed(mediaCandidateDir, mediaOutputDir);
  assert.equal(publishedMedia.status, 0, publishedMedia.stderr || publishedMedia.stdout);
  assert.deepEqual(fs.readdirSync(mediaOutputDir).sort(), ['media-card.png', 'media-card.receipt.json', 'media-card.review.json']);

  const reusedLogoPath = path.join(reviewedTemp, 'reused-logo.png');
  const reusedLogoSource = path.join(reviewedTemp, 'reused-logo-source.html');
  fs.writeFileSync(reusedLogoSource, '<!doctype html><html><body style="margin:0;width:320px;height:320px;background:#ff6b2c;display:grid;place-items:center;color:#fff;font:700 160px sans-serif">C</body></html>');
  const capturedReusedLogo = spawnSync(process.execPath, [path.join(ROOT, 'assets', 'capture4k.js'), reusedLogoSource, reusedLogoPath, '320', '320', '1'], { encoding: 'utf8' });
  assert.equal(capturedReusedLogo.status, 0, capturedReusedLogo.stderr || capturedReusedLogo.stdout);
  fs.appendFileSync(reusedLogoPath, Buffer.alloc(150 * 1024));
  const repeatedLogoInputPath = path.join(reviewedTemp, 'repeated-logo-input.json');
  fs.writeFileSync(repeatedLogoInputPath, JSON.stringify({
    mode: 'infograph', title: 'Repeated logo boundary', composition_required: true, logo: reusedLogoPath,
    content_html: `<main>${Array.from({ length: 400 }, () => `<img src="${pathToFileURL(reusedLogoPath).href}" alt="Repeated approved logo">`).join('')}</main>`,
    custom_css: 'main{display:grid;grid-template-columns:repeat(20,1fr)}img{width:100%}',
  }));
  const repeatedLogoRender = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'card.js'), '--input', repeatedLogoInputPath, '--output', path.join(reviewedTemp, 'repeated-logo.png')], { encoding: 'utf8', env: { ...process.env, CARD_SKILL_DISABLE_AUTO_UPDATE: '1' } });
  assert.notEqual(repeatedLogoRender.status, 0, 'renderer expanded repeated logo references beyond the checked-HTML budget');
  assert.match(repeatedLogoRender.stderr, /48 MiB checked-HTML budget/);
  const jobWideMediaPaths = [1, 2].map((index) => {
    const mediaPath = path.join(reviewedTemp, `job-wide-media-${index}.png`);
    fs.writeFileSync(mediaPath, Buffer.concat([fs.readFileSync(reusedLogoPath), Buffer.alloc(17 * 1024 * 1024, index)]));
    return mediaPath;
  });
  const jobWideMediaBudget = v3Job({
    job_id: 'job-wide-media-budget',
    source_units: jobWideMediaPaths.map((mediaPath, index) => ({
      id: `media-${index + 1}`,
      excerpt: `Current media ${index + 1}.`,
      digest: sha256Bytes(fs.readFileSync(mediaPath)),
      evidence: { kind: 'output', strength: 'primary', freshness: 'current' },
    })),
    outputs: jobWideMediaPaths.map((mediaPath, index) => ({
      id: `media-output-${index + 1}`,
      artifacts: [{ artifact_index: 1, id: `media-card-${index + 1}`, basename: `media-${index + 1}.png`, role: 'output', source_unit_ids: [`media-${index + 1}`], transformation: 'compress', visual_plan: visualPlan({ core_message: `Current media ${index + 1}.` }) }],
      render_contract: { mode: 'poster', tone: 'sharp', title: `Current media ${index + 1}`, cards: [{ body: [{ type: 'media', path: mediaPath, alt: `Current media ${index + 1}` }] }] },
    })),
  });
  assert.match(validateVisualJob(jobWideMediaBudget).errors.join('\n'), /job-wide candidate budget/, 'Visual Job accepted poster media that cannot fit the reviewed candidate budget across outputs');
  const reusedLogoCandidate = path.join(reviewedTemp, 'reused-logo-candidate');
  const reusedLogoOutput = path.join(reviewedTemp, 'reused-logo-output');
  const reusedLogoJob = v3Job({
    job_id: 'reused-logo-job',
    publish_target: 'article-body',
    source_units: [{ id: 'claim', excerpt: 'One sealed image identity can be reused visibly.', evidence: { kind: 'claim', strength: 'primary', freshness: 'current' } }],
    decision: { mode: 'infograph', tier: 'studio', tone: 'sharp', selection_source: 'user-override', reason: 'Regression for one sealed logo reused in authored content.' },
    outputs: [{
      id: 'reused-logo-output',
      artifacts: [{ artifact_index: 1, id: 'reused-logo-card', basename: 'reused-logo-card.png', role: 'claim', source_unit_ids: ['claim'], transformation: 'visualize', visual_plan: visualPlan({ core_message: 'One sealed image identity can be reused visibly.' }) }],
      render_contract: {
        mode: 'infograph',
        tone: 'sharp',
        design: 'stripe',
        title: 'One sealed identity',
        source: 'Owned validation fixture',
        logo: reusedLogoPath,
        brand_name: 'Card Skill',
        composition_required: true,
        content_html: `<main class="reused-logo"><img src="${pathToFileURL(reusedLogoPath).href}" alt="Repeated approved asset"><h2>One resource.<br>Two roles.</h2><p>The authored image and colophon logo share one sealed digest.</p></main>`,
        custom_css: '.page{min-height:800px}.reused-logo{min-height:590px;display:grid;grid-template-columns:320px 1fr;grid-template-rows:auto auto;gap:28px 48px;align-content:center}.reused-logo img{width:320px;height:420px;object-fit:cover;grid-row:1/3}.reused-logo h2{font:700 58px/1.08 var(--serif);align-self:end}.reused-logo p{font:500 36px/1.4 var(--sans);color:var(--ink-muted)}',
      },
    }],
  });
  const reusedLogoJobPath = path.join(reviewedTemp, 'reused-logo-job.json');
  fs.writeFileSync(reusedLogoJobPath, JSON.stringify(reusedLogoJob));
  const renderedReusedLogo = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'render-job.mjs'), '--input', reusedLogoJobPath,
    '--output-dir', reusedLogoCandidate, '--candidate', '--json',
  ], { encoding: 'utf8' });
  assert.equal(renderedReusedLogo.status, 0, renderedReusedLogo.stderr || renderedReusedLogo.stdout);
  const reusedLogoReceipt = JSON.parse(fs.readFileSync(path.join(reusedLogoCandidate, 'reused-logo-card.receipt.json'), 'utf8'));
  const reusedLogoHtml = fs.readFileSync(path.join(reusedLogoCandidate, 'reused-logo-card.checked.html'), 'utf8');
  assert.ok((reusedLogoHtml.match(/data:image\/png;base64,/g) || []).length >= 2, 'candidate did not reuse the sealed logo in authored content and renderer chrome');
  fs.writeFileSync(path.join(reusedLogoCandidate, 'reused-logo-card.review.json'), JSON.stringify(validReview({
    job_id: reusedLogoReceipt.job_id,
    output_id: reusedLogoReceipt.output_id,
    artifact_index: reusedLogoReceipt.artifact_index,
    visual_job_sha256: reusedLogoReceipt.visual_job_sha256,
    artifact_plan_sha256: reusedLogoReceipt.artifact_plan_sha256,
    artifact_contract_sha256: reusedLogoReceipt.artifact_contract_sha256,
    render_contract_sha256: reusedLogoReceipt.render_contract_sha256,
    png_sha256: reusedLogoReceipt.png.sha256,
    metaphor_required: reusedLogoReceipt.metaphor_required,
  })));
  const publishedReusedLogo = publishReviewed(reusedLogoCandidate, reusedLogoOutput);
  assert.equal(publishedReusedLogo.status, 0, publishedReusedLogo.stderr || publishedReusedLogo.stdout);

  const posterLogoCandidate = path.join(reviewedTemp, 'poster-logo-candidate');
  const posterLogoOutput = path.join(reviewedTemp, 'poster-logo-output');
  const posterLogoJob = v3Job({
    job_id: 'poster-logo-job',
    source_units: [
      { id: 'first', excerpt: 'First responsibility.', evidence: { kind: 'claim', strength: 'primary', freshness: 'current' } },
      { id: 'last', excerpt: 'Last responsibility.', evidence: { kind: 'output', strength: 'primary', freshness: 'current' } },
    ],
    outputs: [{
      id: 'poster-logo-series',
      artifacts: [
        { artifact_index: 1, id: 'poster-logo-first', basename: 'poster-logo-1.png', role: 'claim', source_unit_ids: ['first'], transformation: 'compress', visual_plan: visualPlan({ core_message: 'First responsibility.' }) },
        { artifact_index: 2, id: 'poster-logo-last', basename: 'poster-logo-2.png', role: 'output', source_unit_ids: ['last'], transformation: 'compress', visual_plan: visualPlan({ core_message: 'Last responsibility.' }) },
      ],
      render_contract: {
        mode: 'poster', tone: 'sharp', title: 'Two responsibilities', source: 'Owned validation fixture', logo: reusedLogoPath, brand_name: 'Card Skill',
        cards: [
          { body: [{ type: 'paragraph', text: 'First responsibility.' }] },
          { body: [{ type: 'paragraph', text: 'Last responsibility.' }] },
        ],
      },
    }],
  });
  const posterLogoJobPath = path.join(reviewedTemp, 'poster-logo-job.json');
  fs.writeFileSync(posterLogoJobPath, JSON.stringify(posterLogoJob));
  const renderedPosterLogo = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'render-job.mjs'), '--input', posterLogoJobPath, '--output-dir', posterLogoCandidate, '--candidate', '--json'], { encoding: 'utf8' });
  assert.equal(renderedPosterLogo.status, 0, renderedPosterLogo.stderr || renderedPosterLogo.stdout);
  for (const [index, stem] of ['poster-logo-1', 'poster-logo-2'].entries()) {
    const receiptPath = path.join(posterLogoCandidate, `${stem}.receipt.json`);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    assert.equal(Boolean(receipt.logo_snapshot), index === 1, 'poster receipt logo snapshot does not match the artifact that visibly renders the logo');
    fs.writeFileSync(path.join(posterLogoCandidate, `${stem}.review.json`), JSON.stringify(validReview({
      job_id: receipt.job_id, output_id: receipt.output_id, artifact_index: receipt.artifact_index,
      visual_job_sha256: receipt.visual_job_sha256, artifact_plan_sha256: receipt.artifact_plan_sha256,
      artifact_contract_sha256: receipt.artifact_contract_sha256, render_contract_sha256: receipt.render_contract_sha256,
      png_sha256: receipt.png.sha256, metaphor_required: receipt.metaphor_required,
    })));
  }
  const publishedPosterLogo = publishReviewed(posterLogoCandidate, posterLogoOutput);
  assert.equal(publishedPosterLogo.status, 0, publishedPosterLogo.stderr || publishedPosterLogo.stdout);

  const tamperedMediaCandidate = path.join(reviewedTemp, 'media-tampered-allow-list');
  fs.cpSync(mediaCandidateDir, tamperedMediaCandidate, { recursive: true });
  const tamperedMediaManifestPath = path.join(tamperedMediaCandidate, 'candidate-manifest.json');
  const tamperedMediaManifest = JSON.parse(fs.readFileSync(tamperedMediaManifestPath, 'utf8'));
  tamperedMediaManifest.artifacts[0].allowed_local_files = [path.join(ROOT, 'assets', 'gallery', 'big.png')];
  fs.writeFileSync(tamperedMediaManifestPath, JSON.stringify(tamperedMediaManifest));
  const rejectedMediaAllowList = publishReviewed(tamperedMediaCandidate, path.join(reviewedTemp, 'media-tampered-output'));
  assert.notEqual(rejectedMediaAllowList.status, 0, 'reviewed publication must reject a media allow-list that differs from the sealed Visual Job');
  assert.match(rejectedMediaAllowList.stderr, /local asset allow-list does not match/);

  const unboundMediaJob = clone(mediaJob);
  unboundMediaJob.outputs[0].render_contract.cards[0].body[0].path = path.join(ROOT, 'assets', 'gallery', 'article-formula.png');
  unboundMediaJob.source_units[0].digest = '0'.repeat(64);
  assert.match(validateVisualJob(unboundMediaJob).errors.join('\n'), /media digest must match a referenced current primary source unit/, 'Visual Job accepted poster media whose bytes did not match current primary evidence');
  const unboundMediaJobPath = path.join(reviewedTemp, 'unbound-media-job.json');
  fs.writeFileSync(unboundMediaJobPath, JSON.stringify(unboundMediaJob));
  const unboundMediaRender = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'render-job.mjs'), '--input', unboundMediaJobPath,
    '--output-dir', path.join(reviewedTemp, 'unbound-media-candidate'), '--candidate', '--json',
  ], { encoding: 'utf8' });
  assert.notEqual(unboundMediaRender.status, 0, 'renderer accepted poster media whose snapshot digest was not sealed as evidence');
  assert.match(unboundMediaRender.stderr, /media digest must match|media snapshot does not match/);

  const incompleteV3Candidate = path.join(reviewedTemp, 'v3-incomplete-candidate');
  fs.cpSync(v3CandidateDir, incompleteV3Candidate, { recursive: true });
  const incompleteV3ManifestPath = path.join(incompleteV3Candidate, 'candidate-manifest.json');
  const incompleteV3Manifest = JSON.parse(fs.readFileSync(incompleteV3ManifestPath, 'utf8'));
  const removedV3Artifact = incompleteV3Manifest.artifacts.pop();
  fs.writeFileSync(incompleteV3ManifestPath, JSON.stringify(incompleteV3Manifest));
  for (const name of [
    removedV3Artifact.png,
    removedV3Artifact.receipt,
    removedV3Artifact.checked_html,
    `${path.basename(removedV3Artifact.png, '.png')}.review.json`,
  ]) fs.rmSync(path.join(incompleteV3Candidate, name));
  const incompleteV3Publish = publishReviewed(incompleteV3Candidate, path.join(reviewedTemp, 'v3-incomplete-output'));
  assert.notEqual(incompleteV3Publish.status, 0, 'reviewed publication must reject a truncated Visual Job v3 artifact set');
  assert.match(incompleteV3Publish.stderr, /complete Visual Job artifact set/);

  const downgradedV3Candidate = path.join(reviewedTemp, 'v3-downgraded-candidate');
  fs.cpSync(v3CandidateDir, downgradedV3Candidate, { recursive: true });
  const downgradedManifestPath = path.join(downgradedV3Candidate, 'candidate-manifest.json');
  const downgradedManifest = JSON.parse(fs.readFileSync(downgradedManifestPath, 'utf8'));
  downgradedManifest.schema_version = 1;
  downgradedManifest.visual_job_version = 1;
  delete downgradedManifest.visual_job;
  delete downgradedManifest.visual_job_sha256;
  fs.rmSync(path.join(downgradedV3Candidate, 'visual-job.json'));
  for (const artifact of downgradedManifest.artifacts) {
    delete artifact.artifact_id;
    delete artifact.artifact_role;
    delete artifact.artifact_plan_sha256;
    const receiptPath = path.join(downgradedV3Candidate, artifact.receipt);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    receipt.visual_job_version = 1;
    for (const field of ['artifact_id', 'artifact_role', 'visual_job_sha256', 'artifact_plan_sha256', 'artifact_contract_sha256', 'source_evidence_sha256', 'artifact_plan']) delete receipt[field];
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));
    artifact.receipt_sha256 = sha256Bytes(fs.readFileSync(receiptPath));
    const reviewPath = path.join(downgradedV3Candidate, `${path.basename(artifact.png, '.png')}.review.json`);
    const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
    for (const field of ['visual_job_sha256', 'artifact_plan_sha256', 'artifact_contract_sha256']) delete review[field];
    fs.writeFileSync(reviewPath, JSON.stringify(review));
  }
  fs.writeFileSync(downgradedManifestPath, JSON.stringify(downgradedManifest));
  const downgradedPublish = publishReviewed(downgradedV3Candidate, path.join(reviewedTemp, 'v3-downgraded-output'));
  assert.notEqual(downgradedPublish.status, 0, 'reviewed publication accepted a pre-approval Visual Job v3 candidate relabeled as legacy without explicit legacy authorization');
  assert.match(downgradedPublish.stderr, /explicit --allow-legacy-v1 approval/);

  const effectiveTamperCandidate = path.join(reviewedTemp, 'v3-effective-contract-tamper');
  fs.cpSync(v3CandidateDir, effectiveTamperCandidate, { recursive: true });
  const effectiveTamperManifestPath = path.join(effectiveTamperCandidate, 'candidate-manifest.json');
  const effectiveTamperManifest = JSON.parse(fs.readFileSync(effectiveTamperManifestPath, 'utf8'));
  const effectiveTamperArtifact = effectiveTamperManifest.artifacts[0];
  const effectiveTamperReceiptPath = path.join(effectiveTamperCandidate, effectiveTamperArtifact.receipt);
  const effectiveTamperReceipt = JSON.parse(fs.readFileSync(effectiveTamperReceiptPath, 'utf8'));
  const effectiveTamperJob = JSON.parse(fs.readFileSync(path.join(effectiveTamperCandidate, 'visual-job.json'), 'utf8'));
  const effectiveTamperContract = clone(effectiveTamperJob.outputs[0].render_contract);
  effectiveTamperContract.logo = path.join(ROOT, 'assets', 'gallery', 'big.png');
  effectiveTamperReceipt.effective_render_contract = effectiveTamperContract;
  effectiveTamperReceipt.render_contract_sha256 = sha256Json(effectiveTamperContract);
  effectiveTamperReceipt.artifact_contract_sha256 = sha256Json(artifactContractProjection(effectiveTamperContract, effectiveTamperArtifact.artifact_index));
  fs.writeFileSync(effectiveTamperReceiptPath, JSON.stringify(effectiveTamperReceipt));
  effectiveTamperArtifact.receipt_sha256 = sha256Bytes(fs.readFileSync(effectiveTamperReceiptPath));
  const effectiveTamperReviewPath = path.join(effectiveTamperCandidate, `${path.basename(effectiveTamperArtifact.png, '.png')}.review.json`);
  const effectiveTamperReview = JSON.parse(fs.readFileSync(effectiveTamperReviewPath, 'utf8'));
  effectiveTamperReview.render_contract_sha256 = effectiveTamperReceipt.render_contract_sha256;
  effectiveTamperReview.artifact_contract_sha256 = effectiveTamperReceipt.artifact_contract_sha256;
  fs.writeFileSync(effectiveTamperReviewPath, JSON.stringify(effectiveTamperReview));
  fs.writeFileSync(effectiveTamperManifestPath, JSON.stringify(effectiveTamperManifest));
  const effectiveTamperPublish = publishReviewed(effectiveTamperCandidate, path.join(reviewedTemp, 'v3-effective-contract-output'));
  assert.notEqual(effectiveTamperPublish.status, 0, 'reviewed publication accepted a receipt-controlled local asset');
  assert.match(effectiveTamperPublish.stderr, /changed the sealed local asset set/);

  const tamperedContractCandidate = path.join(reviewedTemp, 'v3-tampered-contract');
  fs.cpSync(v3CandidateDir, tamperedContractCandidate, { recursive: true });
  const tamperedJobPath = path.join(tamperedContractCandidate, 'visual-job.json');
  const tamperedJob = JSON.parse(fs.readFileSync(tamperedJobPath, 'utf8'));
  tamperedJob.outputs[0].render_contract.cards[0].body[0].text = 'Different claim never rendered';
  fs.writeFileSync(tamperedJobPath, JSON.stringify(tamperedJob));
  const tamperedManifestPath = path.join(tamperedContractCandidate, 'candidate-manifest.json');
  const tamperedManifest = JSON.parse(fs.readFileSync(tamperedManifestPath, 'utf8'));
  tamperedManifest.visual_job_sha256 = sha256Json(tamperedJob);
  for (const artifact of tamperedManifest.artifacts) {
    const artifactReceiptPath = path.join(tamperedContractCandidate, artifact.receipt);
    const artifactReceipt = JSON.parse(fs.readFileSync(artifactReceiptPath, 'utf8'));
    artifactReceipt.visual_job_sha256 = tamperedManifest.visual_job_sha256;
    fs.writeFileSync(artifactReceiptPath, JSON.stringify(artifactReceipt));
    artifact.receipt_sha256 = sha256Bytes(fs.readFileSync(artifactReceiptPath));
    const artifactReviewPath = path.join(tamperedContractCandidate, `${path.basename(artifact.png, '.png')}.review.json`);
    const artifactReview = JSON.parse(fs.readFileSync(artifactReviewPath, 'utf8'));
    artifactReview.visual_job_sha256 = tamperedManifest.visual_job_sha256;
    fs.writeFileSync(artifactReviewPath, JSON.stringify(artifactReview));
  }
  fs.writeFileSync(tamperedManifestPath, JSON.stringify(tamperedManifest));
  const tamperedContractPublish = publishReviewed(tamperedContractCandidate, path.join(reviewedTemp, 'v3-tampered-output'));
  assert.notEqual(tamperedContractPublish.status, 0, 'reviewed publication must reject a Visual Job snapshot whose contract was not rendered');
  assert.match(tamperedContractPublish.stderr, /requested render contract does not match/);

  const v1CandidateDir = path.join(reviewedTemp, 'v1-candidate');
  const v1OutputDir = path.join(reviewedTemp, 'v1-published');
  const reviewedV1Job = baseJob({
    job_id: 'reviewed-v1-job',
    publish_target: 'social-single',
    decision: { ...baseJob().decision, mode: 'big', reason: 'One legacy output exercises compatible publication.' },
    outputs: [{ ...baseJob().outputs[0], id: 'legacy-output', basename: 'legacy.png' }],
  });
  const reviewedV1Path = path.join(reviewedTemp, 'v1-job.json');
  fs.writeFileSync(reviewedV1Path, JSON.stringify(reviewedV1Job));
  const renderedV1 = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'render-job.mjs'), '--input', reviewedV1Path,
    '--output-dir', v1CandidateDir, '--candidate', '--json',
  ], { encoding: 'utf8' });
  assert.equal(renderedV1.status, 0, renderedV1.stderr || renderedV1.stdout);
  const v1Receipt = JSON.parse(fs.readFileSync(path.join(v1CandidateDir, 'legacy.receipt.json'), 'utf8'));
  fs.writeFileSync(path.join(v1CandidateDir, 'legacy.review.json'), JSON.stringify(validReview({
    job_id: v1Receipt.job_id,
    output_id: v1Receipt.output_id,
    artifact_index: v1Receipt.artifact_index,
    render_contract_sha256: v1Receipt.render_contract_sha256,
    png_sha256: v1Receipt.png.sha256,
    metaphor_required: v1Receipt.metaphor_required,
  })));
  const v1WithoutExplicitApproval = publishReviewed(v1CandidateDir, path.join(reviewedTemp, 'v1-without-explicit-approval'));
  assert.notEqual(v1WithoutExplicitApproval.status, 0, 'legacy candidate published without explicit legacy approval');
  assert.match(v1WithoutExplicitApproval.stderr, /explicit --allow-legacy-v1 approval/);
  const publishedV1 = publishReviewed(v1CandidateDir, v1OutputDir, candidateDirectorySha256(v1CandidateDir), true);
  assert.equal(publishedV1.status, 0, publishedV1.stderr || publishedV1.stdout);
  assert.deepEqual(fs.readdirSync(v1OutputDir).sort(), ['legacy.png', 'legacy.receipt.json', 'legacy.review.json']);
  const duplicateLegacyCandidate = path.join(reviewedTemp, 'v1-duplicate-output');
  fs.cpSync(v1CandidateDir, duplicateLegacyCandidate, { recursive: true });
  const duplicateLegacyManifestPath = path.join(duplicateLegacyCandidate, 'candidate-manifest.json');
  const duplicateLegacyManifest = JSON.parse(fs.readFileSync(duplicateLegacyManifestPath, 'utf8'));
  duplicateLegacyManifest.expected_output_ids.push(duplicateLegacyManifest.expected_output_ids[0]);
  fs.writeFileSync(duplicateLegacyManifestPath, JSON.stringify(duplicateLegacyManifest));
  const duplicateLegacyPublish = publishReviewed(duplicateLegacyCandidate, path.join(reviewedTemp, 'v1-duplicate-output-published'), candidateDirectorySha256(duplicateLegacyCandidate), true);
  assert.notEqual(duplicateLegacyPublish.status, 0, 'legacy publication accepted duplicate expected output identities');
  assert.match(duplicateLegacyPublish.stderr, /unique safe IDs/);
  const oversizedLegacyManifestCandidate = path.join(reviewedTemp, 'v1-oversized-manifest');
  fs.cpSync(v1CandidateDir, oversizedLegacyManifestCandidate, { recursive: true });
  const oversizedLegacyManifestPath = path.join(oversizedLegacyManifestCandidate, 'candidate-manifest.json');
  const oversizedLegacyManifest = JSON.parse(fs.readFileSync(oversizedLegacyManifestPath, 'utf8'));
  oversizedLegacyManifest.expected_output_ids = Array.from({ length: 21 }, (_, index) => `output-${index + 1}`);
  fs.writeFileSync(oversizedLegacyManifestPath, JSON.stringify(oversizedLegacyManifest));
  const oversizedLegacyPublish = publishReviewed(oversizedLegacyManifestCandidate, path.join(reviewedTemp, 'v1-oversized-manifest-published'), candidateDirectorySha256(oversizedLegacyManifestCandidate), true);
  assert.notEqual(oversizedLegacyPublish.status, 0, 'legacy publication accepted an oversized manifest identity array');
  assert.match(oversizedLegacyPublish.stderr, /limit of 20 outputs and 20 artifacts/);

  const legacySeriesDir = path.join(reviewedTemp, 'legacy-series');
  const legacySeriesJob = v2Job({
    job_id: 'legacy-series-job',
    publish_target: 'social-series',
    decision: { ...v2Job().decision, mode: 'poster' },
    outputs: [{
      ...v2Job().outputs[0],
      id: 'a'.repeat(64),
      basename: 'legacy-series.png',
      render_contract: {
        mode: 'poster',
        title: 'Legacy series',
        cards: [
          { body: [{ type: 'heading', text: 'First' }] },
          { body: [{ type: 'heading', text: 'Second' }] },
        ],
      },
    }],
  });
  const legacySeriesPath = path.join(reviewedTemp, 'legacy-series-job.json');
  fs.writeFileSync(legacySeriesPath, JSON.stringify(legacySeriesJob));
  const renderedLegacySeries = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'render-job.mjs'), '--input', legacySeriesPath,
    '--output-dir', legacySeriesDir, '--candidate', '--json',
  ], { encoding: 'utf8' });
  assert.equal(renderedLegacySeries.status, 0, renderedLegacySeries.stderr || renderedLegacySeries.stdout);
  assert.deepEqual(
    fs.readdirSync(legacySeriesDir).filter(name => name.endsWith('.png')).sort(),
    ['legacy-series_1.png', 'legacy-series_2.png'],
  );
  const legacySeriesManifest = JSON.parse(fs.readFileSync(path.join(legacySeriesDir, 'candidate-manifest.json'), 'utf8'));
  assert.equal(legacySeriesManifest.schema_version, 2, 'Visual Job v2 candidates must retain a sealed Visual Job snapshot');
  assert.ok(legacySeriesManifest.artifacts.every(artifact => artifact.artifact_id === 'a'.repeat(64)), 'legacy artifact identities must remain bounded at max output id length');
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
assert.equal(fullScope.scope.selected, 24);
assert.equal(fullScope.scope.total, 24);

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

console.log('Visual Job regression tests passed: v1/v2 compatibility, v3 artifact evidence plans, taxonomy, reviews, reviewed publication, Studio gates, hashes, rollback, public modes, and CLI help.');
