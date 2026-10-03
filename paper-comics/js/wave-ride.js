/* Long pockets of moving foam: choose a line, stay with it, earn speed. */
class WaveRide {
  constructor(game) {
    this.game=game;this.segments=[];
    for(let i=0;i<8;i++)this.segments.push({from:55+i*139,to:150+i*139,id:i});
    const geometry=new THREE.BufferGeometry(),count=96;
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((count+1)*2*3),3));
    geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array((count+1)*2*3),3));
    const indices=[];for(let i=0;i<count;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}geometry.setIndex(indices);
    this.ribbon=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));
    this.ribbon.frustumCulled=false;game.scene.add(this.ribbon);
    this.arrows=[];
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
    const c=canvas.getContext('2d');c.strokeStyle='#fff3cf';c.lineWidth=9;c.lineCap='square';
    for(let i=0;i<2;i++){c.beginPath();c.moveTo(23,64-i*26);c.lineTo(48,44-i*26);c.lineTo(73,64-i*26);c.stroke();}
    const texture=new THREE.CanvasTexture(canvas),geo=new THREE.PlaneGeometry(.75,.9);geo.rotateX(-Math.PI/2);
    for(let i=0;i<15;i++){const arrow=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));game.scene.add(arrow);this.arrows.push(arrow);}
    this.reset();this.lastFrame=-1;
  }
  reset(){this.charge=0;this.boost=0;this.quality=0;this.caught=false;this.lastAward=-1;this.totalCaught=0;}
  line(z,time=this.game.time){return 3.7*Math.sin(z*.011+1.1)+1.25*Math.sin(z*.032-.4)+.35*Math.sin(time*.6);}
  segment(z){return this.segments.find(s=>z>=s.from&&z<=s.to);}
  step(dt){
    const g=this.game,p=g.p,segment=this.segment(p.z);
    const line=this.line(p.z),error=Math.abs(p.x-line);
    const direction=Math.atan((this.line(p.z+2)-this.line(p.z-2))/4/.52);
    const alignment=Math.max(0,1-Math.abs(p.heading-direction)/.7);
    this.quality=segment&&!p.airborne?Math.max(0,1-error/1.65)*alignment:0;
    const engaging=this.quality>.38;
    this.charge=THREE.MathUtils.clamp(this.charge+dt*(engaging?this.quality*.95:-1.3),0,1);
    this.caught=engaging&&this.charge>.32;
    const target=this.caught?this.charge*11:0;
    this.boost+=(target-this.boost)*(1-Math.exp(-dt*(this.caught?3:2.5)));
    if(this.charge>.82&&segment&&this.lastAward!==segment.id){this.lastAward=segment.id;this.totalCaught++;g.score+=150*g.mug.multiplier;g.moment('ПОЙМАЛ ВОЛНУ!','Держи линию · разгон',false,.95);}
  }
  update(){
    const g=this.game,p=g.p,pos=this.ribbon.geometry.attributes.position,col=this.ribbon.geometry.attributes.color;
    const frame=Math.floor(g.time*24);if(frame===this.lastFrame)return;this.lastFrame=frame;
    const mint=new THREE.Color('#b9efe0'),gold=new THREE.Color('#ffd65b'),foam=new THREE.Color('#f7eed4');
    for(let i=0;i<=96;i++){
      const z=p.z-10+i/96*170,segment=this.segment(z),x=this.line(z);
      const fade=segment?Math.min(1,(z-segment.from)/8,(segment.to-z)/8):0;
      const rag=(g.wave.hash(Math.floor(z*1.2))-.5)*.2;
      for(let side=0;side<2;side++){
        const xx=x+(side-.5)*(1.1+rag)*Math.max(0,fade);
        pos.setXYZ(i*2+side,-xx,g.wave.height(xx,z)+.075,z);
        const color=mint.clone().lerp(this.caught?gold:foam,g.wave.hash(Math.floor(z*.7))*.65);
        col.setXYZ(i*2+side,color.r,color.g,color.b);
      }
    }
    pos.needsUpdate=col.needsUpdate=true;
    this.arrows.forEach((arrow,i)=>{const z=Math.floor((p.z-8)/11)*11+i*11,x=this.line(z),s=this.segment(z);arrow.visible=!!s;arrow.position.set(-x,g.wave.height(x,z)+.11,z);arrow.rotation.z=Math.atan(g.wave.sample(x,z).dx);arrow.material.color.set(this.caught?0xffd454:0xe7f6e5);});
  }
}
window.WaveRide=WaveRide;
