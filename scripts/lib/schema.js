/**
 * Schema validation for card-skill CLI.
 * Each schema defines required fields, optional fields, and type checks.
 */

const {
  EDITORIAL_TONES,
  getDesign,
  isValidDesignName,
  listDesigns,
  resolveDesignNameForInput,
} = require('./designs');

const SCHEMAS = {
  big: {
    required: ['mode', 'phrase'],
    optional: ['design', 'tone', 'accent_words', 'ghost_char', 'font_size', 'attribution', 'logo', 'brand_name'],
    types: {
      mode: 'string',
      phrase: 'string',
      design: 'string',
      tone: 'string',
      accent_words: 'array',
      ghost_char: 'string',
      font_size: 'number',
      attribution: 'string',
      logo: 'string',
      brand_name: 'string',
    },
  },
  long: {
    required: ['mode', 'title', 'body'],
    optional: ['design', 'tone', 'kicker', 'subtitle', 'theme', 'source', 'logo', 'brand_name'],
    types: {
      mode: 'string',
      title: 'string',
      body: 'array',
      design: 'string',
      tone: 'string',
      kicker: 'string',
      subtitle: 'string',
      theme: 'string',
      source: 'string',
      logo: 'string',
      brand_name: 'string',
    },
  },
  whiteboard: {
    required: ['mode', 'title', 'steps'],
    optional: ['design', 'tone', 'subtitle', 'accent_words', 'logo', 'brand_name'],
    types: {
      mode: 'string',
      title: 'string',
      steps: 'array',
      design: 'string',
      tone: 'string',
      subtitle: 'string',
      accent_words: 'array',
      logo: 'string',
      brand_name: 'string',
    },
  },
  poster: {
    required: ['mode', 'title', 'cards'],
    optional: ['variant', 'design', 'tone', 'subtitle', 'source', 'logo', 'brand_name'],
    types: {
      mode: 'string',
      title: 'string',
      cards: 'array',
      variant: 'string',
      design: 'string',
      tone: 'string',
      subtitle: 'string',
      source: 'string',
      logo: 'string',
      brand_name: 'string',
    },
  },
  'editorial-image': {
    required: ['mode', 'title'],
    optional: [
      'design',
      'editorial_tone',
      'use',
      'aspect',
      'kicker',
      'subtitle',
      'visual_metaphor',
      'cover_motif',
      'art_direction',
      'text_plan',
      'composition_required',
      'source',
      'custom_css',
      'content_html',
      'logo',
      'brand_name',
    ],
    types: {
      mode: 'string',
      title: 'string',
      design: 'string',
      editorial_tone: 'string',
      use: 'string',
      aspect: 'string',
      kicker: 'string',
      subtitle: 'string',
      visual_metaphor: 'string',
      cover_motif: 'string',
      art_direction: 'string',
      text_plan: 'string',
      composition_required: 'boolean',
      source: 'string',
      custom_css: 'string',
      content_html: 'string',
      logo: 'string',
      brand_name: 'string',
    },
  },
  'article-diagram': {
    required: ['mode', 'title'],
    optional: [
      'design',
      'tone',
      'aspect',
      'family',
      'subtitle',
      'formula',
      'sentence',
      'structure',
      'render_plan',
      'caption',
      'nodes',
      'links',
      'zones',
      'source',
      'logo',
      'brand_name',
    ],
    types: {
      mode: 'string',
      family: 'string',
      design: 'string',
      tone: 'string',
      aspect: 'string',
      title: 'string',
      subtitle: 'string',
      formula: 'string',
      sentence: 'string',
      structure: 'object',
      render_plan: 'string',
      caption: 'string',
      nodes: 'array',
      links: 'array',
      zones: 'array',
      source: 'string',
      logo: 'string',
      brand_name: 'string',
    },
  },
  infograph: {
    required: ['mode', 'title', 'composition_required', 'content_html', 'custom_css'],
    optional: ['design', 'tone', 'subtitle', 'source', 'logo', 'brand_name'],
    types: {
      mode: 'string',
      title: 'string',
      composition_required: 'boolean',
      content_html: 'string',
      custom_css: 'string',
      design: 'string',
      tone: 'string',
      subtitle: 'string',
      source: 'string',
      logo: 'string',
      brand_name: 'string',
    },
  },
  comic: {
    required: ['mode', 'title', 'composition_required', 'content_html', 'custom_css'],
    optional: ['design', 'tone', 'subtitle', 'source', 'logo', 'brand_name'],
    types: {
      mode: 'string',
      title: 'string',
      composition_required: 'boolean',
      content_html: 'string',
      custom_css: 'string',
      design: 'string',
      tone: 'string',
      subtitle: 'string',
      source: 'string',
      logo: 'string',
      brand_name: 'string',
    },
  },
  sketchnote: {
    required: ['mode', 'title', 'composition_required', 'content_html', 'custom_css'],
    optional: ['design', 'tone', 'subtitle', 'source', 'logo', 'brand_name'],
    types: {
      mode: 'string',
      title: 'string',
      composition_required: 'boolean',
      content_html: 'string',
      custom_css: 'string',
      design: 'string',
      tone: 'string',
      subtitle: 'string',
      source: 'string',
      logo: 'string',
      brand_name: 'string',
    },
  },
};

const LONG_BODY_TYPES = new Set(['paragraph', 'heading', 'highlight', 'blockquote', 'layer_card', 'section_break']);
const WHITEBOARD_STEP_TYPES = new Set(['chain', 'annotation', 'layers', 'insight']);
const POSTER_BODY_TYPES = new Set(['paragraph', 'heading', 'highlight', 'items', 'data_row', 'divider', 'reading_unit']);
const POSTER_VARIANTS = new Set(['reading-notes']);
const EDITORIAL_ASPECTS = new Set(['wechat-cover', 'blog-hero', 'body-3-2', 'body-4-3', 'cinematic', 'square']);
const EDITORIAL_USES = new Set(['cover', 'in-article', 'metaphor']);
const EDITORIAL_COVER_MOTIFS = new Set(['paper-stack', 'drawer', 'window', 'lens', 'path', 'archive', 'layers']);
const ARTICLE_DIAGRAM_FAMILIES = new Set(['concept-map', 'process-flow', 'boundary-model']);
const ARTICLE_DIAGRAM_ASPECTS = new Set(['body-2-1', 'body-3-2', 'body-4-3']);
const ARTICLE_DIAGRAM_RENDER_PLANS = new Set(['auto', 'summary', 'structure', 'split']);
const STUDIO_MODES = new Set(['infograph', 'comic', 'sketchnote']);
const DESIGN_NAMES = listDesigns().map(design => design.name);

function hasPosterContent(body) {
  const hasText = value => typeof value === 'string' && value.trim() !== '';
  return body.some((el) => {
    if (!el || typeof el !== 'object') return false;
    if (el.type === 'reading_unit') return hasText(el.quote);
    if (el.type === 'items') {
      return Array.isArray(el.entries) && el.entries.some(entry => hasText(entry?.label) && hasText(entry?.text));
    }
    if (el.type === 'data_row') return hasText(el.key) && hasText(el.value);
    if (['paragraph', 'heading', 'highlight'].includes(el.type)) {
      return hasText(el.text);
    }
    return false;
  });
}

function validate(input) {
  const errors = [];
  const mode = input.mode;

  if (!mode) {
    return { valid: false, errors: ['Missing required field: mode'] };
  }

  const schema = SCHEMAS[mode];
  if (!schema) {
    return { valid: false, errors: [`Unknown mode: "${mode}". Supported modes: big, long, whiteboard, poster, editorial-image, article-diagram, infograph, comic, sketchnote`] };
  }

  if (input.author !== undefined) {
    errors.push('Field "author" is not supported. Use "brand_name" for an opt-in signature or brand label.');
  }
  if (input.photo !== undefined) {
    errors.push('Field "photo" is not supported. Use "logo" for an opt-in avatar or brand image path.');
  }
  const allowedFields = new Set([...schema.required, ...schema.optional]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) errors.push(`Unknown field for ${mode}: "${field}"`);
  }

  // Check required fields
  for (const field of schema.required) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check types
  for (const [field, expected] of Object.entries(schema.types)) {
    if (input[field] === undefined) continue;
    const actual = Array.isArray(input[field]) ? 'array' : typeof input[field];
    if (actual !== expected) {
      errors.push(`Field "${field}" must be ${expected}, got ${actual}`);
    }
  }

  if (typeof input.design === 'string' && !isValidDesignName(input.design)) {
    errors.push(`design must be one of: ${DESIGN_NAMES.join(', ')}`);
  }
  if (input.tone !== undefined && !EDITORIAL_TONES.has(input.tone)) {
    errors.push(`tone must be one of: ${[...EDITORIAL_TONES].join(', ')}`);
  }

  if (STUDIO_MODES.has(mode)) {
    if (input.composition_required !== true) {
      errors.push(`${mode} requires composition_required=true`);
    }
    if (typeof input.content_html !== 'string' || input.content_html.trim() === '') {
      errors.push(`${mode} requires non-empty "content_html"`);
    }
    if (typeof input.custom_css !== 'string' || input.custom_css.trim() === '') {
      errors.push(`${mode} requires non-empty "custom_css"`);
    }
    if (typeof input.content_html === 'string'
        && /<(?:script|iframe|object|embed|link|base)\b|\son[a-z]+\s*=|javascript:/i.test(input.content_html)) {
      errors.push(`${mode} content_html cannot contain executable or embedded-resource markup`);
    }
    if (typeof input.custom_css === 'string'
        && /@import\b|url\s*\(\s*['"]?\s*file:/i.test(input.custom_css)) {
      errors.push(`${mode} custom_css cannot import stylesheets or reference file: URLs`);
    }
    const resolvedDesign = getDesign(resolveDesignNameForInput(input, 'claude'));
    if ((mode === 'infograph' || mode === 'sketchnote') && resolvedDesign?.surface === 'dark') {
      errors.push(`${mode} requires a light-surface design`);
    }
  }

  // Mode-specific body/step validation
  if (mode === 'long' && Array.isArray(input.body)) {
    input.body.forEach((el, i) => {
      if (!el.type) errors.push(`body[${i}]: missing "type"`);
      else if (!LONG_BODY_TYPES.has(el.type)) errors.push(`body[${i}]: unknown type "${el.type}". Allowed: ${[...LONG_BODY_TYPES].join(', ')}`);
      if (el.type === 'heading' && el.level !== undefined && ![2, 3].includes(el.level)) {
        errors.push(`body[${i}]: heading level must be 2 or 3, got ${el.level}`);
      }
    });
  }

  if (mode === 'whiteboard' && Array.isArray(input.steps)) {
    input.steps.forEach((step, i) => {
      if (!step.type) errors.push(`steps[${i}]: missing "type"`);
      else if (!WHITEBOARD_STEP_TYPES.has(step.type)) errors.push(`steps[${i}]: unknown type "${step.type}". Allowed: ${[...WHITEBOARD_STEP_TYPES].join(', ')}`);
      if (step.type === 'chain' && !Array.isArray(step.nodes)) errors.push(`steps[${i}]: chain requires "nodes" array`);
      if (step.type === 'layers' && !Array.isArray(step.items)) errors.push(`steps[${i}]: layers requires "items" array`);
    });
  }

  if (mode === 'poster' && Array.isArray(input.cards)) {
    if (input.variant && !POSTER_VARIANTS.has(input.variant)) {
      errors.push(`variant must be one of: ${[...POSTER_VARIANTS].join(', ')}`);
    }
    if (input.cards.length === 0) errors.push('cards[] must have at least 1 card');
    if (input.variant === 'reading-notes' && input.cards.length > 8) {
      errors.push('poster variant "reading-notes" supports at most 8 cards per batch');
    }
    input.cards.forEach((card, i) => {
      if (card.title !== undefined && (typeof card.title !== 'string' || card.title.trim() === '')) {
        errors.push(`cards[${i}].title must be a non-empty string when provided`);
      }
      if (card.title !== undefined && input.variant !== 'reading-notes') {
        errors.push(`cards[${i}].title is only supported by poster variant "reading-notes"`);
      }
      if (!Array.isArray(card.body)) errors.push(`cards[${i}]: missing "body" array`);
      else {
        if (!hasPosterContent(card.body)) {
          errors.push(`cards[${i}].body must contain actual visible content`);
        }
        card.body.forEach((el, j) => {
          if (!el.type) errors.push(`cards[${i}].body[${j}]: missing "type"`);
          else if (!POSTER_BODY_TYPES.has(el.type)) errors.push(`cards[${i}].body[${j}]: unknown type "${el.type}". Allowed: ${[...POSTER_BODY_TYPES].join(', ')}`);
          if (el.type === 'items' && Array.isArray(el.entries)) {
            el.entries.forEach((e, k) => {
              if (!e.label || !e.text) errors.push(`cards[${i}].body[${j}].entries[${k}]: items entries require "label" and "text"`);
            });
          }
          if (el.type === 'reading_unit') {
            if (input.variant !== 'reading-notes') {
              errors.push(`cards[${i}].body[${j}]: reading_unit requires poster variant "reading-notes"`);
            }
            if (typeof el.quote !== 'string' || el.quote.trim() === '') {
              errors.push(`cards[${i}].body[${j}].quote must be a non-empty string`);
            }
            if (el.thought !== undefined && typeof el.thought !== 'string') {
              errors.push(`cards[${i}].body[${j}].thought must be a string when provided`);
            }
          }
        });
      }
    });
  }

  if (mode === 'editorial-image') {
    if (input.editorial_tone && !EDITORIAL_TONES.has(input.editorial_tone)) {
      errors.push(`editorial_tone must be one of: ${[...EDITORIAL_TONES].join(', ')}`);
    }
    if (input.aspect && !EDITORIAL_ASPECTS.has(input.aspect)) {
      errors.push(`aspect must be one of: ${[...EDITORIAL_ASPECTS].join(', ')}`);
    }
    if (input.use && !EDITORIAL_USES.has(input.use)) {
      errors.push(`use must be one of: ${[...EDITORIAL_USES].join(', ')}`);
    }
    if (input.cover_motif && !EDITORIAL_COVER_MOTIFS.has(input.cover_motif)) {
      errors.push(`cover_motif must be one of: ${[...EDITORIAL_COVER_MOTIFS].join(', ')}`);
    }
    if (input.cover_motif && input.use && input.use !== 'cover') {
      errors.push('cover_motif is only supported when use is "cover" (or omitted, which defaults to cover behavior)');
    }

    const creativeUse = input.use === 'in-article' || input.use === 'metaphor';
    if (creativeUse && input.composition_required !== true) {
      errors.push(`editorial-image use=${input.use} requires composition_required=true with non-empty "content_html" and "custom_css"`);
    }
    if (input.composition_required === true || creativeUse) {
      if (typeof input.content_html !== 'string' || input.content_html.trim() === '') {
        errors.push('composition_required=true requires non-empty "content_html"');
      }
      if (typeof input.custom_css !== 'string' || input.custom_css.trim() === '') {
        errors.push('composition_required=true requires non-empty "custom_css"');
      }
    }
  }

  if (mode === 'article-diagram') {
    const usesLegacyFamily = Boolean(input.family);
    const compressionFields = ['formula', 'sentence', 'structure', 'render_plan']
      .filter(field => Object.prototype.hasOwnProperty.call(input, field));

    if (input.family && !ARTICLE_DIAGRAM_FAMILIES.has(input.family)) {
      errors.push(`family must be one of: ${[...ARTICLE_DIAGRAM_FAMILIES].join(', ')}`);
    }
    if (input.aspect && !ARTICLE_DIAGRAM_ASPECTS.has(input.aspect)) {
      errors.push(`aspect must be one of: ${[...ARTICLE_DIAGRAM_ASPECTS].join(', ')}`);
    }
    if (input.render_plan && !ARTICLE_DIAGRAM_RENDER_PLANS.has(input.render_plan)) {
      errors.push(`render_plan must be one of: ${[...ARTICLE_DIAGRAM_RENDER_PLANS].join(', ')}`);
    }

    if (usesLegacyFamily && compressionFields.length > 0) {
      errors.push(`legacy article-diagram family input cannot include compression fields: ${compressionFields.join(', ')}`);
    }

    if (!usesLegacyFamily) {
      if (!input.formula || typeof input.formula !== 'string') {
        errors.push('article-diagram compression pack requires string "formula"');
      }
      if (!input.sentence || typeof input.sentence !== 'string') {
        errors.push('article-diagram compression pack requires string "sentence"');
      }
      if (!input.structure || typeof input.structure !== 'object' || Array.isArray(input.structure)) {
        errors.push('article-diagram compression pack requires object "structure"');
      } else {
        const structureNodes = input.structure.nodes;
        const structureRelations = input.structure.relations;
        if (!Array.isArray(structureNodes) || structureNodes.length < 2) {
          errors.push('structure.nodes[] must have at least 2 nodes');
        } else {
          if (structureNodes.length > 6) errors.push('structure.nodes[] supports at most 6 nodes');
          const structureNodeIds = new Set();
          structureNodes.forEach((node, i) => {
            if (!node || typeof node !== 'object' || Array.isArray(node)) {
              errors.push(`structure.nodes[${i}] must be an object`);
              return;
            }
            if (!node.id || typeof node.id !== 'string') errors.push(`structure.nodes[${i}]: missing string "id"`);
            if (!node.label || typeof node.label !== 'string') errors.push(`structure.nodes[${i}]: missing string "label"`);
            if (node.note !== undefined && typeof node.note !== 'string') errors.push(`structure.nodes[${i}].note must be string`);
            if (node.id) {
              if (structureNodeIds.has(node.id)) errors.push(`structure.nodes[${i}]: duplicate id "${node.id}"`);
              structureNodeIds.add(node.id);
            }
            if (typeof node.label === 'string' && node.label.length > 36) {
              errors.push(`structure.nodes[${i}].label must be 36 characters or fewer`);
            }
          });

          if (structureRelations !== undefined) {
            if (!Array.isArray(structureRelations)) {
              errors.push('structure.relations must be an array');
            } else {
              if (structureRelations.length > 6) errors.push('structure.relations[] supports at most 6 relations');
              structureRelations.forEach((relation, i) => {
                if (!relation || typeof relation !== 'object' || Array.isArray(relation)) {
                  errors.push(`structure.relations[${i}] must be an object`);
                  return;
                }
                if (!relation.from || typeof relation.from !== 'string') errors.push(`structure.relations[${i}]: missing string "from"`);
                if (!relation.to || typeof relation.to !== 'string') errors.push(`structure.relations[${i}]: missing string "to"`);
                if (relation.from && !structureNodeIds.has(relation.from)) errors.push(`structure.relations[${i}].from references unknown node "${relation.from}"`);
                if (relation.to && !structureNodeIds.has(relation.to)) errors.push(`structure.relations[${i}].to references unknown node "${relation.to}"`);
                if (relation.label !== undefined && typeof relation.label !== 'string') errors.push(`structure.relations[${i}].label must be string`);
                if (typeof relation.label === 'string' && relation.label.length > 24) errors.push(`structure.relations[${i}].label must be 24 characters or fewer`);
              });
            }
          }
        }
      }

      if (input.nodes !== undefined || input.links !== undefined || input.zones !== undefined) {
        errors.push('compression article-diagram uses structure.nodes/structure.relations; legacy nodes/links/zones require family');
      }

      return { valid: errors.length === 0, errors };
    }

    const nodeIds = new Set();
    if (Array.isArray(input.nodes)) {
      const maxNodes = input.family === 'concept-map' ? 5 : 6;
      if (input.nodes.length < 2) errors.push('nodes[] must have at least 2 nodes');
      if (input.nodes.length > maxNodes) errors.push(`${input.family || 'article-diagram'} supports at most ${maxNodes} nodes`);

      input.nodes.forEach((node, i) => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) {
          errors.push(`nodes[${i}] must be an object`);
          return;
        }
        if (!node.id || typeof node.id !== 'string') errors.push(`nodes[${i}]: missing string "id"`);
        if (!node.label || typeof node.label !== 'string') errors.push(`nodes[${i}]: missing string "label"`);
        if (node.note !== undefined && typeof node.note !== 'string') errors.push(`nodes[${i}].note must be string`);
        if (node.zone !== undefined && typeof node.zone !== 'string') errors.push(`nodes[${i}].zone must be string`);
        if (node.id) {
          if (nodeIds.has(node.id)) errors.push(`nodes[${i}]: duplicate id "${node.id}"`);
          nodeIds.add(node.id);
        }
        if (typeof node.label === 'string' && node.label.length > 36) {
          errors.push(`nodes[${i}].label must be 36 characters or fewer`);
        }
      });
    }

    if (Array.isArray(input.links)) {
      if (input.links.length > 6) errors.push('links[] supports at most 6 links');
      input.links.forEach((link, i) => {
        if (!link || typeof link !== 'object' || Array.isArray(link)) {
          errors.push(`links[${i}] must be an object`);
          return;
        }
        if (!link.from || typeof link.from !== 'string') errors.push(`links[${i}]: missing string "from"`);
        if (!link.to || typeof link.to !== 'string') errors.push(`links[${i}]: missing string "to"`);
        if (link.from && !nodeIds.has(link.from)) errors.push(`links[${i}].from references unknown node "${link.from}"`);
        if (link.to && !nodeIds.has(link.to)) errors.push(`links[${i}].to references unknown node "${link.to}"`);
        if (link.label !== undefined && typeof link.label !== 'string') errors.push(`links[${i}].label must be string`);
        if (typeof link.label === 'string' && link.label.length > 24) errors.push(`links[${i}].label must be 24 characters or fewer`);
        if (link.direction !== undefined && !['one-way', 'two-way', 'none'].includes(link.direction)) {
          errors.push(`links[${i}].direction must be one of: one-way, two-way, none`);
        }
      });
    }

    if (input.family === 'boundary-model') {
      if (!Array.isArray(input.zones) || input.zones.length < 2) {
        errors.push('boundary-model requires zones[] with at least 2 zones');
      } else {
        if (input.zones.length > 4) errors.push('boundary-model supports at most 4 zones');
        const zoneIds = new Set();
        input.zones.forEach((zone, i) => {
          if (!zone || typeof zone !== 'object' || Array.isArray(zone)) {
            errors.push(`zones[${i}] must be an object`);
            return;
          }
          if (!zone.id || typeof zone.id !== 'string') errors.push(`zones[${i}]: missing string "id"`);
          if (!zone.label || typeof zone.label !== 'string') errors.push(`zones[${i}]: missing string "label"`);
          if (zone.description !== undefined && typeof zone.description !== 'string') errors.push(`zones[${i}].description must be string`);
          if (zone.id) {
            if (zoneIds.has(zone.id)) errors.push(`zones[${i}]: duplicate id "${zone.id}"`);
            zoneIds.add(zone.id);
          }
          if (typeof zone.label === 'string' && zone.label.length > 32) {
            errors.push(`zones[${i}].label must be 32 characters or fewer`);
          }
        });
        if (Array.isArray(input.nodes)) {
          input.nodes.forEach((node, i) => {
            if (!node || typeof node !== 'object') return;
            if (!node.zone) errors.push(`nodes[${i}]: boundary-model nodes require "zone"`);
            else if (!zoneIds.has(node.zone)) errors.push(`nodes[${i}].zone references unknown zone "${node.zone}"`);
          });
        }
      }
    }

    if (input.family !== 'boundary-model' && input.zones !== undefined) {
      errors.push('zones[] is only supported for boundary-model');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validate,
  SCHEMAS,
  LONG_BODY_TYPES,
  WHITEBOARD_STEP_TYPES,
  POSTER_BODY_TYPES,
  POSTER_VARIANTS,
  EDITORIAL_ASPECTS,
  EDITORIAL_USES,
  EDITORIAL_COVER_MOTIFS,
  EDITORIAL_TONES,
  ARTICLE_DIAGRAM_FAMILIES,
  ARTICLE_DIAGRAM_ASPECTS,
  ARTICLE_DIAGRAM_RENDER_PLANS,
};
