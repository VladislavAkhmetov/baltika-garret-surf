const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--allow-file-access-from-files'
    ]
  });
  const page = await browser.newPage();
  
  const shotPath = path.resolve('C:/Users/amazi/.gemini/antigravity/brain/d1f205d3-882e-4d65-8030-81fa9ac72ecd/1-wave-pocket.png');
  const fileUrl = 'file:///' + shotPath.replace(/\\/g, '/');

  await page.goto(fileUrl);

  const stats = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const width = canvas.width;
    const height = canvas.height;

    let totalWater = 0;
    let whiteCount = 0;

    // y from 35% of height to bottom (wave & water zone)
    for (let y = Math.floor(height * 0.35); y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Exclude HUD mug rect
        if (x < 130 && y > height - 150) continue;

        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        totalWater++;
        // White/foam pixel: R > 215, G > 215, B > 200
        if (r > 215 && g > 215 && b > 200) {
          whiteCount++;
        }
      }
    }

    return {
      totalWater,
      whiteCount,
      percent: (whiteCount / totalWater) * 100
    };
  });

  console.log(`Evaluated water area pixels: ${stats.totalWater}`);
  console.log(`White/foam pixels: ${stats.whiteCount} (${stats.percent.toFixed(2)}%)`);
  console.log(`Criterion (< 15%): ${stats.percent < 15.0 ? 'PASS ✓' : 'FAIL ✗'}`);

  await browser.close();
})();
