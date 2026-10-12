const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const dir=path.resolve(__dirname,'../review/comics/obstacles');fs.mkdirSync(dir,{recursive:true});
  const profile=fs.mkdtempSync(path.join(dir,'.chrome-'));
  const report={errors:[],frames:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',userDataDir:profile,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))report.errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    const base='http://127.0.0.1:'+server.address().port;
    await page.goto(base+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();});
    report.props=await page.evaluate(()=>{
      const g=game,props=g.world.hazards.filter(h=>h.type==='flotsam');
      return props.map(h=>{
        g.reset();g.state='playing';g.world.hazards.forEach(other=>other.done=other!==h);
        g.p.x=h.x;g.p.z=h.z-.2;g.p.airY=0;g.p.y=g.wave.height(h.x,g.p.z);g.p.speed=30;g.impactCooldown=0;
        g.world.step(1/120);const hit={hit:h.hit,cause:g.balance.reason,beer:g.mug.level,speed:g.p.speed};
        g.reset();g.state='playing';g.world.hazards.forEach(other=>other.done=other!==h);
        g.p.x=h.x;g.p.z=h.z-.2;g.p.airY=h.jumpClearance+.2;g.p.airborne=true;g.p.speed=30;g.world.step(1/120);
        const air={hit:h.hit,beer:g.mug.level,speed:g.p.speed};
        g.reset();g.state='playing';g.world.hazards.forEach(other=>other.done=other!==h);
        g.p.x=h.x+h.collisionRadius+.25;g.p.z=h.z-.2;g.p.speed=30;g.world.step(1/120);
        const outside={hit:h.hit,beer:g.mug.level};
        g.p.x=h.x;g.p.z=h.z-15;g.p.y=g.wave.height(h.x,g.p.z);g.p.recovering=0;g.balance.mode='stable';
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.updateCoach(g.waveRide.guidance());
        const cue=document.getElementById('coach-title').textContent;
        let meshes=0,triangles=0;h.group.traverse(n=>{if(n.isMesh){meshes++;triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;}});
        g.state='paused';return {prop:h.prop,name:h.name,cause:h.cause,hit,air,outside,cue,meshes,triangles};
      });
    });
    assert.equal(report.props.length,6);assert.equal(new Set(report.props.map(h=>h.prop)).size,6);
    for(const h of report.props){
      assert.deepEqual(h.hit,{hit:true,cause:h.cause,beer:.9,speed:19.5});
      assert.deepEqual(h.air,{hit:false,beer:1,speed:30});assert.deepEqual(h.outside,{hit:false,beer:1});
      assert.ok(h.cue.includes(h.name),'the cue names '+h.name);assert.ok(h.meshes>2&&h.triangles<6000);
    }
    report.barriers=await page.evaluate(()=>{
      const g=game,rows=[];
      function cross(r,x,air){
        g.p.z=r.z+.1;g.p.x=x;g.p.airY=air;g.p.airborne=air>0;g.p.y=g.wave.height(x,r.z)+air;
        g.beats.lastZ=r.z-.1;g.beats.lastX=x;g.beats.lastY=g.p.y;g.beats.step(.01);
      }
      for(const id of [3,7,15])for(const mode of ['water','air','bypass']){
        g.reset();g.state='playing';const r=g.beats.ropes.find(r=>r.ramp?.id===id);
        g.p.speed=30;g.awardTrick('360°',100,true);const before={beer:g.mug.level,chain:g.chain.count,balance:g.p.balance};
        const x=mode==='bypass'?r.x+r.halfWidth+.8:r.x,air=mode==='air'?1.2:0;
        cross(r,x,air);const after={result:r.result,speed:g.p.speed,beer:g.mug.level,chain:g.chain.count,balance:g.p.balance};
        cross(r,x,air);const once=g.p.speed===after.speed;
        rows.push({id,mode,before,after,once,x:r.x,z:r.z,exit:r.ramp.exit.z});
      }
      g.reset();g.state='playing';const r=g.beats.ropes.find(r=>r.rampBarrier);
      g.p.speed=30;g.p.z=r.z+10;g.beats.step(.01);const teleport=r.result==='miss'&&g.p.speed===30;
      g.reset();g.state='paused';g.beats.update();const r0=g.beats.ropes.find(r=>r.rampBarrier);
      const frozen=JSON.stringify(g.beats.events);g.updateVisuals(0);
      return {rows,teleport,paused:JSON.stringify(g.beats.events)===frozen,reset:g.beats.ropes.every(r=>!r.done&&r.result===null)};
    });
    for(const r of report.barriers.rows){
      assert.equal(r.after.result,r.mode==='water'?'drag':r.mode==='air'?'jump':'bypass');
      assert.ok(Math.abs(r.after.speed-(r.mode==='water'?21.6:30))<1e-9);
      assert.equal(r.after.beer,r.before.beer);assert.equal(r.after.chain,r.before.chain);assert.equal(r.after.balance,r.before.balance);
      assert.ok(r.once);assert.equal(r.z,r.exit+3);
    }
    assert.ok(report.barriers.teleport&&report.barriers.paused&&report.barriers.reset);
    report.ramps=await page.evaluate(()=>{
      const g=game,rows=[];
      for(const id of [3,7,15]){
        g.meta.seed=42;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
        g.world.hazards.forEach(h=>h.done=true);g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
        const line=g.trickRoute.lines.find(l=>l.id===id),rope=g.beats.ropes.find(r=>r.ramp===line);
        g.p.x=line.x;g.p.z=line.entry.z-2;g.time=g.p.z/30;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=30;
        let launched=false,maxAir=0;
        for(let i=0;i<360&&g.p.z<rope.z+2;i++){
          g.input.target=THREE.MathUtils.clamp((line.x-g.p.x)*.7-g.p.sideVelocity*.12,-1,1);g.step(1/120);
          launched||=g.jump.takeoffRamp===line;maxAir=Math.max(maxAir,g.p.airY);
        }
        rows.push({id,launched,maxAir,result:rope.result,beer:g.mug.level});
      }
      g.state='paused';return rows;
    });
    for(const row of report.ramps)assert.ok(row.launched&&row.result==='jump','a real ramp clears its rope: '+JSON.stringify(row));
    for(const [name,width,height] of [['phone',393,852],['small',360,640],['tall',430,932],['computer',1280,852]]){
      await page.setViewport({width,height,isMobile:name!=='computer',hasTouch:name!=='computer'});
      for(const prop of ['flamingo','log','barrel','cooler','suitcase','ball','ramp']){
        const frame=await page.evaluate(prop=>{
          const g=game;g.meta.seed=42;g.reset();g.resize();g.state='paused';g.journey.hideAll();g.container.classList.add('playing');
          ['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
          g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.input.mode='touch';g.input.render();
          const h=g.world.hazards.find(h=>h.prop===prop),r=g.beats.ropes.find(r=>r.ramp?.id===3);
          g.p.z=h?h.z-20:r.ramp.entry.z-24;g.p.x=h?g.trickRoute.routePoint(g.p.z):r.ramp.x;
          g.time=g.p.z/30;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=30;
          g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
          const mesh=h?h.group:r.band,center=new THREE.Vector3();mesh.getWorldPosition(center);
          if(!h)center.set(-r.x,g.wave.height(r.x,r.z)+.3,r.z);center.project(g.camera);
          const c=document.createElement('canvas');c.width=g.renderer.domElement.width;c.height=g.renderer.domElement.height;
          const ctx=c.getContext('2d');ctx.drawImage(g.renderer.domElement,0,0);const withProp=ctx.getImageData(0,0,c.width,c.height).data;
          const targets=h?[h.group]:[r.band,...r.floats,...r.markers.map(m=>m.mesh)],visibility=targets.map(m=>m.visible);
          targets.forEach(m=>m.visible=false);g.renderer.render(g.scene,g.camera);ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(g.renderer.domElement,0,0);
          const withoutProp=ctx.getImageData(0,0,c.width,c.height).data;let changed=0;
          for(let i=0;i<withProp.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(withProp[i+k]-withoutProp[i+k])))>8)changed++;
          targets.forEach((m,i)=>m.visible=visibility[i]);g.renderer.render(g.scene,g.camera);
          const box=g.container.getBoundingClientRect();
          return {visible:mesh.visible,changedPixels:changed,center:center.toArray(),width:box.width,height:box.height,
            aspect:g.camera.aspect,calls:g.renderer.info.render.calls,overflow:document.documentElement.scrollWidth>innerWidth};
        },prop);
        assert.ok(frame.visible&&!frame.overflow);
        assert.equal(frame.width,Math.min(width,430));assert.equal(frame.height,height);assert.equal(frame.aspect,frame.width/frame.height);
        assert.ok(frame.changedPixels>30,'the obstacle actually renders ahead of the natural route: '+JSON.stringify({name,prop,...frame}));
        await (await page.$('#app-container')).screenshot({path:path.join(dir,name+'-'+prop+'.png')});report.frames.push({name,prop,...frame});
      }
    }
    report.mobileLayout=[];
    for(const width of [430,1280,1920]){
      await page.setViewport({width,height:852,isMobile:width===430,hasTouch:width===430});
      report.mobileLayout.push(await page.evaluate(()=>{
        const g=game;g.reset();g.resize();g.journey.open('start');const box=g.container.getBoundingClientRect();
        const title=getComputedStyle(document.querySelector('.menu-title'));
        const menu={font:title.fontSize,left:title.left,top:title.top};
        g.journey.hideAll();g.container.classList.add('playing');g.state='paused';g.updateHUD();
        const hud={grid:getComputedStyle(document.querySelector('.hud')).gridTemplateColumns,
          font:getComputedStyle(document.querySelector('.beer-ticket strong')).fontSize};
        return {width:box.width,height:box.height,aspect:g.camera.aspect,menu,hud};
      }));
    }
    assert.deepEqual(report.mobileLayout[0],report.mobileLayout[1],'a computer shows exactly the same phone composition');
    assert.deepEqual(report.mobileLayout[0],report.mobileLayout[2],'a larger monitor also retains the mobile composition');
    await page.goto(base+'/prototype.html?seed=42',{waitUntil:'networkidle0'});
    assert.equal(await page.evaluate(()=>game.world.hazards.filter(h=>h.type==='flotsam').length),6);
    assert.deepEqual(report.errors,[]);
    console.log(JSON.stringify({...report,frames:report.frames.length},null,2));
  }finally{
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
    await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));
    const relative=path.relative(dir,profile);
    if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative))fs.rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
  }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
