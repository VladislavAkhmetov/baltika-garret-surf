const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const targets = [
  { rel: 'assets/comics/water-surface-v5.png', quality: 0.92, scale: 1 },
  { rel: 'assets/comics/rival-grandma-v2.png', quality: 0.94, scale: 1 },
  { rel: 'assets/comics/rival-dj-v2.png', quality: 0.94, scale: 1 },
  { rel: 'assets/comics/rival-blonde.png', quality: 0.94, scale: 1 },
  { rel: 'assets/comics/rival-couple-tandem-v4.png', quality: 0.94, scale: 1 },
  { rel: 'assets/comics/seaplane-lime-v3.png', quality: 0.94, scale: 1 },
  { rel: 'assets/comics/hero-save-close.png', quality: 0.94, scale: 1 },
  { rel: 'assets/comics/hero-transfer-close.png', quality: 0.94, scale: 1 },
  { rel: 'assets/comics/wave-swell-cutout-v5.png', quality: 0.94, scale: 1 },
  { rel: 'assets/comics/garret-lemon-paper.png', quality: 0.94, scale: 1 },
  { rel: 'assets/comics/garret-raspberry-peach-paper.png', quality: 0.94, scale: 1 },
  { rel: 'assets/comics/mug-paper-frame.png', quality: 0.94, scale: 1 }
];

async function run() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();

  const roots = [
    path.resolve(__dirname, '..'), // paper-comics
    path.resolve(__dirname, '../..') // baltika 2 root
  ];

  for (const item of targets) {
    const srcPath = path.resolve(__dirname, '..', item.rel);
    if (!fs.existsSync(srcPath)) {
      console.warn('Source file not found:', srcPath);
      continue;
    }
    const origBuf = fs.readFileSync(srcPath);
    const base64 = 'data:image/png;base64,' + origBuf.toString('base64');

    const outWebpBase64 = await page.evaluate(async (dataUri, scale, quality) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL('image/webp', quality);
          resolve(url);
        };
        img.onerror = () => reject(new Error('Image failed to load in Chromium canvas'));
        img.src = dataUri;
      });
    }, base64, item.scale, item.quality);

    const outBuf = Buffer.from(outWebpBase64.replace(/^data:image\/webp;base64,/, ''), 'base64');
    const webpRel = item.rel.replace(/\.png$/, '.webp');

    for (const r of roots) {
      const dest = path.resolve(r, webpRel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, outBuf);
    }

    const savedKB = ((origBuf.length - outBuf.length) / 1024).toFixed(1);
    const pct = ((outBuf.length / origBuf.length) * 100).toFixed(1);
    console.log(`Converted: ${item.rel} -> ${(origBuf.length/1024).toFixed(1)} KB to ${(outBuf.length/1024).toFixed(1)} KB (${pct}%, saved ${savedKB} KB)`);
  }

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
