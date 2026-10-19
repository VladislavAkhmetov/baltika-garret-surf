/* A paper aircraft in world space. Its flight is independent of the rider. */
class SkyAdvertiser {
  constructor(game){
    this.game=game;
    this.flight={origin:new THREE.Vector3(110,32,760),velocity:new THREE.Vector3(-8,0,24)};
    this.width=26;this.bannerWidth=52;this.bannerHeight=10;this.ropeLength=11;
    this.group=new THREE.Group();this.group.name='distant-advertising-flight';this.group.visible=false;game.scene.add(this.group);
    this.cameraRight=new THREE.Vector3();
    this.aircraft=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:false,side:THREE.DoubleSide,fog:false,color:0xffffff,opacity:1}));
    this.aircraft.name='amphibious-plane';this.group.add(this.aircraft);
    this.bannerGeometry=new THREE.PlaneGeometry(this.bannerWidth,this.bannerHeight,24,3);
    this.bannerRest=this.bannerGeometry.attributes.position.array.slice();
    this.banner=new THREE.Mesh(this.bannerGeometry,new THREE.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:false,side:THREE.DoubleSide,fog:false,color:0xffffff,opacity:1}));
    this.banner.name='baltika-tow-banner';this.group.add(this.banner);
    const ropeGeometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(9*3),3));
    this.rope=new THREE.Line(ropeGeometry,new THREE.LineBasicMaterial({color:0xded8ba,transparent:true,opacity:.72,fog:false,depthWrite:false}));this.group.add(this.rope);
    this.ready=Promise.all([
      new Promise((resolve,reject)=>{
        const onLoaded=texture=>{this.fitAircraft(texture);this.aircraft.material.map=texture;this.aircraft.material.needsUpdate=true;resolve();};
        const loader=new THREE.TextureLoader();
        loader.load('assets/comics/seaplane-lime-v3.webp',onLoaded,undefined,()=>{
          loader.load('assets/comics/seaplane-lime-v3.png',onLoaded,undefined,()=>reject(new Error('Не удалось загрузить дальний самолёт')));
        });
      }),
      new Promise((resolve,reject)=>new THREE.ImageLoader().load('assets/comics/baltika-logo-reference.png',logo=>{
        this.banner.material.map=this.makeBanner(logo);this.banner.material.needsUpdate=true;resolve();
      },undefined,()=>reject(new Error('Не удалось загрузить логотип Балтики'))))
    ]).then(()=>{this.group.visible=true;this.update();game.renderDirty=true;});
    this.ready.catch(()=>{});
  }
  fitAircraft(texture){
    const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let left=image.width,top=image.height,right=0,bottom=0;
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(pixels[(y*image.width+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    left=Math.max(0,left-2);top=Math.max(0,top-2);right=Math.min(image.width-1,right+2);bottom=Math.min(image.height-1,bottom+2);
    const width=right-left+1,height=bottom-top+1;
    texture.repeat.set(width/image.width,height/image.height);texture.offset.set(left/image.width,1-(bottom+1)/image.height);
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
    this.height=this.width*height/width;
  }
  makeBanner(logo){
    const canvas=document.createElement('canvas');canvas.width=1664;canvas.height=320;
    const c=canvas.getContext('2d');
    // Match the supplied artwork's navy exactly; retain its original lettering
    // and gold arcs instead of approximating the brand with a font.
    c.drawImage(logo,0,0);const navy=c.getImageData(0,0,1,1).data;c.clearRect(0,0,canvas.width,canvas.height);
    c.fillStyle=`rgb(${navy[0]},${navy[1]},${navy[2]})`;
    c.beginPath();c.moveTo(3,5);c.lineTo(1658,2);c.lineTo(1662,314);c.lineTo(5,318);c.closePath();c.fill();
    c.save();c.clip();
    const source={x:44,y:82,width:610,height:190},height=292,width=height*source.width/source.height;
    c.drawImage(logo,source.x,source.y,source.width,source.height,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
    c.strokeStyle='rgba(219,184,124,.65)';c.lineWidth=2;
    c.strokeRect(14,12,1636,296);
    c.restore();
    const texture=new THREE.CanvasTexture(canvas);texture.minFilter=THREE.LinearMipmapLinearFilter;return texture;
  }
  update(){
    const g=this.game,t=g.time,quiet=g.reducedMotion?0:1;
    // Never re-anchor this origin to the player or camera. Perspective supplies
    // the parallax, approach and eventual departure from the visible sky.
    this.group.position.copy(this.flight.origin).addScaledVector(this.flight.velocity,t);
    this.group.position.y+=Math.sin(t*.35)*.65*quiet;
    this.group.quaternion.copy(g.camera.quaternion);
    this.cameraRight.set(1,0,0).applyQuaternion(g.camera.quaternion);
    const direction=this.flight.velocity.dot(this.cameraRight)>=0?1:-1;
    const height=this.height||7;
    this.aircraft.scale.set(-direction*this.width,height,1);
    this.aircraft.rotation.z=direction*(.025+Math.sin(t*.8)*.007*quiet);
    const tailX=-direction*this.width*.4,tailY=-height*.015;
    const leadX=tailX-direction*this.ropeLength,leadY=tailY-.8;
    this.banner.position.set(leadX-direction*this.bannerWidth/2,leadY,-.06);
    const positions=this.bannerGeometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      const x=this.bannerRest[i*3],y=this.bannerRest[i*3+1],u=x/this.bannerWidth+.5,trail=direction<0?u:1-u;
      positions.setXYZ(i,x,y+Math.sin(trail*6.8-t*2.8)*trail*.85*quiet,Math.sin(trail*8-t*3.1)*trail*.5*quiet);
    }
    positions.needsUpdate=true;this.bannerGeometry.computeBoundingSphere();
    const rope=this.rope.geometry.attributes.position;
    for(let i=0;i<rope.count;i++){
      const u=i/(rope.count-1);
      rope.setXYZ(i,THREE.MathUtils.lerp(tailX,leadX,u),THREE.MathUtils.lerp(tailY,leadY,u)-Math.sin(u*Math.PI)*.3,-.025);
    }
    rope.needsUpdate=true;this.rope.geometry.computeBoundingSphere();
  }
}
window.SkyAdvertiser=SkyAdvertiser;
