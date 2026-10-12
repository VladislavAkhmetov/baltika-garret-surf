/* One route owns water guidance, physical paper ramps and their takeoff direction. */
class TrickRoute {
  constructor(game){
    this.game=game;this.lines=[];this.completed=0;this.launches=0;
    this.paperTexture=game.paperToon.paper;
    this.ink=this.makeInk(0xd36c50);
    this.edge=this.makeInk(0xf6e9c9);
    this.dark=new THREE.MeshBasicMaterial({color:0x244651});
    this.sideProps=[
      {prop:'ship',name:'ОБЛОМОК ПАЛУБЫ',length:22,width:4.2,height:2.5,forwardRise:1.2,arrows:false},
      {prop:'umbrella',name:'ПЛЯЖНЫЙ ЗОНТ',length:12,width:9,height:2.7,forwardRise:1,arrows:false,dome:.65},
      {prop:'rescue',name:'СПАСАТЕЛЬНАЯ ДОСКА',length:24,width:3.6,height:2.4,forwardRise:1.4,arrows:true},
      {prop:'sign',name:'ПЛЯЖНЫЙ ЩИТ',length:19,width:4,height:2.65,forwardRise:1.1,arrows:true}
    ];
    // Nine opportunities, with room for free carving between them. The flow test stays isolated.
    for(const id of (window.DRIVE_TEST_MODE?[2]:window.FLOW_TEST_MODE?[]:[3,5,7,9,11,13,15,17,19])){
      const wave=game.wave.waves[id];if(!wave)continue;
      const group=new THREE.Group();game.scene.add(group);
      const side=this.lines.length%2===1;
      const line={id,wave,group,type:side?'side':'straight',edgeSide:this.lines.length%4===1?-1:1,
        length:side?24:10,width:side?3.4:4.5,height:side?3.4:1.85,columns:side?16:4};
      if(side)Object.assign(line,this.sideProps[Math.floor(this.lines.length/2)]);
      this.makeRamp(line);this.lines.push(line);
    }
    this.choiceSigns=window.FLOW_TEST_MODE?[]:[['ВЫЛЕТ',-2.7,'#c56943'],['ОБЪЕЗД',2.8,'#236b67']].map(([text,x,color])=>({
      mesh:game.sprite(game.label(text,color,256,64),3.6,.9),x,z:199
    }));
    this.reset();
  }
  makeInk(color){
    return this.game.paperToon.material(color);
  }
  makeRamp(line){
    const n=16,geometry=new THREE.PlaneGeometry(line.width,line.length,line.columns,n);
    // Mirroring gameplay X into scene X reverses winding; keep the painted face upward.
    const indices=geometry.index.array;for(let i=0;i<indices.length;i+=3){const swap=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=swap;}
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    line.top=new THREE.Mesh(geometry,line.type==='side'?this.makePropMaterial(line):this.ink);line.top.frustumCulled=false;line.group.add(line.top);
    const skirt=new THREE.BufferGeometry();skirt.setAttribute('position',new THREE.BufferAttribute(new Float32Array((n*2+line.columns*2)*6*3),3));
    skirt.attributes.position.setUsage(THREE.DynamicDrawUsage);
    line.skirt=new THREE.Mesh(skirt,this.edge);line.skirt.frustumCulled=false;line.group.add(line.skirt);
    const outline=new THREE.BufferGeometry();outline.setAttribute('position',new THREE.BufferAttribute(new Float32Array((n*2+line.columns*2)*2*3),3));
    outline.attributes.position.setUsage(THREE.DynamicDrawUsage);
    line.outline=new THREE.LineSegments(outline,new THREE.LineBasicMaterial({color:0x244651}));line.outline.frustumCulled=false;line.group.add(line.outline);
    // The printed chevrons are real meshes bent onto the rideable face, not billboards.
    line.arrows=(line.type==='straight'||line.arrows?[.26,.54,.78]:[]).map(t=>{
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12*3),3));
      const mesh=new THREE.Mesh(geo,this.edge);mesh.frustumCulled=false;line.group.add(mesh);return {t,mesh};
    });
    line.supports=[-1,1].map(side=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(.22,1,.26),this.makeInk(0x244651));line.group.add(mesh);return {side,mesh};
    });
    if(line.prop==='umbrella'){
      line.pole=new THREE.Mesh(new THREE.CylinderGeometry(.085,.10,1,8),this.makeInk(0xe9d8ae));line.group.add(line.pole);
      line.hub=new THREE.Mesh(new THREE.SphereGeometry(.19,10,6),this.edge);line.group.add(line.hub);
      line.ribs=Array.from({length:8},(_,i)=>{
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(9*3),3));
        const mesh=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xf5e8c5}));mesh.frustumCulled=false;line.group.add(mesh);return {mesh,angle:i*Math.PI/4};
      });
    }
  }
  makePropMaterial(line){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=line.prop==='umbrella'?256:1024;const c=canvas.getContext('2d');
    if(line.prop==='ship'){
      c.fillStyle='#8d5b37';c.fillRect(0,0,256,1024);
      for(let plank=0;plank<6;plank++){
        c.fillStyle=['#a77648','#b58a58','#986843'][plank%3];c.fillRect(plank*43+2,0,40,1024);
        c.strokeStyle='#714b30';c.lineWidth=2;
        for(let grain=0;grain<5;grain++){c.beginPath();c.moveTo(plank*43+7+grain*6,0);for(let y=0;y<=1024;y+=32)c.lineTo(plank*43+7+grain*6+Math.sin(y*.018+grain)*3,y);c.stroke();}
        c.fillStyle='#3b4441';for(const y of [54,960]){c.beginPath();c.arc(plank*43+20,y,3,0,Math.PI*2);c.fill();}
      }
      c.fillStyle='#ddd2ae';c.fillRect(0,82,256,18);c.fillRect(0,912,256,18);
    }else if(line.prop==='umbrella'){
      c.fillStyle='#f2dfb4';c.fillRect(0,0,256,256);
      const colors=['#e77853','#f4e4bc','#45a39f','#f4e4bc','#e77853','#f4e4bc','#45a39f','#f4e4bc'];
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,b=(i+1)*Math.PI/4;c.fillStyle=colors[i];c.beginPath();c.moveTo(128,128);
        c.arc(128,128,190,a,b);c.closePath();c.fill();
        c.strokeStyle='#d9cda6';c.lineWidth=2;c.beginPath();c.moveTo(128,128);c.lineTo(128+Math.cos(a)*180,128+Math.sin(a)*180);c.stroke();
      }
      c.fillStyle='#f5ebcf';c.beginPath();c.arc(128,128,5,0,Math.PI*2);c.fill();
    }else if(line.prop==='rescue'){
      c.fillStyle='#da7944';c.fillRect(0,0,256,1024);c.fillStyle='#f3deaf';c.fillRect(12,0,18,1024);c.fillRect(226,0,18,1024);
      c.fillRect(75,170,106,32);c.fillRect(112,132,32,108);
      c.strokeStyle='#333e42';c.lineWidth=7;for(const y of [340,660]){c.beginPath();c.moveTo(45,y+28);c.lineTo(45,y);c.lineTo(76,y);c.stroke();c.beginPath();c.moveTo(210,y+28);c.lineTo(210,y);c.lineTo(180,y);c.stroke();}
    }else{
      c.fillStyle='#ece0bf';c.fillRect(0,0,256,1024);c.fillStyle='#cd5e4c';
      for(const y of [70,410,750]){c.beginPath();c.moveTo(18,y);c.lineTo(238,y+130);c.lineTo(238,y+205);c.lineTo(18,y+75);c.fill();}
      c.strokeStyle='#5d6a63';c.lineWidth=4;c.strokeRect(12,12,232,1000);
    }
    // Printed wear belongs to the prop, not a photographic background plate.
    for(let y=0;y<1024;y+=13)for(let x=0;x<256;x+=11){c.fillStyle=(x+y)%3?'rgba(255,244,216,.12)':'rgba(55,45,29,.10)';c.fillRect(x,y,2,3);}
    const texture=new THREE.CanvasTexture(canvas);texture.anisotropy=Math.min(4,this.game.renderer.capabilities.getMaxAnisotropy());
    return this.game.paperToon.material(0xffffff,{map:texture});
  }
  reset(){
    this.completed=this.launches=0;this.riding=null;this.route=[];
    for(const line of this.lines){
      const w=line.wave;line.z=(w.anchorFrom+w.anchorTo)/2+2;
      const forecast=line.z/30;
      line.x=line.type==='side'?line.edgeSide*7.2:THREE.MathUtils.clamp(this.game.wave.crestX(w,line.z,forecast)+w.width*.32,-5.6,5.6);
      line.stage=0;line.done=line.landed=false;line.flash=0;line.group.visible=false;
      if(window.DRIVE_TEST_MODE){line.z=DriveTest.layout.rampZ;line.x=-2.7;line.length=12;line.height=2.2;}
      else if(!window.FLOW_TEST_MODE&&line===this.lines[0]){line.z=226;line.x=-2.7;line.length=12;line.height=2.2;}
      line.disabled=!window.FLOW_TEST_MODE&&line.id===5;
      line.finale=!window.FLOW_TEST_MODE&&line.id===19;
      if(!window.FLOW_TEST_MODE&&line.id===7){line.z=452;line.x=-2.2;}
      if(line.finale){line.z=1110;line.x=0;line.length=14;line.height=3.1;}
      // Choose a clear footprint once. Ramps do not slide sideways with a changing recommendation.
      for(const h of this.game.world.hazards){
        if(line.type==='side'||h.type!=='flotsam'||Math.abs(h.initialZ-line.z)>line.length+8)continue;
        const clearance=(h.collisionRadius??1)+.9;
        if(Math.abs(h.initialX-line.x)<line.width/2+clearance)line.x=THREE.MathUtils.clamp(h.initialX+(h.initialX>0?-1:1)*(line.width/2+clearance+.3),-6.2,6.2);
      }
      if(line.type==='side'){
        line.side=-line.edgeSide;
      }
      line.fx=0;line.fz=1;
      const entry=this.position(line,0),exit=this.position(line,1);
      line.entry={x:entry.x,z:entry.z};line.exit={x:exit.x,z:exit.z};
    }
    // Author the whole level once. No player position, velocity or mutable hazard state enters the route.
    this.plan();
  }
  local(line,x,z){
    const dx=x-line.x,dz=z-line.z;
    const across=dx*line.fz-dz*line.fx;
    const t=(dx*line.fx+dz*line.fz)/line.length+.5;
    return {t,across,q:line.type==='side'?across*line.edgeSide/this.widthAt(line,t)+.5:0};
  }
  widthAt(line,t){
    const edge=Math.min(1,Math.max(0,Math.min(t,1-t))*6);
    if(line.prop==='umbrella')return line.width*Math.sqrt(Math.max(.0004,1-(2*t-1)**2));
    if(line.prop==='rescue')return line.width*(.6+.4*edge);
    if(line.prop==='ship')return line.width*(.94+.06*Math.cos(Math.round(t*16)*1.7));
    return line.width;
  }
  rise(line,t,across){
    if(line.type!=='side')return line.height*t*t;
    const q=across*line.edgeSide/line.width+.5;
    const dome=line.dome?line.dome*Math.max(0,1-(2*across/line.width)**2-(2*t-1)**2):0;
    return line.height*q+line.forwardRise*t+dome;
  }
  point(line,t,across=0){
    const along=(t-.5)*line.length;
    const x=line.x+line.fx*along+line.fz*across,z=line.z+line.fz*along-line.fx*across;
    if(line.type==='side'){
      const innerX=line.x-line.edgeSide*line.width/2,entryZ=line.z-line.length/3;
      const base=this.game.wave.height(innerX,entryZ)+.12-line.forwardRise/6;
      return {x,z,y:base+this.rise(line,t,across)};
    }
    return {x,z,y:this.game.wave.height(x,z)+.12+this.rise(line,t,across)};
  }
  position(line,index){
    if(line.type==='side'){
      const t=index===0?1/6:.89,width=this.widthAt(line,t);
      return this.point(line,t,line.edgeSide*(index===0?-width/2-.65:width*.41));
    }
    return this.point(line,index===0?0:1);
  }
  surface(line,x,z){
    const local=this.local(line,x,z),s=this.game.wave.sample(x,z),height=s.height+.12+this.rise(line,local.t,local.across);
    if(line.type==='side'){
      const domed=line.dome&&(2*local.across/line.width)**2+(2*local.t-1)**2<1;
      return {...s,height:this.point(line,local.t,local.across).y,
        dx:line.edgeSide*line.height/line.width-(domed?8*line.dome*local.across/line.width**2:0),
        dz:line.forwardRise/line.length-(domed?8*line.dome*(local.t-.5)/line.length:0),ramp:line};
    }
    const rise=2*line.height*local.t/line.length;
    return {...s,height,dx:s.dx+rise*line.fx,dz:s.dz+rise*line.fz,ramp:line};
  }
  stepRide(dt,previous,surface){
    const g=this.game,p=g.p;
    if(window.FLOW_TEST_MODE&&!window.DRIVE_TEST_MODE||p.fallen||p.recovering>0){this.riding=null;return surface;}
    if(p.airborne){this.riding=null;return surface;}
    if(!this.riding)for(const line of this.lines){
      if(line.done||line.disabled)continue;
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
    // A round canopy narrows after its centre. Crossing that forward rim is
    // the takeoff, even when the rider has not reached the outer side lip.
    const canopyLip=line.prop==='umbrella'&&at.t>.55&&at.t<=1.04&&Math.abs(at.across)>=this.widthAt(line,at.t)/2-.12;
    if(at.t<0||at.t>1.04||!canopyLip&&Math.abs(at.across)>this.widthAt(line,at.t)/2+.1){this.riding=null;line.stage=0;return surface;}
    const rampSurface=this.surface(line,p.x,p.z);
    const atLip=canopyLip||(line.type==='side'?at.q>=.91||at.t>=.96:at.t>=.94);
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
    return this.game.world.hazards.filter(h=>h.type==='flotsam'&&Math.abs(h.initialZ-z)<10)
      .map(h=>({x:h.initialX,z:h.initialZ,radius:(h.collisionRadius??1)+1.5}));
  }
  maneuverAt(z){
    return this.lines.find(line=>{
      if(line.disabled)return false;
      const entry=line.entry,exit=line.exit;
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
    const sprint=this.game.setpiece?.finishPath(z);if(sprint!==null&&sprint!==undefined)return sprint;
    const authored=this.game.setpiece?.path(z);if(authored!==null&&authored!==undefined)return authored;
    if(!window.FLOW_TEST_MODE&&z<214){
      const points=COMICS_COURSE.opening,last=points[points.length-1],smooth=this.game.wave.smooth;
      if(z<=last.z){
        const i=Math.max(0,points.findIndex(p=>p.z>=z)-1),a=points[i],b=points[i+1];
        return THREE.MathUtils.lerp(a.x,b.x,smooth((z-a.z)/(b.z-a.z)));
      }
      return THREE.MathUtils.lerp(last.x,this.maneuverPoint(214),smooth((z-last.z)/(214-last.z)));
    }
    const first=this.lines[0];
    if(!window.FLOW_TEST_MODE&&first&&z>first.exit.z&&z<320){
      if(z<292)return first.x;
      return THREE.MathUtils.lerp(first.x,this.maneuverPoint(320),this.game.wave.smooth((z-292)/28));
    }
    return this.maneuverPoint(z);
  }
  bypassPoint(z){
    const authored=this.game.setpiece?.path(z,true);if(authored!==null&&authored!==undefined)return authored;
    if(z<174||z>324)return null;
    if(z<220)return THREE.MathUtils.lerp(.8,2.8,this.game.wave.smooth((z-174)/46));
    if(z<284)return 2.8;
    return THREE.MathUtils.lerp(2.8,this.routePoint(324),this.game.wave.smooth((z-284)/40));
  }
  maneuverPoint(z){
    const line=this.maneuverAt(z);
    if(!line)return this.basePoint(z);
    const entry=line.entry,exit=line.exit,smooth=this.game.wave.smooth;
    if(z<entry.z)return THREE.MathUtils.lerp(this.basePoint(entry.z-52),entry.x,smooth((z-entry.z+52)/52));
    if(z<=exit.z)return THREE.MathUtils.lerp(entry.x,exit.x,(z-entry.z)/(exit.z-entry.z));
    return THREE.MathUtils.lerp(exit.x,this.basePoint(exit.z+36),smooth((z-exit.z)/36));
  }
  guidanceHeight(x,z){
    const line=this.lines.find(l=>{
      if(l.disabled)return false;
      const at=this.local(l,x,z);
      return at.t>=0&&at.t<=1&&Math.abs(at.across)<this.widthAt(l,at.t)/2;
    });
    return line?this.surface(line,x,z).height:this.game.wave.height(x,z);
  }
  update(){
    const g=this.game,p=g.p,n=16;
    for(const sign of this.choiceSigns){
      sign.mesh.visible=['playing','paused'].includes(g.state)&&sign.z-p.z<100&&sign.z-p.z>12;
      sign.mesh.position.set(-sign.x,g.wave.height(sign.x,sign.z)+2.5,sign.z);
    }
    for(const line of this.lines){
      line.group.visible=!line.disabled&&['playing','paused'].includes(g.state)&&line.z-p.z<135&&line.z-p.z>-16;
      if(!line.group.visible)continue;
      const pos=line.top.geometry.attributes.position,cols=line.columns;
      for(let row=0;row<=n;row++)for(let col=0;col<=cols;col++){
        const point=this.point(line,row/n,(col/cols-.5)*this.widthAt(line,row/n));pos.setXYZ(row*(cols+1)+col,-point.x,point.y,point.z);
        if(line.prop==='umbrella')line.top.geometry.attributes.uv.setXY(row*(cols+1)+col,.5+(col/cols-.5)*this.widthAt(line,row/n)/line.width,1-row/n);
      }
      if(line.prop==='umbrella')line.top.geometry.attributes.uv.needsUpdate=true;
      pos.needsUpdate=true;line.top.geometry.computeVertexNormals();
      const skirt=line.skirt.geometry.attributes.position,outline=line.outline.geometry.attributes.position;let si=0,oi=0;
      const vertex=(attr,index,q,down=0)=>attr.setXYZ(index,-q.x,q.y-down,q.z);
      const cut=(q,depth=.24)=>vertex(skirt,si++,q,depth);
      for(const side of [-1,1])for(let i=0;i<n;i++){
        const a=this.point(line,i/n,side*this.widthAt(line,i/n)/2),b=this.point(line,(i+1)/n,side*this.widthAt(line,(i+1)/n)/2);
        const depth=line.type==='side'?(line.prop==='umbrella'?.055:.18):.24;
        cut(a,0);cut(a,depth);cut(b,0);cut(a,depth);cut(b,depth);cut(b,0);
        vertex(outline,oi++,a);vertex(outline,oi++,b);
      }
      for(const t of [0,1])for(let col=0;col<cols;col++){
        const width=this.widthAt(line,t),a=this.point(line,t,(col/cols-.5)*width),b=this.point(line,t,((col+1)/cols-.5)*width);
        for(const [q,down] of [[a,0],[a,.24],[b,0],[a,.24],[b,.24],[b,0]])cut(q,down);
        vertex(outline,oi++,a);vertex(outline,oi++,b);
      }
      line.outline.geometry.setDrawRange(0,oi);skirt.needsUpdate=outline.needsUpdate=true;
      line.skirt.geometry.computeVertexNormals();
      for(const arrow of line.arrows){
        const vertices=arrow.mesh.geometry.attributes.position;
        const points=[[-1.25,-.06],[0,.055],[0,.02],[-1.25,-.06],[0,.02],[-1.25,-.025],
          [1.25,-.06],[1.25,-.025],[0,.02],[1.25,-.06],[0,.02],[0,.055]];
        points.forEach(([across,along],i)=>{
          const face=line.type==='side'?line.edgeSide*(line.width*.25+across*.32):across;
          const q=this.point(line,arrow.t+along,face);vertices.setXYZ(i,-q.x,q.y+.028,q.z);
        });vertices.needsUpdate=true;arrow.mesh.geometry.computeVertexNormals();
      }
      for(const {side,mesh} of line.supports){
        const q=this.point(line,line.type==='side'?(side<0?.18:.82):.86,line.type==='side'?line.edgeSide*(line.width/2+.1):side*(line.width/2-.25));
        const height=line.type==='side'?line.height:1.25;mesh.position.set(-q.x,q.y-height/2,q.z);mesh.scale.y=height;
        mesh.visible=line.prop!=='umbrella';
      }
      if(line.pole){
        const face=this.point(line,.5,0),foot=this.point(line,-.18,-line.edgeSide*line.width*.25);
        const a=new THREE.Vector3(-face.x,face.y-.04,face.z),b=new THREE.Vector3(-foot.x,g.wave.height(foot.x,foot.z)+.12,foot.z),delta=a.clone().sub(b);
        line.pole.position.copy(a).add(b).multiplyScalar(.5);line.pole.scale.y=delta.length();line.pole.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
        line.hub.position.set(-face.x,face.y+.12,face.z);
        for(const {mesh,angle} of line.ribs){
          const vertices=mesh.geometry.attributes.position;
          for(let i=0;i<9;i++){
            const radius=i/8,q=this.point(line,.5+Math.sin(angle)*radius*.5,Math.cos(angle)*radius*line.width/2);
            vertices.setXYZ(i,-q.x,q.y+.04,q.z);
          }
          vertices.needsUpdate=true;
        }
      }
    }
  }
}
window.TrickRoute=TrickRoute;
