const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const dir=path.resolve(__dirname,'../review/comics/demo');fs.mkdirSync(dir,{recursive:true});
  const profile=fs.mkdtempSync(path.join(dir,'.chrome-')),report={errors:[],runs:[],frames:[]};
  const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',userDataDir:profile,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.setDefaultTimeout(60000);
    page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|GL_INVALID/i.test(m.text()))report.errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
    const base='http://127.0.0.1:'+server.address().port;
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto(base+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();});
    report.rules=await page.evaluate(()=>{
      const g=game,dt=1/120;
      function hold(mode){
        g.reset();g.state='playing';const c=g.demo.currents[0];g.p.speed=30;g.p.z=c.from+15;g.p.x=g.demo.center(c,g.p.z);
        const beer=g.mug.level,chain=g.chain.count;
        for(let i=0;i<90;i++){
          const previous={x:g.p.x,z:g.p.z};g.p.z+=30*dt;g.p.x=g.demo.center(c,g.p.z)+(mode==='outside'?2:0);
          g.p.airborne=mode==='air';g.p.fallen=mode==='fall';g.p.recovering=mode==='recovery'?1:0;g.p.speed=mode==='slow'?22:30;
          g.p.y=g.wave.height(g.p.x,g.p.z)+(g.p.airborne?2:0);g.time+=dt;g.wave.time=g.time;g.demo.step(dt,previous);
        }
        const won=c.won,points=g.chain.points,events=g.demo.events.filter(e=>e.type==='current').length;
        for(let i=0;i<90;i++)g.demo.step(dt,{x:g.p.x,z:g.p.z-.25});
        const once=g.chain.points===points&&g.demo.events.filter(e=>e.type==='current').length===events;
        g.state='paused';return {mode,won,points,events,once,beerStable:g.mug.level===beer,chain:g.chain.count-chain,momentum:g.waveRide.momentum};
      }
      const holds=['water','air','outside','fall','recovery','slow'].map(hold);
      g.reset();g.state='playing';const c=g.demo.currents[0];g.p.z=c.from+15;g.p.x=g.demo.center(c,g.p.z);g.p.speed=30;
      for(let i=0;i<100;i++)g.demo.step(dt,{x:g.p.x,z:g.p.z-20});const teleport=!c.won;
      g.reset();const x=g.demo.center(c,c.from+20),z=c.from+20,flow=g.demo.currentAt(x,z),sample=g.wave.sample(x,z);
      g.demo.enabled=false;const still=g.wave.sample(x,z);g.demo.enabled=true;
      const flowDelta=sample.flowZ-still.flowZ;
      g.p.z=380;g.p.x=g.demo.center(c,380);g.time=g.wave.time=12;g.demo.update();
      const positions=g.demo.currents[0].bands[0].mesh.geometry.attributes.position;
      let waterError=0;for(let i=0;i<positions.count;i++)waterError=Math.max(waterError,Math.abs(positions.getY(i)-g.wave.height(-positions.getX(i),positions.getZ(i))-.055));
      const shapes=[];g.scene.updateMatrixWorld(true);
      for(const l of g.demo.landmarks){
        let nearest=Infinity,overhead=Infinity,triangles=0;
        l.group.traverse(m=>{if(!m.isMesh)return;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;if(m.userData.waterWash)return;
          const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){
            const v=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld);
            if(v.y<14)nearest=Math.min(nearest,Math.abs(v.x));if(Math.abs(v.x)<10)overhead=Math.min(overhead,v.y);
          }});
        shapes.push({id:l.id,nearest,overhead:Number.isFinite(overhead)?overhead:null,triangles});
      }
      g.demo.podAt=g.time-.9;g.demo.update();const first=g.demo.dolphins.map(d=>d.group.position.toArray());
      g.p.x=8;g.demo.update();const independent=g.demo.dolphins.every((d,i)=>d.group.position.toArray().every((v,j)=>v===first[i][j]));
      g.reducedMotion=true;g.demo.update();const calm=g.demo.dolphins.every(d=>!d.group.visible)&&!g.demo.spray.visible;
      g.reducedMotion=false;g.state='paused';const events=JSON.stringify(g.demo.events);g.updateVisuals(0);const pause=JSON.stringify(g.demo.events)===events;
      g.reset();const reset=g.demo.events.length===0&&g.demo.currents.every(c=>!c.won&&c.hold===0)&&g.demo.podAt===null;
      return {holds,teleport,flow:flow.strength,flowDelta,waterError,shapes,independent,calm,pause,reset};
    });save();
    const rules=report.rules;
    for(const h of rules.holds){assert.equal(h.won,h.mode==='water');assert.ok(h.once&&h.beerStable);assert.equal(h.events,h.mode==='water'?1:0);}
    assert.ok(rules.holds[0].points>=180&&rules.holds[0].momentum===4);
    assert.ok(rules.teleport&&rules.flow>.9&&rules.flowDelta>7&&rules.waterError<.0001&&rules.independent&&rules.calm&&rules.pause&&rules.reset);
    for(const s of rules.shapes){assert.ok(s.nearest>10,'scenery stays outside the board corridor: '+JSON.stringify(s));if(s.overhead!==null)assert.ok(s.overhead>16);}
    for(const [seed,style] of [[42,'route'],[42,'currents'],[7,'currents'],[93,'currents'],[42,'coast']]){
      const result=await page.evaluate((seed,style)=>{
        const g=game,dt=1/120;g.meta.seed=seed;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
        let spun=0,maxAir=0;const checkpoints=[],activity=[],spills=[];const award=g.awardTrick.bind(g),spill=g.spill.bind(g);
        g.awardTrick=(name,...args)=>{activity.push({time:g.time,z:g.p.z,name});return award(name,...args);};
        g.spill=(amount,reason)=>{spills.push({z:g.p.z,amount,reason});return spill(amount,reason);};
        let checkpoint=100;
        for(let i=0;i<120*90&&g.state==='playing';i++){
          const z=g.p.z+9,c=style==='currents'?g.demo.currents.find(c=>z>c.from-15&&z<c.to-2):null;
          const target=c?g.demo.center(c,z):g.trickRoute.routePoint(z);
          g.input.target=style==='coast'?0:THREE.MathUtils.clamp((target-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
          if(style!=='route'&&style!=='coast'){
            const s=g.wave.sample(g.p.x,g.p.z),rope=g.beats.ropes.find(r=>!r.done&&r.z-g.p.z>0&&r.z-g.p.z<19);
            const pad=g.rush.accelerators.some(p=>!p.done&&p.z-g.p.z>0&&p.z-g.p.z<35);
            if(!g.p.airborne&&!c&&(rope||!pad&&s.wave&&s.energy>.55&&s.crest>.65))g.jump.press();
            if(g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;}
          }
          g.step(dt);maxAir=Math.max(maxAir,g.p.airY);
          if(g.p.z>=checkpoint){checkpoints.push({z:checkpoint,seconds:g.elapsed,speed:g.p.speed,place:g.duel.boris.z>g.p.z?2:1,beer:g.mug.level});checkpoint+=100;}
        }
        const result={seed,style,state:g.state,seconds:g.elapsed,place:g.duel.result?.place,beer:g.mug.level,falls:g.balance.falls,
          tricks:g.jump.tricks,finale:g.setpiece.finaleLanded,currents:g.demo.currents.filter(c=>c.won).length,pod:g.demo.podAt!==null,maxAir,checkpoints,activity,spills};
        g.awardTrick=award;g.spill=spill;g.courseShow.endDelivery();g.state='paused';return result;
      },seed,style);report.runs.push(result);save();
      assert.equal(result.state,'finished');assert.ok(result.beer>=.3||style==='coast');assert.ok(result.pod);
      if(style==='currents')assert.ok(result.currents>=1,'the streams are reachable in a real run: '+JSON.stringify(result));
      if(style==='coast')assert.equal(result.place,2,'coasting still loses to Boris');
    }
    for(const [layout,width,height] of [['phone',393,852],['small',360,640],['tall',430,932],['computer',1280,852]]){
      await page.setViewport({width,height,isMobile:layout!=='computer',hasTouch:layout!=='computer'});
      for(const [scene,z] of [['lighthouse',345],['wreck',486],['arch',736],['current',790],['dolphins',810],['finale',1098]]){
        const frame=await page.evaluate((scene,z)=>{
          const g=game;g.meta.seed=42;g.reset();g.resize();g.state='paused';g.journey.hideAll();g.container.classList.add('playing');
          ['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
          g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.input.mode='touch';g.input.render();
          g.p.z=z;g.p.x=g.trickRoute.routePoint(z);g.time=g.wave.time=z/36;g.p.y=g.wave.height(g.p.x,z);g.p.speed=35;
          if(scene==='current')g.p.x=g.demo.center(g.demo.currents[1],z);
          if(scene==='dolphins'){g.demo.podAt=g.time-1.05;g.demo.podOriginZ=z-35*1.05;}
          g.updateCamera(1,true);g.wave.update(z,g.time,true);g.updateVisuals(0);g.updateHUD();
          const targets=scene==='current'?g.demo.currents[1].bands.map(b=>b.mesh):scene==='dolphins'?g.demo.dolphins.map(d=>d.group):
            [g.demo.landmarks.find(l=>l.id===(scene==='arch'?'sea-arch':scene))?.group].filter(Boolean);
          const capture=()=>{g.renderer.render(g.scene,g.camera);const c=document.createElement('canvas');c.width=g.renderer.domElement.width;c.height=g.renderer.domElement.height;
            const ctx=c.getContext('2d');ctx.drawImage(g.renderer.domElement,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
          const a=capture(),states=targets.map(m=>m.visible);targets.forEach(m=>m.visible=false);const b=capture();targets.forEach((m,i)=>m.visible=states[i]);g.renderer.render(g.scene,g.camera);
          let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>35)changed++;
          const box=g.container.getBoundingClientRect();
          return {changed,visible:states.filter(Boolean).length,width:box.width,height:box.height,calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,overflow:document.documentElement.scrollWidth>innerWidth};
        },scene,z);
        await (await page.$('#app-container')).screenshot({path:path.join(dir,layout+'-'+scene+'.png')});report.frames.push({layout,scene,...frame});save();
        assert.equal(frame.width,Math.min(width,430));assert.ok(!frame.overflow);if(scene!=='finale')assert.ok(frame.changed>80,'visible scene: '+JSON.stringify({layout,scene,...frame}));
        assert.ok(frame.calls<260,'scene keeps a bounded draw-call count');
      }
    }
    await page.goto(base+'/?flowtest=1',{waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>game.demo.enabled),false);
    await page.goto(base+'/prototype.html',{waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>game.demo.landmarks.length),3);
    assert.deepEqual(report.errors,[]);save();console.log(JSON.stringify({rules:report.rules,runs:report.runs.map(({activity,spills,checkpoints,...r})=>r),frames:report.frames.length,errors:report.errors},null,2));
  }finally{
    save();await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));
    const relative=path.relative(dir,profile);if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative))fs.rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
  }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
