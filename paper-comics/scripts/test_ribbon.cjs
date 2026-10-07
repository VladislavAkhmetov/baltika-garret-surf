const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port,review=path.resolve(__dirname,'../review/comics/main-ribbon');
  fs.mkdirSync(review,{recursive:true});let browser;const errors=[],report={};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))errors.push(m.text());});
    await page.setViewport({width:1280,height:800});await page.goto(base+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';});
    report.physics=await page.evaluate(()=>{
      const g=game,dt=1/120;
      function simulate(enabled){
        g.ribbon.setEnabled(enabled);g.reset();g.state='playing';g.input.mode='touch';g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
        const trace=[];
        for(let i=0;i<120*12;i++){
          const w=g.wave.waves.find(w=>g.p.z>w.from&&g.p.z<w.to-18);
          const desired=w?THREE.MathUtils.clamp(g.wave.crestX(w,g.p.z+10)+w.width*.34,-7,7):1;
          g.input.target=THREE.MathUtils.clamp((desired-g.p.x)*.7-g.p.sideVelocity*.12,-1,1);g.step(dt);g.comics.update(dt);
          if(i%120===0)trace.push([g.p.x,g.p.z,g.p.speed,g.waveRide.totalCaught,g.score,g.chain.points]);
        }
        const result={trace,catches:g.waveRide.totalCaught,maxSpeed:Math.max(...trace.map(t=>t[2])),score:g.score+g.chain.value};g.state='paused';return result;
      }
      const on=simulate(true),off=simulate(false);g.ribbon.setEnabled(true);return {on,off};
    });
    assert.deepEqual(report.physics.on.trace,report.physics.off.trace,'turning the ribbon off does not alter input, physics or scoring');
    assert.ok(report.physics.on.catches>=3&&report.physics.on.maxSpeed>30&&report.physics.on.score>0,'new wave drive still contributes to the main arcade loop');
    report.hazards=await page.evaluate(()=>{
      const g=game;g.reset();g.wave.resetWaves(42);g.state='paused';g.world.hazards.forEach(h=>h.done=true);
      const w=g.wave.waves[5];g.time=w.encounterTime;g.wave.time=g.time;g.p.z=(w.from+w.to)/2-36;g.p.x=g.wave.crestX(w,g.p.z)+w.width*.34;
      const z=g.p.z+26;g.ribbon.plan();const before=g.ribbon.routePoint(z),samplesBefore=[];
      for(let at=z-8;at<=z+8;at+=2)samplesBefore.push({z:at,x:g.ribbon.routePoint(at)});
      const h=g.world.hazards.find(h=>h.type==='buoy');h.done=false;h.x=before??g.p.x;h.z=z;g.ribbon.plan();
      const samples=[];for(let at=z-8;at<=z+8;at+=2)samples.push({z:at,x:g.ribbon.routePoint(at)});
      return {before,hazard:h.x,samplesBefore,samples};
    });
    assert.ok(report.hazards.before!==null,'there is a suggested line before the obstacle');
    assert.deepEqual(report.hazards.samples,report.hazards.samplesBefore,'a moving or newly injected hazard cannot relocate the course markings');
    report.fixedRoute=await page.evaluate(()=>{
      const g=game;g.reset();g.state='paused';g.ribbon.setEnabled(true);
      const samples=()=>Array.from({length:1201},(_,z)=>g.ribbon.routePoint(z));
      const before=samples(),z=205;g.p.z=z;g.p.x=g.ribbon.routePoint(z);
      g.p.heading=THREE.MathUtils.clamp(Math.atan2((g.ribbon.routePoint(z+3)-g.ribbon.routePoint(z-3))/6,.38),-.53,.53);
      g.time=4;g.wave.time=g.time;g.ribbon.reset();g.ribbon.update();const green=g.ribbon.uniforms.uAccuracy.value;
      const footprint=()=>{const a=g.ribbon.mesh.geometry.attributes.position;return Array.from({length:a.count},(_,i)=>[a.getX(i),a.getZ(i)]);};
      const meshBefore=footprint();g.p.x=8;g.p.speed=42;g.p.sideVelocity=-6;g.p.heading=-.53;g.time=18;g.wave.time=g.time;
      g.trickRoute.lines.forEach(l=>{l.done=true;l.stage=-1;});g.world.hazards.forEach(h=>{h.x=0;h.z=z;h.hit=h.done=true;});
      g.ribbon.setEnabled(false);g.ribbon.setEnabled(true);g.ribbon.plan();g.ribbon.update();
      const after=samples(),meshAfter=footprint(),red=g.ribbon.uniforms.uAccuracy.value;
      const positionError=Math.max(...before.map((x,i)=>Math.abs(x-after[i])));
      const meshError=Math.max(...meshBefore.map((p,i)=>Math.max(Math.abs(p[0]-meshAfter[i][0]),Math.abs(p[1]-meshAfter[i][1]))));
      g.reset();const replay=samples(),replayError=Math.max(...before.map((x,i)=>Math.abs(x-replay[i])));
      return {positionError,meshError,replayError,green,red,width:g.ribbon.mesh.geometry.attributes.position.getX(0)-g.ribbon.mesh.geometry.attributes.position.getX(6)};
    });
    assert.equal(report.fixedRoute.positionError,0,'the entire route is independent of player position, speed, time, completed ramps and mutable hazards');
    assert.equal(report.fixedRoute.meshError,0,'the rendered dots retain the same world X/Z coordinates');
    assert.equal(report.fixedRoute.replayError,0,'restarting the same level preserves its route');
    assert.ok(report.fixedRoute.green>.98&&report.fixedRoute.red<.01,'following the line is green and a large deviation is red');
    assert.ok(Math.abs(report.fixedRoute.width-.64)<.00001,'guidance uses a thin strip of small dots');
    await page.evaluate(()=>{game.pause();game.state='playing';game.pause();});
    await page.click('#ribbon-toggle');assert.equal(await page.$eval('#ribbon-toggle',e=>e.getAttribute('aria-pressed')),'false');
    await page.reload({waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>game.ribbon.enabled),false,'the preference survives reload');
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.ribbon.setEnabled(true);});
    report.layouts=[];
    for(const [name,width,height] of [['desktop',1280,800],['mobile',393,852],['small',320,640],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:name!=='desktop',hasTouch:name!=='desktop',deviceScaleFactor:1});
      const layout=await page.evaluate(()=>{
        const g=game;g.reset();g.state='paused';g.journey.hideAll();g.container.classList.add('playing');g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
        const w=g.wave.waves[6];g.time=w.encounterTime;g.wave.time=g.time;g.p.z=(w.from+w.to)/2-20;g.p.x=g.wave.crestX(w,g.p.z)+w.width*.34;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=33;
        g.waveRide.caught=true;g.waveRide.boost=9;g.waveRide.totalCaught=4;g.ribbon.catchWave();
        g.resize();g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.speedBlur.render();
        const pos=g.ribbon.mesh.geometry.attributes.position;let maxError=0;
        for(let i=0;i<pos.count;i+=7)maxError=Math.max(maxError,Math.abs(pos.getY(i)-g.trickRoute.guidanceHeight(-pos.getX(i),pos.getZ(i))-.065));
        return {surfaceError:maxError,drawCount:g.ribbon.mesh.geometry.drawRange.count,finite:Array.from(pos.array).every(Number.isFinite),overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.ok(layout.finite&&layout.surfaceError<.005&&layout.drawCount>0&&!layout.overflow,name+' ribbon renders on the real water');report.layouts.push({name,...layout});
      await page.screenshot({path:path.join(review,name+'-ride.png')});
      await page.evaluate(()=>{game.state='playing';game.pause();});
      await page.screenshot({path:path.join(review,name+'-pause.png')});
      const fits=await page.$eval('#ribbon-toggle',e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});
      assert.ok(fits,name+' ribbon preference remains accessible');
      await page.evaluate(()=>{document.getElementById('pause-screen').classList.add('hidden');});
    }
    await page.evaluate(()=>{game.reducedMotion=true;game.ribbon.update();});
    assert.equal(await page.evaluate(()=>game.ribbon.uniforms.uQuiet.value),1);
    assert.deepEqual(errors,[]);report.errors=errors;fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({catches:report.physics.on.catches,maxSpeed:report.physics.on.maxSpeed,fixedRoute:report.fixedRoute,layouts:report.layouts,errors},null,2));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
