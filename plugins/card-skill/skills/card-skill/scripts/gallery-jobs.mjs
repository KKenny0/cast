#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GALLERY = path.join(ROOT, 'assets', 'gallery');
const MANIFEST = path.join(GALLERY, 'manifest.json');
const README_SHOWCASE = path.join(ROOT, 'assets', 'readme-showcase.png');
const README = path.join(ROOT, 'README.md');
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const update = process.argv.includes('--update');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-gallery-'));
const { publishArtifacts } = require('./lib/publish-artifacts');
const { sha256Bytes } = require('./lib/visual-job');
const { chromium } = require('playwright');

const FIXTURE_ROOTS = [
  path.join(ROOT, 'evals', 'gallery', 'jobs'),
  path.join(ROOT, 'evals', 'gallery', 'creative'),
];

function pngSize(file) {
  const buffer = fs.readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function fixtureFiles() {
  return FIXTURE_ROOTS.flatMap(directory => {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(directory, file));
  }).sort();
}

function publicRecord(item) {
  const { png, ...record } = item;
  return record;
}

function recordKey(item) {
  return `${item.fixture}\0${item.output_basename}`;
}

function assertSameRecord(actual, expected) {
  assert.deepEqual(actual, expected, `gallery manifest drifted for ${expected.fixture} → ${expected.output_basename}`);
}

function dataUri(file, mime) {
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

async function buildReadmeShowcase(rendered) {
  const byBasename = new Map(rendered.map(item => [item.output_basename, item.png]));
  const required = ['editorial-wechat-cover.png', 'poster.png', 'whiteboard.png'];
  for (const basename of required) {
    assert.ok(byBasename.has(basename), `README showcase source is missing: ${basename}`);
  }

  const output = path.join(temp, 'readme-showcase.png');
  const font = dataUri(path.join(ROOT, 'assets', 'fonts', 'DMSans-Variable.ttf'), 'font/ttf');
  const poster = dataUri(byBasename.get('poster.png'), 'image/png');
  const cover = dataUri(byBasename.get('editorial-wechat-cover.png'), 'image/png');
  const whiteboard = dataUri(byBasename.get('whiteboard.png'), 'image/png');
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face{font-family:DM Sans;src:url(${font}) format('truetype');font-weight:100 1000;font-display:block}
*{box-sizing:border-box}
html,body{margin:0;width:2400px;height:1600px;overflow:hidden;background:#f2efe8;color:#282722}
body{font-family:"DM Sans",sans-serif;padding:54px 64px}
.header{height:114px;border-bottom:1px solid #d4cdc0;display:flex;align-items:flex-start;justify-content:space-between;padding-top:2px}
.brand{font-size:34px;font-weight:690;letter-spacing:.08em}
.index{font-size:26px;font-weight:620;letter-spacing:.16em;color:#6a645b;padding-top:6px}
.stage{height:1378px;padding-top:34px;display:grid;grid-template-columns:990px 1fr;gap:40px}
.figure{margin:0;display:flex;flex-direction:column;align-items:flex-start;min-width:0}
.tag{height:44px;display:flex;align-items:flex-start;font-size:24px;font-weight:650;letter-spacing:.075em;color:#625d55}
.tag b{color:#315f8f;margin-right:18px;font-weight:760}
.image-shell{border:1px solid #d4cdc0;background:#f8f5ee;overflow:hidden;display:flex;align-items:center;justify-content:center}
.image-shell img{display:block;width:auto;height:100%;object-fit:contain}
.poster .image-shell{height:1268px;width:952px}
.right{display:flex;flex-direction:column;gap:30px}
.cover .image-shell{height:500px;width:1174px}
.whiteboard{align-items:flex-end}
.whiteboard .tag{width:1084px}
.whiteboard .image-shell{height:744px;width:1084px}
</style></head><body>
<header class="header"><div class="brand">KENNY STYLE</div><div class="index">01—03</div></header>
<main class="stage">
  <figure class="figure poster"><figcaption class="tag"><b>01</b>POSTER</figcaption><div class="image-shell"><img src="${poster}" alt=""></div></figure>
  <section class="right">
    <figure class="figure cover"><figcaption class="tag"><b>02</b>EDITORIAL-IMAGE</figcaption><div class="image-shell"><img src="${cover}" alt=""></div></figure>
    <figure class="figure whiteboard"><figcaption class="tag"><b>03</b>WHITEBOARD</figcaption><div class="image-shell"><img src="${whiteboard}" alt=""></div></figure>
  </section>
</main></body></html>`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 2400, height: 1600 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: output, type: 'png', animations: 'disabled' });
  } finally {
    await browser.close();
  }
  assert.deepEqual(pngSize(output), { width: 2400, height: 1600 }, 'README showcase dimensions drifted');
  return output;
}

try {
  const fixtures = fixtureFiles();
  if (!fixtures.length) throw new Error('gallery has no Visual Job fixtures');
  const rendered = [];

  for (const fixturePath of fixtures) {
    const fixtureName = path.basename(fixturePath, '.json');
    const output = path.join(temp, fixtureName);
    const run = spawnSync(process.execPath, [
      path.join(ROOT, 'scripts', 'render-job.mjs'),
      '--input', fixturePath,
      '--output-dir', output,
      '--json',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, CARD_SKILL_DISABLE_AUTO_UPDATE: '1' },
    });
    if (run.status !== 0) throw new Error(`${path.relative(ROOT, fixturePath)}: ${run.stderr || run.stdout}`);
    const job = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const published = JSON.parse(run.stdout);
    for (const basename of published.outputs) {
      const png = path.join(output, basename);
      const receiptPath = path.join(output, `${path.basename(basename, '.png')}.receipt.json`);
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      const rawHash = sha256Bytes(fs.readFileSync(png));
      assert.equal(receipt.png.sha256, rawHash, `${basename} receipt hash is not the PNG byte hash`);
      rendered.push({
        fixture: path.relative(ROOT, fixturePath).replaceAll(path.sep, '/'),
        output_basename: basename,
        mode: receipt.mode,
        tier: receipt.tier,
        design: receipt.design,
        tone: receipt.tone,
        dpr: 2,
        ...pngSize(png),
        render_contract_sha256: receipt.render_contract_sha256,
        png_sha256: rawHash,
        png,
      });
    }
  }

  rendered.sort((a, b) => recordKey(a).localeCompare(recordKey(b)));
  const expectedManifest = {
    schema_version: 1,
    card_skill_version: VERSION,
    images: rendered.map(publicRecord),
  };
  const stagedReadmeShowcase = await buildReadmeShowcase(rendered);

  if (update) {
    const stagedManifest = path.join(temp, 'manifest.json');
    fs.writeFileSync(stagedManifest, `${JSON.stringify(expectedManifest, null, 2)}\n`);
    publishArtifacts([
      ...rendered.map(item => ({ stagedPath: item.png, finalPath: path.join(GALLERY, item.output_basename) })),
      { stagedPath: stagedManifest, finalPath: MANIFEST },
      { stagedPath: stagedReadmeShowcase, finalPath: README_SHOWCASE },
    ], { allowOverwrite: true });
  } else {
    if (!fs.existsSync(MANIFEST)) throw new Error('gallery manifest is missing; run npm run gallery:update');
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    assert.equal(manifest.schema_version, 1, 'gallery manifest schema version drifted');
    assert.equal(manifest.card_skill_version, VERSION, 'gallery manifest Card Skill version drifted');
    const actualRecords = [...(manifest.images || [])].sort((a, b) => recordKey(a).localeCompare(recordKey(b)));
    assert.equal(actualRecords.length, expectedManifest.images.length, 'gallery manifest has extra or missing records');
    actualRecords.forEach((record, index) => assertSameRecord(record, expectedManifest.images[index]));

    const expectedPngs = new Set(expectedManifest.images.map(item => item.output_basename));
    const trackedPngs = fs.readdirSync(GALLERY).filter(file => file.endsWith('.png'));
    assert.deepEqual(new Set(trackedPngs), expectedPngs, 'assets/gallery contains unmapped or missing PNG files');

    for (const record of expectedManifest.images) {
      const png = path.join(GALLERY, record.output_basename);
      assert.equal(sha256Bytes(fs.readFileSync(png)), record.png_sha256, `${record.output_basename} bytes do not match manifest`);
      assert.deepEqual(pngSize(png), { width: record.width, height: record.height }, `${record.output_basename} dimensions do not match manifest`);
    }

    assert.ok(fs.existsSync(README_SHOWCASE), 'README showcase is missing; run npm run gallery:update');
    assert.deepEqual(pngSize(README_SHOWCASE), { width: 2400, height: 1600 }, 'README showcase dimensions drifted');
    assert.equal(
      sha256Bytes(fs.readFileSync(README_SHOWCASE)),
      sha256Bytes(fs.readFileSync(stagedReadmeShowcase)),
      'README showcase drifted; run npm run gallery:update',
    );

    const readme = fs.readFileSync(README, 'utf8');
    const references = new Set([...readme.matchAll(/assets\/gallery\/([^")\s]+\.png)/g)].map(match => match[1]));
    assert.deepEqual(references, expectedPngs, 'README gallery references and manifest PNG set differ');
  }

  console.log(`Gallery ${update ? 'updated' : 'check passed'}: ${rendered.length} outputs rebuilt and byte-verified through the production path.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
