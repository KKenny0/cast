/**
 * Big mode renderer for card-skill CLI.
 * Fills big_template.html with structured input.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { escapePhrase, escapeHtml } = require('../lib/escape');
const { cssOverrides, getDesign, resolveDesignNameForInput } = require('../lib/designs');

const TEMPLATE_PATH = path.resolve(__dirname, '../../assets/big_template.html');
const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');

/**
 * Calculate font size from total phrase length and the longest explicit line.
 * A short phrase can still overflow when a five-character CJK line is set at
 * 220px, so the line-fit cap is part of the deterministic render contract.
 */
function calcFontSize(phraseHtml) {
  const plain = phraseHtml.replace(/<[^>]+>/g, '');
  const len = plain.length;
  const base = len <= 10 ? 220 : len <= 20 ? 190 : 160;
  const lines = phraseHtml
    .split(/<br\s*\/?>/i)
    .map(line => line.replace(/<[^>]+>/g, ''));
  const visualLength = value => [...value].reduce((sum, char) => {
    if (/[\u3400-\u9fff]/.test(char)) return sum + 1;
    if (/\s/.test(char)) return sum + 0.32;
    return sum + 0.56;
  }, 0);
  const longestLine = Math.max(1, ...lines.map(visualLength));
  const lineFit = Math.floor(880 / longestLine);
  return `${Math.max(120, Math.min(base, lineFit))}px`;
}

function normalizeFontSize(value) {
  if (typeof value === 'number') return `${value}px`;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) return `${value.trim()}px`;
  return value;
}

function resolveFontSize(phraseHtml, requested) {
  const automatic = parseFloat(calcFontSize(phraseHtml));
  if (requested === undefined || requested === null) return `${automatic}px`;
  const normalized = normalizeFontSize(requested);
  const numeric = parseFloat(normalized);
  if (!Number.isFinite(numeric)) return normalized;
  return `${Math.min(numeric, automatic)}px`;
}

/**
 * Derive ghost character from phrase or accent_words.
 */
function deriveGhostChar(phraseHtml, accentWords) {
  if (accentWords && accentWords.length > 0) {
    return escapeHtml(accentWords[0]).charAt(0).toUpperCase();
  }
  const plain = phraseHtml.replace(/<[^>]+>/g, '');
  // Take first CJK char or first letter
  const cjk = plain.match(/[\u4e00-\u9fff\u3400-\u4dbf]/);
  if (cjk) return cjk[0];
  return plain.charAt(0).toUpperCase();
}

/**
 * Wrap accent_words in the phrase with <span class="accent">.
 * Only applies if phrase doesn't already contain accent spans.
 */
function applyAccentWords(phraseHtml, accentWords) {
  if (!accentWords || accentWords.length === 0) return phraseHtml;
  if (phraseHtml.includes('class="accent"')) return phraseHtml;
  let result = phraseHtml;
  for (const word of accentWords) {
    result = result.replace(new RegExp(escapeRegex(word), 'g'), `<span class="accent">${word}</span>`);
  }
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Render big mode from structured input.
 * @param {object} input - Validated input object
 * @param {string} outputHtmlPath - Where to write the filled HTML
 * @returns {object} - { htmlPath, captureWidth, captureHeight, fullpage }
 */
function render(input, outputHtmlPath) {
  const designName = resolveDesignNameForInput(input, 'vercel');
  const design = getDesign(designName);
  if (!design) throw new Error(`Design not found: ${input.design}`);

  let phraseHtml = escapePhrase(input.phrase);
  phraseHtml = applyAccentWords(phraseHtml, input.accent_words);

  const fontSize = resolveFontSize(phraseHtml, input.font_size);
  const ghostChar = input.ghost_char || deriveGhostChar(input.phrase, input.accent_words);
  const attribution = input.attribution ? escapeHtml(input.attribution) : '';

  const logoPath = input.logo ? path.resolve(input.logo) : '';
  const brandName = input.brand_name ? escapeHtml(input.brand_name) : '';
  const hasBranding = Boolean(logoPath || brandName);

  let template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // Set theme class based on design surface
  const theme = design.surface === 'dark' ? 'dark' : 'light';
  template = template.replace('class="dark"', `class="${theme}"`);

  // Inject design tokens
  const overrides = cssOverrides(designName);
  template = template.replace(/(:root\s*\{[^}]*\})/s, (match) => {
    return match.replace(/--bg:.*?;/, `--bg: ${design.canvas};`)
               .replace(/--accent:.*?;/, `--accent: ${design.accent};`)
               .replace(/--ink:.*?;/, `--ink: ${design.ink};`)
               .replace(/--ink-muted:.*?;/, `--ink-muted: ${design.inkMuted};`)
               .replace(/--surface-1:.*?;/, `--surface-1: ${design.surface1};`)
               .replace(/--hairline:.*?;/, `--hairline: ${design.hairline};`)
               .replace(/--radius:.*?;/, `--radius: ${design.radius};`);
  });

  // Fill placeholders (replaceAll because each placeholder appears in both
  // the HTML comment docs and the actual body — replace() only hits the first)
  template = template.replaceAll('{{PHRASE_HTML}}', phraseHtml);
  template = template.replaceAll('{{FONT_SIZE}}', fontSize);
  template = template.replaceAll('{{GHOST_CHAR}}', ghostChar);
  template = template.replaceAll('{{ATTRIBUTION}}', attribution);
  template = template.replaceAll('{{LOGO}}', logoPath ? escapeHtml(pathToFileURL(logoPath).href) : '');
  template = template.replaceAll('{{BRAND_NAME}}', brandName);
  template = template.replaceAll('{{FONT_BASE}}', FONT_DIR.replace(/\\/g, '/'));

  if (!hasBranding) {
    template = template.replace(/\s*<div class="colophon">[\s\S]*?<\/div>/, '');
  } else {
    if (!logoPath) template = template.replace(/\s*<img src="" alt="logo">/, '');
    if (!brandName) template = template.replace(/\s*<span><\/span>/, '');
  }

  fs.writeFileSync(outputHtmlPath, template, 'utf-8');

  return {
    htmlPath: outputHtmlPath,
    captureWidth: 1080,
    captureHeight: 1440,
    fullpage: false,
  };
}

module.exports = { render, calcFontSize, normalizeFontSize, resolveFontSize };
