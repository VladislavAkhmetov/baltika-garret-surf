const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const review=path.resolve(__dirname,'../review/comics/chapter');fs.mkdirSync(review,{recursive:true});
  let browser;const errors=[],missing=[],layouts=[];
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.setDefaultTimeout(30000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('favicon.ico'))missing.push(r.url());});
    const shot=async name=>{await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>['panel-hit','panel-slide'].includes(a.animationName)).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:path.join(review,name+'.png')});};
    const check=async name=>{
      const layout=await page.evaluate(()=>{
        const screen=[...document.querySelectorAll('.journey')].find(el=>!el.classList.contains('hidden'));
        const r=screen.getBoundingClientRect(),primary=screen.querySelector('[data-primary]').getBoundingClientRect();
        return {screen:screen.id,width:r.width,height:r.height,buttonVisible:primary.left>=r.left&&primary.right<=r.right+1&&primary.bottom<=r.bottom+1&&primary.top>=r.top,overflow:screen.scrollWidth>screen.clientWidth+2&&!['hidden','clip'].includes(getComputedStyle(screen).overflowX)};
      });layouts.push({name,...layout});assert.ok(layout.buttonVisible,name+' CTA fits');assert.equal(layout.overflow,false,name+' no horizontal overflow');await shot(name);
    };
    for(const [name,width,height,mobile] of [['mobile',393,852,true],['small',360,640,true],['desktop',1240,900,false],['landscape',844,390,true]]){
      await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
      await page.goto(base,{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.game);
      await page.evaluate(async()=>{await Promise.all([game.heroAnimator.ready,game.comics.ready,game.world.ready]);});
      await check(name+'-01-home');
      await page.click('#start-button');await check(name+'-02-setup');
      await page.click('[data-cycle="hero"][data-direction="1"]');assert.equal(await page.$eval('#setup-next',el=>el.disabled),true);await check(name+'-03-locked');await page.click('[data-cycle="hero"][data-direction="-1"]');
      await page.click('[data-cycle="location"][data-direction="1"]');assert.equal(await page.$eval('#setup-next',el=>el.disabled),true);await page.click('[data-cycle="location"][data-direction="-1"]');assert.equal(await page.$eval('#setup-next',el=>el.disabled),false);await page.click('#setup-next');
      for(let i=0;i<2;i++){await page.waitForFunction(()=>document.getElementById('comic-loading').hidden);assert.equal(await page.$eval('#story-screen',el=>Number(el.dataset.page)),i);await check(name+'-04-story-'+(i+1));await page.click('#story-next');}
      await page.waitForFunction(()=>game.state==='playing');assert.equal(await page.$('#ready-screen'),null);
      await page.evaluate(()=>{game.state='paused';game.renderDirty=true;});await shot(name+'-05-onboarding');
      const cue=await page.evaluate(()=>{
        const coach=document.getElementById('ride-coach'),r=coach.getBoundingClientRect(),stage=document.getElementById('app-container').getBoundingClientRect();
        const controls=['steer-left','steer-right','jump-button'].map(id=>document.getElementById(id).getBoundingClientRect());
        return {lesson:coach.dataset.lesson,visible:!coach.classList.contains('hidden'),fits:r.left>=stage.left&&r.right<=stage.right&&r.top>=stage.top&&r.bottom<=stage.bottom,overlap:controls.some(c=>r.left<c.right&&r.right>c.left&&r.top<c.bottom&&r.bottom>c.top)};
      });assert.equal(cue.lesson,'steer');assert.ok(cue.visible&&cue.fits&&!cue.overlap,name+' onboarding leaves controls clear: '+JSON.stringify(cue));
      await page.evaluate(()=>{game.state='playing';});await shot(name+'-06-ride');
      await page.click('#pause-button');assert.equal(await page.evaluate(()=>game.state),'paused');await shot(name+'-07-pause');
      await page.click('#assist-toggle');assert.equal(await page.evaluate(()=>game.assist),false);await page.click('#assist-toggle');assert.equal(await page.evaluate(()=>game.assist),true);
      await page.click('#resume-button');await page.waitForFunction(()=>game.state==='playing');
      await page.evaluate(()=>{game.pause();});await page.click('#pause-screen [data-home]');assert.equal(await page.evaluate(()=>game.state),'start');
    }
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto(base,{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.game);
    await page.evaluate(async()=>{await game.start(false);game.state='paused';});
    const steering=await page.evaluate(()=>{
      const g=game;g.state='playing';g.input.mode='keys';g.rivals.forEach(r=>r.z=2000);
      const scale=g.onboarding.timeScale;
      dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true}));for(let i=0;i<45;i++)g.step(1/120);g.updateHUD();const releasePrompt=document.getElementById('coach-title').textContent;
      dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',bubbles:true}));for(let i=0;i<80;i++)g.step(1/120);
      const completed=g.onboarding.completed.has('steer'),normalScale=g.onboarding.timeScale;
      g.wave.resetWaves(42);const w=g.wave.waves[0];g.time=w.encounterTime;g.wave.time=g.time;g.p.z=(w.from+w.to)/2;g.p.x=g.wave.crestX(w,g.p.z)+w.width*.34;g.p.y=g.wave.height(g.p.x,g.p.z);
      for(let i=0;i<80;i++)g.step(1/120);g.updateHUD();const feedbackHidden=document.getElementById('ride-coach').classList.contains('hidden'),feedbackLesson=document.getElementById('ride-coach').dataset.lesson;
      for(let i=0;i<160;i++)g.step(1/120);g.updateHUD();g.updateCamera(1,true);g.updateVisuals(0);g.wave.update(g.p.z,g.time,true);g.renderer.render(g.scene,g.camera);g.state='paused';
      return {scale,releasePrompt,completed,normalScale,feedbackHidden,feedbackLesson,waves:g.waveRide.totalCaught,lesson:document.getElementById('ride-coach').dataset.lesson};
    });assert.equal(steering.scale,1);assert.equal(steering.releasePrompt,'ВЕРНИ КУРС В ЦЕНТР');assert.ok(steering.completed&&(steering.feedbackHidden||steering.feedbackLesson==='jump'||steering.feedbackLesson==='danger'),'wave feedback yields to the optional jump lesson: '+JSON.stringify(steering));assert.equal(steering.normalScale,1);assert.ok(steering.waves>0);assert.equal(steering.lesson,'jump');await shot('onboarding-jump');
    const landing=await page.evaluate(()=>{const g=game;g.state='playing';g.jump.press();g.step(1/120);g.updateHUD();g.updateVisuals(0);g.renderer.render(g.scene,g.camera);g.state='paused';return {lesson:document.getElementById('ride-coach').dataset.lesson,jumped:g.onboarding.completed.has('jump'),airborne:g.p.airborne,holding:g.jump.holding};});assert.equal(landing.lesson,'landing');assert.ok(landing.jumped&&landing.airborne&&!landing.holding);await shot('onboarding-tap-jump');
    const balanceLesson=await page.evaluate(()=>{
      const g=game;g.state='playing';while(g.p.airborne)g.step(1/120);const landed=g.onboarding.completed.has('landing');
      g.p.z=350;g.p.x=8;g.p.y=g.wave.height(8,350);g.balance.immunity=0;g.balance.disturb(.55,'ЖЁСТКАЯ ПОСАДКА',1);g.updateHUD();g.updateCamera(1,true);g.updateVisuals(0);g.wave.update(g.p.z,g.time,true);g.renderer.render(g.scene,g.camera);g.state='paused';
      return {landed,lesson:document.getElementById('ride-coach').dataset.lesson,line:document.getElementById('coach-line').textContent,scale:g.onboarding.timeScale};
    });assert.ok(balanceLesson.landed);assert.equal(balanceLesson.lesson,'balance');assert.match(balanceLesson.line,/сама выровняется/);assert.equal(balanceLesson.scale,1);await shot('onboarding-balance');
    const learned=await page.evaluate(()=>{
      const g=game;g.state='playing';g.input.mode='touch';
      for(let i=0;i<400;i++){g.input.target=THREE.MathUtils.clamp(-g.balance.roll*1.7-g.balance.velocity*.85,-1,1);g.step(1/120);g.comics.update(1/120);}
      const saved=g.balance.saves>0,completed=g.onboarding.completed.has('balance'),normalScale=g.onboarding.timeScale;
      g.reset();g.state='paused';return {saved,completed,normalScale,remembered:['steer','wave','jump','landing','balance'].every(id=>g.onboarding.completed.has(id)),highlighted:document.querySelectorAll('.learn-control').length};
    });assert.ok(learned.saved&&learned.completed&&learned.remembered);assert.equal(learned.normalScale,1);assert.equal(learned.highlighted,0);
    const onboarding={steering,landing,balanceLesson,learned};
    const mechanics=await page.evaluate(()=>{
      const g=game,dt=1/120;
      function setup(z=350){g.assist=false;g.reset();g.state='playing';g.input.mode='touch';g.p.z=z;g.p.x=8;g.p.y=g.wave.height(8,z);g.rivals.forEach(r=>r.z=2000);}
      function tick(n,control){for(let i=0;i<n;i++){if(control)control();g.step(dt);g.comics.update(dt);}}
      // Same crest with no correction and with continuous countersteering.
      const pin=()=>{const w=g.wave.waves[0];g.p.z=(w.from+w.to)/2;g.p.x=g.wave.crestX(w,g.p.z)+w.width*.07;};
      setup(70);let peak=0;tick(360,()=>{pin();peak=Math.max(peak,g.p.balance);});
      const idle={falls:g.balance.falls,peak,z:g.p.z};
      setup(70);tick(360,()=>{pin();g.input.target=THREE.MathUtils.clamp(-g.balance.roll*1.7-g.balance.velocity*.85,-1,1);});
      const corrected={falls:g.balance.falls,balance:g.p.balance,z:g.p.z};
      // A bad landing must enter active recovery, even on flat water.
      setup(350);g.jump.press();tick(1);while(g.p.airborne&&!g.jump.canSpin)tick(1);g.jump.press();
      while(g.p.airborne)tick(1);
      const hard={mode:g.balance.mode,roll:g.balance.roll,recovering:g.p.recovering,clean:g.jump.cleanLandings};
      g.input.pitchTarget=0;
      tick(90);const uncorrected={mode:g.balance.mode,recovering:g.p.recovering,falls:g.balance.falls};
      setup();g.balance.disturb(.55,'ТЕСТ ПОСАДКИ');
      tick(340,()=>{g.input.target=THREE.MathUtils.clamp(-g.balance.roll*1.7-g.balance.velocity*.85,-1,1);});
      const rescued={mode:g.balance.mode,saves:g.balance.saves,falls:g.balance.falls,balance:g.p.balance};
      setup();g.collected=0;g.combo=4;g.score=500;const initialZ=g.p.z;
      g.balance.disturb(.75,'НЕ ПОЙМАЛ');tick(180);
      const falling={mode:g.balance.mode,falls:g.balance.falls,beer:g.mug.level,z:g.p.z,initialZ,combo:g.combo};
      tick(180);
      const respawn={mode:g.balance.mode,fallen:g.p.fallen,immunity:g.balance.immunity,beer:g.mug.level,falls:g.balance.falls,score:g.score,collected:g.collected,capCount:g.caps.length,hidden:document.getElementById('wipeout-screen').classList.contains('hidden')};
      g.balance.disturb(.8,'Защита');const protectedMode=g.balance.mode;
      g.pause();g.reset();const reset={falls:g.balance.falls,saves:g.balance.saves,roll:g.balance.roll,hidden:document.getElementById('wipeout-screen').classList.contains('hidden')};
      return {idle,corrected,hard,uncorrected,rescued,falling,respawn,protectedMode,reset};
    });
    console.log(JSON.stringify(mechanics,null,2));
    assert.ok(mechanics.idle.falls>0&&mechanics.idle.peak>.7,'idle crest must be unstable');assert.equal(mechanics.corrected.falls,0,'countersteering should hold crest');
    assert.equal(mechanics.hard.mode,'recovery');assert.equal(mechanics.hard.clean,0);assert.ok(mechanics.hard.recovering>0);
    assert.ok(mechanics.uncorrected.recovering>0||mechanics.uncorrected.falls>0,'recovery cannot disappear on a timer');
    assert.ok(mechanics.rescued.saves>0);assert.equal(mechanics.rescued.falls,0);assert.equal(mechanics.rescued.mode,'stable');
    assert.equal(mechanics.falling.falls,1);assert.equal(mechanics.falling.combo,1);assert.equal(mechanics.respawn.falls,1);assert.equal(mechanics.respawn.mode,'stable');assert.equal(mechanics.respawn.hidden,true);assert.ok(mechanics.respawn.immunity>0);assert.equal(mechanics.respawn.collected,0);assert.ok(mechanics.respawn.capCount>=0);assert.equal(mechanics.protectedMode,'stable');
    assert.deepEqual(mechanics.reset,{falls:0,saves:0,roll:0,hidden:true});
    const scenes=[['crest',100],['shark',425],['jetski-cross',645],['jetski-other-side',645],['jetski-rear',790],['large-wave',990],['collection',1110]];
    for(const [name,z] of scenes){
      await page.evaluate(({name,z})=>{
        const g=game;g.reset();g.state='playing';g.journey.hideAll();document.getElementById('pause-screen').classList.add('hidden');g.container.classList.add('playing');g.p.z=z;g.time=z/25;g.wave.time=g.time;
        const w=g.wave.waves.find(w=>z>w.from&&z<w.to);g.p.x=w?THREE.MathUtils.clamp(g.wave.crestX(w,z)+w.width*(name==='crest'?.07:.4),-8,8):1;g.p.y=g.wave.height(g.p.x,z);
        g.world.step(.008);g.world.hazards.filter(h=>h.type==='jetski').forEach(h=>{const cross=name==='jetski-cross'||name==='jetski-other-side',selected=cross?h.mode==='cross':name==='jetski-rear'?h.mode==='overtake':false;h.activeAt=selected?g.time:null;h.direction=name==='jetski-other-side'?-1:1;h.z=selected?z+13:z+300;h.x=cross?g.p.x+3:g.p.x-3;});
        if(name==='crest'){g.balance.roll=.4;g.p.balance=.4;}
        if(name==='collection'){g.waveRide.totalCaught=3;g.score=123456;g.mug.level=.82;}
        g.wave.update(z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);g.state='paused';
      },{name,z});await shot('scene-'+name);
    }
    await page.evaluate(()=>{game.state='playing';game.balance.disturb(.65,'ЖЁСТКАЯ ПОСАДКА');game.updateHUD();game.state='paused';});await shot('scene-recovery');
    await page.evaluate(()=>{game.state='playing';game.balance.fall();game.updateVisuals(0);game.renderer.render(game.scene,game.camera);game.state='paused';});await shot('scene-fall');
    await page.evaluate(()=>{game.balance.stepFall(2);game.finish();});await shot('scene-finish');
    await page.click('#replay-button');await page.waitForFunction(()=>game.state==='playing');assert.equal(await page.evaluate(()=>game.balance.falls),0);
    await page.evaluate(()=>game.finish());await page.click('#result-screen [data-setup]');assert.equal(await page.evaluate(()=>game.journey.screen),'setup');
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.evaluate(()=>{game.journey.home();game.journey.page=1;game.journey.open('story');});
    await page.waitForFunction(()=>document.getElementById('comic-loading').hidden);
    const reduced=await page.$eval('.comic-panel img',el=>getComputedStyle(el).animationName);assert.equal(reduced,'none');
    await shot('reduced-motion-story');await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    fs.writeFileSync(path.join(review,'verification.json'),JSON.stringify({mechanics,onboarding,layouts,errors,missing},null,2));
    console.log('PASS: direct story-to-game launch, contextual onboarding and input progress, four viewports, carousels, story, crest balance, landing recovery, fall/respawn, reset, scene captures.');
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
