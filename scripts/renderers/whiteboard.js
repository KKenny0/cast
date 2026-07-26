/**
 * Whiteboard mode renderer for card-skill CLI.
 * Fills whiteboard_template.html with structured input.
 * Converts typed step elements into template-supported HTML.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { escapeHtml } = require('../lib/escape');
const { getDesign, resolveDesignNameForInput } = require('../lib/designs');

const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');


/**
 * Convert structured steps into HTML for whiteboard_template.
 * Supported types: chain, annotation, layers, insight
 */
function renderSteps(steps) {
  return steps.map((step, i) => {
    const num = `<div class="step-num">${String(i + 1).padStart(2, '0')}</div>`;

    switch (step.type) {
      case 'chain': {
        const parts = step.nodes.map(node => {
          const text = escapeHtml(node.text);
          if (node.highlight) return `<span class="highlight">${text}</span>`;
          if (node.muted) return `<span class="muted">${text}</span>`;
          return text;
        }).join(' ');
        return `${num}<div class="chain"><div class="chain-node">${parts}</div></div>`;
      }
      case 'annotation': {
        return `${num}<div class="annotation">${escapeHtml(step.text).replace(/\*\*(.*?)\*\*/g, '<span class="em">$1</span>')}</div>`;
      }
      case 'layers': {
        const items = step.items.map(item => `
          <div class="layer">
            <div class="layer-body">
              <div class="layer-name">${escapeHtml(item.name)}</div>
              <div class="layer-desc">${escapeHtml(item.desc)}</div>
            </div>
          </div>`).join('\n');
        return `${num}<div class="layers">${items}</div>`;
      }
      case 'insight': {
        // Allow <span class="accent-word"> in insight text
        const safeText = step.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/&lt;span\s+class="accent-word"&gt;(.*?)&lt;\/span&gt;/g, '<span class="accent-word">$1</span>');
        return `
          <div class="insight-box">
            <div class="insight-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path d="M24 4 C16 4, 10 10, 10 18 C10 23, 13 27, 17 29 L17 34 C17 35, 18 36, 19 36 L29 36 C30 36, 31 35, 31 34 L31 29 C35 27, 38 23, 38 18 C38 10, 32 4, 24 4Z" stroke="var(--accent)" stroke-width="2" fill="none"/>
                <line x1="19" y1="40" x2="29" y2="40" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
                <line x1="20" y1="44" x2="28" y2="44" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
                <path d="M24 14 L24 22" stroke="var(--ink)" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M20 18 L28 18" stroke="var(--ink)" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="insight-text">${safeText}</div>
          </div>`;
      }
      default:
        return '';
    }
  }).join('\n\n');
}

/**
 * Apply accent_words to title text by wrapping them in <span class="keyword">.
 */
function applyAccentWords(title, accentWords) {
  if (!accentWords || accentWords.length === 0) return escapeHtml(title);
  let result = escapeHtml(title);
  for (const word of accentWords) {
    const escaped = escapeHtml(word);
    result = result.replace(new RegExp(escapeRegex(escaped), 'g'), `<span class="keyword">${escaped}</span>`);
  }
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Render whiteboard mode from structured input.
 */
function render(input, outputHtmlPath) {
  const design = getDesign(resolveDesignNameForInput(input, 'stripe'));
  if (!design) throw new Error(`Design not found: ${input.design}`);

  const templateFile = path.resolve(__dirname, '../../assets/whiteboard_template.html');
  let template = fs.readFileSync(templateFile, 'utf-8');

  // Set theme class based on design surface
  const theme = design.surface === 'dark' ? 'dark' : 'light';
  template = template.replace('class="dark"', `class="${theme}"`);

  // Inject design tokens
  template = template.replace(/(:root\s*\{[^}]*\})/s, (match) => {
    return match
      .replace(/--bg:.*?;/, `--bg: ${design.canvas};`)
      .replace(/--surface-1:.*?;/, `--surface-1: ${design.surface1};`)
      .replace(/--surface-2:.*?;/, `--surface-2: ${design.surface2};`)
      .replace(/--accent:.*?;/, `--accent: ${design.accent};`)
      .replace(/--ink:.*?;/, `--ink: ${design.ink};`)
      .replace(/--ink-muted:.*?;/, `--ink-muted: ${design.inkMuted};`)
      .replace(/--hairline:.*?;/, `--hairline: ${design.hairline};`)
      .replace(/--radius:.*?;/, `--radius: ${design.radius};`);
  });

  const logoPath = input.logo ? path.resolve(input.logo) : '';
  const brandName = input.brand_name ? escapeHtml(input.brand_name) : '';
  const hasBranding = Boolean(logoPath || brandName);
  const titleHtml = applyAccentWords(input.title, input.accent_words);

  // Fill placeholders
  template = template.replaceAll('{{SUBTITLE}}', escapeHtml(input.subtitle || ''));
  template = template.replaceAll('{{TITLE_HTML}}', titleHtml);
  template = template.replaceAll('{{STEPS_HTML}}', renderSteps(input.steps));
  template = template.replaceAll('{{LOGO}}', logoPath ? escapeHtml(pathToFileURL(logoPath).href) : '');
  template = template.replaceAll('{{BRAND_NAME}}', brandName);
  template = template.replaceAll('{{FONT_BASE}}', FONT_DIR.replace(/\\/g, '/'));

  if (!hasBranding) {
    template = template.replace(/\s*<div class="colophon">[\s\S]*?<\/div>/, '');
  } else {
    if (!logoPath) template = template.replace(/\s*<img src="" alt="logo"\/>/, '');
    if (!brandName) template = template.replace(/\s*<span><\/span>/, '');
  }

  fs.writeFileSync(outputHtmlPath, template, 'utf-8');

  return {
    htmlPath: outputHtmlPath,
    captureWidth: 1080,
    captureHeight: 800,
    fullpage: true,
  };
}

module.exports = { render, renderSteps };
