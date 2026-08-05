const CONTENT_TYPES = new Set(['idea', 'argument', 'mechanism', 'comparison', 'story', 'timeline', 'data', 'system']);
const ARGUMENT_STRUCTURES = new Set([
  'single-claim',
  'linear-argument',
  'cause-effect',
  'compare-contrast',
  'sequence',
  'hierarchy',
  'network',
  'conflict-turn',
  'reflective-arc',
]);

const TARGET_MODES = new Map([
  ['wechat-cover', 'editorial-image'],
  ['blog-hero', 'editorial-image'],
  ['social-series', 'poster'],
  ['reading-notes', 'poster'],
  ['long-read', 'long'],
  ['whiteboard', 'whiteboard'],
]);

function selectMode(publishTarget, plan) {
  if (TARGET_MODES.has(publishTarget)) return TARGET_MODES.get(publishTarget);

  const { content_type: contentType, argument_structure: structure } = plan || {};
  if (structure === 'reflective-arc') return 'sketchnote';
  if (structure === 'conflict-turn' || contentType === 'story') return 'comic';
  if (publishTarget === 'article-body' && contentType === 'idea' && plan?.visual_metaphor) return 'editorial-image';
  if (['comparison', 'data', 'timeline'].includes(contentType) || structure === 'compare-contrast') return 'infograph';
  if (['mechanism', 'system'].includes(contentType) || ['cause-effect', 'sequence', 'hierarchy', 'network'].includes(structure)) return 'article-diagram';
  if (publishTarget === 'article-body') return 'article-diagram';

  return 'big';
}

function modeTier(mode, contract = {}) {
  if (['infograph', 'comic', 'sketchnote'].includes(mode)) return 'studio';
  if (mode === 'editorial-image' && contract.composition_required === true) return 'studio';
  return 'stable';
}

module.exports = { ARGUMENT_STRUCTURES, CONTENT_TYPES, TARGET_MODES, modeTier, selectMode };
