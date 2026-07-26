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
assert.equal(validate({ ...studio, composition_required: false }).valid, false);

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

const help = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'render-job.mjs'), '--help'], { encoding: 'utf8' });
assert.equal(help.status, 0, help.stderr || help.stdout);

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

console.log('Visual Job regression tests passed: mixed/multi contracts, strict nesting, Studio contract gates, canonical hashes, case folding, rollback, public modes, and CLI help.');
