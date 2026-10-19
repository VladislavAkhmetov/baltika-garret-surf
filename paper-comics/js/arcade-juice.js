/* Hit-stop, camera trauma, FOV kick, carve roll, speed lines and sound words placed in the world. */
class ArcadeJuice {
  constructor(game){
    this.game=game;this.layer=document.getElementById('sfx-layer');this.lines=document.getElementById('speed-lines');
    this.words=Array.from({length:6},()=>{const el=document.createElement('span');el.className='sfx-word';el.setAttribute('aria-hidden','true');this.layer.append(el);return {el,life:0,x:0,y:0,z:0,born:0};});
    this.offset=new THREE.Vector3();this.point=new THREE.Vector3();
    try{this.liveCamera=localStorage.getItem('garret_comics_camera')!=='calm';}catch(_){this.liveCamera=true;}
    this.reset();
  }
  get calm(){return this.game.reducedMotion||!this.liveCamera;}
  setLiveCamera(live){
    this.liveCamera=live;try{localStorage.setItem('garret_comics_camera',live?'live':'calm');}catch(_){}
    if(!live){this.roll=this.trauma=0;}
  }
  get baseFov(){return this.game?.baseFov||58;}
  reset(){
    this.stop=this.trauma=this.kick=this.roll=this.lineFrame=0;this.fov=this.baseFov;this.offset.set(0,0,0);
    this.words.forEach(w=>{w.life=0;w.el.classList.remove('visible');});
    this.lines?.style.setProperty('--lines','0');
  }
  hitstop(seconds){if(this.game.state==='playing'&&!this.game.flowTest)this.stop=Math.max(this.stop,this.game.reducedMotion?seconds*.5:seconds);}
  consumeStop(realDt){if(this.stop<=0)return false;this.stop-=realDt;return true;}
  shake(amount){if(!this.calm)this.trauma=Math.min(1,this.trauma+amount);}
  punch(amount){this.kick=Math.min(6,this.kick+amount);}
  buzz(pattern){if(navigator.vibrate&&!this.game.reducedMotion){try{navigator.vibrate(pattern);}catch(_){}}}
  pop(text,x,y,z,kind=''){
    const word=this.words.find(w=>w.life<=0)||this.words.reduce((a,b)=>a.born<b.born?a:b);
    Object.assign(word,{life:.9,x,y,z,born:performance.now()});
    word.el.textContent=text;word.el.className='sfx-word '+kind;
    word.el.style.setProperty('--tilt',((Math.random()-.5)*22).toFixed(1)+'deg');
    void word.el.offsetWidth;word.el.classList.add('visible');
  }
  // Runs after lookAt: roll and FOV are part of the camera pose for this frame only.
  updateCamera(dt,camera){
    const p=this.game.p,base=this.baseFov;
    this.kick*=Math.exp(-dt*2.4);
    if(this.calm){this.roll=0;this.fov=base;}
    else{
      const target=Math.min(base+12,base+THREE.MathUtils.clamp((p.speed-25)*.6,0,6)+this.kick);
      this.fov+=(target-this.fov)*(1-Math.exp(-dt*6));
      const roll=THREE.MathUtils.clamp(-p.smoothLean*.024,-.024,.024);
      if(p.airborne||p.fallen)this.roll=0;
      else this.roll+=(roll-this.roll)*(1-Math.exp(-dt*4));
      if(Math.abs(this.roll)>1e-5){camera.rotateZ(this.roll);camera.updateMatrixWorld();}
    }
    if(camera.fov!==this.fov){camera.fov=this.fov;camera.updateProjectionMatrix();}
  }
  beforeRender(camera,realDt){
    this.trauma=Math.max(0,this.trauma-realDt*1.6);
    if(this.calm||this.trauma<=0)return;
    const t=performance.now()*.001,amount=this.trauma*this.trauma*.42;
    this.offset.set(Math.sin(t*61.3)*amount,Math.sin(t*47.1+1.7)*amount*.8,0);
    camera.position.add(this.offset);camera.updateMatrixWorld();
  }
  afterRender(camera){if(this.offset.lengthSq()>0){camera.position.sub(this.offset);camera.updateMatrixWorld();this.offset.set(0,0,0);}}
  update(realDt){
    const g=this.game,width=g.viewWidth||390,height=g.viewHeight||844;
    for(const w of this.words){
      if(w.life<=0)continue;
      w.life-=realDt;
      this.point.set(-w.x,w.y,w.z).project(g.camera);
      const visible=w.life>0&&this.point.z<1;
      if(!visible){w.el.classList.remove('visible');w.life=Math.min(w.life,0);continue;}
      w.el.style.left=((this.point.x+1)/2*width).toFixed(1)+'px';w.el.style.top=((1-this.point.y)/2*height).toFixed(1)+'px';
    }
    const frame=Math.floor(g.time*12);
    if(frame!==this.lineFrame&&this.lines){
      this.lineFrame=frame;
      const speed=THREE.MathUtils.clamp((g.p.speed-29)/6,0,1)*.5,kick=this.kick/6*.55,pocket=g.chase.level===2?.18:0;
      const amount=this.calm||g.state!=='playing'?0:Math.min(.85,speed+kick+pocket);
      this.lines.style.setProperty('--lines',amount.toFixed(3));this.lines.style.setProperty('--lines-turn',(frame%3)*4+'deg');
    }
  }
}
window.ArcadeJuice=ArcadeJuice;
