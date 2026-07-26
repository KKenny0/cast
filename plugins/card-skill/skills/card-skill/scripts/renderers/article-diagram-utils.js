const BOUNDARY_NODE_WIDTH = 218;
const BAND_NODE_WIDTH = 282;

function visualTextLength(value) {
  const text = String(value || '').trim();
  let weight = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) weight += 0.4;
    else if (/[\u3400-\u9fff]/.test(ch)) weight += 2;
    else weight += 1;
  }
  return weight;
}

function articleDiagramOptions(input) {
  return input && typeof input.__articleDiagramSalvage === 'object'
    ? input.__articleDiagramSalvage
    : {};
}

function boundaryCompactLevel(input) {
  const level = Number(articleDiagramOptions(input).boundaryCompactLevel || 0);
  return Number.isFinite(level) ? Math.max(0, Math.min(2, level)) : 0;
}

function boundaryNodeWidth(input) {
  const zones = (input.zones || []).slice(0, 4);
  if (input.family !== 'boundary-model' || zones.length < 3) return BOUNDARY_NODE_WIDTH;
  const compactLevel = boundaryCompactLevel(input);
  if (compactLevel >= 2) return 260;
  if (compactLevel >= 1) return 270;
  return BAND_NODE_WIDTH;
}

module.exports = {
  BOUNDARY_NODE_WIDTH,
  articleDiagramOptions,
  boundaryCompactLevel,
  boundaryNodeWidth,
  visualTextLength,
};
