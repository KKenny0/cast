#!/usr/bin/env node
/**
 * card CLI — Structured rendering pipeline.
 * Accepts a JSON input file or stdin, validates against mode schema,
 * fills the corresponding template, and captures PNG via Playwright.
 *
 * Usage:
 *   node scripts/card.js --input card_input.json --output ~/Downloads/out.png
 *   echo '{"mode":"big","phrase":"hello"}' | node scripts/card.js --stdin --output ~/Downloads/out.png
 *   node scripts/card.js --list-designs
 *
 * CLI-eligible modes (Stable tier): big, long, whiteboard, poster, editorial-image, article-diagram
 * Studio modes require a complete composition contract and human visual review.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawn, spawnSync } = require('child_process');

const ROOT_PATH = path.resolve(__dirname, '..');
const ROOT = (() => {
  try {
    return fs.realpathSync.native(ROOT_PATH);
  } catch {
    return ROOT_PATH;
  }
})();
const CAPTURE_SCRIPT = path.join(ROOT, 'assets', 'capture4k.js');
const CHECK_SCRIPT = path.join(ROOT, 'scripts', 'check-output.mjs');
const SETUP_SCRIPT = path.join(ROOT, 'scripts', 'setup-runtime.mjs');
const UPDATE_CHECK_SCRIPT = path.join(ROOT, 'scripts', 'check-update.mjs');
const { beginRender } = require('./lib/update-state');
const { publishArtifacts } = require('./lib/publish-artifacts');
const { resolveDesignNameForInput } = require('./lib/designs');
const {
  MAX_POSTER_MEDIA_TOTAL_BYTES,
  MAX_POSTER_MEDIA_TOTAL_PIXELS,
  MAX_CARD_INPUT_JSON_BYTES,
  MAX_LOGO_BYTES,
  MAX_LOGO_DIMENSION,
  MAX_LOGO_PIXELS,
  accountUniqueImageSnapshot,
  snapshotLocalImage,
} = require('./lib/file-access');
// ── Args ──

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
card CLI — Structured rendering pipeline

Usage:
  node scripts/card.js --input <json> --output <png>
  echo '<json>' | node scripts/card.js --stdin --output <png>
  node scripts/card.js --list-designs

Options:
  --input <path>     Read JSON input from file
  --stdin            Read JSON input from stdin
  --output <path>    Output PNG path (default: ~/Downloads/card_{mode}_{ts}.png)
  --dpr <number>     Device pixel ratio (default: 2)
  --report <path>    Write a machine-readable artifact/checker report
  --checked-html-dir <directory>  Preserve the exact checked HTML for reviewed publication
  --list-designs     List all available design systems
  --help             Show this help

Stable modes: big, long, whiteboard, poster, editorial-image, article-diagram
Studio modes: infograph, comic, sketchnote (complete composition contract required)
`);
  process.exit(0);
}

// ── List designs ──

if (args.includes('--list-designs')) {
  const { listDesigns } = require('./lib/designs');
  const designs = listDesigns();
  console.log('Available design systems:\n');
  for (const d of designs) {
    console.log(`  ${d.name.padEnd(15)} surface: ${d.surface.padEnd(5)}  accent: ${d.accent}  canvas: ${d.canvas}`);
  }
  console.log(`\nTotal: ${designs.length} design systems`);
  process.exit(0);
}

const renderLease = beginRender(ROOT, process.env.CARD_SKILL_UPDATE_CHECK_CACHE || null);
if (!renderLease.ready) {
  console.error('card-skill update is still in progress; retry this render shortly.');
  process.exit(1);
}
process.once('exit', () => renderLease.end());

// Keep direct CLI use covered even when the calling agent skips the skill preflight.
// Update failures must never change the render result or stdout path contract.
const updateCheck = spawnSync(process.execPath, [UPDATE_CHECK_SCRIPT], {
  encoding: 'utf-8',
  timeout: 4000,
});
if (updateCheck.stdout?.trim()) {
  console.error(updateCheck.stdout.trim());
}

// Fail early with an actionable setup command instead of surfacing a nested
// ERR_MODULE_NOT_FOUND from the capture/output-check subprocesses.
const runtimeCheck = spawnSync(process.execPath, [SETUP_SCRIPT, '--check'], { encoding: 'utf-8' });
if (runtimeCheck.status !== 0) {
  const details = runtimeCheck.stderr || runtimeCheck.stdout || 'card-skill runtime is not ready.';
  console.error(details.trim());
  process.exit(1);
}

// ── Read input ──

let input;
const inputFile = getArg('--input');
const useStdin = args.includes('--stdin');

if (inputFile) {
  try {
    const resolvedInput = path.resolve(inputFile);
    if (fs.statSync(resolvedInput).size > MAX_CARD_INPUT_JSON_BYTES) throw new Error('Card input JSON must be at most 2 MiB');
    input = JSON.parse(fs.readFileSync(resolvedInput, 'utf-8'));
  } catch (e) {
    console.error(`Error reading input file: ${e.message}`);
    process.exit(1);
  }
} else if (useStdin) {
  try {
    const stdin = fs.readFileSync(0, 'utf-8');
    if (Buffer.byteLength(stdin) > MAX_CARD_INPUT_JSON_BYTES) throw new Error('Card stdin JSON must be at most 2 MiB');
    input = JSON.parse(stdin);
  } catch (e) {
    console.error(`Error reading stdin: ${e.message}`);
    process.exit(1);
  }
} else {
  console.error('Error: provide --input <file> or --stdin');
  process.exit(1);
}

// ── Validate ──

const { validate } = require('./lib/schema');
const result = validate(input);

if (!result.valid) {
  console.error('Validation failed:');
  result.errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

// ── Render ──

const DPR = parseFloat(getArg('--dpr')) || 2;
const outputArg = getArg('--output');
const reportArg = getArg('--report');
const checkedHtmlDirArg = getArg('--checked-html-dir');
const ts = Date.now();
const defaultOutputName = `card_${input.mode}_${ts}.png`;
const outputPath = outputArg
  ? path.resolve(outputArg)
  : path.join(require('os').homedir(), 'Downloads', defaultOutputName);

const renderers = {
  big: require('./renderers/big'),
  long: require('./renderers/long'),
  whiteboard: require('./renderers/whiteboard'),
  poster: require('./renderers/poster'),
  'editorial-image': require('./renderers/editorial-image'),
  'article-diagram': require('./renderers/article-diagram'),
  infograph: require('./renderers/studio-composition'),
  comic: require('./renderers/studio-composition'),
  sketchnote: require('./renderers/studio-composition'),
};

const renderer = renderers[input.mode];
if (!renderer) {
    console.error(`No renderer for mode "${input.mode}"`);
  process.exit(1);
}

function stagePosterMedia(cardInput, tmpDir) {
  if (cardInput.mode !== 'poster') return { input: cardInput, files: [], snapshotsByCard: [] };
  const staged = JSON.parse(JSON.stringify(cardInput));
  const files = [];
  const snapshotsByCard = [];
  let mediaIndex = 0;
  const mediaBudget = { bytes: 0, pixels: 0 };
  const budgetedSnapshots = new Set();
  for (const [cardIndex, card] of (staged.cards || []).entries()) {
    snapshotsByCard[cardIndex] = [];
    for (const element of card.body || []) {
      if (element?.type !== 'media') continue;
      const extension = path.extname(element.path).toLowerCase();
      const stagedPath = path.join(tmpDir, `media_${++mediaIndex}${extension}`);
      const snapshot = snapshotLocalImage(element.path, stagedPath);
      accountUniqueImageSnapshot(budgetedSnapshots, mediaBudget, snapshot);
      if (mediaBudget.bytes > MAX_POSTER_MEDIA_TOTAL_BYTES || mediaBudget.pixels > MAX_POSTER_MEDIA_TOTAL_PIXELS) {
        throw new Error('Poster media exceeds the 32 MiB or 40 million decoded-pixel aggregate budget');
      }
      element.path = stagedPath;
      element.mime_type = snapshot.mime_type;
      snapshotsByCard[cardIndex].push({
        sha256: snapshot.sha256,
        bytes: snapshot.bytes,
        width: snapshot.width,
        height: snapshot.height,
        mime_type: snapshot.mime_type,
      });
    }
  }
  return { input: staged, files, snapshotsByCard };
}

function stageLogo(cardInput, tmpDir) {
  if (!cardInput.logo) return { input: cardInput, snapshot: null };
  const staged = JSON.parse(JSON.stringify(cardInput));
  const extension = path.extname(staged.logo).toLowerCase();
  const stagedPath = path.join(tmpDir, `logo${extension}`);
  const snapshot = snapshotLocalImage(staged.logo, stagedPath, {
    label: 'Logo',
    maxBytes: MAX_LOGO_BYTES,
    maxDimension: MAX_LOGO_DIMENSION,
    maxPixels: MAX_LOGO_PIXELS,
  });
  return {
    input: staged,
    snapshot: {
      path: stagedPath,
      file_url: require('url').pathToFileURL(path.resolve(cardInput.logo)).href,
      data_url: `data:${snapshot.mime_type};base64,${fs.readFileSync(stagedPath).toString('base64')}`,
      sha256: snapshot.sha256,
      bytes: snapshot.bytes,
      width: snapshot.width,
      height: snapshot.height,
      mime_type: snapshot.mime_type,
    },
  };
}

let renderInput = input;
let localAssetFiles = [];
let posterMediaSnapshots = [];
let logoSnapshot = null;
const embeddedLogoHtml = new Set();
const MAX_CHECKED_HTML_BYTES = 48 * 1024 * 1024;

function embedStagedLogo(out) {
  if (!logoSnapshot || embeddedLogoHtml.has(out.htmlPath)) return false;
  const html = fs.readFileSync(out.htmlPath, 'utf8');
  const activeHtml = html.replace(/<!--[\s\S]*?-->/g, '');
  const activeReferencesLogo = activeHtml.includes(logoSnapshot.file_url)
    || activeHtml.includes(logoSnapshot.file_url.replaceAll('&', '&amp;'));
  if (!activeReferencesLogo) return false;
  const logoReferences = new Set([logoSnapshot.file_url, logoSnapshot.file_url.replaceAll('&', '&amp;')]);
  const referenceCount = [...logoReferences].reduce((sum, reference) => sum + html.split(reference).length - 1, 0);
  const estimatedBytes = Buffer.byteLength(html, 'utf8')
    + referenceCount * Math.max(0, Buffer.byteLength(logoSnapshot.data_url, 'utf8') - Buffer.byteLength(logoSnapshot.file_url, 'utf8'));
  if (estimatedBytes > MAX_CHECKED_HTML_BYTES) throw new Error('Rendered HTML exceeds the 48 MiB checked-HTML budget after logo sealing');
  const embedded = html
    .replaceAll(logoSnapshot.file_url, logoSnapshot.data_url)
    .replaceAll(logoSnapshot.file_url.replaceAll('&', '&amp;'), logoSnapshot.data_url);
  fs.writeFileSync(out.htmlPath, embedded, 'utf8');
  embeddedLogoHtml.add(out.htmlPath);
  return true;
}

function runCapture(out, pngPath) {
  const args = [
    CAPTURE_SCRIPT,
    out.htmlPath,
    pngPath,
    String(out.captureWidth),
    String(out.captureHeight),
    String(DPR),
  ];
  if (out.fullpage) args.push('fullpage');
  for (const file of localAssetFiles) args.push('--allow-file', file);
  execFileSync(process.execPath, args, { stdio: 'pipe' });
}

function runOutputCheck(out, pngPath, options = {}) {
  const args = [
    CHECK_SCRIPT,
    '--html', out.htmlPath,
    '--width', String(out.captureWidth),
    '--height', String(out.captureHeight),
    '--dpr', String(DPR),
    '--json',
  ];

  if (out.fullpage) args.push('--fullpage');
  for (const file of localAssetFiles) args.push('--allow-file', file);
  if (options.fix) args.push('--fix');
  if (options.skipPng) {
    args.push('--skip-png');
  } else {
    args.push('--png', pngPath);
  }

  const result = spawnSync(process.execPath, args, { encoding: 'utf-8' });
  let report = null;
  try {
    report = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    // Keep the original output in the error below.
  }

  if (result.status !== 0 || !report || !report.pass) {
    const details = report?.issues?.map(item => {
      const evidence = item.details && Object.keys(item.details).length ? ` ${JSON.stringify(item.details)}` : '';
      return `  - ${item.code}: ${item.message}${evidence}`;
    }).join('\n')
      || result.stderr
      || result.stdout
      || 'unknown output-check failure';
    const error = new Error(`Output check failed:\n${details}`);
    error.isOutputCheckFailure = true;
    error.report = report;
    error.outputCheckResult = result;
    throw error;
  }

  return report;
}

function captureWithOutputCheck(out, pngPath) {
  embedStagedLogo(out);
  runOutputCheck(out, pngPath, { fix: true, skipPng: true });
  runCapture(out, pngPath);

  let report = runOutputCheck(out, pngPath, { fix: true });
  if (report.fixed) {
    runCapture(out, pngPath);
    report = runOutputCheck(out, pngPath);
  }
  return report;
}

function issueCodes(error) {
  return new Set((error?.report?.issues || []).map(item => item.code));
}

function isArticleDiagramSalvageable(error) {
  const codes = issueCodes(error);
  return codes.has('article_diagram_label_collision')
    || codes.has('article_diagram_caption_layout')
    || codes.has('article_diagram_band_header_overlap')
    || /boundary-model bands:|cannot fit node/i.test(error?.message || '');
}

function cloneArticleDiagramInput(baseInput, options = {}) {
  const { aspect, salvage = {} } = options;
  const clone = JSON.parse(JSON.stringify(baseInput));
  if (aspect) clone.aspect = aspect;
  if (Object.keys(salvage).length > 0) clone.__articleDiagramSalvage = salvage;
  return clone;
}

function articleDiagramFallbackPlan(baseInput) {
  const family = baseInput.family;
  const hasTallAspect = baseInput.aspect === 'body-4-3';
  const attempts = [{ label: 'base', input: cloneArticleDiagramInput(baseInput) }];

  if (family === 'concept-map') {
    attempts.push(
      { label: 'concept-one-label', input: cloneArticleDiagramInput(baseInput, { salvage: { linkLabelLimit: 1 } }) },
      { label: 'concept-no-labels', input: cloneArticleDiagramInput(baseInput, { salvage: { hideLinkLabels: true } }) },
    );
    if (!hasTallAspect) {
      attempts.push(
        { label: 'concept-tall-one-label', input: cloneArticleDiagramInput(baseInput, { aspect: 'body-4-3', salvage: { linkLabelLimit: 1 } }) },
        { label: 'concept-tall-no-labels', input: cloneArticleDiagramInput(baseInput, { aspect: 'body-4-3', salvage: { hideLinkLabels: true } }) },
      );
    }
  } else if (family === 'boundary-model') {
    attempts.push(
      { label: 'boundary-compact', input: cloneArticleDiagramInput(baseInput, { salvage: { boundaryCompactLevel: 1 } }) },
      { label: 'boundary-more-compact', input: cloneArticleDiagramInput(baseInput, { salvage: { boundaryCompactLevel: 2 } }) },
    );
    if (!hasTallAspect) {
      attempts.push(
        { label: 'boundary-tall-compact', input: cloneArticleDiagramInput(baseInput, { aspect: 'body-4-3', salvage: { boundaryCompactLevel: 1 } }) },
        { label: 'boundary-tall-more-compact', input: cloneArticleDiagramInput(baseInput, { aspect: 'body-4-3', salvage: { boundaryCompactLevel: 2 } }) },
      );
    }
  } else if (family === 'process-flow') {
    attempts.push({ label: 'process-caption-compact', input: cloneArticleDiagramInput(baseInput, { salvage: { captionCompact: true } }) });
    if (!hasTallAspect) {
      attempts.push({ label: 'process-tall-caption-compact', input: cloneArticleDiagramInput(baseInput, { aspect: 'body-4-3', salvage: { captionCompact: true } }) });
    }
  }

  const seen = new Set();
  return attempts.filter((attempt) => {
    const key = JSON.stringify({
      aspect: attempt.input.aspect || '',
      salvage: attempt.input.__articleDiagramSalvage || {},
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderSingleOutput(cardInput, htmlPath, measureHtmlPath) {
  if (cardInput.mode === 'article-diagram'
      && typeof renderer.renderMeasure === 'function') {
    const measureOut = renderer.renderMeasure(cardInput, measureHtmlPath);
    if (measureOut) {
      const measureResult = spawnSync(process.execPath, [
        CAPTURE_SCRIPT,
        measureOut.htmlPath,
        '--measure',
        String(measureOut.captureWidth),
        String(measureOut.captureHeight),
        String(DPR),
      ], { encoding: 'utf-8' });

      if (measureResult.status !== 0) {
        throw new Error(`Measure pass failed: ${measureResult.stderr || measureResult.stdout}`);
      }

      let bboxes;
      try {
        bboxes = JSON.parse(measureResult.stdout);
      } catch (e) {
        throw new Error(`Measure pass returned invalid JSON: ${e.message}`);
      }

      let positions;
      if (!cardInput.family && typeof renderer.layoutFormulaCard === 'function') {
        positions = renderer.layoutFormulaCard(cardInput, bboxes);
      } else {
        const aspectKey = renderer.defaultAspect(cardInput);
        const aspect = renderer.ASPECTS[aspectKey];
        if (cardInput.family === 'concept-map') {
          positions = renderer.layoutConceptMap(cardInput, bboxes, aspect);
        } else if (cardInput.family === 'boundary-model') {
          positions = renderer.layoutBoundaryModel(cardInput, bboxes, aspect);
        }
      }

      return renderer.render(cardInput, htmlPath, positions);
    }
  }

  return renderer.render(cardInput, htmlPath);
}

function renderArticleDiagramEntries(baseInput, tmpDir) {
  let lastError = null;
  const attempts = articleDiagramFallbackPlan(baseInput);

  for (const [index, attempt] of attempts.entries()) {
    const suffix = index === 0 ? '' : `_${index}`;
    const htmlPath = path.join(tmpDir, `card_${baseInput.mode}${suffix}.html`);
    const measureHtmlPath = path.join(tmpDir, `card_${baseInput.mode}_measure${suffix}.html`);

    try {
      const rendered = renderSingleOutput(attempt.input, htmlPath, measureHtmlPath);
      const outputs = Array.isArray(rendered) ? rendered : [rendered];
      const entries = outputs.map((out, outputIndex) => {
        const stagedName = outputs.length === 1
          ? 'card.png'
          : `card_${outputIndex + 1}.png`;
        return {
          out,
          stagedPath: path.join(tmpDir, stagedName),
          effectiveContract: attempt.input,
        };
      });
      for (const entry of entries) {
        entry.checker = captureWithOutputCheck(entry.out, entry.stagedPath);
      }
      return entries;
    } catch (error) {
      lastError = error;
      if (!isArticleDiagramSalvageable(error)) throw error;
    }
  }

  throw lastError;
}

function pngMetadata(pngPath) {
  const data = fs.readFileSync(pngPath);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function artifactReport(out, stagedPath, finalPath, checker, index, effectiveContract) {
  let checkedHtml = null;
  if (checkedHtmlDirArg) {
    fs.mkdirSync(path.resolve(checkedHtmlDirArg), { recursive: true });
    const checkedHtmlPath = path.join(path.resolve(checkedHtmlDirArg), `${path.basename(finalPath, '.png')}.checked.html`);
    fs.copyFileSync(out.htmlPath, checkedHtmlPath);
    checkedHtml = { path: checkedHtmlPath };
  }
  return {
    index,
    path: path.resolve(finalPath),
    basename: path.basename(finalPath),
    ...pngMetadata(stagedPath),
    capture: {
      width: out.captureWidth,
      height: out.captureHeight,
      dpr: DPR,
      fullpage: Boolean(out.fullpage),
    },
    checked_html: checkedHtml,
    checker: {
      pass: checker.pass,
      issues: checker.issues,
    },
    effective_contract: effectiveContract,
    logo_snapshot: embeddedLogoHtml.has(out.htmlPath) ? {
      sha256: logoSnapshot.sha256,
      bytes: logoSnapshot.bytes,
      width: logoSnapshot.width,
      height: logoSnapshot.height,
      mime_type: logoSnapshot.mime_type,
    } : null,
  };
}

function publishCardArtifacts(entries, artifacts, tmpDir) {
  const commitSet = [...entries];
  if (reportArg) {
    const stagedReport = path.join(tmpDir, 'card-report.json');
    const report = {
      schema_version: 1,
      mode: input.mode,
      tone: input.tone || input.editorial_tone || null,
      resolved_design: resolveDesignNameForInput(input),
      artifacts,
    };
    fs.writeFileSync(stagedReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    commitSet.push({ stagedPath: stagedReport, finalPath: path.resolve(reportArg) });
  }
  publishArtifacts(commitSet, { allowOverwrite: true });
}

let runTmpDir = null;
let renderSucceeded = false;

try {
  runTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-'));
  if (input.mode === 'poster') {
    const stagedMedia = stagePosterMedia(input, runTmpDir);
    renderInput = stagedMedia.input;
    posterMediaSnapshots = stagedMedia.snapshotsByCard;
  }
  const stagedLogo = stageLogo(renderInput, runTmpDir);
  renderInput = stagedLogo.input;
  logoSnapshot = stagedLogo.snapshot;

  // poster mode returns array; others return single object
  if (input.mode === 'poster') {
    const outputs = renderer.render(renderInput, runTmpDir);
    const pngPaths = [];
    const publishEntries = [];
    const artifactReports = [];

    outputs.forEach((out, i) => {
      const pngName = outputs.length === 1
        ? path.basename(outputPath)
        : path.basename(outputPath, '.png') + `_${i + 1}.png`;
      const pngPath = outputs.length === 1
        ? outputPath
        : path.join(path.dirname(outputPath), pngName);
      const stagedPath = path.join(runTmpDir, `card_${i + 1}.png`);

      const checker = captureWithOutputCheck(out, stagedPath);
      pngPaths.push(pngPath);
      publishEntries.push({ stagedPath, finalPath: pngPath });
      const report = artifactReport(out, stagedPath, pngPath, checker, i + 1, input);
      report.media_snapshots = posterMediaSnapshots[i] || [];
      artifactReports.push(report);
    });

    publishCardArtifacts(publishEntries, artifactReports, runTmpDir);
    pngPaths.forEach((pngPath, i) => console.error(`  Card ${i + 1}/${pngPaths.length}: ${pngPath}`));
    console.log(pngPaths.join('\n'));
  } else {
    const htmlFileName = `card_${input.mode}.html`;
    const htmlPath = path.join(runTmpDir, htmlFileName);
    const stagedPath = path.join(runTmpDir, 'card.png');

    if (input.mode === 'article-diagram') {
      const entries = renderArticleDiagramEntries(input, runTmpDir);
      const pngPaths = entries.map((entry, i) => {
        if (entries.length === 1) return outputPath;
        const pngName = path.basename(outputPath, '.png') + `_${i + 1}.png`;
        return path.join(path.dirname(outputPath), pngName);
      });

      const artifactReports = entries.map((entry, i) =>
        artifactReport(entry.out, entry.stagedPath, pngPaths[i], entry.checker, i + 1, entry.effectiveContract));
      publishCardArtifacts(
        entries.map((entry, i) => ({ stagedPath: entry.stagedPath, finalPath: pngPaths[i] })),
        artifactReports,
        runTmpDir,
      );
      if (entries.length > 1) {
        pngPaths.forEach((pngPath, i) => console.error(`  Diagram ${i + 1}/${pngPaths.length}: ${pngPath}`));
      }
      console.log(pngPaths.join('\n'));
    } else {
      const measureHtmlPath = path.join(runTmpDir, `card_${input.mode}_measure.html`);
      const out = renderSingleOutput(input, htmlPath, measureHtmlPath);
      const checker = captureWithOutputCheck(out, stagedPath);
      publishCardArtifacts(
        [{ stagedPath, finalPath: outputPath }],
        [artifactReport(out, stagedPath, outputPath, checker, 1, input)],
        runTmpDir,
      );
      console.log(outputPath);
    }
  }
  renderSucceeded = true;
} catch (e) {
  console.error(`Render failed: ${e.message}`);
  if (e.stderr) console.error(e.stderr.toString());
  process.exitCode = 1;
} finally {
  try {
    if (runTmpDir) fs.rmSync(runTmpDir, { recursive: true, force: true });
  } catch (cleanupError) {
    console.error(`Warning: could not remove temporary directory ${runTmpDir}: ${cleanupError.message}`);
  }
  renderLease.end();
}

if (renderSucceeded) {
  if (process.env.CARD_SKILL_AUTO_UPDATE_FOREGROUND === '1') {
    const autoUpdate = spawnSync(process.execPath, [UPDATE_CHECK_SCRIPT, '--auto-update'], {
      encoding: 'utf-8',
      timeout: 15 * 60 * 1000,
    });
    const autoUpdateOutput = [autoUpdate.stdout, autoUpdate.stderr]
      .filter(value => value?.trim())
      .join('\n')
      .trim();
    if (autoUpdateOutput) console.error(autoUpdateOutput);
  } else {
    try {
      const autoUpdate = spawn(process.execPath, [UPDATE_CHECK_SCRIPT, '--auto-update'], {
        cwd: os.homedir(),
        detached: true,
        env: { ...process.env, CARD_SKILL_CALLER_CWD: process.cwd() },
        stdio: 'ignore',
      });
      autoUpdate.unref();
    } catch {
      // Rendering is already complete; a later request can retry the update.
    }
  }
}
