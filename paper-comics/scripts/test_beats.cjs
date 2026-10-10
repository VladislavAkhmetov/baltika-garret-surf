const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const dir=path.resolve(__dirname,'../review/comics/beats');fs.mkdirSync(dir,{recursive:true});
  const report={errors:[],runs:[],frames:[]},save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';await game.rush.ready;game.audio.stopBGM();game.journey.hideAll();});
    report.rules=await page.evaluate(()=>{
      const g=game,points=()=>g.score+g.chain.points;
      const cross=(z,x,air=0)=>{g.p.z=z+.1;g.p.x=x;g.p.airY=air;g.p.airborne=air>0;g.p.y=g.wave.height(x,z)+air;g.beats.lastZ=z-.1;g.beats.lastX=x;g.beats.step(.01);};
      g.reset();g.state='playing';g.comics.trigger=()=>false;
      const zone=g.beats.zones[0];for(const gate of zone.gates)cross(gate.z,gate.x);
      const slalom={passed:g.beats.passed,complete:g.beats.slaloms,caps:g.collected,points:points()},before=points();
      cross(zone.gates[2].z,zone.gates[2].x);const once=points()===before&&g.beats.passed===3;
      g.reset();g.state='playing';const missed=g.beats.zones[0].gates[0];cross(missed.z,missed.x+3);
      const miss=g.beats.passed===0&&g.mug.level===1;
      g.reset();g.state='playing';const highGate=g.beats.zones[0].gates[0];cross(highGate.z,highGate.x,3);
      const highPass=g.beats.passed===0&&g.collected===0;
      const ropeTest=(air,outside=false)=>{g.reset();g.state='playing';const r=g.beats.ropes[0];cross(r.z,r.x+(outside?r.halfWidth+1:0),air);const result={result:r.result,beer:g.mug.level,hits:g.beats.hits,cleared:g.beats.cleared,points:points()};
        const before=g.mug.level;cross(r.z,r.x,air);result.once=g.mug.level===before;return result;};
      const jump=ropeTest(1.6),hit=ropeTest(0),bypass=ropeTest(0,true);
      g.reset();g.state='playing';g.p.z=151;g.beats.step(.01);const flock=g.beats.flocks[0];g.time=flock.at+.6;g.beats.update();
      const birds=flock.birds.every(b=>b.visible&&b.position.toArray().every(Number.isFinite));
      const reduced=g.reducedMotion;g.reducedMotion=true;g.beats.update();const calm=flock.birds.every(b=>!b.visible);g.reducedMotion=reduced;
      g.state='paused';const events=JSON.stringify(g.beats.events);g.updateVisuals(0);const paused=JSON.stringify(g.beats.events)===events;
      g.reset();const reset=g.beats.passed===0&&g.beats.hits===0&&g.beats.events.length===0&&g.beats.ropes.every(r=>!r.done)&&g.beats.flocks.every(f=>f.at===null);
      g.state='paused';return {slalom,once,miss,highPass,jump,hit,bypass,birds,calm,paused,reset};
    });save();
    const r=report.rules;assert.equal(r.slalom.passed,3);assert.equal(r.slalom.complete,1);assert.equal(r.slalom.caps,3);assert.ok(r.slalom.points>=355&&r.once&&r.miss&&r.highPass);
    assert.ok(r.jump.result==='jump'&&r.jump.cleared===1&&r.jump.beer===1&&r.jump.points>=180);
    assert.ok(r.hit.result==='hit'&&r.hit.hits===1&&r.hit.beer===.975&&r.hit.once);
    assert.ok(r.bypass.result==='bypass'&&r.bypass.beer===1&&r.bypass.hits===0&&r.bypass.points>=70);
    assert.ok(r.birds&&r.calm&&r.paused&&r.reset);
    for(const [seed,safe] of [[42,false],[7,true],[93,false]]){
      const result=await page.evaluate((seed,safe)=>{
        const g=game;g.meta.seed=seed;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
        let spun=0;const launches=[],spills=[],activity=[],busy=[];const original=g.spill.bind(g);g.spill=(a,reason)=>{spills.push({z:g.p.z,a,reason});return original(a,reason);};
        const award=g.awardTrick.bind(g);g.awardTrick=(name,...args)=>{activity.push({time:g.time,z:g.p.z,name});return award(name,...args);};
        for(let i=0;i<120*90&&g.state==='playing';i++){
          const z=g.p.z+9,fork=g.setpiece.path(z,safe),gate=g.beats.target(z);
          const target=z<345&&fork!==null?fork:gate??fork??g.trickRoute.routePoint(z);
          g.input.target=THREE.MathUtils.clamp((target-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
          const rope=g.beats.ropes.find(r=>!r.done&&r.z-g.p.z>0&&r.z-g.p.z<21&&Math.abs(r.x-g.p.x)<r.halfWidth+.6);
          const threat=g.world.hazards.find(h=>!h.done&&h.activeAt!==null&&Math.abs(h.z-g.p.z)<12&&Math.abs(h.x-g.p.x)<1.7);
          if(!g.p.airborne&&(rope||threat)&&g.jump.cooldown===0)g.jump.press();
          if(g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;}
          const air=g.p.airborne;g.step(1/120);if(!air&&g.p.airborne)launches.push({z:g.p.z,time:g.time});
          if(i%30===0&&(g.p.airborne||g.trickRoute.riding||g.p.recovering>0||g.beats.target(g.p.z+9)!==null||
            g.rivals.some(r=>r.encounter&&r.encounter.phase!=='exit'&&Math.abs(r.z-g.p.z)<30)||
            g.world.hazards.some(h=>!h.done&&h.activeAt!==null&&Math.abs(h.z-g.p.z)<24)))busy.push({time:g.time});
        }
        g.spill=original;g.awardTrick=award;
        const allActivity=[...activity,...g.race.events.map(e=>({time:e.at})),...g.beats.events,...launches,...busy].sort((a,b)=>a.time-b.time);
        let maxGap=0,last=0;for(const a of allActivity){maxGap=Math.max(maxGap,a.time-last);last=a.time;}maxGap=Math.max(maxGap,g.elapsed-last);
        const result={seed,safe,state:g.state,beer:g.mug.level,seconds:g.elapsed,passed:g.beats.passed,slaloms:g.beats.slaloms,cleared:g.beats.cleared,hits:g.beats.hits,
          finale:g.setpiece.finaleLanded,caps:g.collected,jumps:g.jump.jumps,maxGap,spills,events:g.beats.events,activity};g.state='paused';return result;
      },seed,safe);report.runs.push(result);save();
      assert.equal(result.state,'finished');assert.ok(result.beer>=.3&&result.finale,'added actions preserve delivery and the finale');
      assert.ok(result.passed>=9&&result.slaloms>=1&&result.cleared>=1,'the full run earns optional steering and jump rewards');
      assert.ok(result.events.filter(e=>e.type==='flock').length===4,'all close fly-bys occur during the real run');
      assert.ok(result.maxGap<3.5,'there are no long action-free stretches for the active pilot');
    }
    for(const [name,width,height] of [['phone',393,852],['small',360,640],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      for(const [pose,z] of [['slalom',709],['rope',916],['gulls',484],['bar',1210]]){
        const frame=await page.evaluate((pose,z)=>{
          const g=game;g.meta.seed=42;g.reset();g.journey.hideAll();for(const id of ['start-screen','pause-screen','result-screen'])document.getElementById(id).classList.add('hidden');
          g.container.classList.add('playing');g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.input.mode='touch';g.input.render();
          g.state='paused';g.p.z=z;g.p.x=g.trickRoute.routePoint(z);g.p.speed=34;g.time=z/33;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,z);
          g.rivals.forEach(r=>{r.z=-100;r.encounter=null;});
          if(pose==='gulls'){const f=g.beats.flocks[1];f.at=g.time-1.1;}
          g.updateCamera(1,true);g.wave.update(z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
          const gateVisible=g.beats.zones.flatMap(s=>s.gates).filter(t=>t.group.visible).length,ropeVisible=g.beats.ropes.filter(r=>r.band.visible).length,birds=g.beats.flocks.flatMap(f=>f.birds).filter(b=>b.visible).length;
          const finite=g.beats.ropes.every(r=>Array.from(r.band.geometry.attributes.position.array).every(Number.isFinite));
          return {gateVisible,ropeVisible,birds,finite,overflow:document.documentElement.scrollWidth>innerWidth,drawCalls:g.renderer.info.render.calls};
        },pose,z);assert.ok(frame.finite&&!frame.overflow);if(pose==='slalom'||pose==='bar')assert.ok(frame.gateVisible>=2);if(pose==='rope')assert.equal(frame.ropeVisible,1);if(pose==='gulls')assert.equal(frame.birds,3);
        await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.hud')).opacity)>.98);
        await page.screenshot({path:path.join(dir,name+'-'+pose+'.png')});report.frames.push({name,pose,...frame});
      }
    }
    assert.deepEqual(report.errors,[]);save();console.log(JSON.stringify({rules:report.rules,runs:report.runs.map(({events,activity,spills,...r})=>r),frames:report.frames.length,errors:report.errors},null,2));
  }finally{try{await browser?.close();}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
