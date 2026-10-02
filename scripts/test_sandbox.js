const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function testSandbox() {
  console.log('--- TEST SANDBOX: FREE-ROAM SURFING (HANDOFF v3, CONTROLS_SANDBOX_SPEC) ---');

  const reviewDir = path.resolve(__dirname, '..', 'review', 'sandbox');
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
      console.error('Browser error:', msg.text());
      errors.push(msg.text());
    } else {
      console.log('Browser log:', msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error('Page error:', err.message);
    errors.push(err.message);
  });

  const filePath = path.resolve(__dirname, '..', 'sandbox.html');
  const fileUrl = 'file:///' + filePath.replace(/\\/g, '/') + '?input=keys';

  console.log('[STEP 1] Loading sandbox.html?input=keys...');
  await page.goto(fileUrl, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1000));

  console.log('[STEP 2] Starting sandbox ride...');
  await page.click('#btn-sandbox-start');
  await new Promise(r => setTimeout(r, 500));

  // Ensure game is in playing state
  await page.evaluate(() => {
    if (window.game) window.game.state = 'playing';
  });

  // --- 1. СКРИНШОТ: ВОЛНА (В КАРМАНЕ) ---
  console.log('[STEP 3] Testing Zone 1: Wave & Pocket (x = 2m, z = 120m)...');
  await page.evaluate(() => {
    const g = window.game;
    g.physics.reset(2.0, 120.0);
    g.snapCamera();
    for (let i = 0; i < 20; i++) {
      g.updateGame(0.016);
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const waveInfo = await page.evaluate(() => {
    const p = window.game.physics.state;
    const s = window.game.peelWave.getSurface(p.x, p.z);
    return {
      x: p.x,
      z: p.z,
      inPocket: s.inPocket,
      slopeDeg: (s.slope * 180 / Math.PI).toFixed(1),
      speed: p.speed.toFixed(1)
    };
  });
  console.log('Wave Pocket Info:', waveInfo);

  const p1 = path.join(reviewDir, '1-wave-pocket.png');
  await page.screenshot({ path: p1 });
  console.log('✓ Captured 1-wave-pocket.png');

  // --- 2. СКРИНШОТ: ЗЫБЬ (НАКАЧКА) ---
  console.log('[STEP 4] Testing Zone 2: Swell Pumping (z = 360m)...');
  await page.evaluate(() => {
    const g = window.game;
    g.physics.reset(6.0, 360.0);
    g.snapCamera();
    g.input.state.hold = true;
    for (let i = 0; i < 25; i++) {
      g.updateGame(0.016);
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const swellInfo = await page.evaluate(() => {
    const p = window.game.physics.state;
    const s = window.game.peelWave.getSurface(p.x, p.z);
    return {
      z: p.z,
      dhdz: s.dhdz.toFixed(3),
      crouch: p.crouch.toFixed(2),
      pumpBonus: window.game.physics.pumpBonus.toFixed(2)
    };
  });
  console.log('Swell Pumping Info:', swellInfo);

  const p2 = path.join(reviewDir, '2-swell-pump.png');
  await page.screenshot({ path: p2 });
  console.log('✓ Captured 2-swell-pump.png');

  // --- 3. СКРИНШОТ: ТРАМПЛИН В ВОЗДУХЕ ---
  console.log('[STEP 5] Testing Zone 3: Ramp Launch & Airborne Tricks (z = 580m)...');
  await page.evaluate(() => {
    const g = window.game;
    g.physics.reset(3.0, 580.0);
    g.snapCamera();
    g.physics.onRamp = true;
    g.input.state.hold = true;
    g.input.state.holdTime = 0.4;
    g.input.state.released = true;
    g.input.state.lean = 0.8;
    for (let i = 0; i < 15; i++) {
      g.updateGame(0.016);
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const airInfo = await page.evaluate(() => {
    const p = window.game.physics.state;
    return {
      airborne: p.airborne,
      airY: p.airY.toFixed(2),
      vy: p.vy.toFixed(1),
      spin: p.spin.toFixed(1)
    };
  });
  console.log('Airborne Trick Info:', airInfo);

  const p3 = path.join(reviewDir, '3-ramp-airborne.png');
  await page.screenshot({ path: p3 });
  console.log('✓ Captured 3-ramp-airborne.png');

  // --- 4. СКРИНШОТ: КИЛЬВАТЕР ЗА БОТОМ ---
  console.log('[STEP 6] Testing Zone 4: Rival Bot & Wake (z = 715m, bot at 725m)...');
  await page.evaluate(() => {
    const g = window.game;
    g.physics.reset(2.0, 715.0);
    g.snapCamera();
    g.rivalBot.z = 721.0;
    g.rivalBot.x = 2.0;
    for (let i = 0; i < 15; i++) {
      g.updateGame(0.016);
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const wakeInfo = await page.evaluate(() => {
    const p = window.game.physics.state;
    const bot = window.game.rivalBot;
    return {
      playerZ: p.z.toFixed(1),
      botZ: bot.z.toFixed(1),
      wakeBonus: window.game.physics.wakeBonus,
      disturbancesRoll: window.game.balance.worldRoll.toFixed(3)
    };
  });
  console.log('Rival Wake Info:', wakeInfo);

  const p4 = path.join(reviewDir, '4-wake-bot.png');
  await page.screenshot({ path: p4 });
  console.log('✓ Captured 4-wake-bot.png');

  // --- 5. СКРИНШОТ: ОТКРЫТАЯ ПАНЕЛЬ ТЮНИНГА ---
  console.log('[STEP 7] Testing Zone 5: Tuning Panel Toggle...');
  await page.click('#btn-tuning-toggle');
  await new Promise(r => setTimeout(r, 400));

  const panelInfo = await page.evaluate(() => {
    const p = window.game.panel;
    return {
      isOpen: p.isOpen,
      isPaused: window.game.isPaused,
      slidersCount: document.querySelectorAll('.tuning-slider-row').length
    };
  });
  console.log('Tuning Panel Info:', panelInfo);
  if (!panelInfo.isOpen) throw new Error('Expected tuning panel to be open!');
  if (!panelInfo.isPaused) throw new Error('Expected game to be paused when panel is open!');

  const p5 = path.join(reviewDir, '5-tuning-panel.png');
  await page.screenshot({ path: p5 });
  console.log('✓ Captured 5-tuning-panel.png');

  await browser.close();

  console.log('Errors logged during test:', errors.length);
  if (errors.length > 0) {
    throw new Error(`Test failed with console errors: ${errors.join(', ')}`);
  }

  console.log('--- ALL SANDBOX TESTS PASSED 100%! ---');
}

testSandbox().catch(err => {
  console.error('Test Sandbox failed:', err);
  process.exit(1);
});
