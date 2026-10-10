/* Authored choices and encounter spacing use position and completed actions, not a cutscene clock. */
class SurfSetpiece {
  constructor(game){
    this.game=game;
    this.sprintPoints=[[1174,0],[1198,0],[1224,-3.2],[1264,3.2],[1304,-2.8],[1340,0],[1360,0]];
    this.rocks=[{x:-1.5,z:314,rx:2.8,rz:10,height:8},{x:-9.1,z:310,rx:1.6,rz:15,height:7},
      // Edge reefs leave the gates, ramp entries and side-launch landing strips open.
      ...[[8.9,468,1.7,4.8],[-8.6,501,1.6,4.1],[-8.7,544,1.9,5.2],[-8.8,594,1.7,4.5],
        [8.8,639,1.6,4.2],[-8.9,698,1.8,5.4],[8.9,747,1.8,4.5],[8.7,827,1.7,5.2],
        [1.5,1224,1.8,5],[-1.5,1264,1.8,5],[1.5,1304,1.7,4.5]]
        .map(([x,z,rx,rz],i)=>({x,z,rx,rz,height:4.2+i%3*.35,reef:true}))];
    for(const rock of this.rocks){
      const geometry=new THREE.CylinderGeometry(.12,1,2,7,4),vertices=geometry.attributes.position;
      for(let i=0;i<vertices.count;i++){
        const y=vertices.getY(i),originalRadius=.56-.44*y;
        const radius=y<=0?1:Math.sqrt(Math.max(.0144,1-y*y)),scale=radius/originalRadius;
        const angle=Math.atan2(vertices.getZ(i),vertices.getX(i));
        const crag=rock.reef?.93+.07*Math.sin(angle*3+rock.z):1;
        vertices.setXYZ(i,vertices.getX(i)*scale*crag,y<0?y*1.6:y,vertices.getZ(i)*scale*crag);
      }
      geometry.computeVertexNormals();
      rock.mesh=new THREE.Mesh(geometry,game.trickRoute.makeInk(0xb99b71));
      rock.mesh.position.set(-rock.x,1.9,rock.z);rock.mesh.scale.set(rock.rx,rock.height*.65,rock.rz);
      game.scene.add(rock.mesh);
      const rim=new THREE.RingGeometry(rock.reef?.94:1,rock.reef?1.42:1.12,40);rim.rotateX(-Math.PI/2);
      if(rock.reef){
        // Wrap the existing foam strip around the reef, rather than stretching its stripes across a disc.
        const pos=rim.attributes.position,uv=rim.attributes.uv;
        for(let i=0;i<pos.count;i++){
          const angle=(i%41)/40*Math.PI*2,rough=1+.08*Math.sin(angle*5+rock.z);
          pos.setX(i,pos.getX(i)*rough);pos.setZ(i,pos.getZ(i)*rough);
          uv.setXY(i,(i%41)/40,Math.floor(i/41));
        }
      }
      rock.rim=new THREE.Mesh(rim,new THREE.MeshBasicMaterial({map:game.wave.foamTexture,color:0xfff2d9,transparent:true,opacity:.85,alphaTest:rock.reef?.08:0,depthWrite:false,side:THREE.DoubleSide}));
      rock.rim.frustumCulled=false;
      rock.original=Float32Array.from(rim.attributes.position.array);game.scene.add(rock.rim);
    }
    this.signs=[{x:-5.9,z:281,label:'РИСК · СРЕЗКА',color:'#b65c35'},{x:4.4,z:281,label:'ШИРЕ · СПОКОЙНЕЕ',color:'#23766d'},
      {x:0,z:1082,label:'ПОСЛЕДНИЙ ВЫЛЕТ',color:'#b65c35'}].map(s=>({...s,mesh:game.sprite(game.label(s.label,s.color,512,92),4.8,.86)}));
    this.reset();
  }
  setRockTexture(texture){
    // Sample the opaque limestone face of the existing collage, preserving its source alpha.
    const crop=texture.clone();crop.repeat.set(.30,.48);crop.offset.set(.30,.06);crop.needsUpdate=true;
    const material=new THREE.MeshLambertMaterial({map:crop,color:0x949c9b,flatShading:true});
    for(const rock of this.rocks){rock.mesh.material.dispose();rock.mesh.material=material;}
  }
  reset(){
    this.enabled=!this.game.flowTest;this.choice=null;this.clean=true;this.resolved=false;this.riskRewarded=false;
    this.events=[];this.stage='approach';this.exitAt=null;this.jetAt=null;this.landingAt=null;this.finaleLanded=false;this.hits=0;
    this.sprintPoints[0][1]=this.game.trickRoute.maneuverPoint(this.sprintPoints[0][0]);
    for(const rock of this.rocks){
      rock.hit=false;
      // Reefs are rooted in the seabed, with a low exposed crown at the expected arrival tide.
      if(rock.reef)rock.mesh.position.y=this.game.wave.height(rock.x,rock.z,rock.z/33)-.85;
    }
  }
  finishPath(z){
    if(!this.enabled||z<this.sprintPoints[0][0])return null;
    const points=this.sprintPoints,last=points[points.length-1];if(z>=last[0])return last[1];
    const i=Math.max(0,points.findIndex(point=>point[0]>z)-1),a=points[i],b=points[i+1];
    return THREE.MathUtils.lerp(a[1],b[1],this.game.wave.smooth((z-a[0])/(b[0]-a[0])));
  }
  path(z,safe=false){
    if(!this.enabled||z<264||z>434)return null;
    const g=this.game,points=safe?[[264,-2.7],[298,4.4],[329,4.4],[370,1.5],[405,-2.2],[434,-2.2]]:
      [[264,-2.7],[298,-5.95],[331,-5.95],[369,-2.2],[434,-2.2]];
    const i=Math.max(0,points.findIndex(p=>p[0]>=z)-1),a=points[i],b=points[i+1];
    return THREE.MathUtils.lerp(a[1],b[1],g.wave.smooth((z-a[0])/(b[0]-a[0])));
  }
  log(type,extra={}){this.events.push({type,z:this.game.p.z,time:this.game.time,...extra});}
  addCaps(rush){
    if(!this.enabled)return;
    const g=this.game;
    for(const safe of [false,true]){
      const line={id:safe?'wide-passage':'rock-cut',caps:[],air:false};rush.lines.push(line);
      for(let i=0;i<6;i++){const z=280+i*10;rush.addCap(line,this.path(z,safe),z,1.15,!safe&&i===5);}
    }
  }
  canStartRival(scene){
    if(!this.enabled)return true;
    const g=this.game;
    if(g.p.airborne||g.p.recovering>0||g.time-(this.landingAt??-100)<.45)return false;
    if(g.p.z>1060)return false;
    if(g.beats?.nearRope())return false;
    if(g.race.events.length&&g.time-g.race.events[g.race.events.length-1].at<2.8)return false;
    if(scene.id==='couple'&&scene.z===520)return g.p.z>=520;
    return !g.world.hazards.some(h=>!h.done&&h.activeAt!==null&&(h.chasing&&h.attackPhase!=='chase'&&Math.abs(h.z-g.p.z)<16||h.type==='jetski'&&Math.abs(h.z-g.p.z)<22));
  }
  canStartHazard(h){
    if(!this.enabled)return true;
    const g=this.game,p=g.p;
    if(p.z>1080||p.airborne||p.recovering>0||g.time-(this.landingAt??-100)<.4)return false;
    if(g.beats?.nearRope())return false;
    if(h.type==='jetski'&&h.initialZ===310)return this.resolved&&p.z>=343;
    if(p.z<605)return false;
    if(g.world.hazards.some(other=>other!==h&&other.activeAt!==null&&g.time-other.activeAt<2.5))return false;
    return !g.world.hazards.some(other=>other!==h&&!other.done&&other.activeAt!==null&&(other.chasing||other.type==='jetski'&&Math.abs(other.z-p.z)<28));
  }
  steerRival(r,x){
    if(!this.enabled||r.encounter?.phase==='exit'||r.z<266||r.z>350)return x;
    // Actors use the broad channel; a tandem never blocks both player exits.
    return this.path(Math.min(350,Math.max(264,r.z+14)),true);
  }
  onLanding(line,clean){
    if(!this.enabled)return;
    this.landingAt=this.game.time;
    if(line?.id===7)this.log('landing',{clean});
    if(line?.finale){this.finaleLanded=true;this.log('final-landing',{clean});if(clean)this.game.awardTrick('ФИНАЛЬНЫЙ ВЫЛЕТ',400);}
  }
  step(){
    if(!this.enabled)return;
    const g=this.game,p=g.p;
    if(p.fallen){if(!this.resolved)this.clean=false;return;}
    if(p.z>=294&&this.choice===null){this.choice=p.x<-3.8?'risk':'wide';this.log('choice',{choice:this.choice});}
    if(this.choice==='risk'&&!this.resolved&&p.z<335&&p.x>-3.8)this.clean=false;
    for(const rock of this.rocks){
      // Match the rock's cross-section at board height, including space for the board.
      const elevation=Math.max(0,(p.y-rock.mesh.position.y)/rock.mesh.scale.y);
      const cross=Math.sqrt(Math.max(0,1-elevation*elevation));
      const dx=p.x-rock.x,dz=p.z-rock.z,rx=rock.rx*cross+.42,rz=rock.rz*cross+.55;
      const distance=Math.hypot(dx/rx,dz/rz);
      if(distance>=1||p.y>rock.mesh.position.y+rock.mesh.scale.y+.3)continue;
      if(!rock.hit){rock.hit=true;if(!rock.reef)this.clean=false;this.hits++;this.log(rock.reef?'reef-hit':'rock-hit',{obstacleX:rock.x,obstacleZ:rock.z});
        if(g.impactCooldown===0){g.spill(rock.reef?.04:.08,rock.reef?'ЗАДЕЛ РИФ':'ЗАДЕЛ СКАЛУ');p.speed*=rock.reef?.88:.78;g.impactCooldown=1.2;g.juice.hitstop(.06);g.emit(24,1.1,true);}}
      const side=rock.reef?-Math.sign(rock.x):(dx<0?-1:1);
      p.x=rock.x+side*rx*Math.sqrt(Math.max(0,1-(dz/rz)**2));p.sideVelocity=side*Math.max(1,Math.abs(p.sideVelocity)*.3);
    }
    if(p.z>=339&&!this.resolved){
      this.resolved=true;this.exitAt=g.time;this.log('exit',{choice:this.choice,clean:this.clean});
      if(this.choice==='risk'&&this.clean){this.riskRewarded=true;g.awardTrick('УЗКИЙ ПРОХОД',250);g.race.boostTime=Math.max(g.race.boostTime,2.2);g.waveRide.momentum=Math.max(g.waveRide.momentum,5);}
    }
    const jet=g.world.hazards.find(h=>h.type==='jetski'&&h.initialZ===310);
    if(jet&&jet.activeAt!==null&&this.jetAt===null){this.jetAt=jet.activeAt;this.log('jetski',{lead:jet.z-p.z});}
    this.stage=p.z<264?'approach':!this.resolved?'fork':p.z<410?'wake':p.z<520?'jump':p.z<625?'chase':p.z<1065?'open':this.finaleLanded||p.z>1165?'home':'finale';
    // Existing actors leave before the finale; the last landing opens a quiet run-in.
    if(p.z>1065)for(const r of g.rivals)if(r.encounter)r.encounter.duration=0;
    if(p.z>1085)for(const h of g.world.hazards)if(h.chasing)g.world.endChase(h,false);
    if(p.z>1145&&g.chase.active)g.chase.end('finish');
  }
  cue(){
    if(!this.enabled)return null;
    const p=this.game.p;
    if(p.z>258&&p.z<294)return {id:'route',title:'← СРЕЗКА · ШИРОКИЙ ПУТЬ →',line:'Узкий проход сохраняет Кураж.'};
    if(p.z>294&&p.z<331&&Math.abs(p.x+1.5)<3.7)return {id:'danger',title:'СКАЛА · ВЫБЕРИ СТОРОНУ',line:''};
    if(p.z>1060&&p.z<1098)return {id:'ramp',title:'ПОСЛЕДНИЙ ВЫЛЕТ',line:'Держи линию крышек — бар за волной.'};
    return null;
  }
  update(){
    const g=this.game,p=g.p;
    for(const rock of this.rocks){
      rock.mesh.visible=rock.rim.visible=this.enabled&&rock.z-p.z>-22&&rock.z-p.z<135;
      if(!rock.mesh.visible)continue;
      const pos=rock.rim.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        const x=rock.x-rock.original[i*3]*rock.rx,z=rock.z+rock.original[i*3+2]*rock.rz;
        pos.setXYZ(i,-x,g.wave.height(x,z)+.09,z);
      }
      pos.needsUpdate=true;
    }
    for(const s of this.signs){s.mesh.visible=this.enabled&&s.z-p.z<85&&s.z-p.z>9;s.mesh.position.set(-s.x,g.wave.height(s.x,s.z)+2.5,s.z);}
  }
}
window.SurfSetpiece=SurfSetpiece;
