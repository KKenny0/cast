/**
 * Design token registry for card-skill CLI.
 * Extracted from references/design-index.md.
 * The catalog is intentionally converged into one quiet-paper system:
 * brand names are inflections, not separate visual worlds.
 *
 * Each design provides CSS-variable-ready tokens:
 *   canvas   → --bg
 *   accent   → --accent
 *   ink      → --ink (renderer applies saturation reduction for print feel)
 *   inkMuted → --ink-muted
 *   surface1 → --surface-1
 *   surface2 → --surface-2
 *   hairline → --hairline
 *   surface  → 'light' | 'dark' (determines theme toggle)
 *   radius   → --radius (border-radius token, e.g. '6px', '12px')
 */

const DESIGNS = {
  // ── Dark Minimal ──
  linear:       { surface:'dark', canvas:'#151413', accent:'#7b84b8', ink:'#e8e2da', inkMuted:'#aaa297', surface1:'#1d1b18', surface2:'#26231f', hairline:'#353129', radius:'8px' },
  vercel:       { surface:'dark', canvas:'#141413', accent:'#d8d2c8', ink:'#e8e2da', inkMuted:'#aaa297', surface1:'#1b1a17', surface2:'#24221e', hairline:'#343029', radius:'6px' },

  // ── Dark Cinematic ──
  spotify:      { surface:'dark', canvas:'#171613', accent:'#4f7a5f', ink:'#e8e2da', inkMuted:'#a8a094', surface1:'#201e1a', surface2:'#2a2721', hairline:'#39342c', radius:'8px' },

  // ── Light Minimal ──
  apple:        { surface:'light', canvas:'#f6f4ee', accent:'#356b96', ink:'#1f1d19', inkMuted:'#6f695f', surface1:'#fbfaf6', surface2:'#ece8dc', hairline:'#dfd9cc', radius:'8px' },
  expo:         { surface:'light', canvas:'#f7f5ef', accent:'#30302e', ink:'#1f1d19', inkMuted:'#6d675d', surface1:'#fbfaf6', surface2:'#ece8dc', hairline:'#dfd9cc', radius:'6px' },
  notion:       { surface:'light', canvas:'#f6f3ec', accent:'#6f6095', ink:'#211e19', inkMuted:'#71695e', surface1:'#fbfaf6', surface2:'#ebe5d8', hairline:'#ded6c8', radius:'6px' },

  // ── Light Editorial ──
  claude:       { surface:'light', canvas:'#f5f0e8', accent:'#9b6048', ink:'#2c2418', inkMuted:'#6b6050', surface1:'#fbfaf6', surface2:'#e9e1d4', hairline:'#d8cdbc', radius:'8px' },
  cursor:       { surface:'light', canvas:'#f6f3ec', accent:'#a55332', ink:'#26251e', inkMuted:'#6b655b', surface1:'#fbfaf6', surface2:'#ebe4d8', hairline:'#d8d1c4', radius:'8px' },
  intercom:     { surface:'light', canvas:'#f5f1ec', accent:'#3a332d', ink:'#201c17', inkMuted:'#6b6055', surface1:'#fbfaf6', surface2:'#e8e0d4', hairline:'#d8cec0', radius:'8px' },
  replicate:    { surface:'light', canvas:'#f7f4ed', accent:'#a04735', ink:'#24201b', inkMuted:'#6b5f55', surface1:'#fbfaf6', surface2:'#ebe3d6', hairline:'#d9d0c2', radius:'8px' },
  posthog:      { surface:'light', canvas:'#f2f0e7', accent:'#9a6d28', ink:'#23251d', inkMuted:'#6b6555', surface1:'#fbfaf6', surface2:'#e7e2d2', hairline:'#d5cfbd', radius:'8px' },
  clay:         { surface:'light', canvas:'#f8f3e7', accent:'#5a4f40', ink:'#211d18', inkMuted:'#6b6050', surface1:'#fbfaf6', surface2:'#ece2d1', hairline:'#d9cfbc', radius:'8px' },

  // ── Technical Data (light) ──
  stripe:       { surface:'light', canvas:'#f6f4ee', accent:'#314d73', ink:'#172434', inkMuted:'#59645e', surface1:'#fbfaf6', surface2:'#e8e3d6', hairline:'#d8d1c2', radius:'6px' },
  ibm:          { surface:'light', canvas:'#f5f3ed', accent:'#315f8f', ink:'#1f1d19', inkMuted:'#5f625c', surface1:'#fbfaf6', surface2:'#e7e2d6', hairline:'#d7d0c2', radius:'4px' },
  opencode:     { surface:'light', canvas:'#f7f4ee', accent:'#34302c', ink:'#24201c', inkMuted:'#6b665e', surface1:'#fbfaf6', surface2:'#ebe5d9', hairline:'#d9d1c4', radius:'6px' },

  // ── Technical Data (dark) ──
  sentry:       { surface:'dark', canvas:'#151413', accent:'#5d526d', ink:'#e8e2da', inkMuted:'#aaa297', surface1:'#1d1b18', surface2:'#26231f', hairline:'#353129', radius:'8px' },
  raycast:      { surface:'dark', canvas:'#161514', accent:'#a15a52', ink:'#e8e2da', inkMuted:'#aaa297', surface1:'#1f1d19', surface2:'#292620', hairline:'#38332c', radius:'8px' },
  together_ai:  { surface:'dark', canvas:'#151413', accent:'#3f638f', ink:'#e8e2da', inkMuted:'#aaa297', surface1:'#1d1b18', surface2:'#26231f', hairline:'#353129', radius:'8px' },

  // ── ljg-card tones ──
  ljg_chensi:   { surface:'light', canvas:'#f5f2ed', accent:'#7a5b43', ink:'#2d2926', inkMuted:'#6b6055', surface1:'#fbfaf6', surface2:'#e8e1d5', hairline:'#d8cdbc', radius:'6px' },
  ljg_ruili:    { surface:'light', canvas:'#f0eeea', accent:'#9b4a3e', ink:'#2d2926', inkMuted:'#625b55', surface1:'#fbfaf6', surface2:'#e5dfd4', hairline:'#d5cdc1', radius:'6px' },
  ljg_wennuan:  { surface:'light', canvas:'#f7f4ef', accent:'#9d6d4d', ink:'#2d2926', inkMuted:'#6b6050', surface1:'#fbfaf6', surface2:'#eae2d6', hairline:'#d8cdbc', radius:'8px' },
  ljg_jishu:    { surface:'light', canvas:'#f1f3ef', accent:'#4f7b68', ink:'#2d2926', inkMuted:'#586158', surface1:'#fbfaf6', surface2:'#e4e6dc', hairline:'#d3d6ca', radius:'6px' },
  ljg_keyan:    { surface:'light', canvas:'#f3f4ee', accent:'#9a7148', ink:'#2d2926', inkMuted:'#5e6258', surface1:'#fbfaf6', surface2:'#e5e6da', hairline:'#d4d6c9', radius:'6px' },
  ljg_chuangyi: { surface:'light', canvas:'#f6f3ef', accent:'#8f5144', ink:'#2d2926', inkMuted:'#6b5850', surface1:'#fbfaf6', surface2:'#e8e0d8', hairline:'#d8ccc4', radius:'8px' },
  ljg_shangye:  { surface:'light', canvas:'#f4f3ee', accent:'#4e6b58', ink:'#2d2926', inkMuted:'#5b5d55', surface1:'#fbfaf6', surface2:'#e5e3d8', hairline:'#d5d1c5', radius:'4px' },
  ljg_moren:    { surface:'light', canvas:'#f3f1ec', accent:'#8b5b68', ink:'#2d2926', inkMuted:'#625d58', surface1:'#fbfaf6', surface2:'#e5e0d5', hairline:'#d5cec2', radius:'6px' },
};

const DESIGN_ALIASES = {
  linear_app: 'linear',
  opencode_ai: 'opencode',
};

const EDITORIAL_TONE_DESIGNS = {
  reflective: ['claude', 'notion', 'apple', 'ljg_chensi'],
  sharp: ['linear', 'raycast', 'stripe', 'ljg_ruili'],
  warm: ['claude', 'clay', 'intercom', 'posthog', 'ljg_wennuan'],
  technical: ['stripe', 'ibm', 'opencode', 'sentry', 'together_ai', 'ljg_jishu'],
};

const EDITORIAL_TONES = new Set(Object.keys(EDITORIAL_TONE_DESIGNS));
const TONE_DEFAULT_DESIGNS = {
  reflective: 'claude',
  sharp: 'linear',
  warm: 'clay',
  technical: 'stripe',
};

const MODE_TONE_DEFAULT_DESIGNS = {
  big: TONE_DEFAULT_DESIGNS,
  long: TONE_DEFAULT_DESIGNS,
  whiteboard: {
    reflective: 'notion',
    sharp: 'ljg_ruili',
    warm: 'clay',
    technical: 'stripe',
  },
  poster: {
    reflective: 'claude',
    sharp: 'ljg_ruili',
    warm: 'clay',
    technical: 'stripe',
  },
  'article-diagram': {
    reflective: 'notion',
    sharp: 'ljg_ruili',
    warm: 'clay',
    technical: 'stripe',
  },
  infograph: {
    reflective: 'notion',
    sharp: 'ljg_ruili',
    warm: 'clay',
    technical: 'stripe',
  },
  comic: TONE_DEFAULT_DESIGNS,
  sketchnote: {
    reflective: 'notion',
    sharp: 'ljg_ruili',
    warm: 'clay',
    technical: 'stripe',
  },
};

const MODE_DEFAULT_DESIGNS = {
  big: 'vercel',
  long: 'claude',
  whiteboard: 'stripe',
  poster: 'stripe',
  'article-diagram': 'stripe',
  infograph: 'notion',
  comic: 'claude',
  sketchnote: 'notion',
};

function normalizeDesignName(name) {
  if (typeof name !== 'string') return '';
  const key = name.trim().toLowerCase().replace(/[.\-]/g, '_');
  return DESIGN_ALIASES[key] || key;
}

function getDesign(name) {
  // Accept underscore, hyphen, and dot forms (e.g. "together.ai" -> "together_ai")
  const key = normalizeDesignName(name);
  return DESIGNS[key] || null;
}

function isValidDesignName(name) {
  return Boolean(getDesign(name));
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

function stableIndex(seed, length) {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % length;
}

function resolveEditorialDesignName(input = {}) {
  if (input.design) {
    const explicit = normalizeDesignName(input.design);
    return DESIGNS[explicit] ? explicit : null;
  }

  const tone = input.editorial_tone;
  const pool = EDITORIAL_TONE_DESIGNS[tone];
  if (!pool) return 'claude';

  const seed = [
    input.title,
    input.subtitle,
    input.visual_metaphor,
    input.art_direction,
    tone,
  ].filter(Boolean).join('|') || tone;

  return pool[stableIndex(seed, pool.length)];
}

function resolveDefaultDesignName(input = {}, fallback = 'claude') {
  if (input.design) {
    const explicit = normalizeDesignName(input.design);
    return DESIGNS[explicit] ? explicit : null;
  }
  return input.tone && TONE_DEFAULT_DESIGNS[input.tone] ? TONE_DEFAULT_DESIGNS[input.tone] : fallback;
}

function resolveDesignNameForInput(input = {}, fallback = null) {
  if (input.mode === 'editorial-image') return resolveEditorialDesignName(input);
  if (input.design) {
    const explicit = normalizeDesignName(input.design);
    return DESIGNS[explicit] ? explicit : null;
  }
  const modeTones = MODE_TONE_DEFAULT_DESIGNS[input.mode] || TONE_DEFAULT_DESIGNS;
  return input.tone && modeTones[input.tone]
    ? modeTones[input.tone]
    : (fallback || MODE_DEFAULT_DESIGNS[input.mode] || 'claude');
}

module.exports = {
  DESIGNS,
  DESIGN_ALIASES,
  EDITORIAL_TONE_DESIGNS,
  EDITORIAL_TONES,
  TONE_DEFAULT_DESIGNS,
  MODE_TONE_DEFAULT_DESIGNS,
  MODE_DEFAULT_DESIGNS,
  normalizeDesignName,
  getDesign,
  isValidDesignName,
  listDesigns,
  cssOverrides,
  resolveEditorialDesignName,
  resolveDefaultDesignName,
  resolveDesignNameForInput,
};
