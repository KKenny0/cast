const crypto = require('crypto');
const fs = require('fs');
const { validate } = require('./schema');
const { EDITORIAL_TONES } = require('./designs');
const { MAX_CARD_INPUT_JSON_BYTES, MAX_POSTER_MEDIA_TOTAL_BYTES, inspectLocalImage, isSafeAbsoluteLocalPath, pathKey, realpathExisting } = require('./file-access');
const { ARGUMENT_STRUCTURES, CONTENT_TYPES, modeTier, selectMode } = require('./mode-selector');

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
const SOURCE_UNIT_FIELDS = new Set(['id', 'label', 'digest', 'excerpt', 'evidence']);
const EVIDENCE_FIELDS = new Set(['kind', 'strength', 'freshness', 'reason']);
const EVIDENCE_KINDS = new Set(['claim', 'quote', 'command', 'interface', 'output', 'benchmark', 'architecture', 'case', 'hero']);
const EVIDENCE_STRENGTHS = new Set(['primary', 'supporting', 'unusable']);
const EVIDENCE_FRESHNESS = new Set(['current', 'stale', 'unknown']);
const DECISION_FIELDS = new Set(['mode', 'tier', 'reason', 'tone', 'selection_source', 'selection_summary', 'visual_risks']);
const OUTPUT_V12_FIELDS = new Set(['id', 'basename', 'source_unit_ids', 'transformation', 'section', 'visual_plan', 'render_contract']);
const OUTPUT_V3_FIELDS = new Set(['id', 'artifacts', 'render_contract']);
const ARTIFACT_FIELDS = new Set(['artifact_index', 'id', 'basename', 'role', 'source_unit_ids', 'transformation', 'visual_plan']);
const VISUAL_PLAN_FIELDS = new Set(['core_message', 'content_type', 'argument_structure', 'visual_metaphor', 'layout_strategy', 'visual_hierarchy', 'avoid_patterns']);
const UNSAFE_EVIDENCE_TEXT = /[\p{Cc}\p{Cs}\p{Default_Ignorable_Code_Point}]/u;

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

function expectedArtifactCount(contract) {
  if (contract?.mode === 'poster' && Array.isArray(contract.cards)) return contract.cards.length;
  if (contract?.mode === 'article-diagram' && contract.render_plan === 'split') return 2;
  return 1;
}

function artifactContractProjection(contract, artifactIndex) {
  if (contract?.mode === 'poster') {
    const { cards, ...series } = contract;
    return { ...series, card: cards?.[artifactIndex - 1] };
  }
  if (contract?.mode === 'article-diagram' && !contract.family) {
    const plan = contract.render_plan || 'auto';
    const view = plan === 'split'
      ? (artifactIndex === 1 ? 'summary' : 'structure')
      : (plan === 'structure' ? 'structure' : 'summary');
    if (view === 'summary') return {
      mode: contract.mode, view, formula: contract.formula, sentence: contract.sentence,
    };
    return {
      mode: contract.mode, view, structure: contract.structure,
    };
  }
  return contract;
}

function stringLeaves(value, leaves = []) {
  if (typeof value === 'string') leaves.push(value);
  else if (Array.isArray(value)) value.forEach(item => stringLeaves(item, leaves));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => stringLeaves(item, leaves));
  return leaves;
}

function visibleHtmlText(value) {
  let html = String(value || '').replace(/<!--[\s\S]*?-->/g, ' ');
  for (const pattern of [
    /<(style|script|template|noscript|head)\b[^>]*>[\s\S]*?<\/\1>/gi,
    /<([a-z][\w:-]*)\b(?=[^>]*(?:\shidden(?:\s|=|>)|aria-hidden\s*=\s*["']?true|style\s*=\s*(?:["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["']|[^\s>]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^\s>]*)))[^>]*>[\s\S]*?<\/\1>/gi,
  ]) {
    let previous;
    do { previous = html; html = html.replace(pattern, ' '); } while (html !== previous);
  }
  return html.replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function artifactVisibleStrings(contract, artifactIndex) {
  const projection = artifactContractProjection(contract, artifactIndex);
  switch (contract?.mode) {
    case 'big': return stringLeaves([contract.phrase, contract.attribution, contract.ghost_char]);
    case 'long': return stringLeaves([
      ...(contract.body || []).flatMap(element => {
        // layer labels are uppercased by the template and therefore cannot
        // carry byte-for-byte command or quote evidence.
        if (element?.type === 'layer_card') return [element.text];
        if (['paragraph', 'heading', 'highlight', 'blockquote'].includes(element?.type)) return [element.text];
        return [];
      }),
    ]);
    case 'whiteboard': return stringLeaves([
      contract.title, contract.subtitle,
      ...(contract.steps || []).flatMap(step => [
        step?.text,
        ...(step?.nodes || []).map(node => node?.text),
        ...(step?.items || []).flatMap(item => [item?.name, item?.desc]),
      ]),
    ]);
    case 'poster': {
      // Exact evidence is deliberately limited to structured card body text.
      // Series chrome can be omitted, clipped, or shown only on another page.
      const visible = [];
      for (const element of projection.card?.body || []) {
        if (['paragraph', 'heading', 'highlight'].includes(element?.type)) visible.push(element.text);
        // Item labels are uppercased by the template; only the body copy is
        // an exact-evidence surface.
        else if (element?.type === 'items') visible.push(...(element.entries || []).map(entry => entry?.text));
        else if (element?.type === 'data_row') visible.push(element.key, element.value);
        else if (element?.type === 'reading_unit') visible.push(element.quote, element.thought);
        else if (element?.type === 'media') visible.push(element.caption);
        else if (element?.type === 'process') visible.push(...(element.steps || []).flatMap(step => [step?.label, step?.title, step?.text]));
      }
      return stringLeaves(visible);
    }
    case 'editorial-image': return stringLeaves([contract.kicker, contract.title, contract.subtitle, visibleHtmlText(contract.content_html)]);
    case 'article-diagram': {
      const view = artifactContractProjection(contract, artifactIndex);
      if (!contract.family) return stringLeaves([
        view.formula, view.sentence,
        ...(view.structure?.nodes || []).flatMap(node => [node?.label, node?.note]),
        ...(view.structure?.relations || []).flatMap(relation => [relation?.label]),
      ]);
      return stringLeaves([
        contract.title, contract.subtitle, contract.caption, contract.source,
        ...(contract.nodes || []).flatMap(node => [node?.label, node?.note]),
        ...(contract.zones || []).flatMap(zone => [zone?.label]),
      ]);
    }
    case 'infograph':
    case 'comic':
    case 'sketchnote': return stringLeaves([contract.title, contract.subtitle, visibleHtmlText(contract.content_html)]);
    default: return [];
  }
}

function artifactPlansForOutput(job, output) {
  if (job?.schema_version === 3) return output.artifacts || [];
  const count = expectedArtifactCount(output.render_contract);
  const sourceBasename = typeof output.basename === 'string' ? output.basename : 'output.png';
  const extension = pathExtname(sourceBasename) || '.png';
  const stem = sourceBasename.slice(0, -extension.length);
  const role = typeof output.section === 'string' && SAFE_ID.test(output.section) ? output.section : 'output';
  return Array.from({ length: count }, (_, offset) => ({
    artifact_index: offset + 1,
    id: output.id,
    basename: count === 1 ? sourceBasename : `${stem}_${offset + 1}${extension}`,
    role,
    source_unit_ids: output.source_unit_ids,
    transformation: output.transformation,
    visual_plan: output.visual_plan,
  }));
}

function pathExtname(value) {
  const match = String(value || '').match(/(\.[^.]+)$/);
  return match ? match[1] : '';
}

function validateStringList(value, path, minimum, maximum, itemMaximum, errors) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    errors.push(`${path} must contain ${minimum} to ${maximum} strings`);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string' || !item.trim() || item.length > itemMaximum) errors.push(`${path}[${index}] must be a non-empty string of at most ${itemMaximum} characters`);
  });
}

function validateVisualPlan(plan, path, errors) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    errors.push(`${path} must be an object`);
    return;
  }
  rejectUnknownFields(plan, VISUAL_PLAN_FIELDS, path, errors);
  if (typeof plan.core_message !== 'string' || !plan.core_message.trim() || plan.core_message.length > 280) errors.push(`${path}.core_message must be a non-empty string of at most 280 characters`);
  if (!CONTENT_TYPES.has(plan.content_type)) errors.push(`${path}.content_type must be one of: ${[...CONTENT_TYPES].join(', ')}`);
  if (!ARGUMENT_STRUCTURES.has(plan.argument_structure)) errors.push(`${path}.argument_structure must be one of: ${[...ARGUMENT_STRUCTURES].join(', ')}`);
  if (plan.visual_metaphor !== null && (typeof plan.visual_metaphor !== 'string' || !plan.visual_metaphor.trim() || plan.visual_metaphor.length > 280)) errors.push(`${path}.visual_metaphor must be null or a non-empty string of at most 280 characters`);
  if (typeof plan.layout_strategy !== 'string' || !plan.layout_strategy.trim() || plan.layout_strategy.length > 500) errors.push(`${path}.layout_strategy must be a non-empty string of at most 500 characters`);
  validateStringList(plan.visual_hierarchy, `${path}.visual_hierarchy`, 1, 5, 160, errors);
  validateStringList(plan.avoid_patterns, `${path}.avoid_patterns`, 0, 32, 160, errors);
}

function validateEvidence(evidence, path, errors) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    errors.push(`${path} must be an object`);
    return;
  }
  rejectUnknownFields(evidence, EVIDENCE_FIELDS, path, errors);
  if (!EVIDENCE_KINDS.has(evidence.kind)) errors.push(`${path}.kind must be one of: ${[...EVIDENCE_KINDS].join(', ')}`);
  if (!EVIDENCE_STRENGTHS.has(evidence.strength)) errors.push(`${path}.strength must be one of: ${[...EVIDENCE_STRENGTHS].join(', ')}`);
  if (!EVIDENCE_FRESHNESS.has(evidence.freshness)) errors.push(`${path}.freshness must be one of: ${[...EVIDENCE_FRESHNESS].join(', ')}`);
  if (evidence.strength === 'primary' && evidence.freshness === 'unknown') errors.push(`${path} cannot classify unknown evidence as primary`);
  const reasonRequired = evidence.strength === 'unusable' || evidence.freshness !== 'current';
  if (reasonRequired && (typeof evidence.reason !== 'string' || !evidence.reason.trim())) {
    errors.push(`${path}.reason is required for unusable, stale, or unknown evidence`);
  } else if (evidence.reason !== undefined && (typeof evidence.reason !== 'string' || evidence.reason.length > 200)) {
    errors.push(`${path}.reason must be a string of at most 200 characters`);
  }
}

function validateSourceUnitReferences(ids, path, unitIds, errors, { rejectDuplicates = true } = {}) {
  if (!Array.isArray(ids) || ids.length < 1) {
    errors.push(`${path} must be a non-empty array`);
    return [];
  }
  const seen = new Set();
  const validIds = [];
  for (const id of ids) {
    if (typeof id !== 'string') errors.push(`${path} must contain strings`);
    else if (!unitIds.has(id)) errors.push(`${path} references unknown unit "${id}"`);
    else if (seen.has(id) && rejectDuplicates) errors.push(`${path} duplicates source unit "${id}"`);
    else {
      seen.add(id);
      validIds.push(id);
    }
  }
  return validIds;
}

function primaryEvidenceIdentity(unit) {
  const excerpt = typeof unit?.excerpt === 'string'
    ? unit.excerpt.normalize('NFC').trim().replace(/\s+/gu, ' ')
    : '';
  return excerpt ? `text:${unit.evidence?.kind || 'claim'}:${excerpt}` : null;
}

function validateVisualJob(job, { checkLocalFiles = true } = {}) {
  const errors = [];
  if (!job || typeof job !== 'object' || Array.isArray(job)) return { valid: false, errors: ['Visual Job must be an object'] };
  try {
    if (Buffer.byteLength(JSON.stringify(job), 'utf8') > 4 * 1024 * 1024) {
      errors.push('Visual Job must serialize to at most 4 MiB');
    }
  } catch {
    return { valid: false, errors: ['Visual Job must be JSON-serializable'] };
  }
  rejectUnknownFields(job, TOP_LEVEL_FIELDS, 'Visual Job', errors);
  if (![1, 2, 3].includes(job.schema_version)) errors.push('schema_version must be 1, 2, or 3');
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
  const unitsById = new Map();
  for (const [index, unit] of (Array.isArray(job.source_units) ? job.source_units : []).entries()) {
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) { errors.push(`source_units[${index}] must be an object`); continue; }
    rejectUnknownFields(unit, SOURCE_UNIT_FIELDS, `source_units[${index}]`, errors);
    if (typeof unit.id !== 'string' || !SAFE_ID.test(unit.id)) errors.push(`source_units[${index}].id must be a safe lowercase slug`);
    if (unitIds.has(unit.id)) errors.push(`source_units[${index}].id duplicates "${unit.id}"`);
    unitIds.add(unit.id);
    unitsById.set(unit.id, unit);
    if (unit.label !== undefined && (typeof unit.label !== 'string' || unit.label.length > 160)) errors.push(`source_units[${index}].label must be a string of at most 160 characters`);
    if (unit.excerpt !== undefined && (typeof unit.excerpt !== 'string' || unit.excerpt.length > 500)) errors.push(`source_units[${index}].excerpt must be a string of at most 500 characters`);
    if (unit.digest !== undefined && (typeof unit.digest !== 'string' || !SHA256.test(unit.digest))) errors.push(`source_units[${index}].digest must be a SHA-256 hex digest`);
    if (job.schema_version === 3) {
      if (typeof unit.excerpt === 'string' && UNSAFE_EVIDENCE_TEXT.test(unit.excerpt)) {
        errors.push(`source_units[${index}].excerpt must not contain control, surrogate, or default-ignorable Unicode characters`);
      }
      if (!(typeof unit.excerpt === 'string' && unit.excerpt.trim()) && !(typeof unit.digest === 'string' && SHA256.test(unit.digest))) {
        errors.push(`source_units[${index}] must provide a non-empty excerpt or SHA-256 digest for Visual Job v3`);
      }
      validateEvidence(unit.evidence, `source_units[${index}].evidence`, errors);
      if (['command', 'quote'].includes(unit.evidence?.kind) && !(typeof unit.excerpt === 'string' && unit.excerpt.trim())) {
        errors.push(`source_units[${index}].excerpt is required for exact ${unit.evidence.kind} evidence`);
      }
      if (['command', 'quote'].includes(unit.evidence?.kind)
          && typeof unit.excerpt === 'string'
          && (/[^\S ]/.test(unit.excerpt) || / {2,}/.test(unit.excerpt) || /[\p{Cc}\p{Cf}]/u.test(unit.excerpt))) {
        errors.push(`source_units[${index}].excerpt for exact ${unit.evidence.kind} evidence must use browser-stable whitespace (single spaces only)`);
      }
    }
    else if (unit.evidence !== undefined) errors.push(`source_units[${index}].evidence is only supported by Visual Job v3`);
  }

  const decision = job.decision;
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) errors.push('decision must be an object');
  else {
    rejectUnknownFields(decision, DECISION_FIELDS, 'decision', errors);
    if (!DECISION_MODES.has(decision.mode)) errors.push(`decision.mode must be one of: ${[...DECISION_MODES].join(', ')}`);
    if (!['stable', 'studio'].includes(decision.tier)) errors.push('decision.tier must be stable or studio');
    if ([2, 3].includes(job.schema_version) && !['taxonomy', 'user-override'].includes(decision.selection_source)) errors.push('decision.selection_source must be taxonomy or user-override for Visual Job v2/v3');
    if (job.schema_version === 1 && decision.selection_source !== undefined) errors.push('decision.selection_source is only supported by Visual Job v2/v3');
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
  if (Array.isArray(job.outputs)) {
    const aggregateArtifacts = job.outputs.reduce((sum, output) => sum + expectedArtifactCount(output?.render_contract), 0);
    if (aggregateArtifacts > 20) errors.push('Visual Job supports at most 20 rendered artifacts across all outputs');
    if (checkLocalFiles) {
      const uniquePosterMedia = new Map();
      for (const output of job.outputs) {
        if (output?.render_contract?.mode !== 'poster') continue;
        for (const card of output.render_contract.cards || []) {
          for (const element of card?.body || []) {
            if (element?.type !== 'media' || typeof element.path !== 'string') continue;
            if (!isSafeAbsoluteLocalPath(element.path)) continue;
            const real = realpathExisting(element.path);
            if (!real) continue;
            const key = pathKey(real);
            if (!uniquePosterMedia.has(key)) {
              try { uniquePosterMedia.set(key, fs.statSync(real).size); }
              catch { errors.push(`Visual Job poster media changed or disappeared during validation: ${element.path}`); }
            }
          }
        }
      }
      const aggregateMediaBytes = [...uniquePosterMedia.values()].reduce((sum, bytes) => sum + bytes, 0);
      if (aggregateMediaBytes > MAX_POSTER_MEDIA_TOTAL_BYTES) {
        errors.push(`Visual Job poster media exceeds the ${MAX_POSTER_MEDIA_TOTAL_BYTES} byte job-wide candidate budget`);
      }
    }
  }
  const outputIds = new Set(); const basenames = new Set();
  const claimedPrimaryIds = new Set();
  const claimedPrimaryDigests = new Set();
  const claimedPrimaryEvidence = new Set();
  const actualModes = new Set(); const actualTiers = new Set();
  for (const [index, output] of (Array.isArray(job.outputs) ? job.outputs : []).entries()) {
    if (!output || typeof output !== 'object' || Array.isArray(output)) { errors.push(`outputs[${index}] must be an object`); continue; }
    rejectUnknownFields(output, job.schema_version === 3 ? OUTPUT_V3_FIELDS : OUTPUT_V12_FIELDS, `outputs[${index}]`, errors);
    if (typeof output.id !== 'string' || !SAFE_ID.test(output.id)) errors.push(`outputs[${index}].id must be a safe lowercase slug`);
    if (outputIds.has(output.id)) errors.push(`outputs[${index}].id duplicates "${output.id}"`);
    outputIds.add(output.id);

    if (job.schema_version === 3) {
      if (!Array.isArray(output.artifacts) || output.artifacts.length < 1 || output.artifacts.length > 20) {
        errors.push(`outputs[${index}].artifacts must contain 1 to 20 entries`);
      }
      const artifactIds = new Set();
      for (const [artifactOffset, artifact] of (Array.isArray(output.artifacts) ? output.artifacts : []).entries()) {
        const artifactPath = `outputs[${index}].artifacts[${artifactOffset}]`;
        if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) { errors.push(`${artifactPath} must be an object`); continue; }
        rejectUnknownFields(artifact, ARTIFACT_FIELDS, artifactPath, errors);
        if (artifact.artifact_index !== artifactOffset + 1) errors.push(`${artifactPath}.artifact_index must equal ${artifactOffset + 1}`);
        if (typeof artifact.id !== 'string' || !SAFE_ID.test(artifact.id)) errors.push(`${artifactPath}.id must be a safe lowercase slug`);
        if (artifactIds.has(artifact.id)) errors.push(`${artifactPath}.id duplicates "${artifact.id}" within the output`);
        artifactIds.add(artifact.id);
        if (typeof artifact.basename !== 'string' || artifact.basename.length > 200 || !SAFE_BASENAME.test(artifact.basename) || artifact.basename.includes('..') || artifact.basename.startsWith('.')) errors.push(`${artifactPath}.basename must be a unique safe .png filename of at most 200 characters`);
        const basenameKey = typeof artifact.basename === 'string' ? artifact.basename.toLocaleLowerCase('en-US') : artifact.basename;
        if (basenames.has(basenameKey)) errors.push(`${artifactPath}.basename duplicates "${artifact.basename}" on a case-insensitive filesystem`);
        basenames.add(basenameKey);
        if (typeof artifact.role !== 'string' || !SAFE_ID.test(artifact.role)) errors.push(`${artifactPath}.role must be a safe lowercase slug`);
        const referenced = validateSourceUnitReferences(artifact.source_unit_ids, `${artifactPath}.source_unit_ids`, unitIds, errors);
        const inadmissible = referenced.filter((id) => {
          const evidence = unitsById.get(id)?.evidence;
          return evidence?.strength === 'unusable' || evidence?.freshness !== 'current';
        });
        if (inadmissible.length) errors.push(`${artifactPath} references stale, unknown, or unusable evidence: ${inadmissible.join(', ')}`);
        const hasCurrentPrimary = referenced.some((id) => {
          const evidence = unitsById.get(id)?.evidence;
          return evidence?.strength === 'primary' && evidence?.freshness === 'current';
        });
        if (!hasCurrentPrimary) errors.push(`${artifactPath} must reference at least one current primary evidence source unit`);
        const newPrimaryIds = referenced.filter((id) => {
          const evidence = unitsById.get(id)?.evidence;
          const unit = unitsById.get(id);
          const identity = primaryEvidenceIdentity(unit);
          return evidence?.strength === 'primary'
            && evidence?.freshness === 'current'
            && !claimedPrimaryIds.has(id)
            && !(unit?.digest && claimedPrimaryDigests.has(unit.digest))
            && !(identity && claimedPrimaryEvidence.has(identity));
        });
        if (hasCurrentPrimary && !newPrimaryIds.length) errors.push(`${artifactPath} must claim at least one current primary evidence source unit not used by another artifact`);
        for (const id of referenced) {
          const evidence = unitsById.get(id)?.evidence;
          if (evidence?.strength === 'primary' && evidence?.freshness === 'current') claimedPrimaryIds.add(id);
          const unit = unitsById.get(id);
          if (evidence?.strength === 'primary' && evidence?.freshness === 'current' && unit?.digest) claimedPrimaryDigests.add(unit.digest);
          const identity = primaryEvidenceIdentity(unit);
          if (evidence?.strength === 'primary' && evidence?.freshness === 'current' && identity) claimedPrimaryEvidence.add(identity);
        }
        if (!TRANSFORMATIONS.has(artifact.transformation)) errors.push(`${artifactPath}.transformation must be one of: ${[...TRANSFORMATIONS].join(', ')}`);
        const exactEvidence = referenced.filter((id) => ['command', 'quote'].includes(unitsById.get(id)?.evidence?.kind));
        if (exactEvidence.length && artifact.transformation !== 'preserve') errors.push(`${artifactPath}.transformation must be preserve when referencing command or quote evidence`);
        validateVisualPlan(artifact.visual_plan, `${artifactPath}.visual_plan`, errors);
      }
    } else {
      if (typeof output.basename !== 'string' || output.basename.length > 200 || !SAFE_BASENAME.test(output.basename) || output.basename.includes('..') || output.basename.startsWith('.')) errors.push(`outputs[${index}].basename must be a unique safe .png filename of at most 200 characters`);
      const basenameKey = typeof output.basename === 'string' ? output.basename.toLocaleLowerCase('en-US') : output.basename;
      if (basenames.has(basenameKey)) errors.push(`outputs[${index}].basename duplicates "${output.basename}" on a case-insensitive filesystem`);
      basenames.add(basenameKey);
      validateSourceUnitReferences(output.source_unit_ids, `outputs[${index}].source_unit_ids`, unitIds, errors, { rejectDuplicates: false });
      if (!TRANSFORMATIONS.has(output.transformation)) errors.push(`outputs[${index}].transformation must be one of: ${[...TRANSFORMATIONS].join(', ')}`);
      if (output.section !== undefined && (typeof output.section !== 'string' || output.section.length > 160)) {
        errors.push(`outputs[${index}].section must be a string of at most 160 characters`);
      }
      if (job.schema_version === 2) validateVisualPlan(output.visual_plan, `outputs[${index}].visual_plan`, errors);
      else if (output.visual_plan !== undefined) errors.push(`outputs[${index}].visual_plan is only supported by Visual Job v2`);
    }
    if (!output.render_contract || typeof output.render_contract !== 'object' || Array.isArray(output.render_contract)) {
      errors.push(`outputs[${index}].render_contract must be an object`);
      continue;
    }
    const contract = materializeRenderContract(job, output);
    try {
      if (Buffer.byteLength(JSON.stringify(contract), 'utf8') > MAX_CARD_INPUT_JSON_BYTES) {
        errors.push(`outputs[${index}].render_contract must serialize to at most ${MAX_CARD_INPUT_JSON_BYTES} bytes`);
      }
    } catch {
      errors.push(`outputs[${index}].render_contract must be JSON-serializable`);
    }
    const usesPosterMedia = contract.mode === 'poster'
      && contract.cards?.some(card => card?.body?.some(element => element?.type === 'media'));
    if (usesPosterMedia && job.schema_version !== 3) {
      errors.push(`outputs[${index}].render_contract poster media requires Visual Job v3 evidence binding`);
    }
    const contractTone = contract.mode === 'editorial-image' ? contract.editorial_tone : contract.tone;
    if (decision?.tone && contractTone && contractTone !== decision.tone) {
      errors.push(`outputs[${index}].render_contract tone must match decision.tone`);
    }
    const contractResult = validate(contract, { checkLocalFiles });
    if (!contractResult.valid) errors.push(...contractResult.errors.map(error => `outputs[${index}].render_contract: ${error}`));
    if (job.schema_version === 3 && Array.isArray(output.artifacts)) {
      const expectedCount = expectedArtifactCount(contract);
      if (output.artifacts.length !== expectedCount) errors.push(`outputs[${index}].artifacts must contain exactly ${expectedCount} entries for this render contract`);
      for (const [artifactOffset, artifact] of output.artifacts.entries()) {
        if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || !Array.isArray(artifact.source_unit_ids)) continue;
        const projectionStrings = artifactVisibleStrings(contract, artifactOffset + 1);
        const exactUnits = artifact.source_unit_ids
          .map((id) => unitsById.get(id))
          .filter((unit) => ['command', 'quote'].includes(unit?.evidence?.kind));
        const exactEvidenceUnsafe = !['long', 'poster'].includes(contract.mode);
        if (exactUnits.length && exactEvidenceUnsafe) {
          errors.push(`outputs[${index}].artifacts[${artifactOffset}] cannot bind exact command or quote evidence to a renderer that may interpret, hide, normalize, or truncate source text; use long or poster`);
        }
        for (const id of artifact.source_unit_ids || []) {
          const unit = unitsById.get(id);
          if (!exactEvidenceUnsafe && ['command', 'quote'].includes(unit?.evidence?.kind) && unit?.excerpt && !projectionStrings.some(value => value.includes(unit.excerpt))) {
            errors.push(`outputs[${index}].artifacts[${artifactOffset}] must preserve exact ${unit.evidence.kind} evidence "${id}" in its rendered artifact`);
          }
        }
        const artifactProjection = artifactContractProjection(contract, artifactOffset + 1);
        const mediaCount = artifactProjection.card?.body?.filter(element => element?.type === 'media').length || 0;
        if (mediaCount > 0) {
          const primaryCurrentDigests = new Set(artifact.source_unit_ids.map((id) => {
            const unit = unitsById.get(id);
            return SHA256.test(unit?.digest || '')
              && unit?.evidence?.strength === 'primary'
              && unit?.evidence?.freshness === 'current'
              ? unit.digest
              : null;
          }).filter(Boolean));
          if (!primaryCurrentDigests.size) errors.push(`outputs[${index}].artifacts[${artifactOffset}] media requires a digest-bound referenced current primary source unit`);
          if (checkLocalFiles) {
            for (const element of artifactProjection.card.body.filter(item => item?.type === 'media')) {
              if (typeof element.path !== 'string' || !isSafeAbsoluteLocalPath(element.path)) continue;
              try {
                const digest = inspectLocalImage(element.path, { label: 'Poster evidence media' }).sha256;
                if (!primaryCurrentDigests.has(digest)) {
                  errors.push(`outputs[${index}].artifacts[${artifactOffset}] media digest must match a referenced current primary source unit`);
                }
              } catch {
                // The renderer-contract validator reports unreadable paths.
              }
            }
          }
        }
      }
    }
    actualModes.add(contract.mode);
    actualTiers.add(modeTier(contract.mode, contract));
    const plans = artifactPlansForOutput(job, output).filter(artifact => artifact && typeof artifact === 'object').map(artifact => artifact.visual_plan).filter(Boolean);
    if ([2, 3].includes(job.schema_version) && decision?.selection_source === 'taxonomy') {
      for (const [planIndex, plan] of plans.entries()) {
        const selectedMode = selectMode(job.publish_target, plan);
        if (contract.mode !== selectedMode) errors.push(`outputs[${index}] visual plan ${planIndex + 1} requires taxonomy mode "${selectedMode}"`);
        if (job.publish_target === 'article-body' && plan.visual_metaphor && !studioContract(contract)) {
          errors.push(`outputs[${index}].render_contract must provide a complete Studio composition for an article-body visual metaphor`);
        }
      }
    }
    const isStudioContract = studioContract(contract);
    if (decision?.tier === 'stable' && isStudioContract) errors.push(`outputs[${index}] uses a Studio contract but decision.tier is stable`);
    if (decision?.tier === 'studio' && !isStudioContract) errors.push(`outputs[${index}] uses a Stable contract but decision.tier is studio`);
  }
  const aggregateMode = actualModes.size === 1 ? [...actualModes][0] : 'mixed';
  if (decision?.mode && decision.mode !== aggregateMode) errors.push(`decision.mode must equal aggregate output mode "${aggregateMode}"`);
  if (actualTiers.size === 1 && decision?.tier !== [...actualTiers][0]) errors.push(`decision.tier must equal aggregate output tier "${[...actualTiers][0]}"`);
  if (actualTiers.size > 1) errors.push('Visual Job cannot mix Stable and Studio outputs');
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
  EVIDENCE_KINDS,
  EVIDENCE_STRENGTHS,
  EVIDENCE_FRESHNESS,
  validateVisualPlan,
  artifactPlansForOutput,
  artifactContractProjection,
  expectedArtifactCount,
  canonicalJson,
  sha256Bytes,
  sha256Json,
  materializeRenderContract,
  validateVisualJob,
};
