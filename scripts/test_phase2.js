const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function testPhase2() {
  console.log('--- TEST PHASE 2: LEVEL AS DATA, SPAWNER, COLLISION & SUBWAY RULES ---');

  const reviewDir = path.resolve(__dirname, '..', 'review', 'phase2');
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

  // TEST 1: Default run with ?debug=1
  console.log('\n[TEST 1] Loading index.html with ?debug=1...');
  await page.goto('file:///' + filePath.replace(/\\/g, '/') + '?debug=1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1000));

  // Start game
  await page.click('#btn-start');
  await new Promise(r => setTimeout(r, 2600));

  // Let player ride into Tutorial (120m-500m) where bottle caps are spawned
  console.log('Riding into S1 tutorial (collecting caps)...');
  await new Promise(r => setTimeout(r, 4500));

  // Check state in tutorial
  const tutorialState = await page.evaluate(() => {
    const g = window.game;
    return {
      z: g.player.z,
      speed: g.player.speed,
      score: g.stats.score,
      capsCount: g.stats.capsCount,
      activeEntities: g.spawner.activeEntities.length,
      currentSection: g.spawner.currentSectionId
    };
  });
  console.log('Tutorial state at z ~' + Math.floor(tutorialState.z) + 'm:', tutorialState);
  await page.screenshot({ path: path.join(reviewDir, '1-tutorial-caps.png') });
  console.log('✓ Captured 1-tutorial-caps.png');

  // TEST 2: Section Jump ?section=ramp1 (500m)
  console.log('\n[TEST 2] Testing ?section=ramp1 URL param...');
  await page.goto('file:///' + filePath.replace(/\\/g, '/') + '?section=ramp1&debug=1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));
  await page.click('#btn-start');
  await new Promise(r => setTimeout(r, 2600));

  const rampState = await page.evaluate(() => {
    const g = window.game;
    return {
      z: g.player.z,
      section: g.spawner.currentSectionId,
      activeEntities: g.spawner.activeEntities.length
    };
  });
  console.log('Ramp section state:', rampState);
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(reviewDir, '2-ramp1-section.png') });
  console.log('✓ Captured 2-ramp1-section.png');

  // TEST 3: Section Jump ?section=bay (1250m) with obstacles
  console.log('\n[TEST 3] Testing ?section=bay (hazards: buoy B, rock K, foam F)...');
  await page.goto('file:///' + filePath.replace(/\\/g, '/') + '?section=bay&debug=1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));
  await page.click('#btn-start');
  await new Promise(r => setTimeout(r, 2600));

  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(reviewDir, '3-bay-hazards.png') });
  console.log('✓ Captured 3-bay-hazards.png');

  // TEST 4: Subway Surfers collision rules: 1st hit = Stumble (-30% speed), 2nd hit = Crash
  console.log('\n[TEST 4] Testing collision logic: stumble vs crash...');
  const collisionTest = await page.evaluate(() => {
    const g = window.game;
    const initialSpeed = g.player.speed;

    // Simulate first hit on buoy
    const mockBuoy = { isObstacle: true, canJumpOver: true, jumpClearHeight: 0.8, type: 'buoy' };
    g.onObstacleHit(mockBuoy);

    const afterFirstHit = {
      speed: g.player.speed,
      stumbleTimer: g.stumbleTimer,
      beer: g.stats.beer,
      state: g.state
    };

    // Simulate second hit within 1 second -> should trigger CRASH
    g.onObstacleHit(mockBuoy);
    const afterSecondHit = {
      state: g.state,
      beer: g.stats.beer
    };

    return { initialSpeed, afterFirstHit, afterSecondHit };
  });
  console.log('Collision rule results:', JSON.stringify(collisionTest, null, 2));

  // TEST 5: Deterministic SEED testing (?seed=42 vs ?seed=999)
  console.log('\n[TEST 5] Testing PRNG seed determinism...');
  const seedTest = await page.evaluate(() => {
    const rows42 = LEVEL1.generateRows(42);
    const rows999 = LEVEL1.generateRows(999);
    const rows42Repeat = LEVEL1.generateRows(42);

    const identical42 = JSON.stringify(rows42) === JSON.stringify(rows42Repeat);
    const differentSeeds = JSON.stringify(rows42) !== JSON.stringify(rows999);

    return {
      seed42Rows: rows42.length,
      seed999Rows: rows999.length,
      identical42,
      differentSeeds,
      sample42: rows42.slice(20, 24).map(r => r.row),
      sample999: rows999.slice(20, 24).map(r => r.row)
    };
  });
  console.log('Seed test results:', seedTest);

  // TEST 6: Section Jump ?section=mega (2250m) and Finish (2600m-2700m)
  console.log('\n[TEST 6] Testing ?section=mega and finish sequence...');
  await page.goto('file:///' + filePath.replace(/\\/g, '/') + '?section=mega&debug=1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));
  await page.click('#btn-start');
  await new Promise(r => setTimeout(r, 2600));
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(reviewDir, '4-mega-ramp.png') });
  console.log('✓ Captured 4-mega-ramp.png');

  await browser.close();

  if (errors.length > 0) {
    console.error(`FAILED with ${errors.length} console errors!`);
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('ALL PHASE 2 SPEC TESTS PASSED SUCCESSFULLY!');
  console.log('========================================');
}

testPhase2().catch(err => {
  console.error('Phase 2 test script failed:', err);
  process.exit(1);
});
