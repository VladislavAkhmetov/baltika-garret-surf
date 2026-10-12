// Optional real-browser integration check; test_audio.cjs runs without Chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const {createServer} = require('./serve');

async function run() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const review = path.resolve(__dirname, '../review/comics/audio');
  fs.mkdirSync(review, {recursive:true});
  const report = {errors:[]};
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless:true,
      userDataDir:fs.mkdtempSync(path.join(review,'chrome-profile-')),
      args:['--no-sandbox', '--disable-breakpad', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => {
      if (/\[SurfAudio\]/.test(message.text())) report.errors.push(message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400 && /assets\/audio\//.test(response.url())) report.errors.push(response.status() + ' ' + response.url());
    });
    await page.setViewport({width:393, height:852, isMobile:true, hasTouch:true});
    await page.goto('http://127.0.0.1:' + server.address().port, {waitUntil:'networkidle0'});
    report.assets = await page.evaluate(async () => {
      game.audio.isMuted = true;
      await game.start(false);
      game.state = 'paused';
      const a = game.audio;
      const ready = Object.keys(a.manifest).every(name => a.buffers[name]?.duration > 0);
      const mutedStart = a.bgmPlaying && !a.bgmAudio;
      a.toggleMute();
      await a.ctx.resume();
      return {ready, mutedStart, unmutedMusic:!!a.bgmAudio && !a.bgmAudio.muted, state:a.ctx.state};
    });
    assert.deepEqual(report.assets, {ready:true, mutedStart:true, unmutedMusic:true, state:'running'});

    report.events = await page.evaluate(() => {
      const g = game, a = g.audio, calls = [], original = {};
      for (const method of ['playCrowdAwe','playCrowdApplause','playCrowdCheer','playTrickTriumph','playJump','playLanding','playSpin','playFanfareWin']) {
        original[method] = a[method];
        a[method] = (...args) => calls.push({method,args});
      }
      function prepare() {
        g.reset();g.state = 'playing';g.assist = true;g.input.mode = 'touch';g.comics.trigger = () => false;
        g.p.z = 10;g.p.x = 0;g.p.y = g.wave.height(0,10);g.p.speed = 30;
      }
      function fly(spin, ramp) {
        prepare();calls.length = 0;
        const surface = {height:0, zone:'flat', wave:null, dz:0, dx:0, waterVelocity:0, energy:0, crest:0, face:0};
        if (ramp) {
          const line = g.trickRoute.lines[0];
          g.jump.launchRamp(line, surface);
        } else {
          g.jump.press();g.jump.step(1/120, surface);
        }
        let pressed = false;
        for (let i = 0; i < 480 && g.p.airborne; i++) {
          g.time += 1/120;
          if (spin && !pressed && g.jump.canSpin) {g.jump.press();pressed = true;}
          g.jump.step(1/120, surface);
        }
        return {calls:calls.slice(), clean:g.jump.cleanLandings, landed:!g.p.airborne};
      }
      try {
        prepare();
        for (const name of ['ПОЙМАЛ ВОЛНУ','НА ГРЕБНЕ','ПЕРЕХОД','КАРВИНГ','НА ХВОСТЕ','ЧИСТЫЙ ОБГОН','ВЫРУЛИЛ','ОТОРВАЛСЯ ОТ ПЕНЫ']) g.awardTrick(name,250);
        const riding = calls.slice();
        const normal = fly(false,false), spin = fly(true,false), ramp = fly(false,true);
        prepare();calls.length = 0;g.jump.press();
        const surface = {height:0, zone:'flat', wave:null, dz:0, dx:0, waterVelocity:0, energy:0, crest:0, face:0};
        g.jump.step(1/120,surface);
        g.jump.spinStarted = true;g.jump.trickKind = 'spin';g.jump.spinDuration = 5;
        for (let i = 0; i < 240 && g.p.airborne; i++) g.jump.step(1/120,surface);
        const failed = calls.slice();
        prepare();calls.length = 0;g.mug.level = 1;g.finish();const finish = calls.slice();
        g.state = 'paused';
        return {riding,normal,spin,ramp,failed,finish};
      } finally {
        for (const [method, fn] of Object.entries(original)) a[method] = fn;
      }
    });
    assert.deepEqual(report.events.riding, [], 'routine points cannot trigger crowd or reward jingles');
    for (const flight of ['normal','spin','ramp']) {
      const events = report.events[flight];
      assert.ok(events.landed && events.clean === 1, flight + ' lands cleanly');
      assert.equal(events.calls.filter(c => c.method === 'playJump').length,1, flight + ' sounds at takeoff');
      assert.equal(events.calls.filter(c => c.method === 'playLanding').length,1, flight + ' sounds at touchdown');
    }
    assert.ok(!report.events.normal.calls.some(c => /Crowd/.test(c.method)), 'an ordinary jump stays quiet in the crowd');
    assert.deepEqual(report.events.spin.calls.map(c => c.method), ['playJump','playSpin','playCrowdAwe','playLanding','playCrowdApplause']);
    assert.deepEqual(report.events.ramp.calls.map(c => c.method), ['playJump','playLanding','playCrowdApplause']);
    assert.ok(!report.events.failed.some(c => c.method === 'playCrowdApplause'), 'an unfinished rotation cannot earn applause');
    assert.deepEqual(report.events.finish.map(c => c.method), ['playFanfareWin'], 'crowd belongs to tricks, including at the finish');

    report.mix = await page.evaluate(async () => {
      const a = game.audio, wait = ms => new Promise(resolve => setTimeout(resolve,ms));
      a.resetRide();a.startBGM();
      const update = values => a.updateRide({speed:30, ...values});
      update({lean:0,energy:0});await wait(250);
      const calm = {wash:a.boardGain.gain.value, sea:a.waveGain.gain.value};
      update({lean:0.9,energy:1,foamPressure:0.8});await wait(250);
      const carve = {wash:a.boardGain.gain.value, sea:a.waveGain.gain.value, filter:a.waveFilter.frequency.value};
      update({airborne:true});await wait(500);
      const air = {wash:a.boardGain.gain.value, wind:a.windGain.gain.value, sea:a.waveGain.gain.value};
      a.playJump(0.6);await wait(100);const duck = a.bgmGain.gain.value;
      await wait(1000);const restored = a.bgmGain.gain.value;
      a.resetRide();
      const awe = a.playCrowdAwe(), duplicateAwe = a.playCrowdAwe();
      const applause = a.playCrowdApplause(), duplicateApplause = a.playCrowdApplause();
      const reactions = {awe:!!awe, duplicateAwe:!!duplicateAwe, applause:!!applause, duplicateApplause:!!duplicateApplause, duration:applause?.endsAt-a.ctx.currentTime};
      a.playLanding(false,1);game.state = 'playing';game.pause();await wait(350);
      const paused = {voices:a.oneShots.size, ambient:a.ambientGain.gain.value, active:a.rideActive, music:a.bgmPlaying};
      game.resume();game.state = 'paused';update({lean:0.5});await wait(250);
      const resumed = a.ambientGain.gain.value;
      a.playJump();a.toggleMute();const mutedVoices = a.oneShots.size;
      a.toggleMute();a.stopBGM();
      return {calm,carve,air,duck,restored,reactions,paused,resumed,mutedVoices};
    });
    const m = report.mix;
    assert.ok(m.carve.wash > m.calm.wash * 1.6 && m.carve.sea > m.calm.sea, 'turns and wave energy change the water mix');
    assert.ok(m.carve.filter > 2000, 'the recorded ocean retains its breaking foam');
    assert.ok(m.air.wash < 0.001 && m.air.wind > 0.1 && m.air.sea > 0.4, 'flight removes board wash and adds wind above the sea');
    assert.ok(m.duck < 0.24 && m.restored > 0.30, 'music ducks for takeoff then restores');
    assert.ok(m.reactions.awe && m.reactions.applause && !m.reactions.duplicateAwe && !m.reactions.duplicateApplause && m.reactions.duration <= 1.61, 'crowd clips are short and cannot stack');
    assert.ok(m.paused.voices === 0 && m.paused.ambient < 0.001 && !m.paused.active && !m.paused.music, 'pause silences water and pending effects');
    assert.ok(m.resumed > 0.75 && m.mutedVoices === 0, 'resume restores the sea; mute cancels pending effects');
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report,null,2));
    console.log('PASS: loaded audio, trick-only crowd, water/flight mix, music ducking, pause and mute.');
  } finally {
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    await browser?.close();server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => {console.error(error);process.exitCode = 1;});
