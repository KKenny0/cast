const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SCORE_FIELDS = ['message_clarity', 'visual_hierarchy', 'cognitive_load', 'style_consistency'];
const SEVERITIES = new Set(['blocker', 'major', 'minor']);
const VERDICTS = new Set(['pass', 'revise', 'fail']);
const ISSUE_TYPE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function computedOverall(scores) {
  const values = SCORE_FIELDS.map(field => scores?.[field]);
  if (scores?.metaphor_quality !== undefined && scores?.metaphor_quality !== null) values.push(scores.metaphor_quality);
  if (values.some(value => !Number.isInteger(value) || value < 0 || value > 5)) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 20) / 10;
}

function validateVisualReview(review) {
  const errors = [];
  if (!review || typeof review !== 'object' || Array.isArray(review)) return { valid: false, errors: ['Visual Review must be an object'] };
  const allowed = new Set(['schema_version', 'job_id', 'output_id', 'artifact_index', 'visual_job_sha256', 'artifact_plan_sha256', 'artifact_contract_sha256', 'attempt', 'render_contract_sha256', 'png_sha256', 'checker_pass', 'metaphor_required', 'scores', 'overall_score', 'issues', 'verdict']);
  for (const key of Object.keys(review)) if (!allowed.has(key)) errors.push(`Unknown Visual Review field: ${key}`);
  if (review.schema_version !== 1) errors.push('schema_version must be 1');
  if (typeof review.job_id !== 'string' || !SAFE_ID.test(review.job_id)) errors.push('job_id must be a safe lowercase slug');
  if (typeof review.output_id !== 'string' || !SAFE_ID.test(review.output_id)) errors.push('output_id must be a safe lowercase slug');
  if (!Number.isInteger(review.artifact_index) || review.artifact_index < 1) errors.push('artifact_index must be a positive integer');
  for (const field of ['visual_job_sha256', 'artifact_plan_sha256', 'artifact_contract_sha256']) {
    if (review[field] !== undefined && (typeof review[field] !== 'string' || !SHA256.test(review[field]))) errors.push(`${field} must be a SHA-256 hex digest`);
  }
  if (![0, 1].includes(review.attempt)) errors.push('attempt must be 0 or 1');
  if (typeof review.render_contract_sha256 !== 'string' || !SHA256.test(review.render_contract_sha256)) errors.push('render_contract_sha256 must be a SHA-256 hex digest');
  if (typeof review.png_sha256 !== 'string' || !SHA256.test(review.png_sha256)) errors.push('png_sha256 must be a SHA-256 hex digest');
  if (review.checker_pass !== true) errors.push('checker_pass must be true');
  if (typeof review.metaphor_required !== 'boolean') errors.push('metaphor_required must be a boolean');
  if (!review.scores || typeof review.scores !== 'object' || Array.isArray(review.scores)) {
    errors.push('scores must be an object');
  } else {
    const scoreKeys = new Set([...SCORE_FIELDS, 'metaphor_quality']);
    for (const key of Object.keys(review.scores)) if (!scoreKeys.has(key)) errors.push(`Unknown score field: ${key}`);
    for (const field of SCORE_FIELDS) {
      if (!Number.isInteger(review.scores[field]) || review.scores[field] < 0 || review.scores[field] > 5) errors.push(`scores.${field} must be an integer from 0 to 5`);
    }
    if (!Object.hasOwn(review.scores, 'metaphor_quality')) errors.push('scores.metaphor_quality must be present and may be null');
    if (review.scores.metaphor_quality !== undefined && review.scores.metaphor_quality !== null
        && (!Number.isInteger(review.scores.metaphor_quality) || review.scores.metaphor_quality < 0 || review.scores.metaphor_quality > 5)) {
      errors.push('scores.metaphor_quality must be null or an integer from 0 to 5');
    }
    if (review.metaphor_required === true && !Number.isInteger(review.scores.metaphor_quality)) errors.push('scores.metaphor_quality must be scored when metaphor_required is true');
    if (review.metaphor_required === false && review.scores.metaphor_quality !== null) errors.push('scores.metaphor_quality must be null when metaphor_required is false');
  }
  const expected = computedOverall(review.scores);
  if (expected === null || review.overall_score !== expected) errors.push(`overall_score must equal the normalized score ${expected}`);
  if (!Array.isArray(review.issues) || review.issues.length > 20) errors.push('issues must be an array of at most 20 entries');
  else review.issues.forEach((issue, index) => {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) { errors.push(`issues[${index}] must be an object`); return; }
    const keys = new Set(['type', 'severity', 'suggestion']);
    for (const key of Object.keys(issue)) if (!keys.has(key)) errors.push(`Unknown issues[${index}] field: ${key}`);
    if (typeof issue.type !== 'string' || !ISSUE_TYPE.test(issue.type)) errors.push(`issues[${index}].type must be a safe slug`);
    if (!SEVERITIES.has(issue.severity)) errors.push(`issues[${index}].severity must be blocker, major, or minor`);
    if (typeof issue.suggestion !== 'string' || !issue.suggestion.trim() || issue.suggestion.length > 500) errors.push(`issues[${index}].suggestion must be a non-empty string of at most 500 characters`);
  });
  if (!VERDICTS.has(review.verdict)) errors.push('verdict must be pass, revise, or fail');
  const blockers = Array.isArray(review.issues) && review.issues.some(issue => issue?.severity === 'blocker');
  const shouldPass = expected !== null && expected >= 8 && !blockers;
  if ((review.verdict === 'pass') !== shouldPass) errors.push('verdict must be pass exactly when overall_score is at least 8.0 and no blocker exists');
  if (review.verdict === 'revise' && review.attempt !== 0) errors.push('only attempt 0 may request revision');
  if (review.verdict === 'fail' && review.attempt !== 1) errors.push('attempt 1 must fail instead of requesting another revision');
  return { valid: errors.length === 0, errors };
}

module.exports = { SCORE_FIELDS, computedOverall, validateVisualReview };
