const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function record() {
  const framesDir = path.resolve(__dirname, '..', '.frames');
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

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
  await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  const filePath = path.resolve(__dirname, '..', 'index.html');
  await page.goto('file:///' + filePath.replace(/\\/g, '/') + '?debug=1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));

  // Start game
  await page.click('#btn-start');
  await new Promise(r => setTimeout(r, 2600));

  console.log('Recording 58 frames (approx 5s) with all 3 lanes, turns and jump...');
  const totalFrames = 58;

  for (let i = 0; i < totalFrames; i++) {
    await page.evaluate((frameIdx) => {
      if (window.game && window.game.input) {
        if (frameIdx === 8) {
          window.game.input.setTargetLane(0); // влево на экране (+2.4)
        } else if (frameIdx === 22) {
          window.game.jump(); // прыжок над левой полосой
        } else if (frameIdx === 32) {
          window.game.input.setTargetLane(1); // в центр (0)
        } else if (frameIdx === 44) {
          window.game.input.setTargetLane(2); // вправо на экране (-2.4)
        }
      }
    }, i);

    const framePath = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: framePath });
    await new Promise(r => setTimeout(r, 80));
  }

  await browser.close();
  console.log('Frames captured successfully!');
}

record().catch(console.error);
