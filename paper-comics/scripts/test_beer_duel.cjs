const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const dir=path.resolve(__dirname,'../review/comics/beer-duel');fs.mkdirSync(dir,{recursive:true});
  const report={errors:[],frames:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();});
    report.run=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;let spun=0;
      const samples=[];
      for(let i=0;i<120*90&&g.state==='playing';i++){
        const x=g.trickRoute.routePoint(g.p.z+9);g.input.target=THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
        const surface=g.wave.sample(g.p.x,g.p.z),padAhead=g.rush.accelerators.some(pad=>!pad.done&&pad.z-g.p.z>0&&pad.z-g.p.z<35);
        if(!g.p.airborne&&!padAhead&&surface.wave&&surface.energy>.55&&surface.crest>.65)g.jump.press();
        if(g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;}g.step(1/120);
        if(i%120===0)samples.push({z:g.p.z,gap:g.duel.boris.z-g.p.z,max:g.mug.level,boris:g.duel.liquid.level});
      }
      const result={state:g.state,seconds:g.elapsed,result:g.duel.result,spilled:g.duel.liquid.totalSpilled,borisArrived:g.duel.arrived,
        otherRivals:g.rivals.filter(r=>r.encounter).length,jetskis:g.world.hazards.filter(h=>h.type==='jetski').length,samples};
      g.courseShow.endDelivery();g.state='paused';return result;
    });
    fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2));
    assert.equal(report.run.state,'finished');assert.ok(report.run.spilled>0);
    assert.equal(report.run.otherRivals,0);assert.equal(report.run.jetskis,1);assert.ok(report.run.samples.every(s=>Number.isFinite(s.boris)&&Number.isFinite(s.gap)));
    report.passive=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
      for(let i=0;i<120*90&&g.state==='playing';i++){g.input.target=0;g.step(1/120);}
      const result={state:g.state,seconds:g.elapsed,result:g.duel.result,falls:g.balance.falls};g.courseShow.endDelivery();g.state='paused';return result;
    });
    assert.equal(report.passive.state,'finished');assert.equal(report.passive.result.outcome,'defeat','passive straight driving does not win the race');
    report.pace=await page.evaluate(()=>{
      const g=game,results=[],originalSeed=g.meta.seed;
      for(const seed of [42,123,2026,9593])for(const style of seed===42?['route','ramps','expert','fall']:['route','ramps','expert']){
        g.meta.seed=seed;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
        let spun=0,fell=false;
        for(let i=0;i<120*90&&g.state==='playing';i++){
          const z=g.p.z+(style==='expert'?16:9);let x=g.trickRoute.routePoint(z);
          if(style==='expert'&&z<194){
            // A real input-only line earns close-pass rewards without changing physics.
            const points=[[0,1.4],[35,-1.6],[70,-.65],[105,.55],[115,.55],[150,-.65],[160,-.65],[194,.8]];
            const at=Math.max(0,points.findIndex(p=>p[0]>=z)-1),a=points[at],b=points[at+1];
            x=THREE.MathUtils.lerp(a[1],b[1],g.wave.smooth((z-a[0])/(b[0]-a[0])));
          }
          g.input.target=THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
          if(['expert','fall'].includes(style)){
            const [energy,crest,clearance]=style==='expert'?[.45,.5,45]:[.4,.4,65];
            const surface=g.wave.sample(g.p.x,g.p.z),padAhead=g.rush.accelerators.some(pad=>!pad.done&&pad.z-g.p.z>0&&pad.z-g.p.z<clearance);
            if(!g.p.airborne&&!padAhead&&surface.wave&&surface.energy>energy&&surface.crest>crest)g.jump.press();
          }
          if(style!=='route'&&g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;}
          if(style==='fall'&&!fell&&g.p.z>=700&&!g.p.airborne){g.balance.fall();fell=true;}
          g.step(1/120);
        }
        results.push({seed,style,state:g.state,place:g.duel.result?.place,seconds:g.elapsed,finishGap:g.p.z-g.duel.boris.z,falls:g.balance.falls,tricks:g.jump.tricks,pads:g.rush.padHits});
        g.courseShow.endDelivery();g.state='paused';
      }
      g.meta.seed=originalSeed;g.reset();g.state='paused';return results;
    });
    fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2));
    assert.ok(report.pace.every(r=>r.state==='finished'));
    const expert=report.pace.filter(r=>r.style==='expert');
    assert.ok(expert.some(r=>r.place===1),'close passes, clean tricks and accelerators can beat Boris');
    assert.ok(expert.every(r=>r.place===1),'clean tricks, close passes and accelerators consistently reward the active driver');
    assert.ok(expert.every(r=>r.seconds<report.pace.find(p=>p.seed===r.seed&&p.style==='route').seconds-.35),'active riding saves time on every tested wave set');
    assert.ok(report.pace.filter(r=>r.style==='route').every(r=>r.place===2),'following the route without tricks is no longer enough to win');
    assert.ok(report.pace.filter(r=>r.style==='ramps').every(r=>r.place===2),'ramp tricks alone do not guarantee victory');
    assert.ok(report.pace.filter(r=>r.style==='fall').every(r=>r.place===2),'a mid-course fall gives Boris a real chance to win');
    report.rules=await page.evaluate(()=>{
      const g=game,results=[];
      for(const [max,boris,borisTime] of [[.2,.9,null],[1,.1,39],[0,1,null],[0,0,39],[.5,.9,40],[.705,.704,null]]){
        g.reset();g.state='playing';g.elapsed=40;g.p.z=g.distance;g.mug.level=max;g.duel.liquid.level=boris;
        if(borisTime!==null){g.duel.arrived=true;g.duel.arrivalTime=borisTime;g.duel.deliveredBeer=boris;}
        g.score=1234;
        g.finish();g.courseShow.endDelivery();const score=g.score;g.finish();
        results.push({outcome:g.duel.result.outcome,place:g.duel.result.place,dataset:document.getElementById('result-screen').dataset.outcome,
          max:document.getElementById('result-beer').textContent,bonus:g.deliveryBonus,base:g.raceScore,score,
          bonusLabel:document.getElementById('result-beer-bonus').textContent,stable:g.score===score});
      }
      g.reset();g.state='playing';g.p.z=g.distance;g.mug.level=.66;g.duel.boris.z=g.distance-20;g.duel.liquid.level=.55;
      g.finish();const settled=g.duel.result,noFastForward=!g.duel.arrived&&g.duel.boris.z===g.distance-20;
      const snapshot={clock:g.duel.clock,beer:g.duel.liquid.level,z:g.duel.boris.z};g.duel.step(1);g.updateVisuals(0);
      const freezes=JSON.stringify(snapshot)===JSON.stringify({clock:g.duel.clock,beer:g.duel.liquid.level,z:g.duel.boris.z});
      g.courseShow.endDelivery();g.reset();g.state='playing';g.duel.boris.z=g.distance-.05;g.duel.advance(1/120);
      const delivered=g.duel.deliveredBeer;g.duel.advance(4);const earlyArrivalFrozen=g.duel.arrived&&g.duel.deliveredBeer===delivered;
      const independent=[];
      for(const speed of [18,42]){
        g.reset();g.p.speed=speed;g.p.z=speed===18?0:900;
        for(let i=0;i<1200;i++){g.time=(i+1)/120;g.wave.time=g.time;g.duel.advance(1/120);}
        independent.push({z:g.duel.boris.z,speed:g.duel.boris.speed,beer:g.duel.liquid.level});
      }
      const crossings=[];
      for(const [maxLeft,borisLeft] of [[.1,.01],[.01,.1]]){
        g.reset();g.state='playing';g.elapsed=g.time=g.duel.clock=10;g.p.z=g.distance-maxLeft;g.p.speed=38;g.duel.boris.z=g.distance-borisLeft;g.duel.boris.speed=35;
        g.step(1/120);crossings.push(g.duel.result);g.courseShow.endDelivery();
      }
      g.reset();g.state='playing';g.balance.fall('ТЕСТ');const fallZ=g.duel.boris.z;g.step(1/120);const duringFall=g.duel.boris.z>fallZ;
      g.reset();g.state='playing';g.duel.boris.x=g.p.x;g.duel.boris.z=g.p.z;g.duel.step(1/120);
      const contact={max:g.mug.level,boris:g.duel.liquid.level};g.duel.step(1/120);const once=g.mug.level===contact.max;
      g.state='paused';const pausedClock=g.duel.clock;g.updateVisuals(0);const paused=g.duel.clock===pausedClock;
      g.reset();const reset=g.duel.liquid.level===1&&g.duel.result===null&&!g.duel.arrived&&g.duel.arrivalTime===null&&g.duel.boris.z===0&&g.deliveryBonus===0;
      return {results,settled,noFastForward,freezes,earlyArrivalFrozen,independent,crossings,duringFall,contact,once,paused,reset};
    });
    assert.deepEqual(report.rules.results.map(r=>r.outcome),['victory','defeat','victory','defeat','tie','victory']);
    assert.deepEqual(report.rules.results.map(r=>r.bonus),[1000,5000,0,0,2500,3550]);
    assert.ok(report.rules.results.every(r=>r.base===1234&&r.score===1234+r.bonus));
    assert.ok(report.rules.results.every(r=>r.stable&&r.dataset===r.outcome));
    assert.ok(report.rules.noFastForward&&report.rules.freezes&&report.rules.earlyArrivalFrozen&&report.rules.once&&report.rules.paused&&report.rules.reset&&report.rules.duringFall);
    assert.deepEqual(report.rules.independent[0],report.rules.independent[1],'Boris does not adapt to the player pace or position');
    assert.deepEqual(report.rules.crossings.map(r=>r.outcome),['defeat','victory']);
    assert.ok(report.rules.crossings.every(r=>r.maxTime>10&&r.maxTime<10+1/120&&r.borisTime>10&&r.borisTime<10+1/120),'both crossings are timed inside the step');
    assert.ok(report.rules.contact.max<=.9&&report.rules.contact.boris<=.9,'a collision spills both glasses');
    for(const [name,width,height,mobile] of [['phone',393,852,true],['small',360,640,true],['landscape',844,390,true],['desktop',1240,900,false]]){
      await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile});
      await page.evaluate(()=>{
        const g=game;g.reset();g.state='paused';g.journey.hideAll();['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
        g.container.classList.add('playing');g.p.z=450;g.p.x=0;g.time=16;g.wave.time=16;g.p.y=g.wave.height(0,450);
        g.duel.boris.x=-3;g.duel.boris.z=458;g.duel.liquid.level=.62;g.mug.level=.78;
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.input.mode='touch';g.input.render();
        g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
      });
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      const layout=await page.evaluate(()=>{
        const stage=game.container.getBoundingClientRect(),nodes=[document.querySelector('.beer-ticket'),document.querySelector('.duel-ticket')],tickets=nodes.map(el=>el.getBoundingClientRect());
        const glass=game.duel.glass.getWorldPosition(new THREE.Vector3()).project(game.camera);
        const uncovered=nodes.every(node=>{const value=node.querySelector('strong'),r=value.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&node.contains(hit);});
        return {inside:tickets.every(r=>r.left>=stage.left&&r.right<=stage.right&&r.bottom<stage.top+130),separate:tickets[0].right<tickets[1].left,
          uncovered,
          visible:game.duel.boris.group.visible&&game.duel.glass.visible&&Math.abs(glass.x)<1&&Math.abs(glass.y)<1,
          overflow:document.documentElement.scrollWidth>innerWidth};
      });assert.ok(layout.inside&&layout.separate&&layout.visible&&layout.uncovered&&!layout.overflow,name+' readable beer and race position');
      await page.screenshot({path:path.join(dir,name+'-race.png')});report.frames.push({name,...layout});
      await page.evaluate(()=>{game.state='playing';game.p.z=game.distance;game.finish();game.courseShow.endDelivery();});
      const fits=await page.evaluate(()=>{const stage=game.container.getBoundingClientRect(),cta=document.getElementById('replay-button').getBoundingClientRect(),bonus=document.getElementById('result-beer-bonus').getBoundingClientRect();return cta.top>=stage.top&&cta.bottom<=stage.bottom&&bonus.right<=stage.right&&bonus.left>=stage.left;});
      assert.ok(fits,name+' result CTA fits');await page.screenshot({path:path.join(dir,name+'-result.png')});
    }
    assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({result:report.run.result,seconds:report.run.seconds,passive:report.passive,pace:report.pace,spilled:report.run.spilled,rules:report.rules,viewports:report.frames.length,errors:report.errors},null,2));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
