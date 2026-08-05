/**
 * Editorial image renderer for card-skill CLI.
 * Provides an aspect-safe Quiet Paper canvas with an open composition slot.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { escapeHtml, escapePhrase } = require('../lib/escape');
const { getDesign, resolveEditorialDesignName } = require('../lib/designs');

const TEMPLATE_PATH = path.resolve(__dirname, '../../assets/infograph_template.html');
const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');

const ASPECTS = {
  'wechat-cover': { width: 1080, height: 460, label: '2.35:1' },
  'blog-hero': { width: 1080, height: 608, label: '16:9' },
  'body-3-2': { width: 1080, height: 720, label: '3:2' },
  'body-4-3': { width: 1080, height: 810, label: '4:3' },
  cinematic: { width: 1080, height: 463, label: '21:9' },
  square: { width: 1080, height: 1080, label: '1:1' },
};

const COVER_MOTIFS = new Set(['paper-stack', 'drawer', 'window', 'lens', 'path', 'archive', 'layers']);

function defaultAspect(input) {
  if (input.aspect) return input.aspect;
  if (input.use === 'in-article') return 'body-3-2';
  if (input.use === 'metaphor') return 'blog-hero';
  return 'blog-hero';
}

function resolveCoverMotif(input) {
  const motif = input.cover_motif || 'paper-stack';
  if (!COVER_MOTIFS.has(motif)) {
    throw new Error(`Unknown editorial-image cover_motif: ${motif}`);
  }
  return motif;
}

function renderCoverMotif(motif) {
  switch (motif) {
    case 'drawer':
      return `
        <div class="cover-motif cover-motif-drawer">
          <div class="drawer-sheet drawer-sheet-back"></div>
          <div class="drawer-sheet drawer-sheet-front"></div>
          <div class="drawer-box"><i></i><i></i><i></i></div>
          <div class="drawer-handle"></div>
        </div>
      `;
    case 'window':
      return `
        <div class="cover-motif cover-motif-window">
          <div class="window-field"><i></i><i></i><i></i><i></i></div>
          <div class="window-frame"><b></b><b></b></div>
          <div class="window-slit"></div>
        </div>
      `;
    case 'lens':
      return `
        <div class="cover-motif cover-motif-lens">
          <div class="lens-ring lens-ring-outer"></div>
          <div class="lens-ring lens-ring-inner"></div>
          <div class="lens-core"></div>
          <div class="lens-beam"></div>
        </div>
      `;
    case 'path':
      return `
        <div class="cover-motif cover-motif-path">
          <div class="path-step path-step-a"></div>
          <div class="path-step path-step-b"></div>
          <div class="path-step path-step-c"></div>
          <div class="path-thread path-thread-a"></div>
          <div class="path-thread path-thread-b"></div>
        </div>
      `;
    case 'archive':
      return `
        <div class="cover-motif cover-motif-archive">
          <div class="archive-case"><i></i><i></i><i></i><i></i></div>
          <div class="archive-file archive-file-a"></div>
          <div class="archive-file archive-file-b"></div>
          <div class="archive-file archive-file-c"></div>
        </div>
      `;
    case 'layers':
      return `
        <div class="cover-motif cover-motif-layers">
          <div class="layer-sheet layer-sheet-a"><i></i></div>
          <div class="layer-sheet layer-sheet-b"><i></i></div>
          <div class="layer-sheet layer-sheet-c"><i></i></div>
          <div class="layer-axis"></div>
        </div>
      `;
    case 'paper-stack':
      return `
        <div class="cover-motif cover-motif-paper-stack">
          <div class="paper-stack paper-stack-a"></div>
          <div class="paper-stack paper-stack-b"></div>
          <div class="paper-mark"></div>
          <div class="paper-thread"></div>
        </div>
      `;
    default:
      throw new Error(`Unknown editorial-image cover_motif: ${motif}`);
  }
}

function renderDefaultContent(input, aspect) {
  const kicker = input.kicker ? `<p class="editorial-kicker">${escapeHtml(input.kicker)}</p>` : '';
  const title = escapePhrase(input.title);
  const subtitle = input.subtitle ? `<p class="editorial-subtitle">${escapeHtml(input.subtitle)}</p>` : '';
  const metaphor = escapeHtml(input.visual_metaphor || input.art_direction || '');
  const coverMotif = resolveCoverMotif(input);

  return `
    <section class="editorial-frame editorial-${aspect.key}" data-metaphor="${metaphor}" data-cover-motif="${coverMotif}">
      <div class="editorial-copy">
        ${kicker}
        <h1>${title}</h1>
        ${subtitle}
      </div>
      <div class="editorial-visual" aria-hidden="true">
        ${renderCoverMotif(coverMotif)}
      </div>
    </section>
  `;
}

function baseCss(input, design, aspect) {
  const textPlan = input.text_plan ? `/* text plan: ${input.text_plan.replace(/\*\//g, '')} */` : '';

  // Dynamic h1 font-size: title visual width vs copy column capacity.
  // Copy column ~453px in the 2-col grid. At 84px CJK ≈ 5 chars/line (orphan-prone);
  // 64px ≈ 7 chars/line; 52px ≈ 9 chars/line. Pick the smallest size that lets the
  // title wrap cleanly without producing a 1-2 char orphan last line.
  // CJK weight 2, Latin/digit 1, space 0.5. Title weight ≤10 fits at 84px,
  // ≤14 fits at 64px, otherwise 52px.
  const titleWeight = [...(input.title || '')].reduce((sum, c) => {
    if (/\s/.test(c)) return sum + 0.5;
    if (c.charCodeAt(0) > 0x3400) return sum + 2;
    return sum + 1;
  }, 0);
  const titleFontSize = aspect.height <= 500 ? 64
                      : titleWeight <= 10 ? 84
                      : titleWeight <= 14 ? 64
                      : 52;

  return `
    :root {
      --bg: ${design.canvas};
      --green: ${design.surface2};
      --pink: ${design.accent};
      --accent: ${design.accent};
      --ink: ${design.ink};
      --ink-light: ${design.inkMuted};
      --surface-1: ${design.surface1};
      --surface-2: ${design.surface2};
      --hairline: ${design.hairline};
      --radius: ${design.radius};
    }

    html, body {
      width: ${aspect.width}px;
      height: ${aspect.height}px;
      overflow: hidden;
    }

    .page {
      width: ${aspect.width}px;
      height: ${aspect.height}px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .colophon {
      display: ${input.logo || input.brand_name || input.source ? 'flex' : 'none'};
    }

    .editorial-frame {
      position: relative;
      min-height: 0;
      flex: 1 1 auto;
      padding: ${aspect.height <= 500 ? '40px 60px 24px' : '58px 76px 40px'};
      display: grid;
      grid-template-columns: minmax(0, 1.03fr) minmax(280px, 0.97fr);
      gap: 48px;
      align-items: center;
      isolation: isolate;
    }

    .editorial-frame::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.42;
      background:
        radial-gradient(circle at 18% 24%, color-mix(in srgb, var(--surface-1) 34%, transparent) 0 1px, transparent 1.6px),
        radial-gradient(circle at 74% 62%, color-mix(in srgb, var(--ink) 8%, transparent) 0 0.7px, transparent 1.4px);
      background-size: 18px 18px, 22px 22px;
      mix-blend-mode: multiply;
      z-index: -1;
    }

    .editorial-kicker {
      font: 500 24px/1 var(--mono);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 22px;
    }

    .editorial-copy h1 {
      max-width: 680px;
      font-family: 'DM Serif Display', 'XiangcuiDengcusong', serif;
      font-size: ${titleFontSize}px;
      line-height: 1.03;
      letter-spacing: 0;
      color: var(--ink);
      text-wrap: balance;
      text-shadow: 0 1px 0 color-mix(in srgb, var(--surface-1) 58%, transparent);
    }

    .editorial-subtitle {
      max-width: 620px;
      margin-top: 18px;
      font: 400 ${aspect.height <= 500 ? '32px' : '38px'}/1.35 var(--zh-serif);
      color: var(--ink-light);
      text-wrap: balance;
    }

    .editorial-visual {
      position: relative;
      height: ${aspect.height <= 500 ? Math.max(190, aspect.height - 205) : Math.max(250, Math.min(460, aspect.height - 180))}px;
      min-width: 280px;
      filter: saturate(0.92);
    }

    .cover-motif {
      position: relative;
      width: 100%;
      height: 100%;
    }

    .paper-stack {
      position: absolute;
      border: 1px solid var(--hairline);
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 94%, var(--bg)), color-mix(in srgb, var(--surface-2) 38%, var(--bg)));
      border-radius: var(--radius);
      box-shadow: none;
    }

    .paper-stack-a {
      width: 58%;
      height: 72%;
      right: 15%;
      top: 6%;
      transform: rotate(-4deg);
    }

    .paper-stack-b {
      width: 64%;
      height: 76%;
      right: 2%;
      top: 16%;
      transform: rotate(5deg);
      background: color-mix(in srgb, var(--surface-2) 54%, transparent);
      box-shadow: none;
    }

    .paper-mark {
      position: absolute;
      right: 20%;
      top: 36%;
      width: 34%;
      height: 1px;
      background: color-mix(in srgb, var(--accent) 72%, var(--hairline));
      transform: rotate(-10deg);
      opacity: 0.58;
    }

    .paper-thread {
      position: absolute;
      right: 8%;
      bottom: 17%;
      width: 48%;
      height: 48%;
      border-left: 1px solid var(--hairline);
      border-bottom: 1px solid var(--hairline);
      transform: skewX(-17deg);
      opacity: 0.9;
    }

    .cover-motif-drawer .drawer-sheet,
    .cover-motif-drawer .drawer-box,
    .cover-motif-window .window-field,
    .cover-motif-window .window-frame,
    .cover-motif-path .path-step,
    .cover-motif-archive .archive-case,
    .cover-motif-archive .archive-file,
    .cover-motif-layers .layer-sheet {
      position: absolute;
      border: 1px solid var(--hairline);
      background: color-mix(in srgb, var(--surface-1) 86%, var(--bg));
      border-radius: var(--radius);
    }

    .cover-motif-drawer .drawer-sheet-back {
      left: 9%; top: 9%; width: 58%; height: 62%; transform: rotate(5deg); opacity: .48;
    }

    .cover-motif-drawer .drawer-sheet-front {
      left: 15%; top: 13%; width: 58%; height: 62%; transform: rotate(-4deg); opacity: .9;
    }

    .cover-motif-drawer .drawer-box {
      right: 5%; bottom: 10%; width: 61%; height: 39%; padding: 17px 21px;
      display: grid; grid-template-rows: repeat(3, 1fr); gap: 13px; border: 2px solid var(--ink);
      background: color-mix(in srgb, var(--surface-2) 66%, var(--bg));
    }

    .cover-motif-drawer .drawer-box::before {
      content: ""; position: absolute; left: -5%; right: -5%; top: -12px; border-top: 4px solid var(--ink); transform: skewX(-16deg);
    }

    .cover-motif-drawer .drawer-box i {
      display: block; border-top: 2px solid color-mix(in srgb, var(--ink) 42%, var(--hairline));
    }

    .cover-motif-drawer .drawer-handle {
      position: absolute; right: 24%; bottom: 22%; width: 24%; height: 18px;
      border: 2px solid var(--accent); border-radius: 999px; background: var(--surface-1);
    }

    .cover-motif-window .window-field {
      left: 7%; top: 11%; width: 58%; height: 64%; background: color-mix(in srgb, var(--surface-2) 38%, var(--bg));
    }

    .cover-motif-window .window-field i {
      position: absolute; width: 9px; height: 9px; border: 1px solid var(--ink-light); border-radius: 50%; opacity: .62;
    }

    .cover-motif-window .window-field i:nth-child(1) { left: 17%; top: 24%; }
    .cover-motif-window .window-field i:nth-child(2) { left: 43%; top: 48%; }
    .cover-motif-window .window-field i:nth-child(3) { left: 67%; top: 23%; }
    .cover-motif-window .window-field i:nth-child(4) { left: 76%; top: 72%; }

    .cover-motif-window .window-frame {
      right: 5%; top: 22%; width: 56%; height: 55%; border-color: var(--ink); background: var(--surface-1);
    }

    .cover-motif-window .window-frame b {
      position: absolute; display: block; background: var(--hairline);
    }

    .cover-motif-window .window-frame b:first-child { left: 50%; top: 0; bottom: 0; width: 1px; }
    .cover-motif-window .window-frame b:last-child { left: 0; right: 0; top: 49%; height: 1px; }

    .cover-motif-window .window-slit {
      position: absolute; left: 42%; right: 2%; bottom: 14%; border-top: 2px solid var(--accent); opacity: .72;
    }

    .cover-motif-lens .lens-ring,
    .cover-motif-lens .lens-core {
      position: absolute; border-radius: 50%;
    }

    .cover-motif-lens .lens-ring-outer {
      left: 15%; top: 11%; width: 67%; aspect-ratio: 1; border: 1px solid var(--ink);
    }

    .cover-motif-lens .lens-ring-inner {
      left: 28%; top: 24%; width: 41%; aspect-ratio: 1; border: 1px solid var(--hairline);
    }

    .cover-motif-lens .lens-core {
      left: 45%; top: 41%; width: 8%; aspect-ratio: 1; background: var(--accent); opacity: .72;
    }

    .cover-motif-lens .lens-beam {
      position: absolute; left: 0; right: 5%; bottom: 18%; border-top: 1px solid var(--accent); transform: rotate(-12deg); opacity: .72;
    }

    .cover-motif-path .path-step { width: 31%; height: 25%; }
    .cover-motif-path .path-step-a { left: 6%; bottom: 16%; }
    .cover-motif-path .path-step-b { left: 35%; top: 37%; }
    .cover-motif-path .path-step-c { right: 4%; top: 10%; }

    .cover-motif-path .path-thread {
      position: absolute; height: 1px; background: var(--accent); transform-origin: left center; opacity: .7;
    }

    .cover-motif-path .path-thread-a { left: 27%; top: 62%; width: 31%; transform: rotate(-33deg); }
    .cover-motif-path .path-thread-b { left: 55%; top: 40%; width: 34%; transform: rotate(-35deg); }

    .cover-motif-archive .archive-case {
      left: 17%; top: 12%; width: 57%; height: 67%; padding: 14px 17px; display: grid; grid-template-rows: repeat(4, 1fr); gap: 11px;
      border: 2px solid var(--ink);
      background: color-mix(in srgb, var(--surface-2) 62%, var(--bg));
    }

    .cover-motif-archive .archive-case i { display: block; border-top: 2px solid color-mix(in srgb, var(--ink) 46%, var(--hairline)); }
    .cover-motif-archive .archive-file { width: 32%; height: 45%; border: 2px solid var(--accent); }
    .cover-motif-archive .archive-file::before {
      content: ""; position: absolute; left: 18%; right: 18%; top: 27%; height: 38%;
      background: repeating-linear-gradient(to bottom, var(--ink-muted) 0 2px, transparent 2px 14px); opacity: .62;
    }
    .cover-motif-archive .archive-file-a { right: 5%; top: 12%; transform: rotate(5deg); opacity: .84; }
    .cover-motif-archive .archive-file-b { right: 0; top: 29%; transform: rotate(-4deg); opacity: 1; }
    .cover-motif-archive .archive-file-c { right: 11%; bottom: 7%; transform: rotate(7deg); opacity: .76; }

    .cover-motif-layers .layer-sheet { width: 63%; height: 65%; }
    .cover-motif-layers .layer-sheet i { position: absolute; left: 15%; right: 15%; top: 48%; border-top: 1px solid var(--accent); opacity: .62; }
    .cover-motif-layers .layer-sheet-a { left: 8%; top: 13%; transform: rotate(-6deg); opacity: .48; }
    .cover-motif-layers .layer-sheet-b { left: 18%; top: 18%; transform: rotate(3deg); opacity: .7; }
    .cover-motif-layers .layer-sheet-c { right: 4%; top: 25%; transform: rotate(8deg); }
    .cover-motif-layers .layer-axis { position: absolute; left: 7%; right: 3%; bottom: 14%; border-top: 1px solid var(--hairline); }

    .editorial-square {
      grid-template-columns: 1fr;
      align-content: center;
    }

    .editorial-square .editorial-visual {
      position: absolute;
      inset: auto 70px 80px auto;
      width: 46%;
      opacity: 0.88;
    }

    ${textPlan}
  `;
}

function render(input, outputHtmlPath) {
  const creativeUse = input.use === 'in-article' || input.use === 'metaphor';
  if (creativeUse && input.composition_required !== true) {
    throw new Error(`editorial-image use=${input.use} requires composition_required=true with non-empty "content_html" and "custom_css"`);
  }
  if (input.composition_required === true) {
    if (typeof input.content_html !== 'string' || input.content_html.trim() === '') {
      throw new Error('composition_required=true requires non-empty "content_html"');
    }
    if (typeof input.custom_css !== 'string' || input.custom_css.trim() === '') {
      throw new Error('composition_required=true requires non-empty "custom_css"');
    }
  }

  if (input.cover_motif && !COVER_MOTIFS.has(input.cover_motif)) {
    throw new Error(`Unknown editorial-image cover_motif: ${input.cover_motif}`);
  }

  const designName = resolveEditorialDesignName(input);
  const design = designName ? getDesign(designName) : null;
  if (!design) throw new Error(`Design not found: ${input.design || input.editorial_tone}`);

  const aspectKey = defaultAspect(input);
  const aspect = { ...ASPECTS[aspectKey], key: aspectKey };
  if (!aspect.width) throw new Error(`Unknown editorial-image aspect: ${aspectKey}`);

  let template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const logoUrl = input.logo ? escapeHtml(pathToFileURL(path.resolve(input.logo)).href) : '';
  const brandName = input.brand_name ? escapeHtml(input.brand_name) : '';
  const sourceLine = input.source ? `<span class="info-source">${escapeHtml(input.source)}</span>` : '';
  const contentHtml = input.content_html || renderDefaultContent(input, aspect);
  const customCss = `${baseCss(input, design, aspect)}\n${input.custom_css || ''}`;

  template = template.replaceAll('{{CUSTOM_CSS}}', customCss);
  template = template.replaceAll('{{CONTENT_HTML}}', contentHtml);
  template = template.replaceAll('{{SOURCE_LINE}}', sourceLine);
  template = template.replaceAll('{{LOGO}}', logoUrl);
  template = template.replaceAll('{{BRAND_NAME}}', brandName);
  template = template.replaceAll('{{FONT_BASE}}', FONT_DIR.replace(/\\/g, '/'));
  const toneAttr = input.editorial_tone ? ` data-editorial-tone="${escapeHtml(input.editorial_tone)}"` : '';
  const compositionAttr = input.composition_required === true ? ' data-composition-required="true"' : '';
  template = template.replace(
    '<div class="page">',
    `<div class="page" data-card-mode="editorial-image" data-card-design="${escapeHtml(designName)}"${toneAttr}${compositionAttr}>`,
  );

  if (!logoUrl && !brandName) {
    template = template.replace(/\s*<div class="who">[\s\S]*?<\/div>/, '');
  } else {
    if (!logoUrl) template = template.replace(/\s*<img src="" alt="">/, '');
    if (!brandName) template = template.replace(/\s*<span><\/span>/, '');
  }
  if (!logoUrl && !brandName && !sourceLine) {
    template = template.replace(/\s*<div class="colophon">\s*<\/div>/, '');
  }

  fs.writeFileSync(outputHtmlPath, template, 'utf-8');

  return {
    htmlPath: outputHtmlPath,
    captureWidth: aspect.width,
    captureHeight: aspect.height,
    fullpage: false,
  };
}

module.exports = { render, ASPECTS, COVER_MOTIFS, defaultAspect };
