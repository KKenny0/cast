#!/usr/bin/env node
/**
 * Batch dark-surface cover renderer for card-skill
 * Strategy: 印在深色卡纸上的印刷品 — 暖调底色、暖白墨色、不加纹理、不发光
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUTPUT_DIR = '/tmp/card_covers_dark';
const ASSETS = path.resolve(__dirname, '..', 'assets');
const CAPTURE = path.join(ASSETS, 'capture4k.js');
const LOCAL_FONT_CSS = `file://${path.join(ASSETS, 'fonts', 'local-fonts.css')}`;

const CONTENT = {
  title: 'Claude Code\n内部机制',
  subtitle: 'Session · Context · Memory — 三层架构如何用成本作为钢筋',
  eyebrow: '源码分析 · Claude Code Internals',
  tags: ['200k token', 'Prompt Caching', 'Rolling Summary'],
  source: '2026-02-28 · 源码深度解析',
};

// Dark designs — warm-shifted for print feel, no texture, no glow
const DESIGNS = {
  // Dark Minimal
  linear:     { accent:'#6872be', canvas:'#0e0d12', ink:'#e2dcd4', inkMuted:'#8a8490', surface1:'#151418', surface2:'#1c1b20', hairline:'#25242a', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'薰衣草暗' },
  clickhouse: { accent:'#e8e060', canvas:'#0e0e0e', ink:'#e0dbd0', inkMuted:'#8a8580', surface1:'#161616', surface2:'#1e1e1e', hairline:'#2a2a2a', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'柠檬数据' },
  composio:   { accent:'#1820a0', canvas:'#0e0e10', ink:'#e0dcd4', inkMuted:'#888480', surface1:'#161618', surface2:'#1e1e20', hairline:'#28282a', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'深蓝开发' },
  hashicorp:  { accent:'#e0dcd4', canvas:'#0a0a0c', ink:'#e0dcd4', inkMuted:'#8a8688', surface1:'#121214', surface2:'#1a1a1c', hairline:'#242426', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'基础设施' },
  vercel:     { accent:'#e0dcd4', canvas:'#0c0c0c', ink:'#e8e2d8', inkMuted:'#8a8580', surface1:'#141414', surface2:'#1c1c1c', hairline:'#282828', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:600, note:'极致黑白' },
  warp:       { accent:'#6872be', canvas:'#0c0c0e', ink:'#e0dcd4', inkMuted:'#8a8488', surface1:'#141416', surface2:'#1c1c1e', hairline:'#262628', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'终端工具' },
  voltagent:  { accent:'#00cc70', canvas:'#0a0a0c', ink:'#e0dcd4', inkMuted:'#8a8488', surface1:'#121214', surface2:'#1a1a1c', hairline:'#242426', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'霓虹Agent' },
  x_ai:       { accent:'#e0dcd4', canvas:'#0a0a0c', ink:'#e0dcd4', inkMuted:'#8a8688', surface1:'#121214', surface2:'#1a1a1c', hairline:'#242426', font:'system-ui,sans-serif', fontTitle:'system-ui,sans-serif', titleWeight:600, note:'极简未来' },

  // Dark Premium
  bmw_m:      { accent:'#e0dcd4', canvas:'#0c0c0c', ink:'#e0dcd4', inkMuted:'#8a8688', surface1:'#141414', surface2:'#1c1c1c', hairline:'#282828', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:700, note:'赛车暗金' },
  bugatti:    { accent:'#e0dcd4', canvas:'#0a0a0a', ink:'#e8e2d8', inkMuted:'#8a8688', surface1:'#121212', surface2:'#1a1a1a', hairline:'#262626', font:'DM Sans,system-ui,sans-serif', fontTitle:'Playfair Display,Georgia,serif', titleWeight:400, note:'极致奢华' },
  ferrari:    { accent:'#c02020', canvas:'#101012', ink:'#e0dcd4', inkMuted:'#8a8488', surface1:'#181818', surface2:'#202020', hairline:'#2a2a2c', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:600, note:'激情红' },
  lamborghini:{ accent:'#b89840', canvas:'#0c0c0a', ink:'#e0dcd0', inkMuted:'#8a8680', surface1:'#141412', surface2:'#1c1c1a', hairline:'#282824', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'黄金奢华' },
  spacex:     { accent:'#e0dcd4', canvas:'#0a0a0c', ink:'#e0dcd4', inkMuted:'#8a8688', surface1:'#121214', surface2:'#1a1a1c', hairline:'#242426', font:'system-ui,sans-serif', fontTitle:'system-ui,sans-serif', titleWeight:600, note:'航天极简' },
  tesla:      { accent:'#c82020', canvas:'#101012', ink:'#e0dcd4', inkMuted:'#8a8488', surface1:'#181818', surface2:'#202020', hairline:'#2a2a2c', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:600, note:'极简革命' },
  binance:    { accent:'#d8b830', canvas:'#0c0e10', ink:'#e0dcd0', inkMuted:'#8a8480', surface1:'#141618', surface2:'#1c1e20', hairline:'#282a2c', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:600, note:'金融交易' },
  revolut:    { accent:'#4450d0', canvas:'#0c0c0e', ink:'#e0dcd4', inkMuted:'#8a8488', surface1:'#141416', surface2:'#1c1c1e', hairline:'#262628', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:600, note:'数字银行' },
  shopify:    { accent:'#00c040', canvas:'#0a0c0a', ink:'#e0dcd4', inkMuted:'#8a8a84', surface1:'#121412', surface2:'#1a1c1a', hairline:'#242624', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:600, note:'电商绿' },
  kraken:     { accent:'#5040c0', canvas:'#0c0e10', ink:'#e0dcd0', inkMuted:'#8a8480', surface1:'#141618', surface2:'#1c1e20', hairline:'#282a2c', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'加密数据' },
  supabase:   { accent:'#30b880', canvas:'#0a0c0a', ink:'#e0dcd4', inkMuted:'#8a8a84', surface1:'#121412', surface2:'#1a1c1a', hairline:'#242624', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'开发者绿' },

  // Technical Data (dark)
  sentry:     { accent:'#5048a0', canvas:'#0a0a0c', ink:'#e0dcd4', inkMuted:'#8a8488', surface1:'#121214', surface2:'#1a1a1c', hairline:'#242426', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'监控平台' },
  raycast:    { accent:'#d05050', canvas:'#0c0c0e', ink:'#e0dcd4', inkMuted:'#8a8488', surface1:'#141416', surface2:'#1c1c1e', hairline:'#262628', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'效率工具' },
  together_ai:{ accent:'#3878d0', canvas:'#0a0a0c', ink:'#e0dcd4', inkMuted:'#8a8688', surface1:'#121214', surface2:'#1a1a1c', hairline:'#242426', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'AI 基础设施' },

  // Vibrant (dark)
  spotify:    { accent:'#18a848', canvas:'#101214', ink:'#e0dcd4', inkMuted:'#8a8a84', surface1:'#181a1c', surface2:'#202224', hairline:'#2a2c2e', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:600, note:'音乐绿' },
  nvidia:     { accent:'#68a800', canvas:'#0a0a0c', ink:'#e0dcd4', inkMuted:'#8a8a84', surface1:'#121214', surface2:'#1a1a1c', hairline:'#242426', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:600, note:'GPU 工程' },

  // Brand Bold (dark)
  airtable:   { accent:'#18a8a8', canvas:'#0e1014', ink:'#e0dcd4', inkMuted:'#8a8a88', surface1:'#161820', surface2:'#1e2028', hairline:'#282a30', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:600, note:'结构化工作流' },
  sanity:     { accent:'#d84080', canvas:'#0c0c0e', ink:'#e0dcd4', inkMuted:'#8a8488', surface1:'#141416', surface2:'#1c1c1e', hairline:'#262628', font:'Inter,system-ui,sans-serif', fontTitle:'Inter,system-ui,sans-serif', titleWeight:600, note:'CMS 珊瑚' },
  superhuman: { accent:'#282040', canvas:'#0c0c0e', ink:'#e0dcd4', inkMuted:'#8a8488', surface1:'#141416', surface2:'#1c1c1e', hairline:'#262628', font:'DM Sans,system-ui,sans-serif', fontTitle:'DM Sans,system-ui,sans-serif', titleWeight:600, note:'高端邮件' },
};

function generateHTML(design, name) {
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
    /* Subtle warm shift — dark paper is not perfectly uniform */
    background-image:
      radial-gradient(ellipse at 25% 20%, rgba(180,160,130,0.025), transparent 50%),
      radial-gradient(ellipse at 75% 75%, rgba(160,140,110,0.02), transparent 50%);
  }

  /* No grain — dark printed paper is smooth, matte */

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
    border-top: 1px solid rgba(224,220,212,0.06);
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
<div class="page">
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
      <span class="brand">${name.replace(/_/g,' ')}</span>
    </div>
  </div>
</div>
</body>
</html>`;
}

// Main
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const names = Object.keys(DESIGNS);
console.log(`Generating ${names.length} dark cover images...`);

let ok = 0, fail = 0;
for (const name of names) {
  const d = DESIGNS[name];
  const htmlPath = `${OUTPUT_DIR}/cover_${name}.html`;
  const pngPath = `${OUTPUT_DIR}/cover_${name}.png`;

  fs.writeFileSync(htmlPath, generateHTML(d, name));

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
