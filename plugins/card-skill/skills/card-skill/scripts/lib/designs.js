/**
 * Palette registry for card-skill CLI.
 *
 * Kenny Style is the only visual grammar. It owns typography, geometry,
 * spacing, radius, material, and composition. Tone and explicit legacy
 * design names are palette selectors only: they may change color tokens,
 * but never the non-color grammar.
 *
 * Each design provides CSS-variable-ready tokens:
 *   canvas   → --bg
 *   accent   → --accent
 *   ink      → --ink (renderer applies saturation reduction for print feel)
 *   inkMuted → --ink-muted
 *   surface1 → --surface-1
 *   surface2 → --surface-2
 *   hairline → --hairline
 *   surface  → 'light' | 'dark' (determines color-scheme toggle)
 */

const KENNY_STYLE = Object.freeze({
  radius: '6px',
});

const KENNY_TONE_PALETTES = Object.freeze({
  tone_reflective: Object.freeze({ surface:'light', canvas:'#f4f1eb', accent:'#746452', ink:'#2b2925', inkMuted:'#6a6258', surface1:'#fbf8f2', surface2:'#e8e1d6', hairline:'#d5cdc0' }),
  tone_sharp:      Object.freeze({ surface:'light', canvas:'#f1efe9', accent:'#87463f', ink:'#292724', inkMuted:'#655d57', surface1:'#faf8f3', surface2:'#e6dfd5', hairline:'#d2c9bd' }),
  tone_warm:       Object.freeze({ surface:'light', canvas:'#f7f1e6', accent:'#9a6846', ink:'#2d271f', inkMuted:'#6c5f51', surface1:'#fcf8f0', surface2:'#eadfce', hairline:'#d8cbb9' }),
  tone_technical:  Object.freeze({ surface:'light', canvas:'#f2f3ee', accent:'#365d71', ink:'#1f2a2f', inkMuted:'#5d6968', surface1:'#fafbf7', surface2:'#e3e7df', hairline:'#d0d7ce' }),
});

const TONE_PALETTE_NAMES = Object.freeze({
  reflective: 'tone_reflective',
  sharp: 'tone_sharp',
  warm: 'tone_warm',
  technical: 'tone_technical',
});

const DESIGNS = {
  // ── Dark Minimal ──
  linear:       { surface:'dark', canvas:'#151413', accent:'#7b84b8', ink:'#e8e2da', inkMuted:'#aaa297', surface1:'#1d1b18', surface2:'#26231f', hairline:'#353129' },
  vercel:       { surface:'dark', canvas:'#141413', accent:'#d8d2c8', ink:'#e8e2da', inkMuted:'#aaa297', surface1:'#1b1a17', surface2:'#24221e', hairline:'#343029' },

  // ── Dark Cinematic ──
  spotify:      { surface:'dark', canvas:'#171613', accent:'#4f7a5f', ink:'#e8e2da', inkMuted:'#a8a094', surface1:'#201e1a', surface2:'#2a2721', hairline:'#39342c' },

  // ── Light Minimal ──
  apple:        { surface:'light', canvas:'#f6f4ee', accent:'#356b96', ink:'#1f1d19', inkMuted:'#6f695f', surface1:'#fbfaf6', surface2:'#ece8dc', hairline:'#dfd9cc' },
  expo:         { surface:'light', canvas:'#f7f5ef', accent:'#30302e', ink:'#1f1d19', inkMuted:'#6d675d', surface1:'#fbfaf6', surface2:'#ece8dc', hairline:'#dfd9cc' },
  notion:       { surface:'light', canvas:'#f6f3ec', accent:'#6f6095', ink:'#211e19', inkMuted:'#71695e', surface1:'#fbfaf6', surface2:'#ebe5d8', hairline:'#ded6c8' },

  // ── Light Editorial ──
  claude:       { surface:'light', canvas:'#f5f0e8', accent:'#9b6048', ink:'#2c2418', inkMuted:'#6b6050', surface1:'#fbfaf6', surface2:'#e9e1d4', hairline:'#d8cdbc' },
  cursor:       { surface:'light', canvas:'#f6f3ec', accent:'#a55332', ink:'#26251e', inkMuted:'#6b655b', surface1:'#fbfaf6', surface2:'#ebe4d8', hairline:'#d8d1c4' },
  intercom:     { surface:'light', canvas:'#f5f1ec', accent:'#3a332d', ink:'#201c17', inkMuted:'#6b6055', surface1:'#fbfaf6', surface2:'#e8e0d4', hairline:'#d8cec0' },
  replicate:    { surface:'light', canvas:'#f7f4ed', accent:'#a04735', ink:'#24201b', inkMuted:'#6b5f55', surface1:'#fbfaf6', surface2:'#ebe3d6', hairline:'#d9d0c2' },
  posthog:      { surface:'light', canvas:'#f2f0e7', accent:'#9a6d28', ink:'#23251d', inkMuted:'#6b6555', surface1:'#fbfaf6', surface2:'#e7e2d2', hairline:'#d5cfbd' },
  clay:         { surface:'light', canvas:'#f8f3e7', accent:'#5a4f40', ink:'#211d18', inkMuted:'#6b6050', surface1:'#fbfaf6', surface2:'#ece2d1', hairline:'#d9cfbc' },

  // ── Technical Data (light) ──
  stripe:       { surface:'light', canvas:'#f6f4ee', accent:'#314d73', ink:'#172434', inkMuted:'#59645e', surface1:'#fbfaf6', surface2:'#e8e3d6', hairline:'#d8d1c2' },
  ibm:          { surface:'light', canvas:'#f5f3ed', accent:'#315f8f', ink:'#1f1d19', inkMuted:'#5f625c', surface1:'#fbfaf6', surface2:'#e7e2d6', hairline:'#d7d0c2' },
  opencode:     { surface:'light', canvas:'#f7f4ee', accent:'#34302c', ink:'#24201c', inkMuted:'#6b665e', surface1:'#fbfaf6', surface2:'#ebe5d9', hairline:'#d9d1c4' },

  // ── Technical Data (dark) ──
  sentry:       { surface:'dark', canvas:'#151413', accent:'#5d526d', ink:'#e8e2da', inkMuted:'#aaa297', surface1:'#1d1b18', surface2:'#26231f', hairline:'#353129' },
  raycast:      { surface:'dark', canvas:'#161514', accent:'#a15a52', ink:'#e8e2da', inkMuted:'#aaa297', surface1:'#1f1d19', surface2:'#292620', hairline:'#38332c' },
  together_ai:  { surface:'dark', canvas:'#151413', accent:'#3f638f', ink:'#e8e2da', inkMuted:'#aaa297', surface1:'#1d1b18', surface2:'#26231f', hairline:'#353129' },

  // ── Legacy ljg palette names ──
  ljg_chensi:   { surface:'light', canvas:'#f5f2ed', accent:'#7a5b43', ink:'#2d2926', inkMuted:'#6b6055', surface1:'#fbfaf6', surface2:'#e8e1d5', hairline:'#d8cdbc' },
  ljg_ruili:    { surface:'light', canvas:'#f0eeea', accent:'#9b4a3e', ink:'#2d2926', inkMuted:'#625b55', surface1:'#fbfaf6', surface2:'#e5dfd4', hairline:'#d5cdc1' },
  ljg_wennuan:  { surface:'light', canvas:'#f7f4ef', accent:'#9d6d4d', ink:'#2d2926', inkMuted:'#6b6050', surface1:'#fbfaf6', surface2:'#eae2d6', hairline:'#d8cdbc' },
  ljg_jishu:    { surface:'light', canvas:'#f1f3ef', accent:'#4f7b68', ink:'#2d2926', inkMuted:'#586158', surface1:'#fbfaf6', surface2:'#e4e6dc', hairline:'#d3d6ca' },
  ljg_keyan:    { surface:'light', canvas:'#f3f4ee', accent:'#9a7148', ink:'#2d2926', inkMuted:'#5e6258', surface1:'#fbfaf6', surface2:'#e5e6da', hairline:'#d4d6c9' },
  ljg_chuangyi: { surface:'light', canvas:'#f6f3ef', accent:'#8f5144', ink:'#2d2926', inkMuted:'#6b5850', surface1:'#fbfaf6', surface2:'#e8e0d8', hairline:'#d8ccc4' },
  ljg_shangye:  { surface:'light', canvas:'#f4f3ee', accent:'#4e6b58', ink:'#2d2926', inkMuted:'#5b5d55', surface1:'#fbfaf6', surface2:'#e5e3d8', hairline:'#d5d1c5' },
  ljg_moren:    { surface:'light', canvas:'#f3f1ec', accent:'#8b5b68', ink:'#2d2926', inkMuted:'#625d58', surface1:'#fbfaf6', surface2:'#e5e0d5', hairline:'#d5cec2' },
};

const DESIGN_ALIASES = {
  linear_app: 'linear',
  opencode_ai: 'opencode',
};

const EDITORIAL_TONES = new Set(Object.keys(TONE_PALETTE_NAMES));

const MODE_DEFAULT_TONES = Object.freeze({
  big: 'sharp',
  long: 'reflective',
  whiteboard: 'technical',
  poster: 'reflective',
  'article-diagram': 'technical',
  'editorial-image': 'reflective',
  infograph: 'technical',
  comic: 'sharp',
  sketchnote: 'reflective',
});

function normalizeDesignName(name) {
  if (typeof name !== 'string') return '';
  const key = name.trim().toLowerCase().replace(/[.\-]/g, '_');
  return DESIGN_ALIASES[key] || key;
}

function getDesign(name) {
  // Internal tone palettes are not valid public design names. Both paths are
  // normalized through the same immutable Kenny Style geometry.
  const key = normalizeDesignName(name);
  const palette = KENNY_TONE_PALETTES[key] || DESIGNS[key];
  return palette ? { ...palette, ...KENNY_STYLE } : null;
}

function isValidDesignName(name) {
  return Boolean(DESIGNS[normalizeDesignName(name)]);
}

function listDesigns() {
  return Object.keys(DESIGNS).map(k => {
    const d = DESIGNS[k];
    return { name: k, surface: d.surface, accent: d.accent, canvas: d.canvas };
  });
}

/**
 * Generate CSS variable overrides for a design system.
 * Returns a string like: --bg: #xxx; --accent: #xxx; ...
 */
function cssOverrides(designName) {
  const d = getDesign(designName);
  if (!d) return '';
  return [
    `--bg: ${d.canvas};`,
    `--surface-1: ${d.surface1};`,
    `--surface-2: ${d.surface2};`,
    `--accent: ${d.accent};`,
    `--ink: ${d.ink};`,
    `--ink-muted: ${d.inkMuted};`,
    `--hairline: ${d.hairline};`,
    `--radius: ${d.radius};`,
  ].join('\n    ');
}

function resolveEditorialDesignName(input = {}) {
  if (input.design) {
    const explicit = normalizeDesignName(input.design);
    return DESIGNS[explicit] ? explicit : null;
  }

  return TONE_PALETTE_NAMES[input.editorial_tone] || TONE_PALETTE_NAMES.reflective;
}

function resolveDefaultDesignName(input = {}, fallback = 'reflective') {
  if (input.design) {
    const explicit = normalizeDesignName(input.design);
    return DESIGNS[explicit] ? explicit : null;
  }
  const tone = EDITORIAL_TONES.has(input.tone) ? input.tone : fallback;
  return TONE_PALETTE_NAMES[tone] || TONE_PALETTE_NAMES.reflective;
}

function resolveDesignNameForInput(input = {}, fallback = null) {
  if (input.mode === 'editorial-image') return resolveEditorialDesignName(input);
  if (input.design) {
    const explicit = normalizeDesignName(input.design);
    return DESIGNS[explicit] ? explicit : null;
  }
  const fallbackTone = EDITORIAL_TONES.has(fallback) ? fallback : null;
  const tone = EDITORIAL_TONES.has(input.tone)
    ? input.tone
    : (fallbackTone || MODE_DEFAULT_TONES[input.mode] || 'reflective');
  return TONE_PALETTE_NAMES[tone];
}

module.exports = {
  DESIGNS,
  DESIGN_ALIASES,
  KENNY_STYLE,
  KENNY_TONE_PALETTES,
  TONE_PALETTE_NAMES,
  EDITORIAL_TONES,
  MODE_DEFAULT_TONES,
  normalizeDesignName,
  getDesign,
  isValidDesignName,
  listDesigns,
  cssOverrides,
  resolveEditorialDesignName,
  resolveDefaultDesignName,
  resolveDesignNameForInput,
};
