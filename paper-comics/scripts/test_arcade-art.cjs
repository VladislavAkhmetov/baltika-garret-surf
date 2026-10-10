const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const review=path.resolve(__dirname,'../review/comics/arcade-art');fs.mkdirSync(review,{recursive:true});
  const errors=[],report={};let browser;
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|GL_INVALID|framebuffer/i.test(m.text()))errors.push(m.text());});
    await page.setViewport({width:1280,height:800});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';});

    report.route=await page.evaluate(()=>{
      const g=game;g.reset();g.state='paused';g.world.hazards.forEach(h=>h.done=true);
      const samples=g.trickRoute.lines.map(line=>{
        const entry=g.trickRoute.position(line,0);g.p.z=entry.z-18;g.p.x=entry.x;g.time=g.p.z/30;g.wave.time=g.time;
        g.trickRoute.plan();g.trickRoute.update();
        return {type:line.type,visible:line.group.visible,error:Math.abs(g.trickRoute.routePoint(entry.z)-entry.x),
          mesh:line.top.isMesh,printed:line.arrows.every(a=>a.mesh.isMesh),sprites:line.group.children.some(c=>c.isSprite)};
      });
      g.trickRoute.completed=3;g.trickRoute.launches=3;g.trickRoute.reset();
      const reset=g.trickRoute.completed===0&&g.trickRoute.launches===0&&g.trickRoute.lines.every(l=>!l.done&&l.stage===0);
      return {samples,reset};
    });
    assert.equal(report.route.samples.length,9);
    assert.ok(report.route.samples.every(s=>s.visible&&s.error<.001&&s.mesh&&s.printed&&!s.sprites),'physical paper surfaces and guidance share every ramp entry');
    assert.deepEqual([...new Set(report.route.samples.map(s=>s.type))].sort(),['side','straight']);assert.equal(report.route.reset,true);

    report.signals=await page.evaluate(()=>{
      const g=game;g.reset();const l=g.trickRoute.lines[0];g.wave.time=l.wave.peelOriginTime;
      const entry=g.trickRoute.position(l,0);g.p.z=entry.z-20;g.p.x=entry.x;
      g.chase.taught=true;g.chase.begin(l.wave);g.chase.gap=4.5;g.p.speed=28;g.p.heading=0;g.chase.speed=30;g.chain.render();
      const approaching={distance:g.chain.chaseDistance.textContent,status:g.chain.chaseStatus.textContent,eta:g.chase.impactETA};
      g.chase.speed=26;g.chain.render();const retreating=g.chain.chaseStatus.textContent;
      g.chase.speed=30;g.chase.gap=2;g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.updateHUD();
      const warning={risk:g.chain.chaseEl.dataset.risk,title:document.getElementById('coach-title').textContent,visible:!document.getElementById('ride-coach').classList.contains('hidden')};
      g.p.airY=2;g.chain.render();const overFoam=g.chain.chaseStatus.textContent;
      g.reset();g.state='paused';return {approaching,retreating,warning,overFoam};
    });
    assert.equal(report.signals.approaching.distance,'3,4 М');assert.ok(Math.abs(report.signals.approaching.eta-1.7)<1e-8);
    assert.match(report.signals.approaching.status,/ДОГОНЯЕТ.*≈ 1,7 С/);assert.equal(report.signals.retreating,'ОТСТАЁТ');
    assert.deepEqual(report.signals.warning,{risk:'critical',title:'ПЕНА ВПЛОТНУЮ!',visible:true});assert.equal(report.signals.overFoam,'НАД ПЕНОЙ');

    report.blur=await page.evaluate(()=>{
      const g=game;g.reset();g.juice.setLiveCamera(true);g.state='playing';
      g.p.speed=35;for(let i=0;i<60;i++)g.speedBlur.update(1/60);const max=g.speedBlur.amount;
      g.p.speed=26;for(let i=0;i<60;i++)g.speedBlur.update(1/60);const cruise=g.speedBlur.amount;
      g.p.speed=35;g.reducedMotion=true;g.speedBlur.update(.1);const reduced=g.speedBlur.amount;g.reducedMotion=false;
      g.juice.setLiveCamera(false);g.speedBlur.update(.1);const calm=g.speedBlur.amount;g.juice.setLiveCamera(true);
      g.assist=false;g.p.speed=35;for(let i=0;i<60;i++)g.speedBlur.update(1/60);const hardCruise=g.speedBlur.amount;
      g.p.speed=42;for(let i=0;i<60;i++)g.speedBlur.update(1/60);const hardMax=g.speedBlur.amount;
      g.state='paused';g.speedBlur.update(.1);const paused=g.speedBlur.amount;g.assist=true;
      return {supported:g.speedBlur.supported,max,cruise,reduced,calm,hardCruise,hardMax,paused};
    });
    const b=report.blur;assert.equal(b.supported,true);assert.ok(b.max>.97&&b.cruise<.01);assert.ok(b.hardMax>.97&&b.hardCruise<.01);
    assert.deepEqual([b.reduced,b.calm,b.paused],[0,0,0],'motion preferences and pause disable blur');

    report.chase=await page.evaluate(()=>{
      const g=game;g.reset();g.wave.resetWaves(42);
      const w=g.wave.waves.find(w=>w.height>=2.6&&w.anchorFrom>230);
      g.time=w.peelOriginTime;g.wave.time=g.time;g.p.z=g.wave.frontAt(w).z+12;
      g.p.x=g.wave.crestX(w,g.p.z)+w.width*.32;g.p.y=g.wave.height(g.p.x,g.p.z);
      g.chase.taught=true;g.chase.begin(w);g.chase.updateFront();g.updateCamera(1,true);
      const mesh=g.chase.frontMesh,vertices=mesh.geometry.attributes.position,index=Math.floor(g.chase.rows*.4)*(g.chase.columns+1)+g.chase.columns/2;
      const front=new THREE.Vector3().fromBufferAttribute(vertices,index),projected=front.clone().project(g.camera);
      g.camera.position.x+=3;g.camera.updateMatrixWorld();const parallax=front.clone().project(g.camera).distanceTo(projected);
      g.camera.position.x-=3;g.camera.updateMatrixWorld();
      g.chase.z+=5;g.chase.updateFront();const moved=vertices.getZ(index)-front.z;
      const worldMesh=mesh.parent===g.scene&&mesh.material===g.wave.waterMaterial;
      const overlayRemoved=!document.getElementById('foam-edge');g.chase.reset();
      return {parallax,moved,worldMesh,overlayRemoved,hiddenAfterReset:!mesh.visible};
    });
    assert.ok(report.chase.parallax>.05,'camera movement changes the foam projection');
    assert.equal(report.chase.moved,5,'the foam follows its world front');
    assert.ok(report.chase.worldMesh&&report.chase.overlayRemoved&&report.chase.hiddenAfterReset,'foam is water geometry and resets cleanly');

    report.camera=await page.evaluate(()=>{
      const g=game;g.reset();g.chase.reset();g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
      g.juice.setLiveCamera(true);g.reducedMotion=false;g.p.speed=0;g.updateCamera(1,true);
      const base=g.camera.position.clone(),w=g.wave.waves[6];g.chase.taught=true;g.chase.begin(w);g.chase.gap=12;
      for(let i=0;i<30;i++)g.updateCamera(1/60);const far=base.distanceTo(g.camera.position);
      g.chase.gap=3;let maxSpeed=0;
      for(let i=0;i<180;i++){const before=g.camera.position.clone();g.updateCamera(1/60);maxSpeed=Math.max(maxSpeed,before.distanceTo(g.camera.position)*60);}
      const pullback=base.z-g.camera.position.z,lift=g.camera.position.y-base.y;
      const beforeFreeze=g.camera.position.clone(),scale=g.comics.timeScale;g.comics.timeScale=0;
      for(let i=0;i<30;i++)g.updateCamera(1/60);const freeze=beforeFreeze.distanceTo(g.camera.position);g.comics.timeScale=scale;
      g.reducedMotion=true;g.updateCamera(1,true);const reduced=base.distanceTo(g.camera.position);g.reducedMotion=false;
      g.juice.setLiveCamera(false);g.updateCamera(1,true);const calm=base.distanceTo(g.camera.position);g.juice.setLiveCamera(true);
      g.updateCamera(1,true);g.chase.end('left');for(let i=0;i<360;i++)g.updateCamera(1/60);
      const returned=base.distanceTo(g.camera.position);g.reset();const reset=g.cameraChasePull,resetIntro=g.chase.active&&g.chase.phase==='intro';g.state='paused';
      return {far,pullback,lift,maxSpeed,freeze,reduced,calm,returned,reset,resetIntro};
    });
    fs.writeFileSync(path.join(review,'camera-report.json'),JSON.stringify(report.camera,null,2));
    assert.ok(report.camera.far>1&&report.camera.far<5.1,'the framing begins opening at the first pursuing crest: '+JSON.stringify(report.camera));
    assert.ok(report.camera.pullback>6&&report.camera.pullback<6.41&&report.camera.lift>1.5,'near foam opens and raises the framing');
    assert.ok(report.camera.maxSpeed<5,'camera retreat remains gradual');
    assert.equal(report.camera.freeze,0,'comic freeze also freezes the retreat');
    assert.deepEqual([report.camera.reduced,report.camera.calm],[0,0],'motion preferences remove the retreat');
    assert.ok(report.camera.resetIntro&&report.camera.reset>.7&&report.camera.reset<=1,'reset starts the visible introductory crest with its own framing');
    assert.ok(report.camera.returned<.1,'camera smoothly returns after the chase ends: '+JSON.stringify(report.camera));

    for(const [name,width,height] of [['desktop',1280,800],['mobile',393,852],['small',360,640],['landscape',852,393]]){
      await page.setViewport({width,height,isMobile:width<900,hasTouch:width<900});
      await page.evaluate(async()=>{
        const g=game;g.reset();g.journey.hideAll();g.container.classList.add('playing');g.meta.ghost=[];g.meta.hideGhost();
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.comics.reset();
        const line=g.trickRoute.lines.find(l=>l.wave.id===9);g.time=(Math.floor(line.wave.encounterTime/1.1)+.25)*1.1;g.wave.time=g.time;
        const pos=g.trickRoute.position(line,0);g.p.z=pos.z-26;g.p.x=pos.x+.5;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=33;
        g.state='paused';g.renderDirty=false;g.resize();g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);g.updateHUD();
        g.renderer.render(g.scene,g.camera);g.renderDirty=false;
        await document.fonts.ready;
      });
      await page.screenshot({path:path.join(review,name+'-route.png')});
      if(name==='desktop'){
        await page.evaluate(()=>{
          const g=game,line=g.trickRoute.lines.find(l=>l.wave.id===9),entry=g.trickRoute.position(line,0);
          g.p.x=entry.x;g.p.z=entry.z-1;g.trickRoute.step(1/120);g.p.z=entry.z+1;g.trickRoute.step(1/120);
          g.p.z=entry.z+9;const end=g.trickRoute.position(line,1);g.p.x=entry.x+(end.x-entry.x)*.26;g.p.y=g.wave.height(g.p.x,g.p.z);
          g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);g.renderDirty=false;
        });
        await page.screenshot({path:path.join(review,'desktop-gate.png')});
      }
      await page.evaluate(()=>{
        const g=game;g.chain.clear();g.awardTrick('ПЕРЕВОРОТ!',1000);g.updateHUD();
        document.getAnimations().forEach(a=>{a.currentTime=350;a.pause();});
      });
      const layout=await page.evaluate(()=>{
        const m=document.getElementById('moment'),r=m.getBoundingClientRect(),s=game.container.getBoundingClientRect(),hero=new THREE.Vector3();
        game.player.card.getWorldPosition(hero);hero.project(game.camera);
        const chain=document.getElementById('arcade-chain').getBoundingClientRect();
        const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        const card=game.player.card,corners=[];
        for(const x of [-.5,.5])for(const y of [-.5,.5])corners.push(card.localToWorld(new THREE.Vector3(x*card.geometry.parameters.width,y*card.geometry.parameters.height,0)).project(game.camera));
        const heroBounds={left:s.left+(1+Math.min(...corners.map(p=>p.x)))*s.width/2,right:s.left+(1+Math.max(...corners.map(p=>p.x)))*s.width/2,top:s.top+(1-Math.max(...corners.map(p=>p.y)))*s.height/2,bottom:s.top+(1-Math.min(...corners.map(p=>p.y)))*s.height/2};
        const tickets=[...document.querySelectorAll('.beer-ticket,.score-ticket,.collection-ticket')].map(el=>el.getBoundingClientRect());
        const utilities=['pause-button','sound-button'].map(id=>document.getElementById(id).getBoundingClientRect());
        return {inside:r.left>=s.left&&r.right<=s.right&&r.top>=s.top&&r.bottom<=s.bottom,heroClear:!overlaps(r,heroBounds),upperClear:[r,chain].every(a=>[...tickets,...utilities].every(b=>!overlaps(a,b))),chainAboveMessage:chain.bottom<=r.top,points:m.querySelector('.moment-points').textContent,visible:getComputedStyle(m).visibility,menusHidden:[...document.querySelectorAll('.screen')].every(el=>el.classList.contains('hidden'))};
      });
      assert.ok(layout.inside&&layout.heroClear,name+': celebration fits above the rider '+JSON.stringify(layout));
      assert.ok(layout.upperClear&&layout.chainAboveMessage,name+': upper readouts leave tickets and utility buttons clear '+JSON.stringify(layout));
      assert.equal(layout.points,'+1 000');assert.equal(layout.visible,'visible');
      assert.equal(layout.menusHidden,true,name+': screenshots show the ride');
      await page.screenshot({path:path.join(review,name+'-trick.png')});report[name]=layout;
      await page.evaluate(()=>{document.getElementById('moment').classList.remove('visible');game.speedBlur.amount=1;game.speedBlur.render();});
      await page.screenshot({path:path.join(review,name+'-speed.png')});
      if(name==='desktop'){
        report.pixels=await page.evaluate(()=>{
          const g=game,source=g.renderer.domElement,c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');
          g.speedBlur.amount=.015;g.speedBlur.render();ctx.drawImage(source,0,0);const normal=ctx.getImageData(0,0,c.width,c.height).data;
          g.speedBlur.amount=1;g.speedBlur.render();ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(source,0,0);const fast=ctx.getImageData(0,0,c.width,c.height).data;
          function difference(x0,y0,x1,y1){let sum=0,n=0,changed=0,peak=0;for(let y=Math.floor(c.height*y0);y<c.height*y1;y+=2)for(let x=Math.floor(c.width*x0);x<c.width*x1;x+=2){const i=(y*c.width+x)*4;let pixel=0;for(let channel=0;channel<3;channel++){const delta=Math.abs(normal[i+channel]-fast[i+channel]);sum+=delta;pixel=Math.max(pixel,delta);}n++;if(pixel>1)changed++;peak=Math.max(peak,pixel);}return {mean:sum/(n*3),changed:changed/n,peak};}
          const foreground=difference(.35,.76,.65,.98),background=difference(.03,.39,.28,.55);
          return {foreground:foreground.mean,background:background.mean,backgroundChanged:background.changed,backgroundPeak:background.peak,width:g.speedBlur.width,height:g.speedBlur.height};
        });
        assert.ok(report.pixels.foreground<.2,'near water and rider stay sharp: '+JSON.stringify(report.pixels));
        // Flat sea/sky colour dilutes an average across the whole rectangle.
        // Require a substantial set of changed pixels and visible edge differences.
        assert.ok(report.pixels.backgroundChanged>.05&&report.pixels.backgroundPeak>5,'the distant scenery actually changes: '+JSON.stringify(report.pixels));
      }
      await page.evaluate(()=>{
        const g=game;g.reset();g.journey.hideAll();g.container.classList.add('playing');
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.meta.ghost=[];g.meta.hideGhost();
        const w=g.wave.waves.find(w=>w.height>=2.6&&w.anchorFrom>230);
        g.time=w.encounterTime;g.wave.time=g.time;g.p.z=(w.from+w.to)/2-14;
        g.p.x=g.wave.crestX(w,g.p.z)+w.width*.32;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=28;
        g.chase.taught=true;g.chase.begin(w);g.chase.z=g.p.z-4.5;g.chase.gap=4.5;g.chase.level=2;
        g.wave.peelFront={id:w.id,z:g.chase.z};g.chain.addPocket(360);g.awardTrick('360°',600,true);
        g.state='paused';g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);
        for(let i=0;i<18;i++)g.chase.launchSpray();g.chase.update(.06);g.updateVisuals(0);g.updateHUD();
        g.renderer.render(g.scene,g.camera);g.renderDirty=false;
      });
      await page.screenshot({path:path.join(review,name+'-chase.png')});
      if(name==='mobile'){
        await page.evaluate(()=>{
          const g=game;g.p.balance=.65;g.balance.mode='recovery';g.balance.roll=.5;g.balance.updateHUD();
        });
        await page.screenshot({path:path.join(review,'mobile-balance.png')});
      }
      await page.evaluate(mobile=>{
        const g=game,dt=1/120;g.reset();g.journey.hideAll();g.container.classList.add('playing');g.input.mode=mobile?'touch':'keys';
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);
        const w=g.wave.waves[0];g.time=w.encounterTime;g.wave.time=g.time;g.p.z=(w.from+w.to)/2;g.p.x=g.wave.crestX(w,g.p.z)+w.width*.1;
        g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=27;g.balance.immunity=5;g.impactCooldown=8;g.state='playing';
        g.jump.press();for(let i=0;i<12;i++)g.step(dt);
        g.state='paused';g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);g.renderDirty=false;
      },width<900);
      const trickHelp=await page.evaluate(()=>({ready:game.jump.canSpin,title:document.getElementById('coach-title').textContent,line:document.getElementById('coach-line').textContent,visible:!document.getElementById('ride-coach').classList.contains('hidden'),button:document.querySelector('.jump-action').textContent}));
      assert.ok(trickHelp.ready&&trickHelp.visible,name+': assist mode visibly teaches the second tap '+JSON.stringify(trickHelp));
      assert.equal(trickHelp.title,'ЕЩЁ РАЗ → 360°');assert.equal(trickHelp.button,'360°');assert.ok(trickHelp.line.length>0);
      report[name].trickHelp=trickHelp;await page.screenshot({path:path.join(review,name+'-trick-help.png')});
      await page.evaluate(()=>{
        const g=game;g.state='playing';g.pause();g.renderDirty=false;
      });
      const pause=await page.evaluate(()=>{const b=document.getElementById('resume-button').getBoundingClientRect(),s=game.container.getBoundingClientRect();return {resumeFits:b.top>=s.top&&b.bottom<=s.bottom};});
      assert.ok(pause.resumeFits,name+': pause retains the resume action');
      await page.evaluate(()=>{document.getElementById('pause-screen').classList.add('hidden');});
    }
    await page.goto('http://127.0.0.1:'+server.address().port+'/prototype.html?seed=42',{waitUntil:'networkidle0'});
    assert.equal(await page.evaluate(()=>!!game.trickRoute&&!!game.speedBlur),true,'both entry points load the new systems');
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({report,errors},null,2));assert.deepEqual(errors,[]);
    console.log('PASS: physical paper ramps and shared guidance, approach readout, assist trick prompts, world foam, smooth wave camera, blur, motion preferences, four layouts, both entry points.');
  }finally{await browser?.close();server.closeAllConnections?.();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
