const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const review=path.resolve(__dirname,'../review/comics/danger-cues');fs.mkdirSync(review,{recursive:true});
  const errors=[],report={};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';});
    report.trimRecovery=await page.evaluate(()=>{
      const g=game;g.assist=true;g.reset();g.input.mode='keys';g.balance.disturb(.34,'УДАР ОБ БУЙ');
      dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowDown',bubbles:true}));
      let falling=null;
      for(let i=0;i<720;i++){
        g.input.update(1/120);g.p.lean=g.input.lean;g.p.pitch=g.input.pitch;
        g.balance.step(1/120,{zone:'flat',energy:0},0,0);
        if(g.p.fallen){falling={seconds:(i+1)/120,roll:g.balance.roll,risk:g.p.balance,pitch:g.p.pitch,reason:g.balance.reason};break;}
      }
      dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowDown',bubbles:true}));
      g.state='paused';return {falling,mode:g.balance.mode,saves:g.balance.saves};
    });
    assert.equal(report.trimRecovery.falling,null,'a level board cannot fall just because weight trim is held');
    assert.deepEqual([report.trimRecovery.mode,report.trimRecovery.saves],['stable',1]);
    report.passedFoam=await page.evaluate(()=>{
      const g=game,results=[];
      for(const protection of ['air','immunity','collision']){
        g.assist=true;g.reset();const w=g.wave.waves.find(w=>w.height>=2.6&&w.anchorFrom>230);
        g.time=w.peelOriginTime;g.wave.time=g.time;g.p.z=g.wave.frontAt(w).z+12;g.p.x=g.wave.crestX(w,g.p.z)+w.width*.32;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=28;
        g.chase.taught=true;g.chase.begin(w);w.peelOriginZ+=g.p.z-.4-g.wave.frontAt(w).z;
        g.p.airY=protection==='air'?2:0;g.p.airborne=protection==='air';g.balance.immunity=protection==='immunity'?1:0;g.impactCooldown=protection==='collision'?1:0;
        g.chase.step(1/120);const ended=!g.chase.active;
        g.p.airY=0;g.p.airborne=false;g.balance.immunity=0;g.impactCooldown=0;
        for(let i=0;i<300;i++)g.chase.step(1/120);
        results.push({protection,ended,wipes:g.chase.wipes,beer:g.mug.level});
      }
      g.state='paused';return results;
    });
    for(const result of report.passedFoam)assert.deepEqual(result,{protection:result.protection,ended:true,wipes:0,beer:1},'passed foam cannot hit after '+result.protection+' protection expires');
    report.collisions={};
    for(const type of ['buoy','jetski','shark','foam']){
      report.collisions[type]=await page.evaluate(type=>{
        const g=game;g.assist=false;g.reset();g.state='playing';g.journey.hideAll();g.container.classList.add('playing');g.input.mode='keys';
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.rivals.forEach(r=>r.collided=true);
        const h=g.world.hazards.find(h=>h.type===type);g.world.hazards.forEach(other=>{if(other!==h)other.done=true;});
        if(h){
          h.x=h.targetX=g.p.x;h.z=g.p.z+.5;
          if(type==='jetski'){h.mode='cross';h.initialX=h.x;h.direction=0;h.activeAt=g.time;}
          if(type==='shark'){h.activeAt=g.time;h.chasing=true;}
          g.world.step(1/120);
        }else{
          const w=g.wave.waves.find(w=>w.height>=2.6&&w.anchorFrom>230);g.time=w.encounterTime;g.wave.time=g.time;
          g.p.z=(w.from+w.to)/2-14;g.p.x=g.wave.crestX(w,g.p.z)+w.width*.32;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=28;
          g.chase.taught=true;g.chase.begin(w);w.peelOriginZ+=g.p.z-.4-g.wave.frontAt(w).z;g.chase.step(1/120);
        }
        const impact={hit:h?h.hit:g.chase.wipes===1,source:g.balance.reason,mode:g.balance.mode};
        dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true}));
        for(let i=0;i<360&&!g.p.fallen;i++)g.step(1/120);
        dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',bubbles:true}));
        const fall={fallen:g.p.fallen,risk:g.p.balance,caption:document.querySelector('#wipeout-screen strong').textContent};
        g.state='paused';g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);g.renderDirty=false;return {impact,fall};
      },type);
      const result=report.collisions[type],cause=type==='buoy'?'УДАР ОБ БУЙ':type==='jetski'?'УДАР ОБ АКВАБАЙК':type==='shark'?'АКУЛА ЗАДЕЛА':'НАКРЫЛО ПЕНОЙ';
      assert.deepEqual(result.impact,{hit:true,source:cause,mode:'recovery'});
      assert.ok(result.fall.fallen&&result.fall.risk>=1.05,'continued wrong steering causes a physical fall after '+type);
      assert.equal(result.fall.caption,cause,'fall retains the original '+type+' collision');
      await page.screenshot({path:path.join(review,'fall-'+type+'.png')});
    }
    report.liveApproach=await page.evaluate(()=>{
      const g=game,dt=1/120;g.assist=true;g.reset();g.state='playing';g.input.mode='keys';g.journey.hideAll();g.container.classList.add('playing');
      g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.comics.trigger=()=>false;g.world.hazards.forEach(h=>{h.done=h.hit=true;});g.rivals.forEach(r=>r.collided=true);
      const w=g.wave.waves.find(w=>w.height>=2.6&&w.anchorFrom>230);g.time=w.peelOriginTime;g.wave.time=g.time;g.p.z=g.wave.frontAt(w).z+12;
      g.p.x=g.wave.crestX(w,g.p.z)+w.width*.32;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=28;g.waveRide.charge=1;g.chase.taught=true;
      g.updateCamera(1,true);let began=null,firstVisible=null,hit=null,turn=null,reaction=0,release=0;const trace=[],pixels=[];
      const key=(code,on)=>dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true}));key('ArrowDown',true);
      for(let frame=0;frame<1200;frame++){
        if(g.time>=release&&turn){key(turn,false);turn=null;}
        if(g.time>=reaction){reaction=g.time+.24;const desired=g.wave.crestX(w,g.p.z+8)+w.width*.42,delta=desired-g.p.x;
          if(Math.abs(delta)>.65&&!turn){turn=delta>0?'ArrowRight':'ArrowLeft';key(turn,true);release=g.time+.1;}}
        g.step(dt);g.updateVisuals(dt);if(g.chase.active&&began===null)began=g.time;
        if(frame%12===0&&g.chase.active){
          g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);const positions=g.chase.frontMesh.geometry.attributes.position;let visible=0;
          for(let i=0;i<positions.count;i++){const v=new THREE.Vector3().fromBufferAttribute(positions,i).project(g.camera);if(Math.abs(v.x)<.94&&v.y>-.78&&v.y<.8&&v.z<1&&v.z>0)visible++;}
          const spray=g.chase.spray.filter(s=>{const v=s.mesh.position.clone().project(g.camera);return s.mesh.visible&&Math.abs(v.x)<.94&&v.y>-.78&&v.y<.8&&v.z<1&&v.z>0;}).length;
          if((visible>100||spray>=3)&&firstVisible===null)firstVisible=g.time;
          trace.push({age:g.time-began,gap:g.chase.gap,visible,spray,back:g.p.z-g.camera.position.z,wave:g.chase.wave.id,energy:g.wave.envelope(g.chase.wave,g.chase.z)});
          if(Math.abs(g.time-began-Math.round(g.time-began))<.01&&g.time-began>=1){
            const canvas=g.renderer.domElement,c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const ctx=c.getContext('2d');
            g.renderer.render(g.scene,g.camera);ctx.drawImage(canvas,0,0);const normal=ctx.getImageData(0,0,c.width,c.height).data;
            const meshes=[g.chase.frontMesh,g.chase.crestFroth,...g.chase.spray.map(s=>s.mesh)],states=meshes.map(m=>m.visible);meshes.forEach(m=>m.visible=false);
            g.renderer.render(g.scene,g.camera);ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(canvas,0,0);const hidden=ctx.getImageData(0,0,c.width,c.height).data;
            let changed=0;for(let i=0;i<normal.length;i+=4)if(Math.abs(normal[i]-hidden[i])+Math.abs(normal[i+1]-hidden[i+1])+Math.abs(normal[i+2]-hidden[i+2])>45)changed++;
            meshes.forEach((m,i)=>m.visible=states[i]);pixels.push({age:g.time-began,changed});
          }
        }
        if(g.chase.wipes>0){hit=g.time;break;}
        if(began!==null&&!g.chase.active)break;
      }
      key('ArrowDown',false);if(turn)key(turn,false);g.state='paused';
      return {began,firstVisible,hit,warningSeconds:hit!==null&&firstVisible!==null?hit-firstVisible:null,trace,pixels};
    });
    assert.ok(report.liveApproach.firstVisible!==null,'smooth follow reveals the crest during real input and physics');
    if(report.liveApproach.hit!==null)assert.ok(report.liveApproach.warningSeconds>1.5,'the visible world crest gives time to react before foam contact');
    let obscured=0,longest=0;for(const frame of report.liveApproach.trace.filter(frame=>frame.age>.8)){obscured=frame.visible<100&&frame.spray<3?obscured+.1:0;longest=Math.max(longest,obscured);}
    report.liveApproach.longestObscured=longest;
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({report,errors},null,2));
    assert.ok(longest<.6,'world spray prevents prolonged loss of the approaching crest: '+longest);
    assert.ok(report.liveApproach.pixels.every(frame=>frame.changed>100),'the rendered crest or spray is actually visible through scene depth: '+JSON.stringify(report.liveApproach.pixels));
    for(const gap of [12,9,6,3]){
      report['gap'+gap]=await page.evaluate(gap=>{
        const g=game;g.assist=true;g.reset();g.journey.hideAll();g.container.classList.add('playing');g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.meta.ghost=[];g.meta.hideGhost();
        const w=g.wave.waves.find(w=>w.height>=2.6&&w.anchorFrom>230);g.time=w.encounterTime;g.wave.time=g.time;
        g.p.z=(w.from+w.to)/2-14;g.p.x=g.wave.crestX(w,g.p.z)+w.width*.32;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=28;
        g.chase.taught=true;g.chase.begin(w);g.chase.gap=gap;g.chase.z=g.p.z-gap;g.wave.peelFront={id:w.id,z:g.chase.z};
        g.state='paused';g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);g.renderDirty=false;
        const positions=g.chase.frontMesh.geometry.attributes.position;let visible=0;
        for(let i=0;i<positions.count;i++){const v=new THREE.Vector3().fromBufferAttribute(positions,i).project(g.camera);if(Math.abs(v.x)<.94&&v.y>-.78&&v.y<.8&&v.z<1&&v.z>0)visible++;}
        const coach=document.getElementById('ride-coach').getBoundingClientRect(),overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        const coachClear=['sound-button','pause-button'].every(id=>!overlaps(coach,document.getElementById(id).getBoundingClientRect()));
        return {visibleVertices:visible,cameraBack:g.p.z-g.camera.position.z,cameraHeight:g.camera.position.y,indicator:getComputedStyle(g.chain.chaseEl).display,coachClear};
      },gap);
      assert.ok(report['gap'+gap].visibleVertices>100,'the actual world crest is framed before impact at '+gap+' metres');
      assert.equal(report['gap'+gap].indicator,'none','normal play has no rear-wave readout');
      assert.ok(report['gap'+gap].coachClear,'the world-wave warning leaves utility buttons clear');
      await page.screenshot({path:path.join(review,'mobile-gap-'+gap+'.png')});
    }
    const diagnostics=await page.evaluate(()=>{game.container.classList.add('debug-mode');const display=getComputedStyle(game.chain.chaseEl).display;game.container.classList.remove('debug-mode');return display;});
    assert.equal(diagnostics,'grid','distance and ETA remain available for debugging');
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({report,errors},null,2));
    console.log(JSON.stringify({...report,liveApproach:{...report.liveApproach,trace:undefined}},null,2));assert.deepEqual(errors,[]);
    console.log('PASS: trim recovery, physical collision causes, one-time foam contact, early world crest and spray, no normal wave readout.');
  }finally{await browser?.close();server.closeAllConnections?.();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
