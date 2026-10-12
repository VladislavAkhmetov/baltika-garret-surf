const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const dir=path.resolve(__dirname,'../review/comics/course-show');fs.mkdirSync(dir,{recursive:true});
  const report={errors:[],frames:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))report.errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';await game.rush.ready;game.audio.stopBGM();});
    report.run=await page.evaluate(()=>{
      const g=game;g.meta.seed=42;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;let spun=0;
      for(let i=0;i<120*90&&g.state==='playing';i++){
        const x=g.trickRoute.routePoint(g.p.z+9);g.input.target=THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
        if(g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;}g.step(1/120);
      }
      const atFinish={state:g.state,beer:g.mug.level,sections:g.courseShow.events.filter(e=>e.type==='section').map(e=>e.id),delivery:g.courseShow.deliveryActive,score:g.score};
      const frozen={time:g.time,z:g.p.z,beer:g.mug.level,score:g.score};
      for(let i=0;i<90;i++)g.updateVisuals(1/60);
      const after={time:g.time,z:g.p.z,beer:g.mug.level,score:g.score};
      g.courseShow.endDelivery();const skipped=!g.courseShow.deliveryActive&&!g.container.classList.contains('delivery-active');
      g.reset();const reset=g.courseShow.events.length===0&&g.courseShow.wakeWins.size===0&&!g.courseShow.glass.visible;
      g.state='paused';return {atFinish,frozen,after,skipped,reset};
    });
    assert.equal(report.run.atFinish.state,'finished');assert.ok(report.run.atFinish.beer>=.3);
    assert.deepEqual(report.run.atFinish.sections,['beach','promenade','gates','boris','swell','home']);
    assert.ok(report.run.atFinish.delivery&&report.run.skipped&&report.run.reset);assert.deepEqual(report.run.frozen,report.run.after,'delivery cannot change the settled run');
    report.wake=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.chase.end('test');g.time=13;g.wave.time=13;
      const h=g.world.hazards.find(h=>h.type==='jetski');h.activeAt=12;h.x=0;h.z=410;h.motion={x:0,z:1};
      g.p.z=400;g.p.x=3.6;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=32;
      for(let i=0;i<24;i++){g.time+=1/120;g.courseShow.step(1/120);}
      const source=g.world.wakeSourceAt(g.p.x,g.p.z);
      g.updateCoach(g.waveRide.guidance());const cue=document.getElementById('coach-title').textContent.includes('ПОЙМАЛ СЛЕД');
      g.courseShow.onLanding('wake:'+h.index,false);const rough=g.courseShow.wakeWins.size===0;
      g.jump.press();g.jump.step(1/120,g.wave.sample(g.p.x,g.p.z));
      const takeoff=g.jump.takeoffSource;
      for(let i=0;i<600&&g.p.airborne;i++){
        g.time+=1/120;g.wave.time=g.time;g.p.z+=g.p.speed/120;
        g.jump.step(1/120,g.wave.sample(g.p.x,g.p.z));
      }
      const won=g.courseShow.wakeWins.size,events=g.courseShow.events.filter(e=>e.type==='wake-link').length;
      g.courseShow.onLanding(takeoff,true);g.courseShow.onLanding('wave:9',true);
      const once=g.courseShow.wakeWins.size===won;g.reset();g.courseShow.onLanding(takeoff,true);
      const noFake=g.courseShow.wakeWins.size===0;g.state='paused';
      return {quality:source.quality,takeoff,won,events,once,noFake,cue,rough};
    });
    assert.ok(report.wake.quality>.3&&report.wake.takeoff.startsWith('wake:')&&report.wake.won===1&&report.wake.events===1&&report.wake.once&&report.wake.noFake&&report.wake.cue&&report.wake.rough,'a physical wake takeoff and clean landing pays once');
    for(const [name,width,height] of [['phone',393,852],['small',360,640],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      for(const [scene,z] of [['promenade',180],['gates',281],['boris',675],['swell',963],['home',1315],['delivery',1360]]){
        const frame=await page.evaluate((scene,z)=>{
          const g=game;g.reset();g.state='paused';g.journey.hideAll();['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
          g.container.classList.add('playing');g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.input.mode='touch';g.input.render();
          g.p.z=z;g.p.x=g.trickRoute.routePoint(z);g.time=z/33;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,z);g.p.speed=33;
          g.updateCamera(1,true);g.wave.update(z,g.time,true);g.updateVisuals(0);g.updateHUD();
          if(scene==='delivery'){g.finish();g.courseShow.deliveryTime=2.5;g.updateVisuals(0);}
          g.renderer.render(g.scene,g.camera);
          return {scene,z,palette:g.wave.waterMaterial.uniforms.uDeep.value.getHexString(),calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles};
        },scene,z);
        await page.screenshot({path:path.join(dir,name+'-'+scene+'.png')});report.frames.push({name,...frame});
      }
    }
    report.delivery=await page.evaluate(()=>{
      const g=game;g.courseShow.endDelivery();g.reset();g.p.z=g.distance;g.state='playing';g.elapsed=40;g.duel.arrived=true;g.duel.arrivalTime=39;g.duel.deliveredBeer=.2;g.mug.level=.9;g.finish();
      const failure=!g.courseShow.success&&g.duel.result.outcome==='defeat'&&document.getElementById('delivery-line').textContent.includes('БОРИС ПЕРВЫЙ')&&g.deliveryBonus===4500;
      const score=g.score;for(let i=0;i<250;i++)g.courseShow.updateDelivery(1/60);
      const ended=!g.courseShow.deliveryActive&&g.score===score;
      g.reset();g.reducedMotion=true;g.state='playing';g.p.z=g.distance;g.finish();const camera=g.camera.position.clone();g.courseShow.updateDelivery(.05);
      const reduced=g.camera.position.equals(camera)&&g.courseShow.confetti.every(m=>!m.visible);g.courseShow.endDelivery();
      return {failure,ended,reduced};
    });
    assert.ok(Object.values(report.delivery).every(Boolean));assert.deepEqual(report.errors,[]);
    console.log(JSON.stringify(report,null,2));
  }finally{
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
    await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));
  }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
