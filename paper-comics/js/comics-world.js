class ComicsWorld {
  constructor(game) {
    this.game=game;this.scene=game.scene;
    this.jetskiTexture=new THREE.TextureLoader().load('assets/comics/jetski-boris-v2.png');
    this.jetskiTexture.minFilter=THREE.LinearFilter;this.jetskiTexture.generateMipmaps=false;
    this.makeBeach();
    this.hazards=COMICS_COURSE.hazards.map((config,i)=>this.makeHazard(config,i));
    this.ready=Promise.all([new Promise((resolve,reject)=>{
      new THREE.TextureLoader().load('assets/comics/jetski-boris-v2.png',texture=>{
        this.hazards.filter(h=>h.jetCard).forEach(h=>{h.jetCard.material.map.dispose();h.jetCard.material.map=texture.clone();h.jetCard.material.map.needsUpdate=true;});resolve();
      },undefined,()=>reject(Error('Аквабайк недоступен')));
    }),...this.hazards.filter(h=>h.fin).map(h=>new Promise((resolve,reject)=>{
      new THREE.TextureLoader().load('assets/comics/shark-directions-sheet.png',texture=>{
        texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.userData={directionAtlas:true};
        h.fin.material.map.dispose();h.fin.material.map=texture;resolve();
      },undefined,()=>reject(Error('Плавники недоступны')));
    }))]);
    this.ready.catch(error=>{this.error=error;});
    this.wakeRides=0;this.reset();
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
    const group=new THREE.Group();let labelText='',color='#ae533b',fin=null,jetCard=null;
    const cream=this.material(0xf3e8cc),red=this.material(0xe66540),dark=this.material(0x153d4d);
    if(config.type==='buoy'){
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.7,.95,.3,8),cream);group.add(base);
      const top=new THREE.Mesh(new THREE.ConeGeometry(.58,1.15,6),red);top.position.y=.6;group.add(top);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.8,4),dark);pole.position.y=.9;group.add(pole);
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(.75,.5),cream);flag.position.set(.35,1.7,0);group.add(flag);
    }else if(config.type==='shark'){
      fin=new THREE.Mesh(new THREE.PlaneGeometry(2.4,2.4),new THREE.MeshBasicMaterial({map:this.game.textures.shark_fin.clone(),transparent:true,alphaTest:.12,side:THREE.DoubleSide}));fin.material.map.userData={directionAtlas:true};fin.position.y=.8;group.add(fin);
    }else{
      jetCard=new THREE.Mesh(new THREE.PlaneGeometry(4.5,4.5),new THREE.MeshBasicMaterial({map:this.jetskiTexture.clone(),transparent:true,alphaTest:.12,side:THREE.DoubleSide}));
      jetCard.position.y=1.55;group.add(jetCard);
    }
    this.scene.add(group);
    const label=labelText?this.game.sprite(this.game.label(labelText,color),config.type==='jetski'?3.7:2.5,.7):null;
    const wake=[];if(config.type==='jetski')for(let j=0;j<2;j++){const foam=this.game.wave.ribbon(0xf5ecd4,.23);foam.material.transparent=true;foam.material.depthWrite=false;wake.push(foam);}
    const attackCue=config.type==='shark'?this.game.wave.ribbon(0xf9ba54,.28):null;
    if(attackCue){attackCue.material.transparent=true;attackCue.material.opacity=.38;attackCue.material.depthWrite=false;attackCue.visible=false;}
    return {...config,initialX:config.x,initialZ:config.z,group,label,wake,attackCue,index,fin,jetCard,view:0};
  }
  reset(){
    this.wakeRides=this.escapes=0;
    this.hazards.forEach(h=>{h.x=h.initialX;h.z=h.initialZ;h.activeAt=h.attackAt=null;h.attackPhase='chase';h.lungeX=h.x;h.airDodge=false;h.hit=h.warned=h.passed=h.done=h.chasing=h.escaped=h.airPass=false;h.endAt=null;h.targetX=h.x;h.chaseSpeed=30;h.encounterSide=0;h.crossed=false;h.nearestPass=Infinity;h.previousRelative=null;h.group.visible=h.type!=='shark';h.wake.forEach(w=>w.visible=false);if(h.attackCue)h.attackCue.visible=false;});
  }
  endChase(h,escaped=false){
    h.done=true;h.chasing=false;h.escaped=escaped;h.endAt=this.game.time;
    if(h.attackCue)h.attackCue.visible=false;
    if(escaped){
      this.escapes++;this.game.awardTrick(h.airDodge?'НАД АКУЛОЙ!':'ОТОРВАЛСЯ!',h.airDodge?300:220);this.game.companion.react('escape',true);
      if(!h.airDodge)this.game.runComic.capture('escape','ФУХ!','АКУЛА ОТСТАЛА',58);
    }
  }
  stepChaser(h,dt){
    const g=this.game,p=g.p;
    if(h.done)return;
    if(h.activeAt===null){
      if(p.z<h.initialZ-25||p.z>h.initialZ+70)return;
      h.activeAt=g.time;h.chasing=true;h.z=p.z-24;h.x=THREE.MathUtils.clamp(p.x-h.direction*3.5,-8,8);h.targetX=h.x;
      g.companion.react('shark',true);
    }
    const age=g.time-h.activeAt;
    // A visible windup locks the attack line. The subsequent lunge cannot home.
    if(h.attackAt===null&&(age>=6||age>1.2&&p.z-h.z<12)){
      h.attackAt=age>=6?h.activeAt+6:g.time;h.lungeX=THREE.MathUtils.clamp(p.x+(p.sideVelocity||0)*.2,-8.5,8.5);
    }
    h.attackPhase=h.attackAt===null?'chase':g.time-h.attackAt<.7?'windup':'lunge';
    if(h.attackAt===null)h.targetX+=(p.x-h.targetX)*(1-Math.exp(-dt*1.4));
    else h.targetX=h.lungeX;
    const vx=THREE.MathUtils.clamp((h.targetX-h.x)*2,-3.6,3.6);
    h.x+=vx*dt;h.chaseSpeed+=((h.attackPhase==='lunge'?37.5:30.5)-h.chaseSpeed)*(1-Math.exp(-dt*1.5));h.z+=h.chaseSpeed*dt;
    h.view=Math.abs(vx)>1.8?(vx<0?0:1):2;
    const gap=p.z-h.z;
    if(Math.abs(gap)<1.8&&Math.abs(p.x-h.x)<1.15&&p.airY>=.95){if(!h.airDodge)g.runComic.capture('shark','ХАП!','АКУЛА ОСТАЛАСЬ БЕЗ УЖИНА',95);h.airDodge=true;}
    if((age>3&&gap>36)||gap< -6){this.endChase(h,true);return;}
    if(Math.abs(gap)<1.8&&Math.abs(p.x-h.x)<1.15&&p.airY<.95&&g.impactCooldown===0){
      h.hit=true;g.spill(.13,'АКУЛА ЗАДЕЛА');p.speed*=.65;g.balance.disturb(.34,'АКУЛА ЗАДЕЛА');g.impactCooldown=2;g.emit(25,1.3);this.endChase(h);return;
    }
  }
  threat(){
    const p=this.game.p;
    return this.hazards.filter(h=>h.chasing).map(h=>({shark:h,gap:p.z-h.z})).sort((a,b)=>Math.abs(a.gap)-Math.abs(b.gap))[0]||null;
  }
  step(dt){
    const g=this.game,p=g.p;
    this.hazards.forEach(h=>{
      if(h.type==='shark'){this.stepChaser(h,dt);return;}
      if(h.type==='jetski'){
        if(p.z>h.initialZ-65&&h.activeAt===null){h.activeAt=g.time;if(h.mode==='overtake')h.z=p.z-22;}
        if(h.activeAt!==null){
          if(h.mode==='overtake'){h.z+=34*dt;h.x=h.initialX+Math.sin((g.time-h.activeAt)*.6)*.6;}
          else h.x=h.initialX+(g.time-h.activeAt)*3.5*h.direction;
        }
      }
      const ahead=h.z-p.z;
      if(h.type==='jetski'&&h.activeAt===null)return;
      const approaching=h.mode==='overtake'?ahead< -8&&ahead> -60:ahead<60&&ahead>8;
      if(!h.warned&&approaching&&h.type!=='buoy'){
        h.warned=true;g.hint(h.type==='shark'?'ПЛАВНИК! ПЛАВНО СМЕНИ ЛИНИЮ':h.mode==='cross'?'АКВАБАЙК ПЕРЕСЕКАЕТ КУРС · ВПЕРЕДИ СЛЕД':'АКВАБАЙК ОБГОНЯЕТ · МОЖНО ПОЙМАТЬ СЛЕД',3);
      }
      const radius=h.type==='jetski'?1.3:h.type==='shark'?1:.9;
      if(!h.hit&&Math.abs(ahead)<1.8&&Math.abs(h.x-p.x)<radius&&p.airY<1&&g.impactCooldown===0){
        const cause=h.type==='shark'?'АКУЛА ЗАДЕЛА':h.type==='jetski'?'УДАР ОБ АКВАБАЙК':'УДАР ОБ БУЙ';
        h.hit=true;g.spill(h.type==='shark'?.13:.10,cause);
        p.speed*=.65;g.balance.disturb(.34,cause);g.impactCooldown=2;g.emit(25,1.3);
        g.juice.hitstop(.08);g.juice.pop('БАМ!',p.x,p.y+2,p.z,'bad');g.runComic.capture('hit','БАМ!',h.type==='jetski'?'ПРИВЕТ ОТ БОРИСА':'БУЙ ОКАЗАЛСЯ КРЕПЧЕ',45);
      }
      const relative={x:h.x-p.x,z:ahead},previous=h.previousRelative;
      if(!h.encounterSide&&Math.abs(ahead)>4)h.encounterSide=Math.sign(ahead);
      if(previous){
        const dx=relative.x-previous.x,dz=relative.z-previous.z;
        const t=THREE.MathUtils.clamp(-(previous.x*dx+previous.z*dz)/(dx*dx+dz*dz||1),0,1);
        h.nearestPass=Math.min(h.nearestPass,Math.hypot(previous.x+t*dx,previous.z+t*dz));
        if(previous.z*ahead<=0&&previous.z!==ahead){h.crossed=true;if(p.airY>1&&Math.abs(h.x-p.x)<1.6)h.airPass=true;}
      }
      h.previousRelative=relative;
      // An overtaking craft starts behind us. Award only after an actual pass
      // in either direction, using the closest distance during the encounter.
      if(!h.passed&&h.crossed&&Math.abs(ahead)>4&&Math.sign(ahead)!==h.encounterSide){
        h.passed=true;
        if(!h.hit){
          g.score+=40;
          if(h.type==='buoy'){if(h.airPass)g.nearMiss('НАД БУЕМ!',150,h.x,h.z,'ОП!');else if(h.nearestPass<2)g.nearMiss('ВПРИТЫК!',80,h.x,h.z);}
          else if(h.nearestPass<2.7){g.nearMiss('РАЗОШЛИСЬ',120,h.x,h.z,'ВЖУХ!',true);g.companion.react('dodge');g.comics.trigger('ФУХ!','БЫЛО БЛИЗКО. КРУЖКА ЦЕЛА.','save',2);}
        }
      }
    });
  }
  wakeCoordinates(h,x,z){
    const cross=h.mode==='cross';
    return {behind:cross?(h.x-x)*h.direction:h.z-z,perp:cross?z-h.z:x-h.x};
  }
  wakeQualityAt(x,z){
    let value=0;
    for(const h of this.hazards){
      if(h.type!=='jetski'||h.activeAt===null||this.game.time-h.activeAt>9)continue;
      value=Math.max(value,this.wakeQualityFor(h,x,z));
    }
    return value;
  }
  wakeQualityFor(h,x,z){
    const {behind,perp}=this.wakeCoordinates(h,x,z);
    if(behind<1||behind>28)return 0;
    const ridge=Math.abs(perp)-behind*.36;
    return Math.exp(-ridge*ridge/1.2)*Math.min(1,behind/3)*(1-behind/28);
  }
  wakeSourceAt(x,z){
    let quality=0,hazard=null;
    for(const h of this.hazards){
      if(h.type!=='jetski'||h.activeAt===null||this.game.time-h.activeAt>9)continue;
      const next=this.wakeQualityFor(h,x,z);if(next>quality){quality=next;hazard=h;}
    }
    return {quality,hazard};
  }
  wakeAt(x,z){return this.wakeQualityAt(x,z)*.9;}
  update(){
    const g=this.game,p=g.p,n=90,positions=this.beach.geometry.attributes.position;
    for(let i=0;i<=n;i++){
      const z=p.z-28+i/n*240,edge=19.3+Math.sin(z*.045)*.65;
      positions.setXYZ(i*2,-edge,g.wave.height(edge,z)+.1,z);
      positions.setXYZ(i*2+1,-38,2.1,z);
    }
    positions.needsUpdate=true;
    const shore=this.shore.geometry.attributes.position;
    for(let i=0;i<=80;i++){
      const z=p.z-26+i/80*238,x=19.25+Math.sin(z*.045)*.65;
      for(let side=0;side<2;side++)shore.setXYZ(i*2+side,-x+(side-.5)*.72,g.wave.height(x,z)+.15,z+(g.wave.hash(i)-.5)*.7);
    }
    shore.needsUpdate=true;
    this.palms.forEach(({group,offset},i)=>{const z=p.z-20+((offset-p.z*.5)%230+230)%230;group.position.set(-27-i%2*4,1.2,z);group.rotation.z=Math.sin(Math.floor(g.time*12)*.13+i)*.018;});
    this.umbrellas.forEach(({group,offset},i)=>{const z=p.z-20+((offset-p.z*.5)%230+230)%230;group.position.set(-23-i%2*3,1,z);});
    this.hazards.forEach(h=>{
      const diving=h.type==='shark'&&h.endAt!==null?Math.min(1,(g.time-h.endAt)/.65):0;
      const y=g.wave.height(h.x,h.z);h.group.position.set(-h.x,y+.18-diving*2,h.z);h.group.visible=Math.abs(h.z-p.z)<160&&(h.type!=='shark'||h.activeAt!==null&&diving<1);
      h.group.rotation.z=h.type==='shark'?Math.sin(g.time*2+h.index)*.05:0;
      if(h.fin){h.fin.quaternion.copy(g.camera.quaternion);const t=h.fin.material.map;if(t.image?.width>0&&t.userData.directionAtlas){t.repeat.set(h.view===1?-.5:.5,.5);t.offset.set(h.view===1?1:h.view%2*.5,(1-Math.floor(h.view/2))*.5);}}
      if(h.jetCard){
        h.group.rotation.y=0;h.jetCard.quaternion.copy(g.camera.quaternion);
        const view=h.mode==='cross'?(h.direction>0?0:1):2,t=h.jetCard.material.map,eps=0.003;
        t.repeat.set(1/3-eps*2,1);t.offset.set(view/3+eps,0);
      }
      if(h.label){h.label.position.set(-h.x,y+2.6,h.z);h.label.visible=h.group.visible;}
      if(h.attackCue){
        h.attackCue.visible=h.chasing&&h.attackPhase!=='chase';
        const pos=h.attackCue.geometry.attributes.position,length=THREE.MathUtils.clamp(p.z-h.z+10,9,34);
        for(let i=0;i<=80;i++)for(let side=0;side<2;side++){
          const z=h.z+i/80*length,x=h.lungeX+(side-.5)*(.18+i/80*.55);
          pos.setXYZ(i*2+side,-x,g.wave.height(x,z)+.12,z);
        }
        pos.needsUpdate=true;h.attackCue.material.opacity=h.attackPhase==='windup'?.28+.16*Math.sin(g.time*18)**2:.32;
      }
      h.wake.forEach((foam,arm)=>{
        const active=h.activeAt!==null&&g.time-h.activeAt<9;foam.visible=h.group.visible&&active;
        const pos=foam.geometry.attributes.position,sign=arm===0?-1:1;
        for(let i=0;i<=80;i++){
          const behind=1+i/80*27,perp=sign*behind*.36;
          for(let side=0;side<2;side++){
            const offset=perp+(side-.5)*.24*Math.sin(i/80*Math.PI);
            const x=h.mode==='cross'?h.x-behind*h.direction:h.x+offset;
            const z=h.mode==='cross'?h.z+offset:h.z-behind;
            pos.setXYZ(i*2+side,-x,g.wave.height(x,z)+.04,z);
          }
        }
        pos.needsUpdate=true;foam.material.opacity=active?Math.min(1,(9-g.time+h.activeAt)/2):0;
      });
    });
  }
}

class ComicDirector {
  constructor(game){
    this.game=game;this.el=document.getElementById('comic-frame');this.art=document.getElementById('comic-cutout');
    this.snapshot=document.getElementById('comic-snapshot');this.ctx=this.snapshot.getContext('2d');
    this.detail=document.getElementById('comic-detail');this.detailCtx=this.detail.getContext('2d');this.face=document.getElementById('comic-face-cutout');
    this.images={};this.sequence=0;
    this.ready=Promise.all(['crest','save','transfer'].map(variant=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{this.images[variant]=image;resolve();};image.onerror=()=>reject(Error('Крупный план '+variant+' недоступен'));image.src='assets/comics/hero-'+variant+'-close.png';
    })));
    this.ready.catch(error=>{this.error=error;});this.reset();
  }
  reset(){this.active=this.pending=false;this.elapsed=this.cooldown=0;this.timeScale=1;this.triggerCount=0;this.lastEvent=null;this.el.classList.remove('visible');}
  trigger(word,sub,variant='crest',priority=1){
    if(this.game.flowTest)return false;
    if(this.active||this.cooldown>0)return false;
    this.triggerCount++;this.lastEvent={word,variant,at:this.game.time,priority};
    if(this.game.reducedMotion){this.cooldown=8;this.game.moment(word,sub,false,1);return true;}
    this.active=this.pending=true;this.elapsed=0;this.timeScale=0;this.cooldown=8;
    document.getElementById('comic-word').textContent=word;document.getElementById('comic-caption').textContent=sub;
    this.art.src=this.images[variant]?.src||'assets/comics/hero-crest-close.png';this.face.src=this.art.src;
    this.el.dataset.variant=variant;this.el.classList.toggle('reverse',this.sequence++%2===1);this.el.classList.add('visible');
    if(navigator.vibrate)navigator.vibrate([20,30,35]);this.game.audio.playSlam();return true;
  }
  update(realDt){
    this.cooldown=Math.max(0,this.cooldown-realDt);
    if(!this.active){this.timeScale=1;return;}
    this.elapsed+=realDt;this.timeScale=this.elapsed<.22?0:this.elapsed<.72?.14:1;
    if(this.elapsed>=1.12){this.active=false;this.timeScale=1;this.el.classList.remove('visible');}
  }
  capture(){
    if(!this.pending)return;this.pending=false;
    const canvas=this.game.renderer.domElement;this.snapshot.width=canvas.width;this.snapshot.height=canvas.height;this.ctx.drawImage(canvas,0,0);
    this.detail.width=384;this.detail.height=480;this.detailCtx.clearRect(0,0,384,480);this.detailCtx.drawImage(this.game.handBeer.canvas,0,0);
  }
}
window.ComicsWorld=ComicsWorld;window.ComicDirector=ComicDirector;
