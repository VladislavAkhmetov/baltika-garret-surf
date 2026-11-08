const puppeteer = require('puppeteer-core');
(async () => {
  const executablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8080/paper-comics/aviasales.html');
  await page.waitForSelector('#start-button');
  await page.evaluate(() => {
    window.game.start(true);
    window.game.p.z = 1205;
    window.game.finish();
  });
  await new Promise(r => setTimeout(r, 1000));
  const title = await page.$eval('#result-title', el => el.textContent);
  const comment = await page.$eval('#result-comment', el => el.textContent);
  const trophyHidden = await page.$eval('#result-trophy', el => el.classList.contains('hidden') || getComputedStyle(el).display === 'none');
  const stampText = await page.$eval('#result-stamp', el => el.textContent.trim().replace(/\s+/g, ' '));
  console.log('Result title:', title);
  console.log('Result comment:', comment);
  console.log('Trophy hidden:', trophyHidden);
  console.log('Stamp text:', stampText);
  await browser.close();
})();