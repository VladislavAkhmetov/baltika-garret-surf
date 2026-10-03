/* GARRET — a playable paper-surfing sketch, isolated from the existing slice. */
class PaperInput {
  constructor(container) {
    this.container = container;
    this.mode = matchMedia('(pointer:coarse)').matches ? 'touch' : 'keys';
    this.lean = 0; this.target = 0; this.hold = false; this.holdTime = 0; this.released = 0;
    this.keys = new Set(); this.pointers = new Map(); this.gamma = null; this.neutral = 0;
    window.addEventListener('deviceorientation', e => {
      if (e.gamma === null || e.beta === null) return;
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      this.gamma = angle === 90 ? -e.beta : angle === 270 || angle === -90 ? e.beta : angle === 180 ? -e.gamma : e.gamma;
      if(this.orientationAngle!==undefined&&this.orientationAngle!==angle&&this.mode==='gyro'){this.neutral=this.gamma;this.lean=0;}
      this.orientationAngle=angle;
    });
    window.addEventListener('keydown', e => {
      if (!['ArrowLeft','ArrowRight','KeyA','KeyD','Space','KeyW','ArrowUp'].includes(e.code)) return;
      e.preventDefault(); if (e.repeat) return;
      this.keys.add(e.code); this.mode = 'keys';
      if (['Space','KeyW','ArrowUp'].includes(e.code)) this.startHold();
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (['Space','KeyW','ArrowUp'].includes(e.code)) this.endHold();
    });
    container.addEventListener('pointerdown', e => {
      if (e.target.closest('button,.screen')) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const steer = this.mode !== 'gyro' && (e.pointerType === 'mouse' || e.clientX - rect.left < rect.width * .55);
      this.pointers.set(e.pointerId, {x:e.clientX, steer, hold:!steer || e.pointerType === 'mouse'});
      if (steer) {this.mode = 'touch'; this.target = 0;}
      if (!steer || e.pointerType === 'mouse') this.startHold();
      container.setPointerCapture(e.pointerId);
    });
    container.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (p && p.steer) this.target = THREE.MathUtils.clamp((e.clientX - p.x) / 90, -1, 1);
    });
    const end = e => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      if (p.hold) this.endHold();
      if (p.steer) this.target = 0;
      this.pointers.delete(e.pointerId);
    };
    container.addEventListener('pointerup', end);
    container.addEventListener('pointercancel', e => {end(e); this.released = 0;});
    window.addEventListener('blur', () => this.reset());
  }
  async calibrate() {
    if (!matchMedia('(pointer:coarse)').matches) return;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') {this.mode = 'touch'; return;}
      }
      const samples=[];
      for(let i=0;i<8;i++){await new Promise(resolve=>setTimeout(resolve,60));if(this.gamma!==null)samples.push(this.gamma);}
      if (samples.length) {this.neutral = samples.reduce((sum,value)=>sum+value,0)/samples.length; this.mode = 'gyro';}
      else this.mode = 'touch';
    } catch (_) {this.mode = 'touch';}
  }
  startHold() {if (!this.hold) {this.hold = true; this.holdTime = 0;}}
  endHold() {if (this.hold) {this.released = this.holdTime; this.hold = false;}}
  consumeRelease() {const t = this.released; this.released = 0; return t;}
  reset() {this.keys.clear(); this.pointers.clear(); this.target = this.lean = 0; this.hold = false; this.holdTime = this.released = 0;}
  recenter(){if(this.gamma!==null){this.neutral=this.gamma;this.lean=0;}}
  update(dt) {
    if (this.hold) this.holdTime += dt;
    let target = this.target;
    if (this.mode === 'keys') target = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
    if (this.mode === 'gyro') {
      const rel = (this.gamma || 0) - this.neutral;
      target = Math.abs(rel) < 1.5 ? 0 : THREE.MathUtils.clamp((rel - Math.sign(rel) * 1.5) / 23, -1, 1);
    }
    this.lean += (target - this.lean) * (1 - Math.exp(-9 * dt));
  }
}

class PaperSurfGame {
  constructor() {
    this.container = document.getElementById('app-container');
    this.state = 'start'; this.time = 0; this.elapsed = 0; this.distance = COMICS_COURSE.length;
    this.accumulator = 0; this.lastTime = 0; this.lastPoseFrame = -1;
    this.reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
    this.input = new PaperInput(this.container);
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
    this.wave = new PaperWave(this.scene);
    this.player = this.makeSurfer(1, 0x145990);
    this.mug = new MugLiquid();
    this.mug.addSpillListener((side, amount) => {
      if (this.state !== 'playing') return;
      this.spillFlash = Math.max(this.spillFlash, Math.min(.5, amount * 14));
    });
    this.beerCanvas = document.getElementById('beer-canvas');
    this.beerCtx = this.beerCanvas.getContext('2d');
    this.initBackdrop(); this.initParticles(); this.initTrail(); this.initRivals(); this.initCaps(); this.initFinish();
    this.world=new ComicsWorld(this);this.comics=new ComicDirector(this);
    this.reset(); this.resize(); this.bindUI();
    document.getElementById('cap-icon').src = SPRITE_ASSETS.cap_fish;
    if (!matchMedia('(pointer:coarse)').matches) document.getElementById('start-help').innerHTML = '← → / A D — карвинг · пробел — присед<br>Отпусти у гребня — вылет<br>В воздухе: наклон — разворот, присед — посадка';
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
      r.rig=this.makeSurfer(r.scale,r.color);r.label=this.sprite(this.label(r.name,['#d24a32','#bb932d','#6d8a39'][i]),2.6,.7);
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
    document.getElementById('start-button').addEventListener('click',()=>this.start(true));
    document.getElementById('replay-button').addEventListener('click',()=>this.start(false));
    document.getElementById('pause-button').addEventListener('click',()=>this.pause());
    document.getElementById('resume-button').addEventListener('click',()=>this.resume());
    document.getElementById('reset-button').addEventListener('click',()=>this.start(false));
    document.getElementById('center-button').addEventListener('click',()=>{this.input.recenter();this.hint(this.input.mode==='gyro'?'НЕЙТРАЛЬ ЗАПОМНИЛИ':'НА ТЕЛЕФОНЕ — НАКЛОН. СЕЙЧАС — ТАЧ ИЛИ КЛАВИШИ',2.5);});
  }
  reset() {
    this.input.reset();this.time=0;this.elapsed=0;this.accumulator=0;this.score=0;this.collected=0;this.cleanLandings=0;
    this.p={x:0,z:0,y:0,speed:26,heading:0,lean:0,smoothLean:0,airborne:false,vy:0,airY:0,crouch:0,flightTime:0,peak:0,pump:0,spin:0,grabTime:0,landingCompression:0,apexShown:false,carveTime:0,carveDirection:0};
    this.p.y=this.wave.height(0,0,0);
    this.spillFlash=0;this.impactCooldown=0;this.momentTime=0;this.hintTime=7;this.hintIndex=0;
    this.combo=1;this.comboTime=0;this.tricksSeen=new Set();this.trickCooldown=0;this.lastCarveWave=-999;this.carveCommitted=0;this.world.reset();this.comics.reset();this.sprayAccumulator=this.trailClock=0;
    this.lastLanding=null;
    this.mug.reset();this.mug.foam=.18;this.mug.totalSpilled=0;
    this.trailPoints=[];this.particles.forEach(d=>{d.life=0;d.mesh.visible=false;});
    this.caps.forEach(c=>{c.collected=false;c.mesh.visible=true;});
    this.rivals.forEach((r,i)=>{r.x=[-3.2,4,1.3][i];r.z=[30,45,72][i];r.lean=0;r.airY=0;r.vy=0;r.airborne=false;r.passed=false;r.chat=false;r.cooldown=0;});
    document.getElementById('moment').classList.remove('visible');document.getElementById('hint').classList.remove('invisible');
    this.wave.update(0,0,true);this.updateCamera(1,true);this.updateHUD();
  }
  async start(calibrate = true) {
    if (this.starting) return;this.starting=true;
    try {
      this.audio.unlock();
      const button=document.getElementById('start-button');button.disabled=true;
      if(calibrate&&matchMedia('(pointer:coarse)').matches)button.textContent='ЗАПОМИНАЕМ НАКЛОН…';
      if (calibrate) await this.input.calibrate();
      this.reset();this.state='playing';this.container.classList.add('playing');
      ['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
      document.getElementById('touch-guide').classList.toggle('visible',this.input.mode==='touch');
      this.hint(this.input.mode==='touch'?'СЛЕВА — ПОВОРОТ. СПРАВА — ПРЫЖОК.':'НАКЛОНЯЙ — РЕЖЬ ВОЛНУ ↔',6);
      this.audio.startBGM();
    } finally {this.starting=false;const button=document.getElementById('start-button');button.disabled=false;button.innerHTML='ЛОВИ ВОЛНУ <span>↗</span>';}
  }
  pause() {
    if(this.state!=='playing')return;this.state='paused';this.input.reset();this.audio.stopBGM();
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
    if(!quiet)this.moment(name,'+'+points+' · комбо ×'+this.combo,false,.85);
  }
  spill(amount,reason) {
    this.combo=1;this.comboTime=0;
    this.mug.level=Math.max(0,this.mug.level-amount);this.mug.applyStumbleImpulse(.02);this.spillFlash=.7;
    this.moment('ОЙ, ПЛЕСНУЛО!',reason,true,.85);this.audio.playScratch();
  }

  step(dt) {
    this.time+=dt;this.elapsed+=dt;this.wave.time=this.time;this.input.update(dt);
    const p=this.p,s=this.wave.sample(p.x,p.z),prevLean=p.lean,prevHeading=p.heading;
    this.comboTime=Math.max(0,this.comboTime-dt);if(this.comboTime===0)this.combo=1;this.trickCooldown=Math.max(0,this.trickCooldown-dt);
    p.lean=this.input.lean;p.smoothLean+=(p.lean-p.smoothLean)*(1-Math.exp(-dt/.32));
    p.heading+=(p.lean*.62-p.heading)*(1-Math.exp(-7*dt));
    p.crouch+=(Number(this.input.hold&&!p.airborne)-p.crouch)*(1-Math.exp(-12*dt));
    const lateral=Math.sin(p.heading)*p.speed*.52;
    const slopeTravel=s.dz*Math.cos(p.heading)+s.dx*Math.sin(p.heading)*.52;
    if(!p.airborne&&this.input.hold&&slopeTravel<-.025)p.pump=Math.min(6,p.pump+(-slopeTravel)*12*dt);
    if(!p.airborne){
      const turning=Math.abs(p.lean)>.35;
      if(turning){p.carveTime+=dt;p.carveDirection=Math.sign(p.lean);}else p.carveTime=Math.max(0,p.carveTime-dt*2);
      const waveId=Math.floor((p.z-this.time*this.wave.drift)/this.wave.period);
      if(p.carveTime>.35&&this.input.hold&&s.crest<.42&&this.lastCarveWave!==waveId){this.lastCarveWave=waveId;p.pump=Math.min(8,p.pump+2.5);this.awardTrick('КАРВИНГ',100);}
      if(Math.abs(p.lean)>.5)this.carveCommitted=Math.sign(p.lean);
      if(this.carveCommitted&&this.input.target!==undefined&&p.lean*this.carveCommitted<-.25&&s.crest>.45&&this.trickCooldown===0){this.awardTrick('КАТБЭК',180);this.carveCommitted=Math.sign(p.lean);this.trickCooldown=2;}
    }
    p.pump*=Math.exp(-dt*.75);
    const target=THREE.MathUtils.clamp(27-slopeTravel*19+p.pump-Math.abs(p.heading)*3,20,42);
    p.speed+=(target-p.speed)*(1-Math.exp(-2.4*dt));
    p.x=THREE.MathUtils.clamp(p.x+lateral*dt,-8.5,8.5);p.z+=Math.cos(p.heading)*p.speed*dt;
    const release=this.input.consumeRelease();
    if(!p.airborne&&release>.12){
      p.airborne=true;p.vy=5+Math.min(release,.65)*7+(s.crest>.65?3.3:0);p.airY=.03;p.y=s.height+.03;p.flightTime=0;p.peak=0;p.spin=0;p.grabTime=0;p.landingCompression=0;p.apexShown=false;
      this.audio.playJump();this.emit(15,.8);
      if(s.crest>.65)this.moment('С ГРЕБНЯ!', 'Держи кружку!',false,.8);
    }
    const nextSurface=this.wave.sample(p.x,p.z);
    if(p.airborne){
      const previousVy=p.vy;
      p.flightTime+=dt;p.vy-=17*dt;p.y+=p.vy*dt;p.airY=Math.max(0,p.y-nextSurface.height);p.peak=Math.max(p.peak,p.airY);
      if(Math.abs(p.lean)>.2)p.spin+=p.lean*390*dt;
      if(this.input.hold&&p.vy>0)p.grabTime+=dt;
      p.landingCompression+=(Number(this.input.hold&&p.vy<0)-p.landingCompression)*(1-Math.exp(-15*dt));
      p.crouch=Math.max(p.landingCompression,this.input.hold?.75:0);
      if(previousVy>0&&p.vy<=0&&!p.apexShown&&p.peak>1.3){p.apexShown=true;this.comics.trigger('УАУ!',p.grabTime>.12?'ДЕРЖИ ДОСКУ. СПАСАЙ ПИВО.':'ВЫШЕ ВОЛНЫ!',p.grabTime>.12?'grab':'air');}
      if(p.y<=nextSurface.height&&p.vy<0){
        p.airborne=false;p.y=nextSurface.height;p.airY=0;
        const spinError=Math.abs(p.spin-Math.round(p.spin/180)*180);
        const clean=Math.abs(p.lean)<.65&&spinError<35&&p.landingCompression>.45;
        this.lastLanding={spin:p.spin,spinError,compression:p.landingCompression,lean:p.lean,clean};
        if(clean){
          this.cleanLandings++;this.mug.applyLandingImpulse(.92);this.awardTrick('ВЫЛЕТ',200+Math.round(p.peak*35),true);
          if(p.grabTime>.14)this.awardTrick('ЗАХВАТ',150,true);
          const turns=Math.floor((Math.abs(p.spin)+35)/180);
          if(turns>=1)this.awardTrick(turns>=2?'РАЗВОРОТ 360°':'РАЗВОРОТ 180°',turns>=2?450:280,true);
          this.moment('ЧИСТО!','Сжатие спасло кружку',false,.9);
          if(turns>=2)this.comics.trigger('ВОТ ЭТО!', '360° · ПИВО НА МЕСТЕ',p.grabTime>.14?'grab':'air',3);
        }else{this.spill(p.landingCompression>.45?.035:.075,spinError>=35?'Выравнивай доску перед касанием':'Зажми перед посадкой');p.speed*=.87;}
        p.spin=0;p.grabTime=0;
        this.emit(24,1.4);this.audio.playSlam();
      }
    }else{p.y=nextSurface.height;p.airY=0;}
    this.impactCooldown=Math.max(0,this.impactCooldown-dt);
    const jerk=p.lean-p.smoothLean;
    const turbulent=(Math.sin(this.time*19)+Math.sin(this.time*27)*.3)*s.crest*.05;
    let wake=0;
    this.rivals.forEach(r=>{const ahead=r.z-p.z;if(ahead>1&&ahead<10&&Math.abs(r.x-p.x)<1.2)wake+=Math.sin(this.time*32)*.17;});
    wake+=this.world.wakeAt(p.x,p.z);
    this.mug.update(dt,(p.heading-prevHeading)/dt*.075,0,jerk*.9+turbulent+wake);
    if((p.lean-prevLean)/dt*Math.sign(p.lean)>6&&Math.abs(jerk)>.75&&this.impactCooldown===0&&!p.airborne){this.spill(.025,'Резкая перекладка');this.impactCooldown=1.1;}
    this.updateRivals(dt);this.updateCaps(dt);this.world.step(dt);
    if(!p.airborne){
      this.sprayAccumulator=(this.sprayAccumulator||0)+dt*(9+Math.abs(p.heading)*40+s.crest*14);
      if(this.sprayAccumulator>1){this.emit(Math.floor(this.sprayAccumulator),.35);this.sprayAccumulator%=1;}
      this.trailClock=(this.trailClock||0)+dt;
      if(this.trailClock>.035){this.trailPoints.unshift({x:p.x,z:p.z});this.trailPoints=this.trailPoints.slice(0,34);this.trailClock=0;}
    }
    this.updateParticles(dt);
    this.momentTime-=dt;if(this.momentTime<=0)document.getElementById('moment').classList.remove('visible');
    this.hintTime-=dt;if(this.hintTime<=0)document.getElementById('hint').classList.add('invisible');
    if(p.z>90&&this.hintIndex===0){this.hint('ДЕРЖИ НА СПУСКЕ — РАЗГОН ↓');this.hintIndex++;}
    if(p.z>150&&this.hintIndex===1){this.hint('ОТПУСТИ — ВЫЛЕТ. ЗАЖМИ — ПОСАДКА.');this.hintIndex++;}
    if(p.z>340&&this.hintIndex===2){this.hint('В ВОЗДУХЕ НАКЛОН — РАЗВОРОТ');this.hintIndex++;}
    this.spillFlash=Math.max(0,this.spillFlash-dt*1.8);
    if(p.z>=this.distance)this.finish();
  }

  updateRivals(dt) {
    const p=this.p;
    this.rivals.forEach(r=>{
      const previousX=r.x;
      const desired=r.kind==='calm'?3.8+Math.sin(this.time*.5)*.8:r.kind==='showoff'?-3.5+Math.sin(this.time*1.2)*2.7:Math.sin(this.time*1.8+r.index)*4.7;
      r.x+=(desired-r.x)*(1-Math.exp(-dt*(r.kind==='wobbly'?2.2:1.2)));
      r.lean=THREE.MathUtils.clamp((r.x-previousX)/dt*.15,-1,1);
      const s=this.wave.sample(r.x,r.z),catchup=THREE.MathUtils.clamp((p.z-r.z)*.06,-3.5,4);
      r.speed+=(27-s.dz*16+(r.kind==='showoff'?2:0)+catchup-r.speed)*(1-Math.exp(-dt*2));r.z+=r.speed*dt;
      r.cooldown=Math.max(0,r.cooldown-dt);
      if(r.kind==='showoff'&&s.crest>.95&&!r.airborne&&r.cooldown===0){r.airborne=true;r.vy=8;r.cooldown=2.2;}
      if(r.airborne){r.airY+=r.vy*dt;r.vy-=17*dt;if(r.airY<=0){r.airY=0;r.airborne=false;}}
      if(!r.chat&&Math.abs(r.z-p.z)<18&&this.momentTime<0){this.moment(r.line,r.name,false,1.15);r.chat=true;}
      if(!r.passed&&p.z-r.z>3){r.passed=true;this.score+=100;if(this.momentTime<0)this.moment('ПРОЛЕТЕЛ МИМО!',r.name+' машет вслед',false,.85);}
      if(Math.abs(r.z-p.z)<1.5&&Math.abs(r.x-p.x)<.85&&p.airY<.8&&r.airY<.8&&this.impactCooldown===0){
        this.spill(.09,r.name+': «Сорян!»');p.speed*=.8;this.impactCooldown=1.6;r.x+=r.x>p.x?1.5:-1.5;r.z+=2;this.emit(20,1.1);
      }
      if(r.z<p.z-24){r.z=p.z+50+r.index*13;r.passed=false;r.chat=false;}
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
      d.x=-p.x+(Math.random()-.5)*.7;d.y=p.y+.12;d.z=p.z-.45;
      d.vx=(Math.random()-.5)*5*strength-p.lean*2;d.vy=2+Math.random()*3*strength;d.vz=-3-Math.random()*7;d.life=.45+Math.random()*.3;d.mesh.visible=true;
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
    document.getElementById('result-score').textContent=Math.round(this.score);document.getElementById('result-caps').textContent=this.collected+' / '+this.caps.length;document.getElementById('result-landings').textContent=this.cleanLandings;
    document.getElementById('result-tricks').textContent=this.tricksSeen.size?'Твои манёвры: '+[...this.tricksSeen].join(' · '):'Следующая волна — попробуй вылет и мягкую посадку.';
    this.comics.reset();
    document.getElementById('result-screen').classList.remove('hidden');this.container.classList.remove('playing');document.getElementById('moment').classList.remove('visible');
  }

  updateSurfer(rig,x,z,y,lean,airY,crouch,poseFrame) {
    const s=this.wave.sample(x,z);
    rig.group.position.set(-x,y,z);
    rig.board.rotation.z=Math.atan(s.dx);rig.board.rotation.x=-Math.PI/2+Math.atan(s.dz)*.7;rig.board.visible=airY<.3;
    rig.card.quaternion.copy(this.camera.quaternion);
    rig.card.rotateZ(-lean*.18-Math.atan(s.dx)*.25);
    if(poseFrame!==this.lastPoseFrame){
      const pose=airY>.15?'jump':Math.abs(lean)>.2||crouch>.4?'turn':'norma';
      rig.card.material.map=this.textures['surfer_'+pose];rig.pose=pose;
      rig.card.scale.set(pose==='turn'&&lean<0?-1:1,1-crouch*.15,1);
      rig.card.position.y=1.46*rig.scale-crouch*.2;
    }
    rig.shadow.position.set(-x,s.height+.04,z-.15);rig.shadow.material.opacity=.27/(1+airY*.7);
    rig.shadow.rotation.z=Math.atan(s.dx);rig.shadow.scale.set(1+airY*.2,1.5+airY*.25,1);
  }
  updateVisuals(dt) {
    const p=this.p,frame=Math.floor(this.time*12);
    this.updateCamera(dt);
    this.updateSurfer(this.player,p.x,p.z,p.y,p.lean,p.airY,p.crouch,frame);
    if(p.airborne)this.player.card.rotateY(p.spin*Math.PI/180);
    this.rivals.forEach(r=>{
      const s=this.wave.sample(r.x,r.z);this.updateSurfer(r.rig,r.x,r.z,s.height+r.airY,r.lean,r.airY,0,frame);
      r.label.position.set(-r.x,s.height+r.airY+3.6*r.scale,r.z);r.label.material.rotation=r.kind==='wobbly'?Math.sin(Math.floor(this.time*12)*.3)*.08:-.05;
      r.wake.forEach((drop,i)=>{const z=r.z-1-i*.65;const x=r.x+Math.sin(i*2+this.time*4)*.2;drop.position.set(-x,this.wave.height(x,z)+.06,z);drop.scale.set(.4+i*.05,.14+i*.02,1);drop.visible=r.airY<.3;});
    });
    this.lastPoseFrame=frame;
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
    const target=new THREE.Vector3(-p.x*.7,p.y*.55+5.6,p.z-9.7);
    if(snap)this.camera.position.copy(target);else this.camera.position.lerp(target,1-Math.exp(-6*dt));
    this.camera.position.z=p.z-9.7;
    const look=new THREE.Vector3(-p.x*.68-Math.sin(p.heading)*2,s.height*.3+1,p.z+17);
    this.camera.lookAt(look);
    if(!this.reducedMotion)this.camera.rotateZ(-p.lean*.025);
    this.camera.fov=58+Math.max(0,p.speed-26)*.45+(p.airborne?2:0);this.camera.updateProjectionMatrix();
  }
  drawBeer() {
    const c=this.beerCtx,w=this.beerCanvas.width,h=this.beerCanvas.height;
    c.clearRect(0,0,w,h);c.save();c.translate(w*.43,h*.56);c.rotate((this.p.lean-this.p.smoothLean)*.22);c.translate(-w*.43,-h*.56);
    c.strokeStyle='#52665f';c.lineWidth=7;c.beginPath();c.ellipse(80,77,19,30,0,0,Math.PI*2);c.stroke();c.strokeStyle='#f4f0da';c.lineWidth=3;c.stroke();
    c.fillStyle='rgba(224,235,215,.65)';c.fillRect(16,25,54,103);
    c.save();c.beginPath();c.rect(19,29,48,95);c.clip();
    const top=123-this.mug.level*86;
    const grad=c.createLinearGradient(0,30,0,130);grad.addColorStop(0,'#ffce50');grad.addColorStop(1,'#b56818');c.fillStyle=grad;c.beginPath();
    for(let i=0;i<this.mug.n;i++){const x=19+i/(this.mug.n-1)*48,y=top-this.mug.h[i]*85;if(i===0)c.moveTo(x,y);else c.lineTo(x,y);}c.lineTo(67,125);c.lineTo(19,125);c.closePath();c.fill();
    c.strokeStyle='#fff2d4';c.lineWidth=7;c.beginPath();for(let i=0;i<this.mug.n;i++){const x=19+i/(this.mug.n-1)*48,y=top-this.mug.h[i]*85;if(i===0)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();
    c.fillStyle='#f4df91';for(let i=0;i<8;i++){const y=124-((this.time*12+i*11)%85);if(y>top){c.beginPath();c.arc(28+(i*13)%31,y,1.7,0,Math.PI*2);c.fill();}}
    c.restore();c.strokeStyle='#33483f';c.lineWidth=3;c.strokeRect(16,25,54,103);c.strokeStyle='#fff7e7';c.lineWidth=3;c.strokeRect(20,29,46,95);
    c.fillStyle='rgba(255,255,255,.5)';c.fillRect(25,34,5,86);c.fillStyle='#f1eddb';c.beginPath();c.ellipse(43,25,30,7,0,0,Math.PI*2);c.fill();c.strokeStyle='#68776c';c.lineWidth=2;c.stroke();c.restore();
  }
  updateHUD() {
    const pct=Math.round(this.mug.level*100);document.getElementById('beer-value').innerHTML=pct+'<span>%</span>';document.getElementById('beer-fill').style.width=pct+'%';
    document.getElementById('score-value').textContent=Math.round(this.score).toString().padStart(6,'0');document.getElementById('caps-value').textContent=this.collected;
    document.getElementById('combo-value').textContent='×'+this.combo;
    document.getElementById('input-label').textContent=this.input.mode==='gyro'?'ГИРОСКОП · ◎ НЕЙТРАЛЬ':this.input.mode==='touch'?'ТАЧ: СЛЕВА ↔ СПРАВА ↓':'КЛАВИШИ: ← → ПРОБЕЛ';
    document.getElementById('speed-value').textContent=Math.round(this.p.speed);document.getElementById('speed-meter').style.width=THREE.MathUtils.clamp(this.p.speed/42*100,20,100)+'%';
    document.getElementById('route-fill').style.width=Math.min(100,this.p.z/this.distance*100)+'%';
    document.getElementById('section-value').textContent=(COMICS_COURSE.sections.find(section=>this.p.z>=section.from&&this.p.z<section.to)||COMICS_COURSE.sections.at(-1)).title;
    document.getElementById('charge-fill').style.width=(this.input.hold?Math.min(1,this.input.holdTime/.65)*100:0)+'%';
    document.getElementById('charge-label').textContent=this.p.airborne?(this.p.vy<0?'ЗАЖМИ ↓':'ЗАХВАТ ↓'):this.input.hold?'ОТПУСТИ ↑':'ДЕРЖИ ↓';
    document.getElementById('spill-flash').style.opacity=this.spillFlash;this.drawBeer();
  }
  resize() {const {width,height}=this.container.getBoundingClientRect();this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  animate(now) {
    requestAnimationFrame(this.animate);
    const dt=this.lastTime?Math.min((now-this.lastTime)/1000,.05):1/60;this.lastTime=now;
    if(this.state==='playing'){
      this.comics.update(dt);this.accumulator+=dt*this.comics.timeScale;
      while(this.accumulator>=1/120&&this.state==='playing'){this.step(1/120);this.accumulator-=1/120;if(this.comics.pending){this.accumulator=0;break;}}
      this.audio.updateWave(this.p.speed/32,false);
    }
    this.wave.update(this.p.z,this.time);this.updateVisuals(dt);this.updateHUD();this.renderer.render(this.scene,this.camera);this.comics.capture();
  }
}

window.addEventListener('DOMContentLoaded',()=>{
  try {window.game=new PaperSurfGame();}
  catch(error){document.getElementById('error-screen').classList.remove('hidden');console.error(error);}
});
