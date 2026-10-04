/* GARRET — a playable paper-surfing sketch, isolated from the existing slice. */
class PaperInput {
  constructor(container){
    this.container=container;this.mode=matchMedia('(pointer:coarse)').matches?'touch':'keys';
    this.lean=this.pitch=this.target=this.pitchTarget=0;this.keys=new Set();this.pointers=new Map();
    this.gamma=this.beta=null;this.neutral=this.neutralBeta=0;
    window.addEventListener('deviceorientation',e=>{
      if(!Number.isFinite(e.gamma)||!Number.isFinite(e.beta))return;
      const angle=screen.orientation?.angle??window.orientation??0;
      this.gamma=angle===90?-e.beta:angle===270||angle===-90?e.beta:angle===180?-e.gamma:e.gamma;
      this.beta=angle===90?e.gamma:angle===270||angle===-90?-e.gamma:angle===180?-e.beta:e.beta;
      if(this.orientationAngle!==undefined&&this.orientationAngle!==angle&&this.mode==='gyro')this.recenter();
      this.orientationAngle=angle;
    });
    window.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS'].includes(e.code))return;
      e.preventDefault();this.keys.add(e.code);this.mode='keys';
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    container.addEventListener('pointerdown',e=>{
      if(e.target.closest('button,.screen')||this.mode==='gyro')return;
      e.preventDefault();this.mode='touch';this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(e.isTrusted)container.setPointerCapture(e.pointerId);
    });
    container.addEventListener('pointermove',e=>{
      const point=this.pointers.get(e.pointerId);if(!point)return;
      this.target=THREE.MathUtils.clamp((e.clientX-point.x)/90,-1,1);
      this.pitchTarget=THREE.MathUtils.clamp((point.y-e.clientY)/100,-1,1);
    });
    const end=e=>{this.pointers.delete(e.pointerId);if(!this.pointers.size)this.target=this.pitchTarget=0;};
    container.addEventListener('pointerup',end);container.addEventListener('pointercancel',end);
    window.addEventListener('blur',()=>this.reset());
  }
  async calibrate(){
    if(!matchMedia('(pointer:coarse)').matches)return;
    try{
      if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'&&await DeviceOrientationEvent.requestPermission()!=='granted'){this.mode='touch';return;}
      const samples=[];
      for(let i=0;i<8;i++){await new Promise(resolve=>setTimeout(resolve,60));if(this.gamma!==null&&this.beta!==null)samples.push([this.gamma,this.beta]);}
      if(samples.length){this.neutral=samples.reduce((sum,v)=>sum+v[0],0)/samples.length;this.neutralBeta=samples.reduce((sum,v)=>sum+v[1],0)/samples.length;this.mode='gyro';}
      else this.mode='touch';
    }catch(_){this.mode='touch';}
  }
  reset(){this.keys.clear();this.pointers.clear();this.target=this.pitchTarget=this.lean=this.pitch=0;}
  recenter(){if(this.gamma!==null&&this.beta!==null){this.neutral=this.gamma;this.neutralBeta=this.beta;this.lean=this.pitch=0;}}
  update(dt){
    let lean=this.target,pitch=this.pitchTarget;
    if(this.mode==='keys'){
      lean=Number(this.keys.has('ArrowRight')||this.keys.has('KeyD'))-Number(this.keys.has('ArrowLeft')||this.keys.has('KeyA'));
      pitch=Number(this.keys.has('ArrowUp')||this.keys.has('KeyW'))-Number(this.keys.has('ArrowDown')||this.keys.has('KeyS'));
    }
    if(this.mode==='gyro'){
      const axis=(v,range)=>Math.abs(v)<1.5?0:THREE.MathUtils.clamp((v-Math.sign(v)*1.5)/range,-1,1);
      lean=axis((this.gamma??this.neutral)-this.neutral,20);pitch=axis(this.neutralBeta-(this.beta??this.neutralBeta),12);
    }
    this.lean+=(lean-this.lean)*(1-Math.exp(-9*dt));this.pitch+=(pitch-this.pitch)*(1-Math.exp(-7*dt));
  }
}

class PaperSurfGame {
  constructor() {
    this.container = document.getElementById('app-container');
    this.state = 'start'; this.time = 0; this.elapsed = 0; this.distance = COMICS_COURSE.length;
    this.accumulator = 0; this.lastTime = 0; this.lastPoseFrame = -1;
    this.reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
    this.input = new PaperInput(this.container);
    this.debugMode=new URLSearchParams(location.search).get('debug')==='1';
    this.container.classList.toggle('debug-mode',this.debugMode);document.getElementById('ride-debug').classList.toggle('hidden',!this.debugMode);
    this.audio = new SurfAudio();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xc7d7c9, 100, 225);
    this.camera = new THREE.PerspectiveCamera(58, 1, .15, 350);
    this.renderer = new THREE.WebGLRenderer({canvas:document.getElementById('surf-canvas'), antialias:true, alpha:true, powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.setClearColor(0, 0);
    this.scene.add(new THREE.AmbientLight(0xfbf0d5, .9));
    const light = new THREE.DirectionalLight(0xfff0ca, .7); light.position.set(20, 35, -25); this.scene.add(light);
    this.textures = {};
    const loader = new THREE.TextureLoader();
    ['surfer_norma','surfer_turn','surfer_jump','bg_town_transparent','bg_rocks','cap_fish','cap_palm','seagull_1','seagull_2'].forEach(key => {
      this.textures[key] = loader.load(SPRITE_ASSETS[key]);
      this.textures[key].minFilter = THREE.LinearMipmapLinearFilter;
    });
    this.textures.shark_fin=loader.load('assets/comics/shark-directions-sheet.png');
    this.textures.shark_fin.userData={directionAtlas:true};
    this.textures.shark_fin.generateMipmaps=false;this.textures.shark_fin.minFilter=THREE.LinearFilter;
    this.wave = new PaperWave(this.scene);
    this.player = this.makeSurfer(1, 0x145990);
    this.player.board.scale.set(2.7,1.25,1);
    this.mug = new ComicBeerLiquid();
    this.mug.addSpillListener((side, amount) => {
      if (this.state !== 'playing') return;
      this.spillFlash = Math.max(this.spillFlash, Math.min(.5, amount * 14));
    });
    this.beerCanvas = document.getElementById('beer-canvas');
    this.beerCtx = this.beerCanvas.getContext('2d');
    this.heroAnimator=new HeroAnimator(this);this.handBeer=new HandBeer(this);this.waveRide=new WaveRide(this);
    this.initBackdrop(); this.initParticles(); this.initTrail(); this.initRivals(); this.initCaps(); this.initFinish();
    this.world=new ComicsWorld(this);this.wave.wakeField=(x,z)=>this.world.wakeAt(x,z);this.comics=new ComicDirector(this);this.jump=new SurfJump(this);this.balance=new SurfBalance(this);
    this.reset(); this.resize(); this.bindUI();
    this.journey=new SurfJourney(this);
    document.getElementById('cap-icon').src = SPRITE_ASSETS.cap_fish;
    if (!matchMedia('(pointer:coarse)').matches) document.getElementById('start-help').innerHTML = '← → / A D — курс · ↑ ↓ / W S — вес<br>Держи пробел и отпусти — прыжок.<br>Лови разгон на волне, уходи от акулы.';
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {if (document.hidden && this.state === 'playing') this.pause();});
    window.addEventListener('keydown', e => {if (e.code === 'Escape' || e.code === 'KeyP') {if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume();}});
    this.animate = this.animate.bind(this); requestAnimationFrame(this.animate);
  }

  sprite(texture, width, height) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:texture, transparent:true, alphaTest:.22, depthWrite:false}));
    sprite.scale.set(width, height, 1); this.scene.add(sprite); return sprite;
  }
  makeSurfer(scale, color) {
    const group = new THREE.Group();
    const card = new THREE.Mesh(new THREE.PlaneGeometry(2.25 * scale, 3.1 * scale), new THREE.MeshBasicMaterial({map:this.textures.surfer_norma, side:THREE.DoubleSide, transparent:true, alphaTest:.3}));
    card.position.y = 1.46 * scale; group.add(card);
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.28); shape.quadraticCurveTo(.44, .7, .43, -.8); shape.quadraticCurveTo(0, -1.35, -.43, -.8); shape.quadraticCurveTo(-.44, .7, 0, 1.28);
    const board = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({color, side:THREE.DoubleSide}));
    board.rotation.x = -Math.PI / 2; board.position.y = .055; board.scale.setScalar(scale); group.add(board);
    const rim=new THREE.Mesh(board.geometry,new THREE.MeshBasicMaterial({color:0xf6ebd0,side:THREE.DoubleSide}));
    rim.scale.set(1.07,1.025,1);rim.position.z=-.008;board.add(rim);
    this.scene.add(group);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.85, 24), new THREE.MeshBasicMaterial({color:0x062c40, transparent:true, opacity:.25, depthWrite:false}));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 1.5, 1); this.scene.add(shadow);
    return {group, card, board, shadow, scale, pose:'norma'};
  }
  label(text, color = '#ef653f', width = 256, height = 76) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f2e8ce';
    ctx.beginPath();ctx.moveTo(2,8);ctx.lineTo(width-8,2);ctx.lineTo(width-1,height-9);ctx.lineTo(8,height-1);ctx.closePath();ctx.fill();
    ctx.fillStyle = color;ctx.fillRect(9,10,width-21,height-23);ctx.fillStyle = '#fff2d9';ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.font = '900 30px Arial';ctx.fillText(text,width/2,height/2);
    return new THREE.CanvasTexture(canvas);
  }
  initBackdrop() {
    this.town = this.sprite(this.textures.bg_town_transparent, 33, 45);
    this.rocks = this.sprite(this.textures.bg_rocks, 32, 26);
    this.birds = [this.sprite(this.textures.seagull_1, 5, 4), this.sprite(this.textures.seagull_2, 4, 3)];
  }
  initParticles() {
    const canvas = document.createElement('canvas');canvas.width=64;canvas.height=64;
    const c=canvas.getContext('2d');c.fillStyle='#f8efd9';c.strokeStyle='#235570';c.lineWidth=2;
    c.beginPath();c.moveTo(31,4);c.lineTo(48,29);c.lineTo(45,47);c.lineTo(25,55);c.lineTo(13,36);c.closePath();c.fill();c.stroke();
    this.dropTexture = new THREE.CanvasTexture(canvas);
    const amber=document.createElement('canvas');amber.width=64;amber.height=64;const ac=amber.getContext('2d');
    ac.fillStyle='#f9b52c';ac.strokeStyle='#fff0bb';ac.lineWidth=5;ac.beginPath();ac.moveTo(31,6);ac.bezierCurveTo(60,34,52,56,30,58);ac.bezierCurveTo(8,54,6,32,31,6);ac.fill();ac.stroke();this.beerDropTexture=new THREE.CanvasTexture(amber);
    this.particles=[];
    for(let i=0;i<85;i++){const mesh=this.sprite(this.dropTexture,.2,.3);mesh.visible=false;this.particles.push({mesh,life:0,x:0,y:0,z:0,vx:0,vy:0,vz:0});}
  }
  initTrail() {
    this.trailPoints = [];
    const geo = new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(34*2*3),3));
    const ix=[];for(let i=0;i<33;i++){let a=i*2;ix.push(a,a+1,a+2,a+1,a+3,a+2);}geo.setIndex(ix);
    this.trail = new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xf5ebd4,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));this.trail.frustumCulled=false;this.scene.add(this.trail);
  }
  initRivals() {
    this.rivals = [
      {name:'ТОНИ', kind:'showoff', x:-3.2, z:30, speed:28, scale:1, color:0xe75735, line:'СМОТРИ, КАК НАДО!'},
      {name:'ВИТЯ', kind:'calm', x:4, z:45, speed:26, scale:1.13, color:0xedbd36, line:'ТИШЕ ЕДЕШЬ…'},
      {name:'СТАС', kind:'wobbly', x:1.3, z:72, speed:27, scale:.94, color:0x8ba544, line:'Я ВСЁ КОНТРОЛИРУЮ!'}
    ];
    this.rivals.forEach((r,i)=>{
      r.rig=this.makeSurfer(r.scale,r.color);
      r.wake=[];for(let j=0;j<9;j++){let s=this.sprite(this.dropTexture,.25,.25);r.wake.push(s);}
      r.index=i;
    });
  }
  initCaps() {
    this.caps=[];
    for(let i=0;i<44;i++){
      const z=27+i*25.5, x=Math.sin(i*.47)*4.2;
      const mesh=this.sprite(i%3===0?this.textures.cap_palm:this.textures.cap_fish,.8,.8);
      this.caps.push({mesh,x,z,collected:false});
    }
  }
  initFinish() {
    this.finishSign=this.sprite(this.label('ПЛЯЖНЫЙ БАР','#124f6a',512,90),11,1.9);
    this.finishPosts=[];
    for(const x of [-7,7]){
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,7,5),new THREE.MeshBasicMaterial({color:0xddc99e}));this.scene.add(pole);this.finishPosts.push({pole,x});
    }
  }
  bindUI() {
    document.getElementById('start-button').addEventListener('click',()=>this.journey.open('character'));
    document.getElementById('replay-button').addEventListener('click',()=>this.start(false));
    document.getElementById('pause-button').addEventListener('click',()=>this.pause());
    document.getElementById('resume-button').addEventListener('click',()=>this.resume());
    document.getElementById('reset-button').addEventListener('click',()=>this.start(false));
    document.getElementById('center-button').addEventListener('click',()=>{this.input.recenter();document.getElementById('center-button').textContent='◎ Нейтраль запомнили';});
  }
  reset() {
    this.input.reset();this.time=this.elapsed=this.accumulator=this.score=this.collected=0;
    this.p={x:1,z:0,y:0,speed:23,heading:0,lean:0,pitch:0,smoothLean:0,sideVelocity:0,verticalVelocity:0,crouch:.1,balance:0,recovering:0,airborne:false,airY:0,spin:0};
    this.spillFlash=this.impactCooldown=this.momentTime=this.hintIndex=this.comboTime=this.trickCooldown=this.carveClock=this.wakeClock=0;
    this.combo=1;this.hintTime=6;this.tricksSeen=new Set();this.world.reset();this.comics.reset();
    this.mug.reset();this.mug.foam=.18;this.mug.totalSpilled=0;this.mug.lastSpillTime=0;
    this.waveRide.reset();this.heroAnimator.reset();this.handBeer.reset();this.jump.reset();this.balance.reset();this.container.classList.remove('fallen');
    this.p.y=this.wave.height(this.p.x,0,0);this.trailPoints=[];this.sprayAccumulator=this.trailClock=0;
    this.particles.forEach(d=>{d.life=0;d.mesh.visible=false;});
    this.caps.forEach(c=>{c.collected=false;c.mesh.visible=true;});
    this.rivals.forEach((r,i)=>{r.x=[-3.2,4,1.3][i];r.z=[30,45,72][i];r.lean=0;r.airY=0;r.passed=r.chat=r.contactLocked=false;r.yieldTime=0;r.yieldSide=0;});
    document.getElementById('moment').classList.remove('visible');document.getElementById('hint').classList.remove('invisible');
    this.wave.update(0,0,true);this.updateCamera(1,true);this.updateVisuals(0);this.updateHUD();
  }

  async start(calibrate = true) {
    if (this.starting) return;this.starting=true;
    try {
      this.audio.unlock();
      const button=document.getElementById('start-button');button.disabled=true;
      if(calibrate&&matchMedia('(pointer:coarse)').matches)button.textContent='ЗАПОМИНАЕМ НАКЛОН…';
      await Promise.all([this.heroAnimator.ready,this.comics.ready,this.world.ready,calibrate?this.input.calibrate():Promise.resolve()]);
      this.reset();this.state='playing';this.container.classList.add('playing');
      this.journey?.hideAll();
      ['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
      document.getElementById('touch-guide').classList.toggle('visible',this.input.mode==='touch');
      this.hint(this.input.mode==='touch'?'ТЯНИ ВБОК — КУРС. ВВЕРХ / ВНИЗ — ВЕС.':'↔ КУРС ПО СКЛОНУ · ↕ ВЕС НА ДОСКЕ',5);
      this.audio.startBGM();
    } catch(error){console.error(error);this.journey?.showError('Не удалось загрузить изображения. Проверь соединение и попробуй ещё раз.');} finally {this.starting=false;const button=document.getElementById('start-button');button.disabled=false;button.innerHTML='НАЧАТЬ ИСТОРИЮ <span>↗</span>';}
  }
  pause() {
    if(this.state!=='playing')return;this.state='paused';this.input.reset();this.jump.cancel();this.audio.stopBGM();
    document.getElementById('center-button').textContent='◎ Запомнить нейтраль';
    document.getElementById('center-button').classList.toggle('hidden',this.input.mode!=='gyro');
    document.getElementById('pause-help').innerHTML=this.input.mode==='keys'?'← → / A D — курс по склону.<br>↑ ↓ / W S — вес на доске.':this.input.mode==='touch'?'Тяни вбок — курс по склону.<br>Вверх / вниз — вес на доске.':'Вбок — курс по склону.<br>Вперёд / назад — вес на доске.';
    document.getElementById('pause-help').innerHTML+='<br>↑ Кнопка / пробел: держи — готовься, отпусти — прыгай.';
    document.getElementById('pause-screen').classList.remove('hidden');
  }
  resume() {if(this.state!=='paused')return;this.state='playing';this.input.reset();document.getElementById('pause-screen').classList.add('hidden');this.audio.startBGM();}
  hint(text,seconds=4) {document.getElementById('hint').textContent=text;document.getElementById('hint').classList.remove('invisible');this.hintTime=seconds;}
  moment(word,sub='',bad=false,seconds=1) {
    const el=document.getElementById('moment');el.querySelector('strong').textContent=word;el.querySelector('strong').style.fontSize=word.length>17?'24px':'';el.querySelector('span').textContent=sub;el.querySelector('span').style.display=sub?'table':'none';el.classList.toggle('bad',bad);el.classList.add('visible');this.momentTime=seconds;
  }
  awardTrick(name,points,quiet=false){
    this.tricksSeen.add(name);this.score+=points*this.combo*this.mug.multiplier;
    this.combo=Math.min(4,this.combo+1);this.comboTime=4.5;
    if(!quiet&&name!=='ПОЙМАЛ ВОЛНУ')this.moment(name,'',false,.65);
  }
  spill(amount,reason) {
    this.combo=1;this.comboTime=0;
    this.mug.level=Math.max(0,this.mug.level-amount);this.mug.applyStumbleImpulse(0);this.mug.onSpill(Math.sign(this.p.lean),amount);this.spillFlash=.7;
    this.moment('ОЙ, ПЛЕСНУЛО!',reason,true,.85);this.audio.playScratch();
  }

  step(dt) {
    this.time+=dt;this.elapsed+=dt;this.wave.time=this.time;this.input.update(dt);
    if(this.p.fallen){this.balance.stepFall(dt);return;}
    const p=this.p,s=this.wave.sample(p.x,p.z),previousLean=p.lean,previousHeading=p.heading,previousY=p.y;
    p.lean=this.input.lean;p.pitch=this.input.pitch;p.smoothLean+=(p.lean-p.smoothLean)*(1-Math.exp(-dt/.32));
    this.impactCooldown=Math.max(0,this.impactCooldown-dt);
    p.heading+=(p.lean*.55-p.heading)*(1-Math.exp(-6*dt));
    const lateral=Math.sin(p.heading)*p.speed*.38-(p.airborne?0:s.baseDx*.4);
    p.sideVelocity+=(lateral-p.sideVelocity)*(1-Math.exp(-6*dt));
    // The moving wake transfers energy; it is not a static hill to climb.
    // Its full surface still controls board height, banking, knees and beer.
    const slope=p.airborne?0:s.baseDz*Math.cos(p.heading)+s.baseDx*p.sideVelocity/Math.max(1,p.speed);
    this.waveRide.step(dt);
    const wake=p.airborne?0:this.world.wakeQualityAt(p.x,p.z);
    const trim=p.pitch*(this.waveRide.caught||wake>.3?3.2:.6);
    const target=THREE.MathUtils.clamp(22+this.waveRide.boost-slope*38+trim-Math.abs(p.heading)*2+(wake>.3?5*wake:0)-(p.recovering>0?7:0),17,42);
    p.speed+=(target-p.speed)*(1-Math.exp(-2.3*dt));
    p.x=THREE.MathUtils.clamp(p.x+p.sideVelocity*dt,-9,9.2);p.z+=p.speed*Math.cos(p.heading)*dt;
    const next=this.wave.sample(p.x,p.z);this.jump.step(dt,next);
    const vertical=(p.y-previousY)/dt,verticalImpulse=THREE.MathUtils.clamp((vertical-p.verticalVelocity)*.16,-1.5,1.5);
    p.verticalVelocity+=(vertical-p.verticalVelocity)*(1-Math.exp(-10*dt));
    const autoKnees=THREE.MathUtils.clamp(.12+Math.abs(p.lean)*.4+Math.abs(next.dx)*.15+Math.abs(vertical)*.035+wake*.35+this.jump.charge*.5,.12,.85);
    p.crouch+=(autoKnees-p.crouch)*(1-Math.exp(-10*dt));
    this.balance.step(dt,next,wake,Math.abs(p.lean-p.smoothLean));
    if(p.fallen)return;
    this.comboTime=Math.max(0,this.comboTime-dt);if(this.comboTime===0)this.combo=1;
    this.trickCooldown=Math.max(0,this.trickCooldown-dt);
    this.carveClock=this.waveRide.caught&&Math.abs(p.lean)>.35?this.carveClock+dt:0;
    if(this.carveClock>.6&&this.trickCooldown===0){this.awardTrick('КАРВИНГ',100);this.trickCooldown=3;this.carveClock=0;}
    this.wakeClock=wake>.4&&p.balance<.7?this.wakeClock+dt:0;
    if(this.wakeClock>.45&&this.trickCooldown===0){this.awardTrick('НА ХВОСТЕ',180);this.trickCooldown=3;this.world.wakeRides++;this.comics.trigger('ПОГНАЛИ!','ПОЙМАЛ СЛЕД АКВАБАЙКА','transfer');}
    this.handBeer.step(dt,(p.heading-previousHeading)/dt,wake+verticalImpulse,THREE.MathUtils.clamp((p.lean-previousLean)/dt,-3,3));
    this.world.step(dt);this.updateRivals(dt);this.updateCaps(dt);this.updateParticles(dt);
    if(!p.airborne)this.sprayAccumulator+=dt*(Math.abs(p.lean)*20+this.waveRide.boost*.55+wake*12);
    if(this.sprayAccumulator>1){const n=Math.floor(this.sprayAccumulator);this.emit(n,.6+Math.abs(p.lean));this.sprayAccumulator-=n;}
    this.trailClock+=dt;if(!p.airborne&&this.trailClock>.035){this.trailClock=0;this.trailPoints.unshift({x:p.x,z:p.z-.7});if(this.trailPoints.length>34)this.trailPoints.pop();}
    this.momentTime-=dt;if(this.momentTime<=0)document.getElementById('moment').classList.remove('visible');
    this.hintTime-=dt;if(this.hintTime<=0)document.getElementById('hint').classList.add('invisible');
    if(p.z>40&&this.hintIndex===0){this.hint('ВОЛНА СЛЕВА — ВХОДИ ПЛАВНО НА СКЛОН');this.hintIndex++;}
    if(p.z>145&&this.hintIndex===1){this.hint('ВНИЗ ПО СКЛОНУ — РАЗГОН. НАВЕРХУ — БАЛАНС.');this.hintIndex++;}
    if(p.z>350&&this.hintIndex===2){this.hint('ВОЛНА ЗАКОНЧИЛАСЬ — ИЩИ СЛЕДУЮЩУЮ');this.hintIndex++;}
    this.spillFlash=Math.max(0,this.spillFlash-dt*1.8);
    if(p.z>=this.distance)this.finish();
  }


  updateRivals(dt){
    const p=this.p;
    this.rivals.forEach(r=>{
      const previousX=r.x,w=this.wave.waves.find(w=>r.z>w.from&&r.z<w.to);
      const fraction=r.kind==='showoff'?.15:r.kind==='calm'?.65:.4+.22*Math.sin(this.time*1.8+r.index);
      r.yieldTime=Math.max(0,r.yieldTime-dt);
      if(r.contactLocked&&r.yieldTime===0&&(Math.abs(r.z-p.z)>8||Math.abs(r.x-p.x)>3))r.contactLocked=false;
      const line=w?this.wave.crestX(w,r.z)+w.width*fraction:Math.sin(this.time*.5+r.index)*3;
      const desired=THREE.MathUtils.clamp(line+(r.yieldTime>0?r.yieldSide*1.8:0),-8,8);
      r.x+=(desired-r.x)*(1-Math.exp(-dt*1.5));r.lean=THREE.MathUtils.clamp((r.x-previousX)/dt*.15,-1,1);
      const catchup=THREE.MathUtils.clamp((p.z-r.z)*.045,-3.5,4),sample=this.wave.sample(r.x,r.z);
      r.speed+=(25+sample.energy*5+catchup-r.speed)*(1-Math.exp(-dt*2));r.z+=r.speed*dt;r.airY=0;
      if(!r.chat&&Math.abs(r.z-p.z)<12)r.chat=true;
      if(!r.passed&&p.z-r.z>3){r.passed=true;this.score+=100;}
      if(!r.contactLocked&&Math.abs(r.z-p.z)<1.5&&Math.abs(r.x-p.x)<.85&&this.impactCooldown===0){
        r.contactLocked=true;r.yieldTime=3.5;r.yieldSide=r.x>p.x?1:-1;
        this.spill(.08,r.name+': «Сорян!»');p.speed*=.8;this.impactCooldown=1.6;r.x+=r.yieldSide*1.5;r.z+=2;this.emit(16,1);
      }
      if(r.z<p.z-24){r.z=p.z+50+r.index*13;r.passed=r.chat=r.contactLocked=false;r.yieldTime=0;}
    });
  }

  updateCaps(dt) {
    this.caps.forEach(c=>{
      if(c.collected)return;
      if(Math.abs(c.z-this.p.z)<2.1&&Math.abs(c.x-this.p.x)<1.25&&this.p.airY<2.2){
        c.collected=true;c.mesh.visible=false;this.collected++;this.score+=50*this.mug.multiplier;this.audio.playFruit();
      }
      c.mesh.material.rotation=Math.sin(this.time*2+c.z)*.16;
    });
  }
  emit(count,strength) {
    const p=this.p;
    for(let i=0;i<count;i++){
      const d=this.particles.find(item=>item.life<=0);if(!d)break;
      d.mesh.material.map=this.dropTexture;
      d.x=-p.x+(Math.random()-.5)*.7;d.y=p.y+.12;d.z=p.z-.45;
      d.vx=(Math.random()-.5)*5*strength-p.lean*2;d.vy=2+Math.random()*3*strength;d.vz=-3-Math.random()*7;d.life=.45+Math.random()*.3;d.mesh.visible=true;
    }
  }
  emitBeer(side,count){
    const p=this.p,origin=new THREE.Vector3();this.handBeer.pivot.getWorldPosition(origin);
    for(let i=0;i<count;i++){
      const d=this.particles.find(item=>item.life<=0);if(!d)break;
      d.mesh.material.map=this.beerDropTexture;d.x=origin.x;d.y=origin.y+.5;d.z=p.z-.1;
      d.vx=-side*(1.4+Math.random()*3);d.vy=1+Math.random()*3;d.vz=-2-Math.random()*3;d.life=.6+Math.random()*.3;d.mesh.visible=true;
    }
  }
  updateParticles(dt) {
    this.particles.forEach(d=>{if(d.life<=0)return;d.life-=dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;d.vy-=12*dt;d.mesh.position.set(d.x,d.y,d.z);d.mesh.material.rotation=Math.floor(this.time*12)*.37;d.mesh.scale.setScalar(Math.max(0,d.life)*.45);if(d.life<=0)d.mesh.visible=false;});
  }
  finish() {
    this.state='finished';this.audio.stopBGM();this.audio.playSlam();this.input.reset();
    const pct=Math.round(this.mug.level*100);
    document.getElementById('result-title').textContent=pct>=70?'ДОВЁЗ!':'ДОПЛЕСКАЛ!';
    document.getElementById('result-beer').textContent=pct+'%';
    document.getElementById('result-comment').textContent=pct>=90?'Бармен просит мастер-класс.':pct>=70?'Есть что поднять за волну.':pct>=40?'Главное — кружку довёз.':'Зато красиво приехал.';
    document.getElementById('result-score').textContent=Math.round(this.score);document.getElementById('result-caps').textContent=this.collected+' / '+this.caps.length;document.getElementById('result-landings').textContent=this.waveRide.totalCaught;
    document.getElementById('result-tricks').textContent=this.tricksSeen.size?'Твои манёвры: '+[...this.tricksSeen].join(' · '):'Следующая волна — попробуй карвинг и тонкий баланс на гребне.';
    document.getElementById('result-recovery').textContent='Спасений: '+this.balance.saves+' · Падений: '+this.balance.falls;
    this.comics.reset();
    document.getElementById('result-screen').classList.remove('hidden');this.container.classList.remove('playing');document.getElementById('moment').classList.remove('visible');
  }

  updateSurfer(rig,x,z,y,lean,airY,crouch,poseFrame){
    const sample=this.wave.sample(x,z);rig.group.position.set(-x,y,z);
    const normal=rig===this.player&&this.p.airborne?new THREE.Vector3(0,1,0):new THREE.Vector3(sample.dx,1,-sample.dz).normalize();
    rig.board.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normal)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI+(rig===this.player?this.p.heading:lean*.3)));
    rig.board.position.y=.12;rig.board.visible=true;
    rig.card.quaternion.copy(this.camera.quaternion);rig.card.rotateZ(-lean*.16+Math.atan(sample.dx)*.30);
    if(rig===this.player){
      rig.card.rotateZ(-this.balance.roll*.3);
      rig.board.rotateY(this.balance.roll*.22);
      rig.group.visible=!this.p.fallen||this.balance.fallTime>.55;
      if(this.p.fallen){rig.group.position.y-=Math.max(0,1.25-this.balance.fallTime)*2;rig.card.rotateZ((1.25-this.balance.fallTime)*1.2);}
    }
    if(rig!==this.player&&poseFrame!==this.lastPoseFrame){
      const pose=Math.abs(lean)>.2?'turn':'norma';rig.card.material.map=this.textures['surfer_'+pose];rig.pose=pose;
      rig.card.scale.set(pose==='turn'&&lean<0?-1:1,1,1);
    }
    rig.shadow.position.set(-x,sample.height+.04,z-.15);rig.shadow.material.opacity=.25/(1+airY*.8);
    rig.shadow.rotation.z=Math.atan(sample.dx);rig.shadow.scale.set(1,1.5,1);
  }

  updateVisuals(dt) {
    const p=this.p,frame=Math.floor(this.time*12);
    this.updateCamera(dt);
    this.updateSurfer(this.player,p.x,p.z,p.y,p.lean,p.airY,p.crouch,frame);
    if(!this.animationReview)this.heroAnimator.update(this.state==='playing'?dt*this.comics.timeScale:0);
    this.rivals.forEach(r=>{
      const s=this.wave.sample(r.x,r.z);this.updateSurfer(r.rig,r.x,r.z,s.height+r.airY,r.lean,r.airY,0,frame);
      r.wake.forEach((drop,i)=>{const z=r.z-1-i*.65;const x=r.x+Math.sin(i*2+this.time*4)*.2;drop.position.set(-x,this.wave.height(x,z)+.06,z);drop.scale.set(.4+i*.05,.14+i*.02,1);drop.visible=r.airY<.3;});
    });
    this.lastPoseFrame=frame;
    this.handBeer.update();this.waveRide.update();
    this.town.position.set(-39+p.x*.15,17,p.z+135);this.rocks.position.set(-43+p.x*.1,10,p.z+164);
    this.world.update();
    this.birds.forEach((b,i)=>{b.position.set((i===0?18:-19)+Math.sin(this.time*.6+i)*3,15+Math.sin(this.time*1.4+i),p.z+75+i*22);b.material.rotation=Math.sin(Math.floor(this.time*12)*.2+i)*.1;});
    this.caps.forEach(c=>{if(!c.collected)c.mesh.position.set(-c.x,this.wave.height(c.x,c.z)+.8+Math.sin(this.time*3+c.z)*.09,c.z);});
    this.finishSign.position.set(0,7,this.distance+2);this.finishPosts.forEach(({pole,x})=>pole.position.set(x,3,this.distance+2));
    const pos=this.trail.geometry.attributes.position;
    for(let i=0;i<34;i++){
      const t=this.trailPoints[Math.min(i,this.trailPoints.length-1)]||{x:p.x,z:p.z};
      const spread=.22+i*.045;
      pos.setXYZ(i*2,-t.x-spread,this.wave.height(t.x+spread,t.z)+.035,t.z);
      pos.setXYZ(i*2+1,-t.x+spread,this.wave.height(t.x-spread,t.z)+.035,t.z);
    }
    pos.needsUpdate=true;
  }
  updateCamera(dt,snap=false) {
    const p=this.p,s=this.wave.sample(p.x,p.z);
    const chase=this.world.threat(),desiredBack=chase?15.5:9.7;
    if(snap||!this.cameraBack)this.cameraBack=desiredBack;else this.cameraBack+=(desiredBack-this.cameraBack)*(1-Math.exp(-4*dt));
    const back=this.cameraBack;
    const target=new THREE.Vector3(-p.x*.84,p.y+5.3,p.z-back);
    if(snap)this.camera.position.copy(target);else this.camera.position.lerp(target,1-Math.exp(-6*dt));
    this.camera.position.z=p.z-back;
    const look=new THREE.Vector3(-p.x*.78-Math.sin(p.heading)*2,p.y*.64+1,p.z+17);
    this.camera.lookAt(look);
    if(!this.reducedMotion)this.camera.rotateZ(-p.lean*.025);
    this.camera.fov=58+Math.max(0,p.speed-26)*.45;this.camera.updateProjectionMatrix();
  }
  drawBeer() {
    const c=this.beerCtx,w=this.beerCanvas.width,h=this.beerCanvas.height;
    c.clearRect(0,0,w,h);c.save();c.translate(w*.5,h*.5);c.rotate(this.handBeer.roll*.5);c.translate(-w*.5,-h*.5);
    c.drawImage(this.handBeer.canvas,25,55,285,370,0,0,w,h);c.restore();
  }
  updateHUD() {
    const pct=Math.round(this.mug.level*100);document.getElementById('beer-value').innerHTML=pct+'<span>%</span>';document.getElementById('beer-fill').style.width=pct+'%';
    document.getElementById('score-value').textContent=Math.round(this.score).toString().padStart(6,'0');document.getElementById('caps-value').textContent=this.collected;
    document.getElementById('combo-value').textContent='×'+this.combo;
    document.getElementById('input-label').textContent=this.input.mode==='gyro'?'НАКЛОН: ↔ КУРС · ↕ ВЕС':this.input.mode==='touch'?'ТЯНИ: ↔ КУРС · ↕ ВЕС':'← → КУРС · ↑ ↓ ВЕС';
    document.getElementById('speed-value').textContent=Math.round(this.p.speed);document.getElementById('speed-meter').style.width=THREE.MathUtils.clamp(this.p.speed/42*100,20,100)+'%';
    document.getElementById('route-fill').style.width=Math.min(100,this.p.z/this.distance*100)+'%';
    document.getElementById('section-value').textContent=(COMICS_COURSE.sections.find(section=>this.p.z>=section.from&&this.p.z<section.to)||COMICS_COURSE.sections.at(-1)).title;
    document.getElementById('weight-dot').style.left=(50+this.p.pitch*40)+'%';
    document.getElementById('weight-label').textContent=this.p.pitch>.2?'ВЕС НА НОС':this.p.pitch<-.2?'ВЕС НА ХВОСТ':'ВЕС ПО ЦЕНТРУ';
    document.getElementById('balance-fill').style.width=Math.min(100,this.p.balance*100)+'%';
    document.getElementById('balance-label').textContent=this.p.recovering>0?'ВЫРУЛИВАЙ':this.p.balance>.6?(Math.abs(this.p.pitch)>.45?'ВЕС К ЦЕНТРУ':'ПЛАВНЕЕ КУРС'):this.p.balance>.3?'РАСТЁТ':'НИЗКИЙ';
    const ride=this.waveRide;document.getElementById('wave-fill').style.width=ride.charge*100+'%';
    const guidance=ride.guidance();document.querySelector('.wave-ticket').dataset.phase=guidance.phase;
    document.getElementById('wave-label').textContent=guidance.label;document.getElementById('wave-number').textContent=guidance.number;
    document.getElementById('wave-status').textContent=guidance.status;document.getElementById('wave-remaining').textContent=guidance.remaining;

    this.container.classList.toggle('wave-caught',ride.caught);this.container.classList.toggle('unstable',this.p.balance>.6);
    const threat=this.world.threat(),danger=threat?THREE.MathUtils.clamp(1-Math.max(0,threat.gap)/36,0,1):0;
    const fin=document.getElementById('shark-threat');fin.classList.toggle('visible',!!threat);fin.classList.toggle('close',danger>.7);fin.querySelector('b').style.transform='scaleX('+danger+')';
    document.getElementById('spill-flash').style.opacity=this.spillFlash;this.drawBeer();
    this.balance.updateHUD();
  }
  resize() {const {width,height}=this.container.getBoundingClientRect();this.container.style.setProperty('--panel-size',Math.max(width,height)+'px');this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  animate(now) {
    requestAnimationFrame(this.animate);
    const realDt=this.lastTime?Math.min((now-this.lastTime)/1000,.25):1/60,dt=Math.min(realDt,.05);this.lastTime=now;
    if(this.state==='playing'){
      this.comics.update(realDt);this.accumulator+=dt*this.comics.timeScale;
      while(this.accumulator>=1/120&&this.state==='playing'){this.step(1/120);this.accumulator-=1/120;if(this.comics.pending){this.accumulator=0;break;}}
      this.audio.updateWave(this.p.speed/32,false);
    }
    this.wave.update(this.p.z,this.time);this.updateVisuals(dt);this.updateHUD();this.renderer.render(this.scene,this.camera);this.comics.capture();
  }
}

function initPaperSurf() {
  if (window.game) return;
  try { window.game = new PaperSurfGame(); }
  catch(error) {
    const err = document.getElementById('error-screen');
    if (err) err.classList.remove('hidden');
    console.error(error);
  }
}
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initPaperSurf);
} else {
  initPaperSurf();
}
