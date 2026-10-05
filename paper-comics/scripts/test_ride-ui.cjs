const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const {createServer} = require('./serve');

async function run() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const review = path.resolve(__dirname, '../review/comics/ride');
  fs.mkdirSync(review, {recursive: true});
  let browser;
  const errors = [];
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({width: 393, height: 852, isMobile: true, hasTouch: true});
    await page.goto(base, {waitUntil: 'networkidle0'});
    await page.waitForFunction(() => window.game);
    await page.click('#sound-button');
    assert.equal(await page.evaluate(() => game.audio.isMuted && !game.audio.ctx), true, 'mute before audio initialization');
    assert.equal(await page.$eval('#sound-button', el => el.getAttribute('aria-label')), 'Включить звук');
    await page.reload({waitUntil: 'networkidle0'});
    await page.waitForFunction(() => window.game);
    assert.equal(await page.evaluate(() => game.audio.isMuted), true, 'mute survives reload');
    await page.click('#start-button');
    await page.click('#setup-next');
    await page.waitForFunction(() => document.getElementById('comic-loading').hidden);
    await page.click('#story-skip');
    await page.waitForFunction(() => game.state === 'playing' && game.audio.ctx.state === 'running' && game.audio.masterGain.gain.value === 0);
    assert.equal(await page.evaluate(() => game.audio.masterGain.gain.value), 0, 'muted Web Audio master');
    assert.equal(await page.evaluate(() => game.audio.bgmPlaying && !game.audio.bgmAudio), true, 'muted launch defers music');
    await page.click('#sound-button');
    await page.waitForFunction(() => game.audio.masterGain.gain.value > .8);
    assert.equal(await page.evaluate(() => !!game.audio.bgmAudio && !game.audio.bgmAudio.muted && game.audio.bgmPlaying), true, 'unmute starts deferred music');
    assert.ok(await page.evaluate(() => game.audio.masterGain.gain.value > .8), 'unmute restores all Web Audio channels');
    await page.click('#sound-button');
    await page.waitForFunction(() => game.audio.masterGain.gain.value === 0);
    assert.equal(await page.evaluate(() => game.audio.masterGain.gain.value === 0 && game.audio.bgmAudio.muted), true, 'music and Web Audio mute together');
    await page.click('#pause-button');
    await page.click('#sound-button');
    assert.equal(await page.evaluate(() => !game.audio.bgmPlaying && game.audio.bgmAudio.paused), true, 'unmuting pause does not resume music');
    await page.click('#resume-button');
    assert.equal(await page.evaluate(() => game.audio.bgmPlaying), true, 'music resumes with game');

    for (const [name, width, height, mobile] of [['mobile',393,852,true],['small',360,640,true],['desktop',1240,900,false],['landscape',844,390,true]]) {
      await page.setViewport({width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1});
      await page.goto(base + '/?comic', {waitUntil: 'networkidle0'});
      await page.waitForFunction(() => window.game && document.getElementById('comic-loading').hidden);
      const checkButton = async ids => {
        const bounds = await page.evaluate(ids => {
          const r = document.getElementById('sound-button').getBoundingClientRect();
          const stage = document.getElementById('app-container').getBoundingClientRect();
          const overlaps = ids.filter(id => {
            const el = document.getElementById(id), c = el.getBoundingClientRect();
            return getComputedStyle(el).visibility !== 'hidden' && c.width && c.height && r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top;
          });
          return {fits: r.left >= stage.left && r.right <= stage.right && r.top >= stage.top && r.bottom <= stage.bottom, overlaps};
        }, ids);
        assert.ok(bounds.fits, name + ' sound button fits');
        assert.deepEqual(bounds.overlaps, [], name + ' sound button leaves other controls clear');
      };
      await checkButton(['story-prev','story-skip']);
      await page.click('#story-skip');
      await page.waitForFunction(() => game.state === 'playing');
      await page.evaluate(() => {
        const g = game;
        g.state = 'paused'; g.audio.stopBGM();
        g.onboarding.completed = new Set(['steer','wave','jump','landing','balance']);
        g.onboarding.age = 10; g.time = 12; g.p.x = 0; g.p.z = 290; g.p.speed = 31;
        g.score = 1690; g.mug.level = .82; g.waveRide.totalCaught = 1;
        g.wave.update(g.p.z,g.time,true); g.p.y = g.wave.height(g.p.x, g.p.z);
        g.updateCamera(1,true); g.updateVisuals(0); g.updateHUD();
        g.renderer.render(g.scene,g.camera); g.renderDirty = true;
      });
      await checkButton(['pause-button','beer-value','score-value']);
      assert.equal(await page.$eval('#coach-line', el => el.textContent), '', name + ' no repeated small guidance');
      const water = await page.evaluate(() => {
        const sea = game.wave.sea.geometry.attributes.position;
        const shore = game.world.shore.geometry.attributes.position;
        return {waterLeft: Math.min(...Array.from({length:sea.count},(_,i)=>sea.getX(i))), shoreLeft: Math.min(...Array.from({length:shore.count},(_,i)=>shore.getX(i))), town:game.town.position.x};
      });
      assert.ok(water.waterLeft < water.shoreLeft, 'water covers relocated shore');
      assert.ok(water.shoreLeft < -19, 'shore stays away from the route');
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      await (await page.$('#app-container')).screenshot({path:path.join(review,name+'.jpg'),type:'jpeg',quality:84});
      if (name === 'mobile') {
        const anchor = await page.evaluate(() => {
          const point = game.companion.card.getWorldPosition(new THREE.Vector3());
          point.project(game.camera);
          return {x:(point.x+1)/2, y:(1-point.y)/2};
        });
        fs.writeFileSync(path.join(review,'anchor.json'),JSON.stringify(anchor,null,2));
        await page.evaluate(() => {
          game.companion.raisedUntil = game.time + 2;
          game.companion.update(); game.renderer.render(game.scene,game.camera);
        });
        await (await page.$('#app-container')).screenshot({path:path.join(review,'mobile-raised.jpg'),type:'jpeg',quality:84});
      }
      await page.evaluate(() => {
        game.state='playing'; game.companion.react('trick',true); game.state='paused';
        game.companion.update(); game.renderer.render(game.scene,game.camera); game.renderDirty=true;
      });
      const speech = await page.evaluate(() => {
        const el=document.getElementById('crab-callout'),r=el.getBoundingClientRect(),stage=game.container.getBoundingClientRect();
        const overlaps=['steer-left','steer-right','jump-button'].filter(id => {
          const c=document.getElementById(id).getBoundingClientRect();
          return r.left<c.right&&r.right>c.left&&r.top<c.bottom&&r.bottom>c.top;
        });
        const top=game.companion.card.getWorldPosition(new THREE.Vector3()).project(game.camera);
        const anchorY=stage.top+(1-top.y)*stage.height/2;
        return {fits:r.left>=stage.left&&r.right<=stage.right&&r.top>=stage.top&&r.bottom<=stage.bottom,overlaps,near:Math.abs((r.top+r.bottom)/2-anchorY)<100,words:el.textContent.trim().split(/\s+/).length};
      });
      assert.ok(speech.fits&&speech.near,name+' speech follows crab inside screen: '+JSON.stringify(speech));
      assert.deepEqual(speech.overlaps,[],name+' speech leaves controls clear');
      assert.ok(speech.words<=5,name+' short speech');
      await (await page.$('#app-container')).screenshot({path:path.join(review,name+'-bubble.jpg'),type:'jpeg',quality:84});
    }
    assert.deepEqual(errors, []);
    console.log('PASS: persistent mute, deferred music, paused mute, four layouts, shore coverage and clean ride captures');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
