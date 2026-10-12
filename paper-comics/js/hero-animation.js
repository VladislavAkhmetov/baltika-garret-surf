/* Photographic key poses share measured grip and deck contacts. */
class HeroAnimator {
  constructor(game){
    this.game=game;this.height=3.6;this.width=this.height*1133/1388;this.state='trim';this.frame=0;this.clock=0;this.turnStage=0;this.turnDirection=0;this.releasing=false;
    this.atlases={};this.actionAtlases={};this.framesSeen=new Set();this.sourcesSeen=new Set();
    this.metadata={};this.soles={};
    // The approved v6 silhouette keeps its natural extended arm and front ankle.
    // Grip and sole contacts use the same 384×512 cell space
    // used by the deck fit, finger overlay and animated grip attachment.
    this.sourceGrip=[916/1133*384,210/1388*512];
    this.sourceSoles=[[540/1133*384,1129/1388*512],[840/1133*384,1318/1388*512]];
    this.poseDefinitions={
      base:{src:'assets/comics/hero-rear-grip-v6.png',grip:[916,210],feet:[[540,1129],[840,1318]]},
      left:{src:'assets/comics/hero-v7/carve-left.png',grip:[948,205],feet:[[610,1082],[955,1296]]},
      right:{src:'assets/comics/hero-v7/carve-right.png',grip:[936,197],feet:[[585,1132],[870,1328]]},
      compress:{src:'assets/comics/hero-v7/compress.png',grip:[945,320],feet:[[585,1122],[940,1298]]},
      air:{src:'assets/comics/hero-v7/air.png',grip:[945,223],feet:[[610,1139],[925,1366]]},
      trick:{src:'assets/comics/hero-v7/trick.png',grip:[983,266],feet:[[440,1088],[840,1297]],scale:.82},
      landing:{src:'assets/comics/hero-v7/landing.png',grip:[958,268],feet:[[540,1178],[950,1314]]}
    };
    this.footAnchor=new THREE.Vector3();this.stance=new THREE.Vector3();this.deckAnchor=new THREE.Vector3();
    this.cameraRight=new THREE.Vector3();this.cameraUp=new THREE.Vector3();this.deckX=new THREE.Vector3();this.deckY=new THREE.Vector3();
    this.deckTurn=new THREE.Quaternion();this.deckBase=new THREE.Quaternion();this.deckBest=new THREE.Quaternion();
    this.ready=Promise.all(Object.entries(this.poseDefinitions).map(([key,definition])=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve([key,image]);
      image.onerror=()=>reject(new Error('Не удалось загрузить позу персонажа: '+key));image.src=definition.src;
    }))).then(entries=>this.buildAtlases(Object.fromEntries(entries)));
    const card=game.player.card;
    card.geometry.dispose();card.geometry=new THREE.PlaneGeometry(this.width,this.height);
    card.material.depthWrite=false;card.renderOrder=3;
    const geometry=new THREE.PlaneGeometry(this.width*.09,this.height*.075);
    this.fingers=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({transparent:true,alphaTest:.25,depthWrite:false,side:THREE.DoubleSide}));
    this.fingers.position.z=.085;this.fingers.renderOrder=6;this.fingers.visible=false;card.add(this.fingers);
    this.fingerTextures={};
    this.ready.then(()=>{for(const [key,t] of Object.entries(this.atlases)){this.fingerTextures[key]=t.clone();this.fingerTextures[key].needsUpdate=true;}this.apply('trim',0);}).catch(error=>{this.error=error;});
  }
  cleanCutout(image){
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data,n=canvas.width*canvas.height;
    const labels=new Int32Array(n),queue=new Int32Array(n);let label=0,best=0,largest=0;
    // Keep the connected person, removing detached generation debris. Cleaning
    // alpha once at load time leaves skin, flower print and paper grain intact.
    for(let seed=0;seed<n;seed++){
      if(labels[seed]||data[seed*4+3]<32)continue;
      let head=0,tail=1;queue[0]=seed;labels[seed]=++label;
      while(head<tail){
        const p=queue[head++],x=p%canvas.width;
        const visit=q=>{if(q>=0&&q<n&&!labels[q]&&data[q*4+3]>=32){labels[q]=label;queue[tail++]=q;}};
        if(x)visit(p-1);if(x<canvas.width-1)visit(p+1);visit(p-canvas.width);visit(p+canvas.width);
      }
      if(tail>largest){largest=tail;best=label;}
    }
    for(let i=0;i<n;i++)if(labels[i]!==best)data[i*4+3]=0;
    ctx.putImageData(pixels,0,0);return canvas;
  }
  pose(state,frame){
    if(state==='air')return {lean:Math.sin(frame*.8)*.09,crouch:.03+frame*.005};
    if(state==='trick')return {lean:Math.sin(frame*.8)*.08,crouch:.04+Math.sin(frame*.45)*.025};
    if(state==='landing')return {lean:(frame-3.5)*.012,crouch:Math.max(0,.16-frame*.023)};
    if(state==='trim')return [
      {lean:0,crouch:0},{lean:-.10,crouch:.23},{lean:-.16,crouch:.55},{lean:-.04,crouch:.08},
      {lean:.13,crouch:.07},{lean:.24,crouch:.15},{lean:.04,crouch:.04},{lean:-.03,crouch:.09}
    ][frame];
    if(state==='recovery')return {lean:Math.sin(frame*Math.PI/4+.35)*.62,crouch:.20+Math.cos(frame*Math.PI/4)*.10};
    const amount=[.04,.20,.38,.53,.66,.44,.18,.02][frame];
    return {lean:amount*(state==='left'?-1:1),crouch:amount*.46};
  }
  deform(x,y,pose,source){
    const feet=source?.feet||this.sourceSoles,footLockY=Math.min(...feet.map(p=>p[1]))-40;
    const hipX=(feet[0][0]+feet[1][0])/2,hipY=footLockY-108;
    const weight=THREE.MathUtils.clamp((footLockY-y)/120,0,1),a=pose.lean*.16;
    const dx=x-hipX,dy=y-hipY,c=Math.cos(a),s=Math.sin(a);
    let px=x+(dx*c-dy*s-dx+pose.lean*8)*weight;
    const py=y+(dx*s+dy*c-dy+pose.crouch*54)*weight;
    if(y>hipY&&y<footLockY){
      const bend=Math.sin((y-hipY)/(footLockY-hipY)*Math.PI);
      px+=(x<hipX?-1:1)*pose.crouch*12*bend;
    }
    return [px,py];
  }
  drawTriangle(ctx,image,source,target){
    const [a,b,c]=source,[p,q,r]=target;
    const det=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
    const ax=((q[0]-p[0])*(c[1]-a[1])-(r[0]-p[0])*(b[1]-a[1]))/det;
    const bx=((r[0]-p[0])*(b[0]-a[0])-(q[0]-p[0])*(c[0]-a[0]))/det;
    const ay=((q[1]-p[1])*(c[1]-a[1])-(r[1]-p[1])*(b[1]-a[1]))/det;
    const by=((r[1]-p[1])*(b[0]-a[0])-(q[1]-p[1])*(c[0]-a[0]))/det;
    ctx.save();ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.lineTo(...r);ctx.closePath();ctx.clip();
    ctx.transform(ax,ay,bx,by,p[0]-ax*a[0]-bx*a[1],p[1]-ay*a[0]-by*a[1]);
    ctx.drawImage(image,0,0,384,512);ctx.restore();
  }
  frameSource(state,frame){
    if(state==='trim')return ['base','compress','compress','base','base','base','base','base'][frame];
    if(state==='left'||state==='right')return frame>=2&&frame<=5?state:'base';
    if(state==='recovery')return frame>=1&&frame<=6?'air':'base';
    if(state==='landing')return frame<3?'landing':frame<6?'compress':'base';
    return state;
  }
  buildAtlases(images){
    this.poseSources={};
    for(const [key,image] of Object.entries(images)){
      const definition=this.poseDefinitions[key],clean=this.cleanCutout(image),canvas=document.createElement('canvas');
      canvas.width=384;canvas.height=512;
      // Uniform source-pixel scaling preserves anatomy even when ImageGen returns
      // a different aspect ratio. The compact tuck is registered to the same head size.
      const scale=Math.min(1133/image.width,1388/image.height)*(definition.scale||1);
      const ox=(1133-image.width*scale)/2,oy=(1388-image.height*scale)/2;
      const point=([x,y])=>[(x*scale+ox)/1133*384,(y*scale+oy)/1388*512];
      canvas.getContext('2d').drawImage(clean,ox/1133*384,oy/1388*512,image.width*scale/1133*384,image.height*scale/1388*512);
      this.poseSources[key]={canvas,grip:point(definition.grip),feet:definition.feet.map(point)};
    }
    for(const state of ['trim','left','right','recovery','air','trick','landing']){
      const sheet=document.createElement('canvas');sheet.width=1536;sheet.height=1024;const ctx=sheet.getContext('2d');
      const meta=this.metadata[state]={grips:[],angles:[],feet:[],keys:[]};this.soles[state]=[];
      for(let frame=0;frame<8;frame++){
        const key=this.frameSource(state,frame),source=this.poseSources[key],raw=this.pose(state,frame);
        // Dedicated photographs supply the joint motion; only a small follow-through
        // is added between exposures, with both feet excluded from the deformation.
        const amount=key==='base'?1:.16,pose={lean:raw.lean*amount,crouch:raw.crouch*amount};
        const grip=this.deform(...source.grip,pose,source),feet=source.feet.map(p=>this.deform(...p,pose,source));
        meta.keys.push(key);meta.grips.push(grip);meta.angles.push(-pose.lean*.16);meta.feet.push([(feet[0][0]+feet[1][0])/2,(feet[0][1]+feet[1][1])/2]);this.soles[state].push(feet);
        ctx.save();ctx.translate(frame%4*384,Math.floor(frame/4)*512);ctx.beginPath();ctx.rect(0,0,384,512);ctx.clip();
        if(!pose.lean&&!pose.crouch)ctx.drawImage(source.canvas,0,0);
        else for(let y=0;y<512;y+=16)for(let x=0;x<384;x+=16){
          const a=[x,y],b=[x+16,y],c=[x,y+16],d=[x+16,y+16];
          const points=[a,b,c,d].map(p=>this.deform(...p,pose,source));
          this.drawTriangle(ctx,source.canvas,[a,b,c],[points[0],points[1],points[2]]);
          this.drawTriangle(ctx,source.canvas,[b,d,c],[points[1],points[3],points[2]]);
        }
        ctx.restore();
      }
      const texture=new THREE.CanvasTexture(sheet);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
      texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.repeat.set(.25,.5);
      (['air','trick','landing'].includes(state)?this.actionAtlases:this.atlases)[state]=texture;
    }
  }
  reset(){this.state='trim';this.frame=0;this.clock=0;this.beginTurn(0);this.previousWeight=0;this.weightRelease=0;this.framesSeen.clear();this.sourcesSeen.clear();if(this.atlases.trim)this.apply('trim',0);}
  beginTurn(direction){this.turnDirection=direction;this.turnStage=0;this.turnClock=0;this.releasing=false;this.releaseMode=null;}
  apply(state,frame){
    const texture=this.atlases[state]||this.actionAtlases[state];if(!texture)return;
    this.state=state;this.frame=frame;this.framesSeen.add(state+':'+frame);
    texture.offset.set(frame%4/4,(1-Math.floor(frame/4))*.5);
    const meta=this.metadata[state],grip=meta.grips[frame],feet=this.soles[state][frame],foot=[(feet[0][0]+feet[1][0])/2,(feet[0][1]+feet[1][1])/2],card=this.game.player.card;
    this.currentSource=meta.keys[frame];this.sourcesSeen.add(this.currentSource);
    card.material.map=texture;this.game.player.pose=state;
    this.footAnchor.set((foot[0]/384-.5)*this.width,(.5-foot[1]/512)*this.height,0);
    this.stance.set((feet[1][0]-feet[0][0])/384*this.width,(feet[0][1]-feet[1][1])/512*this.height,0);
    card.scale.set(1,1,1);
    this.placeOnBoard();
    this.currentGrip={x:(grip[0]/384-.5)*this.width,y:(.5-grip[1]/512)*this.height,angle:meta.angles[frame]};
    const fingers=this.fingerTextures[state];
    if(fingers){
      fingers.repeat.set(.09/4,.075/2);
      fingers.offset.set((frame%4+grip[0]/384-.045)/4,(1-Math.floor(frame/4))*.5+(1-grip[1]/512-.0375)/2);
      if(!this.fingers.material.map)this.fingers.material.needsUpdate=true;
      this.fingers.material.map=fingers;this.fingers.position.set(this.currentGrip.x,this.currentGrip.y,.085);
    }
  }
  fitDeck(surfaceRotation,heading){
    const board=this.game.player.board,card=this.game.player.card;
    this.deckBase.copy(surfaceRotation).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
    this.cameraRight.set(1,0,0).applyQuaternion(this.game.camera.quaternion);this.cameraUp.set(0,1,0).applyQuaternion(this.game.camera.quaternion);
    const stance=this.stance.clone().multiplyScalar(.5).applyQuaternion(card.quaternion),sx=stance.dot(this.cameraRight),sy=stance.dot(this.cameraUp);
    const width=(board.geometry.parameters.width||1.52)*board.scale.x*.40,length=(board.geometry.parameters.height||4.8)*board.scale.y*.32;
    let best=Infinity;
    // The paper figure is a billboard. Fit its photographed stance to the projected
    // deck rather than yawing the board independently underneath fixed feet.
    for(let i=-6;i<=6;i++){
      const yaw=i*.22;
      this.deckTurn.copy(this.deckBase).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI+heading+yaw));
      this.deckX.set(1,0,0).applyQuaternion(this.deckTurn);this.deckY.set(0,1,0).applyQuaternion(this.deckTurn);
      const a=this.deckX.dot(this.cameraRight),b=this.deckY.dot(this.cameraRight),c=this.deckX.dot(this.cameraUp),d=this.deckY.dot(this.cameraUp),det=a*d-b*c;
      if(Math.abs(det)<.025)continue;
      const x=(sx*d-b*sy)/det,y=(a*sy-sx*c)/det;
      const taper=1-Math.min(.5,(Math.abs(y)/length)**2*.3);
      const score=Math.max(0,Math.abs(x)/(width*taper)-1)**2*25+Math.max(0,Math.abs(y)/length-1)**2*25+yaw*yaw;
      if(score<best){best=score;this.deckBest.copy(this.deckTurn);}
    }
    if(best<Infinity)board.quaternion.copy(this.deckBest);
    this.placeOnBoard();
  }
  placeOnBoard(){
    const board=this.game.player.board,card=this.game.player.card;
    board.updateMatrix();this.deckAnchor.set(0,0,.018).applyMatrix4(board.matrix);
    card.position.copy(this.deckAnchor).sub(this.footAnchor.clone().multiply(card.scale).applyQuaternion(card.quaternion));
  }
  update(dt){
    const p=this.game.p;this.clock+=dt;
    if(p.airborne){
      this.beginTurn(0);const jump=this.game.jump;
      if(jump.spinStarted&&!jump.spinCompleted)this.apply('trick',Math.min(7,Math.floor(jump.spinProgress*8)));
      else this.apply('air',Math.min(7,Math.floor(jump.airTime*14)));
      return;
    }
    if(this.game.jump.landingPulse>.15){this.beginTurn(0);this.apply('landing',Math.min(7,Math.floor(this.game.jump.landingAge/.04)));return;}
    if(p.recovering>0||p.fallen){this.beginTurn(0);this.apply('recovery',Math.floor(this.clock*10)%8);return;}
    if(this.game.jump.holding&&this.game.jump.charge>.1){this.beginTurn(0);this.apply('trim',this.game.jump.charge>.6?2:1);return;}
    const direction=Math.abs(p.lean)>.18?Math.sign(p.lean):0;
    if(!this.turnDirection&&direction)this.beginTurn(direction);
    if(this.turnDirection){
      this.turnClock+=dt;
      if(direction!==this.turnDirection&&!this.releasing){this.releasing=true;this.releaseMode=this.turnStage<4?'unwind':'exit';}
      // Finish the old arc before entering the opposite arc. Hold each exit
      // photograph for a full beat, including the final upright frame.
      while(this.turnClock>=1/14&&this.turnDirection){
        this.turnClock-=1/14;
        if(!this.releasing)this.turnStage=Math.min(4,this.turnStage+1);
        else if(this.releaseMode==='unwind'){
          if(this.turnStage>0)this.turnStage--;else this.beginTurn(direction);
        }else if(this.turnStage<7)this.turnStage++;else this.beginTurn(direction);
      }
      if(this.turnDirection){this.apply(this.turnDirection<0?'left':'right',this.turnStage);return;}
    }
    {
      const pitch=p.pitch||0;
      const weight=pitch>.18?1:pitch<-.18?-1:0;
      if(weight===0&&this.previousWeight!==0){this.weightRelease=.16;this.releaseFrame=this.previousWeight>0?3:6;}
      this.previousWeight=weight;this.weightRelease=Math.max(0,(this.weightRelease||0)-dt);
      let frame=weight>0?(pitch>.55?2:1):weight<0?(pitch<-.55?5:4):this.weightRelease>0?this.releaseFrame:this.game.waveRide.zone==='crest'?(Math.floor(this.clock*6)%2?7:6):p.crouch>.6?2:0;
      this.apply('trim',frame);
    }
  }
}
window.HeroAnimator=HeroAnimator;
