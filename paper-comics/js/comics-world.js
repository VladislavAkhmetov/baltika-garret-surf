class ComicsWorld {
  constructor(game) {
    this.game=game;this.scene=game.scene;
    this.makeBeach();
    this.hazards=COMICS_COURSE.hazards.map((config,i)=>this.makeHazard(config,i));
    this.reset();
  }
  material(color) {return new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide});}
  makeBeach() {
    const n=90,geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((n+1)*2*3),3));
    const indices=[];for(let i=0;i<n;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}geometry.setIndex(indices);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const c=canvas.getContext('2d');c.fillStyle='#e4d0a0';c.fillRect(0,0,128,128);
    for(let i=0;i<4500;i++){c.fillStyle=i%3===0?'#f3e5c3':'#cfb989';c.globalAlpha=.15;c.fillRect(Math.random()*128,Math.random()*128,1,1);}c.globalAlpha=1;
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4,14);
    geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array((n+1)*2*2),2));
    for(let i=0;i<=n;i++){geometry.attributes.uv.setXY(i*2,0,i/n);geometry.attributes.uv.setXY(i*2+1,1,i/n);}
    this.beach=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));this.beach.frustumCulled=false;this.scene.add(this.beach);
    this.shore=this.game.wave.ribbon(0xf5ead0,.9);
    this.palms=[];
    const trunkMat=this.material(0x907247),leafMat=this.material(0x244d41);
    for(let i=0;i<6;i++){
      const group=new THREE.Group();
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12,.24,5,5),trunkMat);trunk.position.y=2.4;trunk.rotation.z=.12;group.add(trunk);
      for(let j=0;j<6;j++){
        const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(1.8,.25);shape.lineTo(2.6,-.65);shape.lineTo(.9,-.25);shape.closePath();
        const leaf=new THREE.Mesh(new THREE.ShapeGeometry(shape),leafMat);leaf.position.y=4.7;leaf.rotation.y=j/6*Math.PI*2;leaf.rotation.z=-.25;group.add(leaf);
      }
      this.scene.add(group);this.palms.push({group,offset:i*40+8});
    }
    this.umbrellas=[];
    for(let i=0;i<5;i++){
      const group=new THREE.Group();const pole=new THREE.Mesh(new THREE.CylinderGeometry(.04,.06,2.1,5),this.material(0xf5e5be));pole.position.y=1;group.add(pole);
      const canopy=new THREE.Mesh(new THREE.ConeGeometry(1.6,.65,8),this.material(i%2===0?0xdf6846:0xf3be3e));canopy.position.y=2;group.add(canopy);this.scene.add(group);this.umbrellas.push({group,offset:i*48+30});
    }
  }
  makeHazard(config,index) {
    const group=new THREE.Group();let labelText='',color='#ae533b',fin=null;
    const cream=this.material(0xf3e8cc),red=this.material(0xe66540),dark=this.material(0x153d4d);
    if(config.type==='buoy'){
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.7,.95,.3,8),cream);group.add(base);
      const top=new THREE.Mesh(new THREE.ConeGeometry(.58,1.15,6),red);top.position.y=.6;group.add(top);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.8,4),dark);pole.position.y=.9;group.add(pole);
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(.75,.5),cream);flag.position.set(.35,1.7,0);group.add(flag);
    }else if(config.type==='shark'){
      fin=new THREE.Mesh(new THREE.PlaneGeometry(2.4,2.4),new THREE.MeshBasicMaterial({map:this.game.textures.shark_fin,transparent:true,alphaTest:.12,side:THREE.DoubleSide}));fin.position.y=1.02;group.add(fin);
    }else{
      const hull=new THREE.Mesh(new THREE.ConeGeometry(.8,3.1,5),cream);hull.rotation.x=Math.PI/2;hull.scale.y=1;group.add(hull);
      const hood=new THREE.Mesh(new THREE.BoxGeometry(1.05,.58,1.35),red);hood.position.set(0,.35,.3);group.add(hood);
      const saddle=new THREE.Mesh(new THREE.BoxGeometry(.7,.25,1.3),dark);saddle.position.set(0,.65,-.5);group.add(saddle);
      const torso=new THREE.Mesh(new THREE.BoxGeometry(.5,.75,.3),this.material(0xf0c445));torso.position.set(0,1.1,-.55);torso.rotation.x=.28;group.add(torso);
      const head=new THREE.Mesh(new THREE.SphereGeometry(.22,6,5),this.material(0xc99260));head.position.set(0,1.64,-.43);group.add(head);
      labelText='АКВАБАЙК';color='#c24e35';
    }
    this.scene.add(group);
    const label=labelText?this.game.sprite(this.game.label(labelText,color),config.type==='jetski'?3.7:2.5,.7):null;
    const wake=[];if(config.type==='jetski')for(let j=0;j<16;j++)wake.push(this.game.sprite(this.game.dropTexture,.4,.25));
    return {...config,initialX:config.x,group,label,wake,index,fin};
  }
  reset(){this.hazards.forEach(h=>{h.x=h.initialX;h.activeAt=null;h.hit=false;h.warned=false;h.passed=false;h.group.visible=true;});}
  step(dt){
    const g=this.game,p=g.p;
    this.hazards.forEach(h=>{
      const ahead=h.z-p.z;
      if(h.type==='shark')h.x=h.initialX+Math.sin(g.time*.8+(h.phase||0))*1.5;
      if(h.type==='jetski'){
        if(ahead<75&&h.activeAt===null)h.activeAt=g.time;
        if(h.activeAt!==null)h.x=THREE.MathUtils.clamp(h.initialX+(g.time-h.activeAt)*3.5*h.direction,-12,12);
      }
      if(!h.warned&&ahead<60&&ahead>8&&h.type!=='buoy'){
        h.warned=true;g.hint(h.type==='shark'?'ПЛАВНИК! ВЫБЕРИ ДРУГУЮ ЛИНИЮ':'АКВАБАЙК! ОСТОРОЖНО, КИЛЬВАТЕР',3.2);
      }
      const radius=h.type==='jetski'?1.35:h.type==='shark'?1.05:.9;
      if(!h.hit&&Math.abs(ahead)<2&&Math.abs(h.x-p.x)<radius){
        if(p.airY>1.2){h.hit=true;g.awardTrick('ПЕРЕЛЁТ',250);}
        else if(g.impactCooldown===0){h.hit=true;g.spill(h.type==='shark'?.13:.1,h.type==='shark'?'Даже акула удивилась':h.type==='jetski'?'Аквабайк передаёт привет':'Буй оказался крепче');p.speed*=.63;g.impactCooldown=2;g.emit(30,1.5);}
      }
      if(!h.passed&&ahead< -4){h.passed=true;if(!h.hit)g.score+=40;}
    });
  }
  wakeAt(x,z){
    let value=0;this.hazards.forEach(h=>{if(h.type==='jetski'&&h.activeAt!==null&&z<h.z&&z>h.z-15&&Math.abs(x-h.x)<2)value+=Math.sin(this.game.time*27)*.22;});return value;
  }
  update(){
    const g=this.game,p=g.p,n=90,positions=this.beach.geometry.attributes.position;
    for(let i=0;i<=n;i++){
      const z=p.z-28+i/n*240,edge=11.3+Math.sin(z*.045)*.65;
      positions.setXYZ(i*2,-edge,g.wave.height(edge,z)+.1,z);
      positions.setXYZ(i*2+1,-38,2.1,z);
    }
    positions.needsUpdate=true;
    const shore=this.shore.geometry.attributes.position;
    for(let i=0;i<=80;i++){
      const z=p.z-26+i/80*238,x=11.25+Math.sin(z*.045)*.65;
      for(let side=0;side<2;side++)shore.setXYZ(i*2+side,-x+(side-.5)*.72,g.wave.height(x,z)+.15,z+(g.wave.hash(i)-.5)*.7);
    }
    shore.needsUpdate=true;
    this.palms.forEach(({group,offset},i)=>{const z=p.z-20+((offset-p.z*.5)%230+230)%230;group.position.set(-19-i%2*4,1.2,z);group.rotation.z=Math.sin(Math.floor(g.time*12)*.13+i)*.018;});
    this.umbrellas.forEach(({group,offset},i)=>{const z=p.z-20+((offset-p.z*.5)%230+230)%230;group.position.set(-15-i%2*3,1,z);});
    this.hazards.forEach(h=>{
      const y=g.wave.height(h.x,h.z);h.group.position.set(-h.x,y+.18,h.z);h.group.visible=Math.abs(h.z-p.z)<160;
      h.group.rotation.z=h.type==='shark'?Math.sin(g.time*2+h.index)*.05:0;
      if(h.fin)h.fin.quaternion.copy(g.camera.quaternion);
      if(h.type==='jetski')h.group.rotation.y=h.direction*Math.PI/2;
      if(h.label){h.label.position.set(-h.x,y+2.6,h.z);h.label.visible=h.group.visible;}
      h.wake.forEach((s,i)=>{const x=h.x-i*.43*h.direction,z=h.z-1-i*.22;s.position.set(-x,g.wave.height(x,z)+.07,z);s.scale.set(.75+i*.08,.2,1);s.visible=h.group.visible&&h.activeAt!==null;});
    });
  }
}

class ComicDirector {
  constructor(game){
    this.game=game;this.el=document.getElementById('comic-frame');this.art=document.getElementById('comic-cutout');this.snapshot=document.getElementById('comic-snapshot');this.ctx=this.snapshot.getContext('2d');this.detail=document.getElementById('comic-detail');this.detailCtx=this.detail.getContext('2d');this.face=document.getElementById('comic-face-cutout');this.sequence=0;
    this.active=false;this.elapsed=0;this.cooldown=0;this.pending=false;this.timeScale=1;
  }
  reset(){this.active=false;this.pending=false;this.elapsed=0;this.cooldown=0;this.timeScale=1;this.el.classList.remove('visible');}
  trigger(word,sub,variant='air',priority=1){
    if(this.game.reducedMotion){this.game.moment(word,sub,false,1);return;}
    if((this.active||this.cooldown>0)&&priority<3)return;
    this.active=true;this.pending=true;this.elapsed=0;this.timeScale=0;this.cooldown=3.5;
    document.getElementById('comic-word').textContent=word;document.getElementById('comic-caption').textContent=sub;
    this.art.src=variant==='grab'?'assets/comics/hero-grab.png':'assets/comics/hero-air-low.png';
    this.face.src=this.art.src;this.el.classList.toggle('reverse',this.sequence++%2===1);
    this.art.onerror=()=>{this.art.onerror=null;this.art.src=SPRITE_ASSETS.surfer_jump;};
    this.el.classList.toggle('grab',variant==='grab');this.el.classList.add('visible');
    if(navigator.vibrate)navigator.vibrate([20,30,35]);this.game.audio.playSlam();
  }
  update(realDt){
    this.cooldown=Math.max(0,this.cooldown-realDt);
    if(!this.active){this.timeScale=1;return;}
    this.elapsed+=realDt;this.timeScale=this.elapsed<.25?0:this.elapsed<.78?.12:1;
    if(this.elapsed>=1.15){this.active=false;this.timeScale=1;this.el.classList.remove('visible');}
  }
  capture(){
    if(!this.pending)return;this.pending=false;
    const canvas=this.game.renderer.domElement;
    this.snapshot.width=canvas.width;this.snapshot.height=canvas.height;
    this.ctx.drawImage(canvas,0,0);
    this.detail.width=384;this.detail.height=480;this.detailCtx.clearRect(0,0,384,480);this.detailCtx.drawImage(this.game.handBeer.canvas,0,0);
  }
}
window.ComicsWorld=ComicsWorld;window.ComicDirector=ComicDirector;
