const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const {createServer} = require('./serve');

async function test(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
    page.on('console',message=>{if(message.type()==='error'&&/WebGL|Shader|THREE/.test(message.text()))errors.push(message.text());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await page.evaluateOnNewDocument(()=>{
      window.permissionCalls=0;
      Object.defineProperty(DeviceOrientationEvent,'requestPermission',{configurable:true,value:async()=>{window.permissionCalls++;return 'granted';}});
      window.sensorTimer=setInterval(()=>{const event=new Event('deviceorientation');Object.defineProperties(event,{gamma:{value:8},beta:{value:35}});window.dispatchEvent(event);},30);
    });
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.game&&window.game.textures.surfer_norma.image?.complete);
    await page.waitForFunction(()=>window.game.handBeer.frame.complete&&window.game.handBeer.frame.naturalWidth>0);
    const review=path.resolve(__dirname,'../review/comics');fs.mkdirSync(review,{recursive:true});
    await page.screenshot({path:path.join(review,'01-mobile-start.png')});
    await page.click('#start-button');await page.waitForFunction(()=>window.game.state==='playing');
    const gyro=await page.evaluate(()=>{clearInterval(window.sensorTimer);const g=window.game;g.state='paused';g.reset();g.state='playing';const before=g.p.x;g.input.gamma=g.input.neutral+18;for(let i=0;i<60;i++)g.step(1/120);g.state='paused';return{mode:g.input.mode,before,after:g.p.x,neutral:g.input.neutral,calls:window.permissionCalls};});
    assert.equal(gyro.mode,'gyro');assert.equal(gyro.calls,1);assert.ok(gyro.after>gyro.before+.3,'gyro should move the surfer right');
    await page.click('#center-button');assert.ok(Math.abs(await page.evaluate(()=>window.game.input.gamma-window.game.input.neutral))<.01);
    const mechanics=await page.evaluate(()=>{
      const g=window.game;
      function setup(){g.reset();g.state='playing';g.input.mode='gyro';g.input.gamma=g.input.neutral;g.rivals.forEach(r=>{r.z=900;r.x=7;});}
      setup();
      const slopes=[];for(let z=0;z<58;z++)slopes.push({z,s:g.wave.sample(0,z)});
      const up=slopes.find(t=>t.s.dz>.15),down=slopes.find(t=>t.s.dz<-.15);
      g.p.z=up.z;g.p.y=up.s.height;g.step(1/120);const uphill=g.p.speed;
      setup();g.p.z=down.z;g.p.y=down.s.height;g.step(1/120);const downhill=g.p.speed;
      setup();g.input.startHold();for(let i=0;i<55;i++)g.step(1/120);g.input.endHold();g.step(1/120);
      const takeoff=g.p.airborne;g.input.startHold();let rotationApplied=0;
      for(let i=0;i<350&&g.p.airborne;i++){
        g.input.gamma=g.input.neutral+(i<75?18:0);g.step(1/120);rotationApplied=Math.max(rotationApplied,Math.abs(g.p.spin));
      }
      const landing={clean:g.cleanLandings,beer:g.mug.level,tricks:[...g.tricksSeen],rotationApplied,contact:g.lastLanding};
      setup();g.p.z=34;g.p.y=g.wave.height(0,34);g.input.startHold();g.input.gamma=g.input.neutral-18;
      for(let i=0;i<75;i++)g.step(1/120);
      for(let i=0;i<380&&g.wave.sample(g.p.x,g.p.z).crest<.6;i++)g.step(1/120);
      g.input.gamma=g.input.neutral+18;for(let i=0;i<65;i++)g.step(1/120);
      const groundTricks=[...g.tricksSeen];
      setup();g.input.startHold();for(let i=0;i<55;i++)g.step(1/120);g.input.endHold();g.step(1/120);g.input.startHold();
      for(let i=0;i<350&&g.p.airborne;i++){g.input.gamma=g.input.neutral+(i<130?20:0);g.step(1/120);}
      const fullTurn={tricks:[...g.tricksSeen],contact:g.lastLanding};
      setup();g.input.startHold();for(let i=0;i<55;i++)g.step(1/120);g.input.endHold();g.step(1/120);
      for(let i=0;i<350&&g.p.airborne;i++)g.step(1/120);
      const hardLanding={beer:g.mug.level,clean:g.cleanLandings};
      setup();const shark=g.world.hazards.find(h=>h.type==='shark');g.p.x=shark.initialX;g.p.z=shark.z;g.p.y=g.wave.height(g.p.x,g.p.z);g.step(1/120);
      const hit={beer:g.mug.level,protected:g.impactCooldown>0,sharkHit:shark.hit};
      setup();for(let i=0;i<10000&&g.state==='playing';i++)g.step(1/120);
      const finish={state:g.state,z:g.p.z,visible:!document.getElementById('result-screen').classList.contains('hidden'),seconds:g.elapsed};
      return{uphill,downhill,takeoff,landing,groundTricks,fullTurn,hardLanding,hit,finish};
    });
    assert.ok(mechanics.downhill>mechanics.uphill,'descending the face should accelerate');
    console.log(JSON.stringify({mechanics}));
    assert.equal(mechanics.takeoff,true,'release after compression should launch');
    assert.ok(mechanics.landing.clean>=1,'holding on descent and aligning the board should soften landing');
    assert.ok(mechanics.landing.tricks.includes('ЗАХВАТ'),'holding on ascent should earn a grab');
    assert.ok(mechanics.landing.rotationApplied>100,'gyro should rotate the board in flight');
    assert.ok(mechanics.landing.tricks.some(t=>t.includes('180')||t.includes('360')),'a completed rotation should earn its own trick');
    assert.ok(mechanics.groundTricks.includes('КАРВИНГ')&&mechanics.groundTricks.includes('КАТБЭК'),'compression and a directional reversal should produce distinct ground tricks');
    assert.ok(mechanics.fullTurn.tricks.includes('РАЗВОРОТ 360°'),'a longer aerial rotation should earn a 360');
    assert.ok(mechanics.hardLanding.beer<mechanics.landing.beer&&mechanics.hardLanding.clean===0,'landing without compression should spill more beer');
    assert.ok(mechanics.hit.beer<.95&&mechanics.hit.protected&&mechanics.hit.sharkHit,'shark collision should cost beer and grant recovery time');
    assert.equal(mechanics.finish.state,'finished');assert.equal(mechanics.finish.visible,true);
    const surf=await page.evaluate(()=>{
      const g=window.game;
      function setup(){g.reset();g.state='playing';g.input.mode='gyro';g.input.gamma=g.input.neutral;g.rivals.forEach(r=>{r.z=900;r.x=7;});}
      function ride(track){
        setup();g.p.z=60;g.p.x=track?g.waveRide.line(60):-6;g.p.y=g.wave.height(g.p.x,60);let peak=0,speed=0,maxError=0;
        for(let i=0;i<300;i++){
          let lean=0;
          if(track){const ahead=g.waveRide.line(g.p.z+6),desired=Math.atan((ahead-g.p.x)/6/.52);lean=THREE.MathUtils.clamp(desired/.62,-1,1);}
          g.input.gamma=g.input.neutral+(Math.abs(lean)>.001?Math.sign(lean)*1.5+lean*23:0);g.step(1/120);peak=Math.max(peak,g.waveRide.boost);speed+=g.p.speed;maxError=Math.max(maxError,Math.abs(g.p.x-g.waveRide.line(g.p.z)));
        }
        return{boost:peak,speed:speed/300,charge:g.waveRide.charge,caught:g.waveRide.totalCaught,maxError};
      }
      const onLine=ride(true),offLine=ride(false);
      setup();g.p.z=37;g.p.y=g.wave.height(0,37);g.input.gamma=g.input.neutral+14;g.input.startHold();for(let i=0;i<45;i++)g.step(1/120);g.input.endHold();g.step(1/120);const pump={airborne:g.p.airborne,cycles:g.p.pumpCycles,energy:g.p.pump};
      function beer(crouch){setup();g.mug.foam=0;g.p.lean=.65;g.p.smoothLean=.43;g.p.crouch=crouch;for(let i=0;i<720;i++)g.handBeer.step(1/120,1,0,.22);return{level:g.mug.level,spill:g.mug.totalSpilled,peak:g.handBeer.peakSlosh};}
      const upright=beer(0),compressed=beer(1);
      const liquid=new ComicBeerLiquid();liquid.foam=0;for(let i=0;i<120;i++)liquid.update(1/120,.1,0,.08);const initial=Math.max(...liquid.h.map(Math.abs));for(let i=0;i<1000;i++)liquid.update(1/120,0,0,0);const settled=Math.max(...liquid.h.map(Math.abs));
      setup();g.state='paused';g.wave.update(0,0,true);g.updateVisuals(1/60);g.updateHUD();g.renderer.render(g.scene,g.camera);
      const cup=g.handBeer.mesh,hand=g.handBeer.pivot;
      return{onLine,offLine,pump,upright,compressed,initial,settled,handProp:cup.parent===hand&&hand.parent===g.player.card,cupHeight:cup.geometry.parameters.height,labels:g.rivals.some(r=>r.label!==undefined),beerButton:!!document.getElementById('steady-button')};
    });
    assert.ok(surf.onLine.boost>5&&surf.onLine.caught>0,'holding the foam line should catch a wave');
    assert.ok(surf.onLine.speed>surf.offLine.speed+2,'caught wave should accelerate more than riding away from the pocket');
    assert.ok(!surf.pump.airborne&&surf.pump.cycles>0&&surf.pump.energy>2,'releasing compression below the lip should pump rather than jump');
    assert.ok(surf.upright.spill>0&&surf.upright.level<1,'sustained strong turning should spill liquid over the rim');
    assert.ok(surf.compressed.level>surf.upright.level&&surf.compressed.peak<surf.upright.peak,'bent knees should damp the same turning forces');
    assert.ok(surf.initial>.01&&surf.settled<.005,'liquid should react and then settle');
    assert.ok(surf.handProp&&surf.cupHeight>1.5&&!surf.labels&&!surf.beerButton,'oversized mug should follow the hand without names or a beer button');
    console.log(JSON.stringify({surf}));
    await page.screenshot({path:path.join(review,'02-mobile-finish.png')});
    await page.click('#replay-button');await page.waitForFunction(()=>window.game.state==='playing');
    const restart=await page.evaluate(()=>{const g=window.game;g.state='paused';return{z:g.p.z,beer:g.mug.level,hazards:g.world.hazards.every(h=>!h.hit&&!h.warned),tricks:g.tricksSeen.size,fx:g.comics.active};});
    assert.ok(restart.z<3&&restart.beer>.99&&restart.hazards&&restart.tricks===0&&!restart.fx,'replay should reset the whole run');
    await page.evaluate(()=>{const g=window.game;g.reset();g.state='playing';g.input.mode='gyro';g.input.gamma=g.input.neutral;for(let i=0;i<1900;i++){g.step(1/120);g.comics.update(1/120);}g.state='paused';g.wave.update(g.p.z,g.time,true);g.updateVisuals(1/60);g.updateHUD();g.renderer.render(g.scene,g.camera);});
    await page.screenshot({path:path.join(review,'03-mobile-coast.png')});
    await page.evaluate(()=>{const g=window.game;g.state='playing';g.comics.trigger('УАУ!','ВЫШЕ ВОЛНЫ!','air',3);});
    await page.waitForFunction(()=>document.getElementById('comic-cutout').complete&&document.getElementById('comic-cutout').naturalWidth>0);
    await page.click('#pause-button');const elapsed=await page.evaluate(()=>window.game.comics.elapsed);await new Promise(r=>setTimeout(r,200));
    assert.equal(await page.evaluate(()=>window.game.comics.elapsed),elapsed,'pause should also pause the comic director');
    await page.click('#resume-button');await page.evaluate(()=>{window.game.state='paused';document.getElementById('pause-screen').classList.add('hidden');});
    await page.screenshot({path:path.join(review,'04-mobile-comic.png')});
    const alpha=await page.evaluate(async()=>{
      const result={};for(const name of ['hero-air-low','hero-grab','shark-fin','mug-paper-frame']){const im=new Image();im.src='assets/comics/'+name+'.png';await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const data=ctx.getImageData(0,0,im.width,im.height).data;let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;result[name]={width:im.width,height:im.height,transparent:transparent/(im.width*im.height),centreAlpha:ctx.getImageData(Math.floor(im.width*.62),Math.floor(im.height*.5),1,1).data[3]};}return result;
    });
    assert.ok(alpha['shark-fin'].transparent>.2&&alpha['mug-paper-frame'].transparent>.2&&alpha['mug-paper-frame'].centreAlpha<20,'paper assets need transparent silhouettes and an open glass interior');
    await page.setViewport({width:1250,height:900,isMobile:false,hasTouch:false,deviceScaleFactor:1});
    await page.waitForFunction(()=>window.game);
    if(await page.evaluate(()=>window.game.state==='start')){await page.click('#start-button');await page.waitForFunction(()=>window.game.state==='playing');}
    await page.evaluate(()=>{const g=window.game;g.reset();g.state='playing';g.input.mode='keys';for(let i=0;i<1900;i++){g.step(1/120);g.comics.update(1/120);}g.state='paused';g.wave.update(g.p.z,g.time,true);g.comics.reset();g.resize();g.updateVisuals(1/60);g.renderer.render(g.scene,g.camera);});
    const square=await page.evaluate(()=>{const r=document.getElementById('app-container').getBoundingClientRect();return{width:r.width,height:r.height};});
    assert.ok(Math.abs(square.width-square.height)<2,'desktop field should be square');
    await page.screenshot({path:path.join(review,'05-desktop-square.png')});
    const fallback=await browser.newPage();fallback.on('pageerror',error=>errors.push(error.message));
    await fallback.setViewport({width:393,height:852,isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await fallback.evaluateOnNewDocument(()=>Object.defineProperty(DeviceOrientationEvent,'requestPermission',{configurable:true,value:async()=> 'denied'}));
    await fallback.goto(base,{waitUntil:'domcontentloaded'});await fallback.waitForFunction(()=>window.game);await fallback.click('#start-button');await fallback.waitForFunction(()=>window.game.state==='playing');
    assert.equal(await fallback.evaluate(()=>window.game.input.mode),'touch','denied sensors should enable touch');
    await fallback.evaluate(()=>{window.game.state='paused';});
    const finger=await fallback.touchscreen.touchStart(70,450);await finger.move(140,450);
    assert.ok(await fallback.evaluate(()=>window.game.input.target>.5),'touch drag should steer right');await finger.end();
    await fallback.evaluate(()=>{window.game.reset();window.game.state='paused';});
    const crouch=await fallback.$('#crouch-button'),buttonRect=await crouch.boundingBox();
    const thumb=await fallback.touchscreen.touchStart(buttonRect.x+buttonRect.width/2,buttonRect.y+buttonRect.height/2);
    const held=await fallback.evaluate(()=>{const g=window.game;for(let i=0;i<55;i++)g.step(1/120);return{hold:g.input.hold,crouch:g.p.crouch};});assert.ok(held.hold&&held.crouch>.8,'thumb button should physically compress the rider');
    await thumb.end();const released=await fallback.evaluate(()=>{const g=window.game;g.step(1/120);return{hold:g.input.hold,jump:g.p.airborne};});assert.ok(!released.hold&&released.jump,'releasing the thumb button at a crest should launch');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({gyro,mechanics,surf,restart,square,alpha,pageErrors:errors,screenshots:review},null,2));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
test().catch(error=>{console.error(error);process.exitCode=1;});
