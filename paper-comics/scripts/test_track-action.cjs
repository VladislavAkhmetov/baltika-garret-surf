const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const review=path.resolve(__dirname,'../review/comics/track-action');fs.mkdirSync(review,{recursive:true});
  let browser;
  const errors=[],report={};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';});
    report.mechanics=await page.evaluate(()=>{
      const g=game,dt=1/120;
      const prepare=(high=true,face=.02,speed=27)=>{
        g.reset();g.wave.resetWaves(42);g.state='playing';g.assist=true;
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
        g.comics.trigger=()=>false;g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);
        const w=high?g.wave.waves.filter(w=>w.encounterTime<38).reduce((a,b)=>a.height>b.height?a:b):g.wave.waves[0];
        g.time=w.encounterTime;g.wave.time=g.time;g.p.z=(w.from+w.to)/2;g.p.x=g.wave.crestX(w,g.p.z)+w.width*face;
        g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=speed;g.balance.immunity=5;g.impactCooldown=8;
        g.jump.press();g.step(dt);for(let i=0;i<9;i++)g.step(dt);
        return {offer:g.jump.canSpecial,launch:g.jump.specialLaunch};
      };
      const low=prepare(false);g.jump.press();const lowKind=g.jump.trickKind;
      const shoulder=prepare(true,.5),slow=prepare(true,.02,20),high=prepare();
      g.jump.updateButton();const glyph=document.getElementById('jump-glyph').textContent;
      const inAir={tricks:g.jump.tricks,special:g.jump.specialTricks,boost:g.jump.landingBoost};
      g.jump.press();const kind=g.jump.trickKind;
      while(g.p.airborne)g.step(dt);
      const landed={special:g.jump.specialTricks,tricks:g.jump.tricks,boost:g.jump.landingBoost,beer:g.mug.level};
      g.jump.press();g.step(dt);const noGroundFlip=g.jump.trickKind;
      // Taking the same peak twice cannot mint a second special-trick reward.
      const rewards=[...g.jump.rewardedWaves.entries()];
      const none=prepare();while(g.p.airborne)g.step(dt);const noAutomatic=g.jump.specialTricks;
      g.reset();g.world.hazards.forEach(h=>h.done=true);g.state='playing';g.p.x=8;g.p.z=8;
      g.jump.press();g.jump.step(dt,g.wave.sample(8,8));const flatVelocity=g.p.jumpVelocity;
      g.reset();g.state='playing';g.p.x=0;g.p.z=13.8;g.p.speed=24;
      const jet=g.world.hazards.find(h=>h.type==='jetski');jet.activeAt=0;jet.x=5;jet.z=12;jet.direction=1;jet.mode='cross';
      const wake=g.world.wakeSourceAt(g.p.x,g.p.z);g.jump.press();g.jump.step(dt,g.wave.sample(g.p.x,g.p.z));
      const wakeJump={quality:wake.quality,source:g.jump.takeoffSource,velocity:g.p.jumpVelocity,special:g.jump.specialLaunch};
      // Transfer reward is committed at touchdown, using the actual landing surface.
      g.reset();g.wave.resetWaves(42);g.state='playing';g.jump.takeoffWave=0;g.jump.takeoffSource=0;
      const target=g.wave.waves[1];g.time=target.encounterTime;g.wave.time=g.time;
      g.p.z=(target.from+target.to)/2;g.p.x=g.wave.crestX(target,g.p.z)+target.width*.3;
      g.p.y=g.wave.height(g.p.x,g.p.z)+.001;g.p.airborne=true;g.p.jumpVelocity=-1;
      const before=g.chain.points;g.jump.step(dt,g.wave.sample(g.p.x,g.p.z));
      const transfer={count:g.jump.airTransfers,points:g.chain.points-before,airborne:g.p.airborne};
      // A fast second tap after takeoff is retained until the board clears the water.
      g.reset();g.state='playing';g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
      g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);g.p.x=8;g.p.z=8;g.p.y=g.wave.height(8,8);
      g.jump.press();g.step(dt);const earlyOffer=g.jump.canSpin;g.jump.press();const buffered=g.jump.spinRequest>0;
      for(let i=0;i<20;i++)g.step(dt);const quickSecondTap={earlyOffer,buffered,started:g.jump.spinStarted,kind:g.jump.trickKind};
      g.reset();g.state='paused';const reset={special:g.jump.specialTricks,transfers:g.jump.airTransfers,kind:g.jump.trickKind,spin:g.p.spin};
      return {low,lowKind,shoulder,slow,high,glyph,inAir,kind,landed,noGroundFlip,rewards,noAutomatic,flatVelocity,wakeJump,transfer,quickSecondTap,reset};
    });
    const m=report.mechanics;
    assert.equal(m.low.offer,false);assert.equal(m.lowKind,'spin');assert.equal(m.shoulder.offer,false);assert.equal(m.slow.offer,false);
    assert.equal(m.high.offer,true);assert.equal(m.glyph,'✦');assert.equal(m.kind,'flip');assert.deepEqual(m.inAir,{tricks:0,special:0,boost:0});
    assert.equal(m.landed.special,1);assert.equal(m.landed.tricks,1);assert.ok(m.landed.boost>4);assert.ok(m.landed.beer>.9);
    assert.equal(m.noGroundFlip,null);assert.equal(m.noAutomatic,0);assert.ok(m.rewards.some(([,points])=>points>=1000));
    assert.ok(m.wakeJump.quality>.7);assert.match(m.wakeJump.source,/^wake:/);assert.ok(m.wakeJump.velocity>m.flatVelocity+1.5);assert.equal(m.wakeJump.special,false);
    assert.equal(m.transfer.count,1);assert.ok(m.transfer.points>140);assert.equal(m.transfer.airborne,false);
    assert.deepEqual(m.quickSecondTap,{earlyOffer:false,buffered:true,started:true,kind:'spin'},'a fast second tap launches a real 360°');
    assert.deepEqual(m.reset,{special:0,transfers:0,kind:null,spin:0});

    report.shark=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.comics.trigger=()=>false;
      g.world.hazards.filter(h=>h.type!=='shark').forEach(h=>h.done=true);
      const h=g.world.hazards.find(h=>h.type==='shark');h.activeAt=.6;h.chasing=true;
      g.time=2;g.p.z=430;g.p.x=0;h.z=420;h.x=h.targetX=0;g.impactCooldown=0;
      g.world.step(.01);g.updateVisuals(0);g.updateHUD();
      const windup={phase:h.attackPhase,line:h.lungeX,cue:h.attackCue.visible,hud:document.getElementById('shark-threat').dataset.phase};
      g.p.x=6;g.time+=.8;g.world.step(.01);
      const lunge={phase:h.attackPhase,line:h.lungeX,target:h.targetX};
      g.p.x=h.x;g.p.airY=3;h.z=g.p.z-.1;g.world.step(.01);const airborne=h.airDodge;
      h.z=g.p.z+7;g.world.step(.01);const escape={escaped:h.escaped,beer:g.mug.level,award:g.tricksSeen.has('НАД АКУЛОЙ!'),cue:h.attackCue.visible};
      g.reset();g.state='paused';return {windup,lunge,airborne,escape,reset:h.attackAt===null&&h.attackPhase==='chase'&&!h.airDodge&&!h.attackCue.visible};
    });
    assert.deepEqual(report.shark.windup,{phase:'windup',line:0,cue:true,hud:'windup'});
    assert.deepEqual(report.shark.lunge,{phase:'lunge',line:0,target:0});assert.equal(report.shark.airborne,true);
    assert.deepEqual(report.shark.escape,{escaped:true,beer:1,award:true,cue:false});assert.equal(report.shark.reset,true);

    report.frames=[];
    for(const [name,width,height,mobile] of [['mobile',393,852,true],['small',360,640,true],['landscape',844,390,true],['desktop',1240,900,false]]){
      await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile});
      await page.evaluate(async()=>{await game.start(false);game.state='paused';});
      await page.evaluate(()=>{
        const g=game,dt=1/120;g.reset();g.wave.resetWaves(42);g.state='playing';g.assist=true;g.comics.trigger=()=>false;
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);
        const w=g.wave.waves.filter(w=>w.encounterTime<38).reduce((a,b)=>a.height>b.height?a:b);
        g.time=w.encounterTime;g.wave.time=g.time;g.p.z=(w.from+w.to)/2;g.p.x=g.wave.crestX(w,g.p.z)+.15;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=27;g.balance.immunity=5;g.impactCooldown=8;
        g.updateCamera(1,true);const camera=g.camera.quaternion.clone();g.jump.press();g.step(dt);for(let i=0;i<9;i++){g.step(dt);g.updateCamera(dt);}g.jump.press();
        const samples=[];
        window.advanceTrackFlip=half=>{
          g.state='playing';
          while(g.p.airborne){
          g.step(dt);g.updateCamera(dt);
          if(g.jump.spinStarted&&!g.jump.spinCompleted&&Math.round(g.jump.spinProgress*100)%8===0){
            g.updateVisuals(0);g.player.group.updateWorldMatrix(true,true);
            const corners=[];
            for(const mesh of [g.player.card,g.player.board]){
              const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++)corners.push(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld).project(g.camera));
            }
            samples.push({top:Math.min(...corners.map(v=>(1-v.y)/2)),bottom:Math.max(...corners.map(v=>(1-v.y)/2)),side:Math.max(...corners.map(v=>Math.abs(v.x))),angle:camera.angleTo(g.camera.quaternion)});
          }
            if(half&&g.jump.spinProgress>=.45)break;
          }
          g.updateVisuals(0);g.wave.update(g.p.z,g.time,true);g.updateHUD();g.renderer.render(g.scene,g.camera);g.state='paused';
          return {samples,special:g.jump.specialTricks};
        };
        window.advanceTrackFlip(true);
      });
      await page.screenshot({path:path.join(review,name+'-flip.png')});
      const frame=await page.evaluate(()=>window.advanceTrackFlip(false));
      assert.equal(frame.special,1);assert.ok(frame.samples.length>5);
      assert.ok(frame.samples.every(f=>f.top>=-.02&&f.bottom<1.06&&f.side<1.06),name+': full flip stays inside the viewport '+JSON.stringify(frame.samples.filter(f=>f.top<-.02||f.bottom>=1.06||f.side>=1.06)));
      assert.ok(frame.samples.every(f=>f.angle<1e-6),name+': flip does not rotate the horizon');
      report.frames.push({name,...frame});
    }

    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';});
    report.controls=await page.evaluate(()=>{
      const g=game;g.reset();g.state='paused';
      const cancelled=selector=>!document.querySelector(selector).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
      const glyph=cancelled('#jump-glyph'),left=cancelled('#steer-left'),canvas=cancelled('#surf-canvas');
      const outside=!document.body.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
      const button=document.getElementById('jump-button'),style=getComputedStyle(button);
      g.state='playing';button.dispatchEvent(new PointerEvent('pointerdown',{pointerId:10,bubbles:true,cancelable:true}));
      button.dispatchEvent(new PointerEvent('pointerup',{pointerId:10,bubbles:true,cancelable:true}));
      button.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:10,bubbles:true}));
      g.step(1/120);const quickTap=g.jump.jumps;
      g.reset();g.state='playing';button.dispatchEvent(new PointerEvent('pointerdown',{pointerId:11,bubbles:true,cancelable:true}));button.dispatchEvent(new PointerEvent('pointercancel',{pointerId:11,bubbles:true}));g.step(1/120);
      const cancel={jumps:g.jump.jumps,requested:g.jump.requested,pointer:g.jump.pointerId};
      g.reset();g.state='paused';window.unhandledMenus=0;document.getElementById('app-container').addEventListener('contextmenu',e=>{if(!e.defaultPrevented)window.unhandledMenus++;});
      return {glyph,left,canvas,outside,touchAction:style.touchAction,userSelect:style.userSelect,quickTap,cancel};
    });
    assert.deepEqual(report.controls,{glyph:true,left:true,canvas:true,outside:false,touchAction:'none',userSelect:'none',quickTap:1,cancel:{jumps:0,requested:false,pointer:null}});
    await page.evaluate(()=>{game.input.mode='keys';game.input.render();});
    const left=await page.$('#steer-left'),box=await left.boundingBox();
    await page.touchscreen.touchStart(box.x+box.width/2,box.y+box.height/2);await new Promise(resolve=>setTimeout(resolve,850));
    assert.equal(await page.evaluate(()=>[...game.input.buttonPointers.values()].includes('ArrowLeft')),true,'native touch keeps steering pressed');
    await page.touchscreen.touchEnd();
    assert.equal(await page.evaluate(()=>game.input.buttonPointers.size),0,'native touch release clears steering');
    await page.evaluate(()=>{game.reset();game.state='playing';game.world.hazards.forEach(h=>h.done=true);game.rivals.forEach(r=>r.collided=true);});
    const jump=await page.$('#jump-button'),jumpBox=await jump.boundingBox();
    await page.touchscreen.touchStart(jumpBox.x+jumpBox.width/2,jumpBox.y+jumpBox.height/2);await new Promise(resolve=>setTimeout(resolve,850));await page.touchscreen.touchEnd();
    report.longPress=await page.evaluate(()=>{game.state='paused';return {jumps:game.jump.jumps,tricks:game.jump.tricks,pointer:game.jump.pointerId,unhandled:window.unhandledMenus};});
    assert.deepEqual(report.longPress,{jumps:1,tricks:0,pointer:null,unhandled:0});
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({report,errors},null,2));
    console.log('PASS: earned flips, clean landing rewards, air transfers, jetski launches, committed shark lunges and Chrome touch holds.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
