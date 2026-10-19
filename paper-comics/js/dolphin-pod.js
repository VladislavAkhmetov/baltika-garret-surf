/* Side-on paper dolphins cross a fixed patch of water ahead of the rider.
   The whole pod has time to submerge even if the board immediately reaches 46 m/s. */
class DolphinPod {
  constructor(game){
    this.game=game;this.duration=1.65;this.submerge=.18;this.spacing=.42;
    this.maxBoardSpeed=46;this.clearance=16;this.splashLife=.95;
    this.dolphins=Array.from({length:3},(_,index)=>this.makeDolphin(index));
    this.splashes=this.dolphins.flatMap(d=>[this.makeSplash(d,false),this.makeSplash(d,true)]);
    this.drops=new THREE.InstancedMesh(new THREE.SphereGeometry(.11,5,4),
      new THREE.MeshBasicMaterial({color:0xfff5dc,transparent:true,opacity:.82,depthWrite:false}),this.splashes.length*24);
    this.drops.name='dolphin-water-drops';this.drops.frustumCulled=false;
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);game.scene.add(this.drops);
    this.dummy=new THREE.Object3D();this.reset();
  }
  load() {
    if (this._readyPromise) return this._readyPromise;
    this._readyPromise=new Promise((resolve,reject)=>new THREE.TextureLoader().load('assets/comics/dolphin-paper-v3.webp',texture=>{
      texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
      const aspect=texture.image.width/texture.image.height;
      for(const d of this.dolphins){
        d.card.scale.y=3/aspect;d.card.material.map=texture;d.card.material.needsUpdate=true;
      }
      this.loaded=true;this.game.renderDirty=true;resolve();
    },undefined,()=>reject(new Error('Не удалось загрузить бумажных дельфинов'))));
    this._readyPromise.catch(()=>{});
    return this._readyPromise;
  }
  get ready() {
    return this._readyOverride || this.load();
  }
  set ready(v) {
    this._readyOverride = v;
  }
  makeDolphin(index){
    const width=[7.6,6.9,7.2][index],geometry=new THREE.PlaneGeometry(width,width/3,24,6);
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const card=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:false,side:THREE.DoubleSide}));
    card.name='paper-dolphin-profile';card.frustumCulled=false;
    const group=new THREE.Group();group.name='dolphin-'+index;group.add(card);this.game.scene.add(group);
    return {index,width,height:[4.8,6.6,5.4][index],group,card,rest:geometry.attributes.position.array.slice(),delay:index*this.spacing};
  }
  makeSplash(d,landing){
    const geometry=new THREE.RingGeometry(.48,1.05,32);geometry.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:this.game.wave.foamTexture,color:0xfff1d7,
      transparent:true,opacity:0,alphaTest:.04,depthWrite:false,side:THREE.DoubleSide}));
    mesh.name='dolphin-'+(landing?'dive':'launch')+'-foam';mesh.frustumCulled=false;this.game.scene.add(mesh);
    return {d,landing,mesh,rest:geometry.attributes.position.array.slice()};
  }
  reset(){
    this.startedAt=null;this.originZ=null;
    for(const d of this.dolphins)d.group.visible=false;
    for(const s of this.splashes)s.mesh.visible=false;
    this.drops.visible=false;
  }
  start(time,originZ){
    this.startedAt=time;this.originZ=originZ;
    for(const d of this.dolphins){
      // Each delayed jump gets its own extra lead. This covers the entire animal,
      // the board's nose and the brief tail-first submergence, not just its centre.
      const lead=this.maxBoardSpeed*(d.delay+this.duration+this.submerge)+this.clearance+d.width/2;
      d.startX=11.5+d.index*.55;d.startZ=originZ+lead;
      d.velocityX=-14;d.velocityZ=.7;
      d.endX=d.startX+d.velocityX*this.duration;d.endZ=d.startZ+d.velocityZ*this.duration;
      d.startY=this.game.wave.height(d.startX,d.startZ,time+d.delay,false);
      d.endY=this.game.wave.height(d.endX,d.endZ,time+d.delay+this.duration,false);
    }
  }
  update(startedAt,originZ,enabled){
    const g=this.game,active=enabled&&!g.reducedMotion&&this.loaded&&startedAt!==null;
    if(!active){
      for(const d of this.dolphins)d.group.visible=false;
      for(const s of this.splashes)s.mesh.visible=false;
      this.drops.visible=false;return;
    }
    if(this.startedAt!==startedAt)this.start(startedAt,originZ);
    const age=g.time-startedAt;
    for(const d of this.dolphins){
      const t=age-d.delay,u=THREE.MathUtils.clamp(t/this.duration,0,1);
      d.group.visible=t>=0&&t<this.duration+this.submerge;
      if(!d.group.visible)continue;
      const x=d.startX+d.velocityX*t,z=d.startZ+d.velocityZ*t;
      const rise=Math.sin(u*Math.PI)*d.height,water=THREE.MathUtils.lerp(d.startY,d.endY,u);
      const dive=Math.max(0,t-this.duration)*18;
      const vy=(d.endY-d.startY)/this.duration+Math.cos(u*Math.PI)*Math.PI/this.duration*d.height;
      d.group.position.set(-x,water-1+rise-dive,z);
      // Keep the illustrated side profile facing the viewer throughout the arc.
      d.group.quaternion.copy(g.camera.quaternion);d.group.rotateZ(-Math.atan2(vy,Math.abs(d.velocityX)));
      const pos=d.card.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        const px=d.rest[i*3],py=d.rest[i*3+1];
        const tail=THREE.MathUtils.clamp((px/d.width+.5-.57)/.43,0,1);
        const flex=Math.sin(t*7.5+d.index*.65)*.2*tail*tail;
        pos.setXYZ(i,px,py+flex,0);
      }
      pos.needsUpdate=true;
    }
    this.updateSplashes(age);
  }
  updateSplashes(age){
    const g=this.game;let visible=false;
    for(const [source,s] of this.splashes.entries()){
      const t=age-s.d.delay-(s.landing?this.duration-.08:0),u=t/this.splashLife;
      const active=t>=0&&u<1;s.mesh.visible=active;visible ||= active;
      const x=s.landing?s.d.endX:s.d.startX,z=s.landing?s.d.endZ:s.d.startZ;
      const surface=active?g.wave.height(x,z):0;
      if(active){
        const size=.65+t*(s.landing?3.4:2.7),pos=s.mesh.geometry.attributes.position;
        s.mesh.material.opacity=(s.landing?.65:.46)*(1-u)**1.5;
        for(let i=0;i<pos.count;i++){
          const worldX=-x+s.rest[i*3]*size,worldZ=z+s.rest[i*3+2]*size*.62;
          pos.setXYZ(i,worldX,g.wave.height(-worldX,worldZ)+.065,worldZ);
        }
        pos.needsUpdate=true;
      }
      for(let i=0;i<24;i++){
        const seed=source*53+i*7,angle=g.wave.hash(seed)*Math.PI*2;
        const speed=1.1+g.wave.hash(seed+2)*3.2;
        const flight=(s.landing?5.6:4.6)+g.wave.hash(seed+4)*2.2;
        const scale=active?Math.max(0,1-u)*(.55+g.wave.hash(seed+6)*.65):0;
        const dx=Math.cos(angle)*speed*Math.max(0,t),dz=Math.sin(angle)*speed*Math.max(0,t)*.6;
        const height=Math.max(0,flight*t-8*t*t);
        this.dummy.position.set(-x+dx+(s.landing?.8:-.6)*Math.max(0,t),surface+.08+height,z+dz);
        this.dummy.scale.set(scale*.75,scale*(1.7+height*.3),scale*.75);
        this.dummy.updateMatrix();this.drops.setMatrixAt(source*24+i,this.dummy.matrix);
      }
    }
    this.drops.visible=visible;this.drops.instanceMatrix.needsUpdate=true;
  }
}
window.DolphinPod=DolphinPod;
