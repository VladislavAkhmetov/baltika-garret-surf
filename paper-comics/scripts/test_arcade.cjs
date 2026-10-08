const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port,review=path.resolve(__dirname,'../review/comics/arcade');fs.mkdirSync(review,{recursive:true});
  let browser;const errors=[],report={};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.evaluateOnNewDocument(()=>{
      window.arcadeSetup=(face=.34)=>{
        const g=game;g.reset();g.wave.resetWaves(42);g.state='playing';g.assist=true;
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.comics.trigger=()=>false;
        g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);
        const w=g.wave.waves.filter(w=>w.height>=2.6&&w.anchorFrom>230).sort((a,b)=>a.anchorFrom-b.anchorFrom)[0];
        g.time=w.peelOriginTime;g.wave.time=g.time;g.p.z=g.wave.frontAt(w).z+12;g.p.x=g.wave.crestX(w,g.p.z)+w.width*face;
        g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=28;g.waveRide.charge=1;g.balance.immunity=0;g.impactCooldown=0;
        g.chase.reset();g.chase.begin(w);
        return w;
      };
    });
    await page.goto(base,{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{localStorage.clear();await game.start(false);game.state='paused';});

    report.chase=await page.evaluate(()=>{
      const g=game,dt=1/120,w=arcadeSetup();
      let begun=false;for(let i=0;i<40&&!begun;i++){g.step(dt);begun=g.chase.active;}
      const start={active:g.chase.active,wave:g.chase.wave?.id,expected:w.id,gap:g.chase.gap};
      w.peelOriginZ+=g.p.z-4-g.wave.frontAt(w).z;g.step(dt);
      const pocket={level:g.chase.level,mult:g.chase.multiplier,chain:g.chain.count,points:g.chain.points,peel:g.wave.peelFront?.id===g.chase.wave.id};
      const breakingAtRider=g.wave.breaking(g.chase.wave,g.p.z),breakingAhead=g.wave.breaking(g.chase.wave,g.p.z+30);
      const gain=g.awardTrick('ТЕСТ',100,true);
      const doubled=g.chain.points-pocket.points;
      g.balance.immunity=0;g.impactCooldown=0;w.peelOriginZ+=g.p.z-.4-g.wave.frontAt(w).z;g.step(dt);
      const wipe={wipes:g.chase.wipes,active:g.chase.active,chain:g.chain.count,beer:g.mug.level,burned:g.chain.burned};
      g.state='paused';return {start,pocket,breakingAtRider,breakingAhead,gain,doubled,wipe};
    });
    const c=report.chase;
    assert.equal(c.start.active,true,'an explicitly started physical wave chase tracks the intended wave');assert.equal(c.start.wave,c.start.expected);
    assert.deepEqual([c.pocket.level,c.pocket.mult,c.pocket.peel],[2,2,true],'a 4 m gap is the ×2 pocket and the wave peels from the front');
    assert.ok(c.pocket.chain>=1&&c.pocket.points>0,'pocket riding feeds the chain');
    assert.ok(c.breakingAtRider>.3&&c.breakingAhead===0,'the curl reaches the rider while the shoulder ahead stays open');
    assert.ok(c.doubled>=199,'pocket ×2 doubles a trick added to the chain');
    assert.equal(c.wipe.wipes,1);assert.equal(c.wipe.active,false);assert.equal(c.wipe.chain,0);assert.ok(c.wipe.beer<1&&c.wipe.burned>=1,'foam wipeout burns the chain and spills beer');

    report.chain=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);
      g.awardTrick('А',100,true);g.awardTrick('Б',200,true);
      const pending={score:g.score,count:g.chain.count,value:g.chain.value,mult:g.mug.multiplier};
      g.p.airborne=true;g.chain.step(3);const heldInAir=g.chain.count;g.p.airborne=false;
      g.chain.step(2.7);const banked=g.score;
      g.awardTrick('В',500,true);g.spill(.02,'тест');const small={score:g.score,count:g.chain.count,points:g.chain.points};
      g.spill(.10,'УДАР');const burned={score:g.score,count:g.chain.count,lost:g.chain.burned};
      g.awardTrick('Г',100,true);const before=g.score;g.mug.level=.8;const finishMult=g.mug.multiplier;g.finish();const finishBank=g.score-before;
      g.state='paused';return {pending,heldInAir,banked,small,burned,finishBank,finishMult,delivery:g.deliveryBonus};
    });
    const k=report.chain;
    assert.deepEqual(k.pending,{score:0,count:2,value:600,mult:3},'tricks wait in the chain: (100+200)×2');
    assert.equal(k.heldInAir,2,'the chain clock stops in the air');
    assert.equal(k.banked,600,'trick scores are independent of the delivery multiplier');
    assert.deepEqual(k.small,{score:600,count:1,points:500},'a small spill retains pending points');
    assert.deepEqual(k.burned,{score:600,count:0,lost:1},'an impact burns the unbanked chain');
    assert.equal(k.finishBank,100+k.delivery,'finish banks the open chain before the separate delivery bonus');

    report.near=await page.evaluate(()=>{
      const g=game,dt=1/120;g.reset();g.wave.resetWaves(42);g.state='playing';g.comics.trigger=()=>false;
      g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.rivals.forEach(r=>r.collided=true);
      const [b1,b2]=g.world.hazards.filter(h=>h.type==='buoy');g.world.hazards.forEach(h=>{if(h!==b1&&h!==b2)h.done=true;});
      g.p.x=0;g.p.z=2;g.p.y=g.wave.height(0,2);g.p.speed=24;g.balance.immunity=9;
      b1.x=1.35;b1.z=16;b2.x=0;b2.z=40;
      for(let i=0;i<220&&g.p.z<22;i++){g.input.lean=0;g.step(dt);}
      const ground={near:g.chain.nearMisses,seen:g.tricksSeen.has('ВПРИТЫК!'),hit:b1.hit,x:g.p.x};
      b2.x=g.p.x;g.impactCooldown=0;
      while(g.p.z<33)g.step(dt);
      g.jump.press();g.step(dt);g.p.jumpVelocity=10;
      for(let i=0;i<300&&g.p.airborne;i++)g.step(dt);
      const air={seen:g.tricksSeen.has('НАД БУЕМ!'),hit:b2.hit};
      g.state='paused';return {ground,air};
    });
    assert.equal(report.near.ground.hit,false);assert.ok(report.near.ground.near>=1&&report.near.ground.seen,'passing a buoy within 2 m is a near-miss');
    assert.equal(report.near.air.hit,false);assert.equal(report.near.air.seen,true,'jumping over a buoy scores НАД БУЕМ');

    report.juice=await page.evaluate(()=>{
      const g=game,j=g.juice;g.reset();g.state='playing';
      j.hitstop(.1);const stops=[j.consumeStop(.05),j.consumeStop(.05),j.consumeStop(.05)];
      j.setLiveCamera(true);g.p.speed=34;j.punch(6);for(let i=0;i<30;i++)g.updateCamera(1/60);const fov=g.camera.fov;
      g.p.smoothLean=1;for(let i=0;i<120;i++)g.updateCamera(1/60);const roll=Math.abs(j.roll);
      g.p.airborne=true;for(let i=0;i<180;i++)g.updateCamera(1/60);const airRoll=Math.abs(j.roll);g.p.airborne=false;
      j.setLiveCamera(false);g.updateCamera(1/60);const calm={fov:g.camera.fov,roll:j.roll};j.setLiveCamera(true);
      j.pop('ВЖУХ!',g.p.x,g.p.y+2,g.p.z+6,'near');j.update(.016);const word=document.querySelector('.sfx-word.visible');
      g.state='paused';return {stops,fov,roll,airRoll,calm,word:word?.textContent,left:parseFloat(word?.style.left||'NaN')};
    });
    const u=report.juice;
    assert.deepEqual(u.stops,[true,true,false],'hit-stop lasts its duration');
    assert.ok(u.fov>60&&u.fov<=70,'speed and kick widen the FOV within 70°');
    assert.ok(u.roll>.03&&u.roll<=.0561,'carving rolls the camera up to 3.2°');assert.ok(u.airRoll<.002,'the horizon levels in the air');
    assert.deepEqual(u.calm,{fov:58,roll:0},'calm camera keeps the old fixed view');
    assert.equal(u.word,'ВЖУХ!');assert.ok(u.left>0&&u.left<393,'sound word is projected onto the screen');

    report.meta=await page.evaluate(()=>{
      const g=game,dt=1/120;localStorage.removeItem('garret_comics_arcade_v1');g.meta.data=g.meta.load();g.meta.ensureMissions();
      g.reset();g.state='playing';g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);
      for(let i=0;i<240;i++)g.step(dt);
      const missions=g.meta.missions.map(m=>m.id);g.jump.tricks=1;g.meta.step(.3);const toast=document.getElementById('chain-toast').textContent;
      g.score=12000;g.mug.level=.75;g.finish();const s=g.meta.summary;
      const stored=JSON.parse(localStorage.getItem('garret_comics_arcade_v1'));
      const resultMissions=[...document.querySelectorAll('#result-missions li')].map(li=>({text:li.textContent,done:li.classList.contains('done')}));
      g.reset();g.state='playing';g.elapsed=1;g.p.z=0;g.meta.updateGhost(0);
      const ghost={samples:g.meta.ghost?.length||0,visible:g.meta.ghostRig.group.visible};
      g.state='paused';g.renderMenuMeta();const quickBefore=!document.getElementById('quick-button').classList.contains('hidden');
      g.meta.markStorySeen();g.renderMenuMeta();
      return {missions,toast,record:s.record,stars:s.stars,resultMissions,recordText:document.getElementById('result-record').textContent,
        stored:{best:stored.best.score,daily:stored.daily.score,seed:stored.daily.seed,active:stored.missions.active,done:stored.missions.done},ghost,
        quickBefore,quick:!document.getElementById('quick-button').classList.contains('hidden'),daily:document.getElementById('daily-label').textContent,seed:g.meta.seed};
    });
    const m=report.meta;
    assert.equal(m.missions.length,3);assert.match(m.toast,/ЗАДАНИЕ ✓/);
    assert.equal(m.record,true);assert.ok(m.stored.best>=12000&&m.stored.daily===m.stored.best&&m.stored.seed===m.seed);
    assert.ok(m.stars>=2,'360° and 70% missions give stars');assert.ok(m.stored.done.includes('spin')&&!m.stored.active.includes('spin')&&m.stored.active.length===3,'completed missions are replaced');
    assert.equal(m.resultMissions.length,3);assert.ok(m.resultMissions.filter(x=>x.done).length>=2);assert.equal(m.recordText,'НОВЫЙ РЕКОРД!');
    assert.ok(m.ghost.samples>20&&m.ghost.visible,'the daily best plays back as a ghost');
    assert.equal(m.quickBefore,false);assert.equal(m.quick,true,'quick start appears after the story was seen');assert.match(m.daily,/ВОЛНА ДНЯ/);

    report.comic=await page.evaluate(async()=>{
      const g=game;g.reset();g.wave.resetWaves(42);g.state='playing';g.p.z=300;g.p.x=-2;g.time=12;g.wave.time=12;g.p.y=g.wave.height(g.p.x,g.p.z);g.updateCamera(1,true);
      for(const [kind,word,caption,priority] of [['flip','БАМ!','ПЕРЕВОРОТ С КРУЖКОЙ',92],['near','ВЖУХ!','ВПРИТЫК!',52],['pocket','ШШУХ!','В КАРМАНЕ ×2',72],['opening','ПОГНАЛИ!','',5]]){
        g.runComic.capture(kind,word,caption,priority);g.p.z+=9;g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.renderer.render(g.scene,g.camera);g.runComic.flush();g.elapsed+=4;
      }
      g.score=28940;g.mug.level=.62;g.state='paused';g.finish();
      const picked=g.runComic.pick().map(s=>s.kind);const card=await g.runComic.compose();
      return {picked,score:Math.round(g.score),width:card.width,height:card.height,blob:g.runComic.blob?.size||0,link:g.runComic.challengeLink(),data:card.toDataURL('image/png')};
    });
    fs.writeFileSync(path.join(review,'run-comic.png'),Buffer.from(report.comic.data.split(',')[1],'base64'));delete report.comic.data;
    assert.deepEqual(report.comic.picked,['flip','near','pocket'],'the strongest moment leads, two more follow in ride order');
    assert.deepEqual([report.comic.width,report.comic.height],[1080,1350]);assert.ok(report.comic.blob>40000,'comic page is a real PNG');
    assert.ok(report.comic.link.includes('vs='+report.comic.score),'challenge link carries the final score');assert.match(report.comic.link,/seed=\d+/);

    for(const [name,width,height,mobile] of [['mobile',393,852,true],['small',360,640,true],['landscape',844,390,true],['desktop',1240,900,false]]){
      await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile});
      await page.evaluate(async()=>{await game.start(false);game.state='paused';});
      await page.evaluate(()=>{
        const g=game,dt=1/120;arcadeSetup();g.juice.setLiveCamera(true);g.updateCamera(1,true);
        for(let i=0;i<40&&!g.chase.active;i++)g.step(dt);
        g.awardTrick('КАРВИНГ',100,true);g.awardTrick('360°',600,true);
        g.chase.z=g.p.z-4.5;g.balance.immunity=5;
        for(let i=0;i<36;i++){g.step(dt);g.updateCamera(dt);g.updateVisuals(dt);}
        g.state='paused';g.wave.update(g.p.z,g.time,true);g.updateHUD();g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
      });
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      const ride=await page.evaluate(()=>{const r=document.getElementById('arcade-chain').getBoundingClientRect(),s=game.container.getBoundingClientRect(),jump=document.getElementById('jump-button').getBoundingClientRect();
        const overlap=(a,b)=>!(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom);
        const callout=document.querySelector('.crab-callout.visible:not(.offscreen)'),speech=callout?.getBoundingClientRect();
        return {inside:r.left>=s.left-1&&r.right<=s.right+1&&r.bottom<=s.bottom,overlapJump:overlap(r,jump),overlapCrab:!!speech&&overlap(r,speech),chasing:document.getElementById('arcade-chain').classList.contains('chasing'),level:game.chase.level};});
      await page.screenshot({path:path.join(review,name+'-pocket.png')});
      assert.ok(ride.inside&&!ride.overlapJump&&!ride.overlapCrab&&ride.chasing,name+': chain HUD fits and clears the jump button '+JSON.stringify(ride));
      const result=await page.evaluate(()=>{
        const g=game;g.state='paused';g.score=31250;g.mug.level=.66;g.finish();
        const card=document.querySelector('.result-card'),c=card.getBoundingClientRect(),b=document.getElementById('replay-button').getBoundingClientRect(),share=document.getElementById('comic-button').getBoundingClientRect();
        return {fits:b.bottom<=c.bottom&&b.right<=c.right,shareFits:share.bottom<=c.bottom&&share.top>=c.top,scroll:card.scrollHeight>card.clientHeight+1};
      });
      await page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      await page.screenshot({path:path.join(review,name+'-result.png')});
      assert.ok(result.fits&&result.shareFits,name+': result actions fit '+JSON.stringify(result));assert.equal(result.scroll,false,name+': result card does not scroll');
      await page.click('#comic-button');await page.waitForFunction(()=>document.getElementById('share-image').complete&&document.getElementById('share-image').naturalWidth>0);
      const share=await page.evaluate(()=>{const c=document.querySelector('.share-card').getBoundingClientRect(),s=game.container.getBoundingClientRect(),b=document.getElementById('share-button').getBoundingClientRect();return {fits:c.top>=s.top-1&&c.bottom<=s.bottom+1,button:b.bottom<=s.bottom};});
      await page.screenshot({path:path.join(review,name+'-share.png')});
      assert.ok(share.fits&&share.button,name+': share card fits '+JSON.stringify(share));
      await page.click('#share-close');
    }

    const challenge=await browser.newPage();challenge.on('pageerror',e=>errors.push(e.message));
    await challenge.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await challenge.goto(base+'/?vs=5000&seed=77',{waitUntil:'networkidle0'});
    report.challenge=await challenge.evaluate(async()=>{
      await game.start(false);const g=game,seeded=g.wave.seed;g.state='paused';g.score=6000;g.finish();
      return {seed:g.meta.seed,seeded,vs:g.meta.challenge,text:document.getElementById('result-record').textContent};
    });
    assert.deepEqual([report.challenge.seed,report.challenge.seeded,report.challenge.vs],[77,77,5000]);assert.match(report.challenge.text,/ПОБИТ/);

    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({report,errors},null,2));
    assert.deepEqual(errors,[]);
    console.log('PASS: foam chase and pocket, chain banking and burning, near-misses, juice, daily meta and ghost, run comic, four layouts, challenge link.');
  }finally{await browser?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
