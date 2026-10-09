const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const review=path.resolve(__dirname,'../review/comics/controls');fs.mkdirSync(review,{recursive:true});
  let browser;const errors=[],report={};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.evaluateOnNewDocument(()=>{
      window.sensorGamma=7;window.sensorBeta=35;window.permissionCalls=0;
      Object.defineProperty(DeviceOrientationEvent,'requestPermission',{configurable:true,value:async()=>{permissionCalls++;return 'granted';}});
      window.sensorTimer=setInterval(()=>{const event=new Event('deviceorientation');Object.defineProperties(event,{gamma:{value:sensorGamma},beta:{value:sensorBeta}});dispatchEvent(event);},25);
    });
    await page.goto(base,{waitUntil:'networkidle0'});
    await page.click('#start-screen .controls-open');
    assert.equal(await page.$eval('#controls-screen',e=>e.classList.contains('hidden')),false);
    await page.click('[data-input="touch"]');await page.click('[data-jump-side="left"]');
    await page.$eval('#control-sensitivity',el=>{el.value='1.35';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.$eval('#control-size',el=>{el.value='84';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.screenshot({path:path.join(review,'settings-393.png')});
    await page.click('#controls-close');await page.reload({waitUntil:'networkidle0'});
    report.persist=await page.evaluate(()=>({mode:game.input.preferredMode,side:game.input.jumpSide,sensitivity:game.input.sensitivity,size:game.input.buttonSize}));
    assert.deepEqual(report.persist,{mode:'touch',side:'left',sensitivity:1.35,size:84});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);});
    report.drag=await page.evaluate(()=>{
      const g=game,input=g.input,c=g.container,rect=c.getBoundingClientRect();
      const event=(target,name,id,x,y)=>target.dispatchEvent(new PointerEvent(name,{pointerId:id,pointerType:'touch',clientX:rect.left+x,clientY:rect.top+y,bubbles:true,cancelable:true}));
      event(c,'pointerdown',11,280,620);event(c,'pointermove',11,320,530);input.update(.15);
      const before={lean:input.lean,pitch:input.pitch,mode:input.mode,pad:document.getElementById('steer-pad').classList.contains('active')};
      const jump=document.getElementById('jump-button');g.state='playing';
      event(jump,'pointerdown',12,50,740);event(jump,'pointerup',12,50,740);g.step(1/120);g.state='paused';
      const simultaneous={drag:input.pointers.size,jumps:g.jump.jumps,mode:input.mode};
      event(c,'lostpointercapture',11,320,530);input.update(.5);
      return {before,simultaneous,released:input.lean,pointers:input.pointers.size,pad:document.getElementById('steer-pad').classList.contains('active')};
    });
    assert.ok(report.drag.before.lean>.4);assert.equal(report.drag.before.pitch,0);assert.equal(report.drag.before.pad,true);
    assert.deepEqual(report.drag.simultaneous,{drag:1,jumps:1,mode:'touch'});assert.ok(Math.abs(report.drag.released)<.001);assert.equal(report.drag.pointers,0);assert.equal(report.drag.pad,false);
    await page.evaluate(()=>{game.state='playing';game.pause();});
    await page.click('#pause-screen .controls-open');await page.click('[data-input="gyro"]');
    await page.waitForFunction(()=>game.input.mode==='gyro'&&!game.input.calibrating);
    await page.click('[data-jump-side="right"]');await page.click('#controls-close');await page.click('#resume-button');
    report.gyro=await page.evaluate(()=>{
      const g=game,input=g.input;g.state='paused';
      const sensor=(gamma,beta)=>{const e=new Event('deviceorientation');Object.defineProperties(e,{gamma:{value:gamma},beta:{value:beta}});dispatchEvent(e);};
      sensor(input.neutral+8,input.neutralBeta+25);input.update(.2);const lean=input.lean;
      const left=document.getElementById('steer-left');
      left.dispatchEvent(new PointerEvent('pointerdown',{pointerId:22,bubbles:true,cancelable:true}));input.update(.2);const override=input.lean;
      left.dispatchEvent(new PointerEvent('pointerup',{pointerId:22,bubbles:true,cancelable:true}));input.update(.3);
      const restored=input.lean,neutral=input.neutral,pitch=input.pitch;
      sensor(input.neutral,input.neutralBeta-30);input.update(.3);const center=input.lean;
      return {lean,override,restored,neutral,pitch,center,mode:input.mode,arrows:getComputedStyle(document.querySelector('.steer-controls')).display,calls:permissionCalls};
    });
    assert.ok(report.gyro.lean>.2);assert.ok(report.gyro.override<-.95);assert.ok(report.gyro.restored>.2);
    assert.equal(report.gyro.neutral,7);assert.equal(report.gyro.pitch,0);assert.ok(Math.abs(report.gyro.center)<.003);assert.equal(report.gyro.mode,'gyro');assert.equal(report.gyro.arrows,'none');assert.equal(report.gyro.calls,1);
    report.motion=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.chase.reset();g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);
      g.input.mode='touch';g.input.target=.65;g.p.x=0;g.p.z=15;const dt=1/120;
      for(let i=0;i<18;i++)g.step(dt);const response={lean:g.p.lean,heading:g.p.heading};
      g.input.target=0;for(let i=0;i<48;i++)g.step(dt);const neutral={heading:g.p.heading,lateral:g.p.sideVelocity,weight:g.p.pitch};
      g.jump.press();g.step(dt);g.jump.press();for(let i=0;i<5;i++)g.step(dt);
      g.updateLandingEffects(0);g.updateCamera(.016);const flight={marker:g.landingTarget.visible,roll:g.juice.roll,requested:g.jump.spinStarted||g.jump.spinRequest>0};
      let maxSpeed=g.p.speed;for(let i=0;i<500&&g.p.airborne;i++){g.step(dt);maxSpeed=Math.max(maxSpeed,g.p.speed);}
      g.updateLandingEffects(0);g.state='paused';return {response,neutral,flight,landed:{airborne:g.p.airborne,clean:g.jump.cleanLandings,marker:g.landingTarget.visible,maxSpeed}};
    });
    assert.ok(report.motion.response.lean>.6&&report.motion.response.heading>.15);
    assert.ok(Math.abs(report.motion.neutral.heading)<.025);assert.ok(Math.abs(report.motion.neutral.weight)<=.2);
    assert.equal(report.motion.flight.marker,true);assert.equal(report.motion.flight.roll,0);assert.equal(report.motion.flight.requested,true);
    assert.equal(report.motion.landed.airborne,false);assert.ok(report.motion.landed.clean>0);assert.equal(report.motion.landed.marker,false);assert.ok(report.motion.landed.maxSpeed<=42);
    // Exercise native multi-touch: steering stays owned by the first finger while the second jumps.
    await page.evaluate(()=>{game.reset();game.chase.reset();game.state='playing';game.input.mode='touch';game.input.preferredMode='touch';game.input.render();game.world.hazards.forEach(h=>h.done=true);game.rivals.forEach(r=>r.collided=true);});
    const cdp=await page.createCDPSession();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:620,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:125,y:620,id:1}]});
    const box=await page.$eval('#jump-button',el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:125,y:620,id:1},{...box,id:2}]});
    report.native=await page.evaluate(()=>({mode:game.input.mode,drag:game.input.pointers.size,action:game.jump.requested||game.jump.jumps>0}));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert.deepEqual(report.native,{mode:'touch',drag:1,action:true});
    assert.equal(await page.evaluate(()=>game.input.pointers.size),0);
    report.layouts=[];
    for(const [width,height] of [[393,852],[360,640],[844,390],[1240,900]]){
      await page.setViewport({width,height,isMobile:width<1000,hasTouch:true});
      await page.evaluate(()=>{game.state='playing';game.pause();game.controlSettings.open(document.querySelector('#pause-screen .controls-open'));});
      const layout=await page.evaluate(()=>{
        const screen=document.getElementById('controls-screen'),card=screen.querySelector('.controls-card');
        const r=card.getBoundingClientRect();return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,inside:r.left>=0&&r.right<=innerWidth,scrollable:screen.scrollHeight>screen.clientHeight};
      });
      assert.equal(layout.overflow,false);assert.equal(layout.inside,true);report.layouts.push(layout);
      await page.screenshot({path:path.join(review,'settings-'+width+'x'+height+'.png')});
      if(width===844){
        await page.touchscreen.touchStart(width-20,height-60);
        await page.touchscreen.touchMove(width-20,70);await page.touchscreen.touchEnd();
        await page.waitForFunction(()=>document.getElementById('controls-screen').scrollTop>0);
        report.nativeSettingsScroll=true;
      }
      await page.$eval('#controls-screen',screen=>{screen.scrollTop=screen.scrollHeight;});await page.click('#controls-close');
    }
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.evaluate(()=>{game.journey.hideAll();for(const id of ['pause-screen','result-screen','share-screen'])document.getElementById(id).classList.add('hidden');game.container.classList.add('playing');game.state='playing';game.input.mode='touch';game.input.render();game.reset();game.p.z=80;game.p.y=game.wave.height(game.p.x,80);game.jump.press();for(let i=0;i<24;i++)game.step(1/120);game.state='paused';game.updateCamera(1,true);game.updateVisuals(0);game.updateLandingEffects(0);game.renderer.render(game.scene,game.camera);});
    await page.screenshot({path:path.join(review,'flight-393.png')});
    const denied=await browser.newPage();denied.on('pageerror',e=>errors.push(e.message));await denied.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await denied.evaluateOnNewDocument(()=>{localStorage.removeItem('garret_comics_controls');Object.defineProperty(DeviceOrientationEvent,'requestPermission',{configurable:true,value:async()=>'denied'});});
    await denied.goto(base,{waitUntil:'networkidle0'});await denied.evaluate(async()=>{await game.start(true);game.state='paused';});
    assert.equal(await denied.evaluate(()=>game.input.mode),'touch');assert.match(await denied.evaluate(()=>game.input.status),/недоступен/);
    report.denied=true;assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({report,errors},null,2));
    console.log('PASS: saved controls, gyro override/return, one-axis drag, native multi-touch, automatic weight, fast turn response, clean landing, level horizon, denial fallback and responsive settings.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
