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
const fitsViewport = async (page) => {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    arena: document.querySelector('.arena-stage').getBoundingClientRect().toJSON(),
    controls: document.querySelector('.arena-controls').getBoundingClientRect().toJSON(),
    play: document.querySelector('#play-button').getBoundingClientRect().toJSON(),
  }));
  assert.ok(dimensions.documentWidth <= dimensions.viewportWidth + 1,
    `Horizontal overflow: ${dimensions.documentWidth}px in ${dimensions.viewportWidth}px viewport`);
  assert.ok(dimensions.documentHeight <= dimensions.viewportHeight + 1,
    `Page requires scrolling: ${dimensions.documentHeight}px in ${dimensions.viewportHeight}px viewport`);
  for (const [name, rect] of Object.entries({ arena: dimensions.arena, controls: dimensions.controls, play: dimensions.play })) {
    assert.ok(rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= dimensions.viewportHeight + 1,
      `${name} must remain visible within the viewport: ${JSON.stringify(rect)}`);
  }
};
const shopFitsArena = async (page) => {
  assert.equal(await page.locator('#shop').isVisible(), true, 'Upgrade shop is visible during buy rounds');
  const fits = await page.locator('#shop').evaluate((shop) => {
    const arena = document.querySelector('.arena-stage').getBoundingClientRect();
    const rect = shop.getBoundingClientRect();
    return rect.top >= arena.top - 1 && rect.bottom <= arena.bottom + 1
      && rect.left >= arena.left - 1 && rect.right <= arena.right + 1
      && shop.scrollHeight <= shop.clientHeight + 1
      && [...shop.querySelectorAll('[data-buy]')].every((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.top >= rect.top && bounds.bottom <= rect.bottom + 1;
      });
  });
  assert.ok(fits, 'Shop and every purchase control fit inside the arena without scrolling');
};

try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  recordErrors(page);
  await page.clock.install({ time: new Date('2026-10-26T08:00:00Z') });
  const response = await page.goto(origin, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, 'Game must load successfully');
  await waitText(page, '#play-label', 'Enter the orbit');
  assert.equal(await page.locator('.leader-row').count(), 6, 'Solo practice includes five labeled bots');
  assert.equal(await page.locator('.leader-name small').filter({ hasText: 'BOT' }).count(), 5);
  assert.equal(await page.locator('#shop').isVisible(), false, 'Lobby keeps upgrades out of the game screen');
  assert.equal(await page.locator('#upgrade-grid [data-buy]').count(), 0, 'Lobby does not render locked upgrade previews');
  assert.equal(await page.locator('[data-lane]').count(), 5, 'All five orbit rings have controls');
  await fitsViewport(page);

  await page.locator('#details-button').click();
  assert.equal(await page.locator('#run-details').evaluate((dialog) => dialog.open), true, 'Run details are available on demand');
  assert.equal(await page.locator('#leaderboard').isVisible(), true, 'Leaderboard is readable in run details');
  await page.locator('#details-close').click();
  assert.equal(await page.locator('#run-details').evaluate((dialog) => dialog.open), false);

  await page.getByRole('button', { name: 'Mute sound effects', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Enable sound effects', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Enable sound effects', exact: true }).click();

  await page.getByRole('button', { name: 'Enter the orbit', exact: true }).click();
  const heatStarted = await page.evaluate(() => Date.now());
  await waitText(page, '#arena-status', 'HEAT IN PROGRESS');
  assert.equal(await page.locator('#shop').isVisible(), false, 'Upgrades stay hidden throughout the heat');
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
  assert.doesNotMatch(await page.locator('#arena').getAttribute('aria-label'), /click/i, 'Arena instructions describe contact pickups');
  assert.notEqual(await page.locator('#arena').evaluate((canvas) => getComputedStyle(canvas).cursor), 'crosshair', 'Contact pickups do not ask players to click the field');
  await fitsViewport(page);
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  const laneBeforeDetails = await page.locator('[data-lane][aria-pressed="true"]').getAttribute('data-lane');
  await page.locator('#details-button').click();
  await page.keyboard.press('d');
  await page.clock.runFor(200);
  assert.equal(await page.locator('[data-lane][aria-pressed="true"]').getAttribute('data-lane'), laneBeforeDetails, 'Game shortcuts stay inactive while run details are open');
  assert.equal(await page.locator('#mic-button').count(), 0, 'Run details do not request microphone access');
  await page.locator('#details-close').click();

  // Advance real simulation frames to catch a fresh local level-up event.
  if (await page.locator('#levelup-banner').isVisible()) await page.clock.runFor(2600);
  let celebrated = false;
  for (let elapsed = 0; elapsed < 30_000 && !celebrated; elapsed += 100) {
    await page.clock.runFor(100);
    celebrated = await page.locator('#levelup-banner').isVisible();
  }
  assert.ok(celebrated, 'Local level-ups show a visible arena celebration');
  assert.match(await page.locator('#levelup-banner').textContent(), /level/i);
  assert.ok(await page.locator('#levelup-banner').evaluate((banner) => banner.getAnimations().length > 0), 'Level-up celebration is animated when motion is enabled');
  await page.screenshot({ path: path.join(output, 'desktop-levelup.png'), fullPage: true });
  await page.clock.runFor(3000);
  assert.equal(await page.locator('#levelup-banner').isVisible(), false, 'Level-up celebration clears itself');
  await page.locator('#settings-button').click();
  await page.getByRole('checkbox', { name: 'Reduced visual effects' }).check();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.clock.runFor(200);
  assert.equal(await page.locator('#levelup-banner').evaluate((banner) => banner.getAnimations().length), 0, 'Reduced effects leave no banner animation running');

  // Jump through the actual round's clock; the host catches up every fixed simulation step.
  const remaining = await page.evaluate((started) => Math.max(0, 60_000 - (Date.now() - started)), heatStarted);
  await page.clock.fastForward(remaining);
  await page.clock.runFor(250);
  await waitText(page, '#arena-status', 'UPGRADE INTERMISSION');
  assert.equal(await page.locator('#modal').evaluate((dialog) => dialog.open), false, 'Buying does not require dismissing a results modal');
  assert.equal(await page.locator('#reroll-button').isVisible(), true, 'Shop opens between heats');
  await fitsViewport(page);
  await shopFitsArena(page);
  await page.screenshot({ path: path.join(output, 'desktop-shop.png'), fullPage: true });

  await page.locator('#library-button').click();
  assert.ok(await page.locator('#library-grid .upgrade-card').count() >= 28, 'Index lists the complete upgrade catalog');
  await page.getByRole('searchbox', { name: 'Search upgrades' }).fill('triple prism');
  assert.equal(await page.locator('#library-grid .upgrade-card').count(), 1, 'Upgrade search filters by name');
  await page.getByRole('searchbox', { name: 'Search upgrades' }).fill('no-such-photon');
  await waitText(page, '#library-grid', 'No upgrades found');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  const firstUpgrade = page.locator('[data-buy]').first();
  assert.equal(await firstUpgrade.isEnabled(), true, 'The first heat awards spendable upgrade choices');
  await firstUpgrade.click();
  await page.clock.runFor(200);
  assert.ok(await page.locator('#run-build .build-chip').count() > 0, 'Bought upgrades appear in the active build');
  await page.getByRole('button', { name: 'Ready for next heat', exact: true }).click();
  await page.clock.runFor(300);
  await waitText(page, '#arena-status', 'HEAT IN PROGRESS');
  await waitText(page, '#round-number', '02');
  assert.equal(await page.locator('#shop').isVisible(), false, 'Shop disappears when the next heat starts');
  assert.equal(await page.locator('#upgrade-grid [data-buy]').count(), 0, 'Heat removes upgrade controls from the document');
  assert.ok(await page.locator('#run-build .build-chip').count() > 0, 'The build carries into the next heat');
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const mobile = await mobileContext.newPage();
  recordErrors(mobile);
  await mobile.clock.install({ time: new Date('2026-10-26T08:00:00Z') });
  await mobile.goto(origin, { waitUntil: 'networkidle' });
  await waitText(mobile, '#play-label', 'Enter the orbit');
  await fitsViewport(mobile);
  assert.equal(await mobile.locator('#shop').isVisible(), false);
  await mobile.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  await mobile.getByRole('button', { name: 'Enter the orbit', exact: true }).click();
  const mobileHeatStarted = await mobile.evaluate(() => Date.now());
  await waitText(mobile, '#arena-status', 'HEAT IN PROGRESS');
  await mobile.locator('[data-lane="4"]').click();
  await mobile.clock.runFor(200);
  assert.equal(await mobile.locator('[data-lane="4"]').getAttribute('aria-pressed'), 'true', 'Touch controls reach the fifth ring');
  await fitsViewport(mobile);
  let reducedCelebration = false;
  for (let elapsed = 0; elapsed < 30_000 && !reducedCelebration; elapsed += 500) {
    await mobile.clock.runFor(500);
    reducedCelebration = await mobile.locator('#levelup-banner').isVisible();
  }
  assert.ok(reducedCelebration, 'Reduced motion preserves the level-up announcement');
  assert.equal(await mobile.locator('#levelup-banner').evaluate((banner) => banner.getAnimations().length), 0, 'System reduced motion suppresses level-up animation');
  const mobileRemaining = await mobile.evaluate((started) => Math.max(0, 60_000 - (Date.now() - started)), mobileHeatStarted);
  await mobile.clock.fastForward(mobileRemaining);
  await mobile.clock.runFor(250);
  await waitText(mobile, '#arena-status', 'UPGRADE INTERMISSION');
  await fitsViewport(mobile);
  await shopFitsArena(mobile);
  await mobile.screenshot({ path: path.join(output, 'mobile-shop.png'), fullPage: true });
  await mobile.setViewportSize({ width: 375, height: 667 });
  await fitsViewport(mobile);
  await shopFitsArena(mobile);
  await mobile.screenshot({ path: path.join(output, 'mobile-shop-short.png'), fullPage: true });
  await mobile.locator('[data-buy]:not([disabled])').first().click();
  await mobile.locator('#play-button').click();
  await mobile.clock.runFor(300);
  await waitText(mobile, '#arena-status', 'HEAT IN PROGRESS');
  assert.equal(await mobile.locator('#shop').isVisible(), false);
  await fitsViewport(mobile);
  await mobileContext.close();

  assert.deepEqual(errors, [], 'No browser exceptions or console errors');
  console.log('Browser QA passed: solo roster, on-demand details, sound, upgrade search, five keyboard/touch lanes, burst, level-up celebration, 60-second round, shop-only upgrades, purchases, build persistence, and desktop/mobile layouts without page scrolling.');
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
