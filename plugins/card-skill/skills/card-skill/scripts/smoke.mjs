#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-smoke-'));
const outputPath = path.join(harnessDir, 'smoke.png');

function activeRunDirs() {
  return new Set(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('card-skill-') && !name.startsWith('card-skill-smoke-')));
}

function readPngSize(pngPath) {
  const buffer = fs.readFileSync(pngPath);
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Smoke output is not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const beforeRunDirs = activeRunDirs();

function runCard(input, output) {
  return spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'card.js'),
    '--stdin',
    '--output', output,
  ], {
    cwd: ROOT,
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
}

try {
  const result = runCard({ mode: 'big', phrase: 'Runtime smoke', design: 'apple', font_size: 172 }, outputPath);

  assert.equal(result.status, 0, result.stderr || result.stdout || 'card CLI failed');
  assert.equal(result.stdout.trim(), outputPath, 'CLI stdout did not contain only the output path');
  assert.equal(result.stderr, '', 'Single-card success wrote unexpected stderr output');
  assert.deepEqual(readPngSize(outputPath), { width: 2160, height: 2880 });

  const editorialOutputPath = path.join(harnessDir, 'editorial.png');
  const editorial = runCard({
    mode: 'editorial-image',
    title: 'Attention has a boundary',
    use: 'in-article',
    aspect: 'body-3-2',
    editorial_tone: 'technical',
    composition_required: true,
    visual_metaphor: 'A narrow beam illuminates the center of a paper workbench while outer pages fade away.',
    content_html: `
      <section class="attention-workbench">
        <div class="page-field">
          <div class="focus-beam"></div>
          <div class="center-note">ATTENTION</div>
          <div class="faded-sheet sheet-left"></div>
          <div class="faded-sheet sheet-right"></div>
        </div>
      </section>
    `,
    custom_css: `
      .attention-workbench { height: 100%; display: grid; place-items: center; padding: 56px; }
      .page-field { position: relative; width: 78%; height: 66%; border: 1px solid var(--hairline); background: color-mix(in srgb, var(--surface-1) 78%, var(--bg)); }
      .focus-beam { position: absolute; left: 32%; right: 32%; top: 42%; height: 2px; background: var(--accent); transform: rotate(-8deg); }
      .center-note { position: absolute; left: 34%; top: 48%; font: 700 44px/1 var(--mono); color: var(--ink); letter-spacing: 0; }
      .faded-sheet { position: absolute; width: 30%; height: 48%; border: 1px solid var(--hairline); opacity: .34; }
      .sheet-left { left: 8%; top: 24%; transform: rotate(-7deg); }
      .sheet-right { right: 8%; top: 22%; transform: rotate(6deg); }
    `,
  }, editorialOutputPath);
  assert.equal(editorial.status, 0, editorial.stderr || editorial.stdout || 'editorial-image CLI failed');
  assert.equal(editorial.stdout.trim(), editorialOutputPath, 'editorial-image stdout did not contain only the output path');
  assert.equal(editorial.stderr, '', 'editorial-image success wrote unexpected stderr output');
  assert.deepEqual(readPngSize(editorialOutputPath), { width: 2160, height: 1440 });

  const coverOutputPath = path.join(harnessDir, 'editorial-cover.png');
  const cover = runCard({
    mode: 'editorial-image',
    title: 'Memory returns',
    use: 'cover',
    aspect: 'blog-hero',
    editorial_tone: 'reflective',
    cover_motif: 'drawer',
    visual_metaphor: 'A drawer keeps the work that the next task can retrieve.',
  }, coverOutputPath);
  assert.equal(cover.status, 0, cover.stderr || cover.stdout || 'editorial cover CLI failed');
  assert.equal(cover.stdout.trim(), coverOutputPath, 'editorial cover stdout did not contain only the output path');
  assert.equal(cover.stderr, '', 'editorial cover success wrote unexpected stderr output');
  assert.deepEqual(readPngSize(coverOutputPath), { width: 2160, height: 1216 });

  const articleDiagramOutputPath = path.join(harnessDir, 'article-diagram.png');
  const articleDiagram = runCard({
    mode: 'article-diagram',
    family: 'boundary-model',
    title: 'Safety lives at the boundary',
    nodes: [
      { id: 'request', label: 'Request', zone: 'outside' },
      { id: 'harness', label: 'Harness', zone: 'guarded' },
      { id: 'tools', label: 'Tools', zone: 'guarded' },
      { id: 'files', label: 'Filesystem', zone: 'restricted' },
    ],
    zones: [
      { id: 'outside', label: 'Outside request' },
      { id: 'guarded', label: 'Guarded execution' },
      { id: 'restricted', label: 'Restricted resources' },
    ],
    caption: 'The boundary turns intent into controlled action.',
  }, articleDiagramOutputPath);
  assert.equal(articleDiagram.status, 0, articleDiagram.stderr || articleDiagram.stdout || 'article-diagram CLI failed');
  assert.equal(articleDiagram.stdout.trim(), articleDiagramOutputPath, 'article-diagram stdout did not contain only the output path');
  assert.equal(articleDiagram.stderr, '', 'article-diagram success wrote unexpected stderr output');
  assert.deepEqual(readPngSize(articleDiagramOutputPath), { width: 2160, height: 1620 });

  const posterEvidencePath = path.join(ROOT, 'assets', 'gallery', 'article-formula.png');
  const evidencePosterBase = path.join(harnessDir, 'evidence-process.png');
  const evidencePoster = runCard({
    mode: 'poster',
    design: 'stripe',
    kicker: 'EVIDENCE ROUTE',
    title: 'Proof chooses the layout',
    source: 'Owned smoke fixture',
    cards: [
      {
        body: [
          { type: 'media', path: posterEvidencePath, alt: 'Current product evidence', caption: 'One current source, shown at reading scale.', fit: 'cover' },
          { type: 'paragraph', text: 'The evidence occupies the primary field instead of sitting inside another diagram card.' },
        ],
      },
      {
        body: [
          { type: 'heading', text: 'A native three-step path' },
          { type: 'process', steps: [
            { title: 'Collect', text: 'Bind current evidence.' },
            { title: 'Route', text: 'Choose one visual responsibility.' },
            { title: 'Review', text: 'Inspect the rendered PNG.' },
          ] },
        ],
      },
    ],
  }, evidencePosterBase);
  assert.equal(evidencePoster.status, 0, evidencePoster.stderr || evidencePoster.stdout || 'evidence/process poster CLI failed');
  const evidencePosterPaths = [
    path.join(harnessDir, 'evidence-process_1.png'),
    path.join(harnessDir, 'evidence-process_2.png'),
  ];
  assert.deepEqual(evidencePoster.stdout.trim().split(/\r?\n/), evidencePosterPaths, 'poster stdout did not contain the complete series');
  evidencePosterPaths.forEach(pngPath => assert.deepEqual(readPngSize(pngPath), { width: 2160, height: 2880 }));

  const posterCard = text => ({ body: [{ type: 'paragraph', text }] });
  const overflowBase = path.join(harnessDir, 'overflow.png');
  const overflow = runCard({
    mode: 'poster',
    title: 'Transaction smoke',
    cards: [posterCard('first'), posterCard('x '.repeat(20000))],
  }, overflowBase);
  assert.notEqual(overflow.status, 0, 'Expected the second poster card to fail its output check');
  assert.equal(fs.existsSync(path.join(harnessDir, 'overflow_1.png')), false, 'Poster failure leaked the first PNG');
  assert.equal(fs.existsSync(path.join(harnessDir, 'overflow_2.png')), false, 'Poster failure leaked the second PNG');

  const publishBase = path.join(harnessDir, 'publish.png');
  const firstFinal = path.join(harnessDir, 'publish_1.png');
  const secondFinal = path.join(harnessDir, 'publish_2.png');
  fs.writeFileSync(firstFinal, 'original');
  fs.mkdirSync(secondFinal);
  const publish = runCard({
    mode: 'poster',
    title: 'Rollback smoke',
    cards: [posterCard('first'), posterCard('second')],
  }, publishBase);
  assert.notEqual(publish.status, 0, 'Expected an invalid second output path to fail publication');
  assert.equal(fs.readFileSync(firstFinal, 'utf8'), 'original', 'Poster rollback did not restore the first output');
  assert.deepEqual(
    fs.readdirSync(harnessDir).filter(name => name.endsWith('.tmp') || name.endsWith('.bak')),
    [],
    'Poster rollback left staging or backup files behind',
  );

  assert.deepEqual(activeRunDirs(), beforeRunDirs, 'card CLI left a temporary run directory behind');

  console.log('Runtime smoke passed: CLI, editorial-image, article-diagram, evidence/process poster renders, Chromium capture, PNG dimensions, stdout contract, poster transactions, and temp cleanup.');
} finally {
  fs.rmSync(harnessDir, { recursive: true, force: true });
}
