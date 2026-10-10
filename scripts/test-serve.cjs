const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const {createServer} = require('./serve');

async function run() {
  let server, browser;
  const failures = [], errors = [];
  try {
    let base = process.argv[2];
    if (!base) {
      server = createServer();
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${server.address().port}/`;
    }
    const entry = new URL('/?preview-check=1', base);
    const response = await fetch(entry, {redirect:'manual'});
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/paper-comics/index.html?preview-check=1');
    await response.arrayBuffer();
    assert.equal((await fetch(new URL('/paper-comics/', base), {method:'HEAD'})).status, 200);

    browser = await puppeteer.launch({
      executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless:true,
      args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    await page.setViewport({width:393, height:852, isMobile:true, hasTouch:true});
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure().errorText}`));
    page.on('response', response => {
      if (response.status() >= 400 && new URL(response.url()).pathname !== '/favicon.ico') {
        failures.push(`${response.url()}: ${response.status()}`);
      }
    });
    await page.goto(entry.href, {waitUntil:'networkidle0'});
    assert.equal(new URL(page.url()).pathname, '/paper-comics/index.html');
    assert.equal(new URL(page.url()).search, '?preview-check=1');
    await page.waitForFunction(() => Boolean(window.game));
    const layout = await page.evaluate(async () => {
      await document.fonts.ready;
      const app = document.getElementById('app-container');
      return {
        stylesheets:[...document.querySelectorAll('link[rel="stylesheet"]')].map(link => Boolean(link.sheet)),
        font:getComputedStyle(document.body).fontFamily,
        position:getComputedStyle(app).position,
        width:app.getBoundingClientRect().width,
        height:app.getBoundingClientRect().height,
        rubik:document.fonts.check('16px Rubik')
      };
    });
    assert.ok(layout.stylesheets.length > 0 && layout.stylesheets.every(Boolean), 'Every stylesheet must load');
    assert.ok(layout.font.includes('Rubik'));
    assert.equal(layout.rubik, true);
    assert.equal(layout.position, 'relative');
    assert.equal(layout.width, 393);
    assert.ok(layout.height > 600 && layout.height <= 852);
    const review = path.resolve(__dirname, '../paper-comics/review/comics/serve');
    fs.mkdirSync(review, {recursive:true});
    await page.screenshot({path:path.join(review, 'start-393.png')});
    const scene = await page.evaluate(async () => {
      await game.start(false);
      await game.boardReady;
      const state = game.state;
      game.state = 'paused';
      game.updateVisuals(0);
      game.renderer.render(game.scene, game.camera);
      return {
        state,
        canvasWidth:game.renderer.domElement.width,
        canvasHeight:game.renderer.domElement.height,
        drawCalls:game.renderer.info.render.calls,
        surfboardLoaded:game.surfboardTexture.image.complete,
        rivals:game.rivalCast.profiles.length
      };
    });
    assert.equal(scene.state, 'playing');
    assert.ok(scene.canvasWidth > 0 && scene.canvasHeight > 0 && scene.drawCalls > 0);
    assert.equal(scene.surfboardLoaded, true);
    assert.equal(scene.rivals, 4);
    await page.screenshot({path:path.join(review, 'ride-393.png')});
    assert.deepEqual(failures, [], 'All page resources must load');
    assert.deepEqual(errors, [], 'The main entry must initialize without script errors');
    console.log(JSON.stringify({entry:entry.href, final:page.url(), layout, scene, failures, errors}, null, 2));
  } finally {
    if (browser) await browser.close();
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
}

run().catch(error => {console.error(error);process.exitCode = 1;});
