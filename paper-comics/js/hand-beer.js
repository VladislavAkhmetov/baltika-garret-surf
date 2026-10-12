/* One liquid state drives the oversized hand prop, HUD and actual losses. */
class ComicBeerLiquid extends MugLiquid {
  step(dt,ax,ay,tilt){
    const targetSlope=THREE.MathUtils.clamp((ax+Math.sin(tilt))*.8,-.38,.38),next=new Float32Array(this.n);
    for(let i=0;i<this.n;i++){
      const left=this.h[Math.max(0,i-1)],right=this.h[Math.min(this.n-1,i+1)],x=i/(this.n-1)-.5;
      const acceleration=(left+right-2*this.h[i])*160+(targetSlope*x-this.h[i])*24-this.v[i]*(4.5+Math.abs(ay));
      this.v[i]+=acceleration*dt;next[i]=this.h[i]+this.v[i]*dt;
    }
    let mean=0;for(const value of next)mean+=value;mean/=this.n;
    for(let i=0;i<this.n;i++)this.h[i]=next[i]-mean;
    this.handleSpill(dt);
  }
}
class HandBeer {
  constructor(game){
    this.game=game;this.liquid=game.mug;this.roll=0;this.rollVelocity=0;this.drops=[];this.printFrame=-1;
    this.canvas=document.createElement('canvas');this.canvas.width=384;this.canvas.height=480;this.ctx=this.canvas.getContext('2d');
    this.texture=new THREE.CanvasTexture(this.canvas);this.texture.minFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;
    this.frame=new Image();
    this.ready=new Promise((resolve,reject)=>{this.frame.onload=()=>{this.draw();this.texture.needsUpdate=true;resolve();};this.frame.onerror=()=>reject(new Error('Не удалось загрузить кружку'));});
    this.ready.catch(()=>{});this.frame.src='assets/comics/mug-paper-frame.png';
    this.pivot=new THREE.Group();
    this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.12,1.4),new THREE.MeshBasicMaterial({map:this.texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    this.mesh.scale.set(1,1,1);
    // Rear view: glass to the left of the right hand, handle to its right.
    // Rotate at the gripped handle bar, not the centre of the glass.
    this.gripCanvas={x:332,y:230};
    this.mesh.position.set((.5-this.gripCanvas.x/384)*1.12,(this.gripCanvas.y/480-.5)*1.4,-.015);
    this.mesh.renderOrder=2;this.pivot.add(this.mesh);game.player.card.add(this.pivot);
    this.liquid.addSpillListener((side,amount)=>this.emit(side,amount));
    this.reset();
  }
  reset(){this.roll=0;this.rollVelocity=0;this.drops=[];this.spillBudget=0;this.printFrame=-1;this.peakSlosh=0;this.draw();}
  emit(side,amount){
    // The liquid reports tiny overflows every physics tick. Accumulate volume
    // instead of turning each one into a full burst of amber drops.
    this.spillBudget+=Math.max(0,amount)*160;
    const count=Math.min(12,Math.floor(this.spillBudget));if(!count)return;
    this.spillBudget-=count;
    const sign=side||Math.sign(this.roll)||1;
    for(let i=0;i<count;i++)this.drops.push({x:sign<0?122:258,y:91,vx:sign*(45+Math.random()*100),vy:-55-Math.random()*130,life:.65+Math.random()*.25,r:3+Math.random()*5});
    if(this.drops.length>42)this.drops.splice(0,this.drops.length-42);
    if(this.game.state==='playing'&&this.game.p)this.game.emitBeer(sign,Math.min(10,count));
  }
  step(dt,turnAcceleration,wake,jerk){
    const g=this.game,p=g.p,assist=1-p.crouch*.45-Math.max(0,-p.pitch)*.18;
    const target=(-p.lean*.34-jerk*.12-p.pitch*.09)*assist;
    this.rollVelocity+=(target-this.roll)*48*dt-this.rollVelocity*8.5*dt;
    this.roll+=this.rollVelocity*dt;
    const drive=(turnAcceleration*.13+jerk*.4+wake*.8)*assist;
    this.liquid.update(dt,drive,Math.abs(wake),-this.roll*.8+wake*assist);
    this.peakSlosh=Math.max(this.peakSlosh,...this.liquid.h.map(Math.abs));
    this.drops=this.drops.filter(d=>{d.life-=dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.vy+=410*dt;return d.life>0;});
  }
  impact(clean){this.liquid.applyLandingImpulse(clean);this.rollVelocity+=(1-clean)*1.15;}
  update(){
    const anchor=this.game.heroAnimator.currentGrip||{x:.85,y:1.0};
    this.pivot.position.set(anchor.x,anchor.y,.01);
    this.pivot.rotation.z=(anchor.angle||0)+this.roll;
    const frame=Math.floor(this.game.time*30);
    if(frame!==this.printFrame){this.printFrame=frame;this.draw();this.texture.needsUpdate=true;}
  }
  outline(c){
    c.beginPath();c.moveTo(108,87);c.bezierCurveTo(147,67,240,67,278,89);c.lineTo(264,400);c.quadraticCurveTo(190,421,120,398);c.closePath();
  }
  inside(c){c.beginPath();c.moveTo(121,91);c.lineTo(264,91);c.lineTo(251,385);c.quadraticCurveTo(191,403,133,382);c.closePath();}
  draw(){
    const c=this.ctx,l=this.liquid,t=this.game.time||0,paper=this.frame.complete&&this.frame.naturalWidth>0;c.clearRect(0,0,384,480);
    // Cream paper silhouette and a thick, translucent glass handle.
    c.lineCap='round';c.lineJoin='round';c.strokeStyle='#f6ebd3';c.lineWidth=25;
    if(!paper){
    c.beginPath();c.moveTo(264,169);c.bezierCurveTo(353,152,349,292,258,300);c.stroke();
    c.strokeStyle='#244854';c.lineWidth=17;c.stroke();c.strokeStyle='#d9eeeb';c.lineWidth=11;c.stroke();c.strokeStyle='#ffffff';c.lineWidth=3;c.stroke();
    this.outline(c);c.strokeStyle='#f6ebd3';c.lineWidth=16;c.stroke();
    const glass=c.createLinearGradient(110,0,275,0);glass.addColorStop(0,'rgba(219,242,237,.7)');glass.addColorStop(.22,'rgba(255,255,239,.18)');glass.addColorStop(.7,'rgba(126,209,212,.10)');glass.addColorStop(1,'rgba(228,248,242,.72)');c.fillStyle=glass;c.fill();
    }
    c.save();this.inside(c);c.clip();
    const top=382-l.level*267,points=[];
    for(let i=0;i<l.n;i++){const x=121+i/(l.n-1)*143;points.push({x,y:Math.max(79,Math.min(387,top-l.h[i]*285))});}
    const beer=c.createLinearGradient(0,90,0,405);beer.addColorStop(0,'#ffe179');beer.addColorStop(.22,'#ffc032');beer.addColorStop(.65,'#d78616');beer.addColorStop(1,'#9b4912');
    c.fillStyle=beer;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.lineTo(258,409);c.lineTo(120,409);c.closePath();c.fill();
    c.globalAlpha=.17;for(let i=0;i<95;i++){const x=125+(i*47)%135,y=110+(i*79)%285;c.fillStyle=i%2?'#7e4818':'#fff4b6';c.fillRect(x,y,1.5,1.5);}c.globalAlpha=1;
    c.fillStyle='#fff0ae';for(let i=0;i<22;i++){const x=136+(i*53)%107,y=383-((t*(19+i%3*8)+i*27)%275),index=Math.round((x-121)/143*(l.n-1));if(y>points[index].y+10){c.globalAlpha=.25+i%4*.12;c.beginPath();c.ellipse(x+Math.sin(t*2+i)*2,y,1.5+i%3,2.2+i%3,0,0,Math.PI*2);c.fill();}}c.globalAlpha=1;
    // Foam has thickness, scalloped bubbles and the same moving surface as the beer.
    const foamHeight=8+l.foam*15;c.strokeStyle='#f1dfb6';c.lineWidth=foamHeight+4;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();
    c.strokeStyle='#fff8de';c.lineWidth=foamHeight;c.stroke();c.fillStyle='#fffdf0';
    points.forEach((p,i)=>{c.beginPath();c.arc(p.x,p.y-foamHeight*.25,3.5+(i%3),0,Math.PI*2);c.fill();});
    c.restore();
    if(paper){c.save();c.translate(384,0);c.scale(-1,1);c.drawImage(this.frame,6,54,296,365);c.restore();}else{
    this.outline(c);c.strokeStyle='#294650';c.lineWidth=3;c.stroke();
    c.strokeStyle='rgba(255,255,247,.78)';c.lineWidth=7;c.beginPath();c.moveTo(139,121);c.lineTo(148,360);c.stroke();c.lineWidth=3;c.beginPath();c.moveTo(154,142);c.lineTo(158,354);c.moveTo(251,135);c.lineTo(241,362);c.stroke();
    c.fillStyle='rgba(233,247,234,.55)';c.beginPath();c.ellipse(192,391,60,10,0,0,Math.PI*2);c.fill();c.strokeStyle='#edf4da';c.lineWidth=4;c.beginPath();c.moveTo(137,396);c.quadraticCurveTo(190,410,253,398);c.stroke();
    // Open mouth of the glass: the rim stays clear of the foam at full capacity.
    c.fillStyle='rgba(31,84,93,.20)';c.beginPath();c.ellipse(193,88,81,12,0,Math.PI,Math.PI*2);c.fill();c.strokeStyle='#244650';c.lineWidth=3;c.beginPath();c.ellipse(193,88,82,12,0,0,Math.PI*2);c.stroke();c.strokeStyle='#fff7dc';c.lineWidth=5;c.beginPath();c.ellipse(193,89,79,10,0,0,Math.PI);c.stroke();
    }
    for(const d of this.drops){c.globalAlpha=Math.min(1,d.life*3);c.fillStyle='#f8b52b';c.strokeStyle='#fff3cb';c.lineWidth=2;c.beginPath();c.ellipse(d.x,d.y,d.r,d.r*1.35,-.35,0,Math.PI*2);c.fill();c.stroke();}c.globalAlpha=1;
  }
}
window.HandBeer=HandBeer;window.ComicBeerLiquid=ComicBeerLiquid;
