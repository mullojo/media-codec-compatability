import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript'};
let server, browser, origin;
before(async () => {
  server = createServer(async (req, res) => {
    try {
      const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (path !== root.slice(0,-1) && !path.startsWith(root)) { res.writeHead(403).end(); return; }
      const file = path === root.slice(0,-1) ? resolve(root,'index.html') : path;
      res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function scan(page) {
  await page.locator('#scan').click();
  await page.waitForFunction(() => !document.getElementById('download').disabled, null, {timeout:60000});
}
async function download(page, button) {
  const ready = page.waitForEvent('download');
  await page.locator(button).click();
  const item = await ready;
  const stream = await item.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function report(page) { return JSON.parse((await download(page,'#download')).toString()); }
function verifyPNG(bytes, minWidth, minHeight) {
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(bytes.readUInt32BE(16) >= minWidth);
  assert.ok(bytes.readUInt32BE(20) > minHeight, 'PNG must include results below the viewport');
}

test('real scan, JSON and full-page PNG; profile changes retain the previous report until rescan', async () => {
  const page = await browser.newPage({viewport:{width:1100,height:850},acceptDownloads:true});
  try {
    const exceptions = [], external = [];
    page.on('pageerror', error => exceptions.push(error.message));
    page.on('request', request => { if (!request.url().startsWith(origin)) external.push(request.url()); });
    await page.goto(origin);
    assert.equal(await page.locator('#screenshot').isDisabled(), true);
    await scan(page);
    const initial = await report(page);
    assert.equal(initial.schemaVersion, 1);
    assert.equal(initial.video.length,5);
    assert.equal(initial.audio.length,4);
    assert.equal(initial.playback.length,4);
    assert.equal(initial.transport.length,4);
    assert.equal(initial.errors.length,0);
    for (const row of [...initial.video,...initial.audio]) {
      assert.ok([true,false,null].includes(row.encode));
      assert.ok([true,false,null].includes(row.decode));
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    verifyPNG(await download(page,'#screenshot'), 1100, 850);
    await page.locator('#profile').selectOption('2160');
    await page.locator('#orientation').selectOption('landscape');
    await page.locator('#fps').selectOption('60');
    assert.deepEqual((await report(page)).profile,initial.profile);
    await scan(page);
    assert.deepEqual((await report(page)).profile,{width:3840,height:2160,bitrate:12000000,frameRate:60});
    assert.equal(await page.locator('#video tr').count(),5);
    assert.deepEqual(exceptions,[]);
    assert.deepEqual(external,[]);
  } finally { await page.close(); }
});

test('mobile export includes full report; absent APIs stay Unknown and no page overflow', async () => {
  const page = await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator,'mediaCapabilities',{value:undefined});
      for (const api of ['MediaRecorder','MediaSource','VideoEncoder','VideoDecoder','AudioEncoder','AudioDecoder']) {
        Object.defineProperty(window,api,{value:undefined,configurable:true});
      }
    });
    await page.goto(origin); await scan(page);
    const data = await report(page);
    assert.ok(data.playback.every(row => row.supported === null && row.smooth === null && row.efficient === null));
    assert.ok(data.transport.every(row => row.record === null && row.mediaSource === null));
    assert.equal(data.environment.secureContext,true);
    assert.equal(data.environment.videoEncoderAPI,false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    verifyPNG(await download(page,'#screenshot'),980,844);
  } finally { await page.close(); }
});

test('query failures are exported as labeled errors rather than unsupported results', async () => {
  const page = await browser.newPage({acceptDownloads:true});
  try {
    await page.addInitScript(() => Object.defineProperty(navigator,'mediaCapabilities',{
      value:{decodingInfo:async () => { throw new Error('Test query failure'); }}
    }));
    await page.goto(origin); await scan(page);
    const data = await report(page);
    assert.equal(data.errors.length,4);
    assert.ok(data.errors.every(error => error.test.startsWith('playback:') && error.message === 'Test query failure'));
    assert.ok(data.playback.every(row => row.supported === null));
    assert.match(await page.locator('#status').innerText(),/4 queries returned Unknown/);
  } finally { await page.close(); }
});

test('missing dependency reports a failure, unlocks controls, and recovers after reload', async () => {
  const page = await browser.newPage();
  try {
    await page.route('**/vendor/mediabunny-1.65.2.mjs',route => route.abort());
    await page.goto(origin); await page.locator('#scan').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Scan failed:'));
    assert.equal(await page.locator('#scan').isDisabled(),false);
    assert.equal(await page.locator('#profile').isDisabled(),false);
    assert.equal(await page.locator('#download').isDisabled(),true);
    await page.unroute('**/vendor/mediabunny-1.65.2.mjs');
    await page.reload(); await scan(page);
  } finally { await page.close(); }
});
