/**
 * Poster mode renderer for card-skill CLI.
 * Fills poster_template.html for each card. Produces N HTML files for N cards.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { escapeHtml } = require('../lib/escape');
const { getDesign, resolveDesignNameForInput } = require('../lib/designs');

const TEMPLATE_PATH = path.resolve(__dirname, '../../assets/poster_template.html');
const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');

function calcPosterTitleFontSize(title) {
  const weight = [...String(title || '')].reduce((sum, char) => {
    if (/[\u3400-\u9fff]/.test(char)) return sum + 1;
    if (/\s/.test(char)) return sum + 0.3;
    if (/[，。！？、,:;!?]/.test(char)) return sum + 0.5;
    return sum + 0.56;
  }, 0);
  return Math.max(60, Math.min(92, Math.floor(820 / Math.max(1, weight))));
}

/**
 * Convert structured body elements into HTML for poster_template.
 * Supported types: paragraph, heading, highlight, items, data_row, divider,
 * and reading_unit for the reading-notes variant.
 */
function renderCardBody(body) {
  return body.map(el => {
    switch (el.type) {
      case 'paragraph':
        return `<p>${escapeHtml(el.text)}</p>`;
      case 'heading':
        return `<h2>${escapeHtml(el.text)}</h2>`;
      case 'highlight':
        return `<div class="highlight"><p>${escapeHtml(el.text)}</p></div>`;
      case 'items': {
        if (!Array.isArray(el.entries)) return '';
        return el.entries.filter(e => e.label && e.text).map(e => `
          <div class="item">
            <div class="label">${escapeHtml(e.label)}</div>
            <p>${escapeHtml(e.text)}</p>
          </div>`).join('\n');
      }
      case 'data_row': {
        if (!el.key || !el.value) return '';
        return `<div class="data-row"><span class="key">${escapeHtml(el.key)}</span><span class="value">${escapeHtml(el.value)}</span></div>`;
      }
      case 'divider':
        return '<div class="divider"></div>';
      case 'reading_unit': {
        const thought = typeof el.thought === 'string' && el.thought.trim() !== ''
          ? `<div class="reading-thought"><div class="reading-label">我的想法</div><p>${escapeHtml(el.thought)}</p></div>`
          : '';
        return `<section class="reading-unit"><div class="reading-quote"><div class="reading-label">原文划线</div><blockquote><p>${escapeHtml(el.quote)}</p></blockquote></div>${thought}</section>`;
      }
      default:
        return '';
    }
  }).join('\n\n');
}

function isSparsePosterCard(card) {
  if (!Array.isArray(card.body) || card.body.length === 0 || card.body.length > 2) return false;
  const visibleText = card.body.map(element => {
    if (typeof element.text === 'string') return element.text;
    if (Array.isArray(element.entries)) return element.entries.map(entry => `${entry.label || ''}${entry.text || ''}`).join('');
    return '';
  }).join('').replace(/\s+/g, '');
  return visibleText.length > 0 && visibleText.length <= 64;
}

/**
 * Render poster mode from structured input.
 * Produces one HTML file per card.
 * @returns {Array<object>} - Array of { htmlPath, captureWidth, captureHeight, fullpage }
 */
function render(input, outputDir) {
  const design = getDesign(resolveDesignNameForInput(input, 'stripe'));
  if (!design) throw new Error(`Design not found: ${input.design}`);

  // Poster template has no dark theme — reject dark-surface designs
  if (design.surface === 'dark') {
    throw new Error(`Poster mode requires a light-surface design. "${input.design}" is dark. Try one of: apple, expo, notion, claude, cursor, stripe, ibm, etc.`);
  }

  let template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const logoPath = input.logo ? path.resolve(input.logo) : '';
  const brandName = input.brand_name ? escapeHtml(input.brand_name) : '';
  const source = input.source ? escapeHtml(input.source) : '';
  const hasBranding = Boolean(logoPath || brandName);
  const hasColophon = Boolean(source || hasBranding);
  const totalCards = input.cards.length;
  const isReadingNotes = input.variant === 'reading-notes';

  const results = [];

  input.cards.forEach((card, i) => {
    const isFirst = i === 0;
    const isLast = i === totalCards - 1;
    const pageNum = i + 1;

    // Build header block (empty for first card)
    let headerBlock = '';
    if (!isFirst) {
      headerBlock = `<div class="header"><span class="running-title">${escapeHtml(input.title)}</span><span class="page-indicator">${pageNum} / ${totalCards}</span></div>`;
    }

    // Build title block (only for first card)
    let titleBlock = '';
    if (isFirst) {
      const titleFontSize = calcPosterTitleFontSize(input.title);
      titleBlock = `<div class="title-area"><h1 style="font-size:${titleFontSize}px">${escapeHtml(input.title)}</h1>${input.subtitle ? `<div class="subtitle">${escapeHtml(input.subtitle)}</div>` : ''}</div>`;
    }

    // Build colophon block (only for last card)
    let colophonBlock = '';
    if (isLast && hasColophon) {
      const sourceMark = source ? `<span class="source-mark">${source}</span>` : '';
      const brandMark = brandName ? `<div class="brand-mark"><div class="stripe-bar"></div><span>${brandName}</span></div>` : '';
      const logoMark = logoPath ? `<img class="logo-mark" src="${escapeHtml(pathToFileURL(logoPath).href)}" alt="logo">` : '';
      colophonBlock = `<div class="colophon"><div class="colophon-meta">${sourceMark}${brandMark}${logoMark}</div><span class="endmark">■</span></div>`;
    }

    // Fill template
    let html = template;
    html = html.replaceAll('{{BG_COLOR}}', design.canvas);
    html = html.replaceAll('{{ACCENT_COLOR}}', design.accent);

    // Inject remaining design tokens (not covered by Mustache placeholders)
    html = html.replace(/(--ink):\s*[^;]+;/g, `$1: ${design.ink};`);
    html = html.replace(/(--ink-muted):\s*[^;]+;/g, `$1: ${design.inkMuted};`);
    html = html.replace(/(--hairline):\s*[^;]+;/g, `$1: ${design.hairline};`);
    html = html.replace(/(--surface-1):\s*[^;]+;/g, `$1: ${design.surface1};`);
    html = html.replace(/(--surface-2):\s*[^;]+;/g, `$1: ${design.surface2};`);
    html = html.replace(/(--radius):\s*[^;]+;/g, `$1: ${design.radius};`);
    html = html.replaceAll('{{HEADER_BLOCK}}', headerBlock);
    html = html.replaceAll('{{TITLE_BLOCK}}', titleBlock);
    const cardTitle = isReadingNotes && card.title
      ? `<h2 class="reading-card-title">${escapeHtml(card.title)}</h2>`
      : '';
    const bodyHtml = Array.isArray(card.body) ? renderCardBody(card.body) : '';
    const sparseClass = !isReadingNotes && isSparsePosterCard(card) ? ' sparse-poster' : '';
    html = html.replaceAll('{{CARD_CLASS}}', `${isReadingNotes ? ' reading-notes' : ''}${sparseClass}`);
    html = html.replaceAll('{{BODY_HTML}}', `${cardTitle}${bodyHtml}`);
    html = html.replaceAll('{{COLOPHON_BLOCK}}', colophonBlock);
    html = html.replaceAll('{{LOGO}}', logoPath ? escapeHtml(pathToFileURL(logoPath).href) : '');
    html = html.replaceAll('{{BRAND_NAME}}', brandName);
    html = html.replaceAll('{{FONT_BASE}}', FONT_DIR.replace(/\\/g, '/'));
    html = html.replaceAll('{{PAGE_INFO}}', ''); // documented in comment but not used in body

    const htmlFileName = `card_poster_${i + 1}.html`;
    const htmlPath = path.join(outputDir, htmlFileName);
    fs.writeFileSync(htmlPath, html, 'utf-8');

    results.push({
      htmlPath,
      captureWidth: 1080,
      captureHeight: 1440,
      fullpage: false,
    });
  });

  return results;
}

module.exports = { render, renderCardBody, calcPosterTitleFontSize, isSparsePosterCard };
