const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('./serve');

async function run() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const review = path.resolve(__dirname, '../review/comics/hero-poses-v7');
  fs.mkdirSync(review, { recursive: true });
  const errors = [], missing = [], poses = [], layouts = [];
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      userDataDir: path.join(review, 'browser-profile'),
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) missing.push(response.url()); });
    await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.game);
    await page.evaluate(async () => {
      await game.start(false);
      game.state = 'paused';
      game.animationReview = true;
      game.onboarding.completed = new Set(['steer', 'wave', 'jump', 'landing', 'balance']);
      game.comics.reset();
    });
    const setup = async (state = 'trim', frame = 0, level = 1) => page.evaluate((state, frame, level) => {
      const g = game;
      g.p.z = 55; g.p.x = 0; g.time = 2.2; g.wave.time = g.time;
      g.p.y = g.wave.height(g.p.x, g.p.z); g.p.lean = state === 'left' ? -.65 : state === 'right' ? .65 : 0;
      g.p.airborne = false; g.p.fallen = false; g.balance.roll = 0;
      g.mug.level = level; g.mug.h.fill(0); g.handBeer.roll = 0; g.handBeer.rollVelocity = 0;
      g.heroAnimator.apply(state, frame); g.updateCamera(1, true);
      g.wave.update(g.p.z, g.time, true); g.updateVisuals(0); g.handBeer.draw();
      g.handBeer.texture.needsUpdate = true; g.updateHUD(); g.renderer.render(g.scene, g.camera);
      g.scene.updateMatrixWorld(true);
      const h = g.heroAnimator, contact = h.footAnchor.clone(); g.player.card.localToWorld(contact);
      const deck = new THREE.Vector3(0, 0, .018); g.player.board.localToWorld(deck);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(g.player.board.getWorldQuaternion(new THREE.Quaternion()));
      const feetOnDeck = h.soles[state][frame].map(([x, y]) => {
        const foot = new THREE.Vector3((x / 384 - .5) * h.width, (.5 - y / 512) * h.height, 0);
        g.player.card.localToWorld(foot);
        const ray = foot.clone().sub(g.camera.position).normalize();
        foot.addScaledVector(ray, deck.clone().sub(foot).dot(normal) / ray.dot(normal));
        g.player.board.worldToLocal(foot);
        return [foot.x, foot.y];
      });
      const grip = h.currentGrip, pivot = g.handBeer.pivot.position;
      const held = new THREE.Vector3((g.handBeer.gripCanvas.x / 384 - .5) * 1.12,
        (.5 - g.handBeer.gripCanvas.y / 480) * 1.4, 0);
      g.handBeer.mesh.localToWorld(held);
      const anchor = new THREE.Vector3(grip.x, grip.y, -.005); g.player.card.localToWorld(anchor);
      return { state, frame, footError: contact.distanceTo(deck), gripError: Math.hypot(grip.x - pivot.x, grip.y - pivot.y),
        handleError: held.distanceTo(anchor), width: h.width, height: h.height, feetOnDeck,
        deckSize: [g.player.board.geometry.parameters.width, g.player.board.geometry.parameters.height],
        renderOrder: [g.handBeer.mesh.renderOrder, g.player.card.renderOrder] };
    }, state, frame, level);
    const shot = async name => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: path.join(review, name + '.png') });
    };
    for (const state of ['trim', 'left', 'right', 'recovery', 'air', 'trick', 'landing']) {
      for (let frame = 0; frame < 8; frame++) {
        const result = await setup(state, frame);
        assert.ok(result.footError < 1e-6, state + frame + ' feet drift');
        assert.equal(result.gripError, 0, state + frame + ' attachment drift');
        assert.ok(result.handleError < 1e-6, state + frame + ' handle is not held');
        assert.ok(result.feetOnDeck.every(([x, y]) => Math.abs(x) < result.deckSize[0] * .47 && Math.abs(y) < result.deckSize[1] * .4), state + frame + ' foot outside deck');
        assert.ok(result.renderOrder[0] < result.renderOrder[1], 'hand should occlude handle');
        poses.push(result);
        if (frame === 0 || frame === 4) await shot(state + '-' + frame);
      }
    }
    const routing = await page.evaluate(() => {
      const g = game, h = g.heroAnimator, j = g.jump, results = [];
      const sample = label => { h.update(0); results.push({ label, state: h.state, source: h.currentSource }); };
      g.p.airborne = true; j.spinStarted = false; j.spinCompleted = false; j.airTime = .2; sample('flight');
      j.spinStarted = true; j.spinProgress = .5; sample('rotation');
      j.spinCompleted = true; sample('exit');
      g.p.airborne = false; j.landingPulse = 1;
      for (const age of [0, .16, .26]) { j.landingAge = age; sample('landing-' + age); }
      g.reset(); g.state = 'paused'; g.animationReview = true;
      return results;
    });
    assert.deepEqual(routing.map(r => r.source), ['air', 'trick', 'air', 'landing', 'compress', 'base']);
    for (const level of [1, .5, .1, 0]) {
      await setup('trim', 0, level); await shot('beer-' + Math.round(level * 100));
    }
    const physics = await page.evaluate(() => {
      const g = game, beer = g.handBeer;
      g.mug.reset(); beer.reset(); g.p.lean = .75; g.p.crouch = 0; g.p.pitch = 0;
      for (let i = 0; i < 120; i++) { g.time += 1 / 120; beer.step(1 / 120, .8, .08, i < 24 ? 1.2 : 0); }
      const slosh = Math.max(...g.mug.h.map(Math.abs));
      const before = g.mug.level;
      g.mug.foam = 0; g.mug.h[0] = .65; g.mug.h[g.mug.n - 1] = .5;
      for (let i = 0; i < 12; i++) g.mug.step(1 / 120, 0, 0, 0);
      const after = g.mug.level, drops = beer.drops.length;
      g.heroAnimator.apply('trim', 0); beer.update(); beer.draw(); beer.texture.needsUpdate = true;
      g.renderer.render(g.scene, g.camera);
      const result = { slosh, before, after, spilled: g.mug.totalSpilled, drops, roll: beer.roll,
        sharedLiquid: g.mug === beer.liquid, canvas: [beer.canvas.width, beer.canvas.height] };
      g.reset();
      result.reset = { level: g.mug.level, drops: beer.drops.length, roll: beer.roll };
      return result;
    });
    assert.ok(physics.slosh > .005, 'liquid must move');
    assert.ok(physics.after < physics.before, 'overflow must lose beer');
    assert.ok(physics.drops > 0, 'overflow must emit drops');
    assert.equal(physics.sharedLiquid, true);
    assert.deepEqual(physics.reset, { level: 1, drops: 0, roll: 0 });
    for (const [name, width, height] of [['small', 360, 640], ['mobile', 393, 852], ['desktop', 1240, 900], ['landscape', 844, 390]]) {
      await page.setViewport({ width, height, isMobile: name !== 'desktop', hasTouch: name !== 'desktop' });
      await setup();
      const bounds = await page.evaluate(() => {
        const g = game, h = g.heroAnimator, points = [];
        for (const [x, y] of [[32, 11], [352, 78], [159, 460], [284, 498]]) {
          points.push(g.player.card.localToWorld(new THREE.Vector3((x / 384 - .5) * h.width, (.5 - y / 512) * h.height, 0)).project(g.camera));
        }
        const cup = g.handBeer.mesh;
        for (const x of [-.5, .5]) for (const y of [-.5, .5]) points.push(cup.localToWorld(new THREE.Vector3(x * 1.12, y * 1.4, 0)).project(g.camera));
        return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
          top: Math.max(...points.map(p => p.y)), bottom: Math.min(...points.map(p => p.y)) };
      });
      layouts.push({ name, ...bounds });
      assert.ok(bounds.left >= -1 && bounds.right <= 1 && bounds.top <= 1 && bounds.bottom >= -1, name + ' silhouette outside view');
      await shot(name + '-new-hero');
    }
    await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await page.evaluate(async () => {
      await game.start(false); game.state = 'paused'; game.animationReview = true;
      game.onboarding.completed = new Set(['steer', 'wave', 'jump', 'landing', 'balance']);
      game.comics.reset();
    });
    await setup();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(review, 'base-closeup.png'), clip: { x: 75, y: 280, width: 245, height: 400 } });
    const cards = [];
    for (const [label, state, frame] of [['Стойка', 'trim', 0], ['Левый поворот', 'left', 4], ['Правый поворот', 'right', 4], ['Приседание', 'trim', 2], ['Полёт', 'air', 4], ['Группировка', 'trick', 4], ['Приземление', 'landing', 0]]) {
      await setup(state, frame);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const buffer = await page.screenshot({ path: path.join(review, state + '-closeup.png'), clip: { x: 60, y: 250, width: 285, height: 410 } });
      cards.push({ label, url: 'data:image/png;base64,' + Buffer.from(buffer).toString('base64') });
    }
    const gallery = await browser.newPage();
    await gallery.setViewport({ width: 1200, height: 960 });
    await gallery.setContent('<html lang="ru"><style>body{margin:0;padding:24px;background:#162d30;color:#fff;font:18px Arial}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}figure{margin:0;background:#244549;border-radius:12px;overflow:hidden}img{width:100%;display:block}figcaption{padding:12px}h1{font-size:26px;margin:0 0 20px}</style><h1>Серфер — игровые позы с доской и динамической кружкой</h1><main>' + cards.map(c => '<figure><img src="' + c.url + '"><figcaption>' + c.label + '</figcaption></figure>').join('') + '</main></html>');
    await gallery.screenshot({ path: path.join(review, 'poses-contact-sheet.png'), fullPage: true });
    await gallery.close();
    await page.goto(base + '/prototype.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.game);
    await page.evaluate(async () => { await game.start(false); game.state = 'paused'; });
    assert.equal(await page.evaluate(() => !!game.heroAnimator.atlases.trim && game.handBeer.frame.complete), true);
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    fs.writeFileSync(path.join(review, 'verification.json'), JSON.stringify({ poses, routing, physics, layouts, errors, missing }, null, 2));
    console.log('PASS: seven key poses in 56 animation frames, action routing, both feet on deck, fixed handle grip, liquid motion/spill/reset, four viewports and both entry pages.');
    console.log(JSON.stringify({ physics, layouts }, null, 2));
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
