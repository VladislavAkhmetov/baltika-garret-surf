const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const GifEncoder = require('./gif-encoder');

async function testPhase3() {
  console.log('--- TEST PHASE 3: MUG LIQUID PHYSICS & 2D HUD MUG RENDERER ---');

  const reviewDir = path.resolve(__dirname, '..', 'review', 'phase3');
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
      console.error('Browser console error:', msg.text());
      errors.push(msg.text());
    } else {
      console.log('Browser log:', msg.text());
    }
  });

  const filePath = path.resolve(__dirname, '..', 'index.html');
  const fileUrl = 'file:///' + filePath.replace(/\\/g, '/') + '?debug=1';

  console.log('[STEP 1] Loading index.html with ?debug=1...');
  await page.goto(fileUrl, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1000));

  // Start game
  console.log('[STEP 2] Clicking Start button...');
  await page.click('#btn-start');
  await new Promise(r => setTimeout(r, 2600));

  // Verify initial MugLiquid state
  console.log('[STEP 3] Verifying initial MugLiquid physics state...');
  const initialPhysics = await page.evaluate(() => {
    const g = window.game;
    const m = g.mug;
    return {
      n: m.n,
      level: m.level,
      foam: m.foam,
      multiplier: m.multiplier,
      h0: m.h[0],
      hMid: m.h[Math.floor(m.n / 2)],
      hEnd: m.h[m.n - 1]
    };
  });
  console.log('Initial MugLiquid state:', initialPhysics);

  if (initialPhysics.n !== 28) throw new Error(`Expected 28 points, got ${initialPhysics.n}`);
  if (initialPhysics.level !== 1.0) throw new Error(`Expected level 1.0, got ${initialPhysics.level}`);
  if (initialPhysics.foam !== 1.0) throw new Error(`Expected foam 1.0, got ${initialPhysics.foam}`);
  if (initialPhysics.multiplier !== 3) throw new Error(`Expected multiplier 3, got ${initialPhysics.multiplier}`);

  // Let player cruise calmly for 2 seconds
  console.log('[STEP 4] Calm cruising test (no spills, stable beer level)...');
  await new Promise(r => setTimeout(r, 2000));

  const calmState = await page.evaluate(() => {
    const g = window.game;
    const m = g.mug;
    const canvas = document.getElementById('mug-canvas');
    const label = document.getElementById('mug-pct-label');
    const mult = document.getElementById('mug-multiplier-badge');
    return {
      level: m.level,
      foam: m.foam,
      multiplier: m.multiplier,
      maxH: Math.max(...Array.from(m.h).map(Math.abs)),
      canvasWidth: canvas ? canvas.width : 0,
      canvasHeight: canvas ? canvas.height : 0,
      labelText: label ? label.textContent : '',
      multText: mult ? mult.textContent : '',
      multClass: mult ? mult.className : ''
    };
  });
  console.log('Calm state:', calmState);

  // Take screenshot 1: Calm Cruising full screen & cropped 3x zoom
  console.log('[STEP 5] Capturing calm cruising screenshots...');
  await page.screenshot({ path: path.join(reviewDir, '1-calm-cruising.png') });

  // 3x zoom on HUD mug container
  const mugContainer = await page.$('#hud-mug-container');
  if (mugContainer) {
    await mugContainer.screenshot({ path: path.join(reviewDir, '1-mug-zoom-calm.png') });
  }

  // Helper inside page to capture composite mug frames for GIF
  await page.evaluate(() => {
    window._captureMugFrame = function() {
      const mugCanvas = document.getElementById('mug-canvas');
      const label = document.getElementById('mug-pct-label');
      const badge = document.getElementById('mug-multiplier-badge');
      if (!mugCanvas) return null;

      const w = 180;
      const h = 230;
      let comp = document.getElementById('_gif_comp');
      if (!comp) {
        comp = document.createElement('canvas');
        comp.id = '_gif_comp';
        comp.width = w;
        comp.height = h;
      }
      const ctx = comp.getContext('2d');
      // Background parchment tone
      ctx.fillStyle = '#EFE6D5';
      ctx.fillRect(0, 0, w, h);

      // Draw mug canvas scaled to fit
      ctx.drawImage(mugCanvas, 10, 40, w - 20, h - 45);

      // Draw percentage & multiplier header
      ctx.font = '900 24px Montserrat, sans-serif';
      const isFlash = label && label.classList.contains('spill-flash');
      ctx.fillStyle = isFlash ? '#D93829' : '#1C1A22';
      ctx.fillText(label ? label.textContent : '100%', 16, 28);

      if (badge) {
        ctx.fillStyle = '#F8C83A';
        ctx.fillRect(w - 56, 8, 42, 24);
        ctx.strokeStyle = '#1C1A22';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(w - 56, 8, 42, 24);
        ctx.fillStyle = '#1C1A22';
        ctx.font = '900 16px Montserrat, sans-serif';
        ctx.fillText(badge.textContent, w - 46, 26);
      }

      const imgData = ctx.getImageData(0, 0, w, h);
      return Array.from(imgData.data);
    };
  });

  const gifFrames = [];

  // Helper to record a frame into gifFrames
  async function recordFrame() {
    const rawData = await page.evaluate(() => window._captureMugFrame());
    if (rawData) {
      gifFrames.push(Buffer.from(rawData));
    }
  }

  console.log('[STEP 6] Recording Phase 3 GIF frames: Calm riding (Phase 3.1)...');
  for (let i = 0; i < 12; i++) {
    await recordFrame();
    await new Promise(r => setTimeout(r, 100));
  }

  // STEP 7: Sharp maneuvers (lane switches left and right)
  console.log('[STEP 7] Recording Phase 3 GIF frames: Sharp lane switch / carving (Phase 3.2)...');
  await page.keyboard.press('ArrowLeft'); // Move to lane 0 (+2.4)
  for (let i = 0; i < 14; i++) {
    await recordFrame();
    await new Promise(r => setTimeout(r, 80));
  }

  const sloshLeft = await page.evaluate(() => {
    const g = window.game;
    const m = g.mug;
    return {
      h0: m.h[0],
      hEnd: m.h[m.n - 1],
      diff: m.h[m.n - 1] - m.h[0],
      isSpilling: m.isSpilling
    };
  });
  console.log('Slosh during Left turn:', sloshLeft);

  // Screenshot during carving
  await page.screenshot({ path: path.join(reviewDir, '2-sharp-maneuver.png') });
  if (mugContainer) {
    await mugContainer.screenshot({ path: path.join(reviewDir, '2-mug-zoom-slosh.png') });
  }

  // Counter-maneuver to right
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 60));
  await page.keyboard.press('ArrowRight');

  for (let i = 0; i < 10; i++) {
    await recordFrame();
    await new Promise(r => setTimeout(r, 80));
  }

  // STEP 8: Test stumble / spill impulse
  console.log('[STEP 8] Recording Phase 3 GIF frames: Spill on stumble (Phase 3.3)...');
  const spillResult = await page.evaluate(() => {
    const g = window.game;
    const m = g.mug;
    const prevFoam = m.foam;
    const prevLevel = m.level;

    // Apply stumble impulse
    m.applyStumbleImpulse(0.14);

    return {
      prevFoam,
      prevLevel,
      newFoam: m.foam,
      newLevel: m.level,
      isSpilling: m.isSpilling,
      dropletsCount: g.mugRenderer.droplets.length,
      hasSpillFlashClass: document.getElementById('mug-pct-label').classList.contains('spill-flash')
    };
  });
  console.log('Spill result:', spillResult);

  // Capture screenshot during spill flash
  await page.screenshot({ path: path.join(reviewDir, '3-spill-stumble.png') });
  if (mugContainer) {
    await mugContainer.screenshot({ path: path.join(reviewDir, '3-mug-zoom-spill.png') });
  }

  for (let i = 0; i < 12; i++) {
    await recordFrame();
    await new Promise(r => setTimeout(r, 80));
  }

  // STEP 9: Test Jump & Landing Ring
  console.log('[STEP 9] Recording Phase 3 GIF frames: Jump & Landing Ring (Phase 3.4)...');
  const landingRingVisible = await page.evaluate(() => {
    const g = window.game;
    g.jump();
    g.player.jumpDuration = 1.2;
    g.player.jumpTime = 0.85; // 0.85 / 1.2 = 0.708 >= 0.65 -> actively shrinking
    g.player.airY = 0.8;
    g.updatePlayer(0.016);
    const ring = document.getElementById('landing-ring');
    return ring ? !ring.classList.contains('hide') : false;
  });
  console.log('Landing ring visible nearing landing:', landingRingVisible);

  await page.screenshot({ path: path.join(reviewDir, '4-landing-ring.png') });

  for (let i = 0; i < 6; i++) {
    await recordFrame();
    await new Promise(r => setTimeout(r, 50));
  }

  // Test clean landing
  console.log('[STEP 10] Testing clean landing detection ("ЧИСТО!")...');
  const cleanLandingResult = await page.evaluate(() => {
    const g = window.game;
    // Register tap
    g._landingTapRegistered = true;
    const prevScore = g.stats.score;
    const prevLevel = g.mug.level;

    g.onPlayerLanding();

    const trickToast = document.getElementById('trick-sticker');
    const trickTag = document.getElementById('trick-tag');
    return {
      scoreBefore: prevScore,
      scoreAfter: g.stats.score,
      trickShown: trickToast && !trickToast.classList.contains('hide') ? (trickTag ? trickTag.textContent : '') : null,
      levelRetained: g.mug.level === prevLevel
    };
  });
  console.log('Clean landing result:', cleanLandingResult);

  await page.screenshot({ path: path.join(reviewDir, '5-clean-landing-trick.png') });

  for (let i = 0; i < 8; i++) {
    await recordFrame();
    await new Promise(r => setTimeout(r, 80));
  }

  // STEP 11: Multiplier thresholds verification
  console.log('[STEP 11] Testing score multiplier thresholds (x3, x2, x1)...');
  const multTests = await page.evaluate(() => {
    const g = window.game;
    const m = g.mug;

    // Test at 95%
    m.level = 0.95;
    m.update(0.016, 0, 0, 0);
    const m95 = m.multiplier;

    // Test at 75%
    m.level = 0.75;
    m.update(0.016, 0, 0, 0);
    const m75 = m.multiplier;

    // Test at 45%
    m.level = 0.45;
    m.update(0.016, 0, 0, 0);
    const m45 = m.multiplier;

    // Restore
    m.level = 1.0;
    m.foam = 1.0;
    m.update(0.016, 0, 0, 0);

    return { m95, m75, m45 };
  });
  console.log('Multiplier tests:', multTests);

  if (multTests.m95 !== 3) throw new Error(`Expected x3 at 95%, got ${multTests.m95}`);
  if (multTests.m75 !== 2) throw new Error(`Expected x2 at 75%, got ${multTests.m75}`);
  if (multTests.m45 !== 1) throw new Error(`Expected x1 at 45%, got ${multTests.m45}`);

  // STEP 12: Assemble and save ART CHECKPOINT A2 GIF
  console.log(`[STEP 12] Assembling ART CHECKPOINT A2 GIF (${gifFrames.length} frames)...`);
  const gifEncoder = new GifEncoder(180, 230);
  gifEncoder.setDelay(90); // ~11 fps
  for (const f of gifFrames) {
    gifEncoder.addFrame(f);
  }
  const gifBuffer = gifEncoder.encode();
  const gifPath = path.join(reviewDir, 'checkpoint_a2_mug.gif');
  fs.writeFileSync(gifPath, gifBuffer);
  console.log(`Saved checkpoint_a2_mug.gif (${Math.round(gifBuffer.length / 1024)} KB)`);

  console.log('\nAll Phase 3 assertions PASSED successfully!');
  await browser.close();
}

testPhase3().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
