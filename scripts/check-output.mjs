#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fileAccess from './lib/file-access.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const { createFileAccessPolicy } = fileAccess;

function parseArgs(argv) {
  const opts = {
    html: null,
    png: null,
    width: 1080,
    height: 800,
    dpr: 2,
    fullpage: false,
    fix: false,
    skipPng: false,
    json: false,
    selfTest: false,
    allowedFiles: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--html':
        opts.html = argv[++i];
        break;
      case '--png':
        opts.png = argv[++i];
        break;
      case '--width':
        opts.width = parseInt(argv[++i], 10) || opts.width;
        break;
      case '--height':
        opts.height = parseInt(argv[++i], 10) || opts.height;
        break;
      case '--dpr':
        opts.dpr = parseFloat(argv[++i]) || opts.dpr;
        break;
      case '--fullpage':
        opts.fullpage = true;
        break;
      case '--fix':
        opts.fix = true;
        break;
      case '--skip-png':
        opts.skipPng = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--self-test':
        opts.selfTest = true;
        break;
      case '--allow-file':
        if (!argv[i + 1]) throw new Error('--allow-file requires a path');
        opts.allowedFiles.push(argv[++i]);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`card-skill output checker

Usage:
  node scripts/check-output.mjs --html <file> --png <file> --width 1080 --height 800 [--fullpage]
  node scripts/check-output.mjs --html <file> --fix --skip-png

Options:
  --html <file>   HTML file to inspect
  --png <file>    PNG file to verify
  --width <px>    Capture viewport width (default: 1080)
  --height <px>   Capture viewport height (default: 800)
  --dpr <n>       Device pixel ratio used for PNG capture (default: 2)
  --fullpage      The PNG was captured as a full-page image
  --fix           Apply low-risk HTML guards before checking
  --skip-png      Do not require a PNG file
  --json          Print JSON report
  --allow-file     Permit one explicit local asset path (repeatable)
  --self-test     Verify safe placeholder fixes without launching a browser
`);
}

function issue(severity, code, message, details = {}) {
  return { severity, code, message, details };
}

const EDITORIAL_ALLOWED_PRIMARY_FONTS = new Set([
  'dm sans',
  'dm serif display',
  'jetbrains mono',
  'xiangcuidengcusong',
  'xiangcuidazijiti',
]);

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function fileUrl(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}

function applySafeFixes(htmlPath) {
  let html = fs.readFileSync(htmlPath, 'utf-8');
  let fixed = false;

  const fontBase = path.join(ROOT, 'assets', 'fonts').replace(/\\/g, '/');

  const replacements = [
    ['{{LOGO}}', ''],
    ['{{AVATAR}}', ''],
    ['{{PHOTO}}', ''],
    ['{{FONT_BASE}}', fontBase],
  ];

  for (const [needle, value] of replacements) {
    if (html.includes(needle)) {
      html = html.replaceAll(needle, value);
      fixed = true;
    }
  }

  if (!html.includes('data-card-output-check')) {
    const guard = `<style data-card-output-check>
html, body { max-width: 100%; overflow-x: hidden; }
img { max-width: 100%; height: auto; }
</style>`;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${guard}\n</head>`);
      fixed = true;
    }
  }

  if (fixed) fs.writeFileSync(htmlPath, html, 'utf-8');
  return fixed;
}

function runSelfTest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-output-check-'));
  const htmlPath = path.join(tmpDir, 'placeholders.html');

  try {
    fs.writeFileSync(htmlPath, '<!doctype html><html><head></head><body><img src="{{AVATAR}}"><img src="{{PHOTO}}"><img src="{{LOGO}}"><span>{{FONT_BASE}}</span></body></html>');
    if (!applySafeFixes(htmlPath)) throw new Error('Safe placeholder fixes were not applied');

    const html = fs.readFileSync(htmlPath, 'utf8');
    if (/\{\{(?:AVATAR|PHOTO|LOGO)\}\}/.test(html)) throw new Error('Branding placeholder was not cleared');
    if (/assets\/(?:avatar|logo)\.png/.test(html)) throw new Error('Bundled branding was injected by default');
    if (!html.includes('/assets/fonts')) throw new Error('Font placeholder was not resolved');

    console.log('Output-check self-test passed: branding placeholders default to empty and the font path placeholder is resolved.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function readPngSize(pngPath) {
  const buf = fs.readFileSync(pngPath);
  const signature = '89504e470d0a1a0a';
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== signature) {
    return null;
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bytes: buf.length,
  };
}

function checkPng(opts, issues) {
  if (opts.skipPng) return;
  if (!opts.png) {
    issues.push(issue('error', 'png_missing_arg', 'PNG path was not provided.'));
    return;
  }

  const pngPath = path.resolve(opts.png);
  if (!fs.existsSync(pngPath)) {
    issues.push(issue('error', 'png_missing', 'PNG file was not generated.', { pngPath }));
    return;
  }

  const stat = fs.statSync(pngPath);
  if (stat.size < 1024) {
    issues.push(issue('error', 'png_empty', 'PNG file is empty or too small.', { pngPath, bytes: stat.size }));
    return;
  }

  const size = readPngSize(pngPath);
  if (!size) {
    issues.push(issue('error', 'png_invalid', 'PNG file is not a valid PNG image.', { pngPath }));
    return;
  }

  const expectedWidth = Math.round(opts.width * opts.dpr);
  if (Math.abs(size.width - expectedWidth) > 2) {
    issues.push(issue('error', 'png_width_mismatch', 'PNG width does not match the capture settings.', {
      expected: expectedWidth,
      actual: size.width,
    }));
  }

  if (!opts.fullpage) {
    const expectedHeight = Math.round(opts.height * opts.dpr);
    if (Math.abs(size.height - expectedHeight) > 2) {
      issues.push(issue('error', 'png_height_mismatch', 'PNG height does not match the fixed canvas settings.', {
        expected: expectedHeight,
        actual: size.height,
      }));
    }
  }
}

async function inspectBitmap(opts, html, issues, sharedContext = null) {
  if (opts.skipPng || !opts.png || !fs.existsSync(opts.png)) return;
  const browser = sharedContext ? null : await chromium.launch();
  try {
    const context = sharedContext || await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    // A data URL keeps this bitmap-only audit independent of Chromium's
    // file-origin image policy while remaining fully offline.
    const pngDataUrl = `data:image/png;base64,${fs.readFileSync(opts.png).toString('base64')}`;
    await page.setContent(`<img id="image" src="${pngDataUrl}">`);
    const metrics = await page.evaluate(async () => {
      const image = document.getElementById('image');
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      const { width, height } = canvas; const pixels = ctx.getImageData(0, 0, width, height).data;
      const point = (x, y) => { const i = (y * width + x) * 4; return [pixels[i], pixels[i + 1], pixels[i + 2]]; };
      const corners = [point(0, 0), point(width - 1, 0), point(0, height - 1), point(width - 1, height - 1)];
      const bg = corners.reduce((sum, color) => sum.map((value, i) => value + color[i] / corners.length), [0, 0, 0]);
      const distance = color => Math.sqrt(color.reduce((sum, value, i) => sum + (value - bg[i]) ** 2, 0));
      let sampled = 0; let foreground = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1;
      const buckets = new Map(); const edge = { top: 0, right: 0, bottom: 0, left: 0, samples: 0 };
      const stride = Math.max(1, Math.floor(Math.min(width, height) / 900));
      for (let y = 0; y < height; y += stride) for (let x = 0; x < width; x += stride) {
        const color = point(x, y); const isForeground = distance(color) > 18; sampled++;
        const bucket = color.map(value => Math.floor(value / 16)).join(','); buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
        if (isForeground) { foreground++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
        if (x < 2 || x >= width - 2 || y < 2 || y >= height - 2) {
          edge.samples++; if (y < 2 && isForeground) edge.top++; if (y >= height - 2 && isForeground) edge.bottom++; if (x < 2 && isForeground) edge.left++; if (x >= width - 2 && isForeground) edge.right++;
        }
      }
      const foregroundRatio = foreground / sampled;
      const dominantColorRatio = Math.max(...buckets.values()) / sampled;
      const bboxAreaRatio = maxX < 0 ? 0 : ((maxX - minX + stride) * (maxY - minY + stride)) / (width * height);
      return { foregroundRatio, dominantColorRatio, bboxAreaRatio, edge: Object.fromEntries(Object.entries(edge).filter(([key]) => key !== 'samples').map(([key, value]) => [key, edge.samples ? value / edge.samples : 0])) };
    });
    if (metrics.foregroundRatio < 0.005) issues.push(issue('error', 'bitmap_blank', 'PNG has less than 0.5% non-background pixels.', metrics));
    if (metrics.dominantColorRatio > 0.995) issues.push(issue('error', 'bitmap_nearly_uniform', 'PNG is almost a single quantized color.', metrics));
    if (Object.values(metrics.edge).some(value => value > 0.08)) issues.push(issue('warning', 'bitmap_edge_pressure', 'Non-background pixels are concentrated against an outer 2px edge.', metrics));
    if (/data-composition-required="true"/.test(html) && metrics.bboxAreaRatio < 0.18) issues.push(issue('warning', 'bitmap_subject_too_small', 'Studio editorial composition has a small non-background bounding box.', metrics));
  } finally { if (browser) await browser.close(); }
}

function checkPlaceholders(html, issues) {
  const activeHtml = stripHtmlComments(html);
  const matches = activeHtml.match(/\{\{[^}]+\}\}/g) || [];
  const unique = [...new Set(matches)];
  if (unique.length > 0) {
    issues.push(issue('error', 'unreplaced_placeholder', 'HTML still contains unreplaced placeholders.', {
      placeholders: unique.slice(0, 10),
    }));
  }
}

async function inspectPage(opts, html, issues) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.fullpage ? 5000 : opts.height },
      deviceScaleFactor: opts.dpr,
      serviceWorkers: 'block',
    });
    const policy = createFileAccessPolicy({
      htmlPath: opts.html,
      assetRoot: path.join(ROOT, 'assets'),
      allowedFiles: opts.allowedFiles,
    });
    const blocked = [];
    await context.route('**/*', async route => {
      const url = route.request().url();
      const decision = policy.inspect(url);
      if (decision.allowed) return route.continue();
      let host = 'local-file';
      if (decision.scheme === 'remote') {
        try { host = new URL(url).host || 'unknown'; } catch { host = 'unknown'; }
      }
      blocked.push({ resourceType: route.request().resourceType(), host, reason: decision.reason || 'remote-scheme' });
      await route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    await page.goto(fileUrl(opts.html), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const report = await page.evaluate(async ({ width, height, fullpage }) => {
      const viewportWidth = width;
      const viewportHeight = fullpage ? document.documentElement.scrollHeight : height;
      const doc = document.documentElement;
      const body = document.body;

      function isVisible(el) {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return cs.display !== 'none'
          && cs.visibility !== 'hidden'
          && parseFloat(cs.opacity || '1') > 0
          && rect.width > 1
          && rect.height > 1;
      }

      function hasVisibleTextChild(el) {
        return [...el.children].some(child => isVisible(child) && (child.textContent || '').trim().length > 0);
      }

      function getLineBreaks(el, minFontSize = 36) {
        const cs = window.getComputedStyle(el);
        const fontSize = parseFloat(cs.fontSize) || 0;
        if (fontSize < minFontSize) return null;

        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length < 6) return null;

        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            return (node.nodeValue || '').trim()
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          },
        });

        const chars = [];
        const range = document.createRange();
        let node;
        while ((node = walker.nextNode())) {
          for (let i = 0; i < node.nodeValue.length; i++) {
            const ch = node.nodeValue[i];
            if (!ch || /\r|\n|\t/.test(ch)) continue;
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rect = [...range.getClientRects()].find(item => item.width > 0 || item.height > 0);
            if (!rect) continue;
            chars.push({
              ch,
              left: rect.left,
              right: rect.right,
              top: rect.top,
            });
          }
        }
        range.detach();

        if (chars.length === 0) return null;

        const tolerance = Math.max(3, fontSize * 0.18);
        const lines = [];
        for (const item of chars.sort((a, b) => a.top - b.top || a.left - b.left)) {
          let line = lines.find(candidate => Math.abs(candidate.top - item.top) <= tolerance);
          if (!line) {
            line = { top: item.top, chars: [] };
            lines.push(line);
          }
          line.chars.push(item);
          line.top = (line.top + item.top) / 2;
        }

        const normalized = lines
          .sort((a, b) => a.top - b.top)
          .map(line => {
            const sorted = line.chars.sort((a, b) => a.left - b.left);
            return {
              text: sorted.map(item => item.ch).join('').replace(/\s+/g, ' ').trim(),
              width: Math.round(Math.max(...sorted.map(item => item.right)) - Math.min(...sorted.map(item => item.left))),
            };
          })
          .filter(line => line.text.length > 0 && line.width > 0);

        if (normalized.length < 2) return null;

        const widths = normalized.map(line => line.width);
        const maxWidth = Math.max(...widths);
        const last = normalized[normalized.length - 1];
        return {
          tag: el.tagName,
          className: typeof el.className === 'string' ? el.className : '',
          text: text.slice(0, 100),
          fontSize,
          maxWidth,
          lineCount: normalized.length,
          lines: normalized,
          lastLineRatio: maxWidth > 0 ? last.width / maxWidth : 1,
        };
      }

      const badImages = [...document.images]
        .filter(img => isVisible(img) && (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0))
        .map(img => ({
          src: img.getAttribute('src') || '',
          alt: img.getAttribute('alt') || '',
        }));

      const bounds = [];
      const textSizes = [];
      const headlineLines = [];
      const editorialFontViolations = [];
      const htmlTextBoxOverflows = [];
      const editorialVisualSystemErrors = [];
      const editorialVisualSystemWarnings = [];
      const bigPhraseMetrics = [];
      const articleDiagramLabelCollisions = [];
      const articleDiagramCaptionIssues = [];
      const articleDiagramBandHeaderOverlaps = [];
      const formulaCardMetrics = [];
      const meaningfulTags = new Set(['P', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV', 'BLOCKQUOTE']);
      const ignoreBounds = /texture|noise|grain|background|ghost|watermark|bleed|decor/i;
      const headlinePattern = /title|headline|hero|cover|phrase|editorial|subtitle|caption|statement/i;
      const isEditorialImage = Boolean(document.querySelector('[data-card-mode="editorial-image"], [data-card-mode="article-diagram"]'));
      const isArticleDiagram = Boolean(document.querySelector('[data-card-mode="article-diagram"]'));
      const expectsFormulaCard = Boolean(document.querySelector('[data-diagram-family="compression-pack"][data-compression-view="summary"]'));
      const isBigMode = Boolean(document.querySelector('[data-card-mode="big"]'));
      const allowedPrimaryFonts = new Set([
        'dm sans',
        'dm serif display',
        'jetbrains mono',
        'xiangcuidengcusong',
        'xiangcuidazijiti',
      ]);

      function splitFontFamilies(value) {
        const families = [];
        let current = '';
        let quote = null;

        for (const ch of value || '') {
          if ((ch === '"' || ch === "'") && !quote) {
            quote = ch;
            current += ch;
            continue;
          }
          if (ch === quote) {
            quote = null;
            current += ch;
            continue;
          }
          if (ch === ',' && !quote) {
            if (current.trim()) families.push(current.trim());
            current = '';
            continue;
          }
          current += ch;
        }

        if (current.trim()) families.push(current.trim());
        return families;
      }

      function normalizeFontFamily(value) {
        return (value || '')
          .trim()
          .replace(/^['"]|['"]$/g, '')
          .replace(/\s+/g, ' ')
          .toLowerCase();
      }

      function hasVisibleBoxFrame(el) {
        const cs = window.getComputedStyle(el);
        const borderWidth = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
          .reduce((sum, prop) => sum + (parseFloat(cs[prop]) || 0), 0);
        const outlineWidth = parseFloat(cs.outlineWidth) || 0;
        return borderWidth > 0 || outlineWidth > 0;
      }

      function nearestTextFrame(el) {
        for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (!isVisible(parent)) continue;
          if (!hasVisibleBoxFrame(parent)) continue;
          return parent;
        }
        return null;
      }

      function rectsIntersect(a, b, gap = 0) {
        return a.left < b.right + gap
          && a.right > b.left - gap
          && a.top < b.bottom + gap
          && a.bottom > b.top - gap;
      }

      function textContentRect(el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()]
          .filter(rect => rect.width > 1 && rect.height > 1);
        range.detach();
        if (rects.length === 0) return el.getBoundingClientRect();
        return rects.reduce((acc, rect) => ({
          left: Math.min(acc.left, rect.left),
          top: Math.min(acc.top, rect.top),
          right: Math.max(acc.right, rect.right),
          bottom: Math.max(acc.bottom, rect.bottom),
          width: Math.max(acc.right, rect.right) - Math.min(acc.left, rect.left),
          height: Math.max(acc.bottom, rect.bottom) - Math.min(acc.top, rect.top),
        }), rects[0]);
      }

      function parseRgb(value) {
        const match = (value || '').match(/rgba?\(([^)]+)\)/i);
        if (!match) return null;
        const parts = match[1].split(',').map(part => part.trim());
        if (parts.length < 3) return null;
        const rgb = parts.slice(0, 3).map(part => {
          if (part.endsWith('%')) return Math.round(parseFloat(part) * 2.55);
          return parseFloat(part);
        });
        const alpha = parts[3] == null ? 1 : parseFloat(parts[3]);
        if (rgb.some(n => Number.isNaN(n)) || Number.isNaN(alpha)) return null;
        return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha };
      }

      function cssColorToRgb(value) {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.appendChild(probe);
        const parsed = parseRgb(window.getComputedStyle(probe).color);
        probe.remove();
        return parsed;
      }

      function rgbKey(rgb) {
        if (!rgb) return '';
        return `${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)}`;
      }

      function saturation(rgb) {
        const r = rgb.r / 255;
        const g = rgb.g / 255;
        const b = rgb.b / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max === min) return 0;
        const lightness = (max + min) / 2;
        const delta = max - min;
        return delta / (1 - Math.abs(2 * lightness - 1));
      }

      function maxShadowPx(boxShadow) {
        if (!boxShadow || boxShadow === 'none') return 0;
        const px = [...boxShadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)]
          .map(match => Math.abs(parseFloat(match[1])));
        return px.length ? Math.max(...px) : 0;
      }

      const rootStyle = window.getComputedStyle(document.documentElement);
      const tokenColorKeys = new Set(
        ['--bg', '--surface-1', '--surface-2', '--accent', '--ink', '--ink-light', '--ink-muted', '--hairline']
          .map(name => rgbKey(cssColorToRgb(rootStyle.getPropertyValue(name).trim())))
          .filter(Boolean)
      );
      const viewportArea = viewportWidth * viewportHeight;

      for (const el of document.querySelectorAll('body *')) {
        if (!isVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        const className = typeof el.className === 'string' ? el.className : '';
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const cs = window.getComputedStyle(el);

        if (!ignoreBounds.test(className)) {
          const offLeft = rect.left < -2;
          const offRight = rect.right > viewportWidth + 2;
          const offTop = !fullpage && rect.top < -2;
          const offBottom = !fullpage && rect.bottom > viewportHeight + 2;
          if (offLeft || offRight || offTop || offBottom) {
            bounds.push({
              tag: el.tagName,
              className,
              text: text.slice(0, 80),
              rect: {
                left: Math.round(rect.left),
                top: Math.round(rect.top),
                right: Math.round(rect.right),
                bottom: Math.round(rect.bottom),
              },
            });
          }
        }

        if (isEditorialImage && rect.width > 0 && rect.height > 0 && !ignoreBounds.test(className)) {
          const borderWidths = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
            .map(prop => parseFloat(cs[prop]) || 0);
          const maxBorder = Math.max(...borderWidths);
          if (maxBorder > 2.01) {
            editorialVisualSystemErrors.push({
              code: 'thick_border',
              tag: el.tagName,
              className,
              text: text.slice(0, 80),
              borderPx: Number(maxBorder.toFixed(1)),
            });
          }

          const bg = parseRgb(cs.backgroundColor);
          const area = rect.width * rect.height;
          if (bg && bg.a > 0.05 && area > viewportArea * 0.025) {
            const sat = saturation(bg);
            const key = rgbKey(bg);
            const isTokenColor = tokenColorKeys.has(key);
            const isNearPure = (bg.r > 245 && bg.g > 245 && bg.b > 245) || (bg.r < 12 && bg.g < 12 && bg.b < 12);
            if (!isTokenColor && (sat > 0.55 || isNearPure)) {
              editorialVisualSystemErrors.push({
                code: 'loud_large_fill',
                tag: el.tagName,
                className,
                text: text.slice(0, 80),
                backgroundColor: cs.backgroundColor,
                saturation: Number(sat.toFixed(2)),
                areaRatio: Number((area / viewportArea).toFixed(3)),
              });
            }
          }

          const shadowPx = maxShadowPx(cs.boxShadow);
          if (shadowPx > 8) {
            editorialVisualSystemWarnings.push({
              code: 'heavy_shadow',
              tag: el.tagName,
              className,
              text: text.slice(0, 80),
              boxShadow: cs.boxShadow.slice(0, 160),
            });
          }
        }

        if (meaningfulTags.has(el.tagName) && text && !hasVisibleTextChild(el)) {
          const families = splitFontFamilies(cs.fontFamily || '');
          const primaryFont = normalizeFontFamily(families[0] || '');
          textSizes.push({
            tag: el.tagName,
            className,
            text: text.slice(0, 80),
            fontSize: parseFloat(cs.fontSize),
            primaryFont,
          });

          if (isEditorialImage && primaryFont && !allowedPrimaryFonts.has(primaryFont)) {
            editorialFontViolations.push({
              tag: el.tagName,
              className,
              text: text.slice(0, 80),
              primaryFont,
              fontFamily: (cs.fontFamily || '').slice(0, 160),
            });
          }

          const frame = nearestTextFrame(el);
          if (frame) {
            const frameRect = frame.getBoundingClientRect();
            const TOL = 2;
            const overflowLeft = frameRect.left - rect.left;
            const overflowRight = rect.right - frameRect.right;
            const overflowTop = frameRect.top - rect.top;
            const overflowBottom = rect.bottom - frameRect.bottom;
            if (
              overflowLeft > TOL ||
              overflowRight > TOL ||
              overflowTop > TOL ||
              overflowBottom > TOL
            ) {
              htmlTextBoxOverflows.push({
                tag: el.tagName,
                className,
                text: text.slice(0, 80),
                frameTag: frame.tagName,
                frameClassName: typeof frame.className === 'string' ? frame.className : '',
                overflowPx: {
                  left: Math.max(0, Math.round(overflowLeft)),
                  right: Math.max(0, Math.round(overflowRight)),
                  top: Math.max(0, Math.round(overflowTop)),
                  bottom: Math.max(0, Math.round(overflowBottom)),
                },
              });
            }
          }
        }

        if (['H1', 'H2'].includes(el.tagName) || headlinePattern.test(className)) {
          const lineBreaks = getLineBreaks(el, /subtitle|caption|statement/i.test(className) ? 28 : 36);
          if (lineBreaks) headlineLines.push(lineBreaks);
        }
      }

      // ===== SVG text overflow: g > rect/circle/ellipse + text =====
      // Detects pill/badge/label containers where text spills past the shape.
      // Only flags text that overlaps the shape and extends past its edge by
      // more than TOLERANCE px. Text fully outside the shape (e.g. a label
      // placed beside a rect, not inside it) is skipped — that is a design
      // intent, not overflow.
      const svgTextOverflows = [];
      const OVERFLOW_TOLERANCE = 2; // allow text to align flush with shape edge
      for (const svg of document.querySelectorAll('svg')) {
        for (const g of svg.querySelectorAll('g')) {
          const shape = g.querySelector(':scope > rect, :scope > circle, :scope > ellipse');
          const texts = g.querySelectorAll(':scope > text');
          if (!shape || texts.length === 0) continue;
          if (!isVisible(g) && !isVisible(shape)) continue;
          const shapeBox = shape.getBoundingClientRect();
          if (shapeBox.width === 0 || shapeBox.height === 0) continue;
          for (const text of texts) {
            const textBox = text.getBoundingClientRect();
            if (textBox.width === 0 || textBox.height === 0) continue;
            // Skip text that sits fully outside the shape — likely a label
            // placed beside the shape, not an overflow of the shape's content.
            const fullyOutsideHorizontal = textBox.right <= shapeBox.left || textBox.left >= shapeBox.right;
            const fullyOutsideVertical = textBox.bottom <= shapeBox.top || textBox.top >= shapeBox.bottom;
            if (fullyOutsideHorizontal || fullyOutsideVertical) continue;
            const overflowRight = textBox.right - shapeBox.right;
            const overflowLeft = shapeBox.left - textBox.left;
            if (overflowRight > OVERFLOW_TOLERANCE || overflowLeft > OVERFLOW_TOLERANCE) {
              svgTextOverflows.push({
                groupTransform: g.getAttribute('transform') || '(none)',
                shape: shape.tagName,
                text: (text.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
                shapeRight: Math.round(shapeBox.right),
                textRight: Math.round(textBox.right),
                overflowPx: Math.round(Math.max(overflowRight, overflowLeft)),
              });
            }
          }
        }
      }

      // ===== Font load failure: @font-face declared but not actually loaded =====
      // Catches silent fallback when @font-face src URL is wrong, file is
      // .gitignored out, or font name has a typo. Browser still renders text
      // using a fallback family, hiding the failure visually but breaking
      // typography metrics.
      const fontLoadFailures = [];
      const declaredFonts = [];
      try {
        for (const sheet of document.styleSheets) {
          let rules;
          try { rules = sheet.cssRules; } catch (e) { continue; }
          if (!rules) continue;
          for (const rule of rules) {
            if (rule instanceof CSSFontFaceRule) {
              const family = rule.style.getPropertyValue('font-family');
              if (!family) continue;
              declaredFonts.push(family.replace(/['"]/g, '').trim());
            }
          }
        }
      } catch (e) { /* CSSOM blocked, skip */ }

      if (declaredFonts.length > 0 && document.fonts) {
        try { await document.fonts.ready; } catch (e) { /* timeout */ }
        // Only check fonts actually applied to at least one element.
        // Templates may declare @font-face families that the current render
        // never uses (e.g. editorial-image inherits infograph_template's
        // XiangcuiDazijiti but only renders XiangcuiDengcusong). Browsers
        // don't load unused families, so document.fonts.check() returns
        // false for them — a false positive that fails the build.
        //
        // Computed font-family returns the whole fallback stack, not the
        // per-glyph font that was actually used. Check declared primary fonts
        // directly, and check declared fallback CJK fonts only when the element
        // has CJK text that may need that fallback.
        const declaredByNormalized = new Map([...new Set(declaredFonts)]
          .map(family => [normalizeFontFamily(family), family]));
        const appliedFontSamples = new Map();
        for (const el of document.querySelectorAll('*')) {
          const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (!text) continue;
          const families = splitFontFamilies(window.getComputedStyle(el).fontFamily || '')
            .map(normalizeFontFamily)
            .filter(Boolean);
          const primary = families[0] || '';
          if (declaredByNormalized.has(primary)) {
            appliedFontSamples.set(primary, text.slice(0, 40));
          }
          if (/[\u3400-\u9fff]/.test(text)) {
            for (const family of families.slice(1)) {
              if (declaredByNormalized.has(family)) {
                appliedFontSamples.set(family, text.slice(0, 40));
              }
            }
          }
        }
        for (const family of [...new Set(declaredFonts)]) {
          const normalizedFamily = normalizeFontFamily(family);
          const sampleText = appliedFontSamples.get(normalizedFamily);
          if (!sampleText) continue;
          let ok = false;
          try { ok = document.fonts.check(`16px "${family}"`, sampleText); } catch (e) { continue; }
          if (ok) continue;
          // Find actual fallback by inspecting elements that requested this family
          let fallback = 'unknown';
          for (const el of document.querySelectorAll('*')) {
            const cs = window.getComputedStyle(el);
            const cssFamily = cs.fontFamily || '';
            if (cssFamily.toLowerCase().includes(family.toLowerCase())) {
              fallback = cssFamily.slice(0, 120);
              break;
            }
          }
          fontLoadFailures.push({
            declaredFamily: family,
            fallbackFamily: fallback,
          });
        }
      }

      // ===== SVG text outside viewBox: hard constraint, zero threshold =====
      // Any SVG <text> whose rendered bounding box exceeds any edge of the
      // SVG's viewBox (left < 0, top < 0, right > width, bottom > height)
      // is an ERROR. This is a boolean check, not a padding threshold.
      // Visual "near-edge" tightness is handled by the SVG ViewBox Design
      // Principle in mode-editorial-image.md (viewBox includes padding),
      // not by this runtime check.
      const svgTextOutsideViewbox = [];
      for (const svg of document.querySelectorAll('svg')) {
        const vb = svg.viewBox && svg.viewBox.baseVal;
        if (!vb || vb.width === 0 || vb.height === 0) continue;
        const svgBox = svg.getBoundingClientRect();
        if (svgBox.width === 0 || svgBox.height === 0) continue;
        const scaleX = vb.width / svgBox.width;
        const scaleY = vb.height / svgBox.height;
        for (const text of svg.querySelectorAll('text')) {
          if (!isVisible(text)) continue;
          const textBox = text.getBoundingClientRect();
          if (textBox.width === 0 || textBox.height === 0) continue;
          const left_vb = (textBox.left - svgBox.left) * scaleX;
          const right_vb = (textBox.right - svgBox.left) * scaleX;
          const top_vb = (textBox.top - svgBox.top) * scaleY;
          const bottom_vb = (textBox.bottom - svgBox.top) * scaleY;
          const TOL = 0.5; // sub-unit tolerance for float rounding
          const violations = [];
          if (left_vb < -TOL) violations.push({ edge: 'left', value: Math.round(left_vb * 10) / 10 });
          if (top_vb < -TOL) violations.push({ edge: 'top', value: Math.round(top_vb * 10) / 10 });
          if (right_vb > vb.width + TOL) violations.push({ edge: 'right', value: Math.round(right_vb * 10) / 10, limit: vb.width });
          if (bottom_vb > vb.height + TOL) violations.push({ edge: 'bottom', value: Math.round(bottom_vb * 10) / 10, limit: vb.height });
          if (violations.length > 0) {
            svgTextOutsideViewbox.push({
              text: (text.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
              viewBox: `${vb.width}x${vb.height}`,
              violations,
            });
          }
        }
      }

      // ===== Article diagram link-label collision =====
      // Concept-map relationship labels are small annotations; if they touch
      // node frames or sit against the stage boundary, the diagram stops
      // reading as a relationship map. Treat that as a hard failure.
      if (isArticleDiagram) {
        const caption = document.querySelector('.diagram-caption');
        const stage = document.querySelector('.diagram-stage');
        const stageBox = stage && isVisible(stage) ? stage.getBoundingClientRect() : null;
        if (caption && isVisible(caption)) {
          const captionBox = caption.getBoundingClientRect();
          const captionStyle = window.getComputedStyle(caption);
          const captionLineHeight = parseFloat(captionStyle.lineHeight)
            || ((parseFloat(captionStyle.fontSize) || 24) * 1.25);
          const estimatedLineCount = Math.max(1, Math.round(captionBox.height / captionLineHeight));
          const lines = getLineBreaks(caption, 12);
          const lineCount = lines && lines.length > 0 ? lines.length : estimatedLineCount;
          if (lineCount > 0) {
            const maxLineWidth = lines && lines.length > 0
              ? Math.max(...lines.map(line => line.width))
              : captionBox.width;
            const captionText = (caption.textContent || '').replace(/\s+/g, ' ').trim();
            if (lineCount > 2) {
              articleDiagramCaptionIssues.push({
                type: 'too_many_lines',
                text: captionText.slice(0, 100),
                lineCount,
              });
            }
            if (lineCount > 1
                && captionText.length < 90
                && stageBox
                && maxLineWidth < stageBox.width * 0.72) {
              articleDiagramCaptionIssues.push({
                type: 'narrow_wrap',
                text: captionText.slice(0, 100),
                lineCount,
                maxLineWidth: Math.round(maxLineWidth),
                stageWidth: Math.round(stageBox.width),
              });
            }
          }
        }

        const bandHeaderTexts = [...document.querySelectorAll('.boundary-bands .band-header strong, .boundary-bands .band-caption')]
          .filter(isVisible);
        const bandNodes = [...document.querySelectorAll('.boundary-bands .band-node')]
          .filter(isVisible);
        const BAND_TEXT_GAP = 2;
        for (const textEl of bandHeaderTexts) {
          const textBox = textContentRect(textEl);
          const text = (textEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
          for (const node of bandNodes) {
            const nodeBox = node.getBoundingClientRect();
            if (!rectsIntersect(textBox, nodeBox, BAND_TEXT_GAP)) continue;
            articleDiagramBandHeaderOverlaps.push({
              text,
              nodeText: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
              textRect: {
                left: Math.round(textBox.left),
                top: Math.round(textBox.top),
                right: Math.round(textBox.right),
                bottom: Math.round(textBox.bottom),
              },
              nodeRect: {
                left: Math.round(nodeBox.left),
                top: Math.round(nodeBox.top),
                right: Math.round(nodeBox.right),
                bottom: Math.round(nodeBox.bottom),
              },
            });
          }
        }

        const labels = [...document.querySelectorAll('.diagram-link-label, [data-diagram-link-label="true"]')]
          .filter(isVisible);
        const blockers = [...document.querySelectorAll('.diagram-node, .process-step, .boundary-node, .boundary-zone')]
          .filter(isVisible);
        const STAGE_PAD = 6;
        const COLLISION_GAP = 3;

        for (const label of labels) {
          const labelBox = label.getBoundingClientRect();
          const labelText = (label.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          if (stageBox && (
            labelBox.left < stageBox.left + STAGE_PAD ||
            labelBox.right > stageBox.right - STAGE_PAD ||
            labelBox.top < stageBox.top + STAGE_PAD ||
            labelBox.bottom > stageBox.bottom - STAGE_PAD
          )) {
            articleDiagramLabelCollisions.push({
              type: 'stage_boundary',
              text: labelText,
              labelRect: {
                left: Math.round(labelBox.left),
                top: Math.round(labelBox.top),
                right: Math.round(labelBox.right),
                bottom: Math.round(labelBox.bottom),
              },
            });
          }

          for (const blocker of blockers) {
            const blockerBox = blocker.getBoundingClientRect();
            if (!rectsIntersect(labelBox, blockerBox, COLLISION_GAP)) continue;
            articleDiagramLabelCollisions.push({
              type: 'node_overlap',
              text: labelText,
              blockerClassName: typeof blocker.className === 'string' ? blocker.className : '',
              blockerText: (blocker.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            });
          }
        }

        for (let i = 0; i < labels.length; i++) {
          for (let j = i + 1; j < labels.length; j++) {
            const a = labels[i].getBoundingClientRect();
            const b = labels[j].getBoundingClientRect();
            if (!rectsIntersect(a, b, COLLISION_GAP)) continue;
            articleDiagramLabelCollisions.push({
              type: 'label_overlap',
              text: (labels[i].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
              otherText: (labels[j].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            });
          }
        }
      }

      if (isBigMode) {
        const phrase = document.querySelector('[data-card-mode="big"] .phrase');
        if (phrase && isVisible(phrase)) {
          const rect = phrase.getBoundingClientRect();
          const cs = window.getComputedStyle(phrase);
          bigPhraseMetrics.push({
            tag: phrase.tagName,
            className: typeof phrase.className === 'string' ? phrase.className : '',
            text: (phrase.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            fontSize: parseFloat(cs.fontSize) || 0,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            areaRatio: Number(((rect.width * rect.height) / viewportArea).toFixed(4)),
            widthRatio: Number((rect.width / viewportWidth).toFixed(4)),
            heightRatio: Number((rect.height / viewportHeight).toFixed(4)),
          });
        }
      }

      if (isArticleDiagram) {
        const formulaCard = document.querySelector('[data-formula-card="true"]');
        const page = document.querySelector('.page');
        const note = formulaCard?.querySelector('[data-formula-note="true"]');
        if (formulaCard && page && note && isVisible(formulaCard)) {
          const cardRect = formulaCard.getBoundingClientRect();
          const pageRect = page.getBoundingClientRect();
          const noteStyle = window.getComputedStyle(note);
          const noteLineHeight = parseFloat(noteStyle.lineHeight) || 1;
          formulaCardMetrics.push({
            horizontalFill: Number((cardRect.width / pageRect.width).toFixed(3)),
            verticalFill: Number((cardRect.height / pageRect.height).toFixed(3)),
            leftWhitespace: Math.round(cardRect.left - pageRect.left),
            rightWhitespace: Math.round(pageRect.right - cardRect.right),
            topWhitespace: Math.round(cardRect.top - pageRect.top),
            bottomWhitespace: Math.round(pageRect.bottom - cardRect.bottom),
            noteLines: Math.round(note.getBoundingClientRect().height / noteLineHeight),
            formulaRows: formulaCard.querySelectorAll('[data-formula-row="true"]').length,
          });
        }
      }

      return {
        scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
        clientWidth: doc.clientWidth,
        scrollHeight: Math.max(doc.scrollHeight, body.scrollHeight),
        clientHeight: doc.clientHeight,
        badImages,
        bounds: bounds.slice(0, 20),
        textSizes,
        headlineLines: headlineLines.slice(0, 20),
        editorialFontViolations: editorialFontViolations.slice(0, 10),
        htmlTextBoxOverflows: htmlTextBoxOverflows.slice(0, 10),
        editorialVisualSystemErrors: editorialVisualSystemErrors.slice(0, 10),
        editorialVisualSystemWarnings: editorialVisualSystemWarnings.slice(0, 10),
        svgTextOverflows: svgTextOverflows.slice(0, 10),
        fontLoadFailures: fontLoadFailures.slice(0, 10),
        svgTextOutsideViewbox: svgTextOutsideViewbox.slice(0, 10),
        articleDiagramLabelCollisions: articleDiagramLabelCollisions.slice(0, 10),
        articleDiagramCaptionIssues: articleDiagramCaptionIssues.slice(0, 10),
        articleDiagramBandHeaderOverlaps: articleDiagramBandHeaderOverlaps.slice(0, 10),
        expectsFormulaCard,
        formulaCardMetrics: formulaCardMetrics.slice(0, 1),
        bigPhraseMetrics: bigPhraseMetrics.slice(0, 3),
      };
    }, { width: opts.width, height: opts.height, fullpage: opts.fullpage });

    if (report.scrollWidth > opts.width + 2) {
      issues.push(issue('error', 'horizontal_overflow', 'Page is wider than the capture viewport.', {
        scrollWidth: report.scrollWidth,
        viewportWidth: opts.width,
      }));
    }

    if (!opts.fullpage && report.scrollHeight > opts.height + 2) {
      issues.push(issue('error', 'vertical_crop_risk', 'Fixed-canvas output is taller than the capture viewport.', {
        scrollHeight: report.scrollHeight,
        viewportHeight: opts.height,
      }));
    }

    if (report.badImages.length > 0) {
      issues.push(issue('error', 'image_load_failed', 'One or more images failed to load.', {
        images: report.badImages.slice(0, 10),
      }));
    }

    if (report.bounds.length > 0) {
      issues.push(issue('error', 'element_out_of_bounds', 'Visible elements extend outside the captured area.', {
        elements: report.bounds,
      }));
    }

    if (report.svgTextOverflows.length > 0) {
      issues.push(issue('error', 'svg_text_overflow',
        'SVG text extends past its container shape (rect/circle/ellipse). Widen the shape, shorten the text, or reduce font-size.',
        { elements: report.svgTextOverflows }));
    }

    if (report.htmlTextBoxOverflows.length > 0) {
      issues.push(issue('error', 'html_text_box_overflow',
        'HTML text extends past its framed container. Widen the frame, shorten the label, or reduce the font-size.',
        { elements: report.htmlTextBoxOverflows }));
    }

    if (report.editorialVisualSystemErrors.length > 0) {
      issues.push(issue('error', 'editorial_visual_system_violation',
        'Editorial-image visual styling drifted outside the Quiet Paper system. Use token-derived surfaces, hairline borders, low-saturation accents, and restrained contrast.',
        { elements: report.editorialVisualSystemErrors }));
    }

    if (report.editorialVisualSystemWarnings.length > 0) {
      issues.push(issue('warning', 'editorial_visual_system_warning',
        'Editorial-image styling is visually heavy for Quiet Paper. Prefer layering, whitespace, and hairline structure over heavy shadow.',
        { elements: report.editorialVisualSystemWarnings }));
    }

    if (report.fontLoadFailures.length > 0) {
      issues.push(issue('error', 'font_load_failed',
        '@font-face declared but the font did not actually load. Browser fell back silently. Check the @font-face src URL, the .gitignore (fonts must be tracked), and the font-family spelling.',
        { elements: report.fontLoadFailures }));
    }

    if (report.editorialFontViolations.length > 0) {
      issues.push(issue('error', 'editorial_font_primary_not_allowed',
        `Editorial-image text must use a controlled primary font. Use one of: ${[...EDITORIAL_ALLOWED_PRIMARY_FONTS].join(', ')}. Fallback fonts are allowed after the primary font.`,
        { elements: report.editorialFontViolations }));
    }

    if (report.svgTextOutsideViewbox.length > 0) {
      issues.push(issue('error', 'svg_text_outside_viewbox',
        'SVG text bounding box exceeds the viewBox rectangle. Every <text> must render fully inside its SVG viewBox. Fix by widening the viewBox, moving the text inward, or shortening the string.',
        { elements: report.svgTextOutsideViewbox }));
    }

    if (report.articleDiagramLabelCollisions.length > 0) {
      issues.push(issue('error', 'article_diagram_label_collision',
        'Article-diagram relationship labels overlap nodes, other labels, or the stage boundary. Hide repeated labels, move the label, or simplify the links.',
        { elements: report.articleDiagramLabelCollisions }));
    }

    if (report.articleDiagramCaptionIssues.length > 0) {
      issues.push(issue('error', 'article_diagram_caption_layout',
        'Article-diagram captions must read as a compact explanation strip, not a narrow paragraph. Keep captions to one or two balanced lines across the diagram width.',
        { elements: report.articleDiagramCaptionIssues }));
    }

    if (report.articleDiagramBandHeaderOverlaps.length > 0) {
      issues.push(issue('error', 'article_diagram_band_header_overlap',
        'Article-diagram boundary band labels and descriptions must not overlap node cards. Move nodes below the band header or reduce density.',
        { elements: report.articleDiagramBandHeaderOverlaps }));
    }

    if (report.expectsFormulaCard && report.formulaCardMetrics.length !== 1) {
      issues.push(issue('error', 'article_diagram_formula_metrics_missing',
        'Compression summary output is missing the semantic formula-card measurement markers.',
        { count: report.formulaCardMetrics.length }));
    }

    const invalidFormulaCards = report.formulaCardMetrics.filter(item => (
      item.horizontalFill < 0.66
      || item.horizontalFill > 0.9
      || item.verticalFill < 0.4
      || item.verticalFill > 0.72
      || Math.abs(item.leftWhitespace - item.rightWhitespace) > 48
      || Math.abs(item.topWhitespace - item.bottomWhitespace) > 36
      || item.noteLines < 1
      || item.noteLines > 2
      || item.formulaRows > 3
    ));
    if (invalidFormulaCards.length > 0) {
      issues.push(issue('error', 'article_diagram_formula_density',
        'Editorial Equation content density or whitespace balance is outside the approved visual range.',
        { elements: invalidFormulaCards }));
    }

    if (report.bigPhraseMetrics.length === 0) {
      const hasBigMarker = fs.readFileSync(opts.html, 'utf-8').includes('data-card-mode="big"');
      if (hasBigMarker) {
        issues.push(issue('error', 'big_phrase_missing',
          'Big mode output must include a visible .phrase element.',
          {}));
      }
    }

    const undersizedBigPhrases = report.bigPhraseMetrics.filter(item => (
      item.fontSize < 96
      || item.areaRatio < 0.025
      || item.heightRatio < 0.08
    ));
    if (undersizedBigPhrases.length > 0) {
      issues.push(issue('error', 'big_phrase_too_small',
        'Big mode main phrase is too small for a large-text poster. Increase font size or use a denser composition.',
        { elements: undersizedBigPhrases }));
    }

    const labelPattern = /badge|label|tag|meta|source|num|kicker|eyebrow|ref|attr|byline|colophon|page-indicator|running-title|header|subtitle|caption|brand|footer/i;
    const formulaAnnotationPattern = /formula-card-deck/i;
    const bodyText = report.textSizes.filter(item => {
      if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(item.tag)) return false;
      if (labelPattern.test(item.className)) return false;
      if (formulaAnnotationPattern.test(item.className)) return false;
      return item.text.length >= 12 && item.fontSize >= 16;
    });
    const smallBodyText = bodyText.filter(item => item.fontSize < 36);
    if (smallBodyText.length > 0) {
      issues.push(issue('error', 'body_text_too_small', 'Body text is below the 36px readability floor.', {
        elements: smallBodyText.slice(0, 10),
      }));
    }

    const annotationText = report.textSizes.filter(item => {
      if (!labelPattern.test(item.className) && !formulaAnnotationPattern.test(item.className)) return false;
      if (/colophon|brand|footer|page-indicator/i.test(item.className)) return false;
      return item.text.length >= 4 && item.fontSize > 0 && item.fontSize < 24;
    });
    if (annotationText.length > 0) {
      issues.push(issue('warning', 'annotation_text_small', 'Some annotation text is below the 24px guideline.', {
        elements: annotationText.slice(0, 10),
      }));
    }

    const bannedModeLabels = new Set([
      'IN-ARTICLE IMAGE',
      'IN ARTICLE IMAGE',
      'EDITORIAL IMAGE',
      'BLOG HERO',
      'BLOG COVER',
      'WECHAT COVER',
      'ARTICLE COVER',
      'COVER IMAGE',
      'ARTICLE DIAGRAM',
      'CONCEPT MAP',
      'PROCESS FLOW',
      'BOUNDARY MODEL',
      // Chinese equivalents — same brief-leak class, just localized
      '公众号头图',
      '公众号封面',
      '博客封面',
      '博客头图',
      '正文配图',
      '正文解释图',
      '段落配图',
      '文章封面',
      '封面图',
    ]);
    const visibleModeLabels = report.textSizes.filter(item => {
      const normalized = item.text.toUpperCase().replace(/\s+/g, ' ').trim();
      return bannedModeLabels.has(normalized);
    });
    if (visibleModeLabels.length > 0) {
      issues.push(issue('error', 'mode_label_visible', 'Output mode labels should not appear in the artwork.', {
        elements: visibleModeLabels.slice(0, 10),
      }));
    }

    const briefLeakPatterns = [
      /给\s*[^，。；:：]{1,48}(这一节|这节|本节|段落|章节)?\s*使用/,
      /(用作|作为)\s*(正文|文章|章节|段落|小节)?\s*配图/,
      /(这张图|该图|此图)\s*(用于|用来|适合|作为)/,
      /(安静|低干扰).{0,16}(停顿|视觉换气|正文|配图)/,
      /像文章中间的?一次停顿/,
      /\b(visual pause|in-article illustration|section illustration)\b/i,
    ];
    const visibleBriefLeaks = report.textSizes.filter(item => {
      const normalized = item.text.replace(/\s+/g, ' ').trim();
      return briefLeakPatterns.some(pattern => pattern.test(normalized));
    });
    if (visibleBriefLeaks.length > 0) {
      issues.push(issue('error', 'editorial_brief_visible', 'Editorial-image brief or usage notes should not appear in the artwork.', {
        elements: visibleBriefLeaks.slice(0, 10),
      }));
    }

    const gluedTermPatterns = [
      /\bAIAgent\b/i,
      /\bHermesAgent\b/i,
      /\bContextCompression\b/i,
    ];
    const visibleGluedTerms = report.textSizes.filter(item => {
      const normalized = item.text.replace(/\s+/g, ' ').trim();
      return gluedTermPatterns.some(pattern => pattern.test(normalized));
    });
    if (visibleGluedTerms.length > 0) {
      issues.push(issue('error', 'technical_term_spacing_bad', 'Technical or product terms should preserve real word spacing.', {
        elements: visibleGluedTerms.slice(0, 10),
      }));
    }

    const badHeadlineBreaks = report.headlineLines.filter(item => {
      const last = item.lines[item.lines.length - 1];
      const lastText = last?.text || '';
      const cjkOnly = lastText.replace(/[^\u3400-\u9fff]/g, '');
      const hasShortCjkLine = item.lines.some(line => {
        const lineText = line.text || '';
        const lineCjk = lineText.replace(/[^\u3400-\u9fff]/g, '');
        return lineCjk.length > 0 && lineText.length <= 2 && line.width < 180;
      });
      const isShortLastLine = item.lineCount >= 2 && item.lastLineRatio < 0.24 && last.width < 180;
      const isCjkOrphan = item.lineCount >= 2 && cjkOnly.length > 0 && lastText.length <= 2;
      const isTooManyLines = item.lineCount > 3 && item.fontSize >= 48;
      return hasShortCjkLine || isShortLastLine || isCjkOrphan || isTooManyLines;
    });
    if (badHeadlineBreaks.length > 0) {
      issues.push(issue('error', 'text_line_break_bad', 'Headline or short-text line breaks do not meet the visual standard.', {
        elements: badHeadlineBreaks.map(item => ({
          tag: item.tag,
          className: item.className,
          text: item.text,
          lineCount: item.lineCount,
          lastLineRatio: Number(item.lastLineRatio.toFixed(2)),
          lines: item.lines,
        })).slice(0, 10),
      }));
    }
    await inspectBitmap(opts, html, issues, context);
    if (blocked.length) {
      issues.push(issue('error', 'safety.asset_blocked', 'Capture permits only approved local files and data: resources.', { resources: blocked.slice(0, 10) }));
    }
  } finally {
    await browser.close();
  }
}

function printReport(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (report.pass) {
    const suffix = report.fixed ? ' (safe fixes applied)' : '';
    console.log(`PASS${suffix}: ${path.resolve(report.html)}`);
  } else {
    console.error(`FAIL: ${path.resolve(report.html)}`);
  }

  for (const item of report.issues) {
    const prefix = item.severity === 'error' ? 'ERROR' : 'WARN';
    console.error(`${prefix} ${item.code}: ${item.message}`);
    if (Object.keys(item.details || {}).length > 0) {
      console.error(`  ${JSON.stringify(item.details)}`);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) {
    runSelfTest();
    return;
  }
  if (!opts.html) throw new Error('Missing --html <file>');
  opts.html = path.resolve(opts.html);
  if (!fs.existsSync(opts.html)) throw new Error(`HTML file not found: ${opts.html}`);
  if (opts.png) opts.png = path.resolve(opts.png);

  const fixed = opts.fix ? applySafeFixes(opts.html) : false;
  const issues = [];
  const html = fs.readFileSync(opts.html, 'utf-8');

  checkPlaceholders(html, issues);
  checkPng(opts, issues);
  await inspectPage(opts, html, issues);

  const report = {
    pass: !issues.some(item => item.severity === 'error'),
    fixed,
    html: opts.html,
    png: opts.png,
    issues,
  };

  printReport(report, opts.json);
  process.exit(report.pass ? 0 : 1);
}

main().catch(err => {
  const report = {
    pass: false,
    fixed: false,
    html: null,
    png: null,
    issues: [issue('error', 'checker_crashed', err.message)],
  };
  printReport(report, process.argv.includes('--json'));
  process.exit(1);
});
