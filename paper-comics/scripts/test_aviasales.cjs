const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('../../scripts/serve.js');

async function testAviasales() {
  const server = createServer();
  await new Promise(r => server.listen(8099, '127.0.0.1', r));
  console.log('Server listening on http://127.0.0.1:8099');

  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  const fs = require('fs');
  const executablePath = edgePaths.find(p => fs.existsSync(p));
  if (!executablePath) {
    console.error('No browser executable found');
    server.close();
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => {
    console.error('Page error:', err.message);
    errors.push(err.message);
  });

  console.log('Loading /paper-comics/aviasales.html...');
  await page.goto('http://127.0.0.1:8099/paper-comics/aviasales.html', { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Check title
  const title = await page.title();
  console.log('Page title:', title);

  // Wait for button
  await page.waitForSelector('#start-button', { timeout: 10000 });
  const btnText = await page.$eval('#start-button', el => el.textContent.trim());
  console.log('Start button text:', btnText);

  // Click start button to go to setup
  console.log('Clicking start button...');
  await page.click('#start-button');
  await new Promise(r => setTimeout(r, 600));

  // Check setup screen
  const locationName = await page.$eval('#location-name', el => el.textContent.trim());
  console.log('Location name in setup:', locationName);

  // Click continue to go to story
  console.log('Clicking continue to open comic story...');
  await page.click('#setup-next');
  await new Promise(r => setTimeout(r, 1200));

  // Check comic panels
  const panels = await page.$$eval('.comic-panel', els => els.map(e => e.className));
  console.log('Rendered comic panels:', panels);

  const bubbleTexts = await page.$$eval('.comic-bubble', els => els.map(e => e.textContent.trim()));
  console.log('Comic speech bubbles:', bubbleTexts);

  // Click start game from comic
  console.log('Launching wave from story...');
  await page.click('#story-next');
  await new Promise(r => setTimeout(r, 2000));

  // Check game state
  const gameState = await page.evaluate(() => window.game ? window.game.state : null);
  console.log('Game state after launch:', gameState);

  const isAviasales = await page.evaluate(() => window.game ? window.game.isAviasales : null);
  console.log('Game isAviasales flag:', isAviasales);

  const passportTicketText = await page.$eval('.beer-ticket .ticket-label', el => el.textContent.trim());
  console.log('Ticket label:', passportTicketText);

  await browser.close();
  server.close();

  if (errors.length > 0) {
    console.error('Test completed with errors:', errors);
    process.exit(1);
  } else {
    console.log('ALL AVIASALES CHECKS PASSED!');
    process.exit(0);
  }
}

testAviasales().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});