const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function testMobileMugAndGyro() {
  console.log('--- TEST MOBILE MUG & GYROSCOPE STEERING ---');

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
  const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');

  console.log('[STEP 1] Loading sandbox.html in mobile mode (gyro default)...');
  await page.goto(fileUrl, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 800));

  console.log('[STEP 2] Tapping start button...');
  await page.click('#btn-sandbox-start');
  // Wait for 3-2-1 countdown (1.5s)
  await new Promise(r => setTimeout(r, 2000));

  // Check state and mug status
  const mugStatus = await page.evaluate(() => {
    const g = window.game;
    const canvas = document.getElementById('mug-canvas');
    const container = document.getElementById('hud-mug-container');
    const label = document.getElementById('mug-pct-label');
    const mult = document.getElementById('mug-multiplier-badge');

    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonTransparentPixels = 0;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 10) nonTransparentPixels++;
    }

    return {
      gameState: g.state,
      containerVisible: container && window.getComputedStyle(container).display !== 'none',
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasStyleWidth: canvas.style.width,
      canvasStyleHeight: canvas.style.height,
      nonTransparentPixels,
      labelText: label ? label.textContent : null,
      multiplierText: mult ? mult.textContent : null,
      mugLevel: g.mug.level,
      hasMugRenderer: !!g.mugRenderer
    };
  });

  console.log('[MUG STATUS]:', mugStatus);

  if (mugStatus.nonTransparentPixels === 0) {
    throw new Error('FAIL: Mug canvas has 0 rendered pixels! Mug is invisible!');
  }
  console.log('✓ PASS: Mug canvas has rendered pixels (' + mugStatus.nonTransparentPixels + ' px)');

  // Test Gyroscope steering
  console.log('[STEP 3] Testing Gyroscope Steering (dispatching gamma=25° tilt to the right)...');
  const steerResult = await page.evaluate(() => {
    const g = window.game;
    const initialX = g.physics.state.x;

    // Simulate device orientation right tilt: gamma = 25
    g.input.onDeviceOrientation({
      gamma: 25,
      beta: 45
    });

    // Run 30 physics steps
    for (let i = 0; i < 30; i++) {
      g.updateGame(0.016);
    }

    return {
      initialX: initialX.toFixed(2),
      afterX: g.physics.state.x.toFixed(2),
      worldX: g.physics.state.worldX.toFixed(2),
      lean: g.input.state.lean.toFixed(2),
      headingDeg: (g.physics.state.heading * 180 / Math.PI).toFixed(1),
      speed: g.physics.state.speed.toFixed(1)
    };
  });

  console.log('[GYRO STEER RESULT]:', steerResult);

  if (parseFloat(steerResult.lean) < 0.5) {
    throw new Error('FAIL: Lean did not respond to gamma=25 tilt! Lean = ' + steerResult.lean);
  }
  if (parseFloat(steerResult.headingDeg) < 5) {
    throw new Error('FAIL: Heading did not turn right! HeadingDeg = ' + steerResult.headingDeg);
  }
  console.log('✓ PASS: Gyro tilt steered the surfer successfully!');

  // Take full mobile screenshot
  const shotPath = path.join(reviewDir, 'mobile-mug-verified.png');
  await page.screenshot({ path: shotPath });
  console.log('✓ Saved screenshot to:', shotPath);

  await browser.close();
  console.log('--- ALL MOBILE MUG & GYRO TESTS PASSED! ---');
}

testMobileMugAndGyro().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
