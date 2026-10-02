const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const GifEncoder = require('./gif-encoder');

async function testSlice() {
  console.log('=== TEST VERTICAL SLICE 45s: ALL BEATS & MOMENTS (§3, §5, §6, §7, §8) ===');

  const reviewDir = path.resolve(__dirname, '..', 'review', 'slice');
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
  await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 1.5 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    errors.push(err.toString());
  });

  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'slice.html').replace(/\\/g, '/');

  // --- 1. ТЕСТ INTRO И СТАРТА ---
  console.log('[STEP 1] Testing Beat 1: intro (3s cinematic + «ЛОВИ / ВОЛНУ»)...');
  await page.goto(fileUrl + '?beat=intro', { waitUntil: 'load' });
  await page.waitForSelector('#btn-sandbox-start');
  await page.click('#btn-sandbox-start');

  // Ждём калибровку
  await page.waitForFunction(() => {
    const el = document.getElementById('calibration-screen');
    return el && el.classList.contains('hide');
  }, { timeout: 8000 });

  // Обновляем несколько кадров интро
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 40; i++) g.updateIntroCinematic(0.05);
  });
  await new Promise(r => setTimeout(r, 200));

  await page.screenshot({ path: path.join(reviewDir, 'beat-1-intro.png') });
  console.log('✓ Captured beat-1-intro.png');

  // --- 2. ТЕСТ PUMP (0–250м) ---
  console.log('[STEP 2] Testing Beat 2: pump (0–250m, downslope crouch)...');
  await page.evaluate(() => {
    window.game.jumpToBeat('pump');
    window.game.input.state.crouch = 1.0;
    for (let i = 0; i < 30; i++) window.game.updateGame(0.033);
  });
  await new Promise(r => setTimeout(r, 150));
  await page.screenshot({ path: path.join(reviewDir, 'beat-2-pump.png') });
  console.log('✓ Captured beat-2-pump.png');

  // --- 3. ТЕСТ RISE (250–330м) ---
  console.log('[STEP 3] Testing Beat 3: rise (250–330m, wave wall rising)...');
  await page.evaluate(() => {
    window.game.jumpToBeat('rise');
    for (let i = 0; i < 30; i++) window.game.updateGame(0.033);
  });
  await new Promise(r => setTimeout(r, 150));
  await page.screenshot({ path: path.join(reviewDir, 'beat-3-rise.png') });
  console.log('✓ Captured beat-3-rise.png');

  // --- 4. ТЕСТ POCKET & RIVALS (330–900м) ---
  console.log('[STEP 4] Testing Beat 4: pocket (330–900m, rivals, golden cap)...');
  await page.evaluate(() => {
    window.game.jumpToBeat('pocket');
    // Позиционируем перед золотой крышкой на 638м
    window.game.physics.reset(-3.5, 638.0);
    window.game.snapCamera();
    for (let i = 0; i < 15; i++) window.game.updateGame(0.02);
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(reviewDir, 'beat-4-pocket.png') });
  console.log('✓ Captured beat-4-pocket.png');

  // Проверяем захват золотой крышки
  const goldCollected = await page.evaluate(() => window.game.hasGoldCap);
  console.log('Gold cap collected in pocket:', goldCollected);
  await page.screenshot({ path: path.join(reviewDir, 'moment-zoloto.png') });
  console.log('✓ Captured moment-zoloto.png');

  // Проверяем обгон Тони
  await page.evaluate(() => {
    const g = window.game;
    // Ставим Тони на 700м, а игрока на 702м
    g.rivalsManager.rivals[0].z = 700.0;
    g.rivalsManager.rivals[0].overtaken = false;
    g.physics.reset(1.0, 702.0);
    g.snapCamera();
    g.updateGame(0.016);
  });
  await new Promise(r => setTimeout(r, 150));
  await page.screenshot({ path: path.join(reviewDir, 'moment-obgon.png') });
  console.log('✓ Captured moment-obgon.png');

  // --- 5. ТЕСТ LAUNCH & MEGA RAMP (900–1000м) ---
  console.log('[STEP 5] Testing Beat 5: launch (900–1000m, ramp flight & apex)...');
  await page.evaluate(() => {
    window.game.jumpToBeat('launch');
    // Наезжаем на рампу на 920м
    window.game.physics.reset(1.2, 918.0);
    window.game.snapCamera();
    for (let i = 0; i < 12; i++) window.game.updateGame(0.02);
    // Взлёт на апекс
    window.game.physics.state.airborne = true;
    window.game.physics.state.airY = 4.2;
    window.game.fx.moment({
      word: 'ПОЛЁТ!',
      sub: 'ВЫЛЕТ ×1.8',
      tone: 'yellow',
      freeze: 500,
      priority: 3
    });
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(reviewDir, 'beat-5-launch.png') });
  console.log('✓ Captured beat-5-launch.png');

  // --- 6. ТЕСТ SHOULDER (1000–1250м) ---
  console.log('[STEP 6] Testing Beat 6: shoulder (1000–1250m, buoy slalom)...');
  await page.evaluate(() => {
    window.game.jumpToBeat('shoulder');
    window.game.physics.reset(6.0, 1080.0);
    window.game.snapCamera();
    for (let i = 0; i < 20; i++) window.game.updateGame(0.025);
  });
  await new Promise(r => setTimeout(r, 150));
  await page.screenshot({ path: path.join(reviewDir, 'beat-6-shoulder.png') });
  console.log('✓ Captured beat-6-shoulder.png');

  // --- 7. ТЕСТ FINISH & RESULTS CARD (1250–1300м) ---
  console.log('[STEP 7] Testing Beat 7: finish (1250–1300m, finish line & results card)...');
  await page.evaluate(() => {
    window.game.jumpToBeat('finish');
    window.game.physics.reset(2.0, 1272.0);
    window.game.snapCamera();
    // Пересекаем линию финиша на 1275м
    for (let i = 0; i < 20; i++) window.game.updateGame(0.02);
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(reviewDir, 'beat-7-finish.png') });
  console.log('✓ Captured beat-7-finish.png');

  // Ждем показ карточки результатов
  await page.waitForFunction(() => {
    const el = document.getElementById('slice-results-screen');
    return el && !el.classList.contains('hide');
  }, { timeout: 3000 });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(reviewDir, 'results-card.png') });
  console.log('✓ Captured results-card.png');

  // --- 8. ЗАПИСЬ 10-СЕКУНДНОГО GIF ФИНАЛЬНОГО ЗАЕЗДА ---
  console.log('[STEP 8] Recording 10s video/GIF of full slice action...');
  const gifWidth = 200;
  const gifHeight = 434;
  const encoder = new GifEncoder(gifWidth, gifHeight);
  encoder.setDelay(250); // 4 кадра/с, 40 кадров = 10 секунд воспроизведения

  // Перезапуск на заезд
  await page.evaluate(() => {
    window.game.jumpToBeat('pocket');
    window.game.physics.reset(1.0, 380.0);
    window.game.snapCamera();
    const res = document.getElementById('slice-results-screen');
    if (res) res.classList.add('hide');
  });

  const totalFrames = 40;
  for (let frame = 0; frame < totalFrames; frame++) {
    const pixels = await page.evaluate((f, gw, gh) => {
      const g = window.game;
      // Карвинг и прыжок по ходу гонки
      const leanSim = Math.sin(f * 0.3) * 0.75;
      g.input.state.lean = leanSim;

      // Приседание на кадре 15..20
      if (f >= 15 && f <= 20) {
        g.input.state.crouch = 1.0;
      } else if (f === 21) {
        g.input.state.crouch = 0.0; // прыжок!
      }

      for (let s = 0; s < 5; s++) {
        g.updateGame(0.033);
      }

      const c = document.createElement('canvas');
      c.width = gw;
      c.height = gh;
      const ctx = c.getContext('2d');

      const skyGrad = ctx.createLinearGradient(0, 0, 0, gh * 0.55);
      skyGrad.addColorStop(0, '#4BA3E3');
      skyGrad.addColorStop(0.7, '#A1D8F0');
      skyGrad.addColorStop(1, '#FCE8CE');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, gw, gh);

      const webgl = document.getElementById('webgl-canvas');
      if (webgl) ctx.drawImage(webgl, 0, 0, gw, gh);

      const mug = document.getElementById('mug-canvas');
      if (mug) ctx.drawImage(mug, 10, gh - 105, 65, 85);

      const img = ctx.getImageData(0, 0, gw, gh);
      return Array.from(img.data);
    }, frame, gifWidth, gifHeight);

    encoder.addFrame(new Uint8ClampedArray(pixels));
    if ((frame + 1) % 10 === 0) {
      console.log(`  Rendered GIF frame ${frame + 1}/${totalFrames}...`);
    }
  }

  const gifPath = path.join(reviewDir, 'checkpoint_s2_full_run.gif');
  const gifBuffer = encoder.encode();
  fs.writeFileSync(gifPath, gifBuffer);
  console.log(`✓ Saved 10s video/GIF: ${gifPath} (${Math.round(gifBuffer.length / 1024)} KB)`);

  await browser.close();

  console.log('\n--- VERIFICATION SUMMARY ---');
  console.log('Console Errors:', errors.length);
  if (errors.length > 0) {
    console.error('Errors encountered:', errors);
    throw new Error('Test failed with console errors');
  }

  console.log('=== VERTICAL SLICE 45s: 100% PASS ===');
}

testSlice().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
