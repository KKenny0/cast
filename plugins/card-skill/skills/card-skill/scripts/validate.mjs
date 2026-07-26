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
const { EDITORIAL_TONE_DESIGNS, listDesigns, resolveEditorialDesignName } = require('./lib/designs');
const { validateVisualJob } = require('./lib/visual-job');

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

  for (const requiredPath of [
    pluginJsonPath,
    marketplacePath,
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
    path.join(skillRoot, 'references', 'design-index.md'),
    path.join(skillRoot, 'references', 'codex-inline-preview.md'),
    path.join(skillRoot, 'references', 'mode-article-diagram.md'),
    path.join(skillRoot, 'references', 'source-weread.md'),
  ]) {
    assert.ok(fs.existsSync(requiredPath), `Packaged skill is missing ${path.relative(ROOT, requiredPath)}`);
  }

  const rootVersion = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const packagedVersion = fs.readFileSync(path.join(skillRoot, 'VERSION'), 'utf8').trim();
  const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
  const marketplaceJson = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  const marketplaceEntry = marketplaceJson.plugins?.find(plugin => plugin.name === 'card-skill');

  assert.equal(packagedVersion, rootVersion, 'packaged VERSION does not match root VERSION');
  assert.equal(pluginJson.name, 'card-skill', 'plugin.json name is not card-skill');
  assert.equal(pluginJson.version, rootVersion, 'plugin.json version does not match VERSION');
  assert.equal(pluginJson.skills, './skills/', 'plugin.json skills path must point at ./skills/');
  assert.ok(marketplaceEntry, 'marketplace.json is missing card-skill entry');
  assert.equal(marketplaceEntry.source?.path, './plugins/card-skill', 'marketplace entry must point at ./plugins/card-skill');

  for (const relativePath of [
    'SKILL.md',
    'README.md',
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
    'references/design-index.md',
    'references/codex-inline-preview.md',
    'references/mode-article-diagram.md',
    'references/source-weread.md',
    'references/visual-job.md',
    'references/eval-protocol.md',
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

function runOutputCheck(htmlPath, output) {
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'check-output.mjs'),
    '--html', htmlPath,
    '--width', String(output.captureWidth),
    '--height', String(output.captureHeight),
    '--skip-png',
    '--json',
  ], { encoding: 'utf8' });

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
  assertVersionSources();
  assertPackagedSkill();
  assertWereadSourceContract();
  assertCodexPreviewContract();
  assertProjectAgentContract();
  assert.equal(renderers.big.calcFontSize('能重建<br>才算能验证'), '176px', 'big mode must fit the longest explicit CJK line');
  assert.equal(renderers.big.resolveFontSize('能重建<br>才算能验证', 190), '176px', 'explicit big font size must not bypass the line-fit cap');
  assert.equal(renderers.big.calcFontSize('Make<br>clear'), '220px', 'short Latin big phrases should keep the large display size');
  assert.ok(renderers.poster.calcPosterTitleFontSize('先确认，再选择，最后检查') < 92, 'poster title must shrink before creating an orphan line');
  assert.match(
    validate({ ...inputs.big, hidden: 'renderer ignores this' }).errors.join('\n'),
    /Unknown field for big: "hidden"/,
    'runtime validation must reject renderer-ignored top-level fields',
  );
  assert.equal(
    renderers.poster.isSparsePosterCard({ body: [{ type: 'heading', text: '二' }, { type: 'highlight', text: '再选择视觉结构' }] }),
    true,
    'short poster series cards must opt into the deliberate sparse composition',
  );
  assert.equal(
    renderers.poster.isSparsePosterCard({ body: [{ type: 'paragraph', text: 'This paragraph is deliberately long enough to use the regular poster composition without sparse scaling.' }] }),
    false,
    'ordinary poster content must keep the regular composition',
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

  for (const [mode, input] of Object.entries(inputs)) {
    const validation = validate(input);
    assert.equal(validation.valid, true, `${mode} smoke input failed schema validation: ${validation.errors.join(', ')}`);

    const target = mode === 'poster' ? tmpDir : path.join(tmpDir, `${mode}.html`);
    const rendered = renderers[mode].render(input, target);
    for (const html of readOutputs(rendered)) assertUnbranded(html, mode);
  }

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
  ];
  for (const fixture of invalidPosterCases) {
    const validation = validate(fixture.input);
    assert.equal(validation.valid, false, `${fixture.label} unexpectedly passed poster validation`);
    assert.match(validation.errors.join('\n'), fixture.pattern, `${fixture.label} failed for the wrong reason`);
  }

  const designNames = new Set(listDesigns().map(design => design.name));
  for (const [tone, pool] of Object.entries(EDITORIAL_TONE_DESIGNS)) {
    const toneInput = {
      mode: 'editorial-image',
      title: `Tone selector ${tone}`,
      editorial_tone: tone,
      visual_metaphor: `${tone} paper mood`,
    };
    const selectedDesign = resolveEditorialDesignName(toneInput);
    assert.ok(pool.includes(selectedDesign), `${tone} selected design outside its tone pool: ${selectedDesign}`);
    assert.ok(designNames.has(selectedDesign), `${tone} selected an unknown design: ${selectedDesign}`);

    const tonePath = path.join(tmpDir, `tone-${tone}.html`);
    renderers['editorial-image'].render(toneInput, tonePath);
    const toneHtml = stripComments(fs.readFileSync(tonePath, 'utf8'));
    assert.match(toneHtml, new RegExp(`data-editorial-tone="${tone}"`), `${tone} tone was not recorded in HTML`);
    assert.match(toneHtml, new RegExp(`data-card-design="${selectedDesign}"`), `${tone} selected design was not rendered`);
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
  assert.equal(visualJobSchema.properties.schema_version.const, 1, 'public Visual Job schema version drifted');
  assert.deepEqual(visualJobSchema.properties.decision.properties.tier.enum, ['stable', 'studio'], 'public Visual Job tier contract drifted');

  assert.ok(listDesigns().length >= 1, 'Design registry is empty');
  assert.equal(validate({ mode: 'unknown' }).valid, false, 'Unknown mode unexpectedly passed validation');

  console.log(`Validation passed: ${Object.keys(inputs).length} renderer smoke tests, version sync, branding matrix, editorial-image tone selector, article-diagram families, field checks, custom composition, schema, and design registry.`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
