/**
 * Browser acceptance for the real game and official Refract helper.
 * Start `npm run dev` first. Uses an existing Playwright installation and Edge.
 * Override TEST_URL, PLAYWRIGHT_PATH, or BROWSER_EXECUTABLE as needed.
 * No production test hooks, state mutation, credentials, or Refract server needed.
 */
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function playwright() {
  const candidates = [process.env.PLAYWRIGHT_PATH].filter(Boolean);
  for (let candidate of candidates) {
    if (!existsSync(candidate)) continue;
    if (statSync(candidate).isDirectory()) candidate = path.join(candidate, 'index.mjs');
    return import(pathToFileURL(candidate).href);
  }
  return import('playwright');
}

const { chromium } = await playwright();
const base = new URL(process.env.TEST_URL || 'http://127.0.0.1:4173/');
const fixtureURL = new URL('__refract-multiplayer-qa', base).href;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = process.env.BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1800, height: 1100 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const fixture = `<!doctype html><meta charset="utf-8"><title>Refract relay QA</title>
<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(auto-fit,minmax(550px,1fr));gap:8px}iframe{width:100%;height:1050px;border:0}</style>
<script>
const origin = ${JSON.stringify(base.origin)};
const gameURL = ${JSON.stringify(base.href)};
const protocol = 'refract-activity/1';
const members = [];
const qa = window.__qa = { latest:null, packets:[], maxPayloadBytes:0, broadcasts:0 };
const roster = () => members.map(({id,name}) => ({id,name,avatarUrl:null}));
const post = (member,message) => member.frame.contentWindow?.postMessage({protocol,...message},origin);
const notifyRoster = () => members.forEach(member=>post(member,{type:'participants',participants:roster()}));
qa.join = (id,name) => {
  if(members.some(member=>member.id===id))throw new Error('Duplicate QA member');
  const frame=document.createElement('iframe'); frame.id='pilot-'+id;frame.name='pilot-'+id;
  frame.setAttribute('sandbox','allow-scripts allow-forms allow-pointer-lock allow-popups allow-same-origin');
  frame.setAttribute('allow','autoplay; clipboard-write');
  const url=new URL(gameURL);url.searchParams.set('qa-pilot',id);frame.src=url.href;
  members.push({id,name,frame});document.body.append(frame);notifyRoster();
};
qa.leave = (id) => {
  const index=members.findIndex(member=>member.id===id);
  if(index<0)return;members[index].frame.remove();members.splice(index,1);notifyRoster();
};
qa.reload = (id) => {
  const member=members.find(member=>member.id===id);const url=new URL(gameURL);
  url.searchParams.set('qa-pilot',id);url.searchParams.set('qa-reload',Date.now());member.frame.src=url.href;
};
addEventListener('message',event=>{
  if(event.origin!==origin)return;
  const member=members.find(candidate=>candidate.frame.contentWindow===event.source);
  const message=event.data;
  if(!member||!message||message.protocol!==protocol)return;
  if(message.type==='ready'){
    post(member,{type:'init',sessionId:'qa-call-1',channelId:42,self:{id:member.id,name:member.name,avatarUrl:null},participants:roster(),theme:'dark'});
    post(member,{type:'pushToTalk',binding:null});return;
  }
  if(message.type==='close'){qa.leave(member.id);return;}
  if(message.type!=='broadcast')return;
  const size=new TextEncoder().encode(JSON.stringify(message.data)).length;
  qa.maxPayloadBytes=Math.max(qa.maxPayloadBytes,size);
  if(size>16384){post(member,{type:'result',id:message.id,error:'message_too_large'});return;}
  qa.broadcasts++;
  qa.packets.push({from:member.id,data:message.data});if(qa.packets.length>300)qa.packets.shift();
  if(message.data?.kind==='state'&&member.id===members[0]?.id)qa.latest=message.data;
  for(const other of members){
    if(other.id!==member.id&&(!message.to||message.to.includes(other.id)))post(other,{type:'message',from:member.id,data:message.data});
  }
  if(message.id!==undefined)post(member,{type:'result',id:message.id});
});
</script>`;

const log = (message) => console.log(`PASS ${message}`);
const frame = (id) => page.frame({ name: `pilot-${id}` });
const snapshot = () => page.evaluate(() => structuredClone(window.__qa.latest));
const waitPhase = (phase) => page.waitForFunction((expected) => window.__qa.latest?.state.phase === expected, phase);
async function connected(id, name) {
  await page.waitForFunction((pilot) => {
    const doc = document.getElementById(`pilot-${pilot.id}`)?.contentDocument;
    return doc?.getElementById('connection-label')?.textContent === 'REFRACT CONNECTED'
      && doc?.getElementById('pilot-name')?.textContent === pilot.name
      && doc?.getElementById('arena-status')?.textContent !== 'SYNCING ACTIVITY';
  }, { id, name });
}
async function closeResults(id) {
  const modal = frame(id).locator('#modal');
  if (await modal.evaluate((element) => element.open)) await frame(id).locator('#modal-close').click({ force: true });
}

try {
  await context.route(fixtureURL, (route) => route.fulfill({ contentType: 'text/html', body: fixture }));
  await page.clock.install({ time: new Date('2026-10-26T00:00:00Z') });
  await page.goto(fixtureURL);
  await page.evaluate(() => { window.__qa.join(101, 'Aurora'); window.__qa.join(202, 'Photon'); });
  await connected(101, 'Aurora');
  await connected(202, 'Photon');
  let shared = await snapshot();
  assert.deepEqual(shared.state.players.map((pilot) => pilot.id), ['101', '202']);
  assert.equal(await frame(202).locator('#play-button').isDisabled(), true);
  log('two real game frames initialize with Refract identities and a shared roster');

  await frame(101).locator('#play-button').click({ force: true });
  await waitPhase('playing');
  await page.waitForFunction(() => [101,202].every(id => document.getElementById(`pilot-${id}`).contentDocument.getElementById('arena-status').textContent === 'HEAT IN PROGRESS'));
  await page.clock.fastForward(2400);
  shared = await snapshot();
  assert.equal(shared.state.round, 1);
  assert.ok(shared.state.players.some((pilot) => pilot.score > 0));
  log('the host starts the 60-second heat and both frames receive scoring state');

  await frame(202).locator('[data-lane="2"]').click({ force: true });
  await page.waitForFunction(() => window.__qa.latest.state.players.find(pilot => pilot.id === '202').lane === 2);
  await frame(202).locator('#boost-button').click({ force: true });
  await page.waitForFunction(() => window.__qa.latest.state.players.find(pilot => pilot.id === '202').boostUntil > window.__qa.latest.state.now);
  shared = await snapshot();
  assert.ok(await page.evaluate(() => window.__qa.packets.some(packet => packet.from === 202 && packet.data.kind === 'action' && packet.data.action.type === 'lane')));
  assert.equal(shared.state.players.find((pilot) => pilot.id === '101').lane, 0);
  log('peer lane and burst actions are authenticated and applied only to that pilot');

  await page.evaluate(() => window.__qa.reload(202));
  await connected(202, 'Photon');
  await page.waitForFunction(() => document.getElementById('pilot-202').contentDocument.querySelector('[data-lane="2"]').getAttribute('aria-pressed') === 'true');
  assert.equal((await snapshot()).state.round, 1);
  log('a reloaded peer requests and restores the current running heat');

  await page.evaluate(() => window.__qa.join(303, 'Comet'));
  await connected(303, 'Comet');
  await page.waitForFunction(() => window.__qa.latest.state.players.length === 3);
  await page.waitForFunction(() => [101,202,303].every(id => document.getElementById(`pilot-${id}`).contentDocument.querySelectorAll('.leader-row').length === 3));
  log('a third pilot joins an active heat and every leaderboard receives the roster');

  const before = await snapshot();
  const beforePeerScore = before.state.players.find((pilot) => pilot.id === '202').score;
  await page.evaluate(() => window.__qa.leave(101));
  await page.waitForFunction(() => window.__qa.latest.hostId === 202 && window.__qa.latest.members.length === 2);
  await connected(202, 'Photon');
  await connected(303, 'Comet');
  await page.clock.fastForward(1800);
  shared = await snapshot();
  assert.equal(shared.state.phase, 'playing');
  assert.equal(shared.state.round, before.state.round);
  assert.ok(shared.state.players.find((pilot) => pilot.id === '202').score >= beforePeerScore);
  assert.ok(shared.state.now > before.state.now);
  assert.notEqual(shared.epoch, before.epoch);
  assert.deepEqual(shared.state.players.map((pilot) => pilot.id), ['202','303']);
  log('host departure transfers simulation with the heat, scores, and timer intact');

  await page.clock.fastForward(61000);
  await waitPhase('shop');
  await page.waitForFunction(() => [202,303].every(id => document.getElementById(`pilot-${id}`).contentDocument.getElementById('arena-status').textContent === 'UPGRADE INTERMISSION'));
  for (const id of [202,303]) await closeResults(id);
  const peer = frame(303);
  const buy = peer.locator('[data-buy]:not([disabled])').first();
  await buy.waitFor();
  const upgradeId = await buy.getAttribute('data-buy');
  await buy.click({ force: true });
  await page.waitForFunction((upgrade) => window.__qa.latest.state.players.find(pilot => pilot.id === '303').upgrades[upgrade] === 1, upgradeId);
  await page.waitForFunction(() => document.getElementById('pilot-303').contentDocument.getElementById('build-count').textContent === '01');
  log('the round ends in a shared shop and a peer purchases its own upgrade');

  await frame(202).locator('#play-button').click({ force: true });
  await frame(303).locator('#play-button').click({ force: true });
  await page.clock.fastForward(700);
  await waitPhase('playing');
  shared = await snapshot();
  assert.equal(shared.state.round, 2);
  assert.equal(shared.state.players.find((pilot) => pilot.id === '303').upgrades[upgradeId], 1);
  assert.ok(shared.state.players.find((pilot) => pilot.id === '202').score >= beforePeerScore);
  log('ready votes begin heat two while upgrades and cumulative score persist');

  const transportStats = await page.evaluate(() => ({ maxPayloadBytes:window.__qa.maxPayloadBytes, broadcasts:window.__qa.broadcasts }));
  assert.ok(transportStats.maxPayloadBytes <= 16384);
  assert.deepEqual(pageErrors, []);
  console.log(`PASS no browser exceptions; largest relay payload ${transportStats.maxPayloadBytes}/16384 bytes; ${transportStats.broadcasts} broadcasts`);
} catch (error) {
  console.error('Multiplayer diagnostics:', JSON.stringify(await page.evaluate(() => ({
    frames:[...document.querySelectorAll('iframe')].map(frame=>({
      id:frame.id,url:frame.src,connection:frame.contentDocument?.getElementById('connection-label')?.textContent,
      name:frame.contentDocument?.getElementById('pilot-name')?.textContent,
      status:frame.contentDocument?.getElementById('arena-status')?.textContent,
      toasts:frame.contentDocument?.getElementById('toasts')?.textContent,
    })),packets:window.__qa?.packets.slice(-8).map(({from,data})=>({
      from,kind:data.kind,hostId:data.hostId,revision:data.revision,requestId:data.requestId,replyTo:data.replyTo,
      phase:data.state?.phase,players:data.state?.players.map(({id,score,lane})=>({id,score,lane})),
    })),
  }))), pageErrors);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
