const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function playtest() {
  console.log('--- TEST GAME & ART CHECKPOINT A (PHASE 1 - REVISED) ---');
  
  const reviewDir = path.resolve(__dirname, '..', 'review', 'phase1');
  if (!fs.existsSync(reviewDir)) {
    fs.mkdirSync(reviewDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--allow-file-access-from-files'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('Console error:', msg.text());
      errors.push(msg.text());
    } else {
      console.log('Browser log:', msg.text());
    }
  });

  const filePath = path.resolve(__dirname, '..', 'index.html');
  await page.goto('file:///' + filePath.replace(/\\/g, '/') + '?debug=1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1000));

  // 1. Скриншот меню
  const p1 = path.join(reviewDir, '1-menu.png');
  await page.screenshot({ path: p1 });
  console.log('✓ Captured 1-menu.png');

  // 2. Старт игры
  console.log('Tapping Start Game button...');
  await page.click('#btn-start');
  // Ждём пока калибровка пройдёт и игрок поедет по центру
  await new Promise(r => setTimeout(r, 2800));

  // 3. Центральная полоса (x = 0, сёрфер строго по центру, рост 28%, полосы пены видны)
  const p2 = path.join(reviewDir, '2-center-lane.png');
  await page.screenshot({ path: p2 });
  console.log('✓ Captured 2-center-lane.png (Центральная полоса)');

  // 4. Крайняя левая полоса на экране (+X = +2.4, laneIndex = 0)
  console.log('Testing extreme left lane (x = +2.4)...');
  await page.evaluate(() => {
    if (window.game && window.game.input) {
      window.game.input.setTargetLane(0); // левая полоса на экране (+2.4)
    }
  });
  await new Promise(r => setTimeout(r, 600));
  const p3 = path.join(reviewDir, '3-left-lane.png');
  await page.screenshot({ path: p3 });
  console.log('✓ Captured 3-left-lane.png (Крайняя левая полоса)');

  // 5. Поворот (манёвр вправо к центру/правой полосе с креном и позой turn)
  console.log('Testing turn / carve towards right...');
  await page.evaluate(() => {
    if (window.game && window.game.input) {
      window.game.input.setTargetLane(2); // наклон/перестроение вправо (-2.4)
    }
  });
  await new Promise(r => setTimeout(r, 120)); // момент в динамике поворота
  const p4 = path.join(reviewDir, '4-turn.png');
  await page.screenshot({ path: p4 });
  console.log('✓ Captured 4-turn.png (Поворот)');

  // 6. Прыжок (jump над полосой)
  console.log('Testing jump...');
  await page.evaluate(() => {
    if (window.game) {
      window.game.jump();
    }
  });
  await new Promise(r => setTimeout(r, 260)); // пик прыжка
  const p5 = path.join(reviewDir, '5-jump.png');
  await page.screenshot({ path: p5 });
  console.log('✓ Captured 5-jump.png (Прыжок)');

  // 7. Правая полоса с оверлеем debug=1
  await new Promise(r => setTimeout(r, 450));
  const p6 = path.join(reviewDir, '6-right-lane-debug.png');
  await page.screenshot({ path: p6 });
  console.log('✓ Captured 6-right-lane-debug.png (Правая полоса и debug)');

  await browser.close();

  if (errors.length > 0) {
    console.error(`FAILED with ${errors.length} console errors!`);
    process.exit(1);
  }

  console.log('All revised Phase 1 tests passed without console errors!');
}

playtest().catch(err => {
  console.error('Playtest script failed:', err);
  process.exit(1);
});
