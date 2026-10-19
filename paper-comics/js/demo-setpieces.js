/* The middle of the race gets landmarks, living water and optional current rides.
   Scenery stays outside the board corridor; current rewards require actual riding. */
class DemoSetpieces {
  constructor(game){
    this.game=game;this.materials=new Map();this.landmarks=[];this.washes=[];
    this.accents=[
      {from:470,to:605,amount:.5,sky:0x91a99b,fog:0xe0d1b6,deep:0x195b64,clear:0x59aaa1},
      {from:736,to:872,amount:.65,sky:0x53b4b8,fog:0xc1e4d9,deep:0x096b83,clear:0x67c6b2}
    ];
    this.boxGeometry=new THREE.BoxGeometry(1,1,1);this.sphereGeometry=new THREE.SphereGeometry(1,12,8);
    this.makeLighthouse();this.makeWreck();this.makeArch();
    this.dolphinPod=new DolphinPod(game);this.dolphins=this.dolphinPod.dolphins;
    this.currents=[{id:'lighthouse',from:365,to:425,offset:1.9},{id:'arch',from:766,to:846,offset:-1.9}].map(c=>this.makeCurrent(c));
    this.spray=new THREE.InstancedMesh(new THREE.SphereGeometry(.09,5,4),new THREE.MeshBasicMaterial({color:0xfff1d2,transparent:true,opacity:.7,depthWrite:false}),48);
    this.spray.frustumCulled=false;this.spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);game.scene.add(this.spray);
    this.dummy=new THREE.Object3D();this.point=new THREE.Vector3();this.reset();
  }
  load() {
    if (this._readyPromise) return this._readyPromise;
    this._readyPromise=Promise.all([this.game.rush.ready.then(()=>this.applyRockPrint()),this.dolphinPod.ready]);
    this._readyPromise.catch(()=>{});
    return this._readyPromise;
  }
  get ready() {
    return this._readyOverride || this.load();
  }
  set ready(v) {
    this._readyOverride = v;
  }
  ink(color){if(!this.materials.has(color))this.materials.set(color,this.game.paperToon.material(color));return this.materials.get(color);}
  mesh(parent,geometry,color,position=[0,0,0],scale=null){
    const mesh=new THREE.Mesh(geometry,this.ink(color));mesh.position.set(...position);if(scale)mesh.scale.set(...scale);parent.add(mesh);return mesh;
  }
  box(parent,position,scale,color){return this.mesh(parent,this.boxGeometry,color,position,scale);}
  tube(parent,points,radius,color){
    return this.mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),18,radius,6,false),color);
  }
  landmark(id,x,z,extent){
    const group=new THREE.Group();group.name=id;group.position.set(x,0,z);this.game.scene.add(group);
    this.landmarks.push({id,x,z,extent,group});return group;
  }
  wash(parent,x,z,radius,stretch=1){
    const geometry=new THREE.RingGeometry(radius-.35,radius+.4,40);geometry.rotateX(-Math.PI/2);
    const pos=geometry.attributes.position,uv=geometry.attributes.uv;
    for(let i=0;i<pos.count;i++){pos.setXYZ(i,pos.getX(i)+x,0,pos.getZ(i)*stretch+z);uv.setXY(i,i%41/40*3,Math.floor(i/41));}
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:this.game.wave.foamTexture,color:0xf4ecd5,transparent:true,opacity:.8,alphaTest:.08,depthWrite:false,side:THREE.DoubleSide}));
    mesh.userData.waterWash=true;mesh.frustumCulled=false;parent.add(mesh);this.washes.push({mesh,rest:pos.array.slice()});
  }
  applyRockPrint(){
    const texture=this.game.rush.scenery.find(p=>p.mesh.isSprite)?.mesh.material.map;if(!texture)return;
    const crop=texture.clone();crop.repeat.set(.3,.48);crop.offset.set(.3,.06);crop.needsUpdate=true;
    const material=this.game.paperToon.material(0xe8cfac,{map:crop,printMix:.65});
    for(const root of [this.arch,this.lighthouse])root.traverse(mesh=>{
      if(mesh.isMesh&&[0xc9b28f,0xa79378,0xe3cfaa,0xbca88a,0xbfa986].includes(mesh.material.uniforms?.uInk?.value.getHex()))mesh.material=material;
    });
    this.game.renderDirty=true;
  }
  makeLighthouse(){
    const g=this.landmark('lighthouse',14.8,394,22);
    const rock=this.mesh(g,new THREE.CylinderGeometry(2.9,4.3,5,7,2),0xbfa986,[0,.4,0]);rock.rotation.y=.2;
    this.mesh(g,new THREE.CylinderGeometry(2.4,2.8,.8,12),0xe3cfac,[0,3.1,0]);
    for(let i=0;i<5;i++)this.mesh(g,new THREE.CylinderGeometry(1.5-i*.08,1.58-i*.08,2.25,12),i%2?0xcf7256:0xf1dfbd,[0,4.6+i*2.25,0]);
    this.mesh(g,new THREE.CylinderGeometry(1.62,1.62,.22,12),0x274e56,[0,14.9,0]);
    this.mesh(g,new THREE.CylinderGeometry(1.1,1.1,1.5,10),0x7ea6a5,[0,15.7,0]);
    this.mesh(g,this.sphereGeometry,0xffd77a,[0,15.7,-.93],[.6,.6,.18]);
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2;this.box(g,[Math.cos(a)*1.13,15.7,Math.sin(a)*1.13],[.12,1.6,.12],0x274e56);
    }
    this.mesh(g,new THREE.ConeGeometry(1.8,1.6,12),0x315664,[0,17.3,0]);
    for(const y of [5.1,9.6,14.1])this.box(g,[0,y,-1.43],[.38,.65,.08],0x294d55);
    this.tube(g,[[-2,3.55,-1.5],[0,3.55,-2.4],[2,3.55,-1.5]],.065,0x315664);
    this.wash(g,0,0,4.5);
    this.lighthouse=g;
  }
  makeWreck(){
    const g=this.landmark('wreck',-17.5,546,30);g.rotation.y=.25;g.scale.x=-1;
    this.mesh(g,this.sphereGeometry,0x795638,[0,.25,0],[2.5,1.5,12]);
    this.mesh(g,this.sphereGeometry,0xc39559,[0,1.04,0],[2.12,.18,10.2]);
    for(let i=0;i<9;i++){
      const z=-9.5+i*2.35,w=2.2*Math.sqrt(Math.max(.15,1-(z/12)**2));
      this.tube(g,[[-w,1.1,z],[-w*.9,2.2,z],[0,2.65,z],[w*.9,2.2,z],[w,1.1,z]],.14,0x614833);
      if(i%3!==1)for(const side of [-1,1])this.box(g,[side*w,1.7,z],[.2,1.2,1.9],i%2?0xa8794d:0x997047);
    }
    const mast=this.mesh(g,new THREE.CylinderGeometry(.14,.23,16,7),0x8d673f,[-.6,8,-1]);mast.rotation.z=.16;
    const boom=this.box(g,[-.5,5.6,-1],[.18,.18,8.7],0x8d673f);boom.rotation.x=.06;
    const sail=new THREE.Shape();sail.moveTo(0,0);sail.lineTo(-1.6,10.5);sail.lineTo(-7.1,1.3);
    sail.lineTo(-5.5,1.8);sail.lineTo(-5.1,.7);sail.lineTo(-3.9,1.6);sail.lineTo(-3.3,.2);sail.lineTo(-1.8,1);sail.closePath();
    const rag=this.mesh(g,new THREE.ShapeGeometry(sail),0xe6d6b2,[-.9,5.7,-1.15]);rag.scale.x=.45;
    this.tube(g,[[-1.95,15,-1],[2,8,4],[2.4,2.2,9]],.045,0xe6d6b2);
    this.tube(g,[[-1.95,15,-1],[-1.8,6,-6],[-1.6,1.5,-11]],.045,0xe6d6b2);
    this.mesh(g,new THREE.TorusGeometry(.8,.18,7,18),0xcc7850,[1.8,2.1,-5]);
    this.wash(g,0,0,2.75,4.3);
    this.wreck=g;
  }
  makeArch(){
    const g=this.landmark('sea-arch',0,812,28);
    // Feet begin beyond |scene X|=11. The roof is well above the highest board flight.
    const path=[[-15,-2,0],[-15,7,0],[-11,19,0],[-5,24,0],[4,25,0],[12,18,0],[15,6,0],[15,-2,0]];
    this.tube(g,path,2.8,0xc9b28f);
    for(const side of [-1,1]){
      const foot=this.mesh(g,new THREE.CylinderGeometry(3.2,4.3,5.5,7),0xa79378,[side*15,.6,0]);foot.rotation.y=side*.3;
      this.mesh(g,new THREE.DodecahedronGeometry(2.2,0),0xe3cfaa,[side*14,8,1.5],[1,1.6,1]);
      this.mesh(g,new THREE.DodecahedronGeometry(1.6,0),0xbca88a,[side*11.8,16,1.2],[1.1,1.8,1]);
    }
    this.mesh(g,new THREE.DodecahedronGeometry(1.1,0),0x73936c,[-7.6,26.1,0],[2,.4,1.3]);
    this.wash(g,-15,0,4.4);this.wash(g,15,0,4.4);
    this.arch=g;
  }
  makeCurrent(config){
    const g=this.game,c={...config,bands:[]};
    for(const offset of [-.57,0,.57]){
      const geometry=new THREE.PlaneGeometry(offset===0?.52:.3,config.to-config.from,1,36);geometry.rotateX(-Math.PI/2);
      const material=new THREE.MeshBasicMaterial({map:g.wave.foamTexture,color:0xffedc5,transparent:true,opacity:.78,alphaTest:.08,depthWrite:false,side:THREE.DoubleSide,
        polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
      const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.name='current-'+config.id;g.scene.add(mesh);c.bands.push({mesh,offset});
    }
    return c;
  }
  center(c,z){
    // Both sections are between straight ramps. Keeping the flow in the middle
    // leaves the side-ramp decks and edge reefs outside the rideable stream.
    return THREE.MathUtils.clamp(this.game.trickRoute.routePoint(z)+c.offset,-4.2,4.2);
  }
  currentAt(x,z){
    if(!this.enabled)return {strength:0,flowX:0,flowZ:0,current:null};
    const c=this.currents.find(c=>z>c.from&&z<c.to);if(!c)return {strength:0,flowX:0,flowZ:0,current:null};
    const center=this.center(c,z),fade=this.game.wave.smooth((z-c.from)/10)*this.game.wave.smooth((c.to-z)/10);
    const strength=Math.exp(-Math.pow((x-center)/.92,2))*fade;
    const slope=(this.center(c,z+.5)-this.center(c,z-.5)),length=Math.hypot(1,slope);
    return {strength,flowX:slope/length*strength*8,flowZ:strength*8/length,current:c};
  }
  paletteAt(z){
    if(!this.enabled)return null;
    const accent=this.accents.find(a=>z>a.from&&z<a.to);if(!accent)return null;
    return {...accent,mix:accent.amount*this.game.wave.smooth((z-accent.from)/35)*this.game.wave.smooth((accent.to-z)/35)};
  }
  reset(){
    this.enabled=!this.game.flowTest;this.events=[];this.podAt=null;this.podOriginZ=null;this.podDone=false;this.dolphinPod.reset();
    for(const c of this.currents){c.hold=0;c.won=false;for(const b of c.bands){b.mesh.visible=false;b.mesh.material.color.set(0xffedc5);}}
    this.landmarks.forEach(l=>l.group.visible=false);this.dolphins.forEach(d=>d.group.visible=false);this.spray.visible=false;
  }
  step(dt,previous){
    if(!this.enabled)return;
    const g=this.game,p=g.p,advancing=p.z>=previous.z&&p.z-previous.z<=Math.max(3,p.speed*dt*2);
    if(advancing&&this.podAt===null&&p.z>=779&&p.z<864){
      this.podAt=g.time;this.podOriginZ=p.z;this.dolphinPod.start(g.time,p.z);this.events.push({type:'dolphins',z:p.z,time:g.time});
    }
    if(this.podAt!==null&&g.time-this.podAt>4.8)this.podDone=true;
    for(const c of this.currents){
      if(c.won)continue;
      const flow=this.currentAt(p.x,p.z),riding=advancing&&flow.current===c&&flow.strength>.62&&!p.airborne&&!p.fallen&&p.recovering===0&&
        !g.trickRoute.riding&&p.speed>25&&Math.abs(p.heading)<.48&&p.balance<.6;
      c.hold=riding?c.hold+dt:0;
      if(c.hold>=.55){
        c.won=true;g.waveRide.momentum=Math.min(8,g.waveRide.momentum+4);
        g.awardTrick('ПОПУТНОЕ ТЕЧЕНИЕ',180);g.audio.playCarve(.7);g.juice.punch(2);g.rush.splash(.45);
        this.events.push({type:'current',id:c.id,z:p.z,time:g.time});
      }
    }
  }
  cue(){
    const g=this.game,p=g.p;
    if(!this.enabled||p.airborne||p.fallen||p.recovering>0||g.trickRoute.riding)return null;
    const c=this.currents.find(c=>!c.won&&p.z>c.from-25&&p.z<c.to-8);
    if(!c)return null;
    return {id:'route',title:'ПОПУТНОЕ ТЕЧЕНИЕ '+(this.center(c,Math.max(c.from+12,p.z+8))<p.x?'←':'→'),line:'Держи светлую струю — получишь разгон.'};
  }
  update(){
    const g=this.game,p=g.p;
    for(const l of this.landmarks)l.group.visible=this.enabled&&l.z-p.z+l.extent> -28&&l.z-p.z-l.extent<165;
    for(const wash of this.washes){
      if(!wash.mesh.parent.visible)continue;wash.mesh.parent.updateMatrixWorld(true);
      const pos=wash.mesh.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        this.point.set(wash.rest[i*3],0,wash.rest[i*3+2]).applyMatrix4(wash.mesh.parent.matrixWorld);
        pos.setY(i,g.wave.height(-this.point.x,this.point.z)+.07);
      }
      pos.needsUpdate=true;
    }
    for(const c of this.currents)for(const band of c.bands){
      const mesh=band.mesh;mesh.visible=this.enabled&&c.to>p.z-10&&c.from<p.z+125;if(!mesh.visible)continue;
      mesh.material.color.set(c.won?0xb0ddca:0xffedc5);
      const pos=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
      for(let row=0;row<=36;row++)for(let col=0;col<2;col++){
        const z=THREE.MathUtils.lerp(c.from,c.to,row/36),fade=Math.sin(row/36*Math.PI);
        const x=this.center(c,z)+band.offset+(col-.5)*(band.offset===0?.52:.3)*fade;
        pos.setXYZ(row*2+col,-x,g.wave.height(x,z)+.055,z);
        uv.setXY(row*2+col,row/36*5-(g.reducedMotion?0:g.time*.75),col);
      }
      pos.needsUpdate=uv.needsUpdate=true;
    }
    this.dolphinPod.update(this.podAt,this.podOriginZ??p.z,this.enabled&&!this.podDone);
    this.updateSpray();
  }
  updateSpray(){
    const g=this.game,p=g.p,sources=[{x:-14.8,z:390,height:4.5},{x:17.5,z:540,height:2.1},{x:15,z:807,height:3.2}];
    this.spray.visible=this.enabled&&!g.reducedMotion&&sources.some(s=>Math.abs(s.z-p.z)<150);if(!this.spray.visible)return;
    for(let i=0;i<48;i++){
      const s=sources[Math.floor(i/16)],phase=(g.time*.62+g.wave.hash(i*7))%1,spread=(g.wave.hash(i*13)-.5)*3.6;
      const envelope=Math.sin(phase*Math.PI),scale=(.4+g.wave.hash(i*3))*(Math.abs(s.z-p.z)<150?envelope:0);
      this.dummy.position.set(-s.x+spread*phase,g.wave.height(s.x,s.z)+.1+envelope*s.height,s.z-2-phase*5);
      this.dummy.scale.set(scale*.7,scale*1.5,scale);this.dummy.updateMatrix();this.spray.setMatrixAt(i,this.dummy.matrix);
    }
    this.spray.instanceMatrix.needsUpdate=true;
  }
}
window.DemoSetpieces=DemoSetpieces;
