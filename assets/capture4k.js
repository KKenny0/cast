#!/usr/bin/env node

const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { createFileAccessPolicy } = require('../scripts/lib/file-access');

async function main() {
  const args = process.argv.slice(2);
  const allowedFiles = [];
  for (let index = args.length - 1; index >= 0; index--) {
    if (args[index] !== '--allow-file') continue;
    if (!args[index + 1]) {
      console.error('--allow-file requires a path');
      process.exit(1);
    }
    allowedFiles.unshift(args[index + 1]);
    args.splice(index, 2);
  }
  const measureIndex = args.indexOf('--measure');
  const measureMode = measureIndex >= 0;
  const htmlPath = args[0];
  const outputPath = measureMode ? null : args[1];
  const width = parseInt(args[measureMode ? measureIndex + 1 : 2]) || 1080;
  const height = parseInt(args[measureMode ? measureIndex + 2 : 3]) || 800;
  const dpr = parseFloat(args[measureMode ? measureIndex + 3 : 4]) || 2;
  const fullpage = !measureMode && args[5] === 'fullpage';

  if (!htmlPath) {
    console.error('Usage: node capture4k.js <html> <png> [width] [height] [dpr] [fullpage]');
    console.error('       node capture4k.js <html> --measure [width] [height] [dpr]');
    process.exit(1);
  }
  if (!measureMode && !outputPath) {
    console.error('Usage: node capture4k.js <html> <png> [width] [height] [dpr] [fullpage]');
    process.exit(1);
  }

  const resolvedHtml = path.resolve(htmlPath);

  let chromium;
  try {
    chromium = require('playwright').chromium;
  } catch {
    console.error('Playwright not found.');
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width, height: fullpage ? 5000 : height },
      deviceScaleFactor: dpr,
      serviceWorkers: 'block',
    });
    const policy = createFileAccessPolicy({
      htmlPath: resolvedHtml,
      assetRoot: path.resolve(__dirname),
      allowedFiles,
    });
    const blocked = [];
    await context.route('**/*', async route => {
      const url = route.request().url();
      const decision = policy.inspect(url);
      if (decision.allowed) return route.continue();
      let host = 'local-file';
      if (decision.scheme === 'remote') {
        try { host = new URL(url).host || 'unknown'; } catch { host = 'unknown'; }
      }
      blocked.push({ resourceType: route.request().resourceType(), host, reason: decision.reason || 'remote-scheme' });
      await route.abort('blockedbyclient');
    });
    const page = await context.newPage();

    const fileUrl = pathToFileURL(resolvedHtml).href;
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    if (measureMode) {
      const bboxes = await page.evaluate(() => {
        const result = {};
        document.querySelectorAll('[data-measure-id]').forEach(el => {
          const r = el.getBoundingClientRect();
          result[el.dataset.measureId] = {
            width: Math.round(r.width),
            height: Math.round(r.height)
          };
        });
        return result;
      });
      if (blocked.length) {
        throw new Error(`safety.asset_blocked: ${blocked.map(item => `${item.resourceType}@${item.host}:${item.reason}`).join(', ')}`);
      }
      console.log(JSON.stringify(bboxes));
      return;
    }

    if (fullpage) {
      const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.screenshot({
        path: path.resolve(outputPath),
        type: 'png',
        clip: { x: 0, y: 0, width, height: bodyHeight }
      });
    } else {
      await page.screenshot({
        path: path.resolve(outputPath),
        type: 'png',
        clip: { x: 0, y: 0, width, height }
      });
    }

    if (blocked.length) {
      fs.rmSync(path.resolve(outputPath), { force: true });
      throw new Error(`safety.asset_blocked: ${blocked.map(item => `${item.resourceType}@${item.host}:${item.reason}`).join(', ')}`);
    }
    console.log('OK: ' + path.resolve(outputPath));
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
