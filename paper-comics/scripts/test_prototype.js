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
  await page.click('#start-button');await page.waitForFunction(()=>game.state==='playing');
  const gyro=await page.evaluate(()=>{
    clearInterval(sensorTimer);const g=game;g.state='paused';g.reset();g.state='playing';
    const before=g.p.x;g.input.gamma=g.input.neutral+18;g.input.beta=g.input.neutralBeta-8;
    for(let i=0;i<60;i++)g.step(1/120);g.state='paused';
    const result={mode:g.input.mode,before,after:g.p.x,pitch:g.p.pitch,neutral:g.input.neutral,beta:g.input.neutralBeta,calls:permissionCalls};
    g.input.recenter();result.center=[g.input.gamma-g.input.neutral,g.input.beta-g.input.neutralBeta];
    return result;
  });
  assert.equal(gyro.mode,'gyro');assert.equal(gyro.calls,1);assert.ok(gyro.after>gyro.before+.3);assert.ok(gyro.pitch>.3);assert.deepEqual(gyro.center,[0,0]);
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
    input.reset();dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',bubbles:true}));dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));input.update(1);
    const keyboard={mode:input.mode,lean:input.lean,pitch:input.pitch};dispatchEvent(new Event('blur'));input.update(1);keyboard.released=Math.abs(input.lean)+Math.abs(input.pitch);
    return {rotations,keyboard};
  });
  for(const r of controls.rotations){assert.ok(r.centered<.002);assert.ok(r.lean>.8&&r.pitch>.5);}
  assert.equal(controls.keyboard.mode,'keys');assert.ok(controls.keyboard.lean>.99&&controls.keyboard.pitch>.99);assert.ok(controls.keyboard.released<.002);
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
    function setup(z=0,face=.42){
      g.reset();g.state='playing';g.input.mode='touch';g.input.target=g.input.pitchTarget=0;g.rivals.forEach(r=>{r.z=2000;r.x=8;});
      if(z){const w=g.wave.waves.find(w=>z>w.from&&z<w.to);g.p.z=z;g.p.x=w?g.wave.crestX(w,z)+w.width*face:1;g.p.y=g.wave.height(g.p.x,z);}
    }
    function control(face=.42,pitch=0){
      const p=g.p;let w=g.wave.waves.find(w=>p.z>w.from&&p.z<w.to-22);
      if(!w)w=g.wave.waves.find(w=>w.to>p.z&&w.from<p.z+65);
      const desired=w?g.wave.crestX(w,p.z+5)+w.width*face:1;
      const vx=(desired-p.x)*1.6+g.wave.sample(p.x,p.z).dx*.4;
      g.input.target=THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(vx/(p.speed*.38),-.5,.5))/.55,-1,1);g.input.pitchTarget=pitch;
    }
    setup();const w=g.wave.waves[0],z=110,cx=g.wave.crestX(w,z);
    const heights=[.05,.4,.85].map(f=>g.wave.height(cx+w.width*f,z));
    const gap=g.wave.field(0,370).wave;const startEnvelope=g.wave.envelope(w,w.from),endEnvelope=g.wave.envelope(w,w.to);
    setup(90,.42);for(let i=0;i<180;i++){control(.42);g.step(dt);}const middle={speed:g.p.speed,boost:g.waveRide.boost,caught:g.waveRide.caught,captures:g.waveRide.totalCaught,beer:g.mug.level};
    setup(90,.85);for(let i=0;i<180;i++){control(.85);g.step(dt);}const baseSpeed=g.p.speed;
    setup(90,.42);for(let i=0;i<120;i++){control(.42,.35);g.step(dt);}const front=g.p.speed;
    setup(90,.42);for(let i=0;i<120;i++){control(.42,-.35);g.step(dt);}const rear=g.p.speed;
    setup(90,.42);g.input.target=.5;for(let i=0;i<40;i++)g.step(dt);const down=g.p.speed;
    setup(90,.42);g.input.target=-.5;for(let i=0;i<40;i++)g.step(dt);const up=g.p.speed;
    setup(90,.08);for(let i=0;i<330;i++){control(.08);g.step(dt);g.comics.update(dt);}const crest={awards:[...g.waveRide.crestAwards],event:g.comics.lastEvent,beer:g.mug.level,balance:g.p.balance};
    setup(90,.08);for(let i=0;i<600;i++){control(.08,1);g.step(dt);}const risk={beer:g.mug.level,balance:g.p.balance};
    setup(190,.4);g.waveRide.lastId=0;g.waveRide.lastCatchTime=g.time;g.waveRide.capturedIds.add(0);
    for(let i=0;i<300;i++){control(.4);g.step(dt);g.comics.update(dt);}const transfers={count:g.waveRide.transfers,tricks:[...g.tricksSeen]};
    setup(55,.32);for(let i=0;i<90;i++){control(.32);g.step(dt);}
    const cutbackTrace=[];
    for(let i=0;i<320;i++){
      g.input.target=i<145?1:-1;g.step(dt);
      if(i%20===0)cutbackTrace.push({i,face:g.wave.sample(g.p.x,g.p.z).face,departure:g.waveRide.departure?{...g.waveRide.departure}:null});
    }
    const cutback={awards:[...g.waveRide.cutbackAwards],tricks:[...g.tricksSeen],trace:cutbackTrace};
    setup(90,.85);for(let i=0;i<160;i++){control(.4);g.step(dt);}
    cutback.straightEntryAwards=g.waveRide.cutbackAwards.size;
    setup(750,.42);const overtaker=g.world.hazards.find(h=>h.mode==='overtake');g.p.x=3.8;
    g.world.step(dt);const premature={passed:overtaker.passed,score:g.score,warning:document.getElementById('hint').textContent};
    for(let i=0;i<840&&!overtaker.passed;i++){g.time+=dt;g.p.z+=30*dt;g.world.step(dt);}
    const overtake={premature,passed:overtaker.passed,hit:overtaker.hit,nearest:overtaker.nearestPass,tricks:[...g.tricksSeen]};
    setup(630,.42);const jet=g.world.hazards.find(h=>h.type==='jetski'&&h.mode==='cross');jet.activeAt=0;jet.x=1;jet.z=658;
    const x=-5,zWake=658+6*.36;const quality=g.world.wakeQualityAt(x,zWake),withWake=g.wave.height(x,zWake);g.wave.wakeField=null;const without=g.wave.height(x,zWake);g.wave.wakeField=(x,z)=>g.world.wakeAt(x,z);
    setup(780,.42);const parallel=g.world.hazards.find(h=>h.type==='jetski'&&h.mode==='overtake');
    parallel.activeAt=0;parallel.z=g.p.z+4;g.p.speed=31;g.p.x=parallel.x-4*.36;g.p.y=g.wave.height(g.p.x,g.p.z);
    const wakeTrace=[];
    for(let i=0;i<220;i++){
      const desired=parallel.x-(parallel.z-g.p.z)*.36,velocity=(desired-g.p.x)*6-(34-g.p.speed)*.36;
      g.input.target=THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(velocity/(g.p.speed*.38),-.5,.5))/.55,-1,1);
      g.step(dt);g.comics.update(dt);
      if(i%30===0)wakeTrace.push({i,x:g.p.x,desired,speed:g.p.speed,quality:g.world.wakeQualityAt(g.p.x,g.p.z),clock:g.wakeClock,balance:g.p.balance});
    }
    const wakeRide={count:g.world.wakeRides,tricks:[...g.tricksSeen],speed:g.p.speed,trace:wakeTrace};
    setup(780,.42);const ghostJet=g.world.hazards.find(h=>h.type==='jetski'&&h.mode==='overtake');
    ghostJet.activeAt=0;ghostJet.z=g.p.z+4;g.p.speed=31;g.p.x=ghostJet.x-4*.36;g.p.y=g.wave.height(g.p.x,g.p.z);
    const wakeFunction=g.world.wakeQualityAt;g.world.wakeQualityAt=()=>0;
    for(let i=0;i<220;i++){
      const desired=ghostJet.x-(ghostJet.z-g.p.z)*.36,velocity=(desired-g.p.x)*6-(34-g.p.speed)*.36;
      g.input.target=THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(velocity/(g.p.speed*.38),-.5,.5))/.55,-1,1);
      g.step(dt);g.comics.update(dt);
    }
    wakeRide.withoutWake=g.p.speed;g.world.wakeQualityAt=wakeFunction;
    setup(430,.42);const shark=g.world.hazards.find(h=>h.type==='shark');shark.activeAt=g.time;shark.chasing=true;shark.x=shark.targetX=g.p.x;shark.z=g.p.z;g.step(dt);const collision={hit:shark.hit,beer:g.mug.level,protected:g.impactCooldown>0};
    setup(950,.38);const stas=g.rivals[2];stas.x=g.p.x;stas.z=g.p.z+.5;
    const spillMethod=g.spill;let rivalContacts=0;
    g.spill=function(amount,reason){if(reason.startsWith(stas.name))rivalContacts++;return spillMethod.call(this,amount,reason);};
    for(let i=0;i<1200&&g.state==='playing';i++){control(.38,.1);g.step(dt);g.comics.update(dt);}
    g.spill=spillMethod;const company={contacts:rivalContacts,beer:g.mug.level,z:g.p.z};
    setup();g.input.target=.8;for(let i=0;i<240;i++)g.step(dt);const slosh=g.handBeer.peakSlosh;
    g.input.target=g.input.pitchTarget=0;for(let i=0;i<360;i++)g.step(dt);const settled=Math.max(...g.mug.h.map(Math.abs));
    setup();let airborne=false;for(let i=0;i<9000&&g.state==='playing';i++){control(.38,.1);g.step(dt);g.comics.update(dt);airborne=airborne||g.p.airborne;}
    const finish={state:g.state,z:g.p.z,seconds:g.elapsed,caught:g.waveRide.totalCaught,beer:g.mug.level,airborne,visible:!document.getElementById('result-screen').classList.contains('hidden')};
    g.reset();const reset={level:g.mug.level,spilled:g.mug.totalSpilled,caught:g.waveRide.totalCaught,wake:g.world.wakeRides,jets:g.world.hazards.filter(h=>h.type==='jetski').every(h=>h.activeAt===null&&h.z===h.initialZ),company:g.rivals.every(r=>!r.contactLocked&&r.yieldTime===0),combo:g.combo};
    g.state='paused';
    return {heights,gap,startEnvelope,endEnvelope,middle,baseSpeed,front,rear,down,up,crest,risk,transfers,cutback,overtake,company,wake:{quality,lift:withWake-without},wakeRide,collision,slosh,settled,finish,reset};
  });
  console.log(JSON.stringify({gyro:{mode:gyro.mode,neutral:gyro.neutral,beta:gyro.beta},speed:{face:mechanics.middle.speed,base:mechanics.baseSpeed,wake:mechanics.wakeRide.speed,withoutWake:mechanics.wakeRide.withoutWake},finish:mechanics.finish},null,2));
  assert.ok(mechanics.heights[0]>mechanics.heights[1]&&mechanics.heights[1]>mechanics.heights[2]);
  assert.equal(mechanics.gap,null);assert.equal(mechanics.startEnvelope,0);assert.equal(mechanics.endEnvelope,0);
  assert.equal(mechanics.middle.caught,true);assert.ok(mechanics.middle.boost>3);assert.ok(mechanics.middle.speed>mechanics.baseSpeed+2);
  assert.ok(mechanics.front>mechanics.rear+.5);assert.ok(mechanics.down>mechanics.up+.1);
  assert.ok(mechanics.crest.awards.length);assert.equal(mechanics.crest.event.variant,'crest');
  assert.ok(mechanics.risk.beer<1);assert.ok(mechanics.transfers.count>=1);assert.ok(mechanics.transfers.tricks.includes('ПЕРЕХОД'));
  assert.ok(mechanics.cutback.tricks.includes('КАТБЭК'),JSON.stringify(mechanics.cutback));assert.equal(mechanics.cutback.awards.length,1);assert.equal(mechanics.cutback.straightEntryAwards,0);
  assert.equal(mechanics.overtake.premature.passed,false);assert.equal(mechanics.overtake.premature.score,0);assert.ok(mechanics.overtake.premature.warning.includes('ОБГОНЯЕТ'));
  assert.equal(mechanics.overtake.passed,true);assert.equal(mechanics.overtake.hit,false);assert.ok(mechanics.overtake.tricks.includes('РАЗОШЛИСЬ'));
  assert.equal(mechanics.company.contacts,1,'the same close encounter should not repeatedly drain beer');assert.ok(mechanics.company.z>=1200);assert.equal(mechanics.reset.company,true);
  assert.ok(mechanics.wake.quality>.4&&mechanics.wake.lift>.3);assert.equal(mechanics.collision.hit,true);assert.ok(mechanics.collision.beer<.9);
  assert.ok(mechanics.wakeRide.count>=1&&mechanics.wakeRide.tricks.includes('НА ХВОСТЕ'));
  assert.ok(mechanics.wakeRide.speed>mechanics.wakeRide.withoutWake+1,'catching the moving wake should preserve more speed than the same uphill line without it');
  assert.ok(mechanics.slosh>.02);assert.ok(mechanics.settled<mechanics.slosh);
  assert.equal(mechanics.finish.state,'finished');assert.equal(mechanics.finish.visible,true);assert.equal(mechanics.finish.airborne,false);assert.ok(mechanics.finish.caught>=5);
  assert.equal(mechanics.reset.level,1);assert.equal(mechanics.reset.spilled,0);assert.equal(mechanics.reset.caught,0);assert.equal(mechanics.reset.jets,true);
  const jumpsAndChase=await page.evaluate(()=>{
    const g=game,dt=1/120;
    const setup=(z=20)=>{g.reset();g.state='playing';g.input.mode='touch';g.rivals.forEach(r=>{r.z=2000;r.x=8;});g.p.z=z;g.p.x=1;g.p.y=g.wave.height(1,z);};
    const key=(type)=>dispatchEvent(new KeyboardEvent(type,{code:'Space',bubbles:true}));
    setup();key('keydown');for(let i=0;i<60;i++)g.step(dt);const charged=g.jump.charge;key('keyup');g.step(dt);
    const launched=g.p.airborne;g.heroAnimator.update(dt);const pose={state:g.heroAnimator.state,frame:g.heroAnimator.frame};
    for(let i=0;i<240&&g.p.airborne;i++)g.step(dt);
    const clean={charged,launched,height:g.jump.lastHeight,landed:!g.p.airborne,landings:g.jump.cleanLandings,beer:g.mug.level,pose};
    setup();key('keydown');for(let i=0;i<60;i++)g.step(dt);key('keyup');g.step(dt);g.input.pitchTarget=1;
    for(let i=0;i<240&&g.p.airborne;i++)g.step(dt);const hard={landings:g.jump.cleanLandings,beer:g.mug.level,recovering:g.p.recovering};
    setup(75);g.p.x=g.wave.crestX(g.wave.waves[0],75)+.08*g.wave.waves[0].width;g.p.y=g.wave.height(g.p.x,g.p.z);g.jump.press();
    for(let i=0;i<60;i++)g.step(dt);g.jump.release();g.step(dt);for(let i=0;i<160&&g.p.airborne;i++){g.step(dt);g.comics.update(dt);}
    const peak={event:g.comics.lastEvent,height:g.jump.lastHeight};
    setup();g.jump.button.dispatchEvent(new PointerEvent('pointerdown',{pointerId:12,bubbles:true}));g.step(.1);g.jump.button.dispatchEvent(new PointerEvent('pointercancel',{pointerId:12,bubbles:true}));g.step(dt);
    const cancelled={holding:g.jump.holding,requested:g.jump.requested,airborne:g.p.airborne};
    key('keydown');g.pause();key('keyup');const paused={holding:g.jump.holding,requested:g.jump.requested};
    const chaseSetup=()=>{setup(406);g.time=5;g.world.step(dt);return g.world.hazards.find(h=>h.type==='shark');};
    let shark=chaseSetup();g.updateHUD();const activation={gap:g.p.z-shark.z,active:shark.chasing,icon:document.getElementById('shark-threat').classList.contains('visible')};
    g.p.x=7;const previousX=shark.x;g.time+=.1;g.world.step(.1);const lag={sharkX:shark.x,playerX:g.p.x,previousX};
    for(let i=0;i<1000&&shark.chasing;i++){g.time+=dt;g.p.z+=36*dt;g.world.step(dt);}const fast={escaped:shark.escaped,escapes:g.world.escapes,beer:g.mug.level};
    shark=chaseSetup();shark.z=g.p.z-20;shark.x=shark.targetX=g.p.x;g.time=shark.activeAt+7;
    for(let i=0;i<120;i++){g.time+=dt;g.p.z+=32*dt;g.world.step(dt);}const lunge={speed:shark.chaseSpeed,chasing:shark.chasing,escaped:shark.escaped};
    shark=chaseSetup();g.p.x=shark.x;
    for(let i=0;i<1000&&shark.chasing;i++){g.time+=dt;g.p.z+=22*dt;g.world.step(dt);}const slow={hit:shark.hit,beer:g.mug.level,done:shark.done};
    const level=g.mug.level;for(let i=0;i<300;i++){g.time+=dt;g.world.step(dt);}slow.repeatedLoss=level-g.mug.level;
    shark=chaseSetup();shark.x=shark.targetX=g.p.x;shark.z=g.p.z-4;g.jump.press();g.jump.charge=1;g.jump.release();g.jump.step(dt,g.wave.sample(g.p.x,g.p.z));
    const jumpTrace=[];for(let i=0;i<150&&shark.chasing;i++){g.time+=dt;g.p.z+=22*dt;g.jump.step(dt,g.wave.sample(g.p.x,g.p.z));g.world.step(dt);if(i%10===0||shark.hit)jumpTrace.push({i,gap:g.p.z-shark.z,airY:g.p.airY,velocity:g.p.jumpVelocity});}
    const dodge={escaped:shark.escaped,hit:shark.hit,beer:g.mug.level,trace:jumpTrace};
    g.reset();g.state='paused';g.updateHUD();const reset={jumps:g.jump.jumps,holding:g.jump.holding,escapes:g.world.escapes,sharks:g.world.hazards.filter(h=>h.type==='shark').every(h=>h.activeAt===null&&!h.done&&!h.chasing),icon:document.getElementById('shark-threat').classList.contains('visible')};
    const crest=g.wave.crestX(g.wave.waves[0],100),epsilon=.001,center=g.wave.field(crest,100).lift;
    const slopes=[(center-g.wave.field(crest-epsilon,100).lift)/epsilon,(g.wave.field(crest+epsilon,100).lift-center)/epsilon];
    return {clean,hard,peak,cancelled,paused,activation,lag,fast,lunge,slow,dodge,reset,slopes};
  });
  const jc=jumpsAndChase;
  assert.ok(jc.clean.charged>.99&&jc.clean.launched&&jc.clean.landed);assert.ok(jc.clean.height>1.8);assert.equal(jc.clean.landings,1);assert.equal(jc.clean.pose.state,'trim');assert.equal(jc.clean.pose.frame,2);
  assert.equal(jc.hard.landings,0);assert.ok(jc.hard.beer<jc.clean.beer-.04&&jc.hard.recovering>0);
  assert.equal(jc.peak.event.variant,'crest');assert.ok(jc.peak.height>2);
  assert.deepEqual(jc.cancelled,{holding:false,requested:false,airborne:false});assert.deepEqual(jc.paused,{holding:false,requested:false});
  assert.ok(jc.activation.active&&jc.activation.icon&&jc.activation.gap>23);assert.ok(jc.lag.sharkX<jc.lag.playerX-2);
  assert.ok(jc.fast.escaped&&jc.fast.escapes===1&&jc.fast.beer===1);assert.ok(jc.slow.hit&&jc.slow.done&&jc.slow.beer<.9);assert.equal(jc.slow.repeatedLoss,0);
  assert.ok(jc.lunge.speed>35&&jc.lunge.chasing&&!jc.lunge.escaped,'a prolonged chase must become a lunge rather than disappearing on a timer');
  assert.ok(jc.dodge.escaped&&!jc.dodge.hit&&jc.dodge.beer>.95,JSON.stringify(jc.dodge));
  assert.deepEqual(jc.reset,{jumps:0,holding:false,escapes:0,sharks:true,icon:false});assert.ok(jc.slopes.every(s=>Math.abs(s)<.001),'rounded crest should have a continuous, flat tangent');
  const feedback=await page.evaluate(()=>{
    const g=game;g.reset();g.state='paused';
    g.p.z=370;g.updateHUD();const gap={label:document.getElementById('wave-label').textContent,number:document.getElementById('wave-number').textContent,remaining:document.getElementById('wave-remaining').textContent,phase:document.querySelector('.wave-ticket').dataset.phase};
    g.p.z=140;g.p.x=g.wave.crestX(g.wave.waves[0],140)+4.2;g.waveRide.caught=true;g.waveRide.boost=8;g.updateHUD();
    const ending={status:document.getElementById('wave-status').textContent,phase:document.querySelector('.wave-ticket').dataset.phase,remaining:document.getElementById('wave-remaining').textContent};
    g.p.z=120;g.p.x=9;g.updateHUD();const nearby=document.getElementById('wave-label').textContent;
    g.p.balance=.8;g.p.pitch=.8;g.updateHUD();const risk={label:document.getElementById('balance-label').textContent,fill:document.getElementById('balance-fill').style.width,unstable:g.container.classList.contains('unstable')};
    const visible=el=>{if(!el)return false;return el.getClientRects().length>0&&getComputedStyle(el).display!=='none';};
    const hud={debug:visible(document.getElementById('ride-debug')),wave:visible(document.querySelector('.wave-ticket')),weight:visible(document.querySelector('.weight-ticket')),hint:visible(document.getElementById('hint')),beer:visible(document.querySelector('.beer-ticket')),score:visible(document.querySelector('.score-ticket')),pause:visible(document.getElementById('pause-button'))};
    g.reset();return {gap,ending,nearby,risk,hud};
  });
  assert.equal(feedback.gap.phase,'gap');assert.equal(feedback.gap.number,'3/7');assert.equal(feedback.gap.remaining,'ЧЕРЕЗ 20 М');assert.ok(feedback.gap.label.includes('ВПЕРЕДИ'));
  assert.equal(feedback.ending.phase,'ending');assert.equal(feedback.ending.status,'ГОТОВЬ ПЕРЕХОД');assert.ok(feedback.ending.remaining.includes('НОВАЯ'));
  assert.ok(feedback.nearby.includes('РЯДОМ'));assert.ok(feedback.nearby.includes('←'));assert.equal(feedback.risk.label,'ВЕС К ЦЕНТРУ');assert.equal(feedback.risk.fill,'80%');assert.equal(feedback.risk.unstable,true);
  assert.deepEqual(feedback.hud,{debug:false,wave:false,weight:false,hint:false,beer:true,score:true,pause:true});
  const animation=await page.evaluate(()=>{
    const g=game;g.animationReview=true;const animator=g.heroAnimator,frames=[];
    for(const state of ['trim','left','right','recovery'])for(let f=0;f<8;f++){
      animator.apply(state,f);g.handBeer.update();const expected=animator.currentGrip,actual=g.handBeer.pivot.position;
      frames.push({state,f,error:Math.hypot(expected.x-actual.x,expected.y-actual.y),feet:g.player.card.position.y-(animator.metadata[state].feet[f][1]/512-.5)*animator.height,uv:[g.player.card.material.map.offset.x,g.player.card.material.map.offset.y]});
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
  assert.equal(animation.frames.length,32);for(const f of animation.frames){assert.equal(f.error,0);assert.ok(Math.abs(f.feet-.12)<.001);}
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
  await page.click('#resume-button');await page.waitForFunction(()=>game.comics.timeScale===.14);const slow=await page.evaluate(()=>game.comics.timeScale);
  await page.waitForFunction(()=>!game.comics.active);
  const comic=await page.evaluate(()=>{const g=game;g.pause();document.getElementById('pause-screen').classList.add('hidden');return{ended:!g.comics.active,photos:g.comics.images.crest.complete,paused:true,resumed:g.time>0};});Object.assign(comic,{noSpam,slow});
  assert.equal(comic.noSpam,false);assert.equal(comic.slow,.14);assert.equal(comic.ended,true);assert.equal(comic.photos,true);assert.equal(comic.resumed,true);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluate(()=>{game.reducedMotion=true;game.comics.reset();game.comics.trigger('ФУХ!','','save');});
  assert.equal(await page.evaluate(()=>game.comics.active),false);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  // Permission denial still leaves a playable two-dimensional touch fallback.
  const fallback=await browser.newPage();fallback.on('pageerror',e=>errors.push(e.message));
  await fallback.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
  await fallback.evaluateOnNewDocument(()=>{Object.defineProperty(DeviceOrientationEvent,'requestPermission',{value:async()=>'denied'});});
  await fallback.goto(base);await fallback.click('#start-button');await fallback.waitForFunction(()=>game.state==='playing');
  const touch=await fallback.evaluate(()=>{const g=game;g.state='paused';const el=g.container;const event=(name,x,y)=>el.dispatchEvent(new PointerEvent(name,{pointerId:11,pointerType:'touch',clientX:x,clientY:y,bubbles:true}));event('pointerdown',90,490);event('pointermove',140,435);g.input.update(.2);const result={mode:g.input.mode,lean:g.input.lean,pitch:g.input.pitch};event('pointercancel',140,435);g.input.update(1);result.cancelled=Math.abs(g.input.pitch)+Math.abs(g.input.lean);return result;});
  assert.equal(touch.mode,'touch');assert.ok(touch.lean>.3&&touch.pitch>.3);assert.ok(touch.cancelled<.002);
  await fallback.close();
  await page.setViewport({width:1240,height:900,isMobile:false,hasTouch:false});
  await page.evaluate(async()=>{await game.start(false);game.state='paused';game.comics.reset();game.reducedMotion=false;game.p.z=480;game.p.x=game.wave.crestX(game.wave.waves[2],480)+4.2;game.p.y=game.wave.height(game.p.x,480);game.resize();game.updateCamera(1,true);game.updateVisuals(0);game.wave.update(game.p.z,game.time,true);});
  await page.screenshot({path:path.join(review,'04-desktop-square.png')});
  const square=await page.$eval('#app-container',el=>{const r=el.getBoundingClientRect();return Math.abs(r.width-r.height);});assert.ok(square<2);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(review,'verification.json'),JSON.stringify({gyro,controls,assets,mechanics,jumpsAndChase,feedback,animation,comic,touch,errors,missing},null,2));
  console.log('PASS: rounded finite waves, gyro/touch/keyboard, cutback/wake, jump/landing, shark chase/escape/dodge, beer, uncluttered HUD, 32 rear animation frames, comic timing, finish/restart, portrait and square.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
test().catch(error=>{console.error(error);process.exitCode=1;});
