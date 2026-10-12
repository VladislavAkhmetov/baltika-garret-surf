const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const review=path.resolve(__dirname,'../review/comics/rival-visibility');fs.mkdirSync(review,{recursive:true});
  const report={errors:[],views:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();game.journey.hideAll();});
    for(const [name,width,height] of [['phone',393,852],['small',360,640],['landscape',844,390],['desktop',1240,900]]){
      await page.setViewport({width,height});
      const view=await page.evaluate(name=>{
        const g=game,dt=1/60,frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
        function visible(r){
          g.camera.updateMatrixWorld(true);g.scene.updateMatrixWorld(true);
          frustum.setFromProjectionMatrix(matrix.multiplyMatrices(g.camera.projectionMatrix,g.camera.matrixWorldInverse));
          return [r.rig.card,r.rig.partner,r.rig.board,r.rig.shadow].filter(o=>o&&o.visible).some(o=>frustum.intersectsBox(new THREE.Box3().setFromObject(o)))||
            r.wake.some(o=>o.visible&&frustum.intersectsBox(new THREE.Box3().setFromPoints([-1,1].flatMap(x=>[-1,1].map(y=>new THREE.Vector3(x*o.scale.x/2,y*o.scale.y/2,0).applyQuaternion(g.camera.quaternion).add(o.position))))));
        }
        function setup(scene,air=false){
          g.reset();g.state='paused';g.resize();g.race.cursor=g.race.scenes.length;
          g.p.z=scene.z;g.p.x=name==='small'?7:-4;g.p.speed=36;g.time=g.wave.time=scene.z/32;
          g.p.y=g.wave.height(g.p.x,g.p.z);g.p.airborne=air;g.p.airY=air?7:0;g.p.y+=g.p.airY;
          g.jump.lastHeight=air?9:0;g.jump.launchStrength=air?1:0;g.jump.airTime=air?.5:0;
          g.juice.fov=70;g.p.smoothLean=.8;g.updateCamera(1,true);g.updateVisuals(0);
        }
        const starts=[],trajectories=[];
        for(const scene of g.race.scenes){
          setup(scene);const started=g.race.begin(scene),r=g.rivals[scene.slot];g.updateVisuals(0);
          const start={id:scene.id,started,visible:visible(r),gap:r.z-g.p.z};starts.push(start);
          let entered=false,removed=false,unsafeRemoval=false,maxStep=0,collidedOnEntry=false,replacedInView=false,exitFaded=false;
          for(let i=0;i<60*16&&r.encounter;i++){
            const wasVisible=visible(r),oldX=r.x,oldZ=r.z,phase=r.encounter.phase;
            g.time+=dt;g.wave.time=g.time;g.p.z+=g.p.speed*dt;g.p.y=g.wave.height(g.p.x,g.p.z);
            g.race.step(dt);
            if(!r.encounter){removed=true;unsafeRemoval=wasVisible;break;}
            g.updateRivals(dt);g.updateVisuals(dt);
            maxStep=Math.max(maxStep,Math.hypot(r.x-oldX,r.z-oldZ));
            if(visible(r)){
              entered=true;
              if(i%15===0){const id=r.id;replacedInView||=g.race.begin({...scene,id:scene.id==='grandma'?'dj':'grandma'})||r.id!==id;}
            }
            if(phase==='entry'&&r.collided)collidedOnEntry=true;
            if(r.encounter.phase==='exit'&&visible(r)&&r.rig.card.material.opacity<1)exitFaded=true;
          }
          trajectories.push({id:scene.id,entered,removed,unsafeRemoval,maxStep,collidedOnEntry,replacedInView,exitFaded});
        }
        // A large airborne camera and FOV kick must still start the full tandem outside.
        const tandem=g.race.scenes.find(s=>s.id==='couple');setup(tandem,true);
        const airborneStart=g.race.begin(tandem);g.updateVisuals(0);
        const airborne={started:airborneStart,visible:visible(g.rivals[tandem.slot])};
        // The feet can be below the screen while the top of a rider remains visible.
        setup(tandem);g.race.begin(tandem);const r=g.rivals[tandem.slot];let partial=null;
        for(let gap=0;gap<60;gap+=.25){
          r.z=g.p.z-gap;g.updateVisuals(0);
          const point=new THREE.Vector3(-r.x,g.wave.height(r.x,r.z),r.z).project(g.camera);
          if((Math.abs(point.x)>1||Math.abs(point.y)>1||Math.abs(point.z)>1)&&visible(r)){
            r.encounter.age=10;r.encounter.phase='exit';r.encounter.exitAt=0;g.race.step(0);
            partial={gap,retained:!!r.encounter};break;
          }
        }
        g.state='paused';return {name,starts,trajectories,airborne,partial};
      },name);
      report.views.push(view);
      for(const start of view.starts){assert.ok(start.started,`${name}: ${start.id} starts`);assert.equal(start.visible,false,`${name}: ${start.id} spawns outside the camera`);}
      assert.ok(view.airborne.started&&!view.airborne.visible,`${name}: airborne tandem spawns outside the camera`);
      for(const t of view.trajectories){
        assert.ok(t.entered&&t.removed,`${name}: ${t.id} enters and exits by moving`);
        assert.ok(t.maxStep<1.2,`${name}: ${t.id} moves continuously`);
        assert.ok(!t.unsafeRemoval&&!t.collidedOnEntry&&!t.replacedInView&&!t.exitFaded,`${name}: ${t.id} lifecycle is safe`);
      }
      assert.ok(view.partial?.retained,`${name}: a partially visible rider cannot be recycled`);
    }
    assert.deepEqual(report.errors,[]);
    console.log(JSON.stringify(report,null,2));
  }finally{
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
