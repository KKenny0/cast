#!/usr/bin/env node
/**
 * Batch cover renderer for card-skill
 * Generates cover HTML for all light-surface design systems, then captures via capture4k.js
 *
 * Usage: node scripts/batch_render_covers.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DRY_RUN = process.argv.includes('--dry-run');
const OUTPUT_DIR = '/tmp/card_covers';
const ASSETS = path.resolve(__dirname, '..', 'assets');
const CAPTURE = path.join(ASSETS, 'capture4k.js');
const LOCAL_FONT_CSS = `file://${path.join(ASSETS, 'fonts', 'local-fonts.css')}`;

// Cover content
const CONTENT = {
  title: 'Claude Code\n内部机制',
  subtitle: 'Session · Context · Memory — 三层架构如何用成本作为钢筋',
  eyebrow: '源码分析 · Claude Code Internals',
  tags: ['200k token', 'Prompt Caching', 'Rolling Summary'],
  source: '2026-02-28 · 源码深度解析',
};

// All light-surface design systems from design-index.md
const DESIGNS = {
  // Light Minimal
  apple:       { accent:'#0071e3', canvas:'#fbfbfd', ink:'#1d1d1f', inkMuted:'#86868b', surface1:'#f5f5f7', surface2:'#e8e8ed', hairline:'#d2d2d7', font:'DM Sans', fontTitle:'DM Sans', titleWeight:700, note:'极简留白' },
  expo:        { accent:'#000000', canvas:'#fafafa', ink:'#171717', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'Inter', fontTitle:'Inter', titleWeight:600, note:'开发者文档' },
  notion:      { accent:'#5645d4', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#6b6b6b', surface1:'#f0f0f0', surface2:'#e8e8e8', hairline:'#d8d8d8', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'工作区' },
  ollama:      { accent:'#333333', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#777777', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:500, note:'极简终端' },
  minimax:     { accent:'#1a1a1a', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'AI 企业' },

  // Light Editorial
  claude:      { accent:'#c47050', canvas:'#f5f0e8', ink:'#2c2418', inkMuted:'#6b6050', surface1:'#ede7db', surface2:'#e4dcd0', hairline:'#d4c9b8', font:'DM Sans', fontTitle:'DM Serif Display', titleWeight:400, note:'暖色人文' },
  cursor:      { accent:'#e04a00', canvas:'#f7f7f4', ink:'#26251e', inkMuted:'#6b6860', surface1:'#efefe8', surface2:'#e6e6dc', hairline:'#d0cfc4', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'编辑暖调' },
  intercom:    { accent:'#222222', canvas:'#f5f1ec', ink:'#222222', inkMuted:'#6b6055', surface1:'#ede8e0', surface2:'#e3ddd2', hairline:'#d0c8ba', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'奶油温暖' },
  replicate:   { accent:'#d42504', canvas:'#f9f7f3', ink:'#282020', inkMuted:'#6b5f5f', surface1:'#f0ece5', surface2:'#e6e0d5', hairline:'#d4ccc0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'暖色开发' },
  posthog:     { accent:'#e09500', canvas:'#eeefe9', ink:'#28251d', inkMuted:'#6b6555', surface1:'#e4e5dc', surface2:'#daded0', hairline:'#c8c8b8', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'活泼分析' },
  wired:       { accent:'#00cc00', canvas:'#fafafa', ink:'#333840', inkMuted:'#6b7280', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'Playfair Display', titleWeight:400, note:'杂志编辑' },
  theverge:    { accent:'#30d080', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'Playfair Display', titleWeight:400, note:'酸性薄荷' },
  slack:       { accent:'#4a154b', canvas:'#fafafa', ink:'#222222', inkMuted:'#6b6b6b', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d8d8d8', font:'DM Sans', fontTitle:'DM Sans', titleWeight:700, note:'通讯品牌' },
  uber:        { accent:'#111111', canvas:'#fafafa', ink:'#111111', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:700, note:'粗体紧密' },
  wise:        { accent:'#7cc050', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#6b6b6b', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'友好金融' },

  // Technical Data (light)
  stripe:      { accent:'#5530e0', canvas:'#f6f9fc', ink:'#0d2540', inkMuted:'#4a5568', surface1:'#eef2f7', surface2:'#e3e8ee', hairline:'#d0d5dd', font:'DM Sans', fontTitle:'DM Sans', titleWeight:500, note:'精密金融' },
  ibm:         { accent:'#0f62fe', canvas:'#f5f5f5', ink:'#161616', inkMuted:'#555555', surface1:'#ebebeb', surface2:'#e0e0e0', hairline:'#c8c8c8', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'企业工程' },
  opencode_ai: { accent:'#201d1d', canvas:'#fdfcfc', ink:'#201d1d', inkMuted:'#6b6868', surface1:'#f2f1f1', surface2:'#e8e6e6', hairline:'#d0cece', font:'SF Mono,Menlo,monospace', fontTitle:'SF Mono,Menlo,monospace', titleWeight:600, note:'等宽终端' },
  mongodb:     { accent:'#00c050', canvas:'#fafafa', ink:'#0a2028', inkMuted:'#556060', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'数据平台' },

  // Vibrant (light)
  nike:        { accent:'#111111', canvas:'#fafafa', ink:'#111111', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:800, note:'运动大字' },
  miro:        { accent:'#e0b800', canvas:'#fafafa', ink:'#1c1c1e', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'协作活力' },
  renault:     { accent:'#e0d800', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'工业设计' },
  mistral_ai:  { accent:'#e04510', canvas:'#fafafa', ink:'#1f1f1f', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'Playfair Display', titleWeight:400, note:'法国日落' },
  pinterest:   { accent:'#d80020', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'视觉发现' },
  zapier:      { accent:'#e04c00', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'自动化' },

  // Brand Bold (light)
  airbnb:      { accent:'#e03050', canvas:'#fafafa', ink:'#222222', inkMuted:'#6b6b6b', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'旅行人文' },
  coinbase:    { accent:'#0050e0', canvas:'#fafafa', ink:'#0a0b0d', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'信任金融' },
  bmw:         { accent:'#1c69d4', canvas:'#fafafa', ink:'#262626', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'高端制造' },
  mastercard:  { accent:'#e05500', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'全球支付' },
  meta:        { accent:'#0060d0', canvas:'#fafafa', ink:'#1c1e21', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'社交硬件' },
  clay:        { accent:'#1a1a1a', canvas:'#fff8f0', ink:'#1a1a1a', inkMuted:'#6b6050', surface1:'#f5efe5', surface2:'#ebe4d5', hairline:'#d8d0c0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'有机数据' },
  playstation: { accent:'#0070d1', canvas:'#fafafa', ink:'#111111', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'游戏沉浸' },
  starbucks:   { accent:'#00704a', canvas:'#fafafa', ink:'#1e3932', inkMuted:'#4a6055', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'有机暖调' },
  vodafone:    { accent:'#d00000', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:700, note:'通信大写' },
  webflow:     { accent:'#4050d0', canvas:'#fafafa', ink:'#1d1d1f', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'设计工具' },
  lovable:     { accent:'#5858e0', canvas:'#fafafa', ink:'#1a1a1a', inkMuted:'#555555', surface1:'#f0f0f0', surface2:'#e5e5e5', hairline:'#d0d0d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'AI 建站' },

  // ljg-card tones
  ljg_chensi:  { accent:'#8B5E3C', canvas:'#F5F2ED', ink:'#2D2926', inkMuted:'#6b6055', surface1:'#ece8e0', surface2:'#e2ddd2', hairline:'#d0c8b8', font:'DM Sans', fontTitle:'DM Serif Display', titleWeight:400, note:'沉思' },
  ljg_ruili:   { accent:'#C82820', canvas:'#EDEDF0', ink:'#2D2926', inkMuted:'#555555', surface1:'#e4e4e8', surface2:'#d8d8dc', hairline:'#c8c8cc', font:'DM Sans', fontTitle:'DM Sans', titleWeight:700, note:'锐利' },
  ljg_wennuan: { accent:'#B07040', canvas:'#F7F4EF', ink:'#2D2926', inkMuted:'#6b6050', surface1:'#eee8df', surface2:'#e3dcd0', hairline:'#d0c8b8', font:'DM Sans', fontTitle:'DM Serif Display', titleWeight:400, note:'温暖' },
  ljg_jishu:   { accent:'#1A8360', canvas:'#F0F3F7', ink:'#2D2926', inkMuted:'#505860', surface1:'#e5e8ee', surface2:'#d8dce5', hairline:'#c0c5d0', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'技术' },
  ljg_keyan:   { accent:'#C08040', canvas:'#F2F6F4', ink:'#2D2926', inkMuted:'#506055', surface1:'#e8ece8', surface2:'#dce2dc', hairline:'#c5cdc5', font:'DM Sans', fontTitle:'DM Serif Display', titleWeight:400, note:'科研' },
  ljg_chuangyi:{ accent:'#A03828', canvas:'#F6F3F2', ink:'#2D2926', inkMuted:'#6b5850', surface1:'#ede8e5', surface2:'#e2dcd5', hairline:'#d0c8c0', font:'DM Sans', fontTitle:'DM Serif Display', titleWeight:400, note:'创意' },
  ljg_shangye: { accent:'#2A6048', canvas:'#F4F3F0', ink:'#2D2926', inkMuted:'#555550', surface1:'#eae8e2', surface2:'#dddad2', hairline:'#c8c5b8', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'商业' },
  ljg_moren:   { accent:'#D01858', canvas:'#F2F2F2', ink:'#2D2926', inkMuted:'#555555', surface1:'#e8e8e8', surface2:'#dddcdc', hairline:'#c8c8c8', font:'DM Sans', fontTitle:'DM Sans', titleWeight:600, note:'默认' },
};

function generateHTML(design, name) {
  // Warm the canvas for paper feel
  const canvasWarm = design.canvas;
  const grainOpacity = 0.025; // barely visible

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  @import url('${LOCAL_FONT_CSS}');

  :root {
    --bg: ${design.canvas};
    --surface-1: ${design.surface1};
    --surface-2: ${design.surface2};
    --hairline: ${design.hairline};
    --accent: ${design.accent};
    --ink: ${design.ink};
    --ink-muted: ${design.inkMuted};
    --font: ${design.font};
    --font-title: ${design.fontTitle};
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; background: var(--bg); }

  .page {
    width: 1080px;
    min-height: 800px;
    background: var(--bg);
    position: relative;
    background-image:
      radial-gradient(ellipse at 30% 25%, rgba(255,245,225,0.35), transparent 60%),
      radial-gradient(ellipse at 75% 70%, rgba(230,215,195,0.25), transparent 50%);
  }

  .page > .grain {
    position: absolute;
    inset: 0;
    filter: url(#noise);
    opacity: ${grainOpacity};
    pointer-events: none;
    z-index: 100;
  }

  .content {
    padding: 80px 80px 48px;
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-height: 800px;
  }

  .eyebrow {
    font: 500 13px/1 var(--font);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 32px;
  }

  .title {
    font: ${design.titleWeight} 76px/1.05 var(--font-title);
    color: var(--ink);
    max-width: 800px;
    margin-bottom: 28px;
    white-space: pre-line;
  }

  .accent-bar {
    width: 40px;
    height: 2px;
    background: var(--accent);
    margin-bottom: 32px;
  }

  .subtitle {
    font: 400 36px/1.6 var(--font);
    color: var(--ink-muted);
    max-width: 720px;
    margin-bottom: auto;
  }

  .tag-row {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
  }

  .tag {
    font: 400 24px/1 var(--font);
    color: var(--ink-muted);
    background: var(--surface-1);
    border: 1px solid var(--hairline);
    padding: 6px 16px;
    border-radius: 3px;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 24px;
    border-top: 1px solid var(--hairline);
    margin-top: 40px;
  }

  .footer .source {
    font: 400 22px/1 var(--font);
    color: var(--ink-muted);
  }

  .footer .brand {
    font: 400 20px/1 var(--font);
    color: var(--ink-muted);
    opacity: 0.5;
  }
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute">
  <filter id="noise">
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
</svg>
<div class="page">
  <div class="grain"></div>
  <div class="content">
    <div class="eyebrow">${CONTENT.eyebrow}</div>
    <h1 class="title">${CONTENT.title}</h1>
    <div class="accent-bar"></div>
    <p class="subtitle">${CONTENT.subtitle}</p>
    <div class="tag-row">
      ${CONTENT.tags.map(t => `<span class="tag">${t}</span>`).join('\n      ')}
    </div>
    <div class="footer">
      <span class="source">${CONTENT.source}</span>
      <span class="brand">${name}</span>
    </div>
  </div>
</div>
</body>
</html>`;
}

// Main
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const names = Object.keys(DESIGNS);
console.log(`Generating ${names.length} cover images...`);

let ok = 0, fail = 0;
for (const name of names) {
  const d = DESIGNS[name];
  const htmlPath = `${OUTPUT_DIR}/cover_${name}.html`;
  const pngPath = `${OUTPUT_DIR}/cover_${name}.png`;

  fs.writeFileSync(htmlPath, generateHTML(d, name));

  if (DRY_RUN) {
    console.log(`  [DRY] ${name}`);
    ok++;
    continue;
  }

  try {
    execSync(`node "${CAPTURE}" "${htmlPath}" "${pngPath}" 1080 800 fullpage`, {
      timeout: 30000,
      stdio: 'pipe',
    });
    ok++;
    console.log(`  ✓ ${name} — ${d.note}`);
  } catch (e) {
    fail++;
    console.error(`  ✗ ${name} — ${e.message.split('\n')[0]}`);
  }
}

console.log(`\nDone: ${ok} ok, ${fail} fail, ${names.length} total`);
console.log(`Output: ${OUTPUT_DIR}/`);
