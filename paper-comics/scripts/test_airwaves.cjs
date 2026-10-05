const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,review=path.resolve(__dirname,'../review/comics/airwaves');
 fs.mkdirSync(review,{recursive:true});let browser;const errors=[],poses=[],layouts=[];
 try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.goto(base,{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.game);
  await page.evaluate(async()=>{await game.start(false);game.state='paused';game.animationReview=true;game.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);});
  const shot=async name=>{await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:path.join(review,name+'.png')});};
  // The photographed sole midpoint must stay on the deck in all 32 poses.
  const style=await page.addStyleTag({content:'.hud,.screen,.bottom-hud,.ride-coach,.balance-cue,.moment,.crab-callout,.steer-controls,#jump-button{display:none!important}'});
  const frames=[];
  for(const state of ['trim','left','right','recovery'])for(let frame=0;frame<8;frame++){
   const result=await page.evaluate((state,frame)=>{
    const g=game,p=g.p,h=g.heroAnimator;g.time=g.wave.waves[0].encounterTime;g.wave.time=g.time;p.z=100;p.x=g.wave.crestX(g.wave.waves[0],100)+3;p.y=g.wave.height(p.x,p.z);p.lean=state==='left'?-.65:state==='right'?.65:0;g.balance.roll=state==='recovery'?.35:0;
    h.apply(state,frame);g.updateCamera(1,true);g.wave.update(p.z,g.time,true);g.updateVisuals(0);g.renderer.render(g.scene,g.camera);g.scene.updateMatrixWorld(true);
    const board=g.player.board,card=g.player.card,mean=h.footAnchor.clone();card.localToWorld(mean);
    const deck=new THREE.Vector3(0,0,.018);board.localToWorld(deck);
    const normal=new THREE.Vector3(0,0,1).applyQuaternion(board.getWorldQuaternion(new THREE.Quaternion()));
    const feet=h.soles[state][frame].map(([x,y])=>{
     const v=new THREE.Vector3((x/384-.5)*h.width,(.5-y/512)*h.height,0);card.localToWorld(v);
     const ray=v.clone().sub(g.camera.position).normalize();const t=deck.clone().sub(v).dot(normal)/ray.dot(normal);v.addScaledVector(ray,t);board.worldToLocal(v);return [v.x,v.y];
    });return {state,frame,anchorError:mean.distanceTo(deck),feet,boardWidth:board.geometry.parameters.width,boardLength:board.geometry.parameters.height};
   },state,frame);poses.push(result);assert.ok(result.anchorError<1e-6,state+' '+frame+' sole pivot drift');
   assert.ok(result.feet.every(([x,y])=>Math.abs(x)<result.boardWidth*.47&&Math.abs(y)<result.boardLength*.4),state+' '+frame+' sole outside deck');
   const data=await page.screenshot({encoding:'base64',clip:{x:60,y:400,width:310,height:420}});frames.push({state,frame,data});
  }
  const sheet=await browser.newPage();await sheet.setViewport({width:1600,height:1150});
  await sheet.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:8px;background:#f2e7cd;font:16px Arial}h3{margin:8px 0}section{display:grid;grid-template-columns:repeat(8,1fr);gap:4px}img{width:100%;display:block}</style>'+['trim','left','right','recovery'].map(state=>'<h3>'+state+'</h3><section>'+frames.filter(f=>f.state===state).map(f=>'<div><img src="data:image/png;base64,'+f.data+'">'+f.frame+'</div>').join('')+'</section>').join(''));
  await sheet.screenshot({path:path.join(review,'poses-32.png'),fullPage:true});await sheet.close();await style.evaluate(e=>e.remove());
  const mechanics=await page.evaluate(()=>{
   const g=game,j=g.jump,dt=1/120,results={};g.animationReview=false;
   const prepare=()=>{g.reset();g.wave.resetWaves(42);g.state='playing';g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);g.comics.trigger=()=>false;};
   const key=(type,code)=>dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
   const ride=(waveIndex,spin,late=false,assisted=true)=>{
    g.assist=assisted;prepare();const w=waveIndex==='high'?g.wave.waves.filter(w=>w.encounterTime<38).reduce((best,w)=>w.height>best.height?w:best):g.wave.waves[waveIndex??0],p=g.p;
    g.time=waveIndex===null?0:w.encounterTime;g.wave.time=g.time;
    p.z=waveIndex===null?8:(w.from+w.to)/2;p.x=waveIndex===null?8:g.wave.crestX(w,p.z)+.15;
    p.y=g.wave.height(p.x,p.z);p.speed=27;g.balance.immunity=5;g.impactCooldown=8;
    key('keydown','Space');g.step(dt);key('keyup','Space');
    const launched={wave:j.takeoffWave,velocity:p.jumpVelocity,z:p.z};for(let i=0;i<9;i++)g.step(dt);g.balance.immunity=0;
    if(late)while(p.airborne&&p.jumpVelocity>-5)g.step(dt);
    if(spin){key('keydown','Space');key('keyup','Space');}
    let spun=false,awardInAir=0,boostInAir=0;
    for(let i=0;i<400&&p.airborne;i++){
     g.step(dt);if(Math.abs(p.spin)>.1)spun=true;if(p.airborne){awardInAir=j.tricks;boostInAir=j.landingBoost;}
    }
    const score=g.score,landingBoost=j.landingBoost;for(let i=0;i<12;i++)g.step(dt);
    return {...launched,height:j.lastHeight,airTime:j.airTime,spun,awardInAir,boostInAir,landingBoost,tricks:j.tricks,clean:j.cleanLandings,balance:g.balance.mode,duplicate:g.score-score,resetSpin:p.spin,airborne:p.airborne};
   };
   results.flat=ride(null,false);results.low=ride(0,false);results.high=ride('high',false);results.spin=ride('high',true);results.assistedLate=ride(null,true,true);results.bad=ride(null,true,true,false);g.assist=true;
   prepare();const a=JSON.stringify(g.wave.waves);g.wave.resetWaves(43);results.randomised=a!==JSON.stringify(g.wave.waves);
   g.reset();results.reset={spin:g.p.spin,tricks:j.tricks,started:j.spinStarted,boost:j.landingBoost};g.state='paused';return results;
  });console.log(JSON.stringify({mechanics},null,2));
  fs.writeFileSync(path.join(review,'mechanics.json'),JSON.stringify({mechanics,poses},null,2));
  assert.equal(mechanics.flat.wave,null);assert.equal(mechanics.low.wave,0);assert.ok(mechanics.high.wave>0);assert.equal(mechanics.spin.wave,mechanics.high.wave);
  assert.ok(mechanics.high.height>mechanics.flat.height+1.4,'a crest gives more lift than calm water');assert.ok(mechanics.high.velocity>mechanics.low.velocity,'taller waves give stronger takeoff');assert.ok(mechanics.high.airTime>mechanics.flat.airTime+.4);
  assert.equal(mechanics.spin.spun,true);assert.equal(mechanics.spin.tricks,1);assert.equal(mechanics.spin.awardInAir,0);assert.equal(mechanics.spin.duplicate,0);assert.equal(mechanics.spin.airborne,false);assert.equal(mechanics.spin.resetSpin,0);
  assert.equal(mechanics.spin.boostInAir,0);assert.ok(mechanics.spin.landingBoost>0);
  assert.equal(mechanics.assistedLate.spun,false,'ordinary mode rejects a rotation too late to finish');assert.equal(mechanics.assistedLate.clean,1);assert.equal(mechanics.assistedLate.balance,'stable');
  assert.equal(mechanics.bad.spun,true,'hard mode allows a risky late rotation');assert.equal(mechanics.bad.tricks,0);assert.equal(mechanics.bad.clean,0);assert.equal(mechanics.bad.balance,'recovery');assert.equal(mechanics.randomised,true);assert.deepEqual(mechanics.reset,{spin:0,tricks:0,started:false,boost:0});
  for(const [name,width,height,mobile] of [['mobile',393,852,true],['small',360,640,true],['desktop',1240,900,false],['landscape',844,390,true]]){
   await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   await page.evaluate(()=>{
    const g=game;g.reset();g.journey.hideAll();g.container.classList.add('playing');document.getElementById('result-screen').classList.add('hidden');g.wave.resetWaves(42);g.state='paused';g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.p.z=55;g.p.x=0;g.time=2.2;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,g.p.z);g.heroAnimator.apply('trim',0);g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
   });await shot(name+'-wave-ahead');
   for(const [outcome,level] of [['win',.76],['lose',.20]]){
    const layout=await page.evaluate(level=>{const g=game;g.state='paused';g.mug.level=level;g.score=4200;g.finish();const card=document.querySelector('.result-card').getBoundingClientRect(),b=document.getElementById('replay-button').getBoundingClientRect();return {buttonFits:b.bottom<=card.bottom&&b.right<=card.right,scroll:document.querySelector('.result-card').scrollHeight>document.querySelector('.result-card').clientHeight+1,text:document.querySelector('.result-card').innerText};},level);
    layouts.push({name,outcome,...layout});assert.ok(layout.buttonFits,name+' '+outcome+' result action');assert.equal(layout.scroll,false,name+' result scroll');assert.ok(!/Волн:|Спасений:|Твои манёвры:|БОНУСНЫЕ КРЫШКИ/.test(layout.text));await shot(name+'-result-'+outcome);
   }
  }
  // Capture actual pointer-driven takeoff and rotation, rather than a fabricated pose.
  await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.evaluate(()=>{
   const g=game;g.reset();g.journey.hideAll();g.container.classList.add('playing');document.getElementById('result-screen').classList.add('hidden');g.wave.resetWaves(42);g.state='playing';g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);const w=g.wave.waves.filter(w=>w.encounterTime<38).reduce((best,w)=>w.height>best.height?w:best);g.time=w.encounterTime;g.wave.time=g.time;g.p.z=(w.from+w.to)/2;g.p.x=g.wave.crestX(w,g.p.z)+.15;g.p.y=g.wave.height(g.p.x,g.p.z);g.balance.immunity=5;g.impactCooldown=8;
   const b=document.getElementById('jump-button');b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));g.step(1/120);b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));for(let i=0;i<9;i++)g.step(1/120);g.state='paused';g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
  });await shot('mobile-takeoff');
  await page.evaluate(()=>{const g=game;g.state='playing';const b=document.getElementById('jump-button');b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));for(let i=0;i<30;i++)g.step(1/120);g.state='paused';g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);});await shot('mobile-spin');
  fs.writeFileSync(path.join(review,'verification.json'),JSON.stringify({poses,mechanics,layouts,errors},null,2));assert.deepEqual(errors,[]);console.log('Airwaves passed: 32 poses, keyboard/pointer jumps, 360 landings and 4 viewport layouts.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
