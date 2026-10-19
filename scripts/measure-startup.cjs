const puppeteer = require('puppeteer-core');
const {createServer} = require('./serve');
const path = require('path');

async function run() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  const requests = [];
  page.on('request', req => {
    requests.push({
      url: req.url(),
      type: req.resourceType(),
      time: Date.now()
    });
  });

  page.on('response', async res => {
    try {
      const item = requests.find(r => r.url === res.url());
      if (item) {
        const buf = await res.buffer();
        item.size = buf.length;
        item.status = res.status();
        item.endTime = Date.now();
      }
    } catch(e) {}
  });

  const t0 = Date.now();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const dclTime = Date.now() - t0;

  // Let it settle for 3 seconds to capture everything loaded on first screen
  await new Promise(r => setTimeout(r, 3000));
  const settleTime = Date.now() - t0;

  console.log(`\n=== TIMINGS ===`);
  console.log(`DOMContentLoaded: ${dclTime} ms`);
  console.log(`After 3s total: ${settleTime} ms\n`);

  console.log(`=== NETWORK REQUESTS ON FIRST SCREEN (Total: ${requests.length}) ===`);
  let totalBytes = 0;
  for (const r of requests) {
    const dur = r.endTime ? (r.endTime - r.time) + 'ms' : 'ongoing';
    const sz = r.size ? (r.size / 1024).toFixed(1) + ' KB' : '0 KB';
    if (r.size) totalBytes += r.size;
    const relUrl = r.url.replace(base, '');
    console.log(`${r.type.padEnd(8)} | ${sz.padStart(9)} | ${dur.padStart(6)} | ${relUrl}`);
  }
  console.log(`\nTOTAL DOWNLOADED ON START SCREEN: ${(totalBytes / 1024 / 1024).toFixed(2)} MB (${(totalBytes / 1024).toFixed(1)} KB)`);

  await browser.close();
  server.close();
}

run().catch(console.error);
