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
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = path.join(ROOT, 'showcases', 'open-source-tool', 'fixtures');
const OUTPUT = path.join(ROOT, 'assets', 'open-source-tool');
const MANIFEST = path.join(ROOT, 'showcases', 'open-source-tool', 'gallery-manifest.json');
const { publishArtifacts } = require('../../scripts/lib/publish-artifacts');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-open-source-showcase-'));

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function readProfile(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}-profile.json`), 'utf8'));
}

function assertText(value, label, max = 160) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be blank`);
  assert.ok(value.length <= max, `${label} is too long`);
}

function validateProfiles(launch, cli) {
  for (const [label, value] of Object.entries({
    'launch.product': launch.product,
    'launch.title': launch.title,
    'launch.judgment': launch.judgment,
    'launch.case_title': launch.case_title,
    'launch.case_detail': launch.case_detail,
    'cli.product': cli.product,
    'cli.title': cli.title,
    'cli.command': cli.command,
    'cli.output_title': cli.output_title,
  })) assertText(value, label, label.endsWith('detail') ? 240 : 160);
  assert.equal(launch.records?.length, 3, 'launch.records must contain three records');
  assert.equal(launch.capability_steps?.length, 3, 'launch.capability_steps must contain three steps');
  assert.equal(cli.input_files?.length, 3, 'cli.input_files must contain three files');
  assert.equal(cli.controls?.length, 3, 'cli.controls must contain three controls');
  assert.equal(cli.output_sections?.length, 3, 'cli.output_sections must contain three sections');
  const groups = {
    records: { rows: launch.records, keys: ['time', 'kind', 'title', 'detail'] },
    capability_steps: { rows: launch.capability_steps, keys: ['label', 'title', 'text'] },
    input_files: { rows: cli.input_files, keys: ['path', 'detail'] },
    controls: { rows: cli.controls, keys: ['key', 'value'] },
    output_sections: { rows: cli.output_sections, keys: ['name', 'value'] },
  };
  for (const [group, { rows, keys }] of Object.entries(groups)) {
    for (const [index, row] of rows.entries()) {
      assert.ok(row && typeof row === 'object' && !Array.isArray(row), `${group}[${index}] must be an object`);
      assert.deepEqual(Object.keys(row).sort(), [...keys].sort(), `${group}[${index}] must use the exact fixture fields`);
      for (const key of keys) assertText(row[key], `${group}[${index}].${key}`, 120);
    }
  }
}

function shell(command, args) {
  const run = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CARD_SKILL_DISABLE_AUTO_UPDATE: '1' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(run.stderr || run.stdout || `${command} failed`);
  return run.stdout;
}

function writeEvidence(name, body, accent = '#2257d6', dark = false) {
  const htmlPath = path.join(temp, `${name}.html`);
  const pngPath = path.join(temp, `${name}.png`);
  const ink = dark ? '#f6f1e8' : '#172231';
  const canvas = dark ? '#101820' : '#f4f0e7';
  const surface = dark ? '#172430' : '#fffdf7';
  const muted = dark ? '#9caab6' : '#6e756f';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:${canvas};color:${ink}}
    body{font-family:Arial,"Noto Sans SC",sans-serif;padding:38px 44px;display:flex;flex-direction:column;gap:24px}
    .top{display:flex;justify-content:space-between;align-items:center;font:700 20px/1 monospace;letter-spacing:.18em;color:${accent}}
    .badge{border:1px solid ${accent};padding:10px 14px;border-radius:999px;letter-spacing:.08em}
    .panel{flex:1;display:grid;gap:22px;background:${surface};border-top:1px solid ${dark ? '#344453' : '#d7d0c2'};border-bottom:1px solid ${dark ? '#344453' : '#d7d0c2'};padding:26px 0}
    .row{display:grid;grid-template-columns:100px 150px 1fr auto;align-items:center;gap:22px;border-bottom:1px solid ${dark ? '#344453' : '#ded8cd'};padding:18px 6px}.row:last-child{border-bottom:0}
    .mono{font:600 18px/1.35 monospace;color:${muted}}.kind{font:800 17px/1 monospace;letter-spacing:.12em;color:${accent}}
    .title{font:700 30px/1.15 Georgia,"Noto Serif SC",serif}.detail{font:500 18px/1.3 monospace;color:${muted}}
    .metric{font:700 64px/1 Georgia,serif;color:${accent}}.caption{font:500 22px/1.4 Arial,"Noto Sans SC",sans-serif;color:${muted}}
    .tree{display:grid;grid-template-columns:1fr 1.15fr;gap:28px}.tree .files{font:600 26px/1.8 monospace;padding:24px}.tree .summary{padding:34px;border-left:1px solid ${dark ? '#344453' : '#d7d0c2'}}
    .output{display:grid;grid-template-columns:1.1fr .9fr;gap:24px}.doc{padding:30px;background:${dark ? '#0c1218' : '#fff'};border-left:8px solid ${accent};font:500 22px/1.55 monospace}.stack{display:grid;gap:0}.chip{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 8px;border-bottom:1px solid ${dark ? '#344453' : '#d7d0c2'};font:700 20px/1.35 monospace}.chip:last-child{border-bottom:0}
  </style></head><body>${body}</body></html>`;
  fs.writeFileSync(htmlPath, html);
  shell(process.execPath, [path.join(ROOT, 'assets', 'capture4k.js'), htmlPath, pngPath, '1600', '900', '1']);
  return pngPath;
}

function evidenceAssets(launch, cli) {
  const launchRows = launch.records.map(record => `<div class="row"><span class="mono">${escapeHtml(record.time)}</span><span class="kind">${escapeHtml(record.kind)}</span><span class="title">${escapeHtml(record.title)}</span><span class="detail">${escapeHtml(record.detail)}</span></div>`).join('');
  const interfacePng = writeEvidence('launch-interface', `<div class="top"><span>${escapeHtml(launch.product)} / CHANGE RECORD</span><span class="badge">CURRENT</span></div><section class="panel">${launchRows}</section>`, '#215bb8');
  const evidencePng = writeEvidence('launch-evidence', `<div class="top"><span>EVIDENCE LEDGER</span><span>${escapeHtml(launch.product)}</span></div><section class="panel" style="grid-template-columns:repeat(3,1fr)">${launch.records.map((record, index) => `<article style="display:flex;flex-direction:column;justify-content:space-between;padding:24px;border-left:4px solid ${index === 1 ? '#ef7a32' : '#215bb8'}"><div><div class="kind">0${index + 1} · ${escapeHtml(record.kind)}</div><div class="title" style="margin-top:26px">${escapeHtml(record.title)}</div><div class="caption" style="margin-top:14px">${escapeHtml(record.detail)}</div></div><div><div class="metric">${['31','03','01'][index]}</div><div class="mono">BOUND / CURRENT / PRIMARY</div></div></article>`).join('')}</section>`, '#215bb8');
  const casePng = writeEvidence('launch-case', `<div class="top"><span>DELIVERY / REVIEW PACKET</span><span class="badge">SEALED</span></div><section class="panel output"><div class="doc"><span class="kind">REVIEW.md</span><br><br>01 / source snapshot<br>&nbsp;&nbsp;&nbsp;&nbsp;31 files · current<br><br>02 / route decision<br>&nbsp;&nbsp;&nbsp;&nbsp;launch · four duties<br><br>03 / final artifacts<br>&nbsp;&nbsp;&nbsp;&nbsp;PNG · receipt · review<br><br><span style="color:#ef7a32">✓ three duties, one trail</span></div><div class="stack"><div class="chip"><span>SOURCE<br><small class="mono">repository snapshot</small></span><span>31 files</span></div><div class="chip"><span>ROUTE<br><small class="mono">evidence-first</small></span><span>launch / 4</span></div><div class="chip"><span>OUTPUT<br><small class="mono">reviewed delivery</small></span><span>4 PNG<br>4 receipts</span></div></div></section>`, '#ef7a32', true);
  const inputPng = writeEvidence('cli-input', `<div class="top"><span>${escapeHtml(cli.product)} / INPUT MAP</span><span class="badge">./workspace</span></div><section class="panel tree"><div class="files">${cli.input_files.map(item => `├─ ${escapeHtml(item.path)}<br>`).join('')}└─ package.json</div><div class="summary"><div class="kind">IN SCOPE</div><div class="metric" style="margin:38px 0 14px">31</div><div class="caption">files from source, guides, and specs<br>before any command runs</div></div></section>`, '#d65e28', true);
  const outputPng = writeEvidence('cli-output', `<div class="top"><span>${escapeHtml(cli.product)} / GENERATED FILE</span><span class="badge">review-pack.md</span></div><section class="panel output"><div class="doc"># Repository context<br><br>## File map<br>src/index.ts<br>src/route.ts<br>docs/usage.md<br>tests/route.spec.ts<br><br>## Contents<br>&lt;file path="src/index.ts"&gt;<br>export { pack } …<br>&lt;/file&gt;<br><br>## Summary<br>24 files ready for review</div><div class="stack">${cli.output_sections.map((item, index) => `<div class="chip"><span>${escapeHtml(item.name)}<br><small class="mono">${['path index ready','bounded source text','portable handoff'][index]}</small></span><span>${escapeHtml(item.value)}</span></div>`).join('')}</div></section>`, '#d65e28');
  return { interfacePng, evidencePng, casePng, inputPng, outputPng };
}

function visualPlan(core, strategy, hierarchy) {
  return {
    core_message: core,
    content_type: 'mechanism',
    argument_structure: 'sequence',
    visual_metaphor: null,
    layout_strategy: strategy,
    visual_hierarchy: hierarchy,
    avoid_patterns: ['generic hero', 'repeated evidence', 'nested card chrome'],
  };
}

function sourceUnit(id, kind, excerpt, mediaPath = null) {
  const unit = { id, excerpt, evidence: { kind, strength: 'primary', freshness: 'current' } };
  if (mediaPath) unit.digest = sha256(fs.readFileSync(mediaPath));
  return unit;
}

function artifact(index, id, basename, role, sourceId, core, strategy, hierarchy, transformation = 'compress') {
  return { artifact_index: index, id, basename, role, source_unit_ids: [sourceId], transformation, visual_plan: visualPlan(core, strategy, hierarchy) };
}

function buildJob(launch, cli, media) {
  return {
    schema_version: 3,
    job_id: 'open-source-adaptive-showcase',
    publish_target: 'social-series',
    source: { kind: 'file', language: 'zh', label: 'card-skill owned open-source fixtures' },
    source_units: [
      sourceUnit('launch-interface', 'interface', launch.judgment, media.interfacePng),
      sourceUnit('launch-evidence', 'benchmark', launch.evidence_note, media.evidencePng),
      sourceUnit('launch-capability', 'architecture', '来源、判断与交付物形成一条可审阅路径。'),
      sourceUnit('launch-case', 'case', launch.case_detail, media.casePng),
      sourceUnit('cli-input', 'interface', cli.input_title, media.inputPng),
      sourceUnit('cli-command', 'command', cli.command),
      sourceUnit('cli-output', 'output', cli.output_title, media.outputPng),
    ],
    decision: { mode: 'poster', tier: 'stable', tone: 'technical', selection_source: 'taxonomy', reason: 'Owned launch and CLI evidence require distinct four-card and three-card documentary routes.' },
    outputs: [
      {
        id: 'launch-series',
        artifacts: [
          artifact(1, 'launch-judgment', 'tool-launch-1.png', 'judgment', 'launch-interface', launch.judgment, 'interface-led editorial opener', ['judgment', 'current interface']),
          artifact(2, 'launch-evidence-card', 'tool-launch-2.png', 'evidence', 'launch-evidence', launch.evidence_note, 'record-led evidence card', ['evidence ledger', 'scope']),
          artifact(3, 'launch-capability-card', 'tool-launch-3.png', 'capability', 'launch-capability', '三步形成一条审阅路径。', 'native process card', ['ordered path', 'operational consequence']),
          artifact(4, 'launch-case-card', 'tool-launch-4.png', 'case', 'launch-case', launch.case_detail, 'case-led delivery card', ['delivered artifact', 'case conclusion']),
        ],
        render_contract: {
          mode: 'poster', tone: 'technical', design: 'ibm', kicker: launch.kicker, title: launch.title, subtitle: launch.product, source: launch.source_label,
          cards: [
            { body: [{ type: 'media', path: media.interfacePng, alt: 'Relay Atlas current change record interface', fit: 'cover', position: 'center', caption: '当前界面记录：来源、路由与交付物各自保留身份。' }, { type: 'paragraph', text: launch.judgment }] },
            { body: [{ type: 'heading', text: '证据不是数量，而是职责' }, { type: 'media', path: media.evidencePng, alt: 'Three distinct evidence records', fit: 'cover', position: 'center', caption: launch.evidence_note }, { type: 'highlight', text: '卡数由独立证据决定，不由预设模板决定。' }] },
            { body: [{ type: 'heading', text: '一条路径，三种记录' }, { type: 'process', steps: launch.capability_steps }, { type: 'highlight', text: '结构负责交代关系；外层卡片负责判断、节奏与来源。' }] },
            { body: [{ type: 'heading', text: launch.case_title }, { type: 'media', path: media.casePng, alt: 'Sealed review packet output', fit: 'cover', position: 'center', caption: '最终交付保留三种证据职责，而不是复制同一张 hero。' }, { type: 'paragraph', text: launch.case_detail }] },
          ],
        },
      },
      {
        id: 'cli-series',
        artifacts: [
          artifact(1, 'cli-input-card', 'tool-cli-1.png', 'problem', 'cli-input', cli.input_title, 'input-map documentary card', ['repository boundary', 'included material']),
          artifact(2, 'cli-command-card', 'tool-cli-2.png', 'command', 'cli-command', cli.command, 'exact-command typographic card', ['exact command', 'controls'], 'preserve'),
          artifact(3, 'cli-output-card', 'tool-cli-3.png', 'output', 'cli-output', cli.output_title, 'output-proof documentary card', ['generated file', 'inspectable sections']),
        ],
        render_contract: {
          mode: 'poster', tone: 'technical', design: 'claude', kicker: cli.kicker, title: cli.title, subtitle: cli.product, source: cli.source_label,
          cards: [
            { body: [{ type: 'media', path: media.inputPng, alt: 'Threadpack repository input map', fit: 'cover', position: 'center', caption: '输入边界先于命令：31 个自有 fixture 文件，三类目录。' }, { type: 'paragraph', text: '先确定哪些文件进入上下文，才能解释后续输出从哪里来。' }] },
            { body: [{ type: 'heading', text: '命令必须逐字保留' }, { type: 'highlight', text: cli.command }, ...cli.controls.map(item => ({ type: 'data_row', key: item.key, value: item.value })), { type: 'divider' }, { type: 'items', entries: [{ label: 'READ', text: '按范围收集文件' }, { label: 'WRITE', text: '生成 review-pack.md' }] }] },
            { body: [{ type: 'heading', text: cli.output_title }, { type: 'media', path: media.outputPng, alt: 'Generated review-pack markdown file', fit: 'cover', position: 'center', caption: '输出是一份可打开、可核对、可继续交接的 Markdown 文件。' }, { type: 'paragraph', text: '任务流到这里结束：输入、控制与结果没有被抽象口号替代。' }] },
          ],
        },
      },
    ],
  };
}

function pngSize(file) {
  const buffer = fs.readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

try {
  const launch = readProfile('launch');
  const cli = readProfile('cli');
  validateProfiles(launch, cli);
  const media = evidenceAssets(launch, cli);
  const job = buildJob(launch, cli, media);
  const jobPath = path.join(temp, 'visual-job.json');
  const candidateDir = path.join(temp, 'candidate');
  fs.writeFileSync(jobPath, JSON.stringify(job));
  shell(process.execPath, [path.join(ROOT, 'scripts', 'render-job.mjs'), '--input', jobPath, '--output-dir', candidateDir, '--candidate', '--json']);

  const entries = [];
  const images = [];
  for (const output of job.outputs) {
    for (const plan of output.artifacts) {
      const source = path.join(candidateDir, plan.basename);
      assert.ok(fs.existsSync(source), `missing rendered artifact ${plan.basename}`);
      const size = pngSize(source);
      assert.deepEqual(size, { width: 2160, height: 2880 }, `${plan.basename} has unexpected dimensions`);
      const bytes = fs.readFileSync(source);
      entries.push({ stagedPath: source, finalPath: path.join(OUTPUT, plan.basename) });
      images.push({ basename: plan.basename, role: plan.role, output_id: output.id, width: size.width, height: size.height, sha256: sha256(bytes), bytes: bytes.length });
    }
  }
  assert.ok(images.reduce((sum, item) => sum + item.bytes, 0) <= 5 * 1024 * 1024, 'open-source showcase exceeds the 5 MiB PNG budget');
  const manifest = {
    schema_version: 1,
    fixture_sha256: {
      launch: sha256(fs.readFileSync(path.join(FIXTURES, 'launch-profile.json'))),
      cli: sha256(fs.readFileSync(path.join(FIXTURES, 'cli-profile.json'))),
    },
    images,
  };
  const stagedManifest = path.join(temp, 'gallery-manifest.json');
  fs.writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  entries.push({ stagedPath: stagedManifest, finalPath: MANIFEST });
  publishArtifacts(entries, { allowOverwrite: true });
  console.log(`Open-source showcase rendered: ${images.length} evidence-bound cards, ${images.reduce((sum, item) => sum + item.bytes, 0)} PNG bytes.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
