const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const review=path.resolve(__dirname,'../review/comics/race');fs.mkdirSync(review,{recursive:true});
  const report={errors:[],frames:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('favicon.ico'))report.errors.push(response.status()+' '+response.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();game.journey.hideAll();});
    report.run=await page.evaluate(()=>{
      const g=game,dt=1/120;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
      const samples=[],contacts=[],violations=[];let spun=0,openingJet=false,minJetLead=Infinity;
      for(let i=0;i<120*80&&g.state==='playing';i++){
        const target=g.trickRoute.routePoint(g.p.z+9);
        g.input.target=THREE.MathUtils.clamp((target-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
        const nearby=g.world.hazards.find(h=>!h.done&&h.activeAt!==null&&Math.abs(h.z-g.p.z)<12&&Math.abs(h.x-g.p.x)<1.7);
        if(!g.p.airborne&&nearby&&g.jump.cooldown===0)g.jump.press();
        if(g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;}
        g.step(dt);
        const jet=g.world.hazards.find(h=>h.type==='jetski'&&h.initialZ===310);
        if(jet.activeAt!==null&&g.elapsed<20)openingJet=true;
        if(jet.activeAt!==null&&g.time-jet.activeAt<dt*1.5)minJetLead=jet.z-g.p.z;
        if(i%60===0){
          samples.push({at:g.elapsed,z:g.p.z,speed:g.p.speed,boost:g.race.boost,beer:g.mug.level,rivals:g.rivals.filter(r=>r.encounter).map(r=>r.id)});
          for(const r of g.rivals.filter(r=>r.encounter)){
            contacts.push({id:r.id,x:r.x,gap:r.z-g.p.z,phase:r.encounter.phase,age:r.encounter.age,speed:r.speed});
            for(const line of g.trickRoute.lines.filter(l=>!l.disabled)){
              const local=g.trickRoute.local(line,r.x,r.z);
              if(local.t>.1&&local.t<.9&&Math.abs(local.across)<g.trickRoute.widthAt(line,local.t)/2+.4)violations.push({id:r.id,ramp:line.id,z:r.z});
            }
          }
        }
      }
      const result={state:g.state,seconds:g.elapsed,beer:g.mug.level,events:g.race.events.slice(),overtakes:g.race.overtakes,
        catches:g.waveRide.totalCaught,jumps:g.jump.jumps,tricks:g.jump.tricks,rushes:g.rush.activations,caps:g.collected,openingJet,minJetLead,samples,contacts,violations,score:g.score};
      g.state='paused';return result;
    });
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    assert.equal(report.run.state,'finished');assert.ok(report.run.beer>=.3,'delivery remains achievable with ordinary steering');
    assert.deepEqual(report.run.events.map(e=>e.id),['grandma','couple','dj','blonde','grandma']);
    assert.ok(report.run.events.filter(e=>e.at<20).length>=2,'the opening includes the lead rival and a tandem after landing');
    assert.ok(report.run.openingJet&&report.run.minJetLead>=22,'early crossing has a reaction window');
    assert.ok(report.run.overtakes>=2&&report.run.jumps>=3&&report.run.tricks>=2,'the run links passing, jumping and tricks');
    assert.ok(report.run.rushes>=1&&report.run.caps>=6,'the full route offers reachable pickups and earned rushes');
    assert.deepEqual(report.run.violations,[],'rival manoeuvres stay clear of physical ramps');

    report.rules=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.race.begin(g.race.scenes[0]);
      const r=g.rivals[0],intent=r.encounter.to;g.p.x=8;g.race.step(.9);const fixedIntent=r.encounter.to===intent;
      r.z=g.p.z-4;r.x=g.p.x+1.4;r.nearest=1.4;r.wasAhead=true;g.updateRivals(.01);const once=g.race.overtakes;
      g.updateRivals(.01);const duplicate=g.race.overtakes-once;
      for(let i=0;i<30;i++)g.race.step(1/120);const boost=g.race.boost;
      g.spill(.025,'Удар');const cancelled=g.race.boostTime===0;
      g.reset();g.state='playing';const jumpScene=g.race.scenes.find(e=>e.id==='dj');g.race.begin(jumpScene);
      const jumper=g.rivals[jumpScene.slot];g.p.x=jumper.x;g.p.z=jumper.z;g.p.airY=2.1;g.impactCooldown=0;g.updateRivals(.001);
      const airborneSafe=!jumper.collided&&g.mug.level===1;
      g.state='paused';const cursor=g.race.cursor,age=jumper.encounter.age;g.updateVisuals(0);
      const paused=g.race.cursor===cursor&&jumper.encounter.age===age;
      g.reset();const reset={cursor:g.race.cursor,overtakes:g.race.overtakes,boost:g.race.boost,encounters:g.rivals.filter(r=>r.encounter).length};
      const atlas=g.world.jetViews.map(view=>({bounds:view.bounds,width:view.width,height:view.height}));
      const wakeUV=g.world.hazards.filter(h=>h.type==='jetski').every(h=>h.wake.every(w=>w.geometry.attributes.uv?.count===w.geometry.attributes.position.count&&w.material.map===g.wave.foamTexture));
      return {fixedIntent,once,duplicate,boost,cancelled,airborneSafe,paused,reset,atlas,wakeUV};
    });
    assert.ok(report.rules.fixedIntent&&report.rules.once===1&&report.rules.duplicate===0&&report.rules.boost>2);
    assert.ok(report.rules.cancelled&&report.rules.airborneSafe&&report.rules.paused);
    assert.ok(report.rules.wakeUV,'the physical wake has mapped foam rather than a solid paper rail');
    assert.deepEqual(report.rules.reset,{cursor:0,overtakes:0,boost:0,encounters:0});
    assert.ok(report.rules.atlas[0].bounds.right>800&&report.rules.atlas[1].bounds.right>1600,'side views include the whole craft, beyond old equal-third boundaries');
    assert.ok(report.rules.atlas[0].width>report.rules.atlas[2].width*1.3,'atlas proportions survive UV cropping');

    for(const [name,width,height] of [['phone',393,852],['small',360,640],['landscape',844,390],['desktop',1240,900]]){
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      for(const [id,z] of [['grandma',190],['dj',325],['couple',510],['blonde',740]]){
        const frame=await page.evaluate((id,z)=>{
          const g=game;g.reset();g.state='playing';g.journey.hideAll();
          for(const id of ['start-screen','pause-screen','result-screen'])document.getElementById(id).classList.add('hidden');
          g.container.classList.add('playing');
          g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
          g.p.z=z;g.time=z/30;g.wave.time=g.time;g.p.x=0;g.p.y=g.wave.height(0,z);
          g.race.begin(g.race.scenes.find(e=>e.id===id));const r=g.rivals.find(r=>r.id===id);r.z=z+9;r.x=-2.5;r.encounter.age=1.4;g.state='paused';
          const jet=g.world.hazards.find(h=>h.type==='jetski');jet.activeAt=g.time;jet.x=4.5;jet.z=z+9;jet.motion={x:.5,z:.866};
          g.chain.add('ЧИСТЫЙ ОБГОН',110);g.updateCamera(1,true);g.wave.update(z,g.time,true);g.updateVisuals(0);g.updateHUD();g.speedBlur.render();
          const chain=document.getElementById('arcade-chain').getBoundingClientRect(),stage=g.container.getBoundingClientRect();
          return {id,inside:chain.left>=stage.left&&chain.right<=stage.right,compact:chain.width<=160,finite:r.rig.card.matrixWorld.elements.every(Number.isFinite),visible:r.rig.group.visible&&getComputedStyle(document.getElementById('result-screen')).display==='none',jetWidth:jet.jetCard.geometry.parameters.width,overflow:document.documentElement.scrollWidth>innerWidth};
        },id,z);
        assert.ok(frame.inside&&frame.compact&&frame.finite&&frame.visible&&!frame.overflow);
        await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.hud')).opacity)>.98);
        await (await page.$('#app-container')).screenshot({path:path.join(review,name+'-'+id+'.png')});report.frames.push({name,...frame});
      }
    }
    assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({state:report.run.state,seconds:report.run.seconds,beer:report.run.beer,events:report.run.events,overtakes:report.run.overtakes,jumps:report.run.jumps,tricks:report.run.tricks,rushes:report.run.rushes,caps:report.run.caps,frames:report.frames.length,errors:report.errors},null,2));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
