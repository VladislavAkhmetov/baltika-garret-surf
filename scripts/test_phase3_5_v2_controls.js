const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const GifEncoder = require('./gif-encoder');

async function testPhase3_5V2Controls() {
  console.log('--- TEST PHASE 3.5 V2 CONTROLS: "TWO HANDS - TWO JOBS" (§3.4, §5.3 LEVEL1_SPEC) ---');

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
  console.log('[STEP 2] Starting game...');
  await page.click('#btn-start');
  await new Promise(r => setTimeout(r, 600));

  // Verify game state is playing
  const isPlaying = await page.evaluate(() => window.game && window.game.state === 'playing');
  console.log('Game playing status:', isPlaying);
  if (!isPlaying) {
    await page.evaluate(() => { window.game.state = 'playing'; });
  }

  // TEST 1: Keyboard Q/E mug balance controls
  console.log('[TEST 1] Testing Keyboard Q / E for mug balance (120 deg/s & spring return)...');
  await page.evaluate(() => {
    // Press KeyQ (tilt left)
    window.game.input.onKeyDown({ code: 'KeyQ', preventDefault: () => {} });
  });

  // Step game 150ms
  await page.evaluate(() => {
    window.game.input.update(0.15);
    window.game.updatePlayer(0.15);
  });

  const tiltQ = await page.evaluate(() => {
    const inp = window.game.input;
    return {
      playerTiltDeg: inp.state.playerTilt * (180 / Math.PI),
      balanceMode: inp.state.balanceMode,
      laneIndex: inp.state.laneIndex
    };
  });
  console.log('Tilt Q result (holding Q for 150ms):', tiltQ);
  if (tiltQ.playerTiltDeg <= 10) throw new Error(`Expected positive tilt > 10°, got ${tiltQ.playerTiltDeg}`);
  if (tiltQ.laneIndex !== 1) throw new Error(`Expected laneIndex to stay at 1, got ${tiltQ.laneIndex}`);

  // Release KeyQ, test spring return to 0
  await page.evaluate(() => {
    window.game.input.onKeyUp({ code: 'KeyQ' });
    // update 300ms (should return to ~0)
    window.game.input.update(0.30);
  });
  const springQ = await page.evaluate(() => Math.abs(window.game.input.state.playerTilt * (180 / Math.PI)));
  console.log('Spring return after releasing Q (tilt deg):', springQ);
  if (springQ > 2.0) throw new Error(`Expected spring return to 0, got ${springQ}`);

  // TEST 2: Swiping routes while keeping mug level
  console.log('[TEST 2] Testing swipe gestures for surfer route (left/right)...');
  // Swipe Left: x: 250 -> 100
  await page.evaluate(() => {
    const inp = window.game.input;
    inp.onPointerDown({ clientX: 250, clientY: 500, pointerId: 1, target: document.body });
    inp.onPointerUp({ clientX: 100, clientY: 500, pointerId: 1 });
  });

  // Let lane transition proceed
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      window.game.input.update(0.016);
      window.game.updatePlayer(0.016);
    });
  }

  const laneAfterSwipeLeft = await page.evaluate(() => {
    return {
      laneIndex: window.game.input.state.laneIndex,
      targetX: window.game.input.state.targetX,
      playerX: window.game.player.x
    };
  });
  console.log('Lane after swipe left:', laneAfterSwipeLeft);
  if (laneAfterSwipeLeft.laneIndex !== 0) throw new Error(`Expected laneIndex 0 (left lane), got ${laneAfterSwipeLeft.laneIndex}`);

  // Swipe Right: x: 100 -> 250
  await page.evaluate(() => {
    const inp = window.game.input;
    inp.onPointerDown({ clientX: 100, clientY: 500, pointerId: 2, target: document.body });
    inp.onPointerUp({ clientX: 250, clientY: 500, pointerId: 2 });
  });
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      window.game.input.update(0.016);
      window.game.updatePlayer(0.016);
    });
  }
  const laneAfterSwipeRight = await page.evaluate(() => window.game.input.state.laneIndex);
  console.log('Lane after swipe right:', laneAfterSwipeRight);
  if (laneAfterSwipeRight !== 1) throw new Error(`Expected laneIndex 1 (center lane), got ${laneAfterSwipeRight}`);

  // TEST 3: Touch Drag fallback on HUD-Mug
  console.log('[TEST 3] Testing Drag fallback on HUD-mug widget...');
  const mugRect = await page.evaluate(() => {
    const el = document.getElementById('hud-mug-container');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  console.log('Mug center coords:', mugRect);
  // Pointer down on mug and drag left by 50px
  await page.evaluate((pos) => {
    const inp = window.game.input;
    inp.onPointerDown({ clientX: pos.x, clientY: pos.y, pointerId: 3, target: document.getElementById('mug-canvas') });
    inp.onPointerMove({ clientX: pos.x - 50, clientY: pos.y, pointerId: 3 });
    inp.update(0.016);
  }, mugRect);

  const dragTilt = await page.evaluate(() => {
    const inp = window.game.input;
    return {
      tiltDeg: inp.state.playerTilt * (180 / Math.PI),
      balanceMode: inp.state.balanceMode,
      laneIndex: inp.state.laneIndex
    };
  });
  console.log('Drag tilt result (dragged 50px left):', dragTilt);
  if (dragTilt.balanceMode !== 'drag') throw new Error(`Expected balanceMode 'drag', got ${dragTilt.balanceMode}`);
  if (dragTilt.tiltDeg <= 10) throw new Error(`Expected positive tilt > 10°, got ${dragTilt.tiltDeg}`);
  if (dragTilt.laneIndex !== 1) throw new Error(`Drag on mug moved surfer lanes! Surfer should stay in lane 1.`);

  // Release drag
  await page.evaluate((pos) => {
    const inp = window.game.input;
    inp.onPointerUp({ clientX: pos.x - 50, clientY: pos.y, pointerId: 3 });
    inp.update(0.30);
  }, mugRect);
  const dragSpring = await page.evaluate(() => Math.abs(window.game.input.state.playerTilt * (180 / Math.PI)));
  console.log('Drag spring return after release (tilt deg):', dragSpring);
  if (dragSpring > 2.0) throw new Error(`Expected spring return to 0, got ${dragSpring}`);

  // TEST 4: Gyroscope controls ONLY mug balance (does NOT steer lanes)
  console.log('[TEST 4] Testing Gyroscope tilt with zero lane interference...');
  await page.evaluate(() => {
    const inp = window.game.input;
    inp.hasGyro = true;
    inp.gyroCalibrated = true;
    inp.neutralGamma = 0;
    inp.state.balanceMode = 'gyro';
    // Simulate phone tilt left: gamma = -15°
    inp.onDeviceOrientation({ gamma: -15, beta: 30 });
    inp.update(0.05);
    window.game.updatePlayer(0.05);
  });

  const gyroState = await page.evaluate(() => {
    const inp = window.game.input;
    return {
      laneIndex: inp.state.laneIndex,
      targetX: inp.state.targetX,
      playerX: window.game.player.x,
      playerTiltDeg: inp.state.playerTilt * (180 / Math.PI),
      worldRollDeg: window.game.balance ? window.game.balance.worldRoll * (180 / Math.PI) : 0,
      mugTiltDeg: window.game.balance ? window.game.balance.mugTilt * (180 / Math.PI) : 0
    };
  });
  console.log('Gyro state result (phone tilted -15°):', gyroState);
  if (gyroState.laneIndex !== 1) throw new Error('Gyroscope must NOT steer surfer lanes in v2!');
  if (gyroState.playerTiltDeg <= 5) throw new Error(`Expected positive playerTilt > 5°, got ${gyroState.playerTiltDeg}`);

  // TEST 5: Waiter bonus with pre-tilt prior to lane change
  console.log('[TEST 5] Testing Waiter bonus with pre-tilt prior to lane change...');
  // Player tilts right beforehand (for an upcoming lane shift left which will roll right)
  await page.evaluate(() => {
    const inp = window.game.input;
    // Set pre-tilt left (for lane shift left where inertia rolls right)
    inp.state.playerTilt = 0.25; // ~14° left tilt
    inp.state.balanceMode = 'keys';
    // Now trigger lane shift to lane 0 (left)
    inp.shiftLane(-1);
    window.game.updatePlayer(0.016);
  });

  const waiterResult = await page.evaluate(() => {
    const g = window.game;
    const b = g.balance;
    const toast = document.querySelector('.toast-banner');
    return {
      toastText: toast ? toast.textContent : '',
      combo: g.stats.combo,
      laneChangeSourceDamped: b.sources.some(s => s.active && s.type === 'laneChange' && s.damped)
    };
  });
  console.log('Waiter bonus result:', waiterResult);
  if (!waiterResult.laneChangeSourceDamped) throw new Error('Expected waiter bonus damping on laneChange perturbation!');

  // Capture Screenshot of active v2 control system
  console.log('[STEP 6] Capturing review screenshots...');
  await page.screenshot({ path: path.join(reviewDir, '5-v2-controls-verified.png') });
  console.log('Saved review/phase3_5/5-v2-controls-verified.png');

  await browser.close();
  console.log('--- ALL PHASE 3.5 V2 CONTROLS TESTS PASSED 100%! ---');
}

testPhase3_5V2Controls().catch(err => {
  console.error('Test Phase 3.5 V2 failed:', err);
  process.exit(1);
});
