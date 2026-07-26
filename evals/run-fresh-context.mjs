#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NESTED_PACKAGE = path.join(ROOT, 'plugins', 'card-skill', 'skills', 'card-skill');
const PACKAGED_SOURCE = fs.existsSync(path.join(NESTED_PACKAGE, 'SKILL.md')) ? NESTED_PACKAGE : ROOT;
const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'agent-cases.json'), 'utf8')).cases;

function arg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} exited ${result.status}`);
  }
  return result;
}

function promptFor(testCase) {
  return [
    'You are evaluating card-skill from a completely fresh context.',
    'Read SKILL.md, references/visual-job.md, and schemas/visual-job.json in the current directory before deciding.',
    'After choosing a mode, read its references/mode-*.md file and obey that mode-specific composition, font, and fit contract.',
    'Do not render, edit files, browse, or use prior conversation context.',
    'Return only one Visual Job JSON object that can be validated and rendered by this installed skill.',
    `Set job_id exactly to "${testCase.id}".`,
    `The requested publish target is "${testCase.publish_target}".`,
    testCase.request,
    '',
    'SOURCE (the only factual source you may use):',
    testCase.source_text,
    '',
    'Preserve source boundaries. Do not invent facts, quotes, authors, metrics, or provider identity.',
  ].join('\n');
}

function parseAnswer(raw) {
  const trimmed = raw.trim();
  try {
    return { value: JSON.parse(trimmed), normalized: false };
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return { value: JSON.parse(fenced), normalized: true };
    const start = trimmed.indexOf('{');
    if (start >= 0) {
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let index = start; index < trimmed.length; index += 1) {
        const char = trimmed[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') quoted = true;
        else if (char === '{' || char === '[') depth += 1;
        else if (char === '}' || char === ']') depth -= 1;
        if (depth === 0) {
          const candidate = trimmed.slice(start, index + 1);
          return { value: JSON.parse(candidate), normalized: true };
        }
      }
    }
    throw new Error('Fresh agent did not return a JSON object');
  }
}

const requestedCase = arg('--case');
const reportPath = arg('--report');
if (process.argv.includes('--print-package-source')) {
  process.stdout.write(`${PACKAGED_SOURCE}\n`);
  process.exit(0);
}
const selected = requestedCase ? cases.filter(item => item.id === requestedCase) : cases;
if (!selected.length) throw new Error(`Unknown fresh-context case: ${requestedCase}`);
if (!fs.existsSync(path.join(PACKAGED_SOURCE, 'SKILL.md'))) {
  throw new Error('Packaged skill is missing; run npm run package-skill first');
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-fresh-context-'));
const results = [];
try {
  const installed = path.join(temp, 'installed', 'card-skill');
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.cpSync(PACKAGED_SOURCE, installed, { recursive: true, dereference: false });
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {
    cwd: installed,
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  });
  run(process.execPath, [path.join(installed, 'scripts', 'setup-runtime.mjs')], {
    cwd: installed,
    env: { ...process.env, CARD_SKILL_DISABLE_UPDATE_CHECK: '1' },
  });
  const installedPlaywright = fs.realpathSync(path.join(installed, 'node_modules', 'playwright'));
  assert.ok(
    installedPlaywright.startsWith(`${fs.realpathSync(installed)}${path.sep}`),
    `isolated runtime resolved Playwright outside install root: ${installedPlaywright}`,
  );

  for (const testCase of selected) {
    const caseRoot = path.join(temp, testCase.id);
    const answerPath = path.join(caseRoot, 'answer.json');
    const outputDir = path.join(caseRoot, 'rendered');
    fs.mkdirSync(caseRoot, { recursive: true });

    run('codex', [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--sandbox', 'read-only',
      '--skip-git-repo-check',
      '--cd', installed,
      '--output-last-message', answerPath,
      promptFor(testCase),
    ], {
      cwd: installed,
      env: { ...process.env, CARD_SKILL_DISABLE_UPDATE_CHECK: '1' },
    });

    const parsedAnswer = parseAnswer(fs.readFileSync(answerPath, 'utf8'));
    const job = parsedAnswer.value;
    fs.writeFileSync(answerPath, `${JSON.stringify(job, null, 2)}\n`);
    try {
      run(process.execPath, [
        path.join(installed, 'evals', 'check-job-assertions.mjs'),
        answerPath,
        '--case', testCase.id,
      ], { cwd: installed });
    } catch (error) {
      throw new Error(`${testCase.id}: ${error.message}\nVisual Job: ${JSON.stringify(job)}`);
    }

    let rendered;
    try {
      rendered = run(process.execPath, [
        path.join(installed, 'scripts', 'render-job.mjs'),
        '--input', answerPath,
        '--output-dir', outputDir,
        '--json',
      ], {
        cwd: installed,
        env: {
          ...process.env,
          CARD_SKILL_DISABLE_UPDATE_CHECK: '1',
          CARD_SKILL_DISABLE_AUTO_UPDATE: '1',
        },
      });
    } catch (error) {
      throw new Error(`${testCase.id}: ${error.message}\nVisual Job: ${JSON.stringify(job)}`);
    }
    const publication = JSON.parse(rendered.stdout);
    const expectedArtifacts = testCase.artifact_outputs || testCase.outputs;
    assert.ok(
      publication.outputs.length >= expectedArtifacts[0] && publication.outputs.length <= expectedArtifacts[1],
      `${testCase.id} published ${publication.outputs.length} artifacts; expected ${expectedArtifacts.join('..')}`,
    );
    const receipts = publication.outputs.map(basename => (
      JSON.parse(fs.readFileSync(path.join(outputDir, `${path.basename(basename, '.png')}.receipt.json`), 'utf8'))
    ));
    assert.ok(receipts.every(item => item.job_success && item.checker?.pass), `${testCase.id} has a failed receipt`);

    results.push({
      id: testCase.id,
      pass: true,
      tier: job.decision.tier,
      mode: job.decision.mode,
      visual_job_outputs: job.outputs.length,
      rendered_artifacts: publication.outputs.length,
      checker_pass: true,
      answer_normalized: parsedAnswer.normalized,
    });
    process.stderr.write(`fresh-context pass: ${testCase.id}\n`);
  }

  const report = {
    schema_version: 1,
    level: 'L1',
    installed_runtime: 'isolated-temp-install',
    package_source: path.relative(ROOT, PACKAGED_SOURCE),
    cases: results,
    summary: {
      passed: results.length,
      failed: 0,
      l2_maintainer_judgment: false,
      l3_real_user_evidence: false,
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) fs.writeFileSync(path.resolve(reportPath), serialized);
  process.stdout.write(serialized);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
