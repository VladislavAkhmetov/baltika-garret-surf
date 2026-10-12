const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('./serve');

async function testGlassGrip() {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.game);
    await page.click('#start-button');
    await page.click('#setup-next');
    await page.waitForFunction(() => document.getElementById('comic-loading').hidden);
    await page.click('#story-skip');
    await page.waitForFunction(() => game.state === 'playing');

    // Load new glass frame in handBeer
    await page.evaluate(async () => {
      game.state = 'paused';
      game.heroAnimator.apply('trim', 0);
      game.handBeer.roll = 0;
      game.handBeer.rollVelocity = 0;
      game.heroAnimator.fingers.visible = false;

      // Load glass-paper-frame.png
      await new Promise(resolve => {
        game.handBeer.frame = new Image();
        game.handBeer.frame.src = 'assets/comics/glass-paper-frame.png';
        game.handBeer.frame.onload = () => {
          // Update draw method to draw centered glass frame:
          // x = 58, y = 54, width = 269, height = 365
          game.handBeer.draw = function() {
            const c = this.ctx, l = this.liquid, t = this.game.time || 0;
            c.clearRect(0, 0, 384, 480);
            c.save();
            this.inside(c);
            c.clip();
            const top = 382 - l.level * 267, points = [];
            for (let i = 0; i < l.n; i++) {
              const x = 121 + i / (l.n - 1) * 143;
              points.push({ x, y: Math.max(79, Math.min(387, top - l.h[i] * 285)) });
            }
            const beer = c.createLinearGradient(0, 90, 0, 405);
            beer.addColorStop(0, '#ffe179');
            beer.addColorStop(.22, '#ffc032');
            beer.addColorStop(.65, '#d78616');
            beer.addColorStop(1, '#9b4912');
            c.fillStyle = beer;
            c.beginPath();
            points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
            c.lineTo(258, 409);
            c.lineTo(120, 409);
            c.closePath();
            c.fill();

            // Foam
            const foamHeight = 8 + l.foam * 15;
            c.strokeStyle = '#f1dfb6';
            c.lineWidth = foamHeight + 4;
            c.beginPath();
            points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
            c.stroke();
            c.strokeStyle = '#fff8de';
            c.lineWidth = foamHeight;
            c.stroke();
            c.fillStyle = '#fffdf0';
            points.forEach((p, i) => {
              c.beginPath();
              c.arc(p.x, p.y - foamHeight * .25, 3.5 + (i % 3), 0, Math.PI * 2);
              c.fill();
            });
            c.restore();

            // Draw glass frame
            c.drawImage(this.frame, 58, 54, 269, 365);
          };
          this.game.handBeer.draw();
          this.game.handBeer.texture.needsUpdate = true;
          resolve();
        };
      });

      game.updateVisuals(0);
    });

    const testGrid = [
      { id: 'glass_x22_y06', x: 0.22, y: -0.06, s: 0.88, z: 0.035, fingers: false },
      { id: 'glass_x26_y06', x: 0.26, y: -0.06, s: 0.88, z: 0.035, fingers: false },
      { id: 'glass_x28_y06', x: 0.28, y: -0.06, s: 0.88, z: 0.035, fingers: false },
      { id: 'glass_x30_y06', x: 0.30, y: -0.06, s: 0.88, z: 0.035, fingers: false },
      { id: 'glass_x28_y03', x: 0.28, y: -0.03, s: 0.88, z: 0.035, fingers: false },
      { id: 'glass_x28_y09', x: 0.28, y: -0.09, s: 0.88, z: 0.035, fingers: false },
      // Behind hand:
      { id: 'glass_x22_y06_behind', x: 0.22, y: -0.06, s: 0.88, z: -0.02, fingers: false, ro: 2 },
      { id: 'glass_x26_y06_behind', x: 0.26, y: -0.06, s: 0.88, z: -0.02, fingers: false, ro: 2 },
      { id: 'glass_x28_y06_behind', x: 0.28, y: -0.06, s: 0.88, z: -0.02, fingers: false, ro: 2 },
      { id: 'glass_x30_y06_behind', x: 0.30, y: -0.06, s: 0.88, z: -0.02, fingers: false, ro: 2 },
      { id: 'glass_x32_y06_behind', x: 0.32, y: -0.06, s: 0.88, z: -0.02, fingers: false, ro: 2 },
      { id: 'glass_x28_y09_behind', x: 0.28, y: -0.09, s: 0.88, z: -0.02, fingers: false, ro: 2 },
    ];

    for (const g of testGrid) {
      await page.evaluate((cfg) => {
        game.handBeer.mesh.scale.set(cfg.s, cfg.s, cfg.s);
        game.handBeer.mesh.position.set(cfg.x, cfg.y, cfg.z);
        if (cfg.ro) game.handBeer.mesh.renderOrder = cfg.ro;
        else game.handBeer.mesh.renderOrder = 4;
        game.heroAnimator.fingers.visible = cfg.fingers;
        game.handBeer.draw();
        game.handBeer.texture.needsUpdate = true;
        game.renderDirty = true;
        game.renderer.render(game.scene, game.camera);
      }, g);

      await new Promise(r => setTimeout(r, 60));
      const shotPath = path.resolve(__dirname, `../../scratch_${g.id}.png`);
      await page.screenshot({ path: shotPath });
    }
    console.log('Finished testing glass grip grid.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

testGlassGrip().catch(console.error);
