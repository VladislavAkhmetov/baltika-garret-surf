const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const GifEncoder = require('./gif-encoder');

async function testPhase3_5() {
  console.log('--- TEST PHASE 3.5: BALANCE & PERTURBATION SYSTEM (LEVEL1_SPEC §5.3) ---');

  const reviewDir = path.resolve(__dirname, '..', 'review', 'phase3_5');
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

  // STEP 3: Verify BalanceSystem initialization
  console.log('[STEP 3] Verifying BalanceSystem initialization...');
  const initBalance = await page.evaluate(() => {
    const g = window.game;
    const b = g.balance;
    return {
      hasBalance: !!b,
      poolSize: b.poolSize,
      worldRoll: b.worldRoll,
      playerTilt: b.playerTilt,
      mugTilt: b.mugTilt,
      assist: b.assist,
      scheduledCount: b.scheduledEvents.length
    };
  });
  console.log('Initial balance state:', initBalance);

  if (!initBalance.hasBalance) throw new Error('BalanceSystem not instantiated');
  if (initBalance.poolSize !== 16) throw new Error(`Expected pool size 16, got ${initBalance.poolSize}`);
  if (initBalance.scheduledCount < 5) throw new Error(`Expected scheduled wave events, got ${initBalance.scheduledCount}`);

  // Setup GIF frame recording helper in page
  await page.evaluate(() => {
    window._captureCompositeFrame = function() {
      const mugCanvas = document.getElementById('mug-canvas');
      const label = document.getElementById('mug-pct-label');
      const badge = document.getElementById('mug-multiplier-badge');
      const arrow = document.getElementById('mug-telegraph-arrow');
      if (!mugCanvas) return null;

      const w = 180;
      const h = 230;
      let comp = document.getElementById('_gif_comp_b');
      if (!comp) {
        comp = document.createElement('canvas');
        comp.id = '_gif_comp_b';
        comp.width = w;
        comp.height = h;
      }
      const ctx = comp.getContext('2d');
      ctx.fillStyle = '#EFE6D5';
      ctx.fillRect(0, 0, w, h);

      // Mug canvas
      ctx.drawImage(mugCanvas, 10, 40, w - 20, h - 45);

      // Label & Multiplier
      ctx.font = '900 24px Montserrat, sans-serif';
      ctx.fillStyle = '#1C1A22';
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

      // Telegraph arrow indicator
      if (arrow && !arrow.classList.contains('hide')) {
        ctx.font = '900 28px sans-serif';
        ctx.fillStyle = '#D93829';
        ctx.fillText(arrow.textContent, arrow.classList.contains('arrow-left') ? 6 : w - 30, 110);
      }

      const imgData = ctx.getImageData(0, 0, w, h);
      return Array.from(imgData.data);
    };
  });

  const gifFrames = [];
  async function recordFrame() {
    const rawData = await page.evaluate(() => window._captureCompositeFrame());
    if (rawData) gifFrames.push(Buffer.from(rawData));
  }

  // STEP 4: Ride to 410m (Tutorial wave telegraph zone)
  console.log('[STEP 4] Riding towards first big wave at 450m (checking telegraph & water tilt)...');
  await page.evaluate(() => {
    window.game.player.z = 422; // 28m before wave at 450m (in 1.5s lead window)
    window.game.updatePlayer(0.016);
  });
  await new Promise(r => setTimeout(r, 120));

  for (let i = 0; i < 10; i++) {
    await recordFrame();
    await new Promise(r => setTimeout(r, 80));
  }

  const telegraphState = await page.evaluate(() => {
    const g = window.game;
    const b = g.balance;
    const arrow = document.getElementById('mug-telegraph-arrow');
    const tiltH = g.ocean.calcTiltH(2.4, 450); // height difference across water
    return {
      activeTelegraph: b.activeTelegraph,
      arrowVisible: arrow ? !arrow.classList.contains('hide') : false,
      arrowText: arrow ? arrow.textContent : null,
      oceanActiveTilts: g.ocean.activeTilts.length,
      waterCrossTiltH: tiltH
    };
  });
  console.log('Telegraph state at 410m:', telegraphState);

  // Capture Screenshot 1: Wave Telegraph & Tilted Water ahead
  await page.screenshot({ path: path.join(reviewDir, '1-wave-telegraph.png') });

  // STEP 5: First big wave strike at 450m & tilt compensation
  console.log('[STEP 5] Wave strike at 450m (testing worldRoll and player compensation)...');
  await page.evaluate(() => {
    window.game.player.z = 450;
    // Simulate player tilting phone to compensate:
    // Wave dir is -1 (rolls right), player tilts left (+0.18 rad)
    window.game.input.state.tilt = (10 * Math.PI) / 180;
    window.game.updatePlayer(0.016);
  });
  await new Promise(r => setTimeout(r, 200));

  for (let i = 0; i < 14; i++) {
    await recordFrame();
    await new Promise(r => setTimeout(r, 80));
  }

  const waveStrikeState = await page.evaluate(() => {
    const g = window.game;
    const b = g.balance;
    return {
      worldRollDeg: ((b.worldRoll * 180) / Math.PI).toFixed(1),
      playerTiltDeg: ((b.playerTilt * 180) / Math.PI).toFixed(1),
      mugTiltDeg: ((b.mugTilt * 180) / Math.PI).toFixed(1),
      cameraRotZDeg: ((g.camera.rotation.z * 180) / Math.PI).toFixed(1),
      inBalanceZone: b.isInBalanceZone
    };
  });
  console.log('Wave strike state with player compensation:', waveStrikeState);

  // Capture Screenshot 2: Wave Compensation
  await page.screenshot({ path: path.join(reviewDir, '2-wave-compensation.png') });

  // STEP 6: Test "Waiter" bonus («ПО-ОФИЦИАНТСКИ! +100»)
  console.log('[STEP 6] Testing "Waiter" bonus on pre-tilted lane change...');
  const waiterResult = await page.evaluate(() => {
    const g = window.game;
    const b = g.balance;
    const prevScore = g.stats.score;
    const prevCombo = g.stats.combo || 0;

    // Player tilts left beforehand (compensating against impending rightward inertia)
    g.input.state.tilt = (6 * Math.PI) / 180;
    g.balance.playerTilt = (6 * Math.PI) / 180;

    // Trigger lane change to left (+1)
    const s = b.onLaneChange(1);

    const trickToast = document.getElementById('trick-sticker');
    const trickTag = document.getElementById('trick-tag');

    return {
      damped: s ? s.damped : false,
      waiterRewarded: s ? s.waiterRewarded : false,
      scoreGained: g.stats.score - prevScore,
      comboGained: (g.stats.combo || 0) - prevCombo,
      trickShown: trickToast && !trickToast.classList.contains('hide') ? (trickTag ? trickTag.textContent : '') : null
    };
  });
  console.log('Waiter bonus result:', waiterResult);

  // Capture Screenshot 3: Waiter Bonus toast
  await page.screenshot({ path: path.join(reviewDir, '3-waiter-bonus.png') });

  for (let i = 0; i < 10; i++) {
    await recordFrame();
    await new Promise(r => setTimeout(r, 80));
  }

  // STEP 7: Test Balance Zone holding & gentle glow (|mugTilt| < 4°)
  console.log('[STEP 7] Testing balance zone reward (|mugTilt| < 4° for 5 seconds)...');
  const balanceZoneResult = await page.evaluate(() => {
    const g = window.game;
    const b = g.balance;
    const prevFoam = g.mug.foam;

    // Keep perfectly level
    b.worldRoll = 0;
    b.playerTilt = 0;
    b.mugTilt = 0;

    // Update for 5.1s
    for (let t = 0; t < 5.1; t += 0.1) {
      b.update(0.1, g.player.z, g.player.speed, 0);
    }

    const container = document.getElementById('hud-mug-container');
    const trickToast = document.getElementById('trick-sticker');
    const trickTag = document.getElementById('trick-tag');

    return {
      hasGlowClass: container ? container.classList.contains('balance-glow') : false,
      foamIncreased: g.mug.foam >= prevFoam,
      toastShown: trickToast && !trickToast.classList.contains('hide') ? (trickTag ? trickTag.textContent : '') : null
    };
  });
  console.log('Balance zone result:', balanceZoneResult);

  // Capture Screenshot 4: Balance Zone soft glow
  await page.screenshot({ path: path.join(reviewDir, '4-balance-zone-glow.png') });

  for (let i = 0; i < 8; i++) {
    await recordFrame();
    await new Promise(r => setTimeout(r, 80));
  }

  // STEP 8: Test Obstacle hit perturbation (18° random tilt, ax 1.0)
  console.log('[STEP 8] Testing obstacle hit disturbance...');
  const hitResult = await page.evaluate(() => {
    const g = window.game;
    const b = g.balance;

    const hitSource = b.onHit(1);
    b.update(0.05, g.player.z, g.player.speed, 0);

    return {
      sourceActive: hitSource ? hitSource.active : false,
      sourceType: hitSource ? hitSource.type : null,
      worldRollDeg: ((b.worldRoll * 180) / Math.PI).toFixed(1),
      axImpulse: b.axImpulse.toFixed(2)
    };
  });
  console.log('Hit disturbance result:', hitResult);

  // STEP 9: Assemble CHECKPOINT A3 GIF
  console.log(`[STEP 9] Assembling CHECKPOINT A3 GIF (${gifFrames.length} frames)...`);
  const gifEncoder = new GifEncoder(180, 230);
  gifEncoder.setDelay(90); // ~11 fps
  for (const f of gifFrames) {
    gifEncoder.addFrame(f);
  }
  const gifBuffer = gifEncoder.encode();
  const gifPath = path.join(reviewDir, 'checkpoint_a3_balance.gif');
  fs.writeFileSync(gifPath, gifBuffer);
  console.log(`Saved checkpoint_a3_balance.gif (${Math.round(gifBuffer.length / 1024)} KB)`);

  console.log('\nAll Phase 3.5 assertions PASSED successfully!');
  await browser.close();
}

testPhase3_5().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
