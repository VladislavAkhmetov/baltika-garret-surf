const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const {createServer} = require('./serve');

async function run() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless:true,
      args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']
    });
    async function mobilePage() {
      const page = await browser.newPage();
      await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:3});
      return page;
    }

    const early = await mobilePage();
    console.log('Checking early tap');
    const errors = [];
    early.on('pageerror', error => errors.push(error.message));
    await early.setRequestInterception(true);
    let releaseBundle;
    const heldBundle = new Promise(resolve => {releaseBundle=resolve;});
    early.on('request', request => {
      if (request.url().includes('/js/game-bundle.js')) heldBundle.then(() => request.continue()).catch(() => {});
      else request.continue().catch(() => {});
    });
    const navigation = early.goto(base, {waitUntil:'domcontentloaded'});
    await early.waitForSelector('#start-button');
    await early.tap('#start-button');
    assert.deepEqual(await early.evaluate(() => ({ready:!!window.game,queued:window.__queuedStart,label:document.getElementById('start-button').textContent})),
      {ready:false,queued:'play',label:'ЗАГРУЗКА…'});
    releaseBundle();
    await navigation;
    await early.waitForFunction(() => window.game?.journey.screen === 'setup');
    assert.equal(await early.evaluate(() => document.getElementById('boot-status').hidden), true);
    assert.deepEqual(errors, []);
    await early.close();
    console.log('PASS: early tap');

    const retry = await mobilePage();
    console.log('Checking failed download');
    await retry.setRequestInterception(true);
    let blockBundle = true;
    retry.on('request', request => {
      if (blockBundle && request.url().includes('/js/game-bundle.js')) request.abort().catch(() => {});
      else request.continue().catch(() => {});
    });
    await retry.goto(base, {waitUntil:'domcontentloaded'});
    await retry.waitForFunction(() => document.getElementById('start-button').textContent === 'ПОВТОРИТЬ ЗАГРУЗКУ');
    assert.equal(await retry.evaluate(() => document.getElementById('boot-status').hidden), false);
    blockBundle=false;
    await Promise.all([retry.waitForNavigation({waitUntil:'domcontentloaded'}),retry.tap('#start-button')]);
    await retry.waitForFunction(() => Boolean(window.game));
    assert.equal(await retry.evaluate(() => game.state), 'start');
    await retry.close();
    console.log('PASS: failed download and retry');

    const audio = await mobilePage();
    console.log('Checking stalled audio');
    await audio.setRequestInterception(true);
    const pendingAudio = [];
    audio.on('request', request => {
      if (request.url().endsWith('.wav')) pendingAudio.push(request);
      else request.continue().catch(() => {});
    });
    await audio.goto(base, {waitUntil:'networkidle0'});
    await audio.tap('#start-button');
    await audio.tap('#setup-next');
    await audio.tap('#story-skip');
    await audio.waitForFunction(() => game.state === 'playing', {timeout:15000});
    assert.ok(pendingAudio.length > 0, 'The sound downloads really are stalled');
    assert.deepEqual(await audio.evaluate(() => ({mode:game.input.mode,ratio:game.renderer.getPixelRatio(),antialias:game.renderer.getContext().getContextAttributes().antialias})),
      {mode:'touch',ratio:1.25,antialias:false});
    for (const request of pendingAudio) await request.abort().catch(() => {});
    await audio.close();

    const timeout = await mobilePage();
    await timeout.goto(base, {waitUntil:'networkidle0'});
    await timeout.evaluate(() => {
      game.wave.ready=new Promise(() => {});
      const original=window.setTimeout;
      window.setTimeout=(callback,ms,...args) => original(callback,ms===45000?100:ms,...args);
      game.journey.open('story');
      game.journey.launch();
    });
    await timeout.waitForFunction(() => game.journey.launchFailed && !game.journey.launching);
    assert.deepEqual(await timeout.evaluate(() => ({playing:game.state==='playing',hidden:document.getElementById('story-error').classList.contains('hidden'),disabled:document.getElementById('story-next').disabled,label:document.getElementById('story-next').textContent})),
      {playing:false,hidden:false,disabled:false,label:'ПОВТОРИТЬ'});
    await timeout.close();
    console.log('PASS: early mobile tap, download failure and reload, ride with stalled audio, asset timeout, mobile rendering settings.');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => {console.error(error);process.exitCode=1;});
