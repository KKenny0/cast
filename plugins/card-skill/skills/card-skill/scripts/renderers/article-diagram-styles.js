const {
  articleDiagramOptions,
  boundaryCompactLevel,
  boundaryNodeWidth,
  visualTextLength,
} = require('./article-diagram-utils');

function isCompressionPack(input) {
  return typeof input.formula === 'string' && input.formula.trim() !== '';
}

function baseCss(input, design, aspect, formulaLayoutPlan = null) {
  const isTall = aspect.height > 720;
  const options = articleDiagramOptions(input);
  const compactLevel = boundaryCompactLevel(input);
  const captionCompact = Boolean(options.captionCompact);
  const titleWeight = visualTextLength(input.title);
  const titleFontSize = titleWeight > 34
    ? (isTall ? 44 : 42)
    : titleWeight > 22
      ? (isTall ? 48 : 46)
      : (isTall ? 52 : 50);
  const titleMaxWidth = titleWeight > 34 ? 650 : 700;
  const headerColumns = input.subtitle
    ? 'minmax(0, 1fr) minmax(250px, 300px)'
    : 'minmax(0, 1fr)';
  const captionFontSize = captionCompact ? 22 : (isTall ? 24 : 23);
  const captionMaxWidth = captionCompact ? 956 : 920;
  const captionTextWrap = captionCompact ? 'wrap' : 'pretty';
  const boundaryNodeWidthPx = boundaryNodeWidth(input);
  const bandCaptionFontSize = compactLevel >= 2 ? 21 : compactLevel >= 1 ? 22 : 23;
  const bandCaptionLineHeight = compactLevel >= 2 ? 1.08 : compactLevel >= 1 ? 1.1 : 1.12;
  const bandCaptionMaxWidth = compactLevel >= 2 ? 270 : compactLevel >= 1 ? 285 : 300;
  const bandNodeMinHeight = compactLevel >= 2 ? 64 : compactLevel >= 1 ? 68 : 72;
  const bandNodePadding = compactLevel >= 2 ? '7px 14px' : compactLevel >= 1 ? '8px 15px' : '10px 16px';
  const bandNodeGap = compactLevel >= 2 ? 2 : compactLevel >= 1 ? 3 : 4;
  const bandNodeTitleSize = compactLevel >= 2 ? 26 : compactLevel >= 1 ? 27 : 28;
  const bandNodeNoteSize = compactLevel >= 2 ? 21 : compactLevel >= 1 ? 22 : 23;
  const processStepCount = (input.nodes || []).slice(0, 6).length;
  const denseProcessFlow = input.family === 'process-flow' && processStepCount >= 5;
  const formulaPlan = isCompressionPack(input) ? formulaLayoutPlan : null;
  const formulaCardCompact = isCompressionPack(input) && aspect.height <= 540;
  const formulaCardPadding = aspect.height <= 540 ? '54px 72px' : '54px 72px';
  const formulaTermSize = formulaCardCompact ? 50 : 58;
  const formulaResultSize = formulaCardCompact ? 56 : 66;
  const formulaSentenceSize = 36;
  return `
    :root {
      --bg: ${design.canvas};
      --green: ${design.surface2};
      --pink: ${design.accent};
      --accent: ${design.accent};
      --ink: ${design.ink};
      --ink-light: ${design.inkMuted};
      --surface-1: ${design.surface1};
      --surface-2: ${design.surface2};
      --hairline: ${design.hairline};
      --radius: ${design.radius};
      --paper-shadow: color-mix(in srgb, var(--ink) 5%, transparent);
    }

    html, body {
      width: ${aspect.width}px;
      height: ${aspect.height}px;
      overflow: hidden;
    }

    .page {
      width: ${aspect.width}px;
      height: ${aspect.height}px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .colophon {
      display: ${input.logo || input.brand_name || input.source ? 'flex' : 'none'};
      padding-top: 18px;
      padding-bottom: 22px;
    }

    .article-diagram {
      flex: 1 1 auto;
      min-height: 0;
      padding: ${isTall ? '48px 62px 34px' : '42px 60px 28px'};
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: ${isTall ? '24px' : '18px'};
      font-family: "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--ink);
    }

    .article-diagram-compression-pack {
      padding: ${formulaCardCompact ? '36px 54px 30px' : '48px 62px 36px'};
      grid-template-rows: minmax(0, 1fr);
    }

    .diagram-header {
      display: grid;
      grid-template-columns: ${headerColumns};
      gap: ${isTall ? '30px' : '28px'};
      align-items: center;
    }

    .diagram-header h1 {
      font-family: "DM Serif Display", "XiangcuiDengcusong", serif;
      max-width: ${titleMaxWidth}px;
      font-size: ${titleFontSize}px;
      line-height: 1.04;
      letter-spacing: 0;
      color: var(--ink);
      text-wrap: balance;
    }

    .diagram-header p {
      justify-self: end;
      max-width: 300px;
      font: 400 24px/1.28 "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--ink-light);
      text-wrap: balance;
    }

    .diagram-stage {
      position: relative;
      min-height: 0;
      border: 1px solid var(--hairline);
      border-radius: var(--radius);
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--surface-1) 74%, var(--bg)), color-mix(in srgb, var(--surface-2) 24%, var(--bg)));
      overflow: hidden;
    }

    .diagram-stage::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.28;
      background:
        radial-gradient(circle at 22% 30%, color-mix(in srgb, var(--ink) 8%, transparent) 0 0.7px, transparent 1.4px),
        radial-gradient(circle at 72% 66%, color-mix(in srgb, var(--surface-1) 44%, transparent) 0 1px, transparent 1.6px);
      background-size: 20px 20px, 26px 26px;
      mix-blend-mode: multiply;
      z-index: 0;
    }

    .diagram-stage::before {
      content: "";
      position: absolute;
      inset: 22px;
      border: 1px solid color-mix(in srgb, var(--hairline) 68%, transparent);
      border-radius: calc(var(--radius) + 2px);
      pointer-events: none;
    }

    .diagram-caption {
      width: 100%;
      max-width: ${captionMaxWidth}px;
      justify-self: center;
      margin: 0 auto;
      font: 400 ${captionFontSize + 1}px/1.26 "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--ink-light);
      text-wrap: ${captionTextWrap};
    }

    .diagram-connectors-plane {
      position: absolute;
      inset: 42px 56px;
      z-index: 1;
      pointer-events: none;
    }

    .diagram-connectors {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .diagram-connectors line {
      stroke: color-mix(in srgb, var(--accent) 46%, var(--hairline));
      stroke-width: 0.42;
      vector-effect: non-scaling-stroke;
    }

    .diagram-link-label {
      position: absolute;
      transform: translate(-50%, -50%);
      padding: 4px 10px 5px;
      border: 1px solid color-mix(in srgb, var(--hairline) 74%, var(--surface-1));
      border-radius: 999px;
      background: color-mix(in srgb, var(--surface-1) 96%, var(--bg));
      color: var(--ink-light);
      font: 500 23px/1 "XiangcuiDengcusong", "DM Sans", serif;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .diagram-node {
      position: absolute;
      width: 220px;
      min-height: 104px;
      transform: translate(-50%, -50%);
      border: 1px solid var(--hairline);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--surface-1) 86%, var(--bg));
      padding: 20px 22px;
      display: grid;
      gap: 7px;
      align-content: center;
      z-index: 2;
    }

    .diagram-node strong,
    .process-step strong,
    .boundary-node strong {
      font: 500 31px/1.05 "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--ink);
      letter-spacing: 0;
      text-wrap: balance;
    }

    .diagram-node p,
    .process-step p,
    .boundary-node p {
      font: 400 25px/1.24 "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--ink-light);
      letter-spacing: 0;
      text-wrap: balance;
    }

    .process-flow {
      display: grid;
      grid-template-columns: repeat(var(--step-count), minmax(0, 1fr));
      gap: ${denseProcessFlow ? '14px' : '18px'};
      align-items: center;
      padding: ${denseProcessFlow ? '58px 36px' : '64px 48px'};
    }

    .process-rail {
      position: absolute;
      left: 88px;
      right: 88px;
      top: 50%;
      height: 2px;
      background: color-mix(in srgb, var(--accent) 42%, var(--hairline));
      transform: translateY(-1px);
    }

    .process-step {
      position: relative;
      min-height: 210px;
      border: 1px solid var(--hairline);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--surface-1) 84%, var(--bg));
      padding: ${denseProcessFlow ? '24px 16px 20px' : '26px 20px 22px'};
      display: grid;
      align-content: start;
      gap: ${denseProcessFlow ? '10px' : '12px'};
      z-index: 2;
    }

    .step-index {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--surface-2) 62%, var(--bg));
      color: var(--accent);
      font: 700 22px/1 "JetBrains Mono", monospace;
      border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--hairline));
    }

    .boundary-model {
      min-height: 0;
    }

    .boundary-zone {
      position: absolute;
      border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--hairline));
      border-radius: calc(var(--radius) + 2px);
      background: color-mix(in srgb, var(--surface-1) 24%, transparent);
      padding: 16px 18px;
    }

    .boundary-zone strong {
      display: block;
      font: 500 27px/1 "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--accent);
      letter-spacing: 0;
    }

    .boundary-zone span {
      display: block;
      margin-top: 6px;
      max-width: 320px;
      font: 400 24px/1.18 "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--ink-light);
    }

    .boundary-node {
      position: absolute;
      width: ${boundaryNodeWidthPx}px;
      min-height: 86px;
      border: 1px solid var(--hairline);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--surface-1) 88%, var(--bg));
      padding: 17px 18px;
      display: grid;
      gap: 6px;
      align-content: center;
      z-index: 3;
      transform: translate(-50%, -50%);
    }

    .boundary-band {
      position: absolute;
      border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--hairline));
      border-left: 2px solid color-mix(in srgb, var(--accent) 38%, var(--hairline));
      border-radius: calc(var(--radius) + 2px);
      background: color-mix(in srgb, var(--surface-1) 18%, transparent);
      padding: 14px 18px;
    }

    .boundary-band[data-level="1"] {
      background: color-mix(in srgb, var(--surface-1) 30%, transparent);
    }

    .boundary-band[data-level="2"] {
      background: color-mix(in srgb, var(--surface-1) 42%, transparent);
    }

    .band-header strong {
      display: block;
      font: 500 27px/1 "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--accent);
      letter-spacing: 0;
    }

    .band-caption {
      display: block;
      margin-top: 5px;
      max-width: ${bandCaptionMaxWidth}px;
      font: 400 ${bandCaptionFontSize}px/${bandCaptionLineHeight} "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--ink-light);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .band-node {
      z-index: 3;
      min-height: ${bandNodeMinHeight}px;
      padding: ${bandNodePadding};
      gap: ${bandNodeGap}px;
    }

    .band-node strong {
      font: 500 ${bandNodeTitleSize}px/1.02 "XiangcuiDengcusong", "DM Sans", serif;
    }

    .band-node p {
      font: 500 ${bandNodeNoteSize}px/1.16 "DM Sans", "XiangcuiDengcusong", Arial, sans-serif;
    }

    .article-diagram-compression-pack .diagram-stage {
      border: 0;
      background: transparent;
      box-shadow: none;
      overflow: visible;
    }

    .article-diagram-compression-pack .diagram-stage::before,
    .article-diagram-compression-pack .diagram-stage::after {
      content: none;
    }

    .formula-card-plate {
      min-height: 0;
      display: grid;
      align-items: center;
      justify-items: center;
      padding: ${formulaCardPadding};
      border-radius: 0;
      border-left: 0;
      border-right: 0;
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--surface-1) 62%, transparent), color-mix(in srgb, var(--surface-2) 18%, transparent)),
        linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent 44%);
    }

    .formula-card-body {
      position: relative;
      z-index: 1;
      width: min(100%, ${formulaCardCompact ? '760px' : '900px'});
      min-width: 0;
      display: grid;
      gap: ${formulaCardCompact ? '24px' : '28px'};
      justify-items: start;
    }

    .article-diagram-compression-pack {
      padding: 0;
    }

    .formula-card-plate {
      padding: ${formulaCardPadding};
      background:
        repeating-linear-gradient(0deg, color-mix(in srgb, var(--ink) 1.2%, transparent) 0 1px, transparent 1px 4px),
        linear-gradient(135deg, color-mix(in srgb, var(--surface-1) 72%, var(--bg)), var(--bg));
    }

    .formula-layout-editorial-equation {
      width: min(100%, ${formulaPlan?.shellWidth || 860}px);
      display: grid;
      gap: 0;
      justify-items: start;
    }

    .formula-layout-editorial-equation .formula-result-major {
      margin: 0;
      max-width: 100%;
      color: var(--ink);
      font: 500 ${formulaPlan?.resultSize || 66}px/1.02 "XiangcuiDengcusong", "DM Serif Display", serif;
      letter-spacing: 0;
      text-wrap: balance;
      overflow-wrap: normal;
    }

    .formula-rule {
      width: 72px;
      height: 2px;
      margin-top: 17px;
      background: var(--accent);
      opacity: 0.82;
    }

    .formula-expression {
      width: 100%;
      margin-top: ${formulaPlan?.expressionGap || 23}px;
      display: grid;
      gap: ${formulaPlan?.rowGap || 10}px;
    }

    .formula-row {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr);
      gap: 14px;
      align-items: baseline;
    }

    .formula-operator,
    .formula-plus {
      color: var(--accent);
      font-family: "JetBrains Mono", Consolas, monospace;
      font-weight: 400;
    }

    .formula-operator {
      font-size: ${(formulaPlan?.termSize || 38) * 0.88}px;
      line-height: 1;
      text-align: center;
    }

    .formula-layout-editorial-equation .formula-terms {
      min-width: 0;
      display: flex;
      flex-wrap: nowrap;
      align-items: baseline;
      gap: 13px;
    }

    .formula-layout-editorial-equation .formula-term {
      display: inline;
      width: auto;
      max-width: none;
      min-height: 0;
      padding: 0;
      border: 0;
      color: var(--ink);
      font: 500 ${formulaPlan?.termSize || 38}px/1.12 "XiangcuiDengcusong", "DM Serif Display", serif;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .formula-layout-editorial-equation .formula-plus {
      font-size: ${(formulaPlan?.termSize || 38) * 0.74}px;
      line-height: 1;
      transform: none;
    }

    .formula-layout-editorial-equation .formula-card-deck {
      width: ${formulaPlan?.noteWidth || 730}px;
      max-width: 100%;
      margin: ${formulaPlan?.noteGap || 34}px 0 0;
      padding-left: 17px;
      border-left: 2px solid color-mix(in srgb, var(--accent) 58%, var(--hairline));
      color: var(--ink-light);
      font: 400 ${formulaPlan?.noteSize || 28}px/1.3 "XiangcuiDengcusong", "DM Sans", serif;
      letter-spacing: 0;
      text-wrap: pretty;
      overflow-wrap: normal;
    }

    .compression-plate {
      position: relative;
      display: grid;
      min-height: 0;
      padding: ${isTall ? '50px 58px 46px' : '42px 54px 38px'};
      border-top: 1px solid color-mix(in srgb, var(--hairline) 78%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--hairline) 66%, transparent);
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 58%, transparent), color-mix(in srgb, var(--surface-2) 24%, transparent)),
        linear-gradient(90deg, color-mix(in srgb, var(--accent) 9%, transparent), transparent 42%);
    }

    .plate-label {
      position: relative;
      z-index: 1;
      color: color-mix(in srgb, var(--accent) 74%, var(--ink-light));
      font: 700 24px/1 "JetBrains Mono", monospace;
      letter-spacing: 0;
    }

    .formula-plate {
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: ${isTall ? '24px' : '20px'};
    }

    .formula-field {
      position: relative;
      z-index: 1;
      align-self: center;
      max-width: 1120px;
      padding: ${isTall ? '30px 0 34px' : '26px 0 30px'};
      border-top: 1px solid color-mix(in srgb, var(--hairline) 58%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--hairline) 72%, transparent);
    }

    .formula-line {
      max-width: 1040px;
      font: 500 ${isTall ? 52 : 46}px/1.14 "XiangcuiDengcusong", "DM Serif Display", serif;
      color: var(--ink);
      text-wrap: balance;
      overflow-wrap: anywhere;
    }

    .formula-equation {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) auto minmax(0, 0.95fr);
      gap: ${isTall ? '26px' : '22px'};
      align-items: center;
    }

    .formula-terms {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }

    .formula-term {
      display: inline-flex;
      align-items: center;
      min-height: 54px;
      border-bottom: 1px solid color-mix(in srgb, var(--accent) 42%, var(--hairline));
      padding: 0 4px 8px;
      color: var(--ink);
      font: 500 ${isTall ? 42 : 38}px/1.06 "XiangcuiDengcusong", "DM Serif Display", serif;
      white-space: nowrap;
    }

    .formula-arrow {
      color: var(--accent);
      font: 500 ${isTall ? 44 : 40}px/1 "XiangcuiDengcusong", "DM Sans", serif;
    }

    .formula-result {
      color: var(--ink);
      font: 500 ${isTall ? 48 : 43}px/1.08 "XiangcuiDengcusong", "DM Serif Display", serif;
      text-wrap: balance;
    }

    .figure-sheet {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: ${isTall ? '22px' : '18px'};
      padding: ${isTall ? '28px 42px 34px' : '24px 40px 30px'};
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 52%, transparent), color-mix(in srgb, var(--surface-2) 18%, transparent));
    }

    .argument-strip {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: minmax(0, 1.18fr) minmax(300px, 0.82fr);
      gap: ${isTall ? '26px' : '22px'};
      align-items: center;
      padding: ${isTall ? '15px 0 17px' : '13px 0 15px'};
      border-top: 1px solid color-mix(in srgb, var(--hairline) 58%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--hairline) 70%, transparent);
    }

    .argument-formula {
      min-width: 0;
    }

    .figure-sheet .formula-equation {
      grid-template-columns: minmax(0, 1.18fr) auto minmax(0, 0.82fr);
      gap: 14px;
    }

    .figure-sheet .formula-terms {
      gap: 8px 10px;
    }

    .figure-sheet .formula-term {
      min-height: 44px;
      padding: 0 2px 6px;
      font-size: 36px;
      line-height: 1.06;
    }

    .figure-sheet .formula-arrow {
      font-size: 36px;
    }

    .figure-sheet .formula-result,
    .figure-sheet .formula-line {
      font-size: 36px;
      line-height: 1.12;
    }

    .argument-sentence {
      color: var(--ink-light);
      font: 400 ${isTall ? 37 : 36}px/1.16 "XiangcuiDengcusong", "DM Sans", serif;
      text-wrap: balance;
    }

    .sentence-block {
      position: relative;
      z-index: 1;
      max-width: 1060px;
      display: grid;
      grid-template-columns: 118px minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }

    .sentence-kicker {
      color: color-mix(in srgb, var(--accent) 74%, var(--ink-light));
      font: 700 25px/1.08 "XiangcuiDengcusong", "DM Sans", serif;
      letter-spacing: 0;
    }

    .sentence-block p {
      margin: 0;
      font: 400 ${isTall ? 38 : 36}px/1.18 "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--ink-light);
      text-wrap: balance;
    }

    .structure-plate {
      grid-template-rows: auto auto auto;
      align-content: start;
      gap: ${isTall ? '24px' : '20px'};
    }

    .structure-map {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(var(--structure-cols), minmax(0, 1fr));
      gap: ${isTall ? '18px' : '16px'};
      align-content: center;
    }

    .structure-map::before {
      content: "";
      position: absolute;
      inset: 50% 22px auto;
      height: 1px;
      background: color-mix(in srgb, var(--accent) 34%, var(--hairline));
      z-index: 0;
    }

    .structure-triad .structure-map::before,
    .structure-matrix .structure-map::before {
      inset: auto 28px 52px;
    }

    .structure-boundary .structure-map {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-content: stretch;
    }

    .structure-boundary .structure-map::before {
      inset: 18px 50% 18px auto;
      width: 1px;
      height: auto;
    }

    .structure-node {
      position: relative;
      z-index: 1;
      min-height: ${isTall ? 164 : 148}px;
      border: 1px solid color-mix(in srgb, var(--hairline) 86%, transparent);
      border-radius: calc(var(--radius) - 2px);
      background: color-mix(in srgb, var(--surface-1) 84%, var(--bg));
      padding: 19px 22px 17px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      align-content: start;
      gap: 10px;
    }

    .structure-node::before {
      content: attr(data-index);
      width: 44px;
      height: 32px;
      display: grid;
      place-items: center;
      border-bottom: 1px solid color-mix(in srgb, var(--accent) 48%, var(--hairline));
      color: var(--accent);
      font: 700 23px/1 "JetBrains Mono", monospace;
    }

    .structure-node strong {
      font: 500 ${isTall ? 31 : 29}px/1.06 "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--ink);
      text-wrap: balance;
    }

    .structure-node p {
      margin: 0;
      font: 400 ${isTall ? 25 : 24}px/1.2 "XiangcuiDengcusong", "DM Sans", serif;
      color: var(--ink-light);
      text-wrap: balance;
    }

    .structure-chain .structure-node {
      min-height: ${isTall ? 180 : 166}px;
    }

    .structure-boundary .structure-node {
      min-height: ${isTall ? 138 : 126}px;
      padding: ${isTall ? '17px 20px 15px' : '15px 18px 14px'};
    }

    .structure-boundary .structure-node:nth-child(odd) {
      margin-right: ${isTall ? '16px' : '12px'};
    }

    .structure-boundary .structure-node:nth-child(even) {
      margin-left: ${isTall ? '16px' : '12px'};
    }

    .structure-boundary .structure-node strong {
      font-size: ${isTall ? 30 : 28}px;
    }

    .figure-structure {
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: ${isTall ? '14px' : '12px'};
    }

    .figure-sheet .structure-map {
      min-height: 0;
      align-content: stretch;
    }

    .figure-sheet .structure-map::before {
      opacity: 0.72;
    }

    .figure-boundary .structure-map {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .figure-boundary .structure-map::before {
      inset: 18px 50% 18px auto;
      width: 1px;
      height: auto;
    }

    .figure-sheet .structure-node {
      min-height: 0;
      padding: ${isTall ? '18px 20px 16px' : '16px 18px 15px'};
      grid-template-rows: auto auto;
      align-content: center;
      gap: ${isTall ? '9px' : '8px'};
    }

    .figure-sheet:not(.figure-chain) .structure-node::before {
      content: none;
      display: none;
    }

    .figure-sheet .structure-node strong {
      font-size: ${isTall ? 30 : 28}px;
      line-height: 1.08;
    }

    .figure-sheet .structure-node p {
      font-size: ${isTall ? 24 : 23}px;
      line-height: 1.18;
    }

    .figure-sheet .structure-relations {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0 12px;
      border-top: 1px solid color-mix(in srgb, var(--hairline) 70%, transparent);
    }

    .figure-boundary .structure-relations,
    .figure-chain .structure-relations {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .structure-relations {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 12px;
    }

    .structure-chain .structure-relations,
    .structure-boundary .structure-relations {
      grid-template-columns: 1fr;
    }

    .structure-relation {
      min-height: 48px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--hairline) 78%, transparent);
      color: var(--ink-light);
      font: 400 24px/1.08 "XiangcuiDengcusong", "DM Sans", serif;
    }

    .structure-relation b {
      display: inline-grid;
      place-items: center;
      min-width: 82px;
      color: var(--accent);
      font: 500 24px/1 "XiangcuiDengcusong", "DM Sans", serif;
      white-space: nowrap;
    }

    .structure-relation b::before,
    .structure-relation b::after {
      content: "";
      display: inline-block;
      width: 18px;
      height: 1px;
      margin: 0 7px 5px;
      background: color-mix(in srgb, var(--accent) 42%, var(--hairline));
      vertical-align: middle;
    }

    .structure-relation span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .structure-relation span:first-child {
      text-align: right;
    }

    .figure-sheet .structure-relation {
      min-height: 42px;
      padding: 8px 8px;
      gap: 8px;
      font-size: 24px;
      line-height: 1.06;
    }

    .figure-sheet .structure-relation b {
      min-width: 58px;
      font-size: 24px;
    }

    .figure-sheet .structure-relation b::before,
    .figure-sheet .structure-relation b::after {
      width: 10px;
      margin: 0 5px 4px;
    }

    .structure-relation-muted {
      grid-column: 1 / -1;
      max-width: 640px;
      justify-self: center;
    }

    .compression-combined {
      min-height: 0;
      display: grid;
      grid-template-rows: 0.88fr 1.12fr;
      gap: 18px;
    }

    .compression-combined .diagram-stage {
      min-height: 0;
    }
  `;
}

module.exports = { baseCss };
