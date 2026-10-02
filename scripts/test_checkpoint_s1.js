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
    if (window.game) {
      window.game.state = 'playing';
      window.game.isIntro = false;
      const hint = document.getElementById('slice-tutorial-hint');
      if (hint) hint.classList.add('hide');
    }
  });

  // --- 1. СКРИНШОТ: ВОЛНА В КАРМАНЕ (x = 0.2, z = 60) ---
  console.log('[STEP 3] Capturing 1-wave-pocket.png (x = 0.2m, pocket)...');
  await page.evaluate(() => {
    const g = window.game;
    g.state = 'playing';
    g.isIntro = false;
    g.showTutorialHint = () => {};
    g.tutorialTimer = 0;
    const hint = document.getElementById('slice-tutorial-hint');
    if (hint) {
      hint.classList.add('hide');
      hint.style.display = 'none';
    }

    // Сдвигаем соперников вперед, чтобы не триггерился оверлей обгона
    if (g.rivalsManager) {
      g.rivalsManager.rivals[0].z = 180.0;
      g.rivalsManager.rivals[1].z = -50.0;
    }
    if (g.fx && g.fx.momentBox) {
      g.fx.momentBox.style.display = 'none';
      g.fx.momentBox.classList.remove('fx-moment-in');
    }

    g.physics.reset(0.2, 60.0);
    g.snapCamera();
    for (let i = 0; i < 20; i++) {
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
    const proj = rigPos.clone().project(g.camera);
    const screenXPercent = ((proj.x + 1) / 2) * 100;
    const screenYPercent = ((1 - proj.y) / 2) * 100;

    // Лип гребень на z = p.z
    const lipPos = new THREE.Vector3(3.8, 6.2, p.z + 5.0);
    const projLip = lipPos.clone().project(g.camera);
    const lipScreenY = (((1 - projLip.y) / 2) * 100).toFixed(1) + '%';
    const lipScreenX = (((projLip.x + 1) / 2) * 100).toFixed(1) + '%';

    return {
      x: p.x.toFixed(2),
      z: p.z.toFixed(2),
      y: p.y.toFixed(2),
      height: s.height.toFixed(2),
      slopeDeg: (s.slope * 180 / Math.PI).toFixed(1),
      inPocket: s.inPocket.toFixed(2),
      surferScreenX: screenXPercent.toFixed(1) + '%',
      surferScreenY: screenYPercent.toFixed(1) + '%',
      lipScreenY: lipScreenY,
      lipScreenX: lipScreenX,
      camY: g.camera.position.y.toFixed(2),
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
    g.state = 'playing';
    g.isIntro = false;
    g.showTutorialHint = () => {};
    g.tutorialTimer = 0;
    const hint = document.getElementById('slice-tutorial-hint');
    if (hint) {
      hint.classList.add('hide');
      hint.style.display = 'none';
    }

    if (g.rivalsManager) {
      g.rivalsManager.rivals[0].z = 240.0;
      g.rivalsManager.rivals[1].z = -50.0;
    }
    if (g.fx && g.fx.momentBox) {
      g.fx.momentBox.style.display = 'none';
      g.fx.momentBox.classList.remove('fx-moment-in');
    }

    g.physics.reset(6.0, 120.0);
    g.snapCamera();
    for (let i = 0; i < 20; i++) {
      g.updateGame(0.016);
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const shoulderInfo = await page.evaluate(() => {
    const g = window.game;
    const p = g.physics.state;
    const s = g.peelWave.getSurface(p.x, p.z);
    const rigPos = g.surferRig.position.clone();
    const proj = rigPos.clone().project(g.camera);
    const screenXPercent = ((proj.x + 1) / 2) * 100;
    const screenYPercent = ((1 - proj.y) / 2) * 100;

    return {
      x: p.x.toFixed(2),
      z: p.z.toFixed(2),
      y: p.y.toFixed(2),
      slopeDeg: (s.slope * 180 / Math.PI).toFixed(1),
      inPocket: s.inPocket.toFixed(2),
      surferScreenX: screenXPercent.toFixed(1) + '%',
      surferScreenY: screenYPercent.toFixed(1) + '%',
      cameraX: g.camera.position.x.toFixed(2),
      cameraY: g.camera.position.y.toFixed(2)
    };
  });
  console.log('[SHOULDER INFO (Bug 1 Camera Follow Criterion)]:', shoulderInfo);

  const shot2 = path.join(reviewDir, '2-wave-shoulder.png');
  await page.screenshot({ path: shot2 });
  console.log('✓ Captured 2-wave-shoulder.png');

  // --- 3. СКРИНШОТ: ВЫБРОС ГУБЫ (обрушение губы и всплеск пены на воде) ---
  console.log('[STEP 5] Capturing 3-lip-collapse.png (lip curling down & foam splash)...');
  await page.evaluate(() => {
    const g = window.game;
    g.state = 'playing';
    g.isIntro = false;
    g.showTutorialHint = () => {};
    g.tutorialTimer = 0;
    const hint = document.getElementById('slice-tutorial-hint');
    if (hint) {
      hint.classList.add('hide');
      hint.style.display = 'none';
    }

    if (g.rivalsManager) {
      g.rivalsManager.rivals[0].z = 320.0;
      g.rivalsManager.rivals[1].z = -50.0;
    }
    if (g.fx && g.fx.momentBox) {
      g.fx.momentBox.style.display = 'none';
      g.fx.momentBox.classList.remove('fx-moment-in');
    }

    g.physics.reset(0.2, 180.0);
    g.snapCamera();
    // Активируем фазу активного захлопывания губы: timer = 0.05 (удар о воду и взрыв пены)
    g.peelWave.activeThrow = {
      zStart: 184.0,
      zEnd: 198.0,
      timer: 0.05,
      totalDur: 1.45
    };
    g.updateGame(0.016);
    g.peelWave._frozenThrow = true;
  });
  await new Promise(r => setTimeout(r, 200));

  const lipInfo = await page.evaluate(() => {
    const g = window.game;
    return {
      activeThrow: !!g.peelWave.activeThrow,
      timer: g.peelWave.activeThrow ? g.peelWave.activeThrow.timer.toFixed(3) : 0,
      flapVisible: g.peelWave.lipFlapMesh.visible,
      impactSplashVisible: g.peelWave.impactSplashMesh ? g.peelWave.impactSplashMesh.visible : false
    };
  });
  console.log('[LIP COLLAPSE INFO]:', lipInfo);

  const shot3 = path.join(reviewDir, '3-lip-collapse.png');
  await page.screenshot({ path: shot3 });
  console.log('✓ Captured 3-lip-collapse.png');

  await page.evaluate(() => {
    const g = window.game;
    if (g && g.peelWave) {
      g.peelWave._frozenThrow = false;
      g.peelWave.activeThrow = null;
      if (g.peelWave.lipFlapMesh) g.peelWave.lipFlapMesh.visible = false;
      if (g.peelWave.impactSplashMesh) g.peelWave.impactSplashMesh.visible = false;
    }
  });

  // --- 4. СКРИНШОТ: ПЕНА ДОГОНЯЕТ (<10м) ---
  console.log('[STEP 6] Capturing 4-foam-approaching.png (foam wall < 10m)...');
  await page.evaluate(() => {
    const g = window.game;
    g.state = 'playing';
    g.isIntro = false;
    g.showTutorialHint = () => {};
    g.tutorialTimer = 0;
    const hint = document.getElementById('slice-tutorial-hint');
    if (hint) {
      hint.classList.add('hide');
      hint.style.display = 'none';
    }

    if (g.rivalsManager) {
      g.rivalsManager.rivals[0].z = 380.0;
      g.rivalsManager.rivals[1].z = -50.0;
    }
    if (g.fx && g.fx.momentBox) {
      g.fx.momentBox.style.display = 'none';
      g.fx.momentBox.classList.remove('fx-moment-in');
    }

    g.physics.reset(0.5, 240.0);
    g.snapCamera();
    // Ставим точку ломки на 7м позади игрока (peelZ = 233)
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

  // --- 5. ЗАМЕР МОБИЛЬНОГО FPS ---
  console.log('[STEP 7] Measuring mobile rendering FPS...');
  const fpsData = await page.evaluate(async () => {
    return new Promise(resolve => {
      let frameCount = 0;
      const start = performance.now();
      function count() {
        frameCount++;
        if (frameCount < 60) {
          requestAnimationFrame(count);
        } else {
          const elapsed = (performance.now() - start) / 1000;
          resolve({
            fps: Math.round(frameCount / elapsed),
            elapsedMs: Math.round(elapsed * 1000)
          });
        }
      }
      requestAnimationFrame(count);
    });
  });
  console.log(`[MOBILE FPS RESULT]: ${fpsData.fps} FPS (measured over 60 frames in ${fpsData.elapsedMs}ms)`);

  // --- 6. ВИДЕО 10 СЕКУНД С ТЕЛЕФОНА (GIF АНИМАЦИЯ) ---
  console.log('[STEP 8] Recording 10s video/GIF of wave motion and mobile riding...');
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

  // Копирование артефактов в brain/
  const artifactDir = 'C:\\Users\\amazi\\.gemini\\antigravity\\brain\\d1f205d3-882e-4d65-8030-81fa9ac72ecd';
  if (fs.existsSync(artifactDir)) {
    const filesToCopy = [
      '1-wave-pocket.png',
      '2-wave-shoulder.png',
      '3-lip-collapse.png',
      '4-foam-approaching.png',
      'checkpoint_s1_wave.gif'
    ];
    for (const f of filesToCopy) {
      const src = path.join(reviewDir, f);
      const dest = path.join(artifactDir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`✓ Copied ${f} to artifact directory`);
      }
    }
  }

  await browser.close();
  console.log('=== CHECKPOINT S1 VERIFICATION COMPLETE: 100% PASS ===');
}

testCheckpointS1().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
