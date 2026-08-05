#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  acquireUpdateLock,
  activeRenderPids,
  beginRender,
  defaultCachePath,
  installationIdentity,
  normalizedRoot,
} = require('./lib/update-state');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = normalizedRoot(path.resolve(__dirname, '..'));
const DEFAULT_RELEASE_URL = 'https://api.github.com/repos/KKenny0/card-skill/releases/latest';
const SKILLS_SOURCE = 'KKenny0/card-skill/plugins/card-skill/skills/card-skill';
const SKILLS_CLI_VERSION = '1.5.19';
const DISABLE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const SETUP_TIMEOUT_MS = 10 * 60 * 1000;

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function parseVersion(value) {
  const match = normalizeVersion(value).match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readVersion(root = ROOT) {
  try {
    return normalizeVersion(fs.readFileSync(path.join(root, 'VERSION'), 'utf8'));
  } catch {
    return '';
  }
}

function readCache(cachePath) {
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(cachePath, value) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 });
    try {
      fs.renameSync(temporaryPath, cachePath);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
      fs.rmSync(cachePath, { force: true });
      fs.renameSync(temporaryPath, cachePath);
    }
    return true;
  } catch {
    return false;
  }
}

function parseRelease(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    const release = JSON.parse(text);
    if (release?.draft || release?.prerelease) return null;
    const version = normalizeVersion(release?.tag_name);
    if (!parseVersion(version)) return null;
    const commit = /^[0-9a-f]{40}$/i.test(String(release.commit_sha || ''))
      ? String(release.commit_sha).toLowerCase()
      : null;
    return { version, tag: String(release.tag_name), commit };
  } catch {
    const version = normalizeVersion(text);
    return parseVersion(version) ? { version, tag: `v${version}`, commit: null } : null;
  }
}

async function fetchLatestRelease(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' },
    redirect: 'follow',
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) return null;
  const release = parseRelease(await response.text());
  if (!release || release.commit) return release;
  if (!/^https:\/\/api\.github\.com\/repos\/KKenny0\/card-skill\/releases\//i.test(url)) return release;
  const commitResponse = await fetch(
    `https://api.github.com/repos/KKenny0/card-skill/commits/${encodeURIComponent(release.tag)}`,
    {
      headers: { Accept: 'application/vnd.github+json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(3000),
    },
  );
  if (!commitResponse.ok) return null;
  const commit = await commitResponse.json();
  if (!/^[0-9a-f]{40}$/i.test(String(commit?.sha || ''))) return null;
  return { ...release, commit: String(commit.sha).toLowerCase() };
}

function updateCommands(releaseTag = '<release-tag>', releaseCommit = '<release-commit>') {
  return {
    skills: `npx --yes --package skills@${SKILLS_CLI_VERSION} -- skills add ${SKILLS_SOURCE}#${releaseTag} --skill card-skill -g -y`,
    codex: `codex plugin marketplace upgrade card-skill && verify ${releaseTag} at ${releaseCommit} && codex plugin add card-skill@card-skill`,
    claude: 'claude plugin marketplace update card-skill && claude plugin update card-skill@card-skill',
  };
}

function formatUpdateMessage(release, currentVersion) {
  const commands = updateCommands(release.tag, release.commit || '<release-commit>');
  return [
    `card-skill v${release.version} is available (you have v${currentVersion}).`,
    `Exact npx skills update: ${commands.skills}`,
    `Codex installs update automatically from the matching ${release.tag} release.`,
    `Claude Code update: ${commands.claude}`,
  ].join('\n');
}

function normalizedPath(value) {
  return path.resolve(value).replaceAll('\\', '/');
}

function resolveInstaller(root = ROOT) {
  const value = normalizedPath(root);
  const claudePluginRoots = [
    process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR,
    process.env.CLAUDE_CONFIG_DIR && path.join(process.env.CLAUDE_CONFIG_DIR, 'plugins'),
    path.join(os.homedir(), '.claude', 'plugins'),
  ].filter(Boolean).map(normalizedPath);
  const isClaudeCache = value.includes('/.claude/plugins/cache/')
    || claudePluginRoots.some(candidate => value.startsWith(`${candidate}/cache/`));
  if (
    isClaudeCache
    && /\/plugins\/cache\/card-skill\/card-skill\/[^/]+\/skills\/card-skill\/?$/i.test(value)
  ) {
    return 'claude';
  }
  if (
    /\/plugins\/cache\/card-skill\/card-skill\/[^/]+\/skills\/card-skill\/?$/i.test(value)
    || /\/marketplaces\/card-skill\/(?:plugins\/card-skill\/)?skills\/card-skill\/?$/i.test(value)
  ) {
    return 'codex';
  }
  if ([
    '/.agents/skills/',
    '/.claude/skills/',
    '/.cursor/skills/',
    '/.windsurf/skills/',
    '/.config/agents/skills/',
  ].some(marker => value.includes(marker))) {
    return 'skills';
  }
  return null;
}

function resolveInstallContext(root = ROOT) {
  const installer = resolveInstaller(root);
  if (installer !== 'skills') return { installer, scope: installer ? 'global' : null, projectRoot: null };
  const value = normalizedPath(root);
  const projectMatch = value.match(/^(.*)\/\.agents\/skills\/card-skill\/?$/i);
  const home = normalizedPath(os.homedir());
  if (projectMatch && normalizedPath(projectMatch[1]) !== home) {
    return { installer, scope: 'project', projectRoot: path.normalize(projectMatch[1]) };
  }
  return { installer, scope: 'global', projectRoot: null };
}

function isSourceCheckout(root = ROOT) {
  if (resolveInstaller(root)) return false;
  let current = path.resolve(root);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function isTemporaryPath(root = ROOT) {
  const temporaryRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  return path.resolve(root).startsWith(temporaryRoot);
}

function isPathInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safePathDirectories(root = ROOT) {
  const candidates = [
    path.dirname(process.execPath),
    ...(process.env.PATH || '').split(path.delimiter),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ];
  const callerCwd = process.env.CARD_SKILL_CALLER_CWD || process.cwd();
  const unsafeRoots = [path.resolve(root), path.resolve(callerCwd), path.resolve(os.tmpdir())];
  return [...new Set(candidates)]
    .filter(candidate => candidate && path.isAbsolute(candidate))
    .map(candidate => path.resolve(candidate))
    .filter(candidate => !candidate.includes(`${path.sep}node_modules${path.sep}`))
    .filter(candidate => !unsafeRoots.some(unsafe => isPathInside(candidate, unsafe)));
}

function resolveExecutable(name, root = ROOT) {
  const executableName = process.platform === 'win32' && !name.endsWith('.exe') ? `${name}.exe` : name;
  for (const directory of safePathDirectories(root)) {
    const candidate = path.join(directory, executableName);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const resolved = fs.realpathSync.native(candidate);
      if (isPathInside(resolved, root) || isPathInside(resolved, os.tmpdir())) continue;
      return resolved;
    } catch {}
  }
  return null;
}

function resolveNpx(root = ROOT) {
  const name = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const adjacent = path.join(path.dirname(process.execPath), name);
  try {
    fs.accessSync(adjacent, fs.constants.X_OK);
    return fs.realpathSync.native(adjacent);
  } catch {
    return resolveExecutable('npx', root);
  }
}

function sanitizedEnvironment(root = ROOT) {
  const environment = {};
  for (const key of [
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'SystemRoot',
    'ComSpec',
    'TMPDIR',
    'TMP',
    'TEMP',
    'XDG_CACHE_HOME',
    'CODEX_HOME',
    'LANG',
    'LC_ALL',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
  ]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  environment.PATH = safePathDirectories(root).join(path.delimiter);
  environment.npm_config_registry = 'https://registry.npmjs.org';
  environment.npm_config_audit = 'false';
  environment.npm_config_fund = 'false';
  return environment;
}

function runCommand(command, args, { root = ROOT, cachePath, cwd: requestedCwd = null, timeout = COMMAND_TIMEOUT_MS } = {}) {
  const cwd = requestedCwd || path.dirname(cachePath || defaultCachePath(root));
  fs.mkdirSync(cwd, { recursive: true });
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: sanitizedEnvironment(root),
    maxBuffer: 5 * 1024 * 1024,
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `${path.basename(command)} exited with status ${result.status}`).trim(),
    };
  }
  return { ok: true, stdout: result.stdout, stderr: result.stderr };
}

function parseJsonOutput(value) {
  try {
    return JSON.parse(String(value || '').trim());
  } catch {
    return null;
  }
}

function marketplaceRootFromList(value) {
  const parsed = parseJsonOutput(value);
  return parsed?.marketplaces?.find(item => item?.name === 'card-skill')?.root || null;
}

function resolveCodexUpdatedRoot(root, version, marketplaceRoot = null) {
  const value = normalizedPath(root);
  const match = value.match(/^(.*\/plugins\/cache\/card-skill\/card-skill\/)[^/]+(\/skills\/card-skill)\/?$/i);
  if (match) return path.normalize(`${match[1]}${version}${match[2]}`);
  if (marketplaceRoot) return path.join(marketplaceRoot, 'plugins', 'card-skill', 'skills', 'card-skill');
  return root;
}

function ensureRuntime(root, cachePath) {
  const setupScript = path.join(root, 'scripts', 'setup-runtime.mjs');
  if (!fs.existsSync(setupScript)) return { ok: false, error: `updated runtime is missing ${setupScript}` };
  const setup = runCommand(process.execPath, [setupScript, '--refresh'], { root, cachePath, timeout: SETUP_TIMEOUT_MS });
  if (!setup.ok) return setup;
  return runCommand(process.execPath, [setupScript, '--check'], { root, cachePath, timeout: COMMAND_TIMEOUT_MS });
}

function hashSkillTree(root) {
  const hash = crypto.createHash('sha256');
  const excludedDirectories = new Set(['.git', 'node_modules']);
  const excludedFiles = new Set(['.DS_Store', 'metadata.json']);
  function visit(directory, prefix = '') {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => !excludedDirectories.has(entry.name))
      .filter(entry => !excludedFiles.has(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const entryPath = path.join(directory, entry.name);
      hash.update(relative);
      if (entry.isDirectory()) {
        hash.update('directory');
        visit(entryPath, relative);
      } else if (entry.isSymbolicLink()) {
        hash.update(`symlink:${fs.readlinkSync(entryPath)}`);
      } else {
        hash.update('file');
        hash.update(fs.readFileSync(entryPath));
      }
    }
  }
  visit(root);
  return hash.digest('hex');
}

function prepareReleaseSnapshot({ git, root, cachePath, release }) {
  const snapshotRoot = path.join(path.dirname(cachePath), 'release-snapshot');
  fs.rmSync(snapshotRoot, { recursive: true, force: true });
  let result = runCommand(git, [
    'clone', '--depth', '1', '--branch', release.tag, '--filter=blob:none',
    'https://github.com/KKenny0/card-skill.git', snapshotRoot,
  ], { root, cachePath });
  if (!result.ok) return { ...result, snapshotRoot };
  result = runCommand(git, ['-C', snapshotRoot, 'rev-parse', 'HEAD'], { root, cachePath });
  if (!result.ok) return { ...result, snapshotRoot };
  const resolvedCommit = String(result.stdout || '').trim().toLowerCase();
  if (resolvedCommit !== release.commit.toLowerCase()) {
    return { ok: false, error: `${release.tag} resolved to ${resolvedCommit || 'unknown'}, expected ${release.commit}`, snapshotRoot };
  }
  const skillRoot = path.join(snapshotRoot, 'plugins', 'card-skill', 'skills', 'card-skill');
  if (readVersion(skillRoot) !== release.version) {
    return { ok: false, error: `${release.tag} does not contain VERSION ${release.version}`, snapshotRoot };
  }
  return { ok: true, snapshotRoot, skillRoot, hash: hashSkillTree(skillRoot) };
}

function createRollbackCopy(root, backupRoot) {
  fs.rmSync(backupRoot, { recursive: true, force: true });
  fs.cpSync(root, backupRoot, { recursive: true, dereference: false });
}

function restoreRollbackCopy(root, backupRoot) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(backupRoot, root, { recursive: true, dereference: false });
  fs.rmSync(backupRoot, { recursive: true, force: true });
}

function executeSkillsUpdate({ root, cachePath, release, scope = 'global', projectRoot = null }) {
  const npx = resolveNpx(root);
  const git = resolveExecutable('git', root);
  if (!npx || !git) return { ok: false, error: 'trusted npx and git executables are required for skill updates' };
  const snapshot = prepareReleaseSnapshot({ git, root, cachePath, release });
  if (!snapshot.ok) {
    fs.rmSync(snapshot.snapshotRoot, { recursive: true, force: true });
    return snapshot;
  }
  const source = `${SKILLS_SOURCE}#${release.tag}`;
  const backupRoot = path.join(path.dirname(cachePath), 'rollback-root');
  try {
    createRollbackCopy(root, backupRoot);
  } catch (error) {
    fs.rmSync(snapshot.snapshotRoot, { recursive: true, force: true });
    return { ok: false, error: `could not create rollback copy: ${error.message}` };
  }

  const restore = error => {
    let message;
    try {
      restoreRollbackCopy(root, backupRoot);
      message = `${error}; previous installation restored`;
    } catch (restoreError) {
      message = `${error}; rollback failed: ${restoreError.message}`;
    } finally {
      fs.rmSync(snapshot.snapshotRoot, { recursive: true, force: true });
    }
    return { ok: false, error: message };
  };

  const scopeArgs = scope === 'project' ? ['-y'] : ['-g', '-y'];
  const result = runCommand(npx, [
    '--yes',
    '--package', `skills@${SKILLS_CLI_VERSION}`,
    '--', 'skills', 'add', source,
    '--skill', 'card-skill',
    ...scopeArgs,
  ], { root, cachePath, cwd: projectRoot });
  if (!result.ok) return restore(result.error);
  if (readVersion(root) !== release.version) {
    return restore(`installer exited successfully but ${root}/VERSION is not ${release.version}`);
  }
  if (hashSkillTree(root) !== snapshot.hash) {
    return restore(`installed skill contents did not match release commit ${release.commit}`);
  }
  const runtime = ensureRuntime(root, cachePath);
  if (!runtime.ok) return restore(runtime.error);
  fs.rmSync(backupRoot, { recursive: true, force: true });
  fs.rmSync(snapshot.snapshotRoot, { recursive: true, force: true });
  return { ok: true, installedRoot: root, installedVersion: release.version };
}

function checkoutCodexRelease({ git, marketplaceRoot, releaseTag, releaseCommit = null, root, cachePath }) {
  let result = runCommand(git, ['-C', marketplaceRoot, 'fetch', '--force', 'origin', `refs/tags/${releaseTag}:refs/tags/${releaseTag}`], { root, cachePath });
  if (!result.ok) return result;
  result = runCommand(git, ['-C', marketplaceRoot, 'rev-parse', `${releaseTag}^{commit}`], { root, cachePath });
  if (!result.ok) return result;
  const resolvedCommit = String(result.stdout || '').trim().toLowerCase();
  if (releaseCommit && resolvedCommit !== releaseCommit.toLowerCase()) {
    return { ok: false, error: `${releaseTag} resolved to ${resolvedCommit || 'unknown'}, expected ${releaseCommit}` };
  }
  return runCommand(git, ['-C', marketplaceRoot, 'checkout', '--detach', releaseCommit || resolvedCommit], { root, cachePath });
}

function restoreCodexVersion({ codex, git, marketplaceRoot, currentVersion, root, cachePath }) {
  const releaseTag = `v${normalizeVersion(currentVersion)}`;
  const checkout = checkoutCodexRelease({ git, marketplaceRoot, releaseTag, root, cachePath });
  if (!checkout.ok) return checkout;
  return runCommand(codex, ['plugin', 'add', 'card-skill@card-skill', '--json'], { root, cachePath });
}

function executeCodexUpdate({ root, cachePath, release, currentVersion }) {
  const codex = resolveExecutable('codex', root);
  const git = resolveExecutable('git', root);
  if (!codex || !git) return { ok: false, error: 'trusted codex and git executables are required for plugin updates' };

  let result = runCommand(codex, ['plugin', 'marketplace', 'upgrade', 'card-skill', '--json'], { root, cachePath });
  if (!result.ok) return result;
  result = runCommand(codex, ['plugin', 'marketplace', 'list', '--json'], { root, cachePath });
  if (!result.ok) return result;
  const marketplaceRoot = marketplaceRootFromList(result.stdout);
  if (!marketplaceRoot || !fs.existsSync(marketplaceRoot)) {
    return { ok: false, error: 'card-skill marketplace root was not reported by Codex' };
  }

  result = checkoutCodexRelease({ git, marketplaceRoot, releaseTag: release.tag, releaseCommit: release.commit, root, cachePath });
  if (!result.ok) return result;
  if (readVersion(marketplaceRoot) !== release.version) {
    return { ok: false, error: `marketplace tag ${release.tag} does not contain VERSION ${release.version}` };
  }
  const expectedSkillRoot = path.join(marketplaceRoot, 'plugins', 'card-skill', 'skills', 'card-skill');
  const expectedHash = hashSkillTree(expectedSkillRoot);

  result = runCommand(codex, ['plugin', 'add', 'card-skill@card-skill', '--json'], { root, cachePath });
  if (!result.ok) {
    const rollback = restoreCodexVersion({ codex, git, marketplaceRoot, currentVersion, root, cachePath });
    return { ok: false, error: `${result.error}; rollback ${rollback.ok ? 'succeeded' : `failed: ${rollback.error}`}` };
  }
  result = runCommand(codex, ['plugin', 'list', '--marketplace', 'card-skill', '--json'], { root, cachePath });
  if (!result.ok) {
    const rollback = restoreCodexVersion({ codex, git, marketplaceRoot, currentVersion, root, cachePath });
    return { ok: false, error: `${result.error}; rollback ${rollback.ok ? 'succeeded' : `failed: ${rollback.error}`}` };
  }
  const installed = parseJsonOutput(result.stdout)?.installed?.find(item => item?.pluginId === 'card-skill@card-skill');
  if (normalizeVersion(installed?.version) !== release.version) {
    const rollback = restoreCodexVersion({ codex, git, marketplaceRoot, currentVersion, root, cachePath });
    return { ok: false, error: `Codex reports card-skill ${installed?.version || 'unknown'} after installing ${release.tag}; rollback ${rollback.ok ? 'succeeded' : `failed: ${rollback.error}`}` };
  }

  const installedRoot = resolveCodexUpdatedRoot(root, release.version, marketplaceRoot);
  if (readVersion(installedRoot) !== release.version) {
    const rollback = restoreCodexVersion({ codex, git, marketplaceRoot, currentVersion, root, cachePath });
    return { ok: false, error: `installed Codex skill root does not contain VERSION ${release.version}: ${installedRoot}; rollback ${rollback.ok ? 'succeeded' : `failed: ${rollback.error}`}` };
  }
  if (hashSkillTree(installedRoot) !== expectedHash) {
    const rollback = restoreCodexVersion({ codex, git, marketplaceRoot, currentVersion, root, cachePath });
    return { ok: false, error: `installed Codex skill contents did not match release commit ${release.commit}; rollback ${rollback.ok ? 'succeeded' : `failed: ${rollback.error}`}` };
  }
  const runtime = ensureRuntime(installedRoot, cachePath);
  if (!runtime.ok) {
    const rollback = restoreCodexVersion({ codex, git, marketplaceRoot, currentVersion, root, cachePath });
    return { ok: false, error: `${runtime.error}; rollback ${rollback.ok ? 'succeeded' : `failed: ${rollback.error}`}` };
  }
  return { ok: true, installedRoot, installedVersion: release.version };
}

function executeInstallerUpdate(context) {
  if (context.installer === 'skills') return executeSkillsUpdate(context);
  if (context.installer === 'codex') return executeCodexUpdate(context);
  return { ok: false, error: 'unsupported installer' };
}

async function checkForUpdate({
  root = ROOT,
  currentVersion = null,
  releaseUrl = DEFAULT_RELEASE_URL,
  cachePath = defaultCachePath(root),
  disabled = false,
  onMessage = message => console.log(message),
} = {}) {
  if (disabled) return null;
  const resolvedCurrentVersion = normalizeVersion(currentVersion || readVersion(root));
  const cached = readCache(cachePath);
  if (
    !resolvedCurrentVersion
    || (cached?.date === today() && cached?.currentVersion === resolvedCurrentVersion)
  ) {
    return null;
  }

  writeCache(cachePath, {
    ...cached,
    date: today(),
    currentVersion: resolvedCurrentVersion,
    latestVersion: null,
    releaseTag: null,
    releaseCommit: null,
    updateAvailable: false,
  });
  const release = await fetchLatestRelease(releaseUrl);
  if (!release || compareVersions(release.version, resolvedCurrentVersion) <= 0) return null;

  writeCache(cachePath, {
    ...readCache(cachePath),
    latestVersion: release.version,
    releaseTag: release.tag,
    releaseCommit: release.commit,
    updateAvailable: true,
    autoUpdateAttemptDate: null,
  });
  const message = formatUpdateMessage(release, resolvedCurrentVersion);
  onMessage(message);
  return message;
}

async function runUpdateCheck(options = {}) {
  try {
    return await checkForUpdate(options);
  } catch {
    return null;
  }
}

function autoUpdate({
  root = ROOT,
  currentVersion = null,
  cachePath = defaultCachePath(root),
  disabled = false,
  execute = executeInstallerUpdate,
  onMessage = message => console.error(message),
} = {}) {
  if (disabled || isSourceCheckout(root) || isTemporaryPath(root)) return null;
  const installContext = resolveInstallContext(root);
  const { installer } = installContext;
  if (!installer || installer === 'claude') return null;

  const lock = acquireUpdateLock(root, cachePath);
  if (!lock) return null;
  try {
    if (activeRenderPids(root, cachePath).length > 0) return null;
    const resolvedCurrentVersion = normalizeVersion(currentVersion || readVersion(root));
    const cached = readCache(cachePath);
    const release = {
      version: normalizeVersion(cached?.latestVersion),
      tag: String(cached?.releaseTag || ''),
      commit: String(cached?.releaseCommit || ''),
    };
    if (
      !resolvedCurrentVersion
      || !parseVersion(release.version)
      || !release.tag
      || !/^[0-9a-f]{40}$/i.test(release.commit)
      || compareVersions(release.version, resolvedCurrentVersion) <= 0
      || (cached?.autoUpdateAttemptDate === today() && cached?.attemptedVersion === release.version)
    ) {
      return null;
    }

    writeCache(cachePath, {
      ...cached,
      autoUpdateAttemptDate: today(),
      attemptedVersion: release.version,
    });
    let result;
    try {
      result = execute({ ...installContext, root, cachePath, release, currentVersion: resolvedCurrentVersion });
    } catch (error) {
      result = { ok: false, error: error?.message || String(error) };
    }
    const installedVersion = normalizeVersion(result?.installedVersion || readVersion(result?.installedRoot || root));
    if (!result?.ok || installedVersion !== release.version) {
      const error = result?.error || `installed version readback was ${installedVersion || 'unavailable'}`;
      onMessage(`card-skill auto-update deferred: ${error}`);
      return false;
    }

    writeCache(cachePath, {
      ...readCache(cachePath),
      currentVersion: release.version,
      latestVersion: release.version,
      releaseTag: release.tag,
      releaseCommit: release.commit,
      updateAvailable: false,
      updatedVersion: release.version,
      updatedRoot: normalizedRoot(result?.installedRoot || root),
      updatedAt: new Date().toISOString(),
    });
    onMessage(`card-skill v${release.version} was installed and verified for the next use.`);
    return true;
  } finally {
    lock.release();
  }
}

function masterDisabled() {
  return DISABLE_VALUES.has(String(process.env.CARD_SKILL_DISABLE_UPDATE_CHECK || '').trim().toLowerCase());
}

function autoUpdateDisabled() {
  return DISABLE_VALUES.has(String(process.env.CARD_SKILL_DISABLE_AUTO_UPDATE || '').trim().toLowerCase());
}

async function main() {
  await runUpdateCheck({
    disabled: masterDisabled(),
    releaseUrl: process.env.CARD_SKILL_UPDATE_CHECK_URL || DEFAULT_RELEASE_URL,
    cachePath: process.env.CARD_SKILL_UPDATE_CHECK_CACHE || defaultCachePath(ROOT),
  });
}

async function mainAutoUpdate() {
  if (masterDisabled() || autoUpdateDisabled() || isSourceCheckout(ROOT) || isTemporaryPath(ROOT)) return;
  const cachePath = process.env.CARD_SKILL_UPDATE_CHECK_CACHE || defaultCachePath(ROOT);
  await runUpdateCheck({
    releaseUrl: process.env.CARD_SKILL_UPDATE_CHECK_URL || DEFAULT_RELEASE_URL,
    cachePath,
    onMessage: () => {},
  });
  autoUpdate({ cachePath });
}

async function selfTest() {
  assert.equal(normalizeVersion(' v0.8.0 '), '0.8.0');
  assert.deepEqual(parseVersion('v1.2.3-beta.1'), [1, 2, 3]);
  assert.equal(compareVersions('0.8.0', '0.7.0'), 1);
  const releaseCommit = '0123456789abcdef0123456789abcdef01234567';
  assert.deepEqual(parseRelease(`{"tag_name":"v0.8.0","draft":false,"prerelease":false,"commit_sha":"${releaseCommit}"}`), { version: '0.8.0', tag: 'v0.8.0', commit: releaseCommit });
  assert.equal(parseRelease('{"tag_name":"v0.8.0","prerelease":true}'), null);
  assert.equal(resolveInstaller('/opt/codex-home/plugins/cache/card-skill/card-skill/0.7.0/skills/card-skill'), 'codex');
  assert.equal(resolveInstaller('/Users/test/.claude/plugins/cache/card-skill/card-skill/0.8.0/skills/card-skill'), 'claude');
  assert.equal(resolveInstaller('/Users/test/project/.agents/skills/card-skill'), 'skills');
  assert.deepEqual(resolveInstallContext('/Users/test/.claude/plugins/cache/card-skill/card-skill/0.8.0/skills/card-skill'), { installer: 'claude', scope: 'global', projectRoot: null });
  assert.deepEqual(resolveInstallContext(path.join(os.homedir(), '.agents', 'skills', 'card-skill')), { installer: 'skills', scope: 'global', projectRoot: null });
  assert.deepEqual(resolveInstallContext('/Users/test/project/.agents/skills/card-skill'), { installer: 'skills', scope: 'project', projectRoot: path.resolve('/Users/test/project') });
  assert.notEqual(defaultCachePath('/Users/test/.agents/skills/card-skill'), defaultCachePath('/Users/test/codex/plugins/cache/card-skill/card-skill/0.7.0/skills/card-skill'));
  assert.equal(
    installationIdentity('/Users/test/codex/plugins/cache/card-skill/card-skill/0.7.0/skills/card-skill'),
    installationIdentity('/Users/test/codex/plugins/cache/card-skill/card-skill/0.8.0/skills/card-skill'),
  );
  assert.equal(
    defaultCachePath('/Users/test/codex/plugins/cache/card-skill/card-skill/0.7.0/skills/card-skill'),
    defaultCachePath('/Users/test/codex/plugins/cache/card-skill/card-skill/0.8.0/skills/card-skill'),
  );
  assert.match(updateCommands('v0.8.0', releaseCommit).skills, /skills@1\.5\.19/);
  assert.match(updateCommands('v0.8.0', releaseCommit).skills, /#v0\.8\.0 --skill card-skill/);
  assert.match(updateCommands('v0.8.0', releaseCommit).claude, /claude plugin update card-skill@card-skill/);
  assert.equal(isSourceCheckout(ROOT), true);

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'card-skill-update-check-'));
  try {
    const cachePath = path.join(testRoot, 'newer.json');
    const messages = [];
    const checked = await runUpdateCheck({
      root: '/Users/test/.agents/skills/card-skill',
      currentVersion: '0.7.0',
      releaseUrl: `data:application/json,${encodeURIComponent(JSON.stringify({ tag_name: 'v0.8.0', draft: false, prerelease: false, commit_sha: releaseCommit }))}`,
      cachePath,
      onMessage: message => messages.push(message),
    });
    assert.match(checked, /v0\.8\.0/);
    assert.equal(messages.length, 1);
    assert.equal(readCache(cachePath).releaseTag, 'v0.8.0');
    assert.equal(readCache(cachePath).releaseCommit, releaseCommit);

    const executed = [];
    const updated = autoUpdate({
      root: '/Users/test/.agents/skills/card-skill',
      currentVersion: '0.7.0',
      cachePath,
      execute: context => {
        executed.push(context.installer);
        return { ok: true, installedVersion: '0.8.0', installedRoot: context.root };
      },
      onMessage: message => assert.match(message, /installed and verified/),
    });
    assert.equal(updated, true);
    assert.deepEqual(executed, ['skills']);

    const falseSuccessCache = path.join(testRoot, 'false-success.json');
    writeCache(falseSuccessCache, {
      date: today(),
      currentVersion: '0.7.0',
      latestVersion: '0.8.0',
      releaseTag: 'v0.8.0',
      releaseCommit,
      updateAvailable: true,
    });
    const falseSuccess = autoUpdate({
      root: '/Users/test/.agents/skills/another-card-skill',
      currentVersion: '0.7.0',
      cachePath: falseSuccessCache,
      execute: () => ({ ok: true, installedVersion: '0.7.0' }),
      onMessage: message => assert.match(message, /readback/),
    });
    assert.equal(falseSuccess, false);
    assert.equal(readCache(falseSuccessCache).updatedVersion, undefined);

    const lockedCache = path.join(testRoot, 'locked.json');
    writeCache(lockedCache, {
      date: today(),
      currentVersion: '0.7.0',
      latestVersion: '0.8.0',
      releaseTag: 'v0.8.0',
      releaseCommit,
      updateAvailable: true,
    });
    const lease = beginRender('/Users/test/.agents/skills/locked-card-skill', lockedCache);
    assert.equal(lease.ready, true);
    assert.equal(autoUpdate({
      root: '/Users/test/.agents/skills/locked-card-skill',
      currentVersion: '0.7.0',
      cachePath: lockedCache,
      execute: () => assert.fail('an active render must defer installation'),
    }), null);
    lease.end();

    const firstLock = acquireUpdateLock('/Users/test/.agents/skills/locked-card-skill', lockedCache);
    assert.ok(firstLock);
    assert.equal(acquireUpdateLock('/Users/test/.agents/skills/locked-card-skill', lockedCache), null);
    firstLock.release();

    const disabledCache = path.join(testRoot, 'disabled.json');
    const disabled = await runUpdateCheck({
      currentVersion: '0.7.0',
      releaseUrl: 'not-a-url',
      cachePath: disabledCache,
      disabled: true,
    });
    assert.equal(disabled, null);
    assert.equal(fs.existsSync(disabledCache), false);

    const rollbackSource = path.join(testRoot, 'rollback-source');
    const rollbackBackup = path.join(testRoot, 'rollback-backup');
    fs.mkdirSync(rollbackSource);
    fs.writeFileSync(path.join(rollbackSource, 'VERSION'), '0.7.0\n');
    createRollbackCopy(rollbackSource, rollbackBackup);
    fs.writeFileSync(path.join(rollbackSource, 'VERSION'), 'broken\n');
    restoreRollbackCopy(rollbackSource, rollbackBackup);
    assert.equal(readVersion(rollbackSource), '0.7.0');
    assert.equal(fs.existsSync(rollbackBackup), false);

    const hashCopy = path.join(testRoot, 'hash-copy');
    fs.cpSync(rollbackSource, hashCopy, { recursive: true });
    assert.equal(hashSkillTree(hashCopy), hashSkillTree(rollbackSource));
    fs.writeFileSync(path.join(hashCopy, 'VERSION'), '0.8.0\n');
    assert.notEqual(hashSkillTree(hashCopy), hashSkillTree(rollbackSource));
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  console.log('check-update self-test passed.');
}

if (process.argv.includes('--self-test')) {
  await selfTest();
} else if (process.argv.includes('--auto-update')) {
  await mainAutoUpdate();
} else {
  await main();
}
