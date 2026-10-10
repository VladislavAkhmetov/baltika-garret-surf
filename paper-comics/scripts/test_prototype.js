const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function test(){
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 let browser;const errors=[],missing=[];
 try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/WebGL|Shader|THREE/.test(m.text()))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base)&&!r.url().endsWith('favicon.ico'))missing.push(r.url());});
  await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>{
    window.permissionCalls=0;Object.defineProperty(DeviceOrientationEvent,'requestPermission',{configurable:true,value:async()=>{permissionCalls++;return 'granted';}});
    window.sensorTimer=setInterval(()=>{const e=new Event('deviceorientation');Object.defineProperties(e,{gamma:{value:8},beta:{value:35}});dispatchEvent(e);},30);
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.game);
  await page.evaluate(async()=>{await Promise.all([game.heroAnimator.ready,game.comics.ready,game.world.ready]);});
  const review=path.resolve(__dirname,'../review/comics');fs.mkdirSync(review,{recursive:true});
  await page.screenshot({path:path.join(review,'01-mobile-start.png')});
  await page.click('#start-button');await page.click('#setup-next');await page.click('#story-skip');await page.waitForFunction(()=>game.state==='playing');
  const gyro=await page.evaluate(()=>{
    clearInterval(sensorTimer);const g=game;g.state='paused';g.reset();g.state='playing';
    const before=g.p.x;g.input.gamma=g.input.neutral+18;g.input.beta=g.input.neutralBeta-8;
    for(let i=0;i<60;i++)g.step(1/120);g.state='paused';
    const result={mode:g.input.mode,before,after:g.p.x,pitch:g.p.pitch,neutral:g.input.neutral,beta:g.input.neutralBeta,calls:permissionCalls};
    const sample=new Event('deviceorientation');Object.defineProperties(sample,{gamma:{value:g.input.gamma},beta:{value:g.input.beta}});dispatchEvent(sample);
    g.input.recenter();result.center=[g.input.gamma-g.input.neutral,g.input.beta-g.input.neutralBeta];
    return result;
  });
  assert.equal(gyro.mode,'gyro');assert.equal(gyro.calls,1);assert.ok(gyro.after>gyro.before+.3);assert.ok(Math.abs(gyro.pitch)<=.2,'weight follows the surface automatically');assert.deepEqual(gyro.center,[0,0]);
  const controls=await page.evaluate(()=>{
    const input=game.input,orientation=screen.orientation,descriptor=Object.getOwnPropertyDescriptor(orientation,'angle');let angle=0;
    Object.defineProperty(orientation,'angle',{configurable:true,get:()=>angle});input.orientationAngle=0;
    const sensor=(gamma,beta)=>{const e=new Event('deviceorientation');Object.defineProperties(e,{gamma:{value:gamma},beta:{value:beta}});dispatchEvent(e);};
    const rotations=[];
    for(const [a,neutral,tilt] of [[90,[35,-8],[27,-26]],[270,[-35,8],[-27,26]],[180,[-8,-35],[-26,-27]],[0,[8,35],[26,27]]]){
      angle=a;sensor(...neutral);input.update(.5);const centered=Math.abs(input.lean)+Math.abs(input.pitch);
      sensor(...tilt);input.update(1);rotations.push({angle:a,centered,lean:input.lean,pitch:input.pitch});
    }
    if(descriptor)Object.defineProperty(orientation,'angle',descriptor);else delete orientation.angle;
    input.reset();input.recenter();dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',bubbles:true}));dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));input.update(1);
    const keyboard={mode:input.mode,lean:input.lean,pitch:input.pitch};dispatchEvent(new Event('blur'));input.update(1);keyboard.released=Math.abs(input.lean)+Math.abs(input.pitch);
    return {rotations,keyboard};
  });
  for(const r of controls.rotations){assert.ok(r.centered<.002);assert.ok(r.lean>.8);assert.equal(r.pitch,0);}
  assert.equal(controls.keyboard.mode,'gyro');assert.ok(controls.keyboard.lean>.99);assert.equal(controls.keyboard.pitch,0);assert.ok(controls.keyboard.released<.002);
  const assets=await page.evaluate(async()=>{
    const out=[];
    for(const [name,texture] of Object.entries(game.heroAnimator.atlases)){
      const image=texture.image,c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
      const d=ctx.getImageData(0,0,c.width,c.height).data;let alpha=0;for(let i=3;i<d.length;i+=4)if(d[i]===0)alpha++;
      const fingerprints=[];for(let f=0;f<8;f++){let sum=0;for(let y=15;y<500;y+=11)for(let x=10;x<380;x+=7){const idx=((Math.floor(f/4)*512+y)*c.width+(f%4)*384+x)*4;sum+=(d[idx]+d[idx+1]*3+d[idx+3]*7)*(x+y);}fingerprints.push(sum);}
      out.push({name,size:[c.width,c.height],alpha:alpha/(d.length/4),unique:new Set(fingerprints).size});
    }
    return {sheets:out,photos:Object.keys(game.comics.images),sharks:game.world.hazards.filter(h=>h.type==='shark').map(h=>({size:[h.fin.material.map.image.width,h.fin.material.map.image.height]})),button:!!document.getElementById('crouch-button')};
  });
  assert.equal(assets.sheets.length,4);for(const s of assets.sheets){assert.deepEqual(s.size,[1536,1024]);assert.ok(s.alpha>.35);assert.equal(s.unique,8);}
  assert.equal(assets.photos.length,3);assert.equal(assets.sharks.length,2);assert.equal(assets.button,false);
  const mechanics=await page.evaluate(()=>{
    const g=game,dt=1/120;
    function setup(z=0,x=1){
      g.assist=true;g.reset();g.wave.resetWaves(42);g.state='playing';g.input.mode='touch';
      g.time=z/25;g.wave.time=g.time;g.p.z=z;g.p.x=x;g.p.y=g.wave.height(x,z);
      g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>{r.z=2000;r.collided=true;});
    }
    function control(){
      const p=g.p,w=g.wave.waves.find(w=>p.z>w.from&&p.z<w.to-22)||g.wave.waves.find(w=>w.to>p.z&&w.from<p.z+65);
      const desired=w?THREE.MathUtils.clamp(g.wave.crestX(w,p.z+5)+w.width*.34,-8,8):1;
      const vx=(desired-p.x)*1.6+g.wave.sample(p.x,p.z).dx*.32;
      g.input.target=THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(vx/(p.speed*.38),-.5,.5))/.43,-1,1);
    }
    const ride=enabled=>{
      setup(70);const first=g.wave.waves[0];g.p.x=g.wave.crestX(first,g.p.z)+first.width*.34;g.p.y=g.wave.height(g.p.x,g.p.z);const step=g.waveRide.step;let boost=0,speed=0;
      if(!enabled)g.waveRide.step=()=>{};
      for(let i=0;i<140;i++){control();g.step(dt);boost=Math.max(boost,g.waveRide.boost);speed+=g.p.speed;}
      g.waveRide.step=step;return {boost,averageSpeed:speed/140,caught:g.waveRide.totalCaught};
    };
    const riding=ride(true),coasting=ride(false);
    setup(630,-5);const jet=g.world.hazards.find(h=>h.mode==='cross');jet.done=false;jet.activeAt=g.time;jet.x=1;jet.z=658;
    const z=658+6*.36,quality=g.world.wakeQualityAt(-5,z),withWake=g.wave.height(-5,z);
    g.wave.wakeField=null;const lift=withWake-g.wave.height(-5,z);g.wave.wakeField=(x,z)=>g.world.wakeAt(x,z);
    setup(350,1);const rival=g.rivals[1];rival.collided=false;let contacts=0;const spill=g.spill;
    g.spill=function(amount,reason){if(reason.startsWith(rival.name))contacts++;return spill.call(this,amount,reason);};
    for(let i=0;i<40;i++){rival.x=g.p.x;rival.z=g.p.z+.2;g.step(dt);}g.spill=spill;
    const collision={contacts,beer:g.mug.level};
    setup();g.input.target=.8;for(let i=0;i<240;i++)g.step(dt);const slosh=g.handBeer.peakSlosh;
    g.input.target=0;for(let i=0;i<360;i++)g.step(dt);const settled=Math.max(...g.mug.h.map(Math.abs));
    setup();for(let i=0;i<10000&&g.state==='playing';i++){control();g.step(dt);g.comics.update(dt);}
    const finish={state:g.state,caught:g.waveRide.totalCaught,beer:g.mug.level,bonus:g.deliveryBonus,visible:!document.getElementById('result-screen').classList.contains('hidden')};
    g.reset();g.state='paused';const reset={level:g.mug.level,spilled:g.mug.totalSpilled,caught:g.waveRide.totalCaught,bonus:g.deliveryBonus};
    return {riding,coasting,wake:{quality,lift},collision,slosh,settled,finish,reset};
  });
  assert.ok(mechanics.riding.caught>0&&mechanics.riding.boost>2,'ordinary surfing catches a travelling wave');
  assert.ok(mechanics.riding.averageSpeed>mechanics.coasting.averageSpeed+.3,'riding contributes usable acceleration');
  assert.ok(mechanics.wake.quality>.4&&mechanics.wake.lift>.3,'jet wake changes the shared water surface');
  assert.equal(mechanics.collision.contacts,1);assert.ok(mechanics.collision.beer<1);
  assert.ok(mechanics.slosh>.02&&mechanics.settled<mechanics.slosh);
  assert.equal(mechanics.finish.state,'finished');assert.ok(mechanics.finish.caught>=5&&mechanics.finish.visible&&mechanics.finish.bonus>0);
  assert.deepEqual(mechanics.reset,{level:1,spilled:0,caught:0,bonus:0});
  const jumpsAndChase=await page.evaluate(()=>{
    const g=game,dt=1/120;
    const setup=(z=20)=>{g.assist=false;g.reset();g.state='playing';g.container.classList.add('playing');for(const id of ['pause-screen','result-screen'])document.getElementById(id).classList.add('hidden');g.input.mode='touch';g.rivals.forEach(r=>{r.z=2000;r.x=8;});g.p.z=z;g.p.x=1;g.p.y=g.wave.height(1,z);};
    const key=(type)=>dispatchEvent(new KeyboardEvent(type,{code:'Space',bubbles:true}));
    setup();key('keydown');g.step(dt);const charged=g.jump.charge;key('keyup');
    const launched=g.p.airborne;g.heroAnimator.update(dt);const pose={state:g.heroAnimator.state,frame:g.heroAnimator.frame};
    for(let i=0;i<240&&g.p.airborne;i++)g.step(dt);
    const clean={charged,launched,height:g.jump.lastHeight,landed:!g.p.airborne,landings:g.jump.cleanLandings,beer:g.mug.level,pose};
    setup(350);key('keydown');g.step(dt);key('keyup');while(g.p.airborne&&!g.jump.canSpin)g.step(dt);key('keydown');key('keyup');
    for(let i=0;i<240&&g.p.airborne;i++)g.step(dt);const hard={landings:g.jump.cleanLandings,beer:g.mug.level,recovering:g.p.recovering};
    setup();const high=g.wave.waves.filter(w=>w.encounterTime<38).reduce((best,w)=>w.height>best.height?w:best);g.time=high.encounterTime;g.wave.time=g.time;g.p.z=(high.from+high.to)/2;g.p.x=g.wave.crestX(high,g.p.z)+.1;g.p.y=g.wave.height(g.p.x,g.p.z);
    g.jump.press();g.step(dt);for(let i=0;i<240&&g.p.airborne;i++)g.step(dt);
    const peak={height:g.jump.lastHeight,landed:!g.p.airborne};
    setup();g.jump.button.dispatchEvent(new PointerEvent('pointerdown',{pointerId:12,bubbles:true}));g.jump.button.dispatchEvent(new PointerEvent('pointercancel',{pointerId:12,bubbles:true}));g.step(dt);
    const cancelled={holding:g.jump.holding,requested:g.jump.requested,airborne:g.p.airborne};
    key('keydown');g.pause();key('keyup');const paused={holding:g.jump.holding,requested:g.jump.requested};
    const chaseSetup=()=>{setup(606);g.time=5;g.world.step(dt);return g.world.hazards.find(h=>h.type==='shark');};
    let shark=chaseSetup();g.updateHUD();const activation={gap:g.p.z-shark.z,active:shark.chasing,icon:document.getElementById('shark-threat').classList.contains('visible')};
    g.p.x=7;const previousX=shark.x;g.time+=.1;g.world.step(.1);const lag={sharkX:shark.x,playerX:g.p.x,previousX};
    for(let i=0;i<1000&&shark.chasing;i++){g.time+=dt;g.p.z+=36*dt;g.world.step(dt);}const fast={escaped:shark.escaped,escapes:g.world.escapes,beer:g.mug.level};
    shark=chaseSetup();shark.z=g.p.z-20;shark.x=shark.targetX=g.p.x;g.time=shark.activeAt+7;
    for(let i=0;i<120;i++){g.time+=dt;g.p.z+=32*dt;g.world.step(dt);}const lunge={speed:shark.chaseSpeed,chasing:shark.chasing,escaped:shark.escaped};
    shark=chaseSetup();g.p.x=shark.x;
    for(let i=0;i<1000&&shark.chasing;i++){g.time+=dt;g.p.z+=22*dt;g.world.step(dt);}const slow={hit:shark.hit,beer:g.mug.level,done:shark.done};
    const level=g.mug.level;for(let i=0;i<300;i++){g.time+=dt;g.world.step(dt);}slow.repeatedLoss=level-g.mug.level;
    shark=chaseSetup();const w=g.wave.waves.filter(w=>w.encounterTime<38).reduce((best,w)=>w.height>best.height?w:best);g.time=w.encounterTime;g.wave.time=g.time;g.p.z=(w.from+w.to)/2;g.p.x=g.wave.crestX(w,g.p.z)+.1;g.p.y=g.wave.height(g.p.x,g.p.z);shark.activeAt=g.time;shark.x=shark.targetX=g.p.x;shark.z=g.p.z-4;g.jump.press();g.jump.step(dt,g.wave.sample(g.p.x,g.p.z));
    const jumpTrace=[];for(let i=0;i<150&&shark.chasing;i++){g.time+=dt;g.p.z+=22*dt;g.jump.step(dt,g.wave.sample(g.p.x,g.p.z));g.world.step(dt);if(i%10===0||shark.hit)jumpTrace.push({i,gap:g.p.z-shark.z,airY:g.p.airY,velocity:g.p.jumpVelocity});}
    const dodge={escaped:shark.escaped,hit:shark.hit,beer:g.mug.level,trace:jumpTrace};
    g.reset();g.state='paused';g.updateHUD();const reset={jumps:g.jump.jumps,holding:g.jump.holding,escapes:g.world.escapes,sharks:g.world.hazards.filter(h=>h.type==='shark').every(h=>h.activeAt===null&&!h.done&&!h.chasing),icon:document.getElementById('shark-threat').classList.contains('visible')};
    const crest=g.wave.crestX(g.wave.waves[0],100),epsilon=.001,center=g.wave.field(crest,100).lift;
    const slopes=[(center-g.wave.field(crest-epsilon,100).lift)/epsilon,(g.wave.field(crest+epsilon,100).lift-center)/epsilon];
    return {clean,hard,peak,cancelled,paused,activation,lag,fast,lunge,slow,dodge,reset,slopes};
  });
  const jc=jumpsAndChase;
  assert.ok(jc.clean.charged===0&&jc.clean.launched&&jc.clean.landed,JSON.stringify(jc.clean));assert.ok(jc.clean.height>.4);assert.equal(jc.clean.landings,1);assert.equal(jc.clean.pose.state,'trim');assert.equal(jc.clean.pose.frame,2);
  assert.equal(jc.hard.landings,0);assert.ok(jc.hard.beer<jc.clean.beer-.04&&jc.hard.recovering>0);
  assert.ok(jc.peak.height>2&&jc.peak.landed);
  assert.deepEqual(jc.cancelled,{holding:false,requested:false,airborne:false});assert.deepEqual(jc.paused,{holding:false,requested:false});
  assert.ok(jc.activation.active&&jc.activation.icon&&jc.activation.gap>23);assert.ok(jc.lag.sharkX<jc.lag.playerX-2);
  assert.ok(jc.fast.escaped&&jc.fast.escapes===1&&jc.fast.beer===1);assert.ok(jc.slow.hit&&jc.slow.done&&jc.slow.beer<.9);assert.equal(jc.slow.repeatedLoss,0);
  assert.ok(jc.lunge.speed>35&&jc.lunge.chasing&&!jc.lunge.escaped,'a prolonged chase must become a lunge rather than disappearing on a timer');
  assert.ok(jc.dodge.escaped&&!jc.dodge.hit&&jc.dodge.beer>.95,JSON.stringify(jc.dodge));
  assert.deepEqual(jc.reset,{jumps:0,holding:false,escapes:0,sharks:true,icon:false});assert.ok(Math.abs(jc.slopes[0]-jc.slopes[1])<.01,'crest normals should remain continuous while shoulder height varies');
  const feedback=await page.evaluate(()=>{
    const g=game;g.reset();g.state='paused';
    g.p.z=-80;g.updateHUD();const gap={label:document.getElementById('wave-label').textContent,number:document.getElementById('wave-number').textContent,remaining:document.getElementById('wave-remaining').textContent,phase:document.querySelector('.wave-ticket').dataset.phase};
    const last=g.wave.waves.at(-1);g.p.z=last.to-10;g.p.x=g.wave.crestX(last,g.p.z)+last.width*.34;g.waveRide.caught=true;g.waveRide.boost=8;g.updateHUD();
    const ending={status:document.getElementById('wave-status').textContent,phase:document.querySelector('.wave-ticket').dataset.phase,remaining:document.getElementById('wave-remaining').textContent};
    g.p.z=120;g.p.x=9;g.updateHUD();const nearby=document.getElementById('wave-label').textContent;
    g.p.balance=.8;g.p.pitch=.8;g.updateHUD();const risk={label:document.getElementById('balance-label').textContent,fill:document.getElementById('balance-fill').style.width,unstable:g.container.classList.contains('unstable')};
    const visible=el=>{if(!el)return false;return el.getClientRects().length>0&&getComputedStyle(el).display!=='none';};
    const hud={debug:visible(document.getElementById('ride-debug')),wave:visible(document.querySelector('.wave-ticket')),weight:visible(document.querySelector('.weight-ticket')),hint:visible(document.getElementById('hint')),beer:visible(document.querySelector('.beer-ticket')),score:visible(document.querySelector('.score-ticket')),pause:visible(document.getElementById('pause-button'))};
    const count=g.wave.waves.length;g.reset();return {gap,ending,nearby,risk,hud,count};
  });
  assert.equal(feedback.gap.phase,'gap');assert.equal(feedback.gap.number,'1/'+feedback.count);assert.match(feedback.gap.remaining,/^ЧЕРЕЗ \d+ М$/);assert.ok(feedback.gap.label.includes('ВПЕРЕДИ'));
  assert.equal(feedback.ending.phase,'ending');assert.equal(feedback.ending.status,'ПОСЛЕДНЯЯ ВОЛНА');assert.match(feedback.ending.remaining,/^ЕЩЁ \d+ М$/);
  assert.ok(feedback.nearby.length>0);assert.equal(feedback.risk.label,'ВЕС К ЦЕНТРУ');assert.equal(feedback.risk.fill,'80%');assert.equal(feedback.risk.unstable,true);
  assert.deepEqual(feedback.hud,{debug:false,wave:false,weight:false,hint:false,beer:true,score:true,pause:true});
  const animation=await page.evaluate(()=>{
    const g=game;g.animationReview=true;const animator=g.heroAnimator,frames=[];
    for(const state of ['trim','left','right','recovery'])for(let f=0;f<8;f++){
      animator.apply(state,f);g.handBeer.update();g.scene.updateMatrixWorld(true);const expected=animator.currentGrip,actual=g.handBeer.pivot.position;
      const mean=animator.footAnchor.clone();g.player.card.localToWorld(mean);
      const deck=new THREE.Vector3(0,0,.018);g.player.board.localToWorld(deck);
      frames.push({state,f,error:Math.hypot(expected.x-actual.x,expected.y-actual.y),anchorError:mean.distanceTo(deck),uv:[g.player.card.material.map.offset.x,g.player.card.material.map.offset.y]});
    }
    g.animationReview=false;animator.reset();g.p.lean=-.8;g.p.recovering=0;for(let i=0;i<60;i++)animator.update(1/120);g.p.lean=0;for(let i=0;i<60;i++)animator.update(1/120);
    const played=[...animator.framesSeen];animator.reset();g.p.lean=.8;for(let i=0;i<60;i++)animator.update(1/120);g.p.lean=0;for(let i=0;i<60;i++)animator.update(1/120);const playedRight=[...animator.framesSeen];
    animator.reset();g.p.lean=-.8;for(let i=0;i<60;i++)animator.update(1/120);g.p.lean=.8;
    const reversal=[];for(let i=0;i<70;i++){animator.update(1/120);const key=animator.state+':'+animator.frame;if(reversal.at(-1)!==key)reversal.push(key);}
    animator.reset();g.p.lean=-.8;for(let i=0;i<20;i++)animator.update(1/120);g.p.lean=0;
    const earlyRelease=[];for(let i=0;i<40;i++){animator.update(1/120);const key=animator.state+':'+animator.frame;if(earlyRelease.at(-1)!==key)earlyRelease.push(key);}
    g.p.lean=0;animator.reset();
    return {frames,played,playedRight,reversal,earlyRelease,mug:g.handBeer.mesh.geometry.parameters,fingerTexture:g.heroAnimator.fingerTextures.trim.version};
  });
  assert.equal(animation.frames.length,32);for(const f of animation.frames){assert.equal(f.error,0);assert.ok(f.anchorError<1e-6);}
  for(let i=0;i<8;i++){assert.ok(animation.played.includes('left:'+i));assert.ok(animation.playedRight.includes('right:'+i));}
  assert.deepEqual(animation.reversal.slice(0,5),['left:4','left:5','left:6','left:7','right:0']);assert.ok(animation.reversal.includes('right:4'));
  assert.ok(animation.earlyRelease.includes('trim:0'));assert.ok(!animation.earlyRelease.includes('left:4'),'releasing an unfinished carve should unwind toward neutral');
  assert.ok(animation.mug.height<=1.4);assert.ok(animation.fingerTexture>0);
  // Portrait face ride and earned crest freeze.
  await page.evaluate(()=>{
    const g=game;g.reset();g.state='paused';['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));g.container.classList.add('playing');g.p.z=120;g.p.x=g.wave.crestX(g.wave.waves[0],120)+2.8;g.p.y=g.wave.height(g.p.x,g.p.z);g.waveRide.zone='face';g.waveRide.caught=true;g.waveRide.charge=.9;g.waveRide.boost=8;g.p.speed=34;g.hintTime=0;document.getElementById('hint').classList.add('invisible');g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);
  });
  await page.screenshot({path:path.join(review,'02-mobile-wave-face.png')});
  await page.evaluate(()=>{const g=game;g.comics.trigger('УАУ!','ВЫШЕ ВСЕХ. ПИВО НА МЕСТЕ.','crest');g.renderer.render(g.scene,g.camera);g.comics.capture();});
  await page.screenshot({path:path.join(review,'03-anime-crest.png')});
  await page.evaluate(()=>{game.state='playing';game.pause();});
  const beforePause=await page.evaluate(()=>({elapsed:game.comics.elapsed,time:game.time}));
  await new Promise(resolve=>setTimeout(resolve,350));
  const afterPause=await page.evaluate(()=>({elapsed:game.comics.elapsed,time:game.time,visible:!document.getElementById('pause-screen').classList.contains('hidden')}));
  assert.equal(beforePause.elapsed,afterPause.elapsed);assert.equal(beforePause.time,afterPause.time);assert.equal(afterPause.visible,true);
  const noSpam=await page.evaluate(()=>game.comics.trigger('ЕЩЁ!','','save'));
  await page.click('#resume-button');const slow=await page.waitForFunction(()=>game.comics.timeScale===.14?.14:false).then(handle=>handle.jsonValue());
  await page.waitForFunction(()=>!game.comics.active);
  const comic=await page.evaluate(()=>{const g=game;g.pause();document.getElementById('pause-screen').classList.add('hidden');return{ended:!g.comics.active,photos:g.comics.images.crest.complete,paused:true,resumed:g.time>0};});Object.assign(comic,{noSpam,slow});
  assert.equal(comic.noSpam,false);assert.equal(comic.slow,.14);assert.equal(comic.ended,true);assert.equal(comic.photos,true);assert.equal(comic.resumed,true);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluate(()=>{game.reducedMotion=true;game.comics.reset();game.comics.trigger('ФУХ!','','save');});
  assert.equal(await page.evaluate(()=>game.comics.active),false);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  // Permission denial leaves the same single-axis steering and jump action.
  const fallback=await browser.newPage();fallback.on('pageerror',e=>errors.push(e.message));
  await fallback.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
  await fallback.evaluateOnNewDocument(()=>{Object.defineProperty(DeviceOrientationEvent,'requestPermission',{value:async()=>'denied'});});
  await fallback.goto(base,{waitUntil:'domcontentloaded'});await fallback.click('#start-button');await fallback.click('#setup-next');await fallback.click('#story-skip');await fallback.waitForFunction(()=>game.state==='playing');
  const touch=await fallback.evaluate(()=>{const g=game;g.state='paused';const el=g.container;const event=(name,x,y)=>el.dispatchEvent(new PointerEvent(name,{pointerId:11,pointerType:'touch',clientX:x,clientY:y,bubbles:true}));event('pointerdown',90,490);event('pointermove',140,435);g.input.update(.2);const result={mode:g.input.mode,lean:g.input.lean,pitch:g.input.pitch};event('pointercancel',140,435);g.input.update(1);result.cancelled=Math.abs(g.input.pitch)+Math.abs(g.input.lean);return result;});
  assert.equal(touch.mode,'touch');assert.ok(touch.lean>.3);assert.equal(touch.pitch,0);assert.ok(touch.cancelled<.002);
  await fallback.close();
  await page.setViewport({width:1240,height:900,isMobile:false,hasTouch:false});
  await page.evaluate(async()=>{await game.start(false);game.state='paused';game.comics.reset();game.reducedMotion=false;game.p.z=480;game.p.x=game.wave.crestX(game.wave.waves[2],480)+4.2;game.p.y=game.wave.height(game.p.x,480);game.resize();game.updateCamera(1,true);game.updateVisuals(0);game.wave.update(game.p.z,game.time,true);});
  await page.screenshot({path:path.join(review,'04-desktop-square.png')});
  const stage=await page.$eval('#app-container',el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};});assert.deepEqual(stage,{width:1240,height:900});
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(review,'verification.json'),JSON.stringify({gyro,controls,assets,mechanics,jumpsAndChase,feedback,animation,comic,touch,errors,missing},null,2));
  console.log('PASS: wave acceleration, gyro/touch/keyboard, wake, tap jump/landing, shark chase/escape/dodge, beer, HUD, 32 animation frames, comic timing, finish/restart, portrait and full desktop stage.');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
test().catch(error=>{console.error(error);process.exitCode=1;});
