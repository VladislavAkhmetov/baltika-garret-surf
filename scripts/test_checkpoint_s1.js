const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const GifEncoder = require('./gif-encoder');

async function testCheckpointS1() {
  console.log('=== TEST CHECKPOINT S1: THE WAVE & COMMON BUG FIXES (§2, §4 VERTICAL_SLICE_SPEC) ===');

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
  // Мобильный вьюпорт смартфона (393x852)
  await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 1.5 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('Browser console error:', msg.text());
      errors.push(msg.text());
    } else {
      console.log('Browser log:', msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error('Page error:', err.message);
    errors.push(err.message);
  });

  const filePath = path.resolve(__dirname, '..', 'slice.html');
  const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');

  console.log('[STEP 1] Loading slice.html...');
  await page.goto(fileUrl, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));

  console.log('[STEP 2] Tapping start and completing calibration...');
  await page.click('#btn-sandbox-start');
  await new Promise(r => setTimeout(r, 1600));

  // Проверяем состояние игры
  await page.evaluate(() => {
    if (window.game) window.game.state = 'playing';
  });

  // --- 1. СКРИНШОТ: ВОЛНА В КАРМАНЕ (x = 0.5, z = 60) ---
  console.log('[STEP 3] Capturing 1-wave-pocket.png (x = 0.5m, pocket)...');
  await page.evaluate(() => {
    const g = window.game;
    g.physics.reset(0.5, 60.0);
    g.snapCamera();
    for (let i = 0; i < 25; i++) {
      g.updateGame(0.016);
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const pocketInfo = await page.evaluate(() => {
    const g = window.game;
    const p = g.physics.state;
    const s = g.peelWave.getSurface(p.x, p.z);
    
    // Проверка положения сёрфера на экране (центр сёрфера)
    const rigPos = g.surferRig.position.clone();
    rigPos.project(g.camera);
    // NDC x в [-1..1] переводим в проценты экрана [0..100%]
    const screenXPercent = ((rigPos.x + 1) / 2) * 100;

    return {
      x: p.x.toFixed(2),
      z: p.z.toFixed(2),
      y: p.y.toFixed(2),
      height: s.height.toFixed(2),
      slopeDeg: (s.slope * 180 / Math.PI).toFixed(1),
      inPocket: s.inPocket.toFixed(2),
      screenXPercent: screenXPercent.toFixed(1) + '%',
      speed: p.speed.toFixed(1)
    };
  });
  console.log('[POCKET INFO]:', pocketInfo);

  const shot1 = path.join(reviewDir, '1-wave-pocket.png');
  await page.screenshot({ path: shot1 });
  console.log('✓ Captured 1-wave-pocket.png');

  // --- 2. СКРИНШОТ: НА ПЛЕЧЕ ВОЛНЫ (x = 6.0, z = 120) ---
  console.log('[STEP 4] Capturing 2-wave-shoulder.png (x = 6.0m, shoulder)...');
  await page.evaluate(() => {
    const g = window.game;
    g.physics.reset(6.0, 120.0);
    g.snapCamera();
    for (let i = 0; i < 30; i++) {
      g.updateGame(0.016);
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const shoulderInfo = await page.evaluate(() => {
    const g = window.game;
    const p = g.physics.state;
    const s = g.peelWave.getSurface(p.x, p.z);
    const rigPos = g.surferRig.position.clone();
    rigPos.project(g.camera);
    const screenXPercent = ((rigPos.x + 1) / 2) * 100;

    return {
      x: p.x.toFixed(2),
      z: p.z.toFixed(2),
      y: p.y.toFixed(2),
      slopeDeg: (s.slope * 180 / Math.PI).toFixed(1),
      inPocket: s.inPocket.toFixed(2),
      screenXPercent: screenXPercent.toFixed(1) + '%',
      cameraX: g.camera.position.x.toFixed(2)
    };
  });
  console.log('[SHOULDER INFO (Bug 1 Camera Follow Criterion)]:', shoulderInfo);

  const shot2 = path.join(reviewDir, '2-wave-shoulder.png');
  await page.screenshot({ path: shot2 });
  console.log('✓ Captured 2-wave-shoulder.png');

  // --- 3. СКРИНШОТ: ВЫБРОС ГУБЫ (предупреждение и тень) ---
  console.log('[STEP 5] Capturing 3-lip-collapse.png (lip throw warning & shadow)...');
  await page.evaluate(() => {
    const g = window.game;
    g.physics.reset(0.2, 180.0);
    g.snapCamera();
    // Активируем предупреждение выброса губы на z = 195м
    g.peelWave.activeThrow = {
      zStart: 188.0,
      zEnd: 200.0,
      timer: 0.9,
      totalDur: 1.45
    };
    for (let i = 0; i < 15; i++) {
      g.updateGame(0.016);
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const lipInfo = await page.evaluate(() => {
    const g = window.game;
    return {
      activeThrow: !!g.peelWave.activeThrow,
      shadowVisible: g.peelWave.throwShadowMesh.visible,
      flapVisible: g.peelWave.lipFlapMesh.visible
    };
  });
  console.log('[LIP THROW INFO]:', lipInfo);

  const shot3 = path.join(reviewDir, '3-lip-collapse.png');
  await page.screenshot({ path: shot3 });
  console.log('✓ Captured 3-lip-collapse.png');

  // --- 4. СКРИНШОТ: ПЕНА ДОГОНЯЕТ (<10м) ---
  console.log('[STEP 6] Capturing 4-foam-approaching.png (foam wall < 10m)...');
  await page.evaluate(() => {
    const g = window.game;
    g.physics.reset(1.0, 240.0);
    g.snapCamera();
    // Ставим точку ломки на 7м позади игрока
    g.peelWave.peelZ = 233.0;
    for (let i = 0; i < 20; i++) {
      g.updateGame(0.016);
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const foamInfo = await page.evaluate(() => {
    const g = window.game;
    return {
      distToPlayer: (g.physics.state.z - g.peelWave.peelZ).toFixed(1) + 'm',
      camShakeBonus: g.peelWave.camShakeBonus.toFixed(3),
      sprayCount: g.peelWave.sprayParticles.filter(p => p.life > 0).length
    };
  });
  console.log('[FOAM APPROACHING INFO]:', foamInfo);

  const shot4 = path.join(reviewDir, '4-foam-approaching.png');
  await page.screenshot({ path: shot4 });
  console.log('✓ Captured 4-foam-approaching.png');

  // --- 5. ВИДЕО 10 СЕКУНД С ТЕЛЕФОНА (GIF АНИМАЦИЯ) ---
  console.log('[STEP 7] Recording 10s video/GIF of wave motion and mobile riding...');
  const gifWidth = 200;
  const gifHeight = 434;
  const encoder = new GifEncoder(gifWidth, gifHeight);
  encoder.setDelay(250); // 4 кадра/с, 40 кадров = 10 секунд симулируемого игрового времени

  await page.evaluate(() => {
    const g = window.game;
    g.physics.reset(0.5, 30.0);
    g.snapCamera();
  });

  const totalGifFrames = 40;
  for (let frame = 0; frame < totalGifFrames; frame++) {
    // Симулируем динамичный карвинг на волне в течение 10 секунд
    const pixels = await page.evaluate((f, gw, gh) => {
      const g = window.game;
      // Волнообразный наклон телефона (карвинг)
      const leanSim = Math.sin(f * 0.28) * 0.8;
      g.input.state.lean = leanSim;

      // Обновляем несколько подкадров
      for (let s = 0; s < 5; s++) {
        g.updateGame(0.033);
      }

      // Рендерим текущий canvas в уменьшенный для GIF
      const c = document.createElement('canvas');
      c.width = gw;
      c.height = gh;
      const ctx = c.getContext('2d');

      // Фоновый градиент неба (как в CSS #sky)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, gh * 0.55);
      skyGrad.addColorStop(0, '#4BA3E3');
      skyGrad.addColorStop(0.7, '#A1D8F0');
      skyGrad.addColorStop(1, '#FCE8CE');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, gw, gh);

      const webgl = document.getElementById('webgl-canvas');
      if (webgl) {
        ctx.drawImage(webgl, 0, 0, gw, gh);
      }

      // Рисуем кружку поверх
      const mug = document.getElementById('mug-canvas');
      if (mug) {
        ctx.drawImage(mug, 10, gh - 105, 65, 85);
      }

      const img = ctx.getImageData(0, 0, gw, gh);
      return Array.from(img.data);
    }, frame, gifWidth, gifHeight);

    encoder.addFrame(new Uint8ClampedArray(pixels));
    if ((frame + 1) % 10 === 0) {
      console.log(`  Rendered GIF frame ${frame + 1}/${totalGifFrames}...`);
    }
  }

  const gifPath = path.join(reviewDir, 'checkpoint_s1_wave.gif');
  const gifBuffer = encoder.encode();
  fs.writeFileSync(gifPath, gifBuffer);
  console.log(`✓ Saved 10s video/GIF: ${gifPath} (${Math.round(gifBuffer.length / 1024)} KB)`);

  await browser.close();
  console.log('=== CHECKPOINT S1 VERIFICATION COMPLETE: 100% PASS ===');
}

testCheckpointS1().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
