const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port,review=path.resolve(__dirname,'../review/comics/sky-flight-v2');fs.mkdirSync(review,{recursive:true});
  const report={errors:[],missing:[],frames:[]};let browser;
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.setDefaultTimeout(60000);
    page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.missing.push(r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});await page.goto(base,{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();game.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);});
    report.independence=await page.evaluate(()=>{
      const g=game,a=g.skyAdvertiser;g.time=12;g.p.z=360;g.p.x=0;g.updateCamera(1,true);a.update();const first=a.group.position.toArray();
      const firstScreen=a.group.position.clone().project(g.camera).toArray();
      g.p.z=520;g.p.x=6;g.updateCamera(1,true);a.update();const movedRider=a.group.position.toArray(),movedScreen=a.group.position.clone().project(g.camera).toArray();
      g.p.z=360;g.p.x=0;g.time=13;g.updateCamera(1,true);a.update();const next=a.group.position.toArray();
      const texture=a.aircraft.material.map.image,c=document.createElement('canvas');c.width=texture.width;c.height=texture.height;const ctx=c.getContext('2d');ctx.drawImage(texture,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let clear=0;for(let i=3;i<data.length;i+=4)if(data[i]===0)clear++;
      a.update();const paused=a.group.position.toArray();g.reset();a.update();const reset=a.group.position.toArray();
      return {first,movedRider,firstScreen,movedScreen,next,paused,reset,alpha:clear/(data.length/4),bannerTexture:!!a.banner.material.map,oldPlaneRemoved:!g.seaplane};
    });
    const checks=report.independence;assert.deepEqual(checks.first,checks.movedRider,'moving the surfer must not move the aircraft in the world');
    assert.ok(Math.abs(checks.firstScreen[0]-checks.movedScreen[0])>.01||Math.abs(checks.firstScreen[1]-checks.movedScreen[1])>.01,'the camera must see parallax');
    assert.ok(Math.abs(checks.next[0]-checks.first[0]+8)<1e-6&&Math.abs(checks.next[2]-checks.first[2]-24)<1e-6,'aircraft flies on its own course');
    assert.deepEqual(checks.next,checks.paused);assert.deepEqual(checks.reset,[110,32,760]);assert.ok(checks.alpha>.15&&checks.bannerTexture&&checks.oldPlaneRemoved);
    report.flutter=await page.evaluate(()=>{
      const g=game,a=g.skyAdvertiser;g.time=8;a.update();const first=Array.from(a.bannerGeometry.attributes.position.array);
      g.time=8.5;a.update();const next=Array.from(a.bannerGeometry.attributes.position.array);
      g.reducedMotion=true;a.update();const quiet=Array.from(a.bannerGeometry.attributes.position.array);g.time=9.5;a.update();const quietNext=Array.from(a.bannerGeometry.attributes.position.array);g.reducedMotion=false;
      return {moves:first.some((v,i)=>Math.abs(v-next[i])>.001),quiet:quiet.every((v,i)=>v===quietNext[i])};
    });assert.ok(report.flutter.moves&&report.flutter.quiet);
    for(const [layout,width,height] of [['phone',393,852],['small',360,640],['desktop',1240,900],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:layout!=='desktop',hasTouch:layout!=='desktop'});
      for(const time of [0,10,20,38]){
        const frame=await page.evaluate(time=>{
          const g=game;g.reset();g.state='paused';g.journey.hideAll();g.container.classList.add('playing');g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.comics.reset();
          g.time=time;g.p.z=time*32;g.p.x=g.trickRoute.routePoint(g.p.z);g.p.y=g.wave.height(g.p.x,g.p.z,time);g.wave.time=time;g.updateCamera(1,true);g.wave.update(g.p.z,time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);g.scene.updateMatrixWorld(true);
          const a=g.skyAdvertiser,points=[];for(const mesh of [a.aircraft,a.banner])for(const x of [-.5,.5])for(const y of [-.5,.5]){
            const geometry=mesh.geometry.parameters;points.push(mesh.localToWorld(new THREE.Vector3(x*(geometry.width||1),y*(geometry.height||1),0)).project(g.camera));
          }
          return {time,world:a.group.position.toArray(),depth:a.group.position.distanceTo(g.camera.position),bounds:{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.max(...points.map(p=>p.y)),bottom:Math.min(...points.map(p=>p.y))}};
        },time);
        report.frames.push({layout,...frame});assert.ok(frame.depth>400,'plane must remain distant during its flyby');
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(review,layout+'-'+time+'.png')});
      }
    }
    const phone=report.frames.filter(f=>f.layout==='phone');assert.ok(phone[1].bounds.left>-1&&phone[1].bounds.right<1,'full advertisement should enter the portrait view');
    assert.ok(phone[1].bounds.top<.8&&phone[1].bounds.bottom>.4,'advertisement belongs in the distant sky');assert.ok(phone[1].bounds.right-phone[1].bounds.left<.65,'plane must not become a foreground badge');
    assert.ok(phone[3].bounds.left>.8,'aircraft eventually leaves the frame');
    await page.goto(base+'/prototype.html',{waitUntil:'networkidle0'});await page.evaluate(async()=>{await game.start(false);game.state='paused';});
    assert.equal(await page.evaluate(()=>!!game.skyAdvertiser.aircraft.material.map&&!!game.skyAdvertiser.banner.material.map),true);
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);fs.writeFileSync(path.join(review,'verification.json'),JSON.stringify(report,null,2));
    console.log('PASS: independent world flight, parallax, own speed, pause/reset, banner flutter, distance/scale/departure, four viewports and both entry pages.');
    console.log(JSON.stringify({independence:report.independence,phone},null,2));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
