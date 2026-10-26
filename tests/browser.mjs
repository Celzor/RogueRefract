// Optional browser QA: install Playwright separately, or set PLAYWRIGHT_PATH to its package.
// Start `npm run dev` first; BROWSER_EXECUTABLE can point to an installed Chromium browser.
import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const origin = process.env.TEST_URL || 'http://127.0.0.1:4173';
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
let playwright;
try {
  if (process.env.PLAYWRIGHT_PATH) {
    let entry = path.resolve(process.env.PLAYWRIGHT_PATH);
    if ((await stat(entry)).isDirectory()) entry = path.join(entry, 'index.mjs');
    playwright = await import(pathToFileURL(entry).href);
  } else playwright = await import('playwright');
} catch {
  throw new Error('Browser QA needs Playwright. Set PLAYWRIGHT_PATH to an installed playwright package.');
}

const executablePath = process.env.BROWSER_EXECUTABLE || (process.platform === 'win32'
  ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  : undefined);
const browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const errors = [];
const recordErrors = (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
};
const waitText = async (page, selector, expected) => {
  await page.waitForFunction(({ selector, expected }) => document.querySelector(selector)?.textContent.includes(expected), { selector, expected });
};
const noHorizontalOverflow = async (page) => {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  assert.ok(dimensions.documentWidth <= dimensions.viewportWidth + 1,
    `Horizontal overflow: ${dimensions.documentWidth}px in ${dimensions.viewportWidth}px viewport`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  recordErrors(page);
  await page.addInitScript(() => {
    // Exercise the browser permission boundary without requesting a real device in QA.
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => { throw new DOMException('Synthetic permission denial', 'NotAllowedError'); },
    });
  });
  await page.clock.install({ time: new Date('2026-10-26T08:00:00Z') });
  const response = await page.goto(origin, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, 'Game must load successfully');
  await waitText(page, '#play-label', 'Enter the orbit');
  assert.equal(await page.locator('.leader-row').count(), 6, 'Solo practice includes five labeled bots');
  assert.equal(await page.locator('.leader-name small').filter({ hasText: 'BOT' }).count(), 5);
  await noHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Mute sound effects', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Enable sound effects', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Enable sound effects', exact: true }).click();

  await page.getByRole('button', { name: 'Upgrade index', exact: true }).click();
  assert.equal(await page.locator('#library-grid .upgrade-card').count(), 28, 'Index lists all upgrades');
  await page.getByRole('searchbox', { name: 'Search upgrades' }).fill('triple prism');
  assert.equal(await page.locator('#library-grid .upgrade-card').count(), 1, 'Upgrade search filters by name');
  await page.getByRole('searchbox', { name: 'Search upgrades' }).fill('no-such-photon');
  await waitText(page, '#library-grid', 'No upgrades found');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  await page.getByRole('button', { name: 'Enter the orbit', exact: true }).click();
  await waitText(page, '#arena-status', 'HEAT IN PROGRESS');
  await page.locator('[data-lane="0"]').click();
  await page.keyboard.press('d');
  await page.clock.runFor(250);
  assert.equal(await page.locator('[data-lane="1"]').getAttribute('aria-pressed'), 'true', 'D works after clicking a lane button');
  await page.keyboard.press('a');
  await page.clock.runFor(250);
  assert.equal(await page.locator('[data-lane="0"]').getAttribute('aria-pressed'), 'true', 'A moves the pilot to inner orbit');
  await page.keyboard.press('Space');
  await page.clock.runFor(200);
  assert.match(await page.locator('#boost-label').textContent(), /Bursting/, 'Space activates the orbit burst');
  await page.clock.fastForward(12_000);
  await page.clock.runFor(200);
  assert.ok(Number((await page.locator('#score').textContent()).replaceAll(',', '')) > 0, 'Spinning earns points');
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await page.locator('#mic-button').click();
  await waitText(page, '#mic-note', 'not allowed');
  assert.equal(await page.locator('#mic-meter').isVisible(), false, 'Denied microphone stays disabled');
  await waitText(page, '#mic-button-label', 'Enable microphone');

  // Jump through the actual round's clock; the host catches up every fixed simulation step.
  await page.clock.fastForward(48_000);
  await page.clock.runFor(250);
  await waitText(page, '#arena-status', 'UPGRADE INTERMISSION');
  assert.equal(await page.locator('#modal').getAttribute('open'), '', 'Round results open automatically');
  await page.locator('#results-shop').click();
  assert.equal(await page.locator('#reroll-button').isVisible(), true, 'Shop opens between heats');
  const firstUpgrade = page.locator('[data-buy]').first();
  assert.equal(await firstUpgrade.isEnabled(), true, 'The first heat awards spendable upgrade choices');
  await firstUpgrade.click();
  await page.clock.runFor(200);
  assert.ok(await page.locator('#run-build .build-chip').count() > 0, 'Bought upgrades appear in the active build');
  await page.getByRole('button', { name: 'Ready for next heat', exact: true }).click();
  await page.clock.runFor(300);
  await waitText(page, '#arena-status', 'HEAT IN PROGRESS');
  await waitText(page, '#round-number', '02');
  assert.ok(await page.locator('#run-build .build-chip').count() > 0, 'The build carries into the next heat');
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const mobile = await mobileContext.newPage();
  recordErrors(mobile);
  await mobile.goto(origin, { waitUntil: 'networkidle' });
  await waitText(mobile, '#play-label', 'Enter the orbit');
  await noHorizontalOverflow(mobile);
  await mobile.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  await mobile.getByRole('button', { name: 'Enter the orbit', exact: true }).click();
  await waitText(mobile, '#arena-status', 'HEAT IN PROGRESS');
  await mobile.locator('[data-lane="2"]').click();
  await mobile.waitForTimeout(200);
  assert.equal(await mobile.locator('[data-lane="2"]').getAttribute('aria-pressed'), 'true', 'Touch lane controls work');
  await noHorizontalOverflow(mobile);
  await mobileContext.close();

  assert.deepEqual(errors, [], 'No browser exceptions or console errors');
  console.log('Browser QA passed: solo roster, sound, microphone denial, upgrade search, keyboard/touch lanes, burst, 60-second round, shop purchases, build persistence, mobile layout.');
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
