// Optional browser acceptance with an installed Chromium/Edge; no npm dependency.
// Run the dev server first, then: node tests/solar-browser.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.TEST_URL || 'http://127.0.0.1:4173/';
const executable = process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(output, 'solar-cdp-'));
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
async function advance(milliseconds) {
  const expired = new Promise((resolve, reject) => {
    const timer=setTimeout(()=>reject(new Error('Virtual time budget did not expire')),10000);
    const handler=()=>{clearTimeout(timer);events.get('Emulation.virtualTimeBudgetExpired')?.delete(handler);resolve();};
    if(!events.has('Emulation.virtualTimeBudgetExpired'))events.set('Emulation.virtualTimeBudgetExpired',new Set());
    events.get('Emulation.virtualTimeBudgetExpired').add(handler);
  });
  await send('Emulation.setVirtualTimePolicy',{policy:'advance',budget:milliseconds,maxVirtualTimeTaskStarvationCount:10000});
  await expired;
}
async function space(down = true, repeat = false) {
  await send('Input.dispatchKeyEvent',{type:down?'rawKeyDown':'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32,autoRepeat:repeat});
}
async function pressSpace() { await space(); await space(false); }
async function pointerPress(selector) {
  const point=await evaluate(`(() => {const rect=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()`);
  if (await evaluate('innerWidth < 600')) {
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    return;
  }
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
}
async function solarFit(label) {
  const result=await evaluate(`(() => {const arena=document.querySelector('.arena-stage').getBoundingClientRect();const solar=document.querySelector('#solar-event').getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,arena:{top:arena.top,bottom:arena.bottom,left:arena.left,right:arena.right},solar:{top:solar.top,bottom:solar.bottom,left:solar.left,right:solar.right,height:solar.height},tapDisabled:document.querySelector('#solar-tap-button').disabled};})()`);
  assert.ok(result.scrollWidth<=result.width+1 && result.scrollHeight<=result.height+1,`${label}: viewport overflow ${JSON.stringify(result)}`);
  assert.ok(result.solar.height>0 && result.solar.top>=result.arena.top && result.solar.bottom<=result.arena.bottom+1 && result.solar.left>=result.arena.left && result.solar.right<=result.arena.right,`${label}: Solar panel inside arena ${JSON.stringify(result)}`);
  assert.equal(result.tapDisabled,false,'Active Solar tap button is enabled');
}
const tapCount=()=>evaluate(`parseInt(document.querySelector('#solar-score').textContent,10)`);

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
    await send('Emulation.setVirtualTimePolicy',{policy:'advance'});
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await send('Emulation.setTouchEmulationEnabled',{enabled:width<600});
    await send('Page.navigate',{url:base});
    await waitFor(`document.querySelector('#play-label')?.textContent === 'Enter the orbit'`);
    assert.equal(await evaluate(`document.querySelectorAll('[id^="mic-"], [id^="setting-mic"]').length`),0,'No microphone controls remain');
    await send('Emulation.setVirtualTimePolicy',{policy:'pause'});
    await click('#play-button');
    assert.equal(await evaluate(`document.documentElement.dataset.phase`),'playing');
    const heatStart=await evaluate('Date.now()');
    const advanceTo=async(milliseconds)=>advance(Math.max(1,heatStart+milliseconds-await evaluate('Date.now()')));
    assert.equal(await evaluate(`document.querySelector('#solar-event').classList.contains('active')`),false,'Solar event begins with countdown');
    await pressSpace();
    await advance(200);
    assert.match(await evaluate(`document.querySelector('#boost-label').textContent`),/Bursting/,'Space still bursts outside Solar Surges');
    await advanceTo(15150);
    assert.equal(await evaluate(`document.querySelector('#solar-event').classList.contains('active')`),true,'First Solar Surge starts at fifteen seconds');
    assert.equal(await tapCount(),0,'Surge begins without passive points');
    await solarFit(`${width}x${height} active Solar Surge`);
    await pressSpace();
    assert.equal(await tapCount(),1,'A distinct Space press counts once');
    await advance(200);
    await space();
    for(let repeat=0;repeat<3;repeat++){await advance(150);await space(true,true);}
    assert.equal(await tapCount(),2,'Held Space auto-repeat does not add presses');
    await space(false);
    await advance(50);
    await pointerPress('#solar-tap-button');
    assert.equal(await tapCount(),3,'One physical tap awards one press without duplicate click');
    await advance(50);
    await pressSpace();
    assert.equal(await tapCount(),4,'Space on a focused tap button awards exactly one press');
    assert.match(await evaluate(`document.querySelector('#solar-score').textContent`),/40/,'Four presses award forty Solar bonus points');
    const remaining=await evaluate(`Number(document.querySelector('#solar-progress').getAttribute('aria-valuenow'))`);
    await advance(1000);
    const after=await evaluate(`Number(document.querySelector('#solar-progress').getAttribute('aria-valuenow'))`);
    assert.ok(Number.isFinite(remaining) && after<remaining,'Event progress counts down');
    await capture(`solar-${width}-active`);
    await advanceTo(24150);
    assert.equal(await evaluate(`document.querySelector('#solar-event').classList.contains('active')`),false,'First surge ends after eight seconds');
    await advanceTo(40150);
    assert.equal(await evaluate(`document.querySelector('#solar-event').classList.contains('active')`),true,'Second Solar Surge starts at forty seconds');
    assert.equal(await tapCount(),0,'Each surge starts a fresh press tally');
    await pressSpace();
    assert.equal(await tapCount(),1,'Second surge accepts presses');
    await advanceTo(61150);
    assert.equal(await evaluate(`document.documentElement.dataset.phase`),'shop','Heat closes normally after sixty seconds');
    assert.equal(await evaluate(`document.querySelector('#solar-event').hidden`),true,'Shop hides Solar input');
    await click('#lobby-button');
    assert.equal(await evaluate(`document.documentElement.dataset.phase`),'lobby');
    assert.equal(await evaluate(`document.querySelector('#solar-event').hidden`),true,'Lobby hides Solar input');
    console.log(`PASS Solar keyboard, held-key rejection, pointer input, progress, event reset and cleanup at ${width}x${height}`);
  }
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  console.log('Solar Surge browser acceptance passed.');
} finally {
  socket?.close();
  browser.kill();
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (profile.startsWith(output + path.sep)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
