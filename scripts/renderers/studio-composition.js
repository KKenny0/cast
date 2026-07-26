const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { escapeHtml } = require('../lib/escape');
const { getDesign, resolveDesignNameForInput } = require('../lib/designs');

const ASSETS = path.resolve(__dirname, '../../assets');
const FONT_DIR = path.join(ASSETS, 'fonts');
const MODE_DEFAULTS = {
  infograph: { height: 800, fallback: 'notion' },
  comic: { height: 800, fallback: 'claude' },
  sketchnote: { height: 1500, fallback: 'notion' },
};

function replaceCssVar(html, name, value) {
  const pattern = new RegExp(`(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}):\\s*[^;]+;`, 'g');
  return html.replace(pattern, `$1: ${value};`);
}

function colophon(input, designName, comic = false) {
  const logoUrl = input.logo ? escapeHtml(pathToFileURL(path.resolve(input.logo)).href) : '';
  const brandName = input.brand_name ? escapeHtml(input.brand_name) : '';
  if (!logoUrl && !brandName && !input.source) return '';
  if (comic) {
    return `
      <div class="colophon">
        <div class="brand-mark">
          <div class="stripe-bar"></div>
          ${brandName ? `<span>${brandName}</span>` : ''}
        </div>
        ${logoUrl ? `<img class="logo-mark" src="${logoUrl}" alt="">` : ''}
        ${input.source ? `<span class="endmark">${escapeHtml(input.source)}</span>` : ''}
      </div>
    `;
  }
  return `
    <div class="colophon">
      <div class="who">
        ${logoUrl ? `<img src="${logoUrl}" alt="">` : ''}
        ${brandName ? `<span>${brandName}</span>` : ''}
      </div>
      ${input.source ? `<span class="info-source">${escapeHtml(input.source)}</span>` : ''}
    </div>
  `;
}

function render(input, outputHtmlPath) {
  const defaults = MODE_DEFAULTS[input.mode];
  if (!defaults) throw new Error(`Unsupported Studio composition mode: ${input.mode}`);
  const designName = resolveDesignNameForInput(input, defaults.fallback);
  const design = getDesign(designName);
  if (!design) throw new Error(`Design not found: ${input.design || input.tone}`);

  let html = fs.readFileSync(path.join(ASSETS, `${input.mode}_template.html`), 'utf8');
  html = html.replaceAll('{{FONT_BASE}}', FONT_DIR.replace(/\\/g, '/'));

  const variables = {
    '--bg': design.canvas,
    '--paper': design.canvas,
    '--panel': design.surface1,
    '--surface-1': design.surface1,
    '--surface-2': design.surface2,
    '--green': design.surface1,
    '--pink': design.accent,
    '--accent': design.accent,
    '--accent-1': design.accent,
    '--accent-2': design.accent,
    '--accent-3': design.accent,
    '--ink': design.ink,
    '--ink-light': design.inkMuted,
    '--ink-muted': design.inkMuted,
    '--ink-strong': design.ink,
    '--hairline': design.hairline,
    '--gray-light': design.surface2,
    '--gray-mid': design.inkMuted,
    '--gray-dark': design.ink,
  };
  for (const [name, value] of Object.entries(variables)) html = replaceCssVar(html, name, value);
  const tokenOverrides = `:root { ${Object.entries(variables).map(([name, value]) => `${name}: ${value};`).join(' ')} }`;

  if (input.mode === 'comic') {
    const subtitle = input.subtitle ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>` : '';
    html = html.replaceAll('{{HEADER_BLOCK}}', '');
    html = html.replaceAll('{{TITLE_BLOCK}}', `
      <div class="title-area">
        <h1>${escapeHtml(input.title)}</h1>
        ${subtitle}
      </div>
    `);
    html = html.replaceAll('{{PANELS_HTML}}', input.content_html);
    html = html.replaceAll('{{COLOPHON_BLOCK}}', colophon(input, designName, true));
  } else {
    const logoUrl = input.logo ? escapeHtml(pathToFileURL(path.resolve(input.logo)).href) : '';
    const brandName = input.brand_name ? escapeHtml(input.brand_name) : '';
    const sourceLine = input.source ? `<span class="info-source">${escapeHtml(input.source)}</span>` : '';
    html = html.replaceAll('{{TITLE}}', escapeHtml(input.title));
    html = html.replaceAll('{{SUBTITLE}}', escapeHtml(input.subtitle || ''));
    html = html.replaceAll('{{CONTENT_HTML}}', input.content_html);
    html = html.replaceAll('{{LOGO}}', logoUrl);
    html = html.replaceAll('{{BRAND_NAME}}', brandName);
    html = html.replaceAll('{{SOURCE_LINE}}', sourceLine);
    if (!logoUrl && !brandName) html = html.replace(/\s*<div class="who">[\s\S]*?<\/div>/, '');
    if (!logoUrl && !brandName && !sourceLine) html = html.replace(/\s*<div class="colophon">\s*<\/div>/, '');
  }

  html = html.replaceAll('{{CUSTOM_CSS}}', `${tokenOverrides}\n${input.custom_css}`);
  html = html.replaceAll('{{LOGO}}', '');
  html = html.replaceAll('{{BRAND_NAME}}', '');
  html = html.replaceAll('{{SOURCE_LINE}}', '');
  html = html.replaceAll('{{PAGE_INFO}}', '');
  html = html.replace(
    input.mode === 'comic' ? '<div class="card">' : '<div class="page">',
    input.mode === 'comic'
      ? `<div class="card" data-card-mode="${input.mode}" data-card-design="${escapeHtml(designName)}" data-composition-required="true">`
      : `<div class="page" data-card-mode="${input.mode}" data-card-design="${escapeHtml(designName)}" data-composition-required="true">`,
  );

  fs.writeFileSync(outputHtmlPath, html, 'utf8');
  return {
    htmlPath: outputHtmlPath,
    captureWidth: 1080,
    captureHeight: defaults.height,
    fullpage: true,
    allowedFilePaths: input.logo ? [path.resolve(input.logo)] : [],
  };
}

module.exports = { render };
