import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:5177';
const START = '2026-09-08T16:49:00Z';
const outDir = 'images/guide';
fs.mkdirSync(outDir, { recursive: true });

async function addCallouts(page, markers) {
  await page.evaluate((markers) => {
    const old = document.getElementById('guide-callouts');
    if (old) old.remove();
    const c = document.createElement('div');
    c.id = 'guide-callouts';
    c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
    for (const m of markers) {
      const d = document.createElement('div');
      d.textContent = String(m.n);
      d.style.cssText = `position:absolute;left:${m.x}px;top:${m.y}px;width:28px;height:28px;border-radius:50%;background:#ffb454;color:#02050a;font:700 14px/28px Inter,sans-serif;text-align:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);transform:translate(-50%,-50%)`;
      c.appendChild(d);
    }
    document.body.appendChild(c);
  }, markers);
}
async function clearCallouts(page) {
  await page.evaluate(() => document.getElementById('guide-callouts')?.remove());
}

async function shot(page, file, markers) {
  if (markers) await addCallouts(page, markers);
  await page.waitForTimeout(400);
  const png = path.join(outDir, file.replace('.webp', '.png'));
  await page.screenshot({ path: png, fullPage: false });
  if (markers) await clearCallouts(page);
  const webp = path.join(outDir, file);
  execSync(`cwebp -q 75 "${png}" -o "${webp}"`, { stdio: 'inherit' });
  fs.unlinkSync(png);
  console.log('wrote', webp);
}

const browser = await chromium.launch({ headless: true });

// Desktop overview
let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/?start=${START}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await shot(page, '01-desktop-overview.webp', [
  { n: 1, x: 150, y: 40 },
  { n: 2, x: 720, y: 400 },
  { n: 3, x: 650, y: 320 },
  { n: 4, x: 180, y: 300 },
  { n: 5, x: 1280, y: 180 },
  { n: 6, x: 720, y: 850 },
  { n: 7, x: 1280, y: 680 },
]);

// Desktop playback (focus on timeline)
await shot(page, '02-desktop-playback.webp', [
  { n: 1, x: 720, y: 780 },
  { n: 2, x: 90, y: 830 },
  { n: 3, x: 200, y: 830 },
  { n: 4, x: 320, y: 830 },
  { n: 5, x: 380, y: 830 },
  { n: 6, x: 520, y: 830 },
  { n: 7, x: 600, y: 830 },
  { n: 8, x: 1100, y: 830 },
]);

// Select acquisition for card/brower shots
// Click first acquisition row
await page.waitForSelector('.browser tbody tr');
await page.locator('.browser tbody tr').first().click();
await page.waitForSelector('.card', { timeout: 5000 });
await page.waitForTimeout(600);
await shot(page, '03-desktop-browser.webp', [
  { n: 1, x: 180, y: 200 },
  { n: 2, x: 180, y: 320 },
  { n: 3, x: 180, y: 500 },
  { n: 4, x: 320, y: 420 },
  { n: 5, x: 180, y: 650 },
]);
await shot(page, '04-desktop-acquisition-card.webp', [
  { n: 1, x: 1280, y: 250 },
  { n: 2, x: 1280, y: 360 },
  { n: 3, x: 1280, y: 560 },
]);

// Satellite view
const satBtn = page.locator('.card-actions button', { hasText: 'Satellite view' });
if (await satBtn.count()) {
  await satBtn.click();
  await page.waitForTimeout(1000);
  await page.waitForSelector('.tl-satellite');
  await shot(page, '05-desktop-satellite-view.webp', [
    { n: 1, x: 1150, y: 830 },
    { n: 2, x: 1250, y: 830 },
    { n: 3, x: 720, y: 400 },
  ]);
} else {
  console.log('no satellite view button');
  await shot(page, '05-desktop-satellite-view.webp', []);
}

// Mobile collapsed
let mpage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mpage.goto(`${BASE}/?start=${START}`, { waitUntil: 'networkidle' });
await mpage.waitForTimeout(1500);
await shot(mpage, '06-mobile-collapsed.webp', [
  { n: 1, x: 22, y: 150 },
  { n: 2, x: 368, y: 150 },
  { n: 3, x: 195, y: 810 },
]);

// Mobile browse
await mpage.evaluate(() => document.querySelector('.mobile-sidebar-left .mobile-sidebar-tab')?.click());
await mpage.waitForTimeout(500);
await shot(mpage, '07-mobile-browse.webp', [
  { n: 1, x: 180, y: 220 },
]);

// Select an acquisition on mobile so Info shows a detail card
await mpage.evaluate(() => {
  const row = document.querySelector('#browse-drawer .browser tbody tr');
  if (row) row.click();
});
await mpage.waitForTimeout(800);
// Mobile info (with card)
await mpage.evaluate(() => document.querySelector('.mobile-sidebar-left .mobile-sidebar-tab')?.click()); // close browse
await mpage.waitForTimeout(400);
await mpage.evaluate(() => document.querySelector('.mobile-sidebar-right .mobile-sidebar-tab')?.click());
await mpage.waitForTimeout(600);
await shot(mpage, '08-mobile-info.webp', [
  { n: 1, x: 200, y: 220 },
  { n: 2, x: 200, y: 500 },
]);

// Mobile timeline expanded
await mpage.evaluate(() => document.querySelector('.mobile-sidebar-right .mobile-sidebar-tab')?.click()); // close info
await mpage.waitForTimeout(400);
await mpage.evaluate(() => document.querySelector('.tl-mobile-expand')?.click());
await mpage.waitForTimeout(500);
await shot(mpage, '09-mobile-timeline.webp', [
  { n: 1, x: 195, y: 700 },
]);

await browser.close();
console.log('done');
