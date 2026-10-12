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
    game.heroAnimator.fingers.visible = false;

    // Set glass frame and draw method
    await new Promise(resolve => {
      game.handBeer.frame = new Image();
      game.handBeer.frame.src = 'assets/comics/glass-paper-frame.png';
      game.handBeer.frame.onload = () => {
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

          // Carbonation bubbles
          c.fillStyle = '#fff0ae';
          for (let i = 0; i < 22; i++) {
            const x = 136 + (i * 53) % 107, y = 383 - ((t * (19 + i % 3 * 8) + i * 27) % 275), index = Math.round((x - 121) / 143 * (l.n - 1));
            if (y > points[index].y + 10) {
              c.globalAlpha = .25 + i % 4 * .12;
              c.beginPath();
              c.ellipse(x + Math.sin(t * 2 + i) * 2, y, 1.5 + i % 3, 2.2 + i % 3, 0, 0, Math.PI * 2);
              c.fill();
            }
          }
          c.globalAlpha = 1;

          // Foam
          const foamHeight = 10 + l.foam * 15;
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

          // Glass frame
          c.drawImage(this.frame, 58, 54, 269, 365);
        };
        this.game.handBeer.draw();
        this.game.handBeer.texture.needsUpdate = true;
        resolve();
      };
    });

    game.handBeer.mesh.scale.set(0.85, 0.85, 0.85);
    game.handBeer.mesh.position.set(0.08, -0.06, -0.02);
    game.handBeer.mesh.renderOrder = 2; // Glass behind hand so hand holds glass
  });

  const poses = [
    { state: 'trim', frame: 0 },
    { state: 'trim', frame: 2 },
    { state: 'trim', frame: 4 },
    { state: 'left', frame: 2 },
    { state: 'left', frame: 4 },
    { state: 'right', frame: 2 },
    { state: 'right', frame: 4 },
    { state: 'recovery', frame: 2 },
  ];

  for (const p of poses) {
    await page.evaluate((st, fr) => {
      game.heroAnimator.apply(st, fr);
      game.handBeer.update();
      game.handBeer.draw();
      game.handBeer.texture.needsUpdate = true;
      game.renderDirty = true;
      game.renderer.render(game.scene, game.camera);
    }, p.state, p.frame);

    await new Promise(r => setTimeout(r, 60));
    const shotPath = path.resolve(__dirname, `../../scratch_full_glass_${p.state}_${p.frame}.png`);
    await page.screenshot({ path: shotPath });
  }

  await browser.close();
  server.close();
  console.log('Done testing all poses with glass.');
})();
