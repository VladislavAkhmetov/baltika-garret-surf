// Resize/encode generated masters for mobile delivery, preserving their alpha.
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

async function run() {
  const folder = path.resolve(__dirname, '../assets/comics/hud');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    for (const [name, width] of [['paper-blank', 768], ['ink-blank', 768], ['crown-cream', 256]]) {
      const input = path.join(folder, name + '.png');
      if (!fs.existsSync(input)) throw new Error('Missing generated master: ' + input);
      const source = 'data:image/png;base64,' + fs.readFileSync(input).toString('base64');
      const encoded = await page.evaluate(async ({source, width}) => {
        const image = new Image(); image.src = source; await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = Math.round(width * image.height / image.width);
        const context = canvas.getContext('2d');
        context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/webp', .88).split(',')[1];
      }, {source, width});
      const output = path.join(folder, name + '.webp');
      fs.writeFileSync(output, Buffer.from(encoded, 'base64'));
      console.log(name + ': ' + fs.statSync(output).size + ' bytes');
    }
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
