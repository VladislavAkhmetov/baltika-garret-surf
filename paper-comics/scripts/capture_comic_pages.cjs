const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  
  await page.goto('http://127.0.0.1:8080/paper-comics/?comic', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'paper-comics/review/game-comic-page0.png' });
  console.log('Page 0 screenshot saved');

  const nextBtn = await page.$('#story-next');
  if (nextBtn) {
    await nextBtn.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'paper-comics/review/game-comic-page1.png' });
    console.log('Page 1 screenshot saved');
  }

  await browser.close();
})();
