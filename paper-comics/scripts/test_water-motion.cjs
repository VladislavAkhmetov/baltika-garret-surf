const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const review=path.resolve(__dirname,'../review/comics/water-motion');fs.mkdirSync(review,{recursive:true});
  let browser;const errors=[];
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGL|Shader|THREE/.test(m.text()))errors.push(m.text());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';});
    const motion=await page.evaluate(()=>{
      const g=game,w=g.wave;w.resetWaves(42);
      const moving=w.waves.reduce((best,w)=>w.height>best.height?w:best),t=moving.encounterTime,z=(moving.anchorFrom+moving.anchorTo)/2;
      w.time=t;const x=w.crestX(moving,z)+moving.width*.25,height=w.height(x,z,t,false),before=w.crestX(moving,z);
      w.time=t+2;
      const translation=w.crestX(moving,z+moving.velocityZ*2)-before;
      const fixedPointChange=Math.abs(w.height(x,z,t+2,false)-height);
      const profile=w.faceProfile.bind(w),epsilon=.00001;
      const joinSlopeError=Math.abs((profile(.1)-profile(.1-epsilon))/epsilon-(profile(.1+epsilon)-profile(.1))/epsilon);
      const sizes=w.waves.map(v=>({height:v.height,width:v.width,speedX:v.velocityX,speedZ:v.velocityZ}));
      // The opening and final faces are authored to follow their routes.
      // Density and oblique-crest checks apply to the generated train between them.
      const generated=w.waves.slice(1,-1);
      const centers=generated.map(v=>(v.anchorFrom+v.anchorTo)/2);
      const crestTangents=generated.map(v=>{const z=(v.anchorFrom+v.anchorTo)/2;return (w.crestX(v,z+1)-w.crestX(v,z-1))/2;});
      const maxGap=Math.max(...centers.slice(1).map((z,i)=>z-centers[i]));
      const visiblePeaks=centers.filter(z=>z>790&&z<990).length;
      w.resetWaves(42);const deterministic=JSON.stringify(sizes)===JSON.stringify(w.waves.map(v=>({height:v.height,width:v.width,speedX:v.velocityX,speedZ:v.velocityZ})));
      return {translation,expected:moving.velocityX*2,fixedPointChange,joinSlopeError,sizes,deterministic,maxGap,visiblePeaks,crestTangents};
    });
    assert.ok(Math.abs(motion.translation-motion.expected)<1e-8,'crest translates independently in world space');
    assert.ok(motion.fixedPointChange>.04,'stationary world point experiences a passing wave');
    assert.ok(motion.joinSlopeError<.002,'crest and face join without a sharp normal seam');
    assert.ok(motion.deterministic&&new Set(motion.sizes.map(v=>v.height)).size===motion.sizes.length);
    assert.ok(motion.sizes.length>14&&motion.maxGap<60&&motion.visiblePeaks>=3,'a succession of peaks replaces long empty stretches');
    assert.ok(motion.crestTangents.every(v=>v>.08&&v<.24),'crests are oblique along the route, rather than transverse walls');
    assert.ok(motion.sizes.every(v=>v.speedX>0&&Math.abs(v.speedZ)<v.speedX*.24),'waves propagate mainly towards the beach');
    const frames=[];
    const ride=await page.evaluate(()=>{
      const g=game,dt=1/120;g.reset();g.wave.resetWaves(42);g.state='playing';g.input.mode='touch';
      g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
      g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);g.comics.trigger=()=>false;
      const w=g.wave.waves.filter(w=>w.encounterTime<38).reduce((best,w)=>w.height>best.height?w:best);
      g.p.z=(w.anchorFrom+w.anchorTo)/2-18;g.time=g.p.z/25;g.wave.time=g.time;g.p.x=g.wave.crestX(w,g.p.z)+.1;g.p.y=g.wave.height(g.p.x,g.p.z);g.updateCamera(1,true);
      const orientation=g.camera.quaternion.clone();let angular=0,verticalSpeed=0,maxFov=0,jumped=false,spin=false;
      let previousVelocity=null,verticalAcceleration=0,forwardAcceleration=0;
      let minTop=1,maxBottom=0,maxX=0;const trace=[];
      for(let i=0;i<640;i++){
        const p=g.p;
        g.input.target=i<170?.3:i<350?-.3:0;
        const s=g.wave.sample(p.x,p.z);
        if(!jumped&&s.wave?.id===w.id&&s.zone==='crest'){g.jump.press();jumped=true;}
        if(jumped&&!spin&&g.jump.canSpin){g.jump.press();spin=true;}
        if(i===380)p.speed*=.65; // The abrupt speed loss used by a real collision.
        const before=g.camera.position.clone();g.step(dt);g.updateCamera(dt);
        const velocity=g.camera.position.clone().sub(before).divideScalar(dt);
        if(previousVelocity){verticalAcceleration=Math.max(verticalAcceleration,Math.abs(velocity.y-previousVelocity.y)/dt);forwardAcceleration=Math.max(forwardAcceleration,Math.abs(velocity.z-previousVelocity.z)/dt);}
        previousVelocity=velocity;
        angular=Math.max(angular,orientation.angleTo(g.camera.quaternion));
        verticalSpeed=Math.max(verticalSpeed,Math.abs(g.camera.position.y-before.y)/dt);
        maxFov=Math.max(maxFov,Math.abs(g.camera.fov-58));
        if(i%12===0){
          g.updateVisuals(0);g.scene.updateMatrixWorld(true);
          const card=g.player.card,corners=[];
          for(const x of [-.5,.5])for(const y of [-.5,.5])corners.push(card.localToWorld(new THREE.Vector3(x*g.heroAnimator.width,y*g.heroAnimator.height,0)).project(g.camera));
          minTop=Math.min(minTop,...corners.map(v=>(1-v.y)/2));maxBottom=Math.max(maxBottom,...corners.map(v=>(1-v.y)/2));maxX=Math.max(maxX,...corners.map(v=>Math.abs(v.x)));
          trace.push({frame:i,z:p.z,y:p.y,x:p.x,air:p.airY,camera:g.camera.position.toArray(),speed:p.speed});
        }
      }
      const beforeFreeze=g.camera.position.clone(),scale=g.comics.timeScale;g.comics.timeScale=0;
      for(let i=0;i<30;i++)g.updateCamera(1/60);
      const freezeDrift=beforeFreeze.distanceTo(g.camera.position);g.comics.timeScale=scale;
      g.chain.bank();const deliveredBefore=g.score;g.mug.level=.8;g.finish();const delivered=g.score-deliveredBefore;g.finish();
      const duplicated=g.score-deliveredBefore-delivered;
      g.state='paused';return {angular,verticalSpeed,verticalAcceleration,forwardAcceleration,freezeDrift,maxFov,minTop,maxBottom,maxX,jumped,spin,jumps:g.jump.jumps,landings:g.jump.cleanLandings,tricks:g.jump.tricks,delivered,duplicated,trace};
    });
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({motion,ride,errors},null,2));
    assert.ok(ride.angular<=.062,'steering adds only a gentle camera roll (<=3.5 degrees)');
    assert.ok(ride.verticalSpeed<=2.60001&&ride.maxFov<=12,'camera ascent is bounded and the speed FOV stays within 58-70 degrees');
    assert.ok(ride.verticalAcceleration<26.1&&ride.forwardAcceleration<130,'landing and collision change camera velocity gradually');
    assert.equal(ride.freezeDrift,0,'comic freeze cannot make the camera creep towards the surfer');
    assert.ok(ride.jumped&&ride.spin&&ride.landings>=1&&ride.tricks>=1,'tap jump and optional trick work during an actual moving-wave ride, with additional ramp landings allowed');
    assert.ok(ride.minTop>=0&&ride.maxBottom<=1.03&&ride.maxX<1.05,'surfer remains framed during steering and a high jump: '+JSON.stringify([ride.minTop,ride.maxBottom,ride.maxX]));
    assert.equal(ride.delivered,4000);assert.equal(ride.duplicated,0,'delivery reward is applied only once');
    // Render successive real simulation frames with the same damped camera.
    await page.evaluate(()=>{
      const g=game;g.reset();g.wave.resetWaves(42);g.journey.hideAll();document.getElementById('result-screen').classList.add('hidden');g.container.classList.add('playing');g.state='paused';g.input.mode='touch';g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.jump.tricks=1;
      g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);g.p.z=795;g.p.x=-2;g.time=g.p.z/25;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,g.p.z);g.updateCamera(1,true);
    });
    for(let frame=0;frame<24;frame++){
      await page.evaluate(()=>{const g=game;g.state='playing';for(let i=0;i<12;i++){g.step(1/120);g.updateCamera(1/120);}g.state='paused';g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);});
      const filename=path.join(review,'frame-'+String(frame).padStart(2,'0')+'.jpg');await page.screenshot({path:filename,type:'jpeg',quality:82});frames.push(filename);
    }
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({motion,ride,frames,errors},null,2));
    assert.deepEqual(errors,[]);console.log(JSON.stringify({angular:ride.angular,verticalSpeed:ride.verticalSpeed,framing:[ride.minTop,ride.maxBottom,ride.maxX],movingWaves:motion.sizes.length,tricks:ride.tricks},null,2));
    console.log('PASS: travelling wave field, smooth crest, stable camera, high-jump framing and delivery bonus.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
