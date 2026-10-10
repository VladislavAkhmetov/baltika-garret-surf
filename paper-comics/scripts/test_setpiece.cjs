const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const dir=path.resolve(__dirname,'../review/comics/setpiece');fs.mkdirSync(dir,{recursive:true});
  const report={errors:[],runs:[],frames:[]};
  const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';await game.rush.ready;game.audio.stopBGM();game.journey.hideAll();});
    for(const seed of [42,7,93])for(const safe of [false,true]){
      const run=await page.evaluate((seed,safe)=>{
        const g=game;g.meta.seed=seed;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
        let spun=0,jetLead=null,oldJet=false,finalTakeoff=null;const collisions=[],rivalEvents=[],hazardEvents=[];const activated=new Set();
        const spill=g.spill.bind(g);g.spill=(a,r)=>{collisions.push({z:g.p.z,reason:r,amount:a});return spill(a,r);};
        const begin=g.race.begin.bind(g.race);g.race.begin=s=>{rivalEvents.push({id:s.id,z:g.p.z,time:g.time,air:g.p.airborne,sinceLanding:g.time-(g.setpiece.landingAt??-100)});return begin(s);};
        for(let i=0;i<120*80&&g.state==='playing';i++){
          const desired=g.setpiece.path(g.p.z+9,safe)??g.trickRoute.routePoint(g.p.z+9);
          g.input.target=THREE.MathUtils.clamp((desired-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
          const threat=g.world.hazards.find(h=>!h.done&&h.activeAt!==null&&Math.abs(h.z-g.p.z)<12&&Math.abs(h.x-g.p.x)<1.7);
          if(!g.p.airborne&&threat&&g.jump.cooldown===0)g.jump.press();
          if(g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;}
          g.step(1/120);
          for(const h of g.world.hazards)if(h.activeAt!==null&&!activated.has(h.index)){
            activated.add(h.index);hazardEvents.push({type:h.type,at:h.activeAt,z:g.p.z});
          }
          const jet=g.world.hazards.find(h=>h.type==='jetski'&&h.initialZ===310);
          if(jet.activeAt!==null&&!oldJet){oldJet=true;jetLead={z:g.p.z,seconds:(jet.z-g.p.z)/Math.max(1,g.p.speed-jet.forwardSpeed)};}
          if(g.jump.takeoffRamp?.finale&&!finalTakeoff)finalTakeoff={z:g.p.z,time:g.time};
        }
        g.spill=spill;g.race.begin=begin;g.state='paused';
        return {seed,safe,finish:g.p.z>=g.distance,beer:g.mug.level,seconds:g.elapsed,choice:g.setpiece.choice,hits:g.setpiece.hits,riskRewarded:g.setpiece.riskRewarded,
          caps:g.collected,rushes:g.rush.activations,events:g.setpiece.events,rivalEvents,hazardEvents,jetLead,finalTakeoff,finalLanded:g.setpiece.finaleLanded,collisions};
      },seed,safe);
      report.runs.push(run);save();
      assert.ok(run.finish&&run.beer>=.3,'both paths permit delivery');
      assert.equal(run.choice,safe?'wide':'risk');assert.equal(run.hits,0,'authored paths clear actual rock footprints');assert.equal(run.riskRewarded,!safe);
      assert.ok(run.jetLead.z>=343&&run.jetLead.seconds>=1.6,'crossing waits for fork exit and gives reaction time');
      const couple=run.rivalEvents.find(r=>r.id==='couple');assert.ok(couple&&!couple.air&&couple.sinceLanding>=.45,'tandem enters after landing');
      assert.ok(run.finalTakeoff&&run.finalLanded,'last wave offers a real launch and landing before the bar');
      assert.ok(run.rivalEvents.every((e,i,a)=>i===0||e.time-a[i-1].time>=2.8),'delayed encounters stay spaced');
      assert.ok(run.hazardEvents.every((e,i,a)=>i===0||e.at-a[i-1].at>=2.5),'hazards cannot start together');
      assert.ok(run.hazardEvents.every(e=>e.z<1081)&&run.rivalEvents.every(e=>e.z<1061),'the finale receives no new attackers');
      const landing=run.events.find(e=>e.type==='final-landing');
      assert.ok(run.seconds-landing.time>=1.8,'the final landing has a quiet run-in before the result');
    }
    report.rules=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.p.x=-1.5;g.p.z=314;g.p.y=1;g.setpiece.step();
      const hit={beer:g.mug.level,hits:g.setpiece.hits,x:g.p.x};for(let i=0;i<20;i++)g.setpiece.step();const once=g.setpiece.hits===1&&g.mug.level===hit.beer;
      g.p.z=341;g.setpiece.step();const noReward=!g.setpiece.riskRewarded;
      g.reset();g.state='playing';const reef=g.setpiece.rocks.find(r=>r.reef);
      g.p.x=reef.x;g.p.z=reef.z;g.p.y=reef.mesh.position.y;g.setpiece.step();
      const reefHit={beer:g.mug.level,hits:g.setpiece.hits,x:g.p.x,event:g.setpiece.events.some(e=>e.type==='reef-hit')};
      for(let i=0;i<20;i++)g.setpiece.step();const reefOnce=g.setpiece.hits===1&&g.mug.level===reefHit.beer;
      g.reset();g.state='playing';g.p.x=reef.x;g.p.z=reef.z;g.p.y=reef.mesh.position.y+reef.mesh.scale.y+.6;g.setpiece.step();
      const aboveReef=g.setpiece.hits===0&&g.mug.level===1;
      g.reset();g.state='paused';const before=JSON.stringify(g.setpiece.events);g.updateVisuals(0);const pause=JSON.stringify(g.setpiece.events)===before;
      const reset=g.setpiece.choice===null&&!g.setpiece.resolved&&g.setpiece.hits===0&&g.setpiece.rocks.every(r=>!r.hit);
      g.state='playing';g.p.z=1190;g.chase.end('finish');g.chase.onMistake(.08);const quiet=!g.chase.active;g.state='paused';
      return {hit,once,noReward,reefHit,reefOnce,aboveReef,pause,reset,quiet};
    });save();
    assert.ok(report.rules.hit.hits===1&&report.rules.hit.beer<1&&report.rules.once&&report.rules.noReward&&report.rules.pause&&report.rules.reset&&report.rules.quiet);
    assert.ok(report.rules.reefHit.beer===.96&&report.rules.reefHit.hits===1&&report.rules.reefHit.event&&report.rules.reefHit.x<8.9&&report.rules.reefOnce&&report.rules.aboveReef);
    for(const [name,width,height] of [['phone',393,852],['small',360,640],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      for(const [pose,z,x] of [['choice',272,-2.7],['narrow',307,-5.95],['cliffs',438,null],['reefs',617,null],['reef-exit',803,null],['finale',1092,0]]){
        await page.evaluate((z,x)=>{
          const g=game;g.meta.seed=42;g.reset();g.journey.hideAll();for(const id of ['start-screen','pause-screen','result-screen'])document.getElementById(id).classList.add('hidden');
          g.container.classList.add('playing');g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.input.mode='touch';g.input.render();
          x=x??g.trickRoute.routePoint(z);
          g.state='paused';g.p.z=z;g.p.x=x;g.time=z/33;g.wave.time=g.time;g.p.y=g.wave.height(x,z);g.p.speed=34;
          g.rivals.forEach(r=>{r.z=-100;r.encounter=null;});g.updateCamera(1,true);g.wave.update(z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
        },z,x);
        await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.hud')).opacity)>.98);
        await page.screenshot({path:path.join(dir,name+'-'+pose+'.png')});report.frames.push({name,pose});
      }
    }
    assert.deepEqual(report.errors,[]);save();console.log(JSON.stringify({runs:report.runs.map(r=>({seed:r.seed,path:r.choice,seconds:r.seconds,beer:r.beer,hits:r.hits,rushes:r.rushes,jet:r.jetLead,finalLanded:r.finalLanded})),rules:report.rules,frames:report.frames.length,errors:report.errors},null,2));
  }finally{try{await browser?.close();}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
