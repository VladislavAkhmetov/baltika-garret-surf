const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./serve');

(async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 393, height: 852 });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.game);
  await page.click('#start-button');
  await page.click('#setup-next');
  await page.waitForFunction(() => document.getElementById('comic-loading').hidden);
  await page.click('#story-skip');
  await page.waitForFunction(() => game.state === 'playing');

  await page.evaluate(async () => {
    game.state = 'paused';
    game.heroAnimator.apply('trim', 0);
    game.handBeer.roll = 0;
    game.handBeer.rollVelocity = 0;
    game.heroAnimator.fingers.visible = false;

    await new Promise(resolve => {
      game.handBeer.frame = new Image();
      game.handBeer.frame.src = 'assets/comics/glass-paper-frame.png';
      game.handBeer.frame.onload = () => {
        game.handBeer.draw = function() {
          const c = this.ctx, l = this.liquid;
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
          c.restore();
          c.drawImage(this.frame, 58, 54, 269, 365);
        };
        this.game.handBeer.draw();
        this.game.handBeer.texture.needsUpdate = true;
        resolve();
      };
    });
  });

  const xs = [-0.05, 0.0, 0.05, 0.08, 0.11, 0.14, 0.17, 0.20];
  for (const x of xs) {
    await page.evaluate((val) => {
      game.handBeer.mesh.scale.set(0.85, 0.85, 0.85);
      game.handBeer.mesh.position.set(val, -0.06, -0.02);
      game.handBeer.mesh.renderOrder = 2; // glass behind hand
      game.renderDirty = true;
      game.renderer.render(game.scene, game.camera);
    }, x);
    await new Promise(r => setTimeout(r, 60));
    await page.screenshot({ path: path.resolve(__dirname, `../../scratch_pos_x_${x}.png`) });
  }

  await browser.close();
  server.close();
  console.log('Done scanning x positions.');
})();
