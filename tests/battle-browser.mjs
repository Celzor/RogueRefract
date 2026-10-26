// Optional browser acceptance with an installed Chromium/Edge; no npm dependency.
// Run the dev server first, then: node tests/battle-browser.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.TEST_URL || 'http://127.0.0.1:4173/';
const executable = process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(output, 'battle-cdp-'));
let browser;
let socket;
let serial = 0;
const pending = new Map();
const events = new Map();
const errors = [];
let protocolURL;
let endpoint;
try {
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  endpoint = await new Promise((resolve, reject) => {
  let stderr = '';
  const timeout = setTimeout(() => reject(new Error(`Browser did not start: ${stderr.slice(-600)}`)), 15000);
  browser.on('error', reject);
  browser.stderr.on('data', (data) => {
    stderr += data;
    const found = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (found) { clearTimeout(timeout); resolve(found[1]); }
  });
  browser.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Browser exited ${code}: ${stderr.slice(-600)}`)); });
  });
} catch (error) {
  browser?.kill();
  if (profile.startsWith(output + path.sep)) await rm(profile, {recursive:true,force:true,maxRetries:5,retryDelay:300});
  throw error;
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
  return result.result.value;
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`UI did not become ready: ${expression}`);
}
async function click(selector) {
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled)`), true, `Enabled control ${selector}`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function capture(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(output, name + '.png'), Buffer.from(shot.data, 'base64'));
}
async function fit(label) {
  const result = await evaluate(`(() => {
    const visible = (selector) => {
      const node = document.querySelector(selector); if (!node || node.hidden) return null;
      const rect = node.getBoundingClientRect(); return { x:rect.x,y:rect.y,width:rect.width,height:rect.height,bottom:rect.bottom,right:rect.right };
    };
    return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,arena:visible('.arena-stage'),console:visible('#battle-console'),play:visible('#play-button'),shop:visible('#shop'),shopHeight:document.querySelector('#shop').clientHeight,shopContentHeight:document.querySelector('#shop').scrollHeight,shopScrollable:document.querySelector('#shop').scrollHeight>document.querySelector('#shop').clientHeight+1};
  })()`);
  assert.ok(result.scrollWidth <= result.width + 1, `${label}: horizontal overflow ${JSON.stringify(result)}`);
  assert.ok(result.scrollHeight <= result.height + 1, `${label}: page overflow ${JSON.stringify(result)}`);
  for (const [name, rect] of Object.entries({arena:result.arena,console:result.console,play:result.play,shop:result.shop})) {
    if (rect) assert.ok(rect.width > 0 && rect.height > 0 && rect.y >= 0 && rect.bottom <= result.height + 1, `${label}: ${name} outside viewport ${JSON.stringify(result)}`);
  }
  console.log(label, JSON.stringify(result));
}

try {
  const address = new URL(endpoint);
  protocolURL = `http://${address.host}`;
  const target = await (await fetch(`${protocolURL}/json/new?about:blank`, {method:'PUT'})).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (message.id) {
      const entry = pending.get(message.id); pending.delete(message.id);
      if (entry) message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
    } else {
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      for (const handler of events.get(message.method) || []) handler(message.params);
    }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  console.log(`Browser QA CDP endpoint: ${protocolURL}`);
  for (const [width,height] of [[1366,768],[390,844],[360,640]]) {
    await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<600});
    await send('Page.navigate', {url:base});
    await waitFor(`document.querySelector('#play-label')?.textContent === 'Enter the orbit'`);
    await fit(`${width}x${height} orbit lobby`);
    await click('[data-mode="battle"]');
    await waitFor(`document.querySelector('#play-label')?.textContent.includes('Battle') || document.querySelector('#play-label')?.textContent.includes('battle') || document.documentElement.dataset.gameMode === 'battle'`);
    const stylePicker = await evaluate(`Boolean(document.querySelector('[data-combat-style="no-limits"]'))`);
    assert.ok(stylePicker, 'Battle exposes turn-based and no-limits styles');
    await click('[data-combat-style="turn-based"]');
    await fit(`${width}x${height} battle lobby`);
    await capture(`battle-${width}-lobby`);
    await click('#play-button');
    await waitFor(`document.documentElement.dataset.phase === 'shop'`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-buy-move]').length`), 5, 'Buy round exposes five move types');
    await fit(`${width}x${height} battle buy round`);
    await capture(`battle-${width}-shop`);
    await click('[data-buy-move="photon-strike"]');
    await click('#play-button');
    await waitFor(`document.documentElement.dataset.phase === 'playing'`);
    assert.equal(await evaluate(`document.querySelectorAll('.battle-pilot').length`), 6, 'Battle health roster includes all six pilots');
    assert.equal(await evaluate(`document.querySelectorAll('[data-cast]').length`), 5, 'Five casting controls are present');
    assert.equal(await evaluate(`document.querySelector('#battle-target').value`), '', 'A target must be chosen for each cast');
    assert.equal(await evaluate(`document.querySelector('#pass-turn-button').hidden`), false, 'Turn-based exposes a pass-turn control');
    assert.match(await evaluate(`document.querySelector('#turn-status').textContent`), /YOUR TURN/, 'Turn-based starts with the local pilot');
    await fit(`${width}x${height} battle playing`);
    await capture(`battle-${width}-playing`);
    await click('#pass-turn-button');
    await waitFor(`!document.querySelector('#turn-status').textContent.includes('YOUR TURN')`);
    assert.equal(await evaluate(`document.querySelector('#pass-turn-button').disabled`), true, 'Passing advances the turn to a rival');
    await click('#lobby-button');
    await waitFor(`document.documentElement.dataset.phase === 'lobby'`);
    assert.equal(await evaluate(`document.querySelector('#battle-console').hidden`), true, 'Returning to lobby hides casting controls');
    await click('[data-combat-style="no-limits"]');
    await click('#play-button');
    await waitFor(`document.documentElement.dataset.phase === 'shop'`);
    await click('#play-button');
    await waitFor(`document.documentElement.dataset.phase === 'playing'`);
    assert.equal(await evaluate(`document.querySelector('#pass-turn-button').hidden`), true, 'No-limits hides pass-turn control');
    await evaluate(`(() => {const select=document.querySelector('#battle-target');select.value=[...select.options].find(option=>option.value && option.value!=='you').value;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const before = await evaluate(`parseInt(document.querySelectorAll('.battle-pilot strong')[1].textContent,10)`);
    await click('[data-cast="photon-strike"]');
    assert.equal(await evaluate(`document.querySelector('#battle-target').value`), '', 'Casting clears the selected target');
    const after = await evaluate(`parseInt(document.querySelectorAll('.battle-pilot strong')[1].textContent,10)`);
    assert.ok(after < before, `Photon strike reduces the rival's visible health (${before} -> ${after})`);
    await evaluate(`(() => {const select=document.querySelector('#battle-target');select.value=[...select.options].find(option=>option.value && option.value!=='you').value;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await evaluate(`document.querySelector('[data-cast="photon-strike"]').disabled`), true, 'Cooldown blocks a second immediate cast');
    await evaluate(`document.querySelector('[data-cast="photon-strike"]').click()`);
    assert.equal(await evaluate(`parseInt(document.querySelectorAll('.battle-pilot strong')[1].textContent,10)`), after, 'Disabled cast does not deal extra damage');
    await fit(`${width}x${height} no-limits battle`);
    await capture(`battle-${width}-cast`);
  }
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  console.log('Battle browser acceptance passed.');
} finally {
  socket?.close();
  browser.kill();
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (profile.startsWith(output + path.sep)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
