const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const dir=path.resolve(__dirname,'../review/comics/dolphins-v3');fs.mkdirSync(dir,{recursive:true});
  const profile=fs.mkdtempSync(path.join(dir,'.chrome-')),report={errors:[],frames:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',userDataDir:profile,headless:true,
      args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-crash-reporter']});
    const page=await browser.newPage();page.setDefaultTimeout(60000);
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('favicon.ico'))report.errors.push(response.status()+' '+response.url());});
    const base='http://127.0.0.1:'+server.address().port;
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto(base+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();});
    report.safety=await page.evaluate(()=>{
      const g=game,pod=g.demo.dolphinPod,start=20,origin=779;
      g.reset();g.state='paused';g.demo.podAt=start;g.demo.podOriginZ=origin;pod.start(start,origin);
      let nearest=Infinity,samples=0,minPixels=Infinity;
      for(let frame=0;frame<=360;frame++){
        const age=frame/120;g.time=g.wave.time=start+age;g.p.z=origin+pod.maxBoardSpeed*age;
        g.p.x=[-9,0,9.2][frame%3];g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=pod.maxBoardSpeed;g.updateCamera(1,true);
        pod.update(start,origin,true);g.scene.updateMatrixWorld(true);
        for(const d of pod.dolphins){
          if(!d.group.visible)continue;samples++;
          const pos=d.card.geometry.attributes.position;let minX=Infinity,maxX=-Infinity;
          for(let i=0;i<pos.count;i++){
            const world=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(d.card.matrixWorld);
            nearest=Math.min(nearest,world.z-g.p.z-2.4);
            const screen=world.clone().project(g.camera);minX=Math.min(minX,screen.x);maxX=Math.max(maxX,screen.x);
          }
          if(age-d.delay>.35&&age-d.delay<1.25)minPixels=Math.min(minPixels,(maxX-minX)*g.renderer.domElement.width/2);
        }
      }
      g.time=g.wave.time=start+.85;pod.update(start,origin,true);
      const before=pod.dolphins.map(d=>d.group.position.toArray());g.p.x=6;g.p.z+=50;pod.update(start,origin,true);
      const anchored=pod.dolphins.every((d,i)=>d.group.position.toArray().every((value,j)=>value===before[i][j]));
      const perpendicular=pod.dolphins.every(d=>Math.abs(d.velocityX)>10*Math.abs(d.velocityZ));
      const forward=pod.dolphins.every(d=>new THREE.Vector3(-1,0,0).applyQuaternion(d.group.quaternion).dot(new THREE.Vector3(-d.velocityX,0,d.velocityZ))>0);
      g.reducedMotion=true;pod.update(start,origin,true);
      const calm=pod.dolphins.every(d=>!d.group.visible)&&pod.splashes.every(s=>!s.mesh.visible)&&!pod.drops.visible;
      g.reducedMotion=false;g.reset();
      const reset=pod.startedAt===null&&g.demo.podAt===null&&g.demo.podOriginZ===null&&!pod.drops.visible&&pod.splashes.every(s=>!s.mesh.visible);
      return {nearest,samples,minPixels,anchored,perpendicular,forward,calm,reset};
    });
    assert.ok(report.safety.nearest>12,'the whole dolphin stays ahead of the board at maximum speed: '+JSON.stringify(report.safety));
    assert.ok(report.safety.samples>400&&report.safety.minPixels>24&&report.safety.anchored&&report.safety.perpendicular&&report.safety.forward&&report.safety.calm&&report.safety.reset);
    for(const [layout,width,height] of [['phone',393,852],['small',360,640],['tall',430,932],['computer',1280,852]]){
      await page.setViewport({width,height,isMobile:layout!=='computer',hasTouch:layout!=='computer'});
      for(const [phase,age] of [['launch',.35],['crossing',1.25],['dive',2.1],['foam',2.7]]){
        const frame=await page.evaluate(age=>{
          const g=game,origin=779,start=origin/36,pod=g.demo.dolphinPod;
          g.reset();g.resize();g.state='paused';g.journey.hideAll();g.container.classList.add('playing');
          for(const id of ['start-screen','pause-screen','result-screen'])document.getElementById(id).classList.add('hidden');
          g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.input.mode='touch';g.input.render();
          g.time=g.wave.time=start+age;g.p.z=origin+36*age;g.p.x=g.trickRoute.routePoint(g.p.z);g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=36;
          g.demo.podAt=start;g.demo.podOriginZ=origin;g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);g.updateHUD();
          g.renderer.render(g.scene,g.camera);
          return {visible:pod.dolphins.filter(d=>d.group.visible).length,splashes:pod.splashes.filter(s=>s.mesh.visible).length,
            drops:pod.drops.visible,calls:g.renderer.info.render.calls,coachHidden:document.getElementById('ride-coach').classList.contains('hidden'),
            overflow:document.documentElement.scrollWidth>innerWidth};
        },age);
        await (await page.$('#app-container')).screenshot({path:path.join(dir,layout+'-'+phase+'.png')});report.frames.push({layout,phase,...frame});
        assert.ok(!frame.overflow&&frame.calls<260);if(phase==='crossing'){assert.equal(frame.visible,3);assert.ok(frame.coachHidden);}if(phase==='foam')assert.equal(frame.visible,0);
        if(phase!=='crossing')assert.ok(frame.splashes>0&&frame.drops);
      }
    }
    await page.goto(base+'/prototype.html',{waitUntil:'networkidle0'});await page.evaluate(()=>game.demo.ready);
    assert.equal(await page.evaluate(()=>game.demo.dolphinPod.loaded),true);assert.deepEqual(report.errors,[]);
    console.log(JSON.stringify(report,null,2));
  }finally{
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
    await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    const relative=path.relative(dir,profile);
    if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative))try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:12,retryDelay:200});}
    catch(error){if(!['EBUSY','EPERM'].includes(error.code))throw error;}
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
