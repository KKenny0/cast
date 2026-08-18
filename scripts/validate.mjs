#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const { validate, EDITORIAL_COVER_MOTIFS } = require('./lib/schema');
const {
  KENNY_STYLE,
  TONE_PALETTE_NAMES,
  getDesign,
  isValidDesignName,
  listDesigns,
  resolveEditorialDesignName,
  resolveDesignNameForInput,
} = require('./lib/designs');
const { validateVisualJob, sha256Bytes } = require('./lib/visual-job');
const { snapshotLocalImage } = require('./lib/file-access');
const { candidateDirectorySha256 } = require('./lib/candidate-snapshot');

const renderers = {
  big: require('./renderers/big'),
  long: require('./renderers/long'),
  whiteboard: require('./renderers/whiteboard'),
  poster: require('./renderers/poster'),
  'editorial-image': require('./renderers/editorial-image'),
  'article-diagram': require('./renderers/article-diagram'),
};

const inputs = {
  big: { mode: 'big', phrase: 'Make it clear' },
  long: { mode: 'long', title: 'Clarity', body: [{ type: 'paragraph', text: 'A useful paragraph.' }] },
  whiteboard: { mode: 'whiteboard', title: 'A model', steps: [{ type: 'annotation', text: 'Start here.' }] },
  poster: { mode: 'poster', title: 'A short series', cards: [{ body: [{ type: 'paragraph', text: 'One idea.' }] }] },
  'editorial-image': { mode: 'editorial-image', title: 'A visual argument' },
  'article-diagram': {
    mode: 'article-diagram',
    family: 'concept-map',
    title: 'A compact relationship',
    nodes: [
      { id: 'input', label: 'Input' },
      { id: 'model', label: 'Model' },
      { id: 'output', label: 'Output' },
    ],
  },
};

const articleDiagramFixtures = {
  'concept-map': {
    mode: 'article-diagram',
    family: 'concept-map',
    title: 'Three parts make the system',
    nodes: [
      { id: 'intent', label: 'Intent' },
      { id: 'memory', label: 'Memory' },
      { id: 'tools', label: 'Tools' },
    ],
    links: [
      { from: 'intent', to: 'memory', label: 'selects' },
      { from: 'memory', to: 'tools', label: 'guides' },
    ],
  },
  'process-flow': {
    mode: 'article-diagram',
    family: 'process-flow',
    title: 'Review before action',
    nodes: [
      { id: 'read', label: 'Read', note: 'Gather facts' },
      { id: 'judge', label: 'Judge', note: 'Choose route' },
      { id: 'act', label: 'Act', note: 'Make change' },
      { id: 'check', label: 'Check', note: 'Verify result' },
    ],
  },
  'boundary-model': {
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
  },
};

function assertVersionSources() {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const skill = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  const skillVersion = skill.match(/^version:\s*"([^"]+)"/m)?.[1];

  assert.match(version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, 'VERSION is not a valid semver value');
  assert.equal(packageJson.version, version, 'package.json version does not match VERSION');
  assert.equal(skillVersion, version, 'SKILL.md version does not match VERSION');
}

function assertPackagedSkill() {
  const packageRoot = path.join(ROOT, 'plugins', 'card-skill');
  const skillRoot = path.join(packageRoot, 'skills', 'card-skill');
  const pluginJsonPath = path.join(packageRoot, '.codex-plugin', 'plugin.json');
  const marketplacePath = path.join(ROOT, '.agents', 'plugins', 'marketplace.json');
  const claudeMarketplacePath = path.join(ROOT, '.claude-plugin', 'marketplace.json');

  for (const requiredPath of [
    pluginJsonPath,
    marketplacePath,
    claudeMarketplacePath,
    path.join(skillRoot, 'SKILL.md'),
    path.join(skillRoot, 'VERSION'),
    path.join(skillRoot, 'package.json'),
    path.join(skillRoot, 'scripts', 'card.js'),
    path.join(skillRoot, 'scripts', 'check-update.mjs'),
    path.join(skillRoot, 'scripts', 'check-output.mjs'),
    path.join(skillRoot, 'scripts', 'render-job.mjs'),
    path.join(skillRoot, 'scripts', 'validate-visual-job.mjs'),
    path.join(skillRoot, 'evals', 'check-assertions.mjs'),
    path.join(skillRoot, 'evals', 'run-fresh-context.mjs'),
    path.join(skillRoot, 'evals', 'evals.json'),
    path.join(skillRoot, 'scripts', 'renderers', 'article-diagram.js'),
    path.join(skillRoot, 'scripts', 'renderers', 'article-diagram-styles.js'),
    path.join(skillRoot, 'scripts', 'renderers', 'article-diagram-utils.js'),
    path.join(skillRoot, 'scripts', 'renderers', 'studio-composition.js'),
    path.join(skillRoot, 'assets', 'big_template.html'),
    path.join(skillRoot, 'assets', 'fonts'),
    path.join(skillRoot, 'schemas', 'big.json'),
    path.join(skillRoot, 'schemas', 'article-diagram.json'),
    path.join(skillRoot, 'schemas', 'infograph.json'),
    path.join(skillRoot, 'schemas', 'comic.json'),
    path.join(skillRoot, 'schemas', 'sketchnote.json'),
    path.join(skillRoot, 'schemas', 'visual-job.json'),
    path.join(skillRoot, 'schemas', 'visual-review.json'),
    path.join(skillRoot, 'references', 'design-index.md'),
    path.join(skillRoot, 'references', 'codex-inline-preview.md'),
    path.join(skillRoot, 'references', 'mode-article-diagram.md'),
    path.join(skillRoot, 'references', 'mode-poster.md'),
    path.join(skillRoot, 'references', 'source-material.md'),
    path.join(skillRoot, 'references', 'source-open-source-tool.md'),
    path.join(skillRoot, 'references', 'source-weread.md'),
  ]) {
    assert.ok(fs.existsSync(requiredPath), `Packaged skill is missing ${path.relative(ROOT, requiredPath)}`);
  }

  const rootVersion = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const packagedVersion = fs.readFileSync(path.join(skillRoot, 'VERSION'), 'utf8').trim();
  const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
  const marketplaceJson = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  const marketplaceEntry = marketplaceJson.plugins?.find(plugin => plugin.name === 'card-skill');
  const claudeMarketplaceJson = JSON.parse(fs.readFileSync(claudeMarketplacePath, 'utf8'));
  const claudeMarketplaceEntry = claudeMarketplaceJson.plugins?.find(plugin => plugin.name === 'card-skill');

  assert.equal(packagedVersion, rootVersion, 'packaged VERSION does not match root VERSION');
  assert.equal(pluginJson.name, 'card-skill', 'plugin.json name is not card-skill');
  assert.equal(pluginJson.version, rootVersion, 'plugin.json version does not match VERSION');
  assert.equal(pluginJson.skills, './skills/', 'plugin.json skills path must point at ./skills/');
  assert.ok(marketplaceEntry, 'marketplace.json is missing card-skill entry');
  assert.equal(marketplaceEntry.source?.path, './plugins/card-skill', 'marketplace entry must point at ./plugins/card-skill');
  assert.equal(claudeMarketplaceJson.name, 'card-skill', 'Claude marketplace name is not card-skill');
  assert.ok(claudeMarketplaceEntry, 'Claude marketplace is missing card-skill entry');
  assert.equal(claudeMarketplaceEntry.version, rootVersion, 'Claude marketplace version does not match VERSION');
  assert.equal(claudeMarketplaceEntry.source, './plugins/card-skill', 'Claude marketplace must reuse ./plugins/card-skill');
  assert.deepEqual(claudeMarketplaceEntry.skills, ['./skills/'], 'Claude marketplace skills path must point at ./skills/');
  assert.equal(claudeMarketplaceEntry.strict, false, 'Claude marketplace must define the plugin with strict: false');

  for (const relativePath of [
    'SKILL.md',
    'README.md',
    'README.zh-CN.md',
    'package.json',
    'package-lock.json',
    'scripts/card.js',
    'scripts/check-update.mjs',
    'scripts/check-output.mjs',
    'scripts/render-job.mjs',
    'scripts/gallery-jobs.mjs',
    'scripts/validate-visual-job.mjs',
    'scripts/setup-runtime.mjs',
    'scripts/lib/update-state.js',
    'scripts/lib/visual-job.js',
    'scripts/lib/visual-review.js',
    'scripts/lib/file-access.js',
    'scripts/lib/publish-artifacts.js',
    'scripts/validate.mjs',
    'evals/check-assertions.mjs',
    'evals/check-job-assertions.mjs',
    'evals/run-fresh-context.mjs',
    'evals/agent-cases.json',
    'evals/evals.json',
    'scripts/lib/schema.js',
    'scripts/renderers/poster.js',
    'scripts/renderers/article-diagram.js',
    'scripts/renderers/article-diagram-styles.js',
    'scripts/renderers/article-diagram-utils.js',
    'scripts/renderers/studio-composition.js',
    'schemas/big.json',
    'schemas/poster.json',
    'schemas/editorial-image.json',
    'schemas/article-diagram.json',
    'schemas/infograph.json',
    'schemas/comic.json',
    'schemas/sketchnote.json',
    'schemas/visual-job.json',
    'schemas/visual-review.json',
    'references/design-index.md',
    'references/codex-inline-preview.md',
    'references/mode-article-diagram.md',
    'references/mode-poster.md',
    'references/source-material.md',
    'references/source-open-source-tool.md',
    'references/source-weread.md',
    'references/visual-job.md',
    'references/eval-protocol.md',
    'docs/current-architecture.md',
    'assets/capture4k.js',
    'assets/big_template.html',
    'assets/poster_template.html',
  ]) {
    const rootContent = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    const packagedContent = fs.readFileSync(path.join(skillRoot, relativePath), 'utf8');
    assert.equal(packagedContent, rootContent, `packaged ${relativePath} is stale; run npm run package-skill`);
  }
}

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function readOutputs(result) {
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.map(output => stripComments(fs.readFileSync(output.htmlPath, 'utf8')));
}

function assertUnbranded(html, mode) {
  assert.doesNotMatch(html, /class="colophon"/, `${mode} rendered an empty colophon`);
  assert.doesNotMatch(html, /assets\/logo\.png/, `${mode} injected the bundled logo by default`);
  assert.doesNotMatch(html, />\s*card\s*</i, `${mode} injected the card brand by default`);
  assert.doesNotMatch(html, /\{\{[^}]+\}\}/, `${mode} left an active placeholder`);
}

function runOutputCheck(htmlPath, output, allowedFiles = []) {
  const args = [
    path.join(ROOT, 'scripts', 'check-output.mjs'),
    '--html', htmlPath,
    '--width', String(output.captureWidth),
    '--height', String(output.captureHeight),
    '--skip-png',
    '--json',
  ];
  for (const file of allowedFiles) args.push('--allow-file', file);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });

  let report = null;
  try {
    report = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    // Preserve raw stdout/stderr in the assertion below.
  }

  return { result, report };
}

function readComputedStyles(htmlPath, selector, property) {
  const script = `
    const { chromium } = require('playwright');
    const [targetHtml, targetSelector, targetProperty] = process.argv.slice(1);
    (async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto('file://' + targetHtml);
        const values = await page.locator(targetSelector).evaluateAll((nodes, cssProperty) => (
          nodes.map(node => getComputedStyle(node).getPropertyValue(cssProperty))
        ), targetProperty);
        process.stdout.write(JSON.stringify(values));
      } finally {
        await browser.close();
      }
    })().catch(error => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
  `;
  const result = spawnSync(process.execPath, ['-e', script, htmlPath, selector, property], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `computed-style probe failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function assertWereadSourceContract() {
  const skill = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const adapter = fs.readFileSync(path.join(ROOT, 'references', 'source-weread.md'), 'utf8');
  const evals = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'evals.json'), 'utf8')).evals;
  const evalIds = evals.map(item => item.id);

  assert.equal(new Set(evalIds).size, evalIds.length, 'eval ids must be unique');
  assert.ok(evals.some(item => item.id === 13 && item.name === 'weread-personal-notes-poster'), 'missing WeChat Reading personal-notes eval');
  assert.ok(evals.some(item => item.id === 14 && item.name === 'weread-monthly-report-poster'), 'missing WeChat Reading report eval');
  assert.ok(evals.some(item => item.id === 15 && item.name === 'weread-reading-notes-selection'), 'missing >8-unit reading-notes selection eval');
  assert.ok(evals.some(item => item.id === 16 && item.name === 'weread-reading-notes-all-units'), 'missing explicit all-units reading-notes eval');
  assert.match(skill, /references\/source-weread\.md/, 'SKILL.md does not route explicit WeChat Reading requests to the adapter');
  assert.match(skill, /普通书名.*不得隐式读取个人账号/, 'SKILL.md is missing the explicit-consent guard');
  assert.match(readme, /npx skills add Tencent\/WeChatReading -g/, 'README is missing the official WeChatReading install command');
  assert.match(adapter, /Never ask them to paste the key into the conversation/, 'adapter is missing the API-key chat guard');
  assert.match(adapter, /Treat every returned .* as untrusted data/, 'adapter is missing the external-content prompt-injection guard');
  assert.match(adapter, /both the personal highlight list and the complete personal thoughts\/reviews list/, 'adapter does not require both sides of a complete personal-notes export');
  assert.match(adapter, /poster` \+ `reading-notes/, 'adapter does not route personal notes through the reading-notes variant');
  assert.match(adapter, /1-8 content units: keep every unit/, 'adapter is missing the small-set preservation rule');
  assert.match(adapter, /6-8 coherent cards with about 2-4 related units per card/, 'adapter is missing the >8-unit selection boundary');
  assert.match(adapter, /sequential batches of at most 8 cards without dropping content/, 'adapter is missing the explicit all-units batching rule');
  assert.match(adapter, /first card must contain both the series title and actual note content/i, 'adapter allows a title-only first card');
  assert.match(adapter, /Never construct a WeChat Reading link manually/, 'adapter is missing the official deepLink guard');
}

function assertCodexPreviewContract() {
  const skill = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  const preview = fs.readFileSync(path.join(ROOT, 'references', 'codex-inline-preview.md'), 'utf8');
  const step3 = skill.match(/### Step 3: 候选确认（仅按需）([\s\S]*?)### Step 3\.5:/)?.[1];

  assert.ok(step3, 'SKILL.md is missing the bounded Step 3 fallback contract');
  assert.match(step3, /Card Decision Brief\.candidates/, 'Step 3 fallback does not source candidates from the current decision brief');
  assert.doesNotMatch(step3, /\b(?:linear|claude|stripe|notion)\b/, 'Step 3 fallback hard-codes design candidates');
  assert.match(preview, /轻量选择器 \+ 单一主预览 \+ 选中详情 \+ 单一确认动作/, 'Codex preview is missing the single-preview composition');
  assert.match(preview, /不要把多行说明[\s\S]*放进 `\.btn` \/ `\.btn-block`/, 'Codex preview is missing the rich-button overflow guard');
  assert.match(preview, /window\.openai\.sendFollowUpMessage/, 'Codex preview is missing the follow-up handoff contract');
  assert.match(preview, /composition_required: true/, 'Codex preview does not mark custom-composition candidates as executable contracts');
  assert.match(preview, /主预览如果已经画出了默认 scaffold 中不存在的对象或关系/, 'Codex preview is missing the preview-to-render fidelity rule');
  assert.match(skill, /composition_required.*content_html.*custom_css/, 'SKILL.md does not enforce selected custom compositions before Step 4 rendering');
}

function assertProjectAgentContract() {
  const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');

  assert.match(agents, /repository root is the source of truth/i, 'AGENTS.md is missing the root source-of-truth rule');
  assert.match(agents, /generated installable mirror/i, 'AGENTS.md is missing the packaged mirror boundary');
  assert.match(agents, /npm run package-skill[\s\S]*npm test[\s\S]*npm run smoke[\s\S]*git diff --check/, 'AGENTS.md is missing the required verification sequence');
  assert.match(agents, /composition_required: true/, 'AGENTS.md is missing the executable editorial composition contract');
}

function assertOpenSourceShowcase() {
  const showcaseRoot = path.join(ROOT, 'showcases', 'open-source-tool');
  const assetRoot = path.join(ROOT, 'assets', 'open-source-tool');
  const packageAssetRoot = path.join(ROOT, 'plugins', 'card-skill', 'skills', 'card-skill', 'assets', 'open-source-tool');
  const manifestPath = path.join(showcaseRoot, 'gallery-manifest.json');
  const expected = [
    'tool-launch-1.png', 'tool-launch-2.png', 'tool-launch-3.png', 'tool-launch-4.png',
    'tool-cli-1.png', 'tool-cli-2.png', 'tool-cli-3.png',
  ];
  for (const required of [
    path.join(showcaseRoot, 'render.mjs'),
    path.join(showcaseRoot, 'README.md'),
    path.join(showcaseRoot, 'fixtures', 'launch-profile.json'),
    path.join(showcaseRoot, 'fixtures', 'cli-profile.json'),
    manifestPath,
  ]) assert.ok(fs.existsSync(required), `open-source showcase is missing ${path.relative(ROOT, required)}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schema_version, 1, 'open-source showcase manifest version drifted');
  assert.deepEqual(Object.keys(manifest.fixture_sha256 || {}).sort(), ['cli', 'launch'], 'open-source showcase fixture hash keys drifted');
  const fixtureSha256 = file => sha256Bytes(Buffer.from(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')));
  assert.equal(manifest.fixture_sha256.launch, fixtureSha256(path.join(showcaseRoot, 'fixtures', 'launch-profile.json')), 'launch fixture changed without rebuilding the showcase');
  assert.equal(manifest.fixture_sha256.cli, fixtureSha256(path.join(showcaseRoot, 'fixtures', 'cli-profile.json')), 'CLI fixture changed without rebuilding the showcase');
  assert.deepEqual(manifest.images.map(item => item.basename).sort(), [...expected].sort(), 'open-source showcase manifest must map exactly seven adaptive cards');
  assert.equal(manifest.images.filter(item => item.output_id === 'launch-series').length, 4, 'launch showcase must contain four cards');
  assert.equal(manifest.images.filter(item => item.output_id === 'cli-series').length, 3, 'CLI showcase must contain three cards');
  let totalBytes = 0;
  for (const record of manifest.images) {
    const rootPng = path.join(assetRoot, record.basename);
    const packagedPng = path.join(packageAssetRoot, record.basename);
    assert.ok(fs.existsSync(rootPng), `open-source showcase PNG is missing: ${record.basename}`);
    assert.ok(fs.existsSync(packagedPng), `packaged open-source showcase PNG is missing: ${record.basename}`);
    const rootBytes = fs.readFileSync(rootPng);
    const packagedBytes = fs.readFileSync(packagedPng);
    assert.equal(Buffer.compare(rootBytes, packagedBytes), 0, `packaged open-source showcase PNG is stale: ${record.basename}`);
    assert.equal(sha256Bytes(rootBytes), record.sha256, `open-source showcase hash drifted: ${record.basename}`);
    assert.equal(rootBytes.readUInt32BE(16), 2160, `${record.basename} width must be 2160`);
    assert.equal(rootBytes.readUInt32BE(20), 2880, `${record.basename} height must be 2880`);
    assert.equal(rootBytes.length, record.bytes, `${record.basename} byte count drifted`);
    totalBytes += rootBytes.length;
  }
  assert.ok(totalBytes <= 5 * 1024 * 1024, 'open-source showcase exceeds the 5 MiB PNG budget');
  const actualPngs = fs.readdirSync(assetRoot).filter(file => file.endsWith('.png')).sort();
  assert.deepEqual(actualPngs, [...expected].sort(), 'assets/open-source-tool contains unmapped or missing PNG files');
  assert.equal(fs.existsSync(path.join(ROOT, 'plugins', 'card-skill', 'skills', 'card-skill', 'showcases')), false, 'root-only showcase scripts leaked into the packaged skill');
  const residue = [showcaseRoot, assetRoot].flatMap(directory => fs.readdirSync(directory, { recursive: true }).map(entry => String(entry))).filter(entry => /\.(?:tmp|bak)$/i.test(entry));
  assert.deepEqual(residue, [], 'open-source showcase contains transaction residue');
}

function assertCardBenchDelegationContract() {
  const skill = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  const protocol = fs.readFileSync(path.join(ROOT, 'references', 'eval-protocol.md'), 'utf8');
  assert.match(skill, /任何 `npm run eval:cardbench`[\s\S]*低成本独立执行单元[\s\S]*主交互上下文只接收进度与最终报告/, 'SKILL.md does not delegate every CardBench run away from the main interactive context');
  assert.doesNotMatch(skill, /gpt-5\.6-terra|medium reasoning/, 'SKILL.md hard-codes a host-specific CardBench model');
  assert.match(protocol, /low-cost independent execution facility[\s\S]*Do not parallelize case or Critic model calls[\s\S]*obtain user confirmation/, 'eval protocol is missing the portable delegated CardBench boundary');
}

function runCardCli(input, outputName, expectedCount = 1) {
  const inputPath = path.join(tmpDir, `${outputName}.json`);
  const outputPath = path.join(tmpDir, `${outputName}.png`);
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2), 'utf8');
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'card.js'),
    '--input', inputPath,
    '--output', outputPath,
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, `${outputName} CLI render failed:\n${result.stdout}\n${result.stderr}`);
  if (expectedCount === 1) {
    assert.ok(fs.existsSync(outputPath), `${outputName} CLI render did not create a PNG`);
    assert.ok(fs.statSync(outputPath).size > 1000, `${outputName} CLI render created an empty-looking PNG`);
    return outputPath;
  }

  const outputPaths = Array.from({ length: expectedCount }, (_, i) =>
    path.join(tmpDir, `${outputName}_${i + 1}.png`));
  outputPaths.forEach((pngPath, i) => {
    assert.ok(fs.existsSync(pngPath), `${outputName} CLI render did not create PNG ${i + 1}/${expectedCount}`);
    assert.ok(fs.statSync(pngPath).size > 1000, `${outputName} CLI render created an empty-looking PNG ${i + 1}/${expectedCount}`);
  });
  assert.equal(result.stdout.trim().split(/\r?\n/).length, expectedCount, `${outputName} stdout did not list ${expectedCount} output paths`);
  return outputPaths;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-validate-'));

try {
  const maxCandidateDir = path.join(tmpDir, 'max-candidate-files');
  fs.mkdirSync(maxCandidateDir);
  for (let index = 0; index < 82; index += 1) fs.writeFileSync(path.join(maxCandidateDir, `${String(index).padStart(4, '0')}.json`), 'x');
  assert.match(candidateDirectorySha256(maxCandidateDir), /^[a-f0-9]{64}$/, 'candidate hash rejected the maximum legal v1/v2 reviewed artifact file set');
  fs.writeFileSync(path.join(maxCandidateDir, 'overflow.json'), 'x');
  assert.throws(() => candidateDirectorySha256(maxCandidateDir), /1 to 82 files/, 'candidate hash accepted a file set larger than every valid Visual Job can produce');
  fs.rmSync(maxCandidateDir, { recursive: true, force: true });
  assertVersionSources();
  assertPackagedSkill();
  assertOpenSourceShowcase();
  assertWereadSourceContract();
  assertCodexPreviewContract();
  assertProjectAgentContract();
  assertCardBenchDelegationContract();
  assert.equal(renderers.big.calcFontSize('能重建<br>才算能验证'), '176px', 'big mode must fit the longest explicit CJK line');
  assert.equal(renderers.big.resolveFontSize('能重建<br>才算能验证', 190), '176px', 'explicit big font size must not bypass the line-fit cap');
  assert.equal(renderers.big.calcFontSize('Make<br>clear'), '220px', 'short Latin big phrases should keep the large display size');
  assert.ok(renderers.poster.calcPosterTitleFontSize('先确认，再选择，最后检查') < 92, 'poster title must shrink before creating an orphan line');
  assert.match(
    validate({ ...inputs.big, hidden: 'renderer ignores this' }).errors.join('\n'),
    /Unknown field for big: "hidden"/,
    'runtime validation must reject renderer-ignored top-level fields',
  );
  assert.match(
    validate({ ...inputs.long, body: [{ type: 'paragraph', text: 'Visible', label: 'Never rendered' }] }).errors.join('\n'),
    /unknown field "label" for paragraph/,
    'long runtime validation must reject renderer-ignored variant fields',
  );
  assert.match(
    validate({ ...inputs.long, body: [{ type: 'paragraph', text: 'Visible', dropcap: 'yes' }] }).errors.join('\n'),
    /dropcap must be boolean/,
    'long runtime validation must reject non-boolean paragraph options',
  );
  assert.match(
    validate({ ...inputs.long, body: [{ type: 'layer_card', text: 42 }] }).errors.join('\n'),
    /requires non-empty "text"/,
    'long runtime validation must reject non-string body text',
  );
  assert.equal(
    renderers.poster.isSparsePosterCard({ body: [{ type: 'heading', text: '二' }, { type: 'highlight', text: '再选择视觉结构' }] }),
    true,
    'short poster series cards must opt into the deliberate sparse composition',
  );
  assert.equal(
    renderers.poster.isSparsePosterCard({ body: [{ type: 'heading', text: '先确认来源' }, { type: 'paragraph', text: '记录出处、作者与上下文，让后续判断建立在可追溯的信息上。' }] }),
    true,
    'one-step poster cards must keep their title and explanation in one compact composition',
  );
  assert.equal(
    renderers.poster.isSparsePosterCard({ body: [{ type: 'paragraph', text: 'This paragraph is deliberately long enough to use the regular poster composition without sparse scaling.' }] }),
    false,
    'ordinary poster content must keep the regular composition',
  );
  assert.equal(
    renderers.poster.isDenseMediaCopyCard({ body: [
      { type: 'media', path: 'fixture.png', alt: 'Fixture' },
      { type: 'paragraph', text: 'One bounded note.' },
    ] }),
    false,
    'short media copy must keep the balanced composition',
  );
  assert.equal(
    renderers.poster.isDenseMediaCopyCard({ body: [
      { type: 'heading', text: 'Dense evidence' },
      { type: 'media', path: 'fixture.png', alt: 'Fixture' },
      { type: 'paragraph', text: 'The explanation remains part of the evidence card.' },
      { type: 'data_row', key: 'One', value: '1' },
      { type: 'data_row', key: 'Two', value: '2' },
      { type: 'data_row', key: 'Three', value: '3' },
    ] }),
    true,
    'three data rows must opt media copy into the dense composition',
  );

  const measureViewportPath = path.join(tmpDir, 'capture-measure-viewport.html');
  fs.writeFileSync(measureViewportPath, '<!doctype html><style>*{box-sizing:border-box}html,body{margin:0}.probe{width:calc(100vw - 20px);height:10px}</style><div class="probe" data-measure-id="probe"></div>', 'utf8');
  const measureViewportResult = spawnSync(process.execPath, [
    path.join(ROOT, 'assets', 'capture4k.js'),
    measureViewportPath,
    '--measure',
    '1080',
    '240',
    '1',
  ], { encoding: 'utf8' });
  assert.equal(measureViewportResult.status, 0, `capture4k measure viewport check failed:\n${measureViewportResult.stderr}`);
  const measureViewportBoxes = JSON.parse(measureViewportResult.stdout);
  assert.equal(measureViewportBoxes.probe.width, 1060, 'capture4k --measure parsed the viewport width from the wrong argument position');
  const oversizedCapture = spawnSync(process.execPath, [
    path.join(ROOT, 'assets', 'capture4k.js'), measureViewportPath, path.join(tmpDir, 'oversized-capture.png'), '5000', '5000', '4',
  ], { encoding: 'utf8' });
  assert.notEqual(oversizedCapture.status, 0, 'capture4k accepted an unbounded capture contract');
  assert.match(oversizedCapture.stderr, /Capture width and height|output pixels/);
  const captureSource = fs.readFileSync(path.join(ROOT, 'assets', 'capture4k.js'), 'utf8');
  const checkerSource = fs.readFileSync(path.join(ROOT, 'scripts', 'check-output.mjs'), 'utf8');
  const publisherSource = fs.readFileSync(path.join(ROOT, 'scripts', 'publish-reviewed-job.mjs'), 'utf8');
  assert.match(captureSource, /Content-Security-Policy[^\n]+LOCKED_DOCUMENT_CSP/, 'capture must apply a response-header CSP before candidate markup executes');
  assert.match(checkerSource, /Content-Security-Policy[^\n]+LOCKED_DOCUMENT_CSP/, 'output checker must apply a response-header CSP before candidate markup executes');
  assert.match(captureSource, /script-src 'none'/, 'capture CSP must block candidate scripts');
  assert.match(checkerSource, /frame-src 'none'/, 'output checker CSP must block candidate frames');
  assert.match(captureSource, /font-src file:/, 'capture CSP must restrict fonts to the packaged font directory');
  assert.doesNotMatch(captureSource, /font-src data:/, 'capture CSP must not parse candidate-supplied data fonts');
  assert.doesNotMatch(captureSource, /replace\(\/<script\\b/, 'capture must not rewrite visible evidence text while disabling scripts');
  assert.doesNotMatch(checkerSource, /replace\(\/<script\\b/, 'output checker must not rewrite visible evidence text while disabling scripts');
  assert.doesNotMatch(captureSource, /fullpage \? 5000/, 'capture must not allocate an unbudgeted full-page viewport');
  assert.doesNotMatch(checkerSource, /fullpage \? 5000/, 'output checker must not allocate an unbudgeted full-page viewport');
  assert.match(checkerSource, /domNodeCount > 10000/, 'output checker must bound hostile composition DOM size before full inspection');
  assert.match(captureSource, /document\.getAnimations\(\).*animation\.cancel/, 'capture must freeze CSS animations independent of CSS token spelling');
  assert.match(checkerSource, /pauseAnimations/, 'output checker must freeze SVG animation timelines');
  assert.match(publisherSource, /timeout:\s*subprocessTimeout\(\)/g, 'reviewed publication subprocesses must use per-process and job-wide hard timeouts');
  assert.match(publisherSource, /10 \* 60 \* 1000/, 'reviewed publication must have a bounded aggregate deadline');

  for (const [mode, input] of Object.entries(inputs)) {
    const validation = validate(input);
    assert.equal(validation.valid, true, `${mode} smoke input failed schema validation: ${validation.errors.join(', ')}`);

    const target = mode === 'poster' ? tmpDir : path.join(tmpDir, `${mode}.html`);
    const rendered = renderers[mode].render(input, target);
    for (const html of readOutputs(rendered)) assertUnbranded(html, mode);
  }

  const whiteboardChainPath = path.join(tmpDir, 'whiteboard-four-node-chain.html');
  const whiteboardChainOutput = renderers.whiteboard.render({
    mode: 'whiteboard',
    title: '事实约束选择，回执更新事实',
    steps: [{ type: 'chain', nodes: [
      { text: '01｜事实约束选择', highlight: true },
      { text: '02｜选择决定动作' },
      { text: '03｜动作产生回执' },
      { text: '04｜回执更新事实', highlight: true },
    ] }],
  }, whiteboardChainPath);
  assert.match(fs.readFileSync(whiteboardChainPath, 'utf8'), /class="chain-segment highlight"/, 'whiteboard chain lost its bounded semantic nodes');
  const whiteboardChainCheck = runOutputCheck(whiteboardChainPath, whiteboardChainOutput);
  assert.equal(whiteboardChainCheck.report?.pass, true, 'four-node whiteboard chain must wrap inside the capture viewport');

  const logoPath = path.join(tmpDir, 'example " onerror="attack.png');
  const logoUrl = pathToFileURL(logoPath).href;
  for (const [mode, input] of Object.entries(inputs)) {
    const target = mode === 'poster' ? tmpDir : path.join(tmpDir, `branded-${mode}.html`);
    const rendered = renderers[mode].render({
      ...input,
      brand_name: 'Example Studio',
      logo: logoPath,
      ...(mode === 'poster' || mode === 'editorial-image' || mode === 'article-diagram' ? { source: 'Example source' } : {}),
    }, target);

    for (const html of readOutputs(rendered)) {
      assert.match(html, /class="colophon"/, `${mode} dropped opt-in branding`);
      assert.match(html, />Example Studio</, `${mode} dropped the brand name`);
      assert.ok(html.includes(logoUrl), `${mode} did not encode the logo as a file URL`);
      assert.doesNotMatch(html, /"\s+onerror=/i, `${mode} allowed logo-path attribute injection`);
      if (mode === 'poster' || mode === 'editorial-image' || mode === 'article-diagram') {
        assert.match(html, />Example source</, `${mode} dropped the source`);
      }
    }
  }

  const sourceOnlyPath = path.join(tmpDir, 'source-only-editorial.html');
  renderers['editorial-image'].render({ ...inputs['editorial-image'], source: 'Source only' }, sourceOnlyPath);
  const sourceOnlyHtml = stripComments(fs.readFileSync(sourceOnlyPath, 'utf8'));
  assert.match(sourceOnlyHtml, /class="colophon"/);
  assert.match(sourceOnlyHtml, />Source only</);
  assert.doesNotMatch(sourceOnlyHtml, /class="who"/);

  const articleSourceOnlyPath = path.join(tmpDir, 'source-only-article-diagram.html');
  renderers['article-diagram'].render({ ...inputs['article-diagram'], source: 'Source only' }, articleSourceOnlyPath);
  const articleSourceOnlyHtml = stripComments(fs.readFileSync(articleSourceOnlyPath, 'utf8'));
  assert.match(articleSourceOnlyHtml, /class="colophon"/);
  assert.match(articleSourceOnlyHtml, />Source only</);
  assert.doesNotMatch(articleSourceOnlyHtml, /class="who"/);

  const posterSourceOnlyDir = path.join(tmpDir, 'source-only-poster');
  fs.mkdirSync(posterSourceOnlyDir, { recursive: true });
  const posterSourceOnly = renderers.poster.render({ ...inputs.poster, source: 'Source only' }, posterSourceOnlyDir);
  const posterSourceOnlyHtml = readOutputs(posterSourceOnly).at(-1);
  assert.match(posterSourceOnlyHtml, /class="colophon"/);
  assert.match(posterSourceOnlyHtml, /class="source-mark">Source only</);
  assert.doesNotMatch(posterSourceOnlyHtml, /class="brand-mark"/);

  const posterEscapedSourceDir = path.join(tmpDir, 'escaped-source-poster');
  fs.mkdirSync(posterEscapedSourceDir, { recursive: true });
  const posterEscapedSource = renderers.poster.render({ ...inputs.poster, source: '<script>alert("source")</script>' }, posterEscapedSourceDir);
  const posterEscapedSourceHtml = readOutputs(posterEscapedSource).at(-1);
  assert.match(posterEscapedSourceHtml, /&lt;script&gt;alert\(&quot;source&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(posterEscapedSourceHtml, /<script>alert\("source"\)<\/script>/);

  const posterMediaSourceHtml = path.join(tmpDir, 'raw-evidence.html');
  const posterMediaPath = path.join(tmpDir, 'raw-evidence.png');
  fs.writeFileSync(posterMediaSourceHtml, `<!doctype html><html><style>
    *{box-sizing:border-box}html,body{margin:0;width:1080px;height:540px;background:#16191f;color:#f6f1e8;font-family:Arial,sans-serif}
    main{height:100%;padding:56px 64px;display:grid;grid-template-columns:180px 1fr;gap:52px}
    nav{border-right:1px solid #424851;color:#e46f32;font:700 22px/1.8 monospace}
    h1{font-size:42px;margin:0 0 28px}code{display:block;padding:24px 28px;background:#0d0f13;color:#ffb080;font:25px/1.5 monospace}
    p{font-size:25px;line-height:1.5;color:#b9c0ca}
  </style><main><nav>FILES<br>CONFIG<br>OUTPUT</nav><section><h1>Repository packed</h1><code>npx example-tool@latest</code><p>31 source records written to output.xml</p></section></main></html>`);
  const rawEvidenceCapture = spawnSync(process.execPath, [
    path.join(ROOT, 'assets', 'capture4k.js'),
    posterMediaSourceHtml, posterMediaPath, '1080', '540', '1',
  ], { encoding: 'utf8' });
  assert.equal(rawEvidenceCapture.status, 0, rawEvidenceCapture.stderr || rawEvidenceCapture.stdout);
  const snapshotProbe = snapshotLocalImage(posterMediaPath, path.join(tmpDir, 'raw-evidence-snapshot.png'));
  assert.equal(snapshotProbe.width, 1080, 'poster media snapshot did not preserve image width');
  assert.equal(snapshotProbe.height, 540, 'poster media snapshot did not preserve image height');
  assert.match(snapshotProbe.sha256, /^[a-f0-9]{64}$/, 'poster media snapshot did not produce a SHA-256 digest');
  const duplicateImageHtml = path.join(tmpDir, 'duplicate-sealed-image.html');
  const posterMediaDataUrl = `data:image/png;base64,${fs.readFileSync(posterMediaPath).toString('base64')}`;
  fs.writeFileSync(duplicateImageHtml, `<!doctype html><html><style>html,body{margin:0;width:1080px;height:800px}body{display:flex}img{width:50%;height:100%;object-fit:contain}</style><body><img src="${posterMediaDataUrl}"><img src="${posterMediaDataUrl}"></body></html>`);
  const duplicateImageCheck = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'check-output.mjs'), '--html', duplicateImageHtml,
    '--width', '1080', '--height', '800', '--skip-png', '--sealed-images',
    '--expect-image-sha', snapshotProbe.sha256, '--expect-image-sha', snapshotProbe.sha256, '--json',
  ], { encoding: 'utf8', env: { ...process.env, CARD_SKILL_SEALED_CAPTURE: '1' } });
  assert.equal(duplicateImageCheck.status, 0, `sealed-image checker treated duplicate approved digests as different resources: ${duplicateImageCheck.stdout}\n${duplicateImageCheck.stderr}`);
  const filterImageHtml = path.join(tmpDir, 'unsealed-filter-image.html');
  const filterSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><filter id="f"><feFlood flood-color="red"/></filter></svg>').toString('base64');
  fs.writeFileSync(filterImageHtml, `<!doctype html><html><style>html,body{margin:0;width:1080px;height:800px}.subject{width:100%;height:100%;background:#eee;filter:url("\\64 ata:image/svg+xml;base64,${filterSvg}#f")}</style><body><div class="subject"></div></body></html>`);
  const filterImageCheck = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'check-output.mjs'), '--html', filterImageHtml,
    '--width', '1080', '--height', '800', '--skip-png', '--sealed-images', '--json',
  ], { encoding: 'utf8', env: { ...process.env, CARD_SKILL_SEALED_CAPTURE: '1' } });
  assert.notEqual(filterImageCheck.status, 0, 'sealed-image checker accepted an unsealed CSS filter resource');
  assert.match(filterImageCheck.stdout, /safety\.unsealed_image_resource/);
  const svgSubresourceHtml = path.join(tmpDir, 'unsealed-svg-subresource.html');
  fs.writeFileSync(svgSubresourceHtml, `<!doctype html><html><style>html,body,svg{margin:0;width:1080px;height:800px}</style><body><svg xmlns="http://www.w3.org/2000/svg"><filter id="f"><feImage href="data&#58;image/png;base64,${fs.readFileSync(posterMediaPath).toString('base64')}"/></filter><rect width="1080" height="800" filter="url(#f)"/></svg></body></html>`);
  const svgSubresourceCheck = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'check-output.mjs'), '--html', svgSubresourceHtml,
    '--width', '1080', '--height', '800', '--skip-png', '--sealed-images', '--json',
  ], { encoding: 'utf8', env: { ...process.env, CARD_SKILL_SEALED_CAPTURE: '1' } });
  assert.notEqual(svgSubresourceCheck.status, 0, 'sealed-image checker accepted an entity-encoded SVG feImage resource');
  assert.match(svgSubresourceCheck.stdout, /safety\.unsealed_image_resource/);
  const anchorHtml = path.join(tmpDir, 'sealed-anchor.html');
  fs.writeFileSync(anchorHtml, '<!doctype html><html><style>html,body{margin:0;width:1080px;height:800px}</style><body><a href="https://example.com">Visible source link</a></body></html>');
  const anchorCheck = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'check-output.mjs'), '--html', anchorHtml,
    '--width', '1080', '--height', '800', '--skip-png', '--sealed-images', '--json',
  ], { encoding: 'utf8', env: { ...process.env, CARD_SKILL_SEALED_CAPTURE: '1' } });
  assert.equal(anchorCheck.status, 0, `sealed-image checker mistook a visible hyperlink for an image resource: ${anchorCheck.stdout}\n${anchorCheck.stderr}`);
  assert.throws(
    () => snapshotLocalImage('//server/share/evidence.png', path.join(tmpDir, 'network-snapshot.png')),
    /safe absolute local path/,
    'poster media snapshot accepted a forward-slash UNC path',
  );
  for (const renderPlan of ['summary', 'structure', 'split']) {
    const compressionWithLogo = {
      ...inputs['article-diagram'],
      formula: 'Input + route = output',
      sentence: 'A compact relation.',
      structure: { nodes: [{ id: 'a', label: 'Input' }, { id: 'b', label: 'Output' }] },
      render_plan: renderPlan,
      logo: posterMediaPath,
    };
    delete compressionWithLogo.family;
    delete compressionWithLogo.nodes;
    const compressionLogoValidation = validate(compressionWithLogo);
    assert.equal(compressionLogoValidation.valid, false, `compression ${renderPlan} unexpectedly accepted a logo that its renderer omits`);
    assert.match(compressionLogoValidation.errors.join('\n'), /compression pack does not support logo/);
  }
  const oversizedPng = Buffer.alloc(45);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(oversizedPng, 0);
  oversizedPng.writeUInt32BE(13, 8);
  oversizedPng.write('IHDR', 12, 'ascii');
  oversizedPng.writeUInt32BE(9000, 16);
  oversizedPng.writeUInt32BE(9000, 20);
  oversizedPng[24] = 8;
  oversizedPng[25] = 2;
  oversizedPng.writeUInt32BE(0, 33);
  oversizedPng.write('IEND', 37, 'ascii');
  fs.writeFileSync(path.join(tmpDir, 'oversized.png'), oversizedPng);
  const animatedPng = Buffer.concat([
    oversizedPng.subarray(0, 33),
    Buffer.from([0, 0, 0, 8]), Buffer.from('acTL'), Buffer.alloc(8), Buffer.alloc(4),
    oversizedPng.subarray(33),
  ]);
  fs.writeFileSync(path.join(tmpDir, 'animated.png'), animatedPng);
  assert.throws(
    () => snapshotLocalImage(path.join(tmpDir, 'animated.png'), path.join(tmpDir, 'animated-snapshot.png')),
    /static PNG image/,
    'poster media snapshot accepted animated PNG evidence',
  );
  assert.throws(
    () => snapshotLocalImage(path.join(tmpDir, 'oversized.png'), path.join(tmpDir, 'oversized-snapshot.png')),
    /dimensions exceed/,
    'poster media snapshot accepted a decompression-bomb-sized image',
  );
  assert.match(
    validate({ ...inputs.big, logo: path.join(tmpDir, 'oversized.png') }).errors.join('\n'),
    /logo must point to a bounded PNG, JPEG, or WebP image: Logo dimensions exceed/,
    'logo validation accepted a decompression-bomb-sized image',
  );
  const boundedLogoContracts = {
    big: inputs.big,
    'editorial-image': inputs['editorial-image'],
    'article-diagram': inputs['article-diagram'],
    ...Object.fromEntries(['infograph', 'comic', 'sketchnote'].map(mode => {
      const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'gallery', 'creative', `${mode}.json`), 'utf8'));
      return [mode, fixture.outputs[0].render_contract];
    })),
  };
  for (const [mode, contract] of Object.entries(boundedLogoContracts)) {
    runCardCli({ ...contract, logo: posterMediaPath }, `bounded-logo-${mode}`);
  }
  const aggregateMediaPaths = [1, 2].map((index) => {
    const target = path.join(tmpDir, `aggregate-media-${index}.png`);
    fs.writeFileSync(target, Buffer.concat([
      fs.readFileSync(posterMediaPath),
      Buffer.alloc(17 * 1024 * 1024),
    ]));
    return target;
  });
  const aggregateMediaInputPath = path.join(tmpDir, 'aggregate-media.json');
  fs.writeFileSync(aggregateMediaInputPath, JSON.stringify({
    mode: 'poster',
    title: 'Aggregate resource boundary',
    cards: aggregateMediaPaths.map((mediaPath, index) => ({
      body: [{ type: 'media', path: mediaPath, alt: `Evidence ${index + 1}` }],
    })),
  }));
  const aggregateMediaRender = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'card.js'), '--input', aggregateMediaInputPath,
    '--output', path.join(tmpDir, 'aggregate-media.png'),
  ], { encoding: 'utf8' });
  assert.equal(aggregateMediaRender.status, 0, aggregateMediaRender.stderr || 'poster renderer charged identical media bytes more than once');
  fs.appendFileSync(aggregateMediaPaths[1], Buffer.from([1]));
  const distinctAggregateMediaRender = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'card.js'), '--input', aggregateMediaInputPath,
    '--output', path.join(tmpDir, 'distinct-aggregate-media.png'),
  ], { encoding: 'utf8' });
  assert.notEqual(distinctAggregateMediaRender.status, 0, 'poster renderer accepted distinct media beyond the aggregate byte budget');
  assert.match(distinctAggregateMediaRender.stderr, /aggregate budget/);
  const evidencePosterFixture = {
    mode: 'poster',
    design: 'stripe',
    kicker: 'EVIDENCE ROUTE',
    title: 'Evidence becomes layout',
    source: 'Owned validation fixture',
    cards: [
      {
        body: [
          {
            type: 'media',
            path: posterMediaPath,
            alt: 'Current interface evidence <img src=x onerror=attack()>',
            caption: 'Current output, preserved as evidence.',
            fit: 'contain',
            position: 'center',
          },
          { type: 'paragraph', text: 'The media field owns the composition instead of floating inside a second card.' },
        ],
      },
      {
        body: [
          { type: 'heading', text: 'One native review path' },
          {
            type: 'process',
            steps: [
              { label: '01', title: 'Collect', text: 'Bind a current source to one responsibility.' },
              { label: '02', title: 'Route', text: 'Choose the structure that fits the evidence.' },
              { label: '03', title: 'Review', text: 'Inspect the final PNG at thumbnail scale.' },
            ],
          },
        ],
      },
    ],
  };
  const evidencePosterValidation = validate(evidencePosterFixture);
  assert.equal(evidencePosterValidation.valid, true, `evidence poster fixture failed validation: ${evidencePosterValidation.errors.join(', ')}`);
  const evidencePosterDir = path.join(tmpDir, 'evidence-poster');
  fs.mkdirSync(evidencePosterDir, { recursive: true });
  const evidencePosterOutputs = renderers.poster.render(evidencePosterFixture, evidencePosterDir);
  const [evidenceHtml, processHtml] = readOutputs(evidencePosterOutputs);
  assert.match(evidenceHtml, /class="header"[\s\S]*EVIDENCE ROUTE[\s\S]*01 \/ 02/, 'poster first card is missing the shared series skeleton');
  assert.match(processHtml, /class="header"[\s\S]*EVIDENCE ROUTE[\s\S]*02 \/ 02/, 'poster continuation card is missing the shared series skeleton');
  assert.match(evidenceHtml, /data-poster-media="true"/, 'poster did not render bounded evidence media');
  assert.match(evidenceHtml, /&lt;img src=x onerror=attack\(\)&gt;/, 'poster media alt text was not escaped');
  assert.doesNotMatch(evidenceHtml, /<img src=x onerror=/, 'poster media alt text reached HTML unsafely');
  assert.match(processHtml, /data-poster-process="true"[\s\S]*Collect[\s\S]*Route[\s\S]*Review/, 'poster did not render the native process');
  for (const output of evidencePosterOutputs) {
    const check = runOutputCheck(output.htmlPath, output, [posterMediaPath]);
    assert.equal(check.result.status, 0, `evidence poster HTML failed output check: ${check.result.stdout}\n${check.result.stderr}`);
    assert.equal(check.report?.pass, true, 'evidence poster HTML did not pass output check');
  }

  const noKickerPosterDir = path.join(tmpDir, 'no-kicker-poster');
  fs.mkdirSync(noKickerPosterDir, { recursive: true });
  const noKickerOutputs = renderers.poster.render({
    mode: 'poster',
    title: 'One series title',
    cards: [
      { body: [{ type: 'heading', text: 'First responsibility' }] },
      { body: [{ type: 'heading', text: 'Second responsibility' }] },
    ],
  }, noKickerPosterDir);
  const [noKickerFirst, noKickerSecond] = readOutputs(noKickerOutputs);
  assert.match(noKickerFirst, /class="running-title"><\/span>[\s\S]*01 \/ 02/, 'poster first card should keep an empty running label without kicker');
  assert.equal((noKickerFirst.match(/One series title/g) || []).length, 1, 'poster first card duplicated the series title');
  assert.match(noKickerSecond, /class="running-title">One series title<\/span>[\s\S]*02 \/ 02/, 'poster continuation did not fall back to the series title');

  const undersizedMediaHtml = evidencePosterOutputs[0].htmlPath;
  fs.appendFileSync(undersizedMediaHtml, '<style>.evidence-media{width:20%!important}.evidence-media img{height:100px!important}</style>');
  const undersizedMediaCheck = runOutputCheck(undersizedMediaHtml, evidencePosterOutputs[0], [posterMediaPath]);
  assert.notEqual(undersizedMediaCheck.result.status, 0, 'poster checker accepted undersized evidence media');
  assert.ok(undersizedMediaCheck.report?.issues?.some(issue => issue.code === 'poster_evidence_media_density'), 'poster checker did not report evidence-media density');

  const undersizedProcessHtml = evidencePosterOutputs[1].htmlPath;
  fs.appendFileSync(undersizedProcessHtml, '<style>.native-process{min-height:0!important;height:200px!important;flex:none!important}.process-step{min-height:0!important;padding:0!important}</style>');
  const undersizedProcessCheck = runOutputCheck(undersizedProcessHtml, evidencePosterOutputs[1]);
  assert.notEqual(undersizedProcessCheck.result.status, 0, 'poster checker accepted undersized native process');
  assert.ok(undersizedProcessCheck.report?.issues?.some(issue => issue.code === 'poster_process_density'), 'poster checker did not report process density');

  runCardCli(evidencePosterFixture, 'evidence-process-poster', 2);
  const processOnlySteps = [
    { label: '01', title: 'Collect', text: 'Bind one current source.' },
    { label: '02', title: 'Route', text: 'Choose one evidence responsibility.' },
    { label: '03', title: 'Review', text: 'Inspect the checked PNG.' },
  ];
  runCardCli({
    mode: 'poster',
    kicker: 'PROCESS TOPOLOGY',
    title: 'Native process',
    source: 'Owned validation fixture',
    cards: [
      { body: [{ type: 'process', steps: processOnlySteps }] },
      { body: [{ type: 'process', steps: processOnlySteps }] },
      { body: [{ type: 'process', steps: processOnlySteps }] },
    ],
  }, 'process-only-topologies', 3);
  runCardCli({
    mode: 'poster',
    kicker: 'MEDIA TOPOLOGY',
    title: 'Evidence owns the available field',
    cards: [
      { body: [{ type: 'media', path: posterMediaPath, alt: 'Media-only first card', fit: 'contain' }] },
      { body: [
        { type: 'media', path: posterMediaPath, alt: 'Media with short copy', fit: 'contain' },
        { type: 'paragraph', text: 'One bounded note.' },
      ] },
      { body: [{ type: 'media', path: posterMediaPath, alt: 'Media-only continuation card', fit: 'contain' }] },
    ],
  }, 'evidence-media-topologies', 3);
  const groupedMediaDir = path.join(tmpDir, 'grouped-evidence-media');
  fs.mkdirSync(groupedMediaDir, { recursive: true });
  const [groupedMediaOutput] = renderers.poster.render({
    mode: 'poster',
    title: 'Evidence and explanation stay together',
    cards: [{ body: [
      { type: 'media', path: posterMediaPath, alt: 'Wide evidence with omitted fit' },
      { type: 'paragraph', text: 'One bounded explanation remains adjacent to the evidence.' },
    ] }],
  }, groupedMediaDir);
  const groupedMediaHtml = fs.readFileSync(groupedMediaOutput.htmlPath, 'utf8');
  assert.match(groupedMediaHtml, /evidence-media fit-contain/, 'poster evidence media must default to contain when fit is omitted');
  assert.match(groupedMediaHtml, /media-with-copy-poster/, 'poster did not opt adjacent evidence and copy into the grouped composition');
  const groupedMediaCheck = runOutputCheck(groupedMediaOutput.htmlPath, groupedMediaOutput);
  assert.equal(groupedMediaCheck.result.status, 0, `grouped evidence-media topology failed output check: ${groupedMediaCheck.result.stdout}\n${groupedMediaCheck.result.stderr}`);

  const denseMediaSourceHtml = path.join(tmpDir, 'dense-evidence.html');
  const denseMediaPath = path.join(tmpDir, 'dense-evidence.png');
  fs.writeFileSync(denseMediaSourceHtml, '<!doctype html><html><style>*{box-sizing:border-box}html,body{margin:0;width:1280px;height:915px;background:#f4f7fb;color:#17233c;font-family:Arial,sans-serif}body{padding:70px 84px}h1{font-size:54px;margin:0 0 46px}.chart{height:590px;border-left:4px solid #2f6fea;border-bottom:4px solid #2f6fea;background:linear-gradient(135deg,transparent 48%,#2f6fea 49%,#2f6fea 52%,transparent 53%)}.legend{font-size:28px;margin-top:28px}</style><body><h1>Owned benchmark fixture</h1><div class="chart"></div><div class="legend">Capability × verified delivery</div></body></html>');
  const denseMediaCapture = spawnSync(process.execPath, [
    path.join(ROOT, 'assets', 'capture4k.js'), denseMediaSourceHtml, denseMediaPath, '1280', '915', '1',
  ], { encoding: 'utf8' });
  assert.equal(denseMediaCapture.status, 0, denseMediaCapture.stderr || denseMediaCapture.stdout);

  const denseSeriesDir = path.join(tmpDir, 'dense-evidence-series');
  fs.mkdirSync(denseSeriesDir, { recursive: true });
  const denseSeriesOutputs = renderers.poster.render({
    mode: 'poster',
    kicker: 'K3 LOCAL ACCEPTANCE',
    title: 'Kimi K3：不只是更聪明，而是更像一个能把事做完的同事',
    source: 'Owned validation fixture',
    cards: [
      { body: [
        { type: 'media', path: denseMediaPath, alt: 'Hero evidence', fit: 'cover' },
        { type: 'paragraph', text: '素材与观点共用同一张纸面，而不是再套一层卡片。' },
      ] },
      { body: [
        { type: 'heading', text: '代码能力，最终要落到可验证的交付' },
        { type: 'media', path: denseMediaPath, alt: 'Coding benchmark', fit: 'contain' },
        { type: 'paragraph', text: '完整保留图表边缘和坐标信息。' },
      ] },
      { body: [
        { type: 'heading', text: '知识工作，也开始有端到端的交付' },
        { type: 'media', path: denseMediaPath, alt: 'Knowledge-work benchmark', fit: 'contain', caption: 'Synthetic benchmark for regression only' },
        { type: 'paragraph', text: '从搜索、归纳到形成可检查结果，证据和解释需要保持相邻。' },
        { type: 'data_row', key: 'Research', value: 'Verified' },
        { type: 'data_row', key: 'Synthesis', value: 'Bounded' },
        { type: 'data_row', key: 'Delivery', value: 'Checked' },
      ] },
      { body: [
        { type: 'heading', text: '开放任务，检验系列最后一张的收束感' },
        { type: 'media', path: denseMediaPath, alt: 'Open task result', fit: 'cover' },
        { type: 'paragraph', text: '共享页眉、页码、字体和来源，媒体不增加外层底板。' },
        { type: 'data_row', key: 'Series', value: 'Consistent' },
      ] },
    ],
  }, denseSeriesDir);
  assert.equal(denseSeriesOutputs.length, 4, 'dense evidence regression did not render the full series');
  const denseThirdHtml = fs.readFileSync(denseSeriesOutputs[2].htmlPath, 'utf8');
  assert.match(denseThirdHtml, /class="card[^\"]*media-copy-dense/, 'dense evidence card did not opt into its bounded layout');
  assert.match(denseThirdHtml, /知识工作，也开始有端到端的交付/, 'dense evidence regression lost its heading');
  for (const output of denseSeriesOutputs) {
    const check = runOutputCheck(output.htmlPath, output);
    assert.equal(check.result.status, 0, `dense evidence series failed output check: ${check.result.stdout}\n${check.result.stderr}`);
  }

  const captionMediaDir = path.join(tmpDir, 'caption-evidence-media');
  fs.mkdirSync(captionMediaDir, { recursive: true });
  const captionMediaOutputs = renderers.poster.render({
    mode: 'poster',
    kicker: 'CAPTION TOPOLOGY',
    title: 'Caption stays attached to evidence',
    cards: [1, 2, 3].map(index => ({ body: [{
      type: 'media',
      path: posterMediaPath,
      alt: `Captioned evidence ${index}`,
      caption: `Evidence record ${index}`,
    }] })),
  }, captionMediaDir);
  for (const output of captionMediaOutputs) {
    const captionHtml = fs.readFileSync(output.htmlPath, 'utf8');
    assert.match(captionHtml, /class="card[^"]*media-with-copy-poster/, 'caption-only media did not opt into grouped evidence composition');
    assert.doesNotMatch(captionHtml, /class="card[^"]*media-only-poster/, 'caption-only media was misclassified as an uncaptioned media-only card');
    const checkedCaption = runOutputCheck(output.htmlPath, output);
    assert.equal(checkedCaption.result.status, 0, `caption-only evidence card failed output check: ${checkedCaption.result.stdout}\n${checkedCaption.result.stderr}`);
  }
  fs.appendFileSync(captionMediaOutputs[0].htmlPath, '<style>.evidence-media figcaption{margin-top:300px!important}</style>');
  const detachedCaptionCheck = runOutputCheck(captionMediaOutputs[0].htmlPath, captionMediaOutputs[0]);
  assert.notEqual(detachedCaptionCheck.result.status, 0, 'poster checker accepted a caption detached from the painted evidence area');
  assert.ok(detachedCaptionCheck.report?.issues?.some(issue => issue.code === 'poster_evidence_media_density'), 'detached caption did not report poster evidence-media density');

  const panoramaHtmlPath = path.join(tmpDir, 'extreme-panorama.html');
  const panoramaPath = path.join(tmpDir, 'extreme-panorama.png');
  fs.writeFileSync(panoramaHtmlPath, '<!doctype html><html><body style="margin:0;width:3200px;height:200px;background:#13202b;color:white;font:80px sans-serif;display:grid;place-items:center">Too shallow to be primary evidence</body></html>');
  const panoramaCapture = spawnSync(process.execPath, [
    path.join(ROOT, 'assets', 'capture4k.js'), panoramaHtmlPath, panoramaPath, '3200', '200', '1',
  ], { encoding: 'utf8' });
  assert.equal(panoramaCapture.status, 0, panoramaCapture.stderr || panoramaCapture.stdout);
  const panoramaPosterDir = path.join(tmpDir, 'panorama-poster');
  fs.mkdirSync(panoramaPosterDir, { recursive: true });
  const [panoramaPoster] = renderers.poster.render({
    mode: 'poster',
    title: 'Actual painted evidence matters',
    cards: [{ body: [{ type: 'media', path: panoramaPath, alt: 'Extreme panorama', fit: 'contain' }] }],
  }, panoramaPosterDir);
  const panoramaCheck = runOutputCheck(panoramaPoster.htmlPath, panoramaPoster);
  assert.notEqual(panoramaCheck.result.status, 0, 'poster checker accepted an extreme panorama that paints only a thin strip');
  assert.ok(panoramaCheck.report?.issues?.some(issue => issue.code === 'poster_evidence_media_density'), 'extreme panorama did not report poster evidence-media density');

  const readingNotesFixture = {
    mode: 'poster',
    variant: 'reading-notes',
    design: 'claude',
    title: '边界练习｜第一章',
    subtitle: '三条合成笔记',
    source: '微信读书 · 《边界练习》 · 林川',
    cards: [
      {
        title: '主题整理｜边界让选择落地',
        body: [
          {
            type: 'reading_unit',
            quote: '清楚的边界，让每一次选择都能被看见。<script>quote()</script>',
            thought: '限制不是目的，能解释自己的选择才是。<img src=x onerror=thought()>',
          },
        ],
      },
      {
        title: '主题整理｜从判断走向行动',
        body: [
          { type: 'reading_unit', quote: '行动让抽象的承诺留下证据。' },
          {
            type: 'items',
            entries: [
              { label: '章节点评', text: '这一章从规则转向了关系。' },
              { label: '整本书评', text: '全书最终把边界落到了行动上。' },
            ],
          },
        ],
      },
    ],
  };
  const readingNotesValidation = validate(readingNotesFixture);
  assert.equal(readingNotesValidation.valid, true, `reading-notes fixture failed validation: ${readingNotesValidation.errors.join(', ')}`);

  const posterSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'poster.json'), 'utf8'));
  assert.deepEqual(posterSchema.properties.variant.enum, ['reading-notes'], 'public poster schema does not document the reading-notes variant');
  assert.ok(
    posterSchema.properties.cards.items.properties.body.items.properties.type.enum.includes('reading_unit'),
    'public poster schema does not document reading_unit',
  );
  assert.equal(posterSchema.properties.kicker.type, 'string', 'public poster schema does not document the shared series kicker');
  assert.ok(
    posterSchema.properties.cards.items.properties.body.items.properties.type.enum.includes('media'),
    'public poster schema does not document evidence media',
  );
  assert.ok(
    posterSchema.properties.cards.items.properties.body.items.properties.type.enum.includes('process'),
    'public poster schema does not document native process',
  );
  assert.equal(
    posterSchema.properties.cards.items.properties.body.items.properties.path.maxLength,
    1024,
    'public poster schema does not bound evidence-media paths',
  );
  const posterBodyConditionals = posterSchema.properties.cards.items.properties.body.items.allOf;
  const itemConditional = posterBodyConditionals.find(rule => rule.if?.properties?.type?.const === 'items');
  const dataRowConditional = posterBodyConditionals.find(rule => rule.if?.properties?.type?.const === 'data_row');
  assert.deepEqual(itemConditional?.then?.required, ['entries'], 'public poster schema does not require items entries');
  assert.deepEqual(dataRowConditional?.then?.required, ['key', 'value'], 'public poster schema does not require a complete data row');
  assert.match(posterSchema.properties.cards.items.properties.body.items.properties.path.pattern, /\(\?!/, 'public poster media path does not reject network/device namespaces');
  const readingNotesSchemaGuard = posterSchema.allOf.find(rule => rule.if?.properties?.variant?.const === 'reading-notes');
  assert.equal(readingNotesSchemaGuard?.then?.properties?.cards?.maxItems, 8, 'public poster schema does not enforce the reading-notes batch boundary');
  const readingNotesContentAlternatives = readingNotesSchemaGuard?.then?.properties?.cards?.items?.properties?.body?.contains?.anyOf;
  assert.ok(Array.isArray(readingNotesContentAlternatives), 'public poster schema does not require semantic reading-notes content');
  assert.deepEqual(
    readingNotesContentAlternatives.map(alternative => alternative.properties?.type?.const ?? alternative.properties?.type?.enum).flat(),
    ['reading_unit', 'paragraph', 'heading', 'highlight', 'items', 'data_row'],
    'public poster schema semantic-content types are out of sync with runtime validation',
  );
  assert.deepEqual(
    readingNotesSchemaGuard?.else?.properties?.cards?.items?.not,
    { required: ['title'] },
    'public poster schema does not restrict card theme titles to reading-notes',
  );

  const readingNotesDir = path.join(tmpDir, 'reading-notes-poster');
  fs.mkdirSync(readingNotesDir, { recursive: true });
  const readingNotesOutputs = renderers.poster.render(readingNotesFixture, readingNotesDir);
  const [readingNotesFirstHtml, readingNotesLastHtml] = readOutputs(readingNotesOutputs);
  assert.match(readingNotesFirstHtml, /class="card reading-notes"/, 'reading-notes variant did not mark its composition');
  assert.match(readingNotesFirstHtml, /<div class="title-area">[\s\S]*边界练习｜第一章[\s\S]*<section class="reading-unit">/, 'reading-notes first card is title-only');
  assert.match(readingNotesFirstHtml, /class="reading-card-title">主题整理｜边界让选择落地</, 'reading-notes theme title was not rendered');
  assert.match(readingNotesFirstHtml, /原文划线/, 'reading-notes quote label was not rendered');
  assert.match(readingNotesFirstHtml, /我的想法/, 'reading-notes thought label was not rendered');
  assert.match(readingNotesFirstHtml, /&lt;script&gt;quote\(\)&lt;\/script&gt;/, 'reading-notes quote was not HTML-escaped');
  assert.match(readingNotesFirstHtml, /&lt;img src=x onerror=thought\(\)&gt;/, 'reading-notes thought was not HTML-escaped');
  assert.doesNotMatch(readingNotesFirstHtml, /<script>quote\(\)<\/script>|<img src=x onerror=/, 'reading-notes user text reached HTML unsafely');
  assert.match(readingNotesLastHtml, /原文划线/, 'isolated quote did not remain a reading unit');
  assert.doesNotMatch(readingNotesLastHtml, /我的想法/, 'isolated quote invented an empty thought block');
  assert.match(readingNotesLastHtml, /章节点评/, 'standalone chapter review lost its label');
  assert.match(readingNotesLastHtml, /整本书评/, 'whole-book review lost its label');
  assert.match(readingNotesLastHtml, /微信读书 · 《边界练习》 · 林川/, 'reading-notes source was not rendered on the last card');
  assert.doesNotMatch(readingNotesLastHtml, /chapterUid|bookId|range=/, 'reading-notes output leaked source identifiers');

  for (const output of readingNotesOutputs) {
    const check = runOutputCheck(output.htmlPath, output);
    assert.equal(check.result.status, 0, `reading-notes HTML failed output check: ${check.result.stdout}\n${check.result.stderr}`);
    assert.equal(check.report?.pass, true, 'reading-notes HTML did not pass output check');
  }
  runCardCli(readingNotesFixture, 'reading-notes-poster', 2);

  const invalidPosterCases = [
    {
      label: 'deep unknown poster card field',
      input: (() => {
        const hostile = {};
        let cursor = hostile;
        for (let index = 0; index < 3000; index++) cursor = cursor.a = {};
        return { mode: 'poster', title: 'Bad card', cards: [{ body: [{ type: 'paragraph', text: 'Visible' }], hostile }] };
      })(),
      pattern: /unknown field "hostile"/,
    },
    {
      label: 'null poster card',
      input: { mode: 'poster', title: 'Bad card', cards: [null] },
      pattern: /cards\[0\] must be an object/,
    },
    {
      label: 'null poster body element',
      input: { mode: 'poster', title: 'Bad body', cards: [{ body: [null] }] },
      pattern: /body\[0\] must be an object/,
    },
    {
      label: 'unknown variant',
      input: { ...inputs.poster, variant: 'weread' },
      pattern: /variant must be one of: reading-notes/,
    },
    {
      label: 'reading unit outside variant',
      input: { mode: 'poster', title: 'Bad unit', cards: [{ body: [{ type: 'reading_unit', quote: 'Quote' }] }] },
      pattern: /reading_unit requires poster variant "reading-notes"/,
    },
    {
      label: 'empty reading quote',
      input: { mode: 'poster', variant: 'reading-notes', title: 'Empty quote', cards: [{ body: [{ type: 'reading_unit', quote: '   ' }] }] },
      pattern: /quote must be a non-empty string/,
    },
    {
      label: 'non-string thought',
      input: { mode: 'poster', variant: 'reading-notes', title: 'Bad thought', cards: [{ body: [{ type: 'reading_unit', quote: 'Quote', thought: 42 }] }] },
      pattern: /thought must be a string/,
    },
    {
      label: 'title-only reading card',
      input: { mode: 'poster', variant: 'reading-notes', title: 'No content', cards: [{ body: [] }] },
      pattern: /body must contain actual visible content/,
    },
    {
      label: 'divider-only reading card',
      input: { mode: 'poster', variant: 'reading-notes', title: 'No content', cards: [{ body: [{ type: 'divider' }] }] },
      pattern: /body must contain actual visible content/,
    },
    {
      label: 'empty ordinary card',
      input: { mode: 'poster', title: 'No content', cards: [{ body: [] }] },
      pattern: /body must contain actual visible content/,
    },
    {
      label: 'divider-only ordinary card',
      input: { mode: 'poster', title: 'No content', cards: [{ body: [{ type: 'divider' }] }] },
      pattern: /body must contain actual visible content/,
    },
    {
      label: 'empty items ordinary card',
      input: { mode: 'poster', title: 'No content', cards: [{ body: [{ type: 'items', entries: [] }] }] },
      pattern: /body must contain actual visible content/,
    },
    {
      label: 'reading batch over eight cards',
      input: { mode: 'poster', variant: 'reading-notes', title: 'Too many', cards: Array.from({ length: 9 }, () => ({ body: [{ type: 'reading_unit', quote: 'Quote' }] })) },
      pattern: /supports at most 8 cards per batch/,
    },
    {
      label: 'card title outside reading variant',
      input: { mode: 'poster', title: 'Ordinary', cards: [{ title: 'Ignored before', body: [{ type: 'paragraph', text: 'Body' }] }] },
      pattern: /title is only supported by poster variant "reading-notes"/,
    },
    {
      label: 'relative media path',
      input: { mode: 'poster', title: 'Bad media', cards: [{ body: [{ type: 'media', path: 'evidence.png', alt: 'Evidence' }] }] },
      pattern: /path must be an absolute local path/,
    },
    {
      label: 'network-share media path',
      input: { mode: 'poster', title: 'Bad media', cards: [{ body: [{ type: 'media', path: '\\\\server\\share\\evidence.png', alt: 'Evidence' }] }] },
      pattern: /not a network share/,
    },
    {
      label: 'network-share logo path',
      input: { mode: 'poster', title: 'Bad logo', logo: '//server/share/logo.png', cards: [{ body: [{ type: 'paragraph', text: 'Body' }] }] },
      pattern: /logo must be a safe absolute local path/,
    },
    {
      label: 'forward-slash network-share media path',
      input: { mode: 'poster', title: 'Bad media', cards: [{ body: [{ type: 'media', path: '//server/share/evidence.png', alt: 'Evidence' }] }] },
      pattern: /not a network share/,
    },
    {
      label: 'device namespace media path',
      input: { mode: 'poster', title: 'Bad media', cards: [{ body: [{ type: 'media', path: '//?/C:/evidence.png', alt: 'Evidence' }] }] },
      pattern: /not a network share/,
    },
    {
      label: 'unsupported media type',
      input: { mode: 'poster', title: 'Bad media', cards: [{ body: [{ type: 'media', path: path.join(tmpDir, 'evidence.svg'), alt: 'Evidence' }] }] },
      pattern: /path must use PNG, JPEG, or WebP/,
    },
    {
      label: 'missing media alt',
      input: { mode: 'poster', title: 'Bad media', cards: [{ body: [{ type: 'media', path: posterMediaPath }] }] },
      pattern: /alt must be a non-empty string/,
    },
    {
      label: 'unknown media field',
      input: { mode: 'poster', title: 'Bad media', cards: [{ body: [{ type: 'media', path: posterMediaPath, alt: 'Evidence', html: '<script>' }] }] },
      pattern: /unknown media field "html"/,
    },
    {
      label: 'invalid media fit',
      input: { mode: 'poster', title: 'Bad media', cards: [{ body: [{ type: 'media', path: posterMediaPath, alt: 'Evidence', fit: 'stretch' }] }] },
      pattern: /fit must be cover or contain/,
    },
    {
      label: 'malformed items entries',
      input: { mode: 'poster', title: 'Bad items', cards: [{ body: [{ type: 'items', entries: [{ label: 42, text: 'Visible' }] }] }] },
      pattern: /label must be a non-empty string/,
    },
    {
      label: 'missing items entries',
      input: { mode: 'poster', title: 'Bad items', cards: [{ body: [{ type: 'items' }] }] },
      pattern: /entries must contain 1 to 8 entries/,
    },
    {
      label: 'incomplete data row',
      input: { mode: 'poster', title: 'Bad data', cards: [{ body: [{ type: 'data_row', key: 'Only key' }] }] },
      pattern: /value must be a non-empty string/,
    },
    {
      label: 'unknown data row field',
      input: { mode: 'poster', title: 'Bad data', cards: [{ body: [{ type: 'data_row', key: 'Key', value: 'Value', text: 'Ignored' }] }] },
      pattern: /unknown data_row field "text"/,
    },
    {
      label: 'unknown items entry field',
      input: { mode: 'poster', title: 'Bad items', cards: [{ body: [{ type: 'items', entries: [{ label: 'A', text: 'Visible', hidden: 'Never rendered' }] }] }] },
      pattern: /unknown field "hidden"/,
    },
    {
      label: 'short process',
      input: { mode: 'poster', title: 'Bad process', cards: [{ body: [{ type: 'process', steps: [{ title: 'Only' }] }] }] },
      pattern: /steps must contain 2 to 5 entries/,
    },
    {
      label: 'missing process title',
      input: { mode: 'poster', title: 'Bad process', cards: [{ body: [{ type: 'process', steps: [{ title: 'One' }, { text: 'Missing' }] }] }] },
      pattern: /title must be a non-empty string/,
    },
    {
      label: 'unknown process field',
      input: { mode: 'poster', title: 'Bad process', cards: [{ body: [{ type: 'process', steps: [{ title: 'One' }, { title: 'Two' }], html: '<script>' }] }] },
      pattern: /unknown process field "html"/,
    },
    {
      label: 'reading-notes media field',
      input: { mode: 'poster', variant: 'reading-notes', title: 'Bad notes', cards: [{ body: [{ type: 'media', path: posterMediaPath, alt: 'Evidence' }] }] },
      pattern: /media is not supported by poster variant "reading-notes"/,
    },
  ];
  for (const fixture of invalidPosterCases) {
    const validation = validate(fixture.input);
    assert.equal(validation.valid, false, `${fixture.label} unexpectedly passed poster validation`);
    assert.match(validation.errors.join('\n'), fixture.pattern, `${fixture.label} failed for the wrong reason`);
  }

  const designNames = new Set(listDesigns().map(design => design.name));
  const normalizedToneHtml = [];
  for (const [tone, paletteName] of Object.entries(TONE_PALETTE_NAMES)) {
    const toneInput = {
      mode: 'editorial-image',
      title: 'Tone changes color only',
      editorial_tone: tone,
      visual_metaphor: 'one invariant paper composition',
    };
    const selectedDesign = resolveEditorialDesignName(toneInput);
    assert.equal(selectedDesign, paletteName, `${tone} did not resolve to its Kenny Style palette`);
    assert.ok(getDesign(selectedDesign), `${tone} selected an unknown internal palette: ${selectedDesign}`);
    assert.equal(isValidDesignName(selectedDesign), false, `${tone} internal palette leaked into the public design surface`);

    const tonePath = path.join(tmpDir, `tone-${tone}.html`);
    renderers['editorial-image'].render(toneInput, tonePath);
    const toneHtml = stripComments(fs.readFileSync(tonePath, 'utf8'));
    assert.match(toneHtml, new RegExp(`data-editorial-tone="${tone}"`), `${tone} tone was not recorded in HTML`);
    assert.match(toneHtml, new RegExp(`data-card-design="${selectedDesign}"`), `${tone} selected design was not rendered`);
    normalizedToneHtml.push(toneHtml
      .replace(/data-editorial-tone="[^"]+"/g, 'data-editorial-tone="TONE"')
      .replace(/data-card-design="[^"]+"/g, 'data-card-design="PALETTE"')
      .replace(/#[0-9a-f]{3,8}\b/gi, '#COLOR'));
  }
  for (const normalizedHtml of normalizedToneHtml.slice(1)) {
    assert.equal(normalizedHtml, normalizedToneHtml[0], 'tone changed non-color editorial markup or geometry');
  }

  for (const designName of designNames) {
    assert.equal(getDesign(designName).radius, KENNY_STYLE.radius, `${designName} changed Kenny Style radius`);
  }
  for (const mode of ['big', 'long', 'whiteboard', 'poster', 'article-diagram', 'infograph', 'comic', 'sketchnote']) {
    for (const tone of Object.keys(TONE_PALETTE_NAMES)) {
      assert.equal(
        resolveDesignNameForInput({ mode, tone }),
        TONE_PALETTE_NAMES[tone],
        `${mode}/${tone} escaped the Kenny Style tone palette`,
      );
    }
  }

  const explicitDesignInput = {
    mode: 'editorial-image',
    title: 'Explicit design wins',
    design: 'stripe',
    editorial_tone: 'warm',
  };
  assert.equal(resolveEditorialDesignName(explicitDesignInput), 'stripe', 'explicit design did not override editorial_tone');
  const explicitDesignPath = path.join(tmpDir, 'explicit-design-editorial.html');
  renderers['editorial-image'].render(explicitDesignInput, explicitDesignPath);
  const explicitDesignHtml = stripComments(fs.readFileSync(explicitDesignPath, 'utf8'));
  assert.match(explicitDesignHtml, /data-card-design="stripe"/, 'explicit design was not rendered');
  assert.equal(validate({ mode: 'editorial-image', title: 'Alias', design: 'opencode.ai' }).valid, true, 'documented opencode.ai alias failed validation');

  const invalidDesignValidation = validate({ mode: 'editorial-image', title: 'Bad design', design: 'technical-data' });
  assert.equal(invalidDesignValidation.valid, false, 'invalid grouped design unexpectedly passed validation');
  assert.match(invalidDesignValidation.errors.join('\n'), /design must be one of:/);

  const invalidToneValidation = validate({ mode: 'editorial-image', title: 'Bad tone', editorial_tone: 'editorial-warm' });
  assert.equal(invalidToneValidation.valid, false, 'invalid editorial tone unexpectedly passed validation');
  assert.match(invalidToneValidation.errors.join('\n'), /editorial_tone must be one of: reflective, sharp, warm, technical/);

  const incompleteInArticleValidation = validate({
    mode: 'editorial-image',
    title: 'Attention has a boundary',
    use: 'in-article',
    aspect: 'body-3-2',
  });
  assert.equal(incompleteInArticleValidation.valid, false, 'in-article input without an open composition unexpectedly passed');
  assert.match(incompleteInArticleValidation.errors.join('\n'), /requires composition_required=true/);

  const completeInArticleValidation = validate({
    mode: 'editorial-image',
    title: 'Attention has a boundary',
    use: 'in-article',
    aspect: 'body-3-2',
    composition_required: true,
    content_html: '<section class="valid-in-article"></section>',
    custom_css: '.valid-in-article { width: 100%; height: 100%; }',
  });
  assert.equal(completeInArticleValidation.valid, true, `complete in-article composition failed: ${completeInArticleValidation.errors.join(', ')}`);

  const invalidUseValidation = validate({
    mode: 'editorial-image',
    title: 'Bad field mapping',
    use: 'body-3-2',
  });
  assert.equal(invalidUseValidation.valid, false, 'aspect value in use unexpectedly passed validation');
  assert.match(invalidUseValidation.errors.join('\n'), /use must be one of: cover, in-article, metaphor/);

  const invalidCoverMotifValidation = validate({
    mode: 'editorial-image',
    title: 'Unknown motif',
    use: 'cover',
    cover_motif: 'paper-brain',
  });
  assert.equal(invalidCoverMotifValidation.valid, false, 'unknown cover motif unexpectedly passed validation');
  assert.match(invalidCoverMotifValidation.errors.join('\n'), /cover_motif must be one of:/);

  const creativeCoverMotifValidation = validate({
    mode: 'editorial-image',
    title: 'Wrong motif use',
    use: 'metaphor',
    cover_motif: 'drawer',
    composition_required: true,
    content_html: '<section></section>',
    custom_css: 'section { width: 100%; height: 100%; }',
  });
  assert.equal(creativeCoverMotifValidation.valid, false, 'cover motif unexpectedly passed for a creative sub-scenario');
  assert.match(creativeCoverMotifValidation.errors.join('\n'), /cover_motif is only supported/);

  const editorialSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'editorial-image.json'), 'utf8'));
  const creativeSchemaGuard = editorialSchema.allOf.find(rule => rule.if?.properties?.use?.enum?.includes('metaphor'));
  assert.deepEqual(
    creativeSchemaGuard?.then?.not,
    { required: ['cover_motif'] },
    'public editorial-image schema does not reject cover_motif for creative sub-scenarios',
  );

  for (const motif of EDITORIAL_COVER_MOTIFS) {
    const coverMotifInput = {
      mode: 'editorial-image',
      title: 'Memory returns',
      use: 'cover',
      aspect: 'blog-hero',
      design: 'stripe',
      cover_motif: motif,
      visual_metaphor: `A ${motif} carries the article tension.`,
    };
    const coverMotifValidation = validate(coverMotifInput);
    assert.equal(coverMotifValidation.valid, true, `${motif} cover motif failed validation: ${coverMotifValidation.errors.join(', ')}`);

    const coverMotifPath = path.join(tmpDir, `cover-motif-${motif}.html`);
    const coverMotifOutput = renderers['editorial-image'].render(coverMotifInput, coverMotifPath);
    const coverMotifHtml = stripComments(fs.readFileSync(coverMotifPath, 'utf8'));
    assert.match(coverMotifHtml, new RegExp(`data-cover-motif="${motif}"`), `${motif} cover motif was not marked in HTML`);
    assert.match(coverMotifHtml, new RegExp(`cover-motif-${motif}`), `${motif} cover motif did not render its visible subject`);
    if (motif !== 'paper-stack') {
      assert.doesNotMatch(coverMotifHtml, /<div class="paper-stack/, `${motif} cover motif fell back to paper-stack markup`);
    }
    const coverMotifCheck = runOutputCheck(coverMotifPath, coverMotifOutput);
    assert.equal(coverMotifCheck.result.status, 0, `${motif} cover motif failed output check: ${coverMotifCheck.result.stdout}\n${coverMotifCheck.result.stderr}`);
    assert.equal(coverMotifCheck.report?.pass, true, `${motif} cover motif did not pass output check`);
    if (motif === 'window') {
      assert.deepEqual(
        readComputedStyles(coverMotifPath, '.cover-motif-window .window-field i', 'border-top-width'),
        ['1px', '1px', '1px', '1px'],
        'window motif detail dots lost their visible border',
      );
    }
    if (motif === 'archive') {
      assert.deepEqual(
        readComputedStyles(coverMotifPath, '.cover-motif-archive .archive-file', 'border-top-width'),
        ['2px', '2px', '2px'],
        'archive receipt sheets must remain visible at thumbnail size',
      );
    }
    if (motif === 'drawer') {
      assert.deepEqual(
        readComputedStyles(coverMotifPath, '.cover-motif-drawer .drawer-box', 'border-top-width'),
        ['2px'],
        'drawer body must remain legible at thumbnail size',
      );
      assert.deepEqual(
        readComputedStyles(coverMotifPath, '.cover-motif-drawer .drawer-handle', 'border-top-width'),
        ['2px'],
        'drawer pull must remain a visible external object',
      );
    }
  }

  const incompleteCompositionValidation = validate({
    mode: 'editorial-image',
    title: 'Three paths converge',
    composition_required: true,
    visual_metaphor: 'Three paper paths converge into one PNG sheet.',
  });
  assert.equal(incompleteCompositionValidation.valid, false, 'incomplete required composition unexpectedly passed validation');
  assert.match(incompleteCompositionValidation.errors.join('\n'), /requires non-empty "content_html"/);
  assert.match(incompleteCompositionValidation.errors.join('\n'), /requires non-empty "custom_css"/);
  const completeCompositionInput = {
    mode: 'editorial-image',
    title: 'Three paths converge',
    design: 'linear',
    use: 'cover',
    aspect: 'wechat-cover',
    composition_required: true,
    visual_metaphor: 'Three paper paths converge into one PNG sheet.',
    content_html: '<section class="converge-fixture"><i></i><i></i><i></i><b>PNG</b></section>',
    custom_css: '.converge-fixture { width: 100%; height: 100%; display: grid; }',
  };
  assert.match(validate({
    ...completeCompositionInput,
    custom_css: '.subject { animation: drift 2s infinite; } @keyframes drift { to { transform: translateX(10px); } }',
  }).errors.join('\n'), /time-dependent animation or transition rules/, 'Studio validation accepted time-dependent CSS');
  assert.match(validate({
    ...completeCompositionInput,
    content_html: '<svg><rect><animate attributeName="x" from="0" to="200" dur="1s"/></rect></svg>',
  }).errors.join('\n'), /executable or embedded-resource markup/, 'Studio validation accepted time-dependent SVG SMIL markup');
  assert.match(validate({
    ...completeCompositionInput,
    content_html: '<style>@keyframes drift{to{transform:translateX(1px)}}</style><div style="animation:drift 1s infinite">moving</div>',
  }).errors.join('\n'), /time-dependent animation or transition rules/, 'Studio validation accepted time-dependent CSS hidden in content_html');
  assert.match(validate({
    ...completeCompositionInput,
    content_html: '<div><template shadowrootmode="closed"><img src="data:image/png;base64,AAAA"></template></div>',
  }).errors.join('\n'), /executable or embedded-resource markup/, 'Studio validation accepted an unauditable declarative shadow root');
  for (const inlineImage of [
    '<img src="data:image/png;base64,AAAA">',
    '<img src="data&#58;image/png;base64,AAAA">',
    '<img src="data&#58image/png;base64,AAAA">',
    '<img src="data&#x3aimage/png;base64,AAAA">',
    '<img src="data&#000058image/png;base64,AAAA">',
    '<div style="background:url(\\64 ata:image/png;base64,AAAA)"></div>',
  ]) {
    assert.match(validate({ ...completeCompositionInput, content_html: inlineImage }).errors.join('\n'), /cannot embed authored data:image resources/, 'Studio validation accepted an unbounded authored data image');
  }
  assert.doesNotThrow(
    () => validate({ ...completeCompositionInput, content_html: '<div style="background:url(\\ffffff)">safe fallback</div>' }),
    'Studio validation threw while decoding an out-of-range CSS escape',
  );
  assert.match(validate({
    ...completeCompositionInput,
    content_html: 'x'.repeat(1_000_001),
  }).errors.join('\n'), /content_html must be at most 1000000 characters/, 'Studio validation accepted unbounded composition HTML');
  assert.match(validate({
    ...completeCompositionInput,
    custom_css: 'x'.repeat(262_145),
  }).errors.join('\n'), /custom_css must be at most 262144 characters/, 'Studio validation accepted unbounded composition CSS');
  const completeCompositionValidation = validate(completeCompositionInput);
  assert.equal(completeCompositionValidation.valid, true, `complete required composition failed validation: ${completeCompositionValidation.errors.join(', ')}`);
  assert.throws(
    () => renderers['editorial-image'].render({ ...completeCompositionInput, custom_css: '' }, path.join(tmpDir, 'incomplete-required-composition.html')),
    /composition_required=true requires non-empty "custom_css"/,
    'renderer did not defend the required composition contract',
  );
  assert.throws(
    () => renderers['editorial-image'].render({
      mode: 'editorial-image',
      title: 'A missing scene',
      use: 'metaphor',
    }, path.join(tmpDir, 'metaphor-scaffold-fallback.html')),
    /requires composition_required=true/,
    'renderer allowed a metaphor to fall back to the cover scaffold',
  );

  const requiredCompositionPath = path.join(tmpDir, 'required-composition.html');
  renderers['editorial-image'].render(completeCompositionInput, requiredCompositionPath);
  const requiredCompositionHtml = stripComments(fs.readFileSync(requiredCompositionPath, 'utf8'));
  assert.match(requiredCompositionHtml, /data-composition-required="true"/, 'required composition was not marked in rendered HTML');
  assert.match(requiredCompositionHtml, /class="converge-fixture"/, 'required composition did not render its visible subject');
  assert.doesNotMatch(requiredCompositionHtml, /class="paper-stack/, 'required composition silently fell back to the default scaffold');

  const authorAliasValidation = validate({ mode: 'big', phrase: 'No alias', author: 'Someone' });
  assert.equal(authorAliasValidation.valid, false, 'author alias unexpectedly passed validation');
  assert.match(authorAliasValidation.errors.join('\n'), /Use "brand_name"/);

  const photoAliasValidation = validate({ mode: 'big', phrase: 'No alias', photo: 'avatar.png' });
  assert.equal(photoAliasValidation.valid, false, 'photo alias unexpectedly passed validation');
  assert.match(photoAliasValidation.errors.join('\n'), /Use "logo"/);

  assert.equal(renderers.big.normalizeFontSize(172), '172px', 'numeric big font_size did not resolve to px');
  assert.equal(renderers.big.normalizeFontSize('172'), '172px', 'numeric string big font_size did not resolve to px');

  const numericBigPath = path.join(tmpDir, 'numeric-big-font.html');
  const numericBigOutput = renderers.big.render({
    mode: 'big',
    phrase: 'Make it<br>large',
    font_size: 172,
  }, numericBigPath);
  const numericBigHtml = stripComments(fs.readFileSync(numericBigPath, 'utf8'));
  assert.match(numericBigHtml, /data-card-mode="big"/, 'big render did not mark its output mode');
  assert.match(numericBigHtml, /style="font-size: 172px;"/, 'numeric big font_size was not emitted with px');
  const numericBigCheck = runOutputCheck(numericBigPath, numericBigOutput);
  assert.equal(numericBigCheck.result.status, 0, `numeric big font-size failed output check: ${numericBigCheck.result.stdout}\n${numericBigCheck.result.stderr}`);
  assert.equal(numericBigCheck.report?.pass, true, 'numeric big font-size did not pass');

  const tinyBigPath = path.join(tmpDir, 'tiny-big-font.html');
  const tinyBigOutput = renderers.big.render({
    mode: 'big',
    phrase: 'Tiny visual phrase',
    font_size: 16,
  }, tinyBigPath);
  const tinyBigCheck = runOutputCheck(tinyBigPath, tinyBigOutput);
  assert.notEqual(tinyBigCheck.result.status, 0, 'undersized big phrase unexpectedly passed output check');
  assert.equal(tinyBigCheck.report?.pass, false, 'undersized big phrase did not produce a failing report');
  assert.match(
    tinyBigCheck.report?.issues?.map(item => item.code).join('\n') || '',
    /big_phrase_too_small/,
    `undersized big phrase failed for the wrong reason: ${tinyBigCheck.result.stdout}\n${tinyBigCheck.result.stderr}`,
  );

  const customEditorialPath = path.join(tmpDir, 'custom-editorial.html');
  renderers['editorial-image'].render({
    mode: 'editorial-image',
    title: 'Attention has a boundary',
    use: 'in-article',
    aspect: 'body-3-2',
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
      .attention-workbench { height: 100%; display: grid; place-items: center; }
      .page-field { position: relative; width: 70%; height: 70%; border: 1px solid var(--hairline); }
      .focus-beam { position: absolute; inset: 18% 36%; border-top: 3px solid var(--accent); }
      .center-note { position: absolute; left: 36%; top: 45%; font: 700 44px/1 var(--mono); color: var(--ink); }
      .faded-sheet { position: absolute; width: 28%; height: 42%; border: 1px solid var(--hairline); opacity: .35; }
      .sheet-left { left: 8%; top: 22%; transform: rotate(-7deg); }
      .sheet-right { right: 8%; top: 26%; transform: rotate(6deg); }
    `,
  }, customEditorialPath);
  const customEditorialHtml = stripComments(fs.readFileSync(customEditorialPath, 'utf8'));
  assert.match(customEditorialHtml, /attention-workbench/, 'custom editorial composition was not rendered');
  assert.match(customEditorialHtml, /focus-beam/, 'custom editorial subject was not rendered');
  assert.match(customEditorialHtml, /data-card-mode="editorial-image"/, 'editorial-image render did not mark its output mode');
  assert.doesNotMatch(customEditorialHtml, /<section class="editorial-frame/, 'custom editorial render fell back to the scaffold content');
  assert.doesNotMatch(customEditorialHtml, /<div class="paper-stack/, 'custom editorial render injected scaffold paper stack nodes');

  const allowedFontPath = path.join(tmpDir, 'allowed-editorial-font.html');
  const allowedFontOutput = renderers['editorial-image'].render({
    mode: 'editorial-image',
    title: 'Controlled font stack',
    use: 'in-article',
    aspect: 'body-3-2',
    composition_required: true,
    content_html: `
      <section class="font-fixture">
        <div class="font-fixture-body">Controlled font stack</div>
      </section>
    `,
    custom_css: `
      .font-fixture { width: 100%; height: 100%; display: grid; place-items: center; font-family: "DM Sans", Arial, sans-serif; }
      .font-fixture-body { font-size: 42px; font-weight: 700; }
    `,
  }, allowedFontPath);
  const allowedFontCheck = runOutputCheck(allowedFontPath, allowedFontOutput);
  assert.equal(allowedFontCheck.result.status, 0, `allowed editorial font stack failed output check: ${allowedFontCheck.result.stdout}\n${allowedFontCheck.result.stderr}`);
  assert.equal(allowedFontCheck.report?.pass, true, 'allowed editorial font stack did not pass');

  const rejectedFontPath = path.join(tmpDir, 'rejected-editorial-font.html');
  const rejectedFontOutput = renderers['editorial-image'].render({
    mode: 'editorial-image',
    title: 'Rejected font stack',
    use: 'in-article',
    aspect: 'body-3-2',
    composition_required: true,
    content_html: `
      <section class="font-fixture">
        <div class="font-fixture-body">Rejected font stack</div>
      </section>
    `,
    custom_css: `
      .font-fixture { width: 100%; height: 100%; display: grid; place-items: center; font-family: Inter, Arial, sans-serif; }
      .font-fixture-body { font-size: 42px; font-weight: 700; }
    `,
  }, rejectedFontPath);
  const rejectedFontCheck = runOutputCheck(rejectedFontPath, rejectedFontOutput);
  assert.notEqual(rejectedFontCheck.result.status, 0, 'rejected editorial font stack unexpectedly passed output check');
  assert.equal(rejectedFontCheck.report?.pass, false, 'rejected editorial font stack did not produce a failing report');
  assert.match(
    rejectedFontCheck.report?.issues?.map(item => item.code).join('\n') || '',
    /editorial_font_primary_not_allowed/,
    `rejected editorial font stack failed for the wrong reason: ${rejectedFontCheck.result.stdout}\n${rejectedFontCheck.result.stderr}`,
  );

  const allowedBoxTextPath = path.join(tmpDir, 'allowed-box-text.html');
  const allowedBoxTextOutput = renderers['editorial-image'].render({
    mode: 'editorial-image',
    title: 'Framed label fits',
    use: 'in-article',
    aspect: 'body-3-2',
    composition_required: true,
    content_html: `
      <section class="box-fixture">
        <div class="label-box"><span>COMMANDS</span></div>
      </section>
    `,
    custom_css: `
      .box-fixture { width: 100%; height: 100%; display: grid; place-items: center; font-family: "DM Sans", Arial, sans-serif; }
      .label-box { width: 300px; height: 96px; border: 1px solid var(--hairline); display: flex; align-items: center; justify-content: center; }
      .label-box span { font-size: 42px; font-weight: 700; white-space: nowrap; }
    `,
  }, allowedBoxTextPath);
  const allowedBoxTextCheck = runOutputCheck(allowedBoxTextPath, allowedBoxTextOutput);
  assert.equal(allowedBoxTextCheck.result.status, 0, `fitting framed text failed output check: ${allowedBoxTextCheck.result.stdout}\n${allowedBoxTextCheck.result.stderr}`);
  assert.equal(allowedBoxTextCheck.report?.pass, true, 'fitting framed text did not pass');

  const rejectedBoxTextPath = path.join(tmpDir, 'rejected-box-text.html');
  const rejectedBoxTextOutput = renderers['editorial-image'].render({
    mode: 'editorial-image',
    title: 'Framed label overflows',
    use: 'in-article',
    aspect: 'body-3-2',
    composition_required: true,
    content_html: `
      <section class="box-fixture">
        <div class="label-box"><span>COMMANDS</span></div>
      </section>
    `,
    custom_css: `
      .box-fixture { width: 100%; height: 100%; display: grid; place-items: center; font-family: "DM Sans", Arial, sans-serif; }
      .label-box { width: 150px; height: 96px; border: 1px solid var(--hairline); display: flex; align-items: center; justify-content: center; }
      .label-box span { font-size: 42px; font-weight: 700; white-space: nowrap; }
    `,
  }, rejectedBoxTextPath);
  const rejectedBoxTextCheck = runOutputCheck(rejectedBoxTextPath, rejectedBoxTextOutput);
  assert.notEqual(rejectedBoxTextCheck.result.status, 0, 'overflowing framed text unexpectedly passed output check');
  assert.equal(rejectedBoxTextCheck.report?.pass, false, 'overflowing framed text did not produce a failing report');
  assert.match(
    rejectedBoxTextCheck.report?.issues?.map(item => item.code).join('\n') || '',
    /html_text_box_overflow/,
    `overflowing framed text failed for the wrong reason: ${rejectedBoxTextCheck.result.stdout}\n${rejectedBoxTextCheck.result.stderr}`,
  );

  const rejectedVisualSystemPath = path.join(tmpDir, 'rejected-editorial-visual-system.html');
  const rejectedVisualSystemOutput = renderers['editorial-image'].render({
    mode: 'editorial-image',
    title: 'Visual system drift',
    use: 'in-article',
    aspect: 'body-3-2',
    composition_required: true,
    content_html: `
      <section class="visual-fixture">
        <div class="loud-module"><span>MODULE</span></div>
      </section>
    `,
    custom_css: `
      .visual-fixture { width: 100%; height: 100%; display: grid; place-items: center; font-family: "DM Sans", Arial, sans-serif; }
      .loud-module { width: 320px; height: 180px; border: 4px solid #191816; background: #f4d35e; display: flex; align-items: center; justify-content: center; }
      .loud-module span { font-size: 42px; font-weight: 700; white-space: nowrap; }
    `,
  }, rejectedVisualSystemPath);
  const rejectedVisualSystemCheck = runOutputCheck(rejectedVisualSystemPath, rejectedVisualSystemOutput);
  assert.notEqual(rejectedVisualSystemCheck.result.status, 0, 'editorial visual-system drift unexpectedly passed output check');
  assert.equal(rejectedVisualSystemCheck.report?.pass, false, 'editorial visual-system drift did not produce a failing report');
  assert.match(
    rejectedVisualSystemCheck.report?.issues?.map(item => item.code).join('\n') || '',
    /editorial_visual_system_violation/,
    `editorial visual-system drift failed for the wrong reason: ${rejectedVisualSystemCheck.result.stdout}\n${rejectedVisualSystemCheck.result.stderr}`,
  );

  for (const [family, fixture] of Object.entries(articleDiagramFixtures)) {
    const validation = validate(fixture);
    assert.equal(validation.valid, true, `${family} article-diagram fixture failed validation: ${validation.errors.join(', ')}`);
    const outputPath = path.join(tmpDir, `article-diagram-${family}.html`);
    const output = renderers['article-diagram'].render(fixture, outputPath);
    const html = stripComments(fs.readFileSync(outputPath, 'utf8'));
    assert.match(html, /data-card-mode="article-diagram"/, `${family} did not mark article-diagram mode`);
    assert.match(html, new RegExp(`data-diagram-family="${family}"`), `${family} did not mark its family`);
    const check = runOutputCheck(outputPath, output);
    assert.equal(check.result.status, 0, `${family} article-diagram failed output check: ${check.result.stdout}\n${check.result.stderr}`);
    assert.equal(check.report?.pass, true, `${family} article-diagram did not pass`);
  }

  const compressionPackFixture = {
    mode: 'article-diagram',
    title: '多 Agent 的写入边界',
    subtitle: '压缩成公式卡',
    formula: '安全协作 = 单线程写入 + 共享轨迹 + 旁路判断',
    sentence: '多 agent 不是多条线同时修改，而是主线负责写入，旁路线把检索、验证和摘要回流给主线。',
    structure: {
      nodes: [
        { id: 'trace', label: '共享轨迹', note: '完整决策过程' },
        { id: 'writer', label: '单线程写入', note: '唯一修改路径' },
        { id: 'helpers', label: '旁路 agent', note: '检索 / 验证 / 总结' },
        { id: 'tools', label: '工具执行', note: '受控副作用' },
      ],
      relations: [
        { from: 'helpers', to: 'trace', label: '贡献判断' },
        { from: 'trace', to: 'writer', label: '约束写入' },
        { from: 'writer', to: 'tools', label: '调用' },
      ],
    },
    caption: '默认输出不显示标题、caption 或结构图。',
    source: 'Context 工程',
  };
  const compressionValidation = validate(compressionPackFixture);
  assert.equal(compressionValidation.valid, true, `compression-pack article-diagram fixture failed validation: ${compressionValidation.errors.join(', ')}`);
  assert.equal(
    renderers['article-diagram'].analyzeFormulaCardContent(compressionPackFixture).variant,
    'editorial-equation',
    'compression formula card should use the unified Editorial Equation layout',
  );
  assert.equal(renderers['article-diagram'].analyzeFormulaCardContent(compressionPackFixture).id, 'large', 'short compression formula card should use the large type scale');
  assert.equal(renderers['article-diagram'].analyzeFormulaCardContent(compressionPackFixture).formulaRows, 1, 'short compression formula card should stay on one semantic row');
  const compressionPath = path.join(tmpDir, 'article-diagram-compression-pack.html');
  const compressionOutput = renderers['article-diagram'].render(compressionPackFixture, compressionPath);
  assert.equal(Array.isArray(compressionOutput), false, 'compression-pack should render one formula card by default');
  {
    const html = stripComments(fs.readFileSync(compressionOutput.htmlPath, 'utf8'));
    assert.match(html, /data-diagram-family="compression-pack"/, 'compression output did not mark compression-pack');
    assert.match(html, /data-compression-view="summary"/, 'compression output did not mark summary view');
    assert.match(html, /formula-card-plate/, 'compression output did not render the formula card');
    assert.match(html, /formula-card-body/, 'compression output did not use the single-body formula card layout');
    assert.match(html, /formula-layout-editorial-equation/, 'compression output did not use Editorial Equation layout');
    assert.match(html, /formula-density-compact/, 'compact compression output did not mark compact density');
    assert.match(html, /data-formula-scale="large"/, 'short compression output did not mark the large type scale');
    assert.match(html, /data-formula-rows="1"/, 'short compression output did not mark one formula row');
    assert.match(html, /formula-expression/, 'compression output did not render the semantic formula expression');
    assert.match(html, /formula-card-deck/, 'compression output did not render the explanation as a deck');
    assert.doesNotMatch(html, /<section[^>]*figure-sheet/, 'compression output unexpectedly rendered the article figure sheet');
    assert.doesNotMatch(html, /formula-chip/, 'compression output unexpectedly used the old chip formula layout');
    assert.doesNotMatch(html, /formula-card-sentence/, 'compression output unexpectedly used the old detached sentence layout');
    assert.doesNotMatch(html, /formula-layout-(?:compact-inline|ledger|annotation-tall)/, 'compression output leaked an old formula layout variant');
    assert.doesNotMatch(html, /<header class="diagram-header"/, 'compression formula card unexpectedly rendered a visible title header');
    assert.doesNotMatch(html, /<p class="diagram-caption"/, 'compression formula card unexpectedly rendered a visible caption');
    const check = runOutputCheck(compressionOutput.htmlPath, compressionOutput);
    assert.equal(check.result.status, 0, `compression-pack output failed output check: ${check.result.stdout}\n${check.result.stderr}`);
    assert.equal(check.report?.pass, true, 'compression-pack output did not pass');
    const missingMetricsPath = path.join(tmpDir, 'article-diagram-compression-pack-missing-metrics.html');
    fs.writeFileSync(missingMetricsPath, html.replace('data-formula-card="true"', ''), 'utf8');
    const missingMetricsCheck = runOutputCheck(missingMetricsPath, compressionOutput);
    assert.notEqual(missingMetricsCheck.result.status, 0, 'compression summary without semantic formula markers unexpectedly passed output check');
    assert.ok(missingMetricsCheck.report?.issues?.some(item => item.code === 'article_diagram_formula_metrics_missing'), 'missing formula metrics did not report the expected issue code');
  }
  assert.equal(renderers['article-diagram'].defaultAspect(compressionPackFixture), 'body-2-1', 'compact compression formula card should default to body-2-1');
  const mediumCompressionPackFixture = {
    ...compressionPackFixture,
    formula: '可审计协作 = 单线程写入 + 共享轨迹 + 旁路检索 + 旁路验证 + 摘要回流',
    sentence: '多 Agent 协作仍由主线写入，旁路线只贡献判断。',
  };
  assert.equal(
    renderers['article-diagram'].analyzeFormulaCardContent(mediumCompressionPackFixture).id,
    'medium',
    'multi-term compression formula card should use the medium type scale',
  );
  assert.equal(renderers['article-diagram'].analyzeFormulaCardContent(mediumCompressionPackFixture).formulaRows, 2, 'multi-term compression formula card should use two semantic rows');
  assert.equal(renderers['article-diagram'].defaultAspect(mediumCompressionPackFixture), 'body-2-1', 'medium compression formula card should stay body-2-1');
  {
    const mediumPath = path.join(tmpDir, 'article-diagram-compression-pack-medium.html');
    const mediumOutput = renderers['article-diagram'].render(mediumCompressionPackFixture, mediumPath);
    const html = stripComments(fs.readFileSync(mediumOutput.htmlPath, 'utf8'));
    assert.match(html, /data-formula-scale="medium"/, 'medium compression output did not mark the medium type scale');
    assert.match(html, /data-formula-rows="2"/, 'medium compression output did not render two semantic rows');
    assert.doesNotMatch(html, /formula-ledger/, 'medium compression output unexpectedly rendered the retired ledger layout');
    const check = runOutputCheck(mediumOutput.htmlPath, mediumOutput);
    assert.equal(check.result.status, 0, `medium compression-pack output failed output check: ${check.result.stdout}\n${check.result.stderr}`);
    assert.equal(check.report?.pass, true, 'medium compression-pack output did not pass');
  }
  const longCompressionPackFixture = {
    ...mediumCompressionPackFixture,
    formula: '可持续的 Agent 协作 = 主线程保持单一写入权 + 辅助 Agent 只提供检索与验证 + 所有结果通过摘要回流进入共享轨迹',
    sentence: '当公式项和解释句同时变长时，画布增加的是承载空间，而不是无目的的留白；字体也不会被压缩到不可读。',
  };
  assert.equal(
    renderers['article-diagram'].analyzeFormulaCardContent(longCompressionPackFixture).id,
    'small',
    'long compression formula card should use the smallest approved type scale',
  );
  assert.equal(renderers['article-diagram'].analyzeFormulaCardContent(longCompressionPackFixture).formulaRows, 3, 'long compression formula card should use three semantic rows');
  assert.equal(renderers['article-diagram'].analyzeFormulaCardContent(longCompressionPackFixture).noteLines, 2, 'long compression formula card should keep the note to two lines');
  assert.equal(renderers['article-diagram'].defaultAspect(longCompressionPackFixture), 'body-3-2', 'long compression formula card should use body-3-2');
  {
    const longPath = path.join(tmpDir, 'article-diagram-compression-pack-long.html');
    const longOutput = renderers['article-diagram'].render(longCompressionPackFixture, longPath);
    const html = stripComments(fs.readFileSync(longOutput.htmlPath, 'utf8'));
    assert.match(html, /data-formula-scale="small"/, 'long compression output did not mark the small type scale');
    assert.match(html, /data-formula-rows="3"/, 'long compression output did not render three semantic rows');
    assert.match(html, /data-note-lines="2"/, 'long compression output did not mark a two-line note');
    const check = runOutputCheck(longOutput.htmlPath, longOutput);
    assert.equal(check.result.status, 0, `long compression-pack output failed output check: ${check.result.stdout}\n${check.result.stderr}`);
    assert.equal(check.report?.pass, true, 'long compression-pack output did not pass');
  }
  const mixedCompressionAnalysis = renderers['article-diagram'].analyzeFormulaCardContent({
    ...compressionPackFixture,
    formula: 'Agent 可靠性 = single-writer ownership + 可追溯 transcript + bounded tool effects',
    sentence: '中英文混排仍需保持完整 term，不允许在单个语义项内部断行。',
  });
  assert.equal(mixedCompressionAnalysis.variant, 'editorial-equation', 'mixed-language formula should keep the unified layout');
  assert.equal(mixedCompressionAnalysis.termLines.flat().length, 3, 'mixed-language formula should preserve all semantic terms');
  const arrowCompressionAnalysis = renderers['article-diagram'].analyzeFormulaCardContent({
    ...compressionPackFixture,
    formula: '原始请求 → 可验证结果',
    sentence: '箭头关系应保留原始方向。',
  });
  assert.equal(arrowCompressionAnalysis.relation, '→', 'arrow formula should preserve its relation operator');
  const tooWideResultFormula = '这是一个无法在批准字号下完整放入画布的超长主结论名称 = 简短项';
  assert.throws(
    () => renderers['article-diagram'].analyzeFormulaCardContent({
      ...compressionPackFixture,
      formula: tooWideResultFormula,
      sentence: '主结论不能溢出画布。',
    }),
    /article_diagram_formula_too_dense/,
    'an over-wide result should fail instead of overflowing the card',
  );
  const structureOnlyFixture = {
    ...compressionPackFixture,
    formula: tooWideResultFormula,
    sentence: '结构视图不应被未展示的公式布局阻断。',
    render_plan: 'structure',
  };
  assert.equal(
    renderers['article-diagram'].renderMeasure(structureOnlyFixture, path.join(tmpDir, 'unused-structure-measure.html')),
    null,
    'structure-only compression output should skip formula measurement',
  );
  const structureOnlyPath = path.join(tmpDir, 'article-diagram-compression-pack-structure-only.html');
  const structureOnlyOutput = renderers['article-diagram'].render(structureOnlyFixture, structureOnlyPath);
  assert.match(fs.readFileSync(structureOnlyOutput.htmlPath, 'utf8'), /data-compression-view="structure"/, 'structure-only compression output did not render its requested view');
  const structureOnlyCheck = runOutputCheck(structureOnlyOutput.htmlPath, structureOnlyOutput);
  assert.equal(structureOnlyCheck.result.status, 0, `structure-only compression output failed output check: ${structureOnlyCheck.result.stdout}\n${structureOnlyCheck.result.stderr}`);
  const splitCompressionPath = path.join(tmpDir, 'article-diagram-compression-pack-split.html');
  const splitCompressionOutput = renderers['article-diagram'].render(
    { ...compressionPackFixture, render_plan: 'split' },
    splitCompressionPath,
  );
  assert.equal(Array.isArray(splitCompressionOutput), true, 'compression-pack split plan should render multiple outputs');
  assert.equal(splitCompressionOutput.length, 2, 'compression-pack split plan should render summary and structure outputs');
  for (const [i, output] of splitCompressionOutput.entries()) {
    const html = stripComments(fs.readFileSync(output.htmlPath, 'utf8'));
    assert.match(html, /data-compression-view="(summary|structure)"/, `split compression output ${i + 1} did not mark its view`);
    const check = runOutputCheck(output.htmlPath, output);
    assert.equal(check.result.status, 0, `split compression-pack output ${i + 1} failed output check: ${check.result.stdout}\n${check.result.stderr}`);
    assert.equal(check.report?.pass, true, `split compression-pack output ${i + 1} did not pass`);
  }
  runCardCli(compressionPackFixture, 'compression-pack', 1);
  runCardCli({ ...compressionPackFixture, render_plan: 'split' }, 'compression-pack-split', 2);
  const measuredNoteFixture = {
    ...compressionPackFixture,
    sentence: 'i'.repeat(120),
  };
  assert.throws(
    () => renderers['article-diagram'].analyzeFormulaCardContent(measuredNoteFixture),
    /article_diagram_formula_too_dense/,
    'fallback estimation should expose the regression fixture before the real-font measure pass',
  );
  runCardCli(measuredNoteFixture, 'compression-pack-measured-note', 1);

  const repeatedChineseLinkPath = path.join(tmpDir, 'article-diagram-repeated-chinese-link-labels.html');
  const repeatedChineseLinkOutput = renderers['article-diagram'].render({
    mode: 'article-diagram',
    family: 'concept-map',
    title: '五种不稳定因素逼出 Harness',
    subtitle: '第 1 节：Harness 先解决什么问题',
    nodes: [
      { id: 'state', label: '状态盲区', note: '事实不完整' },
      { id: 'action', label: '行动风险', note: '真实机器边界' },
      { id: 'context', label: '上下文噪声', note: '长任务污染' },
      { id: 'trace', label: '过程追溯', note: '改动要可查' },
      { id: 'growth', label: '能力增长', note: '核心不能膨胀' },
    ],
    links: [
      { from: 'state', to: 'action', label: '叠加' },
      { from: 'state', to: 'context', label: '叠加' },
      { from: 'state', to: 'trace', label: '叠加' },
      { from: 'state', to: 'growth', label: '叠加' },
    ],
    caption: 'Pi 不是先相信模型，而是先把不稳定因素收进可验证的工作环境。',
    source: 'Pi Agent Harness',
  }, repeatedChineseLinkPath);
  const repeatedChineseLinkHtml = stripComments(fs.readFileSync(repeatedChineseLinkPath, 'utf8'));
  assert.doesNotMatch(repeatedChineseLinkHtml, /class="diagram-link-label"[\s\S]*?>\s*叠加\s*</, 'duplicated concept-map link labels should be hidden');
  const repeatedChineseLinkCheck = runOutputCheck(repeatedChineseLinkPath, repeatedChineseLinkOutput);
  assert.equal(repeatedChineseLinkCheck.result.status, 0, `repeated Chinese link-label concept-map failed output check: ${repeatedChineseLinkCheck.result.stdout}\n${repeatedChineseLinkCheck.result.stderr}`);
  assert.equal(repeatedChineseLinkCheck.report?.pass, true, 'repeated Chinese link-label concept-map did not pass');

  runCardCli({
    mode: 'article-diagram',
    family: 'concept-map',
    title: '压缩策略分成三派',
    subtitle: 'Claude、Codex、Cursor 对上下文溢出的答案不同',
    nodes: [
      { id: 'overflow', label: '窗口满了', note: '长任务必然遇到' },
      { id: 'claude', label: 'Claude Code', note: '同步压缩，预防溢出' },
      { id: 'codex', label: 'Codex CLI', note: 'handoff 给下一个 LLM' },
      { id: 'cursor', label: 'Cursor', note: '变成文件，按需回溯' },
    ],
    links: [
      { from: 'overflow', to: 'claude', label: '分区管理', direction: 'one-way' },
      { from: 'overflow', to: 'codex', label: '传承式压缩', direction: 'one-way' },
      { from: 'overflow', to: 'cursor', label: '文件化', direction: 'one-way' },
    ],
    caption: 'summary 是地图；原始记录、隐状态或规则重注入决定它能不能继续工作。',
    source: 'Context 工程',
  }, 'hub-spoke-concept-labels');

  const sparseBoundaryFixture = {
    mode: 'article-diagram',
    family: 'boundary-model',
    title: 'Project Trust 只是入口控制',
    subtitle: '真正隔离仍在外层系统边界',
    design: 'stripe',
    zones: [
      { id: 'external', label: 'External isolation' },
      { id: 'local', label: 'Local user process' },
      { id: 'trust', label: 'Project Trust' },
    ],
    nodes: [
      { id: 'container', label: '容器 / VM 边界', zone: 'external' },
      { id: 'pi', label: 'pi + tools + shell', zone: 'local' },
      { id: 'gate', label: '加载闸门', zone: 'trust' },
    ],
    caption: 'Project Trust 是加载闸门，不是 sandbox；强隔离要交给外部环境。',
  };
  assert.equal(renderers['article-diagram'].defaultAspect(sparseBoundaryFixture), 'body-3-2', 'sparse 3-zone boundary-model should use the compact body aspect');
  runCardCli(sparseBoundaryFixture, 'sparse-boundary-model');

  const denseBoundaryFixture = {
    mode: 'article-diagram',
    family: 'boundary-model',
    title: 'Project Trust 只是入口控制',
    subtitle: '真正隔离仍在外层系统边界',
    zones: [
      { id: 'external', label: 'External isolation', description: '容器、VM、远程环境或系统 sandbox' },
      { id: 'process', label: 'Local user process', description: 'agent loop、shell、tools 和工作目录' },
      { id: 'trust', label: 'Project Trust', description: '决定是否加载项目级能力' },
    ],
    nodes: [
      { id: 'container', label: '容器 / VM 边界', note: '隔离副作用', zone: 'external' },
      { id: 'shell', label: 'pi + tools + shell', note: '实际执行命令', zone: 'process' },
      { id: 'gate', label: '加载闸门', note: '信任后才启用', zone: 'trust' },
    ],
    caption: 'Project Trust 是加载闸门，不是 sandbox；强隔离要交给外部环境。',
  };
  assert.equal(renderers['article-diagram'].defaultAspect(denseBoundaryFixture), 'body-4-3', 'dense 3-zone boundary-model should use the tall body aspect');
  runCardCli(denseBoundaryFixture, 'dense-boundary-model');
  runCardCli({ ...denseBoundaryFixture, aspect: 'body-3-2' }, 'dense-boundary-model-auto-rescue');

  const multiAgentBoundaryFixture = {
    mode: 'article-diagram',
    family: 'boundary-model',
    title: '多 Agent 的写入边界',
    subtitle: '写入保持单线程，其他 agent 只贡献智能',
    zones: [
      { id: 'shared', label: 'Shared trace', description: '完整决策过程和可审计历史' },
      { id: 'writer', label: 'Single writer', description: '唯一修改工作区的执行线' },
      { id: 'helpers', label: 'Helper agents', description: '并行探索、验证、检索、总结' },
    ],
    nodes: [
      { id: 'trace', label: '共享上下文', note: '避免碎片化', zone: 'shared' },
      { id: 'commit', label: '单线程写入', note: '避免冲突修改', zone: 'writer' },
      { id: 'search', label: '检索 / 验证', note: '贡献判断', zone: 'helpers' },
      { id: 'summary', label: '摘要回流', note: '进入主线', zone: 'helpers' },
    ],
    caption: '多 agent 不是多条线同时乱写，而是主线写入、旁路线贡献智能。',
    source: 'Context 工程',
  };
  assert.equal(renderers['article-diagram'].defaultAspect(multiAgentBoundaryFixture), 'body-4-3', 'multi-node described boundary-model should use the tall body aspect');
  runCardCli(multiAgentBoundaryFixture, 'multi-agent-boundary-model');

  const processFlowCaptionFixture = {
    mode: 'article-diagram',
    family: 'process-flow',
    title: 'Agent loop 保持很小',
    subtitle: '工具、界面、会话和扩展围绕它工作',
    design: 'claude',
    nodes: [
      { id: 'user', label: '用户请求', note: 'steering / follow-up' },
      { id: 'model', label: '模型决策', note: '请求工具或返回' },
      { id: 'tool', label: '工具执行', note: '并发跑、按序写' },
      { id: 'next', label: '下一轮', note: '结果回写为 tool result' },
    ],
    caption: '工具结果按请求顺序写入 transcript；同一事件也分流到 UI、session 与 extension。',
  };
  const processFlowCaptionPath = path.join(tmpDir, 'process-flow-caption.html');
  const processFlowCaptionOutput = renderers['article-diagram'].render(processFlowCaptionFixture, processFlowCaptionPath);
  const processFlowCaptionCheck = runOutputCheck(processFlowCaptionPath, processFlowCaptionOutput);
  assert.equal(processFlowCaptionCheck.result.status, 0, `process-flow caption fixture failed output check: ${processFlowCaptionCheck.result.stdout}\n${processFlowCaptionCheck.result.stderr}`);
  assert.equal(processFlowCaptionCheck.report?.pass, true, 'process-flow caption fixture did not pass');
  runCardCli(processFlowCaptionFixture, 'process-flow-caption');

  const badCaptionPath = path.join(tmpDir, 'article-diagram-bad-caption.html');
  fs.writeFileSync(badCaptionPath, `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 1080px; height: 720px; font-family: "DM Sans", Arial, sans-serif; }
  .page { width: 1080px; height: 720px; padding: 60px; }
  .diagram-stage { width: 960px; height: 420px; border: 1px solid #d8d1c2; }
  .diagram-caption { width: 360px; font: 500 26px/1.3 "DM Sans", Arial, sans-serif; text-wrap: balance; }
</style>
</head>
<body>
  <div class="page" data-card-mode="article-diagram">
    <section class="diagram-stage"></section>
    <p class="diagram-caption">工具结果按请求顺序写入 transcript；<br>同一事件也分流到 UI、session 与 extension。</p>
  </div>
</body>
</html>`, 'utf8');
  const badCaptionCheck = runOutputCheck(badCaptionPath, {
    captureWidth: 1080,
    captureHeight: 720,
    fullpage: false,
  });
  assert.notEqual(badCaptionCheck.result.status, 0, 'narrow article-diagram caption unexpectedly passed output check');
  assert.equal(badCaptionCheck.report?.pass, false, 'narrow article-diagram caption did not produce a failing report');
  assert.match(
    badCaptionCheck.report?.issues?.map(item => item.code).join('\n') || '',
    /article_diagram_caption_layout/,
    `narrow article-diagram caption failed for the wrong reason: ${badCaptionCheck.result.stdout}\n${badCaptionCheck.result.stderr}`,
  );

  const badBandHeaderPath = path.join(tmpDir, 'article-diagram-band-header-overlap.html');
  fs.writeFileSync(badBandHeaderPath, `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root {
    --bg: #f6f4ee;
    --surface-1: #fbfaf6;
    --accent: #314d73;
    --ink: #172434;
    --ink-light: #59645e;
    --hairline: #d8d1c2;
  }
  * { box-sizing: border-box; }
  body { margin: 0; width: 1080px; height: 720px; font-family: "DM Sans", Arial, sans-serif; background: var(--bg); color: var(--ink); }
  .page { width: 1080px; height: 720px; padding: 60px; }
  .diagram-stage { position: relative; width: 960px; height: 560px; border: 1px solid var(--hairline); background: var(--surface-1); }
  .boundary-band { position: absolute; left: 72px; right: 72px; top: 330px; height: 160px; padding: 14px 18px; border: 1px solid var(--hairline); }
  .band-header strong { display: block; font: 700 26px/1 "DM Sans", Arial, sans-serif; color: var(--accent); }
  .band-caption { display: block; margin-top: 6px; max-width: 300px; font: 500 24px/1.16 "DM Sans", Arial, sans-serif; color: var(--ink-light); white-space: nowrap; }
  .band-node { position: absolute; left: 250px; top: 405px; width: 316px; min-height: 95px; padding: 13px 16px; border: 1px solid var(--hairline); background: var(--surface-1); }
  .band-node strong { display: block; font: 700 30px/1.04 "DM Sans", Arial, sans-serif; }
</style>
</head>
<body>
  <div class="page" data-card-mode="article-diagram">
    <section class="diagram-stage boundary-model boundary-bands">
      <div class="boundary-band">
        <div class="band-header">
          <strong>Helper agents</strong>
          <span class="band-caption">并行探索、验证、检索、总结</span>
        </div>
      </div>
      <div class="boundary-node band-node"><strong>检索 / 验证</strong></div>
    </section>
  </div>
</body>
</html>`, 'utf8');
  const badBandHeaderCheck = runOutputCheck(badBandHeaderPath, {
    captureWidth: 1080,
    captureHeight: 720,
    fullpage: false,
  });
  assert.notEqual(badBandHeaderCheck.result.status, 0, 'overlapping article-diagram band header unexpectedly passed output check');
  assert.equal(badBandHeaderCheck.report?.pass, false, 'overlapping article-diagram band header did not produce a failing report');
  assert.match(
    badBandHeaderCheck.report?.issues?.map(item => item.code).join('\n') || '',
    /article_diagram_band_header_overlap/,
    `overlapping article-diagram band header failed for the wrong reason: ${badBandHeaderCheck.result.stdout}\n${badBandHeaderCheck.result.stderr}`,
  );

  const labelCollisionPath = path.join(tmpDir, 'article-diagram-label-collision.html');
  fs.writeFileSync(labelCollisionPath, `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root {
    --bg: #f6f4ee;
    --surface-1: #fbfaf6;
    --surface-2: #e8e3d6;
    --accent: #314d73;
    --ink: #172434;
    --ink-light: #59645e;
    --hairline: #d8d1c2;
  }
  * { box-sizing: border-box; }
  body { margin: 0; width: 1080px; height: 720px; font-family: "DM Sans", Arial, sans-serif; background: var(--bg); color: var(--ink); }
  .page { width: 1080px; height: 720px; padding: 60px; }
  .diagram-stage { position: relative; width: 960px; height: 560px; border: 1px solid var(--hairline); background: var(--surface-1); }
  .diagram-node { position: absolute; left: 420px; top: 240px; width: 220px; height: 120px; border: 1px solid var(--hairline); background: var(--surface-1); }
  .diagram-node strong { display: block; padding: 34px 24px; font-size: 34px; line-height: 1; }
  .diagram-link-label { position: absolute; left: 500px; top: 300px; transform: translate(-50%, -50%); padding: 4px 10px 5px; border: 1px solid var(--hairline); background: var(--surface-1); border-radius: 999px; font-size: 24px; font-weight: 700; line-height: 1; white-space: nowrap; }
</style>
</head>
<body>
  <div class="page" data-card-mode="article-diagram">
    <section class="diagram-stage">
      <div class="diagram-node"><strong>Node</strong></div>
      <div class="diagram-link-label" data-diagram-link-label="true">overlap</div>
    </section>
  </div>
</body>
</html>`, 'utf8');
  const labelCollisionCheck = runOutputCheck(labelCollisionPath, {
    captureWidth: 1080,
    captureHeight: 720,
    fullpage: false,
  });
  assert.notEqual(labelCollisionCheck.result.status, 0, 'colliding article-diagram link label unexpectedly passed output check');
  assert.equal(labelCollisionCheck.report?.pass, false, 'colliding article-diagram link label did not produce a failing report');
  assert.match(
    labelCollisionCheck.report?.issues?.map(item => item.code).join('\n') || '',
    /article_diagram_label_collision/,
    `colliding article-diagram link label failed for the wrong reason: ${labelCollisionCheck.result.stdout}\n${labelCollisionCheck.result.stderr}`,
  );

  const invalidFamilyValidation = validate({
    mode: 'article-diagram',
    family: 'freeform-map',
    title: 'Bad family',
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
  });
  assert.equal(invalidFamilyValidation.valid, false, 'invalid article-diagram family unexpectedly passed validation');
  assert.match(invalidFamilyValidation.errors.join('\n'), /family must be one of: concept-map, process-flow, boundary-model/);

  const missingCompressionValidation = validate({
    mode: 'article-diagram',
    title: 'Missing compression pack',
  });
  assert.equal(missingCompressionValidation.valid, false, 'article-diagram without family or compression fields unexpectedly passed validation');
  assert.match(missingCompressionValidation.errors.join('\n'), /compression pack requires string "formula"/);

  const hybridArticleDiagramValidation = validate({
    ...articleDiagramFixtures['concept-map'],
    formula: 'Mixed = legacy + compression',
    sentence: 'Mixed payloads must not silently choose one renderer.',
    structure: compressionPackFixture.structure,
    render_plan: 'split',
  });
  assert.equal(hybridArticleDiagramValidation.valid, false, 'hybrid legacy/compression article-diagram input unexpectedly passed validation');
  assert.match(hybridArticleDiagramValidation.errors.join('\n'), /cannot include compression fields/);

  const missingZonesValidation = validate({
    mode: 'article-diagram',
    family: 'boundary-model',
    title: 'Missing zones',
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
  });
  assert.equal(missingZonesValidation.valid, false, 'boundary-model without zones unexpectedly passed validation');
  assert.match(missingZonesValidation.errors.join('\n'), /boundary-model requires zones\[\]/);

  const unknownLinkValidation = validate({
    mode: 'article-diagram',
    family: 'concept-map',
    title: 'Unknown link',
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    links: [{ from: 'a', to: 'c' }],
  });
  assert.equal(unknownLinkValidation.valid, false, 'article-diagram link to unknown node unexpectedly passed validation');
  assert.match(unknownLinkValidation.errors.join('\n'), /references unknown node "c"/);

  for (const templateName of ['infograph_template.html', 'sketchnote_template.html']) {
    const template = stripComments(fs.readFileSync(path.join(ROOT, 'assets', templateName), 'utf8'));
    assert.doesNotMatch(template, /<span>\s*card\s*<\/span>/i, `${templateName} hard-codes the card brand`);
  }

  const visualJob = {
    schema_version: 1,
    job_id: 'validation-job',
    publish_target: 'social-single',
    source: { kind: 'pasted-text', language: 'en', digest: 'a'.repeat(64) },
    source_units: [{ id: 'claim', excerpt: 'Clarity is a visible decision.' }],
    decision: { mode: 'big', tier: 'stable', reason: 'One claim deserves one high-contrast reading surface.', tone: 'sharp' },
    outputs: [{ id: 'hero', basename: 'clarity.png', source_unit_ids: ['claim'], transformation: 'preserve', render_contract: { mode: 'big', phrase: 'Clarity is a decision' } }],
  };
  assert.equal(validateVisualJob(visualJob).valid, true, `valid Visual Job failed: ${validateVisualJob(visualJob).errors.join(', ')}`);
  assert.equal(validateVisualJob({ ...visualJob, outputs: [{ ...visualJob.outputs[0], basename: '../escape.png' }] }).valid, false, 'path traversal Visual Job basename unexpectedly passed');
  assert.equal(validateVisualJob({ ...visualJob, outputs: [{ ...visualJob.outputs[0], source_unit_ids: ['missing'] }] }).valid, false, 'unknown Visual Job source unit unexpectedly passed');
  assert.equal(validateVisualJob({ ...visualJob, source: { ...visualJob.source, api_key: 'nope' } }).valid, false, 'sensitive Visual Job field unexpectedly passed');
  const visualJobSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'visual-job.json'), 'utf8'));
  assert.deepEqual(visualJobSchema.properties.schema_version.enum, [1, 2, 3], 'public Visual Job schema version drifted');
  assert.deepEqual(visualJobSchema.properties.decision.properties.tier.enum, ['stable', 'studio'], 'public Visual Job tier contract drifted');

  assert.ok(listDesigns().length >= 1, 'Design registry is empty');
  assert.equal(validate({ mode: 'unknown' }).valid, false, 'Unknown mode unexpectedly passed validation');

  console.log(`Validation passed: ${Object.keys(inputs).length} renderer smoke tests, version sync, branding matrix, editorial-image tone selector, article-diagram families, field checks, custom composition, schema, and design registry.`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
