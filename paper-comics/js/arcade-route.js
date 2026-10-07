/* One route owns water guidance, physical paper ramps and their takeoff direction. */
class TrickRoute {
  constructor(game){
    this.game=game;this.lines=[];this.completed=0;this.launches=0;
    this.paperTexture=this.makePaperTexture();
    this.ink=this.makeInk(0xd36c50);
    this.gold=this.makeInk(0xcda552);
    this.edge=new THREE.MeshBasicMaterial({color:0xf6e9c9,side:THREE.DoubleSide});
    this.dark=new THREE.MeshBasicMaterial({color:0x244651});
    // Nine opportunities, with room for free carving between them. The flow test stays isolated.
    for(const id of (window.FLOW_TEST_MODE?[]:[1,3,5,7,9,11,13,15,18])){
      const wave=game.wave.waves[id];if(!wave)continue;
      const group=new THREE.Group();game.scene.add(group);
      const side=this.lines.length%2===1;
      const line={id,wave,group,type:side?'side':'straight',edgeSide:this.lines.length%4===1?-1:1,
        length:side?24:10,width:side?3.4:4.5,height:side?3.4:1.85,columns:side?16:4};
      this.makeRamp(line);this.lines.push(line);
    }
    this.reset();
  }
  makePaperTexture(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const c=canvas.getContext('2d');c.fillStyle='#fff4d9';c.fillRect(0,0,128,128);
    for(let y=0;y<128;y+=5)for(let x=0;x<128;x+=5){
      c.fillStyle=(x+y)%3?'rgba(68,53,38,.055)':'rgba(255,255,255,.22)';
      c.beginPath();c.arc(x+(y%2),y,.65,0,Math.PI*2);c.fill();
    }
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
  }
  makeInk(color){
    return new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{uInk:{value:new THREE.Color(color)},uPaper:{value:this.paperTexture}},
      vertexShader:'varying vec3 paperNormal;varying vec2 paperUV;void main(){paperNormal=normal;paperUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform vec3 uInk;uniform sampler2D uPaper;varying vec3 paperNormal;varying vec2 paperUV;void main(){float light=dot(normalize(paperNormal),normalize(vec3(-.35,.9,-.2)));float band=light>.65?1.0:light>.1?.82:.62;vec3 print=texture2D(uPaper,paperUV*vec2(2.0,4.0)).rgb;gl_FragColor=vec4(uInk*band*(.86+.14*print),1.0);}'
    });
  }
  makeRamp(line){
    const n=16,geometry=new THREE.PlaneGeometry(line.width,line.length,line.columns,n);
    // Mirroring gameplay X into scene X reverses winding; keep the painted face upward.
    const indices=geometry.index.array;for(let i=0;i<indices.length;i+=3){const swap=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=swap;}
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    line.top=new THREE.Mesh(geometry,line.type==='side'?this.gold:this.ink);line.top.frustumCulled=false;line.group.add(line.top);
    const skirt=new THREE.BufferGeometry();skirt.setAttribute('position',new THREE.BufferAttribute(new Float32Array((n*2+line.columns*2)*6*3),3));
    skirt.attributes.position.setUsage(THREE.DynamicDrawUsage);
    line.skirt=new THREE.Mesh(skirt,this.edge);line.skirt.frustumCulled=false;line.group.add(line.skirt);
    const outline=new THREE.BufferGeometry();outline.setAttribute('position',new THREE.BufferAttribute(new Float32Array((n*2+line.columns*2)*2*3),3));
    outline.attributes.position.setUsage(THREE.DynamicDrawUsage);
    line.outline=new THREE.LineSegments(outline,new THREE.LineBasicMaterial({color:0x244651}));line.outline.frustumCulled=false;line.group.add(line.outline);
    // The printed chevrons are real meshes bent onto the rideable face, not billboards.
    line.arrows=[.26,.54,.78].map(t=>{
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12*3),3));
      const mesh=new THREE.Mesh(geo,this.edge);mesh.frustumCulled=false;line.group.add(mesh);return {t,mesh};
    });
    line.supports=[-1,1].map(side=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(.22,1,.26),this.dark);line.group.add(mesh);return {side,mesh};
    });
  }
  reset(){
    this.completed=this.launches=0;this.riding=null;this.route=[];
    for(const line of this.lines){
      const w=line.wave;line.z=(w.anchorFrom+w.anchorTo)/2+2;
      const forecast=line.z/30;
      line.x=line.type==='side'?line.edgeSide*6.8:THREE.MathUtils.clamp(this.game.wave.crestX(w,line.z,forecast)+w.width*.32,-5.6,5.6);
      line.stage=0;line.done=line.landed=false;line.flash=0;line.group.visible=false;
      // Choose a clear footprint once. Ramps do not slide sideways with a changing recommendation.
      for(const h of this.game.world.hazards){
        if(line.type==='side'||h.type!=='buoy'||Math.abs(h.initialZ-line.z)>line.length+8)continue;
        if(Math.abs(h.initialX-line.x)<line.width/2+1.8)line.x=THREE.MathUtils.clamp(h.initialX+(h.initialX>0?-1:1)*(line.width/2+2.1),-6.2,6.2);
      }
      if(line.type==='side'){
        line.side=-line.edgeSide;
      }
      line.fx=0;line.fz=1;
    }
    // Author the whole level once. No player position, velocity or mutable hazard state enters the route.
    this.plan();
  }
  local(line,x,z){
    const dx=x-line.x,dz=z-line.z;
    const across=dx*line.fz-dz*line.fx;
    return {t:(dx*line.fx+dz*line.fz)/line.length+.5,across,q:line.type==='side'?across*line.edgeSide/line.width+.5:0};
  }
  rise(line,t,across){
    if(line.type!=='side')return line.height*t*t;
    const q=THREE.MathUtils.clamp(across*line.edgeSide/line.width+.5,0,1);
    return line.height*(1-Math.sqrt(Math.max(0,1-q*q)));
  }
  point(line,t,across=0){
    const along=(t-.5)*line.length;
    const x=line.x+line.fx*along+line.fz*across,z=line.z+line.fz*along-line.fx*across;
    return {x,z,y:this.game.wave.height(x,z)+.12+this.rise(line,t,across)};
  }
  position(line,index){
    if(line.type==='side')return this.point(line,index===0?1/6:.89,line.edgeSide*(index===0?-line.width/2-.65:line.width*.41));
    return this.point(line,index===0?0:1);
  }
  surface(line,x,z){
    const local=this.local(line,x,z),s=this.game.wave.sample(x,z),height=s.height+.12+this.rise(line,local.t,local.across);
    const q=THREE.MathUtils.clamp(local.q,0,1),rise=2*line.height*local.t/line.length;
    const dx=line.type==='side'?line.edgeSide*line.height/line.width*q/Math.sqrt(Math.max(.0025,1-q*q)):rise*line.fx;
    return {...s,height,dx:s.dx+dx,dz:s.dz+(line.type==='side'?0:rise*line.fz),ramp:line};
  }
  stepRide(dt,previous,surface){
    const g=this.game,p=g.p;
    if(window.FLOW_TEST_MODE||p.fallen||p.recovering>0){this.riding=null;return surface;}
    if(p.airborne){this.riding=null;return surface;}
    if(!this.riding)for(const line of this.lines){
      if(line.done)continue;
      const a=this.local(line,previous.x,previous.z),b=this.local(line,p.x,p.z);
      const forward=p.sideVelocity*line.fx+p.speed*Math.cos(p.heading)*line.fz;
      const sideEntry=line.type==='side'&&a.q<=.025&&b.q>.025&&b.q<.25&&b.t>.04&&b.t<.68&&p.sideVelocity*line.edgeSide>1.3;
      const frontEntry=line.type==='straight'&&a.t<=.14&&b.t<.20&&b.t>=0&&Math.abs(b.across)<line.width/2-.16;
      if((frontEntry||sideEntry)&&forward>12){
        this.riding=line;line.stage=1;break;
      }
    }
    const line=this.riding;if(!line)return surface;
    const at=this.local(line,p.x,p.z);
    if(at.t<0||at.t>1.04||Math.abs(at.across)>line.width/2+.1){this.riding=null;line.stage=0;return surface;}
    const rampSurface=this.surface(line,p.x,p.z);
    const atLip=line.type==='side'?at.q>=.91||at.t>=.96:at.t>=.94;
    const popZone=line.type==='side'?at.q>.45:at.t>.35;
    if(atLip||(g.jump.requested&&popZone)){
      const pop=g.jump.requested;g.jump.requested=false;
      line.done=true;line.stage=2;this.launches++;this.riding=null;
      g.jump.launchRamp(line,rampSurface,pop);
    }
    return rampSurface;
  }
  land(line,clean){
    if(line.landed)return;line.landed=true;line.flash=clean?.8:0;
    if(clean)this.completed++;
  }
  step(dt){
    const p=this.game.p;
    if(p.fallen)this.riding=null;
    for(const line of this.lines){
      line.flash=Math.max(0,line.flash-dt);
      if(p.z>line.z+line.length&&!line.done){line.done=true;line.stage=-1;}
    }
  }
  hazardsAt(z){
    return this.game.world.hazards.filter(h=>h.type==='buoy'&&Math.abs(h.initialZ-z)<10)
      .map(h=>({x:h.initialX,z:h.initialZ,radius:2.5}));
  }
  maneuverAt(z){
    return this.lines.find(line=>{
      const entry=this.position(line,0),exit=this.position(line,1);
      return z>=entry.z-52&&z<=exit.z+36;
    });
  }
  candidate(z,previous=1){
    const wave=this.game.wave,forecast=z/30,hazards=this.hazardsAt(z);let best=null;
    for(const w of wave.waves){
      if(wave.envelope(w,z,forecast)<.12)continue;
      const center=wave.crestX(w,z,forecast)+w.width*.34;
      for(const offset of [0,-1.8,1.8,-3.2,3.2]){
        const x=THREE.MathUtils.clamp(center+offset,-6.8,6.8),s=wave.field(x,z,forecast);
        if(!s.wave||s.face<.045||s.face>.76||s.energy<.12||hazards.some(h=>Math.abs(x-h.x)<h.radius))continue;
        const score=s.energy*2.4-Math.abs(s.face-.34)-Math.abs(x-previous)*.26-Math.abs(offset)*.14;
        if(!best||score>best.score)best={x,score};
      }
    }
    return best?previous+THREE.MathUtils.clamp(best.x-previous,-.48,.48):previous;
  }
  plan(){
    this.route=[];let previous=1;
    for(let z=0;z<=COMICS_COURSE.length+140;z+=2){
      previous=this.candidate(z,previous);this.route.push({z,x:previous});
    }
  }
  basePoint(z){
    const at=THREE.MathUtils.clamp(z/2,0,this.route.length-1),i=Math.floor(at),a=this.route[i],b=this.route[Math.min(i+1,this.route.length-1)];
    return THREE.MathUtils.lerp(a.x,b.x,at-i);
  }
  routePoint(z){
    const line=this.maneuverAt(z);
    if(!line)return this.basePoint(z);
    const entry=this.position(line,0),exit=this.position(line,1),smooth=this.game.wave.smooth;
    if(z<entry.z)return THREE.MathUtils.lerp(this.basePoint(entry.z-52),entry.x,smooth((z-entry.z+52)/52));
    if(z<=exit.z)return THREE.MathUtils.lerp(entry.x,exit.x,(z-entry.z)/(exit.z-entry.z));
    return THREE.MathUtils.lerp(exit.x,this.basePoint(exit.z+36),smooth((z-exit.z)/36));
  }
  guidanceHeight(x,z){
    const line=this.lines.find(l=>{
      const at=this.local(l,x,z);
      return at.t>=0&&at.t<=1&&Math.abs(at.across)<l.width/2;
    });
    return line?this.surface(line,x,z).height:this.game.wave.height(x,z);
  }
  update(){
    const g=this.game,p=g.p,n=16;
    for(const line of this.lines){
      line.group.visible=['playing','paused'].includes(g.state)&&line.z-p.z<135&&line.z-p.z>-16;
      if(!line.group.visible)continue;
      const pos=line.top.geometry.attributes.position,cols=line.columns;
      for(let row=0;row<=n;row++)for(let col=0;col<=cols;col++){
        const point=this.point(line,row/n,(col/cols-.5)*line.width);pos.setXYZ(row*(cols+1)+col,-point.x,point.y,point.z);
      }
      pos.needsUpdate=true;line.top.geometry.computeVertexNormals();
      const skirt=line.skirt.geometry.attributes.position,outline=line.outline.geometry.attributes.position;let si=0,oi=0;
      const vertex=(attr,index,q,down=0)=>attr.setXYZ(index,-q.x,q.y-down,q.z);
      const cut=(q,depth=.24)=>vertex(skirt,si++,q,depth);
      for(const side of [-1,1])for(let i=0;i<n;i++){
        const a=this.point(line,i/n,side*line.width/2),b=this.point(line,(i+1)/n,side*line.width/2);
        const depth=line.type==='side'&&side===line.edgeSide?line.height+.24:.24;
        cut(a,0);cut(a,depth);cut(b,0);cut(a,depth);cut(b,depth);cut(b,0);
        vertex(outline,oi++,a);vertex(outline,oi++,b);
      }
      for(const t of [0,1])for(let col=0;col<cols;col++){
        const a=this.point(line,t,(col/cols-.5)*line.width),b=this.point(line,t,((col+1)/cols-.5)*line.width);
        for(const [q,down] of [[a,0],[a,.24],[b,0],[a,.24],[b,.24],[b,0]])cut(q,down);
        vertex(outline,oi++,a);vertex(outline,oi++,b);
      }
      line.outline.geometry.setDrawRange(0,oi);skirt.needsUpdate=outline.needsUpdate=true;
      for(const arrow of line.arrows){
        const vertices=arrow.mesh.geometry.attributes.position;
        const points=[[-1.25,-.06],[0,.055],[0,.02],[-1.25,-.06],[0,.02],[-1.25,-.025],
          [1.25,-.06],[1.25,-.025],[0,.02],[1.25,-.06],[0,.02],[0,.055]];
        points.forEach(([across,along],i)=>{
          const face=line.type==='side'?line.edgeSide*(line.width*.25+across*.32):across;
          const q=this.point(line,arrow.t+along,face);vertices.setXYZ(i,-q.x,q.y+.028,q.z);
        });vertices.needsUpdate=true;
      }
      for(const {side,mesh} of line.supports){
        const q=this.point(line,line.type==='side'?(side<0?.18:.82):.86,line.type==='side'?line.edgeSide*(line.width/2+.1):side*(line.width/2-.25));
        const height=line.type==='side'?line.height:1.25;mesh.position.set(-q.x,q.y-height/2,q.z);mesh.scale.y=height;
      }
    }
  }
}
window.TrickRoute=TrickRoute;
