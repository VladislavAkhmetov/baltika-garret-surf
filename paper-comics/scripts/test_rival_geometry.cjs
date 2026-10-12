// Exercise the shipping race, rival movement, pose, wave and camera code without WebGL.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('../libs/three.min.js');
const element=()=>({classList:{add(){},remove(){},toggle(){}},style:{},append(){},setAttribute(){}});
class TextureLoader{load(){return new THREE.Texture();}}
const context=vm.createContext({console,URLSearchParams,location:{search:''},THREE:{...THREE,TextureLoader},document:{readyState:'loading',createElement:element},addEventListener(){}});
context.window=context;
for(const file of ['comics-course.js','flow-test.js','paper-wave.js','arcade-juice.js','rival-cast.js','surf-race.js','paper-prototype.js']){
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../js',file),'utf8'),context,{filename:file});
}
const Game=vm.runInContext('PaperSurfGame',context),Wave=context.PaperWave,Cast=context.RivalCast,Race=context.SurfRace;
const Juice=vm.runInContext('ArcadeJuice',context);
function fixture(width,height,seed){
  const g=Object.create(Game.prototype);
  g.scene=new THREE.Scene();g.camera=new THREE.PerspectiveCamera(58,width/height,.15,1800);
  g.container={...element(),clientWidth:width,clientHeight:height};g.textures={surfer_norma:null};g.surfboardTexture=null;g.player={};g.state='playing';g.time=0;
  g.wave=Object.create(Wave.prototype);g.wave.scene=g.scene;g.wave.waves=Array.from({length:21},(_,id)=>({id}));g.wave.resetWaves(seed);
  g.trickRoute={lines:[],routePoint:()=>0};g.setpiece={steerRival:(_,x)=>x,canStartRival:()=>true};
  g.comics=g.onboarding={timeScale:1};g.chase={active:false,gap:Infinity};g.jump={airTime:0,lastHeight:0,launchStrength:0,landingAge:1};
  g.juice=Object.create(Juice.prototype);Object.assign(g.juice,{game:g,liveCamera:true,roll:0,fov:70,kick:0});
  g.nearMiss=g.emit=g.awardTrick=()=>{};g.juice.pop=()=>{};g.impactCooldown=0;
  g.mug={level:1};g.spill=()=>{g.mug.level-=.08;};g.score=0;
  g.rivals=[0,1].map(index=>({index,rig:g.makeSurfer(1,0xffffff),wake:Array.from({length:9},()=>g.sprite(null,.25,.25))}));
  g.rivalCast=new Cast(g);
  // Render fixtures use production adult heights, tandem deck scales and foot anchors.
  // Image decoding and GPU pixels belong to the companion browser test.
  for(const profile of g.rivalCast.profiles){
    for(const part of profile.parts||[profile])Object.assign(part,{texture:new THREE.Texture(),width:part.height*.65,foot:new THREE.Vector3(0,-part.height*.43,0),contacts:[new THREE.Vector3(-.15,0,0),new THREE.Vector3(.15,0,0)]});
    if(profile.parts)Object.assign(profile,{texture:profile.parts[0].texture,width:profile.parts[0].width,foot:profile.parts[0].foot,contacts:profile.parts[0].contacts});
  }
  g.rivalCast.reset();g.race=new Race(g);g.race.cursor=g.race.scenes.length;
  return g;
}
function pose(g,dt=0,snap=false){
  g.updateCamera(dt,snap);
  for(const r of g.rivals){
    g.updateSurfer(r.rig,r.x,r.z,g.wave.height(r.x,r.z)+r.airY,r.lean,r.airY,0,0);
    r.rig.group.visible=r.rig.shadow.visible=!!r.encounter;
    r.wake.forEach((drop,i)=>{const z=r.z-1-i*.65,x=r.x+Math.sin(i*2+g.time*4)*.2;drop.position.set(-x,g.wave.height(x,z)+.06,z);drop.scale.set(.4+i*.05,.14+i*.02,1);drop.visible=!!r.encounter&&r.airY<.3;});
  }
  g.race.update();g.scene.updateMatrixWorld(true);
}
function visible(g,r){
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(g.camera.projectionMatrix,g.camera.matrixWorldInverse));
  return [r.rig.card,r.rig.partner,r.rig.board,r.rig.shadow].filter(o=>o&&o.visible).some(o=>frustum.intersectsBox(new THREE.Box3().setFromObject(o)))||
    r.wake.some(o=>o.visible&&frustum.intersectsBox(new THREE.Box3().setFromPoints([-1,1].flatMap(x=>[-1,1].map(y=>new THREE.Vector3(x*o.scale.x/2,y*o.scale.y/2,0).applyQuaternion(g.camera.quaternion).add(o.position))))));
}
const runs=[];
for(const [name,width,height] of [['phone',393,852],['small',360,640],['landscape',844,390],['desktop',1240,900]]){
  for(const seed of [42,7,93]){
    const g=fixture(width,height,seed);
    for(const scene of g.race.scenes){
      g.rivalCast.reset();g.race.reset();g.race.cursor=g.race.scenes.length;
      g.p={x:name==='small'?7:-4,z:scene.z,speed:36,heading:0,sideVelocity:0,lean:0,smoothLean:.8,airY:0,airborne:false};
      g.time=g.wave.time=scene.z/32;g.p.y=g.wave.height(g.p.x,g.p.z);pose(g,0,true);
      assert.ok(g.race.begin(scene));const r=g.rivals[scene.slot];pose(g);
      assert.equal(visible(g,r),false,`${name}/${seed}/${scene.id}: outside at birth`);
      let entered=false,removed=false,maxStep=0;
      for(let i=0;i<60*16&&r.encounter;i++){
        const wasVisible=visible(g,r),x=r.x,z=r.z,phase=r.encounter.phase;
        g.time+=1/60;g.wave.time=g.time;g.p.z+=g.p.speed/60;g.p.y=g.wave.height(g.p.x,g.p.z);
        g.race.step(1/60);
        if(!r.encounter){assert.equal(wasVisible,false,'a visible rig cannot be retired');removed=true;break;}
        g.updateRivals(1/60);pose(g,1/60);
        maxStep=Math.max(maxStep,Math.hypot(r.x-x,r.z-z));
        if(visible(g,r)){
          entered=true;assert.equal(r.rig.card.material.opacity,1,'no timed fade');
          const id=r.id;assert.equal(g.race.begin({...scene,id:id==='dj'?'couple':'dj'}),false,'no visible reuse');assert.equal(r.id,id);
        }
        if(phase==='entry')assert.equal(r.collided,false,'no collision while entering');
      }
      assert.ok(entered&&removed,`${name}/${seed}/${scene.id}: enters and leaves`);
      assert.ok(maxStep<1.2,'continuous motion at 60 Hz');runs.push({name,seed,id:scene.id,maxStep});
    }
    const tandem=g.race.scenes.find(s=>s.id==='couple');
    g.rivalCast.reset();g.race.reset();g.race.cursor=g.race.scenes.length;
    Object.assign(g.p,{x:0,z:520,airborne:true,airY:7,y:g.wave.height(0,520)+7});Object.assign(g.jump,{lastHeight:9,launchStrength:1,airTime:.5});pose(g,0,true);
    assert.ok(g.race.begin(tandem));pose(g);const r=g.rivals[0];assert.equal(visible(g,r),false,'airborne tandem starts outside');
    let partial=false;
    for(let gap=0;gap<70;gap+=.25){
      r.z=g.p.z-gap;pose(g);
      const foot=new THREE.Vector3(-r.x,g.wave.height(r.x,r.z),r.z).project(g.camera);
      if((Math.abs(foot.x)>1||Math.abs(foot.y)>1||Math.abs(foot.z)>1)&&visible(g,r)){
        r.encounter.age=10;r.encounter.phase='exit';r.encounter.exitAt=0;g.race.step(0);
        assert.ok(r.encounter,'retain a partially visible tandem after the old timeout');partial=true;break;
      }
    }
    assert.ok(partial,'exercise a visible silhouette with feet outside the viewport');
  }
}
const schedules=[];
for(const speed of [22,36,46]){
  const g=fixture(844,390,42);g.race.cursor=0;
  g.p={x:0,z:0,speed,heading:0,sideVelocity:0,lean:0,smoothLean:0,airY:0,airborne:false,y:g.wave.height(0,0)};pose(g,0,true);
  for(let i=0;i<60*70&&g.p.z<1060;i++){
    g.time+=1/60;g.wave.time=g.time;g.p.z+=g.p.speed/60;g.p.y=g.wave.height(g.p.x,g.p.z);
    g.race.step(1/60);g.updateRivals(1/60);pose(g,1/60);
  }
  assert.deepEqual(Array.from(g.race.events,e=>e.id),['grandma','couple','dj','blonde','grandma'],'all five encounters start before the finale');
  schedules.push({speed,starts:Array.from(g.race.events,e=>Math.round(e.z))});
}
console.log(`PASS: ${runs.length} encounters, four viewports, three wave seeds, airborne tandem, partial silhouette, continuous entry/exit, no visible reuse or fade.`);
console.log(JSON.stringify({schedules}));
