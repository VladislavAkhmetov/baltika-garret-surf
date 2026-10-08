/* Four photographic paper characters; two shared rigs keep the sea uncrowded. */
class RivalCast {
  constructor(game){
    this.game=game;this.run=0;
    this.profiles=[
      {id:'grandma',name:'ЛОЛА',kind:'calm',color:0x268f83,height:3.45,line:'КОКТЕЙЛЬ НЕ РАСПЛЕСКАЙ!',soles:[[420,1243],[790,1402]]},
      {id:'dj',name:'ДИЕГО',kind:'showoff',color:0xe9714e,height:3.25,line:'ЛОВИ РИТМ!',soles:[[298,1263],[750,1404]]},
      {id:'blonde',name:'АЛИСА',kind:'showoff',color:0xf3c754,height:3.25,line:'ЛОВИ ВОЛНУ!',soles:[[400,1318],[770,1427]]},
      {id:'couple',name:'МИША И НИКА',kind:'wobbly',color:0x338b8b,height:3.25,line:'МЫ НА ОДНОЙ ВОЛНЕ!',couple:true,soles:[[262,914],[690,940],[890,925],[1220,944]]}
    ];
    const loader=new THREE.TextureLoader();
    this.ready=Promise.all(this.profiles.map(profile=>new Promise((resolve,reject)=>{
      loader.load('assets/comics/rival-'+profile.id+'.png',texture=>{
        texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
        // Crop transparent padding in UV space; preserve the generated source PNG.
        const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;
        let left=image.width,right=0,top=image.height,bottom=0;
        for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(pixels[(y*image.width+x)*4+3]>40){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        if(left>right){reject(Error('Пустой силуэт '+profile.id));return;}
        const width=right-left+1,height=bottom-top+1;
        texture.repeat.set(width/image.width,height/image.height);texture.offset.set(left/image.width,1-(bottom+1)/image.height);
        profile.texture=texture;profile.width=profile.height*width/height;
        const soles=profile.soles||[[left+width*.36,bottom-height*.045],[left+width*.66,bottom-height*.012]];
        const sx=soles.reduce((n,s)=>n+s[0],0)/soles.length,sy=soles.reduce((n,s)=>n+s[1],0)/soles.length;
        profile.foot=new THREE.Vector3(((sx-left)/width-.5)*profile.width,(.5-(sy-top)/height)*profile.height,0);
        profile.contacts=soles.map(([x,y])=>new THREE.Vector3(((x-left)/width-.5)*profile.width,(.5-(y-top)/height)*profile.height,0).sub(profile.foot));
        const a=soles[0],b=soles[soles.length-1];
        profile.stance=new THREE.Vector3((b[0]-a[0])/width*profile.width,(a[1]-b[1])/height*profile.height,0);resolve();
      },undefined,()=>reject(Error('Не удалось загрузить соперника '+profile.id)));
    })));
    this.ready.catch(()=>{});
  }
  reset(){
    const start=((Math.max(1,this.run)-1)%2)*2;
    this.game.rivals.forEach((r,i)=>{
      this.apply(r,this.profiles[start+i]);
      Object.assign(r,{x:i===0?-3.5:4,z:i===0?46:84,speed:26,lean:0,airY:0,passed:false,chat:false,contactLocked:false,collided:false,yieldTime:0,yieldSide:0,nearest:Infinity});
    });
  }
  apply(r,profile){
    Object.assign(r,{id:profile.id,name:profile.name,kind:profile.kind,line:profile.line,couple:!!profile.couple});
    const rig=r.rig;rig.castProfile=profile;rig.board.material.color.setHex(profile.color);
    rig.board.scale.set(profile.couple?5.2:2.7,profile.couple?1.9:1.25,1);
    // On a steep crest, water would cut through the wide shared paper deck.
    // Keep that collage layer visible under all four photographed feet.
    rig.board.material.depthTest=!profile.couple;rig.board.material.depthWrite=!profile.couple;
    rig.board.renderOrder=profile.couple?2:0;
    for(const rim of rig.board.children){rim.material.depthTest=!profile.couple;rim.material.depthWrite=!profile.couple;rim.renderOrder=rig.board.renderOrder;}
    rig.shadow.scale.set(profile.couple?1.6:1,1.5,1);
    if(!profile.texture)return;
    rig.card.geometry.dispose();rig.card.geometry=new THREE.PlaneGeometry(profile.width,profile.height);
    rig.card.material.map=profile.texture;rig.card.material.depthWrite=false;rig.card.material.needsUpdate=true;rig.card.renderOrder=3;
    rig.footAnchor=profile.foot.clone();
  }
  place(rig){
    if(!rig.footAnchor)return;
    rig.card.scale.set(1,1,1);
    const profile=rig.castProfile,camera=this.game.camera,right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
    const contacts=profile.contacts.map(contact=>{const v=contact.clone().applyQuaternion(rig.card.quaternion);return {sx:v.dot(right),sy:v.dot(up)};});
    const width=.43*rig.board.scale.x*.9,length=1.3*rig.board.scale.y*.9,base=rig.board.quaternion.clone();let best=Infinity,rotation=base;
    for(let i=-7;i<=7;i++){
      const yaw=i*.2,q=base.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),yaw));
      const xAxis=new THREE.Vector3(1,0,0).applyQuaternion(q),yAxis=new THREE.Vector3(0,1,0).applyQuaternion(q);
      const a=xAxis.dot(right),b=yAxis.dot(right),c=xAxis.dot(up),d=yAxis.dot(up),det=a*d-b*c;if(Math.abs(det)<.025)continue;
      let score=yaw*yaw;
      for(const {sx,sy} of contacts){const x=(sx*d-b*sy)/det,y=(a*sy-sx*c)/det,taper=1-Math.min(.55,(Math.abs(y)/length)**2*.55);score+=Math.max(0,Math.abs(x)/(width*taper)-1)**2*60+Math.max(0,Math.abs(y)/length-1)**2*60;}
      if(score<best){best=score;rotation=q;}
    }
    rig.board.quaternion.copy(rotation);
    rig.card.position.copy(rig.board.position).sub(rig.footAnchor.clone().applyQuaternion(rig.card.quaternion));
  }
  music(dt){
    const g=this.game,r=g.rivals.find(r=>r.id==='dj');
    const distance=r?Math.hypot(r.x-g.p.x,r.z-g.p.z):999;
    g.audio.updateRivalMusic(dt,distance,r?(r.x-g.p.x)/8:0);
  }
}
window.RivalCast=RivalCast;
