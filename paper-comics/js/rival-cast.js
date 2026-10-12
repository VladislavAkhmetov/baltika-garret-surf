/* Four photographic paper characters; two shared rigs keep the sea uncrowded. */
class RivalCast {
  constructor(game){
    this.game=game;this.run=0;
    this.viewFrustum=new THREE.Frustum();this.viewMatrix=new THREE.Matrix4();this.viewProjection=new THREE.Matrix4();
    this.viewBounds=new THREE.Box3();this.shadowBounds=new THREE.Box3();this.viewShift=new THREE.Vector3();this.viewPoint=new THREE.Vector3();
    this.profiles=[
      {id:'grandma',file:'rival-grandma-v2.png',name:'ЛОЛА',kind:'calm',color:0xe6ddff,height:3.2,line:'КОКТЕЙЛЬ НЕ РАСПЛЕСКАЙ!',soles:[[438,1227],[829,1426]]},
      {id:'dj',file:'rival-dj-v2.png',name:'ДИЕГО',kind:'showoff',color:0xffe5ce,height:3.5,line:'ЛОВИ РИТМ!',soles:[[331,1187],[790,1396]]},
      {id:'blonde',name:'АЛИСА',kind:'showoff',color:0xfff3ce,height:3.25,line:'ЛОВИ ВОЛНУ!',soles:[[400,1318],[770,1427]]},
      {id:'couple',file:'rival-couple-tandem-v4.png',name:'МИША И НИКА',kind:'wobbly',color:0xd7f3ee,height:3.2,line:'МЫ НА ОДНОЙ ВОЛНЕ!',couple:true,
        parts:[{half:0,height:3.2,soles:[[242,825],[620,857]],deckX:-.17,deckY:-1},{half:1,height:3.55,soles:[[1275,824],[1544,858]],deckX:.17,deckY:1}]}
    ];
    const loader=new THREE.TextureLoader();
    this.ready=Promise.all(this.profiles.map(profile=>new Promise((resolve,reject)=>{
      loader.load('assets/comics/'+(profile.file||'rival-'+profile.id+'.png'),texture=>{
        texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
        const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;
        // Both atlas columns and transparent margins are cropped only through UVs.
        const cutouts=profile.parts||[profile];
        for(const cutout of cutouts){
          const from=cutout.half===undefined?0:Math.floor(cutout.half*image.width/2),to=cutout.half===undefined?image.width:Math.floor((cutout.half+1)*image.width/2);
          let left=to,right=from,top=image.height,bottom=0;
          for(let y=0;y<image.height;y++)for(let x=from;x<to;x++)if(pixels[(y*image.width+x)*4+3]>40){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
          if(left>right){reject(Error('Пустой силуэт '+profile.id));return;}
          const width=right-left+1,height=bottom-top+1,crop=profile.parts?texture.clone():texture;
          crop.repeat.set(width/image.width,height/image.height);crop.offset.set(left/image.width,1-(bottom+1)/image.height);crop.needsUpdate=true;
          cutout.texture=crop;cutout.width=cutout.height*width/height;
          const sx=cutout.soles.reduce((n,s)=>n+s[0],0)/2,sy=cutout.soles.reduce((n,s)=>n+s[1],0)/2;
          cutout.foot=new THREE.Vector3(((sx-left)/width-.5)*cutout.width,(.5-(sy-top)/height)*cutout.height,0);
          cutout.contacts=cutout.soles.map(([x,y])=>new THREE.Vector3(((x-left)/width-.5)*cutout.width,(.5-(y-top)/height)*cutout.height,0).sub(cutout.foot));
        }
        if(profile.parts)Object.assign(profile,{texture:cutouts[0].texture,width:cutouts[0].width,foot:cutouts[0].foot,contacts:cutouts[0].contacts});
        resolve();
      },undefined,()=>reject(Error('Не удалось загрузить соперника '+profile.id)));
    })));
    this.ready.catch(()=>{});
  }
  reset(){
    const start=((Math.max(1,this.run)-1)%2)*2;
    this.game.rivals.forEach((r,i)=>{
      this.apply(r,this.profiles[start+i]);
      Object.assign(r,{x:i===0?-3.5:4,z:i===0?46:84,speed:26,lean:0,airY:0,freeEntry:false,passed:false,chat:false,contactLocked:false,collided:false,yieldTime:0,yieldSide:0,nearest:Infinity});
    });
  }
  inView(r,margin=.15){
    const g=this.game,camera=g.camera,box=this.viewBounds;
    camera.updateMatrixWorld(true);
    // Widen the actual camera frustum to cover roll, shake and the next frame.
    this.viewProjection.copy(camera.projectionMatrix);
    this.viewProjection.elements[0]/=1+margin;this.viewProjection.elements[5]/=1+margin;
    this.viewMatrix.multiplyMatrices(this.viewProjection,camera.matrixWorldInverse);
    this.viewFrustum.setFromProjectionMatrix(this.viewMatrix);
    r.rig.group.updateMatrixWorld(true);r.rig.shadow.updateMatrixWorld(true);
    box.setFromObject(r.rig.group);
    // Physics can advance several times between rendered poses.
    this.viewShift.set(-r.x-r.rig.group.position.x,g.wave.height(r.x,r.z)+r.airY-r.rig.group.position.y,r.z-r.rig.group.position.z);
    box.translate(this.viewShift);
    this.viewShift.set(-r.x-r.rig.shadow.position.x,g.wave.height(r.x,r.z)+.04-r.rig.shadow.position.y,r.z-.15-r.rig.shadow.position.z);
    box.union(this.shadowBounds.setFromObject(r.rig.shadow).translate(this.viewShift));
    for(let i=0;i<r.wake.length;i++){
      const z=r.z-1-i*.65,x=r.x+Math.sin(i*2+g.time*4)*.2,radius=.4+i*.05,y=g.wave.height(x,z)+.06;
      box.expandByPoint(this.viewPoint.set(-x-radius,y-radius,z-radius));
      box.expandByPoint(this.viewPoint.set(-x+radius,y+radius,z+radius));
    }
    return this.viewFrustum.intersectsBox(box.expandByScalar(.5));
  }
  enterBehind(r){
    const g=this.game;
    r.z=Math.min(g.p.z-24,g.camera.position.z-12);
    // Fit the entire current cast, tandem deck, shadow and wake outside the view.
    for(let attempt=0;attempt<16;attempt++){
      g.updateSurfer(r.rig,r.x,r.z,g.wave.height(r.x,r.z),0,0,0,Math.floor(g.time*12));
      if(!this.inView(r))return true;
      r.z-=8;
    }
    return false;
  }
  apply(r,profile){
    Object.assign(r,{id:profile.id,name:profile.name,kind:profile.kind,line:profile.line,couple:!!profile.couple});
    const rig=r.rig;rig.castProfile=profile;rig.board.material.color.setHex(profile.color);
    rig.board.scale.set(profile.couple?1.5:1.2,profile.couple?1.75:1.12,1);
    // The deck belongs to the same paper layer as its riders: a curved wave
    // must not slice the long tandem board underneath their visible feet.
    rig.board.material.depthTest=false;rig.board.material.depthWrite=false;rig.board.renderOrder=1;
    rig.shadow.scale.set(profile.couple?1.1:1,profile.couple?2.4:1.5,1);
    if(!profile.texture)return;
    if(profile.couple&&!rig.partner){
      rig.partner=new THREE.Mesh(new THREE.PlaneGeometry(1,1),rig.card.material.clone());rig.group.add(rig.partner);
    }
    if(rig.partner)rig.partner.visible=!!profile.couple;
    rig.castRiders=(profile.parts||[profile]).map((cutout,i)=>{
      const card=i===0?rig.card:rig.partner;
      card.geometry.dispose();card.geometry=new THREE.PlaneGeometry(cutout.width,cutout.height);
      card.material.map=cutout.texture;card.material.depthWrite=false;card.material.depthTest=false;card.material.needsUpdate=true;card.renderOrder=3;
      // A photograph's feet lie in its camera plane. Sorted paper layers keep
      // water from cutting them off; their screen contacts are fitted to the 3D deck.
      return {card,cutout,deckPoint:new THREE.Vector3(cutout.deckX||0,cutout.deckY||0,0)};
    });
    rig.footAnchor=profile.foot.clone();
  }
  place(rig){
    if(!rig.footAnchor)return;
    const camera=this.game.camera,board=rig.board,base=board.quaternion.clone(),center=board.position.clone().add(rig.group.position);
    const normal=new THREE.Vector3(0,0,1).applyQuaternion(base),width=.76*board.scale.x*.92,length=2.4*board.scale.y*.90;
    let best=Infinity,rotation=base;
    for(let i=-8;i<=8;i++){
      const yaw=i*.06,q=base.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),yaw));
      const xAxis=new THREE.Vector3(1,0,0).applyQuaternion(q),yAxis=new THREE.Vector3(0,1,0).applyQuaternion(q);
      let score=yaw*yaw*.35;
      for(const rider of rig.castRiders){
        const anchor=rider.deckPoint.clone().multiply(board.scale).applyQuaternion(q).add(center);
        for(const contact of rider.cutout.contacts){
          const point=contact.clone().applyQuaternion(rig.card.quaternion).add(anchor),ray=point.clone().sub(camera.position).normalize(),denom=ray.dot(normal);
          if(Math.abs(denom)<.025){score+=1e6;continue;}
          point.addScaledVector(ray,center.clone().sub(point).dot(normal)/denom).sub(center);
          const x=point.dot(xAxis),y=point.dot(yAxis),taper=1-Math.min(.55,(Math.abs(y)/length)**2*.55);
          score+=Math.max(0,Math.abs(x)/(width*taper)-1)**2*120+Math.max(0,Math.abs(y)/length-1)**2*120;
        }
      }
      if(score<best){best=score;rotation=q;}
    }
    board.quaternion.copy(rotation);
    for(const {card,cutout,deckPoint} of rig.castRiders){
      card.quaternion.copy(rig.card.quaternion);card.scale.set(1,1,1);
      card.position.copy(deckPoint).multiply(board.scale).applyQuaternion(board.quaternion).add(board.position).sub(cutout.foot.clone().applyQuaternion(card.quaternion));
    }
  }
  music(dt){
    const g=this.game,r=g.rivals.find(r=>r.id==='dj');
    const distance=r?Math.hypot(r.x-g.p.x,r.z-g.p.z):999;
    g.audio.updateRivalMusic(dt,distance,r?(r.x-g.p.x)/8:0);
  }
}
window.RivalCast=RivalCast;
