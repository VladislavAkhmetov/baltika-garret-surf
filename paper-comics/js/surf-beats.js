/* Small optional actions fill the water between the larger authored encounters. */
class SurfBeats {
  constructor(game){
    this.game=game;
    this.flagMaterials=[game.trickRoute.makeInk(0xe47b50),game.trickRoute.makeInk(0xffcc51)];
    this.passedMaterial=game.trickRoute.makeInk(0x70bda6);
    this.poleMaterial=game.trickRoute.edge;
    const flag=new THREE.BufferGeometry();
    flag.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.9,-.12,0,0,-.65,0],3));
    flag.computeVertexNormals();
    this.flagGeometry=flag;
    this.zones=[
      {id:'opening',label:'ПОЙМАЙ ФЛАЖКИ',zs:[48,96,142]},
      {id:'wake',label:'ЗИГЗАГ ПО СЛЕДУ',zs:[398,416,434]},
      {id:'tandem',label:'ЗА ПАРОЙ · ЗИГЗАГ',zs:[512,531,550]},
      {id:'pier',label:'СЛАЛОМ У ПИРСА',zs:[716,738,760]},
      {id:'sprint',label:'ДЕРЖИ ТЕМП',zs:[822,846,870]},
      {id:'last-carve',label:'ПОСЛЕДНИЙ ЗИГЗАГ',zs:[1038,1056,1074]},
      {id:'home',label:'ФИНИШНЫЕ ВИРАЖИ',zs:[1224,1264,1304],home:true}
    ].map(zone=>({...zone,gates:zone.zs.map((z,i)=>this.makeGate(z,i,zone.home))}));
    this.ropes=[603,941].map((z,i)=>this.makeRope(z,i));
    this.flocks=[{z:188,side:-1},{z:487,side:1},{z:811,side:-1},{z:1052,side:1}].map(f=>({...f,
      birds:Array.from({length:3},(_,i)=>{
        const bird=game.sprite(game.textures[i%2?'seagull_2':'seagull_1'],2.2,1.5);
        bird.visible=false;return bird;
      })}));
    this.reset();
  }
  makeGate(z,index,home){
    const g=this.game,group=new THREE.Group();g.scene.add(group);
    const flags=[];
    for(const side of [-1,1]){
      const post=new THREE.Group();group.add(post);post.position.x=side*1.55;
      const float=new THREE.Mesh(new THREE.SphereGeometry(.27,6,4),this.flagMaterials[index%2]);float.scale.y=.65;post.add(float);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,2.5,4),this.poleMaterial);pole.position.y=1.2;post.add(pole);
      const pennant=new THREE.Mesh(this.flagGeometry,this.flagMaterials[index%2]);pennant.position.y=2.45;
      pennant.scale.x=side;post.add(pennant);flags.push({post,pennant,side});
    }
    const cap=g.sprite(g.textures[home?'cap_palm':'cap_fish'],home?1.2:.9,home?1.2:.9);
    group.visible=cap.visible=false;
    return {z,index,home,group,flags,cap};
  }
  makeRope(z,index){
    const g=this.game,geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(24*6*3),3));
    const band=new THREE.Mesh(geometry,g.trickRoute.makeInk(0xe9834b));band.frustumCulled=false;g.scene.add(band);
    const markers=[-1,1].map(side=>{
      const mesh=new THREE.Mesh(new THREE.ConeGeometry(.42,.9,6),this.flagMaterials[index%2]);g.scene.add(mesh);return {side,mesh};
    });
    const sign=g.sprite(g.label('ПРЫЖОК ↑','#b75d37',256,64),3.4,.85);
    const floats=Array.from({length:10},(_,i)=>{
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.59,6),i%2?this.poleMaterial:this.flagMaterials[0]);
      mesh.rotation.z=Math.PI/2;mesh.visible=false;g.scene.add(mesh);return mesh;
    });
    band.visible=sign.visible=false;markers.forEach(m=>m.mesh.visible=false);
    return {z,index,band,markers,sign,floats,halfWidth:3.1};
  }
  reset(){
    const g=this.game;this.enabled=!g.flowTest;this.events=[];this.passed=this.slaloms=this.cleared=this.hits=0;
    this.lastZ=g.p?.z??0;this.lastX=g.p?.x??1.4;
    for(const zone of this.zones){
      zone.hits=0;zone.done=zone.failed=false;
      for(const gate of zone.gates){
        // The last opening returns to the existing ramp/wave line.
        const offset=zone.home||gate.index===2?0:gate.index===0?-1.4:1.4;
        gate.x=THREE.MathUtils.clamp(g.trickRoute.routePoint(gate.z)+offset,-7.6,7.6);
        gate.resolved=gate.passed=false;gate.group.visible=gate.cap.visible=false;
        for(const f of gate.flags)f.pennant.material=this.flagMaterials[gate.index%2];
      }
    }
    for(const r of this.ropes){r.x=THREE.MathUtils.clamp(g.trickRoute.routePoint(r.z),-5,5);r.done=false;r.result=null;}
    for(const f of this.flocks){f.at=null;f.done=false;f.x=THREE.MathUtils.clamp(g.trickRoute.routePoint(f.z),-5,5);f.birds.forEach(b=>b.visible=false);}
  }
  log(type,data={}){this.events.push({type,z:this.game.p.z,time:this.game.time,...data});}
  addCaps(rush){
    if(!this.enabled)return;
    const line={id:'bar-bonus',caps:[],air:false};rush.lines.push(line);
    for(let i=0;i<11;i++){const z=1208+i*12;rush.addCap(line,this.game.trickRoute.routePoint(z),z,1.15,i===10);}
  }
  nearRope(){return this.enabled&&this.ropes.some(r=>!r.done&&r.z-this.game.p.z>0&&r.z-this.game.p.z<42);}
  target(z){
    if(!this.enabled)return null;
    const gate=this.zones.flatMap(s=>s.gates).find(g=>!g.resolved&&g.z-z>=-2&&g.z-z<23);
    return gate?.x??null;
  }
  step(dt){
    if(!this.enabled)return;
    const g=this.game,p=g.p;
    // Teleporting a review fixture cannot earn earlier gates along the skipped route.
    const advancing=p.z>=this.lastZ&&p.z-this.lastZ<Math.max(3,p.speed*dt*2);
    const crosses=z=>advancing&&this.lastZ<z&&p.z>=z;
    const crossingX=z=>THREE.MathUtils.lerp(this.lastX,p.x,(z-this.lastZ)/Math.max(.001,p.z-this.lastZ));
    for(const zone of this.zones)for(const gate of zone.gates){
      if(gate.resolved)continue;
      if(crosses(gate.z)){
        gate.passed=!p.fallen&&p.recovering===0&&Math.abs(crossingX(gate.z)-gate.x)<1.15&&p.airY<1.55;
        gate.resolved=true;
        if(gate.passed){
          zone.hits++;this.passed++;g.collected++;g.awardTrick(zone.home?'КРЫШКА У БАРА':'ВОРОТА',45,true);
          g.audio.playFruit();g.juice.punch(.45);this.log('gate',{id:zone.id,index:gate.index});
          for(const f of gate.flags)f.pennant.material=this.passedMaterial;
        }else zone.failed=true;
        if(gate.index===2){
          zone.done=true;
          if(zone.hits===3){this.slaloms++;g.awardTrick(zone.home?'ФИНИШНЫЙ БОНУС':'СЛАЛОМ',zone.home?250:220);
            g.juice.buzz(12);g.rush.splash(.35);this.log('slalom',{id:zone.id});}
        }
      }else if(p.z>gate.z+3){gate.resolved=true;zone.failed=true;if(gate.index===2)zone.done=true;}
    }
    for(const r of this.ropes){
      if(r.done)continue;
      if(crosses(r.z)){
        const across=Math.abs(crossingX(r.z)-r.x);r.done=true;
        if(p.fallen||p.recovering>0)r.result='miss';
        else if(across>r.halfWidth+.6){r.result='bypass';g.awardTrick('ОБЪЕЗД КАНАТА',70,true);}
        else if(p.airY>=.95){r.result='jump';this.cleared++;g.awardTrick('НАД КАНАТОМ!',180);
          g.juice.pop('ОП!',p.x,p.y+1.5,p.z,'near');g.juice.buzz(14);g.rush.splash(.4);}
        else{r.result='hit';this.hits++;
          if(g.impactCooldown===0){g.spill(.025,'ЗАДЕЛ КАНАТ');p.speed*=.9;g.impactCooldown=.8;g.emit(18,.8,true);g.juice.hitstop(.04);}}
        this.log('rope',{index:r.index,result:r.result});
      }else if(p.z>r.z+3){r.done=true;r.result='miss';}
    }
    for(const f of this.flocks){
      if(f.at===null&&p.z>f.z-38&&p.z<f.z+20){f.at=g.time;g.audio.playSeagull(f.side>0?1:0);this.log('flock');}
      if(f.at!==null&&g.time-f.at>2.8)f.done=true;
    }
    this.lastZ=p.z;this.lastX=p.x;
  }
  cue(){
    if(!this.enabled)return null;
    const p=this.game.p,rope=this.ropes.find(r=>!r.done&&r.z-p.z>2&&r.z-p.z<46&&Math.abs(p.x-r.x)<r.halfWidth+1);
    if(rope)return {id:'danger',title:'КАНАТ ВПЕРЕДИ · ПРЫЖОК ↑',line:'Можно обойти с края.'};
    const zone=this.zones.find(s=>!s.done&&p.z>s.zs[0]-24&&p.z<s.zs[2]);
    if(zone&&!zone.failed)return {id:'route',title:zone.label+' · '+zone.hits+'/3',line:zone.home?'Собери последний бонус.':'Три прохода подряд — бонус к цепочке.'};
    return null;
  }
  update(){
    const g=this.game,p=g.p;
    for(const zone of this.zones)for(const gate of zone.gates){
      gate.group.visible=this.enabled&&gate.z-p.z>-8&&gate.z-p.z<90;
      gate.cap.visible=gate.group.visible&&!gate.resolved;
      if(!gate.group.visible)continue;
      const water=g.wave.height(gate.x,gate.z);gate.group.position.set(-gate.x,water+.08,gate.z);
      for(const f of gate.flags){f.post.position.y=g.wave.height(gate.x-f.side*1.55,gate.z)-water;
        f.pennant.rotation.y=g.reducedMotion?0:Math.sin(g.time*5+gate.z)*.16;}
      gate.cap.position.set(-gate.x,water+1.15,gate.z);
    }
    for(const r of this.ropes){
      const visible=this.enabled&&!r.done&&r.z-p.z>-3&&r.z-p.z<85;
      r.band.visible=r.sign.visible=visible;r.markers.forEach(m=>m.mesh.visible=visible);
      r.floats.forEach(m=>m.visible=visible);
      if(!visible)continue;
      const pos=r.band.geometry.attributes.position;
      for(let i=0;i<24;i++){
        const a=r.x-r.halfWidth+i/24*r.halfWidth*2,b=r.x-r.halfWidth+(i+1)/24*r.halfWidth*2;
        const ay=g.wave.height(a,r.z)+.3,by=g.wave.height(b,r.z)+.3;
        const points=[[-a,ay,r.z-.12],[-a,ay,r.z+.12],[-b,by,r.z+.12],[-a,ay,r.z-.12],[-b,by,r.z+.12],[-b,by,r.z-.12]];
        for(let j=0;j<6;j++)pos.setXYZ(i*6+j,...points[j]);
      }
      pos.needsUpdate=true;
      r.band.geometry.computeVertexNormals();
      for(const m of r.markers){const x=r.x+m.side*r.halfWidth;m.mesh.position.set(-x,g.wave.height(x,r.z)+.4,r.z);}
      r.floats.forEach((mesh,i)=>{
        const x=r.x-r.halfWidth+(i+.5)/10*r.halfWidth*2;
        mesh.position.set(-x,g.wave.height(x,r.z)+.43,r.z);
        mesh.rotation.z=Math.PI/2+Math.atan((g.wave.height(x+.2,r.z)-g.wave.height(x-.2,r.z))/.4);
      });
      r.sign.position.set(-r.x,g.wave.height(r.x,r.z)+2.1,r.z);
    }
    for(const f of this.flocks){
      const age=f.at===null?-1:g.time-f.at;
      f.birds.forEach((bird,i)=>{
        bird.visible=this.enabled&&!f.done&&age>=0&&age<2.8&&!g.reducedMotion;
        if(!bird.visible)return;
        const t=age-i*.16,x=f.x+f.side*(11-t*9),z=f.z+15-t*17;
        bird.position.set(-x,g.wave.height(f.x,f.z)+3.6+Math.abs(x-f.x)*.22+i*.65,z);
        bird.material.rotation=f.side*(.15+Math.sin(t*7+i)*.1);
      });
    }
  }
}
window.SurfBeats=SurfBeats;
