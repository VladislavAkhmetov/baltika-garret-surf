const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const {createServer} = require('./serve');

async function run() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const review = path.resolve(__dirname, '../review/comics/arcade-jump');
  fs.mkdirSync(review, {recursive:true});
  let browser;
  const errors = [], report = [], screenshots = {};
  try {
    browser = await puppeteer.launch({
      executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless:true,
      userDataDir:path.join(review,'chrome-profile'),
      args:['--no-sandbox', '--disable-breakpad', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if(message.type() === 'error' && /WebGL|Shader|THREE/.test(message.text())) errors.push(message.text());
    });
    await page.setViewport({width:393, height:852, isMobile:true, hasTouch:true});
    await page.goto('http://127.0.0.1:' + server.address().port, {waitUntil:'networkidle0'});
    await page.evaluate(async () => { await game.start(false); game.state = 'paused'; });

    const diversity = await page.evaluate(() => {
      game.wave.resetWaves(42);
      return game.wave.waves.map(w => ({id:w.id, height:w.height, width:w.width}));
    });
    const heights = diversity.map(w => w.height);
    assert.ok(Math.max(...heights) - Math.min(...heights) > 3, 'wave peaks have a visibly different height');
    assert.ok(diversity.filter(w => w.height > 4.4).length >= 4, 'several strong peaks occur along the route');
    assert.ok(diversity.filter(w => w.height < 2.3).length >= 6, 'low waves offer easier alternatives');
    assert.ok(diversity.every(w => w.height < 4 || w.width < 9.8), 'high waves also have a steeper face');
    assert.ok(diversity[0].height < 2.7 && diversity[1].height < 3.4, 'opening peaks stay forgiving');

    for(const [name, width, height, mobile] of [
      ['mobile',393,852,true], ['small',360,640,true],
      ['desktop',1240,900,false], ['landscape',844,390,true]
    ]) {
      await page.setViewport({width, height, isMobile:mobile, hasTouch:mobile, deviceScaleFactor:1});
      await page.evaluate(() => {
        const g = game;
        g.assist = true; g.reset(); g.wave.resetWaves(42); g.journey.hideAll();
        document.getElementById('result-screen').classList.add('hidden');
        g.container.classList.add('playing'); g.input.mode = 'touch';
        g.onboarding.completed = new Set(['steer','wave','jump','landing','balance']);
        g.world.hazards.forEach(h => h.done = true); g.rivals.forEach(r => r.collided = true);
        g.comics.trigger = () => false;
        const w = g.wave.waves.filter(w => w.encounterTime < 38).reduce((a,b) => a.height > b.height ? a : b);
        g.time = w.encounterTime; g.wave.time = g.time;
        g.p.z = (w.from + w.to) / 2; g.p.x = g.wave.crestX(w,g.p.z) + .15;
        g.p.y = g.wave.height(g.p.x,g.p.z); g.p.speed = 27;
        g.balance.immunity = 5; g.impactCooldown = 8;
        g.updateCamera(1,true); g.state = 'paused';
        g.jumpReview = {frames:[], stages:{}, quaternion:g.camera.quaternion.toArray(), ring:null, maxPitch:0};
        g.wave.update(g.p.z,g.time,true); g.updateVisuals(0); g.updateHUD(); g.renderer.render(g.scene,g.camera);
      });
      const shot = async stage => {
        const filename = path.join(review, name + '-' + stage + '.png');
        await page.screenshot({path:filename});
        if(name === 'mobile') screenshots[stage] = filename;
      };
      await shot('approach');
      await page.evaluate(() => {
        game.state = 'playing';
        const button = document.getElementById('jump-button');
        button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));
        button.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));
        game.state = 'paused';
      });
      const captured = new Set();
      for(let frame = 0; frame < 36; frame++) {
        const sample = await page.evaluate(() => {
          const g = game, review = g.jumpReview, dt = 1/120;
          g.state = 'playing';
          for(let i = 0; i < 12; i++) { g.step(dt); g.updateCamera(dt); }
          g.state = 'paused';
          g.wave.update(g.p.z,g.time,true); g.updateVisuals(0); g.updateHUD();
          g.scene.updateMatrixWorld(true); g.renderer.render(g.scene,g.camera);
          const board = g.player.board, card = g.player.card;
          const nose = new THREE.Vector3(0,1,0).applyQuaternion(board.getWorldQuaternion(new THREE.Quaternion()));
          const actualPitch = Math.asin(THREE.MathUtils.clamp(nose.y,-1,1)) * 180/Math.PI;
          const anchor = card.localToWorld(g.heroAnimator.footAnchor.clone());
          const deck = board.localToWorld(new THREE.Vector3(0,0,.018));
          const corners = [];
          for(const x of [-.5,.5]) for(const y of [-.5,.5]) {
            corners.push(card.localToWorld(new THREE.Vector3(x*g.heroAnimator.width,y*g.heroAnimator.height,0)).project(g.camera));
          }
          const deckCorners = [];
          for(const x of [-.5,.5]) for(const y of [-.5,.5]) {
            deckCorners.push(board.localToWorld(new THREE.Vector3(x*board.geometry.parameters.width,y*board.geometry.parameters.height,0)).project(g.camera));
          }
          const ring = g.landingRings.find(r => r.life > 0);
          let ringError = 0;
          if(ring) {
            if(!review.ring) review.ring = {x:ring.x,z:ring.z,createdAt:g.time};
            const positions = ring.mesh.geometry.attributes.position;
            for(let i = 0; i < positions.count; i += 8) {
              ringError = Math.max(ringError,Math.abs(positions.getY(i) - g.wave.height(-positions.getX(i),positions.getZ(i)) - .055));
            }
          }
          const sample = {
            time:g.jump.airTime, y:g.p.y, air:g.p.airY, airborne:g.p.airborne,
            velocity:g.p.jumpVelocity, remaining:g.jump.flightRemaining, actualPitch, boardPitch:g.jump.boardPitch,
            pulse:g.jump.landingPulse, pose:g.heroAnimator.state + ':' + g.heroAnimator.frame,
            anchorError:anchor.distanceTo(deck), ringError,
            ring:ring ? {x:ring.x,z:ring.z,life:ring.life} : null,
            cameraAngle:new THREE.Quaternion().fromArray(review.quaternion).angleTo(g.camera.quaternion),
            top:Math.min(...corners.map(v => (1-v.y)/2)),
            bottom:Math.max(...corners.map(v => (1-v.y)/2)),
            side:Math.max(...corners.map(v => Math.abs(v.x))),
            boardTop:Math.min(...deckCorners.map(v => (1-v.y)/2)),
            boardBottom:Math.max(...deckCorners.map(v => (1-v.y)/2)),
            beer:g.mug.level
          };
          review.frames.push(sample); review.maxPitch = Math.max(review.maxPitch, actualPitch);
          return sample;
        });
        const stage = sample.airborne ? sample.time > .13 && sample.time < .23 ? 'takeoff' : sample.velocity <= 0 ? 'apex' : null
          : sample.pulse > .6 ? 'landing' : sample.pulse > .15 ? 'settling' : frame > 20 ? 'away' : null;
        if(stage && !captured.has(stage)) { captured.add(stage); await shot(stage); }
        if(name === 'mobile') await page.screenshot({path:path.join(review,'frame-' + String(frame).padStart(2,'0') + '.jpg'),type:'jpeg',quality:86});
      }
      const result = await page.evaluate(() => ({...game.jumpReview, clean:game.jump.cleanLandings,tricks:game.jump.tricks,airTime:game.jump.airTime}));
      report.push({name,...result});
      fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({diversity,report,errors},null,2));
      assert.ok(result.maxPitch > 65, name + ': the rendered board nose rises close to vertical');
      assert.ok(result.frames.some(f => f.air > 6), name + ': a strong takeoff visibly separates from water');
      assert.ok(result.frames.every(f => f.anchorError < 1e-5), name + ': feet remain anchored through board pitch and compression');
      assert.ok(result.frames.every(f => f.cameraAngle < 1e-6), name + ': jump and landing do not rotate the camera');
      assert.ok(result.frames.every(f => f.top >= 0 && f.bottom <= 1.03 && f.side < 1.05), name + ': the powerful jump stays framed');
      assert.ok(result.frames.every(f => f.boardTop >= 0 && f.boardBottom <= 1.05), name + ': the board and its touchdown stay in view');
      assert.ok(result.frames.filter(f => f.airborne && f.velocity < 0 && f.remaining < .18).every(f => Math.abs(f.actualPitch) < 8), name + ': board levels before touchdown');
      assert.ok(result.frames.some(f => f.airborne && Math.abs(f.velocity) < 2 && f.actualPitch > 15), name + ': the board stays visible in a tilted air pose at the apex');
      assert.ok(result.frames.some(f => f.pulse > .6 && f.pose === 'trim:2'), name + ': touchdown compresses the knees');
      assert.ok(result.frames.some(f => f.pulse > .15 && f.pulse < .6 && f.pose === 'trim:1'), name + ': knees release after contact');
      assert.ok(result.ring && result.frames.filter(f => f.ring).every(f => f.ring.x === result.ring.x && f.ring.z === result.ring.z), name + ': splash expands at a fixed world point');
      assert.ok(result.frames.every(f => f.ringError < .001), name + ': touchdown foam conforms to moving water');
      assert.equal(result.clean,1); assert.equal(result.tricks,0);
      assert.ok(result.frames.every(f => f.beer > .9), name + ': an ordinary jump does not drain the drink');
      const reset = await page.evaluate(() => {
        game.reset(); game.state = 'paused';
        return {pitch:game.jump.boardPitch,pulse:game.jump.landingPulse,rings:game.landingRings.some(r => r.life > 0 || r.mesh.visible)};
      });
      assert.deepEqual(reset,{pitch:0,pulse:0,rings:false});
    }
    const sheet = await browser.newPage();
    await sheet.setViewport({width:1572,height:930});
    const labels = {approach:'Гребень',takeoff:'Отрыв',apex:'В воздухе',landing:'Контакт'};
    await sheet.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#0c3544;color:#fff4d7;font:22px Arial}main{display:grid;grid-template-columns:repeat(4,1fr)}img{display:block;width:100%}p{margin:15px}</style><main>' + Object.entries(labels).map(([key,label]) => '<div><p>' + label + '</p><img src="data:image/png;base64,' + fs.readFileSync(screenshots[key]).toString('base64') + '"></div>').join('') + '</main>');
    await sheet.screenshot({path:path.join(review,'jump-stages.png'),fullPage:true});
    await sheet.close();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify(report.map(r => ({viewport:r.name,pitch:r.maxPitch,airTime:r.airTime,height:Math.max(...r.frames.map(f=>f.air)),clean:r.clean})),null,2));
    console.log('PASS: varied wave peaks, near-vertical takeoff, stable camera and water contact across four viewports.');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => {console.error(error);process.exitCode = 1;});
