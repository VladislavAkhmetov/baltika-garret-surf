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
      await a.ready;
      const ready = Object.keys(a.manifest).every(name => a.buffers[name]?.duration > 0);
      const mutedStart = a.bgmPlaying && !a.bgmAudio;
      a.toggleMute();
      await a.ctx.resume();
      return {ready, mutedStart, unmutedMusic:!!a.bgmAudio && !a.bgmAudio.muted, state:a.ctx.state};
    });
    assert.deepEqual(report.assets, {ready:true, mutedStart:true, unmutedMusic:true, state:'running'});

    report.impact = await page.evaluate(async () => {
      const a=game.audio;a.resetRide();a.playImpact(.8);
      const voices=a.oneShots.size,darkAttack=[...a.oneShots].some(v=>v.filter?.type==='lowpass'&&v.source.buffer===a.buffers.landing_hard);
      a.playImpact(.8);const noStack=a.oneShots.size===voices;
      await new Promise(resolve=>setTimeout(resolve,350));const cleaned=a.oneShots.size===0;
      a.toggleMute();a.playImpact();const muted=a.oneShots.size===0;a.toggleMute();
      return {voices,darkAttack,noStack,cleaned,muted};
    });
    assert.deepEqual(report.impact,{voices:3,darkAttack:true,noStack:true,cleaned:true,muted:true},'wooden impacts play and clean up in real Web Audio');

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
    assert.deepEqual(report.events.ramp.calls.map(c => c.method), ['playJump','playCrowdAwe','playLanding','playCrowdApplause']);
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

    report.femaleCrowd=await page.evaluate(()=>{
      const a=game.audio;a.resetRide();
      const inspect=buffer=>{
        let peak=0,energy=0;const samples=buffer.getChannelData(0);
        for(const sample of samples){peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
        return {channels:buffer.numberOfChannels,duration:buffer.duration,peak,rms:Math.sqrt(energy/samples.length)};
      };
      const normal=a.playCrowdApplause(),special=a.playCrowdApplause(true);
      const result={normal:inspect(normal.source.buffer),special:inspect(special.source.buffer),distinct:normal.source.buffer!==special.source.buffer};
      a.resetRide();return result;
    });
    assert.ok(report.femaleCrowd.distinct,'a completed flip uses a separate energetic crowd recording');
    for(const clip of [report.femaleCrowd.normal,report.femaleCrowd.special])assert.ok(clip.channels===2&&clip.duration>=2.5&&clip.peak<.87&&clip.rms>.025,'new crowd recordings decode in stereo, contain audible signal and stay below clipping');

    report.sharkReactions=await page.evaluate(()=>{
      const g=game,a=g.audio;
      const place=(x=0,airY=0)=>{
        g.reset();g.state='playing';g.time=2;g.p.x=x;g.p.z=400.1;g.p.speed=30;g.p.airY=airY;g.p.airborne=airY>0;g.impactCooldown=0;
        const h=g.world.hazards.find(h=>h.type==='shark');
        h.activeAt=0;h.attackAt=1;h.chasing=true;h.x=h.targetX=h.lungeX=0;h.z=400;return h;
      };
      let h=place();a.playCrowdAwe(true);const flight=a.crowdVoice;
      g.world.stepChaser(h,0);const disappointment=a.crowdVoice;
      const hit={hit:h.hit,speed:g.p.speed,originalReaction:disappointment?.source.buffer===a.buffers.crowd_shark_hit,
        distinctFromFlight:flight?.source.buffer!==disappointment?.source.buffer,flightIsPositive:a.flightCrowdNames.some(name=>flight?.source.buffer===a.buffers[name])};
      g.world.stepChaser(h,0);hit.once=a.crowdVoice===disappointment&&g.p.speed===hit.speed;
      h=place(0,1.4);g.world.stepChaser(h,0);const jumped={hit:h.hit,speed:g.p.speed,reaction:!!a.crowdVoice};
      h=place(3);g.world.stepChaser(h,0);const dodged={hit:h.hit,speed:g.p.speed,reaction:!!a.crowdVoice};
      place();const prop=g.world.hazards.find(h=>h.type==='flotsam');prop.x=g.p.x;prop.z=g.p.z;g.world.step(0,[prop]);
      const obstacle={hit:prop.hit,sharkReaction:a.crowdVoice?.source.buffer===a.buffers.crowd_shark_hit};
      a.toggleMute();const mutedReaction=a.playCrowdSharkHit();const muted=mutedReaction===null&&a.crowdVoice===null;a.toggleMute();
      g.state='paused';a.stopBGM();return {hit,jumped,dodged,obstacle,muted};
    });
    const shark=report.sharkReactions;
    assert.ok(shark.hit.hit&&shark.hit.speed===19.5&&shark.hit.originalReaction&&shark.hit.distinctFromFlight&&shark.hit.flightIsPositive&&shark.hit.once,'only a successful shark hit replaces the positive flight call with the original disappointed oooh');
    for(const avoided of [shark.jumped,shark.dodged])assert.ok(!avoided.hit&&avoided.speed===30&&!avoided.reaction,'avoiding the shark never triggers disappointment');
    assert.ok(shark.obstacle.hit&&!shark.obstacle.sharkReaction&&shark.muted,'the reaction belongs to shark damage and respects mute');

    report.flightVariations=await page.evaluate(()=>{
      const g=game,a=g.audio,sequence=[];a.flightCrowdBag=[];
      const previous=a.lastFlightCrowd;
      const surface={height:0,zone:'flat',wave:null,dz:0,dx:0,waterVelocity:0,energy:0,crest:0,face:0};
      for(let i=0;i<12;i++){
        g.reset();g.state='playing';g.p.speed=30;g.jump.launchRamp(g.trickRoute.lines[0],surface);g.state='paused';
        const voice=a.crowdVoice;sequence.push({name:a.lastFlightCrowd,valid:a.flightCrowdNames.some(name=>voice?.source.buffer===a.buffers[name])});
      }
      const clips=a.flightCrowdNames.map(name=>{
        const buffer=a.buffers[name],samples=buffer.getChannelData(0);let energy=0,peak=0;
        for(const sample of samples){energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
        return {name,channels:buffer.numberOfChannels,duration:buffer.duration,rms:Math.sqrt(energy/samples.length),peak};
      });
      a.stopBGM();return {previous,sequence,clips};
    });
    const variations=report.flightVariations;
    for(let i=0;i<variations.sequence.length;i++){
      const current=variations.sequence[i];assert.ok(current.valid,'the ramp plays a loaded flight recording');
      assert.notEqual(current.name,i?variations.sequence[i-1].name:variations.previous,'successive ramp launches never repeat a recording, including after reset');
    }
    for(let i=0;i<variations.sequence.length;i+=3)assert.equal(new Set(variations.sequence.slice(i,i+3).map(v=>v.name)).size,3,'each batch contains all three flight recordings');
    for(const clip of variations.clips)assert.ok(clip.channels===2&&clip.duration>=2.1&&clip.peak<.87&&clip.rms>.10,'all three crowd clips decode with a clear signal below clipping');

    report.acceleration=await page.evaluate(async()=>{
      const g=game,a=g.audio,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      g.reset();g.state='playing';g.input.mode='touch';a.startBGM();
      const pad=g.rush.accelerators[0];g.p.z=pad.z;g.p.x=pad.x;g.p.y=g.wave.height(pad.x,pad.z);
      g.rush.collectAccelerators();g.state='paused';
      const voice=a.acceleratorVoice,entryVoices=a.oneShots.size;
      await wait(120);
      const initial={gain:voice.gain.gain.value,frequency:voice.filter.frequency.value};
      a.updateRide({speed:46,padTime:1.2,padStrength:12});await wait(300);
      const fast={gain:voice.gain.gain.value,frequency:voice.filter.frequency.value,rate:voice.source.playbackRate.value};
      const sameVoice=a.acceleratorVoice===voice;g.rush.breakStreak();await wait(200);
      const interrupted=!a.acceleratorVoice&&a.oneShots.size===0;
      a.playAccelerator();a.toggleMute();const muted=!a.acceleratorVoice&&a.oneShots.size===0;a.toggleMute();
      return {entryVoices,initial,fast,sameVoice,interrupted,muted};
    });
    const boost=report.acceleration;
    assert.equal(boost.entryVoices,2,'the pad starts an accent and a whoosh');
    assert.ok(boost.initial.gain>.2&&boost.fast.frequency>boost.initial.frequency*1.5&&boost.fast.rate>1.35,'real Web Audio ramps up the whoosh');
    assert.ok(boost.sameVoice&&boost.interrupted&&boost.muted,'boost audio is singular and ends on interruption or mute');

    report.rampMix=await page.evaluate(async()=>{
      const g=game,a=g.audio,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      g.reset();g.state='playing';g.assist=true;g.p.speed=30;
      const surface={height:0,zone:'flat',wave:null,dz:0,dx:0,waterVelocity:0,energy:0,crest:0,face:0};
      a.startBGM();g.jump.launchRamp(g.trickRoute.lines[0],surface);g.state='paused';
      const awe=!!a.crowdVoice&&a.flightCrowdNames.some(name=>a.crowdVoice.source.buffer===a.buffers[name]);
      await wait(250);const flightGain=a.sceneGain.gain.value,crowdGain=a.crowdGain.gain.value;
      a.duckMusic(.1);await wait(500);const stillQuiet=a.sceneGain.gain.value;
      for(let i=0;i<480&&g.p.airborne;i++)g.jump.step(1/120,surface);
      const applause=!!a.crowdVoice&&a.crowdVoice.source.buffer===a.buffers.crowd_applause;
      const ended=!a.rampFlight;await wait(1000);const restored=a.sceneGain.gain.value;
      a.resetRide();g.state='playing';g.jump.launchRamp(g.trickRoute.lines[0],surface);g.pause();
      await wait(60);const paused=Math.abs(a.sceneGain.gain.value-1)<.001&&!a.rampFlight&&a.oneShots.size===0;
      g.resume();g.state='paused';a.updateRide({airborne:true,rampFlight:true});await wait(250);
      const resumed=a.sceneGain.gain.value;a.stopBGM();
      return {awe,applause,flightGain,crowdGain,stillQuiet,ended,restored,paused,resumed};
    });
    const ramp=report.rampMix;
    assert.ok(ramp.awe&&ramp.applause&&ramp.ended,'the ramp reacts with awe at takeoff and applause at touchdown');
    assert.ok(ramp.flightGain<.5&&ramp.stillQuiet<.5&&Math.abs(ramp.crowdGain-.55)<.01,'the world stays softer while the crowd bypasses ducking');
    assert.ok(ramp.restored>.98&&ramp.paused&&ramp.resumed<.5,'landing, pause and resume restore the correct mix');
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
