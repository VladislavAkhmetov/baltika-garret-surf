const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const dir=path.resolve(__dirname,'../review/comics/sprint');fs.mkdirSync(dir,{recursive:true});
  const report={errors:[],runs:[],frames:[]},save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();game.journey.hideAll();});
    report.rules=await page.evaluate(()=>{
      const g=game,place=()=>{g.reset();g.state='playing';g.input.mode='touch';const pad=g.rush.accelerators[0];g.p.x=pad.x;g.p.z=pad.z;g.p.y=g.wave.height(pad.x,pad.z);return pad;};
      let pad=place();g.rush.collectAccelerators();g.rush.step(.3);
      const picked=pad.taken&&g.rush.padHits===1&&g.rush.padBoost>6,before=g.rush.padTime;g.rush.collectAccelerators();const once=g.rush.padHits===1&&g.rush.padTime===before;
      g.state='paused';g.updateVisuals(.3);const pause=g.rush.padTime===before;
      g.state='playing';g.spill(.025,'УДАР');const interrupted=g.rush.padTime===0;g.rush.step(1);const expired=g.rush.padBoost<.01;
      place();g.p.airborne=true;g.p.airY=3;g.p.y+=3;g.rush.collectAccelerators();const air=g.rush.padHits===0;
      pad=place();g.p.x+=pad.width;g.rush.collectAccelerators();const bypass=g.rush.padHits===0;
      pad=place();const calm=g.reducedMotion;g.reducedMotion=true;g.rush.collectAccelerators();g.rush.step(.3);g.updateCamera(.3,true);
      const reduced=g.rush.padBoost>6&&g.rush.splashAmount===0&&g.camera.fov===58;g.reducedMotion=calm;
      g.reset();const reset=g.rush.padHits===0&&g.rush.padTime===0&&g.rush.padBoost===0&&g.rush.accelerators.every(p=>!p.taken&&!p.done);
      const measure=boosted=>{
        const pad=place();g.comics.trigger=()=>false;g.time=pad.z/34;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=30;
        g.world.hazards.forEach(h=>h.done=true);g.race.cursor=g.race.scenes.length;g.chase.end('finish');g.setpiece.resolved=true;
        if(boosted)g.rush.collectAccelerators();g.p.z=pad.z+pad.length/2+1;
        for(let i=0;i<72;i++){const x=g.trickRoute.routePoint(g.p.z+9);g.input.target=THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);g.step(1/120);}
        return g.p.speed;
      };
      const normalSpeed=measure(false),boostedSpeed=measure(true);g.state='paused';
      return {picked,once,pause,interrupted,expired,air,bypass,reduced,reset,normalSpeed,boostedSpeed};
    });save();
    for(const key of ['picked','once','pause','interrupted','expired','air','bypass','reduced','reset'])assert.ok(report.rules[key],key);
    assert.ok(report.rules.boostedSpeed-report.rules.normalSpeed>3,'the accelerator changes real board speed');
    for(const [seed,safe] of [[42,false],[7,true],[93,false]]){
      const result=await page.evaluate((seed,safe)=>{
        const g=game;g.meta.seed=seed;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
        let spun=0,maxSpeed=0;const turnSamples=[];
        for(let i=0;i<120*90&&g.state==='playing';i++){
          const z=g.p.z+9,fork=g.setpiece.path(z,safe),gate=g.beats.target(z),x=z<345&&fork!==null?fork:gate??fork??g.trickRoute.routePoint(z);
          g.input.target=THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
          const rope=g.beats.ropes.find(r=>!r.done&&r.z-g.p.z>0&&r.z-g.p.z<21&&Math.abs(r.x-g.p.x)<r.halfWidth+.6);
          const threat=g.world.hazards.find(h=>!h.done&&h.activeAt!==null&&Math.abs(h.z-g.p.z)<12&&Math.abs(h.x-g.p.x)<1.7);
          if(!g.p.airborne&&(rope||threat)&&g.jump.cooldown===0)g.jump.press();
          if(g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;}
          g.step(1/120);maxSpeed=Math.max(maxSpeed,g.p.speed);
          if(i%12===0&&g.p.z>1198)turnSamples.push({z:g.p.z,x:g.p.x,speed:g.p.speed});
        }
        const result={seed,safe,state:g.state,beer:g.mug.level,seconds:g.elapsed,maxSpeed,pads:g.rush.padHits,boosts:g.rush.padEvents,finale:g.setpiece.finaleLanded,
          homeGates:g.beats.zones.find(z=>z.home).hits,reefHits:g.setpiece.events.filter(e=>e.type==='reef-hit'&&e.z>1174),turnSamples};g.state='paused';return result;
      },seed,safe);report.runs.push(result);save();
      assert.ok(result.state==='finished'&&result.beer>=.3&&result.finale,'the sprint preserves the final launch and delivery');
      assert.ok(result.pads>=3&&result.boosts.some(b=>b.z>1200),'real steering reaches accelerators before and after the finale');
      assert.ok(result.maxSpeed>42,'accelerators raise the speed ceiling');
      assert.ok(result.homeGates>=2&&result.reefHits.length===0,'the chicane offers reachable gates and open paths around its reefs');
      assert.ok(result.turnSamples.some(p=>p.x<-2)&&result.turnSamples.some(p=>p.x>2),'the final leg contains real turns in both directions');
    }
    for(const [name,width,height] of [['phone',393,852],['small',360,640],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      for(const [pose,z] of [['boost',1055],['chicane',1200],['last-turn',1282],['bar',1322]]){
        const frame=await page.evaluate((pose,z)=>{
          const g=game;g.meta.seed=42;g.reset();g.journey.hideAll();for(const id of ['start-screen','pause-screen','result-screen'])document.getElementById(id).classList.add('hidden');
          g.container.classList.add('playing');g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.input.mode='touch';g.input.render();g.state='paused';
          g.p.z=z;g.p.x=g.trickRoute.routePoint(z);g.time=z/33;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,z);g.p.speed=pose==='bar'?44:34;
          g.rivals.forEach(r=>{r.z=-100;r.encounter=null;});g.updateCamera(1,true);g.wave.update(z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
          return {pads:g.rush.accelerators.filter(p=>p.mesh.visible).length,finite:g.rush.accelerators.every(p=>Array.from(p.mesh.geometry.attributes.position.array).every(Number.isFinite)),overflow:document.documentElement.scrollWidth>innerWidth,drawCalls:g.renderer.info.render.calls};
        },pose,z);assert.ok(frame.pads>0&&frame.finite&&!frame.overflow);
        await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.hud')).opacity)>.98);
        await page.screenshot({path:path.join(dir,name+'-'+pose+'.png')});report.frames.push({name,pose,...frame});
      }
    }
    assert.deepEqual(report.errors,[]);save();console.log(JSON.stringify({rules:report.rules,runs:report.runs.map(({turnSamples,boosts,...r})=>r),frames:report.frames.length,errors:report.errors},null,2));
  }finally{try{await browser?.close();}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
