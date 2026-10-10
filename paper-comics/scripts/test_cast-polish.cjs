const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const review=path.resolve(__dirname,'../review/comics/cast-polish');fs.mkdirSync(review,{recursive:true});
  const report={scenes:[],errors:[]};let browser;
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.journey.hideAll();game.audio.stopBGM();game.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);game.jump.tricks=1;});
    for(const [view,width,height] of [['phone',393,852],['small',360,640],['landscape',844,390],['desktop',1240,900]]){
      // Keep touch emulation stable: changing it reloads the whole WebGL scene.
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      for(const id of ['grandma','dj','blonde','couple']){
        for(const [surface,x,z,time,lean] of [['flat',-2.6,230,9.2,0],['face',-3.8,347,12,-.35],['turn',0,830,33.2,.35],['edge',7,230,9.2,0]]){
          const result=await page.evaluate((id,x,z,time,lean)=>{
            const g=game;g.reset();g.state='paused';g.journey.hideAll();g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.jump.tricks=1;
            g.wave.resetWaves(42);g.p.x=0;g.p.z=z-7;g.time=time;g.wave.time=time;g.p.y=g.wave.height(g.p.x,g.p.z);
            g.world.hazards.forEach(h=>h.done=true);g.rivals[1].z=z+250;
            const r=g.rivals[0],profile=g.rivalCast.profiles.find(p=>p.id===id);g.rivalCast.apply(r,profile);r.x=x;r.z=z;r.lean=lean;
            g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);g.updateHUD();g.speedBlur.render();g.scene.updateMatrixWorld(true);
            const rig=r.rig,board=rig.board,card=rig.card,deck=board.getWorldPosition(new THREE.Vector3());
            const normal=new THREE.Vector3(0,0,1).applyQuaternion(board.getWorldQuaternion(new THREE.Quaternion()));
            const feet=rig.castRiders.flatMap(({card,cutout})=>cutout.contacts.map(c=>{
              const v=c.clone().add(cutout.foot);card.localToWorld(v);
              const ray=v.clone().sub(g.camera.position).normalize(),t=deck.clone().sub(v).dot(normal)/ray.dot(normal);
              const on=v.clone().addScaledVector(ray,t),local=board.worldToLocal(on.clone());
              return {x:local.x,y:local.y,waterClearance:v.y-g.wave.height(-v.x,v.z),deckClearance:on.y-g.wave.height(-on.x,on.z)};
            }));
            const nose=new THREE.Vector3(0,1,0).applyQuaternion(board.quaternion);
            return {id,feet,riders:rig.castRiders.length,width:board.geometry.parameters.width,length:board.geometry.parameters.height,heading:Math.atan2(-nose.x,nose.z),source:profile.texture.image.src,depthTest:board.material.depthTest};
          },id,x,z,time,lean);
          report.scenes.push({view,surface,...result});
          if(surface!=='edge'&&(view==='phone'||surface==='flat'))await page.screenshot({path:path.join(review,view+'-'+id+'-'+surface+'.png')});
        }
      }
    }
    report.lanes=await page.evaluate(()=>{
      const g=game,dt=1/60,violations=[];let encounters=0;
      for(const ids of [['grandma','dj'],['couple','blonde']]){
        g.reset();g.race.enabled=false;g.rivalCast.reset();g.state='paused';g.wave.resetWaves(42);g.rivals.forEach((r,i)=>{g.rivalCast.apply(r,g.rivalCast.profiles.find(p=>p.id===ids[i]));r.collided=true;});
        for(let i=0;i<2800;i++){
          g.time=i*dt;g.wave.time=g.time;g.p.z=g.time*26;g.updateRivals(dt);
          for(const r of g.rivals)for(const ramp of g.trickRoute.lines){
            const at=g.trickRoute.local(ramp,r.x,r.z);
            if(at.t<.08||at.t>.92)continue;encounters++;
            const clearance=Math.abs(at.across)-g.trickRoute.widthAt(ramp,at.t)/2;
            if(clearance<.65&&violations.length<12)violations.push({id:r.id,ramp:ramp.prop||ramp.type,z:r.z,clearance});
          }
        }
      }
      return {encounters,violations};
    });
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    if(!process.argv.includes('--inspect')){
      assert.deepEqual(report.errors,[]);
      assert.ok(report.lanes.encounters>100,'rival routes cover the full set of physical ramps');assert.deepEqual(report.lanes.violations,[],'rivals remain on water lanes around ramps');
      for(const s of report.scenes){
        assert.ok(s.feet.every(f=>Number.isFinite(f.x)&&Number.isFinite(f.y)),s.id+' finite contacts');
        assert.equal(s.riders,s.id==='couple'?2:1,'two separately supported adults share one tandem board');
        assert.ok(s.feet.every(f=>Math.abs(f.x)<s.width*.5&&Math.abs(f.y)<s.length*.47),s.view+' '+s.surface+' '+s.id+' every foot projects inside the deck: '+JSON.stringify(s.feet));
        assert.ok(Math.abs(s.heading)<.6,s.id+' surfboard points in the travel direction');
      }
    }
    const contacts=report.scenes.flatMap(s=>s.feet.map(f=>({...f,side:Math.abs(f.x)/(s.width*.5)})));
    console.log(JSON.stringify({scenes:report.scenes.length,maxSide:Math.max(...contacts.map(f=>f.side)),minWater:Math.min(...contacts.map(f=>f.waterClearance)),minDeck:Math.min(...contacts.map(f=>f.deckClearance)),errors:report.errors},null,2));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
