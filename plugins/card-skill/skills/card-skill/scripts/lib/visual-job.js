const crypto = require('crypto');
const { validate } = require('./schema');
const { EDITORIAL_TONES } = require('./designs');

const PUBLISH_TARGETS = new Set(['wechat-cover', 'blog-hero', 'article-body', 'social-single', 'social-series', 'reading-notes', 'long-read', 'whiteboard']);
const SOURCE_KINDS = new Set(['pasted-text', 'url', 'file', 'normalized-adapter']);
const LANGUAGES = new Set(['zh', 'en', 'mixed']);
const TRANSFORMATIONS = new Set(['preserve', 'compress', 'rewrite', 'visualize']);
const STABLE_MODES = new Set(['big', 'long', 'whiteboard', 'poster', 'editorial-image', 'article-diagram']);
const STUDIO_MODES = new Set(['infograph', 'comic', 'sketchnote']);
const DECISION_MODES = new Set([...STABLE_MODES, ...STUDIO_MODES, 'mixed']);
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_BASENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SENSITIVE_KEY = /(?:api[_-]?key|authorization|cookie|token|secret|password|account[_-]?id|provider[_-]?id)/i;
const TOP_LEVEL_FIELDS = new Set(['schema_version', 'job_id', 'publish_target', 'source', 'source_units', 'decision', 'outputs']);
const SOURCE_FIELDS = new Set(['kind', 'label', 'language', 'digest']);
const SOURCE_UNIT_FIELDS = new Set(['id', 'label', 'digest', 'excerpt']);
const DECISION_FIELDS = new Set(['mode', 'tier', 'reason', 'tone', 'selection_summary', 'visual_risks']);
const OUTPUT_FIELDS = new Set(['id', 'basename', 'source_unit_ids', 'transformation', 'section', 'render_contract']);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(value) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new TypeError('sha256Bytes requires Buffer or Uint8Array');
  }
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function rejectUnknownFields(value, allowed, path, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`Unknown ${path} field: ${key}`);
  }
}

function studioContract(contract) {
  return STUDIO_MODES.has(contract?.mode)
    || (contract?.mode === 'editorial-image' && contract?.composition_required === true);
}

function materializeRenderContract(job, output) {
  const contract = JSON.parse(JSON.stringify(output.render_contract || {}));
  const decisionTone = job.decision?.tone;
  if (!decisionTone || contract.design) return contract;
  if (contract.mode === 'editorial-image') {
    if (contract.editorial_tone === undefined) contract.editorial_tone = decisionTone;
  } else if (contract.tone === undefined) {
    contract.tone = decisionTone;
  }
  return contract;
}

function noSensitiveKeys(value, path = 'job', errors = []) {
  if (!value || typeof value !== 'object') return errors;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SENSITIVE_KEY.test(key)) errors.push(`${childPath} must not contain sensitive/provider identity fields`);
    noSensitiveKeys(child, childPath, errors);
  }
  return errors;
}

function validateVisualJob(job) {
  const errors = [];
  if (!job || typeof job !== 'object' || Array.isArray(job)) return { valid: false, errors: ['Visual Job must be an object'] };
  rejectUnknownFields(job, TOP_LEVEL_FIELDS, 'Visual Job', errors);
  if (job.schema_version !== 1) errors.push('schema_version must be 1');
  if (typeof job.job_id !== 'string' || !SAFE_ID.test(job.job_id)) errors.push('job_id must be a safe lowercase slug');
  if (!PUBLISH_TARGETS.has(job.publish_target)) errors.push(`publish_target must be one of: ${[...PUBLISH_TARGETS].join(', ')}`);

  const source = job.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) errors.push('source must be an object');
  else {
    rejectUnknownFields(source, SOURCE_FIELDS, 'source', errors);
    if (!SOURCE_KINDS.has(source.kind)) errors.push(`source.kind must be one of: ${[...SOURCE_KINDS].join(', ')}`);
    if (!LANGUAGES.has(source.language)) errors.push(`source.language must be one of: ${[...LANGUAGES].join(', ')}`);
    if (source.label !== undefined && (typeof source.label !== 'string' || source.label.length > 160)) errors.push('source.label must be a string of at most 160 characters');
    if (source.digest !== undefined && (typeof source.digest !== 'string' || !SHA256.test(source.digest))) errors.push('source.digest must be a SHA-256 hex digest');
  }

  if (!Array.isArray(job.source_units) || job.source_units.length < 1 || job.source_units.length > 100) errors.push('source_units must contain 1 to 100 entries');
  const unitIds = new Set();
  for (const [index, unit] of (job.source_units || []).entries()) {
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) { errors.push(`source_units[${index}] must be an object`); continue; }
    rejectUnknownFields(unit, SOURCE_UNIT_FIELDS, `source_units[${index}]`, errors);
    if (typeof unit.id !== 'string' || !SAFE_ID.test(unit.id)) errors.push(`source_units[${index}].id must be a safe lowercase slug`);
    if (unitIds.has(unit.id)) errors.push(`source_units[${index}].id duplicates "${unit.id}"`);
    unitIds.add(unit.id);
    if (unit.label !== undefined && (typeof unit.label !== 'string' || unit.label.length > 160)) errors.push(`source_units[${index}].label must be a string of at most 160 characters`);
    if (unit.excerpt !== undefined && (typeof unit.excerpt !== 'string' || unit.excerpt.length > 500)) errors.push(`source_units[${index}].excerpt must be a string of at most 500 characters`);
    if (unit.digest !== undefined && (typeof unit.digest !== 'string' || !SHA256.test(unit.digest))) errors.push(`source_units[${index}].digest must be a SHA-256 hex digest`);
  }

  const decision = job.decision;
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) errors.push('decision must be an object');
  else {
    rejectUnknownFields(decision, DECISION_FIELDS, 'decision', errors);
    if (!DECISION_MODES.has(decision.mode)) errors.push(`decision.mode must be one of: ${[...DECISION_MODES].join(', ')}`);
    if (!['stable', 'studio'].includes(decision.tier)) errors.push('decision.tier must be stable or studio');
    if (typeof decision.reason !== 'string' || !decision.reason.trim() || decision.reason.length > 500) errors.push('decision.reason must be a non-empty string of at most 500 characters');
    if (decision.tone !== undefined && !EDITORIAL_TONES.has(decision.tone)) errors.push(`decision.tone must be one of: ${[...EDITORIAL_TONES].join(', ')}`);
    if (decision.selection_summary !== undefined && (typeof decision.selection_summary !== 'string' || decision.selection_summary.length > 500)) {
      errors.push('decision.selection_summary must be a string of at most 500 characters');
    }
    if (decision.visual_risks !== undefined) {
      if (!Array.isArray(decision.visual_risks) || decision.visual_risks.length > 10) {
        errors.push('decision.visual_risks must be an array of at most 10 strings');
      } else {
        decision.visual_risks.forEach((risk, index) => {
          if (typeof risk !== 'string' || risk.length > 200) errors.push(`decision.visual_risks[${index}] must be a string of at most 200 characters`);
        });
      }
    }
  }

  if (!Array.isArray(job.outputs) || job.outputs.length < 1 || job.outputs.length > 20) errors.push('outputs must contain 1 to 20 entries');
  const outputIds = new Set(); const basenames = new Set();
  for (const [index, output] of (job.outputs || []).entries()) {
    if (!output || typeof output !== 'object' || Array.isArray(output)) { errors.push(`outputs[${index}] must be an object`); continue; }
    rejectUnknownFields(output, OUTPUT_FIELDS, `outputs[${index}]`, errors);
    if (typeof output.id !== 'string' || !SAFE_ID.test(output.id)) errors.push(`outputs[${index}].id must be a safe lowercase slug`);
    if (outputIds.has(output.id)) errors.push(`outputs[${index}].id duplicates "${output.id}"`);
    outputIds.add(output.id);
    if (typeof output.basename !== 'string' || !SAFE_BASENAME.test(output.basename) || output.basename.includes('..') || output.basename.startsWith('.')) errors.push(`outputs[${index}].basename must be a unique safe .png filename`);
    const basenameKey = typeof output.basename === 'string' ? output.basename.toLocaleLowerCase('en-US') : output.basename;
    if (basenames.has(basenameKey)) errors.push(`outputs[${index}].basename duplicates "${output.basename}" on a case-insensitive filesystem`);
    basenames.add(basenameKey);
    if (!Array.isArray(output.source_unit_ids) || output.source_unit_ids.length < 1) errors.push(`outputs[${index}].source_unit_ids must be a non-empty array`);
    else for (const id of output.source_unit_ids) {
      if (typeof id !== 'string') errors.push(`outputs[${index}].source_unit_ids must contain strings`);
      else if (!unitIds.has(id)) errors.push(`outputs[${index}].source_unit_ids references unknown unit "${id}"`);
    }
    if (!TRANSFORMATIONS.has(output.transformation)) errors.push(`outputs[${index}].transformation must be one of: ${[...TRANSFORMATIONS].join(', ')}`);
    if (output.section !== undefined && (typeof output.section !== 'string' || output.section.length > 160)) {
      errors.push(`outputs[${index}].section must be a string of at most 160 characters`);
    }
    if (!output.render_contract || typeof output.render_contract !== 'object' || Array.isArray(output.render_contract)) {
      errors.push(`outputs[${index}].render_contract must be an object`);
      continue;
    }
    const contract = materializeRenderContract(job, output);
    const contractTone = contract.mode === 'editorial-image' ? contract.editorial_tone : contract.tone;
    if (decision?.tone && contractTone && contractTone !== decision.tone) {
      errors.push(`outputs[${index}].render_contract tone must match decision.tone`);
    }
    const contractResult = validate(contract);
    if (!contractResult.valid) errors.push(...contractResult.errors.map(error => `outputs[${index}].render_contract: ${error}`));
    else if (decision?.mode && decision.mode !== 'mixed' && contract.mode !== decision.mode) errors.push(`outputs[${index}].render_contract.mode must match decision.mode`);
    const isStudioContract = studioContract(contract);
    if (decision?.tier === 'stable' && isStudioContract) errors.push(`outputs[${index}] uses a Studio contract but decision.tier is stable`);
    if (decision?.tier === 'studio' && !isStudioContract) errors.push(`outputs[${index}] uses a Stable contract but decision.tier is studio`);
  }
  noSensitiveKeys(job, 'job', errors);
  return { valid: errors.length === 0, errors };
}

module.exports = {
  PUBLISH_TARGETS,
  SOURCE_KINDS,
  LANGUAGES,
  TRANSFORMATIONS,
  STABLE_MODES,
  STUDIO_MODES,
  canonicalJson,
  sha256Bytes,
  sha256Json,
  materializeRenderContract,
  validateVisualJob,
};
