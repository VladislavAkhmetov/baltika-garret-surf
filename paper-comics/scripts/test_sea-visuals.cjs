const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const review=path.resolve(__dirname,'../review/comics/sea-v8');fs.mkdirSync(review,{recursive:true});
  let browser;const errors=[],layouts=[],requests=[];
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource:'))errors.push(message.text());});
    page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))errors.push('HTTP '+response.status()+' '+response.url());});
    page.on('request',request=>requests.push(request.url()));
    for(const [device,width,height] of [['mobile',393,852],['small',360,640],['desktop',1240,900],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:device!=='desktop',hasTouch:device!=='desktop'});
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});
      await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();game.wave.resetWaves(42);game.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);game.jump.tricks=1;game.balance.mode='stable';});
      const scenes=[['swell',0,90],['high-shoulder',0,830],['late',5,1040]];
      if(device==='mobile')scenes.push(['approach','center','far'],['face','center','near'],['crest','center','crest'],['behind','center','past']);
      for(const [name,x,position] of scenes){
        const result=await page.evaluate((x,position)=>{
          const g=game,p=g.p,w=g.wave.waves.reduce((best,w)=>w.height>best.height?w:best),offsets={far:-55,near:-16,crest:0,past:32};
          p.z=typeof position==='string'?(w.anchorFrom+w.anchorTo)/2+offsets[position]:position;g.time=p.z/25;g.wave.time=g.time;
          p.x=x==='center'?THREE.MathUtils.clamp(g.wave.crestX(w,p.z)+(position==='crest'?0:w.width*.25),-8,8):x;p.speed=31;p.lean=0;p.heading=0;
          p.airborne=false;p.airY=0;g.mug.level=.64;g.score=4490;g.waveRide.totalCaught=3;
          g.wave.update(p.z,g.time,true);p.y=g.wave.height(p.x,p.z);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);g.renderDirty=true;g.scene.updateMatrixWorld(true);
          const town=g.town,right=new THREE.Vector3(1,0,0).applyQuaternion(g.camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(g.camera.quaternion);
          const corners=[];
          for(const a of [-.5,.5])for(const b of [0,1])corners.push(town.position.clone().addScaledVector(right,a*town.scale.x).addScaledVector(up,b*town.scale.y).project(g.camera));
          const bounds={left:Math.min(...corners.map(p=>(p.x+1)/2)),right:Math.max(...corners.map(p=>(p.x+1)/2)),top:Math.min(...corners.map(p=>(1-p.y)/2)),bottom:Math.max(...corners.map(p=>(1-p.y)/2))};
          const pos=g.wave.sea.geometry.attributes.position;
          const finite=Array.from(pos.array).every(Number.isFinite)&&Array.from(g.wave.sea.geometry.attributes.normal.array).every(Number.isFinite);
          let surfaceError=0;for(let i=0;i<pos.count;i+=137)surfaceError=Math.max(surfaceError,Math.abs(pos.getY(i)-g.wave.height(-pos.getX(i),pos.getZ(i))));
          const lips=g.wave.swellLips,visibleLips=lips.filter(m=>m.visible).length;
          const lipFinite=lips.filter(m=>m.visible).every(m=>Array.from(m.geometry.attributes.position.array).every(Number.isFinite)&&Array.from(m.geometry.attributes.normal.array).every(Number.isFinite));
          const cleanRide=document.getElementById('balance-cue').classList.contains('hidden');
          const score=document.getElementById('score-value'),scoreFits=score.scrollWidth<=score.clientWidth;
          return {bounds,finite,coastAspect:g.coastRatio,waterReady:!!g.wave.waterMaterial.uniforms.uWaterPrint.value.image,surfaceError,visibleLips,lipFinite,cleanRide,scoreFits,z:p.z,x:p.x};
        },x,position);
        assert.ok(result.finite&&result.waterReady,'finite loaded sea');
        assert.ok(result.lipFinite&&result.visibleLips>0,'finite three-dimensional crest surfaces');
        assert.ok(result.surfaceError<.00001,'visible rideable surface matches board physics');
        assert.ok(result.cleanRide,'learned calm riding has no repeated balance instructions');
        assert.ok(result.scoreFits,'all score digits fit on the ticket');
        assert.ok(result.coastAspect>2,'horizontal headland silhouette');
        assert.ok(result.bounds.left>.02&&result.bounds.right<.98&&result.bounds.top>.12&&result.bounds.bottom<.60,device+' '+name+' entire cape in distant scene');
        layouts.push({device,name,...result});
        await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
        await page.screenshot({path:path.join(review,device+'-'+name+'.jpg'),type:'jpeg',quality:90});
      }
    }
    assert.equal(requests.some(url=>/wave-(swell|launch)-cutout/.test(url)),false,'paper wave images are not requested');
    fs.writeFileSync(path.join(review,'layout.json'),JSON.stringify({layouts,errors},null,2));assert.deepEqual(errors,[]);
    console.log('PASS: 3D waves and crest normals, matching rideable geometry, compiled water shader and four viewport sizes');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
