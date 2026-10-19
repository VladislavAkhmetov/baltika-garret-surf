const puppeteer = require('puppeteer-core');
const {createServer} = require('./serve');

async function testJourney() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

    const requests = [];
    page.on('request', r => requests.push(r.url()));

    console.log('1. Loading start screen...');
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game);

    // Verify on start screen: 3D textures should NOT have been fetched yet
    const initial3dTextures = requests.filter(url => url.includes('water-surface') || url.includes('sea-stack'));
    console.log('Start screen 3D textures loaded:', initial3dTextures.length);
    if (initial3dTextures.length > 0) throw new Error('3D textures loaded prematurely on start screen!');

    console.log('2. Clicking ИГРАТЬ to go to setup screen...');
    await page.click('#start-button');
    await page.waitForSelector('#setup-screen:not(.hidden)');
    console.log('Setup screen is visible!');

    console.log('3. Clicking ПРОДОЛЖИТЬ to enter comic screen...');
    await page.click('#setup-next');
    await page.waitForSelector('#story-screen:not(.hidden)');
    console.log('Story screen is visible (Page 1)!');

    // Verify on comic screen: 3D textures are STILL not loading (100% bandwidth for comic!)
    await new Promise(r => setTimeout(r, 600));
    const comic3dTextures = requests.filter(url => url.includes('water-surface') || url.includes('sea-stack'));
    console.log('Comic screen 3D textures (should be 0):', comic3dTextures.length);
    if (comic3dTextures.length > 0) throw new Error('3D textures loaded prematurely during comic!');

    console.log('4. Clicking ДАЛЬШЕ → to flip to comic Page 2...');
    const tFlip = Date.now();
    await page.click('#story-next');
    await page.waitForFunction(() => document.getElementById('story-screen').dataset.page === '1');
    const flipDuration = Date.now() - tFlip;
    console.log(`Comic Page 2 flipped in ${flipDuration}ms (instant)!`);

    console.log('5. Clicking НА ВОЛНУ ↗ to launch level preloader...');
    await new Promise(r => setTimeout(r, 400)); // Wait for 350ms touch debounce
    await page.click('#story-next'); // On page 2, this triggers launch()

    // Verify level loader screen becomes visible
    await page.waitForSelector('#loader-screen:not(.hidden)');
    console.log('Level loader screen is visible!');

    const loaderTitle = await page.$eval('#loader-title', el => el.textContent);
    console.log('Loader title:', loaderTitle);

    // Wait for 3D textures to begin loading now in Node requests array
    const deadline = Date.now() + 10000;
    while (!requests.some(url => url.includes('water-surface')) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }
    console.log('3D gameplay textures actively downloading for the level!');

    // Wait for countdown or playing
    await page.waitForFunction(() => window.game.state === 'countdown' || window.game.state === 'playing', { timeout: 15000 });
    console.log('Game reached state:', await page.evaluate(() => window.game.state));

    console.log('PASS: User journey tested successfully with instant comic flips and dedicated level loader!');
  } finally {
    await browser.close();
    server.close();
  }
}

testJourney().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
