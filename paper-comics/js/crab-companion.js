/* Клешня rides the tail. Atlas rectangles preserve the generated PNG and its alpha. */
class CrabCompanion {
  constructor(game) {
    this.game=game;
    this.frames={
      rest:{rect:[38,195,724,312],width:.92,height:.40},
      raised:{rect:[809,2,696,539],width:.92,height:.71},
      victory:{rect:[120,493,577,527]},
      defeat:{rect:[826,608,652,400]}
    };
    this.lines={
      spill:['Эй! Панцирь в пене!','Полегче с виражами!'],
      shark:['Зубы сзади!'],
      escape:['Не догонишь!'],
      dodge:['Все ноги на месте!'],
      trick:['Неплохо, двуногий!']
    };
    this.card=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,alphaTest:.18,depthWrite:false,side:THREE.DoubleSide}));
    this.card.renderOrder=4;this.card.visible=false;game.player.group.add(this.card);
    this.tail=new THREE.Vector3(.30,-1.78,.075);this.anchor=new THREE.Vector3();
    this.boardUp=new THREE.Vector3();this.cameraUp=new THREE.Vector3();this.cameraRight=new THREE.Vector3();
    this.speechPoint=new THREE.Vector3();this.callout=document.getElementById('crab-callout');
    const loader=new THREE.TextureLoader();
    const crabReady=new Promise((resolve,reject)=>loader.load('assets/comics/crab-kleshnya-sheet-v1.png',texture=>{
      texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
      this.image=texture.image;this.textures={};
      for(const name of ['rest','raised']){
        const crop=texture.clone(),[x,y,w,h]=this.frames[name].rect;
        crop.repeat.set(w/this.image.width,h/this.image.height);
        crop.offset.set(x/this.image.width,1-(y+h)/this.image.height);crop.needsUpdate=true;this.textures[name]=crop;
      }
      this.setPose('rest');resolve();
    },undefined,()=>reject(Error('Не удалось загрузить Клешню'))));
    const boardReady=new Promise((resolve,reject)=>loader.load('assets/comics/surfboard-paper-v1.png',texture=>{
      // The deck's silhouette occupies a narrow strip in the portrait source.
      texture.repeat.set(444/1024,1499/1536);texture.offset.set(289/1024,22/1536);
      texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
      const board=game.player.board;
      for(const child of [...board.children]){board.remove(child);child.material?.dispose();}
      board.geometry.dispose();board.material.dispose();
      board.geometry=new THREE.PlaneGeometry(1.52,4.8);
      board.material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.25,depthWrite:false,side:THREE.DoubleSide});
      board.scale.set(1,1,1);board.renderOrder=1;this.boardTexture=texture;resolve();
    },undefined,()=>reject(Error('Не удалось загрузить доску'))));
    this.ready=Promise.all([crabReady,boardReady]);
    this.ready.then(()=>{game.renderDirty=true;}).catch(()=>{});
    this.reset();
  }
  reset(){
    this.pose='';this.raisedUntil=0;this.bubbleUntil=0;this.priority=0;this.lastSpoken=-100;this.lastEvents={};this.lineIndex={};this.heard=new Set();
    this.setPose('rest');document.getElementById('crab-callout')?.classList.remove('visible');
  }
  setPose(name){
    if(!this.textures||this.pose===name)return;
    this.pose=name;this.card.material.map=this.textures[name];this.card.material.needsUpdate=true;
    const frame=this.frames[name];this.card.scale.set(frame.width,frame.height,1);
    this.card.visible=true;
  }
  react(event,force=false){
    const g=this.game,now=g.time,lines=this.lines[event];
    if(g.state!=='playing'||!lines)return false;
    const urgent=event==='shark',priority=urgent?3:event==='spill'?2:1;
    const cooldown=event==='spill'?7:event==='trick'?9:4;
    if(now-(this.lastEvents[event]??-100)<cooldown)return false;
    const gap=event==='escape'?3:8;
    if(!force&&!urgent&&(now<this.bubbleUntil&&priority<this.priority||now-this.lastSpoken<gap&&priority<=this.priority))return false;
    const index=this.lineIndex[event]??0;this.lineIndex[event]=index+1;
    const el=this.callout;if(!el)return false;
    el.querySelector('span').textContent=lines[index%lines.length];el.dataset.event=event;el.classList.add('visible');
    this.lastSpoken=now;this.lastEvents[event]=now;this.priority=priority;this.bubbleUntil=now+(urgent?2.8:2.3);this.heard.add(event);
    if(urgent||event==='trick'||event==='escape')this.raisedUntil=now+1.5;
    this.positionSpeech();
    return true;
  }
  step(){if(this.game.time>=this.bubbleUntil)document.getElementById('crab-callout')?.classList.remove('visible');}
  update(){
    if(!this.textures)return;
    const g=this.game,board=g.player.board;
    this.setPose(g.p.airborne||g.time<this.raisedUntil?'raised':'rest');
    board.updateWorldMatrix(true,false);
    this.anchor.copy(this.tail);board.localToWorld(this.anchor);g.player.group.worldToLocal(this.anchor);
    this.card.position.copy(this.anchor);this.card.position.y+=this.frames[this.pose].height*.46;
    this.card.quaternion.copy(g.camera.quaternion);
    // Project the board's lateral axis into camera space, so claws bank with the deck.
    this.boardUp.set(1,0,0).applyQuaternion(board.quaternion);
    this.cameraUp.set(0,1,0).applyQuaternion(g.camera.quaternion);
    this.cameraRight.set(1,0,0).applyQuaternion(g.camera.quaternion);
    const bank=Math.atan2(this.boardUp.dot(this.cameraUp),Math.abs(this.boardUp.dot(this.cameraRight)));
    this.card.rotateZ(bank);
    this.card.visible=g.player.group.visible;
    this.positionSpeech();
  }
  positionSpeech(){
    const el=this.callout;if(!el?.classList.contains('visible'))return;
    const g=this.game;
    this.card.getWorldPosition(this.speechPoint);this.speechPoint.project(g.camera);
    const point=this.speechPoint,offscreen=!this.card.visible||g.p.fallen||g.comics.active||point.z<-1||point.z>1||Math.abs(point.x)>.96||Math.abs(point.y)>.96;
    el.classList.toggle('offscreen',!!offscreen);if(offscreen)return;
    const width=g.container.clientWidth,height=g.container.clientHeight;
    const x=(point.x+1)*width/2,y=(1-point.y)*height/2;
    const bw=el.offsetWidth,bh=el.offsetHeight,gap=23,margin=9;
    const side=x-bw-gap>=margin?'left':'right';
    const left=THREE.MathUtils.clamp(side==='left'?x-bw-gap:x+gap,margin,width-bw-margin);
    const top=THREE.MathUtils.clamp(y-bh/2,Math.min(140,height*.3),height-(height<520?89:98)-bh);
    el.dataset.side=side;el.style.left=left+'px';el.style.top=top+'px';
    el.style.setProperty('--speech-tail-y',THREE.MathUtils.clamp(y-top,14,bh-14)+'px');
  }
  draw(canvas,name){
    if(!canvas||!this.image)return;
    const [x,y,w,h]=this.frames[name].rect;
    canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(this.image,x,y,w,h,0,0,w,h);
  }
  showResult(success){
    this.draw(document.getElementById('result-crab'),success?'victory':'defeat');
    document.getElementById('result-crab').setAttribute('aria-label',success?'Клешня в солнечных очках сидит на бокале':'Расстроенный Клешня выжимает мокрую клешню');
    document.getElementById('result-crab-line').textContent=success?'«Мы легенды!»':'«В следующий раз рулю я!»';
    document.getElementById('result-screen').dataset.outcome=success?'victory':'defeat';
    document.getElementById('crab-callout')?.classList.remove('visible');
  }
}
window.CrabCompanion=CrabCompanion;
