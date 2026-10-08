/* GARRET — a playable paper-surfing sketch, isolated from the existing slice. */
class PaperInput {
  constructor(container){
    this.container=container;this.mode=matchMedia('(pointer:coarse)').matches?'touch':'keys';
    this.lean=this.pitch=this.target=this.pitchTarget=0;this.keys=new Set();this.pointers=new Map();
    this.gamma=this.beta=null;this.neutral=this.neutralBeta=0;
    // Chrome long-press menus are independent of pointerdown's default action.
    const isControl=target=>target.closest?.('#jump-button,.steer-controls');
    container.addEventListener('contextmenu',e=>{if(e.target.closest?.('button,canvas'))e.preventDefault();});
    container.addEventListener('touchstart',e=>{if(isControl(e.target))e.preventDefault();},{passive:false});
    container.addEventListener('selectstart',e=>{if(isControl(e.target))e.preventDefault();});
    container.addEventListener('dragstart',e=>{if(isControl(e.target))e.preventDefault();});
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
      if(!container.classList.contains('playing')||!document.getElementById('pause-screen').classList.contains('hidden'))return;
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
  bindSteering(){
    for(const [id,code] of [['steer-left','ArrowLeft'],['steer-right','ArrowRight']]){
      const button=document.getElementById(id);
      button.addEventListener('pointerdown',e=>{if(!this.container.classList.contains('playing'))return;e.preventDefault();if(e.isTrusted)button.setPointerCapture(e.pointerId);this.mode='keys';this.keys.add(code);button.classList.add('pressed');});
      const release=()=>{this.keys.delete(code);button.classList.remove('pressed');};
      button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    }
  }
  reset(){this.keys.clear();this.pointers.clear();this.target=this.pitchTarget=this.lean=this.pitch=0;document.querySelectorAll('.steer-controls .pressed').forEach(b=>b.classList.remove('pressed'));}
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
    this.state = 'start'; this.assist=true; this.time = 0; this.elapsed = 0; this.distance = COMICS_COURSE.length;
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
    ['surfer_norma','surfer_turn','surfer_jump','cap_fish','cap_palm','seagull_1','seagull_2'].forEach(key => {
      this.textures[key] = loader.load(SPRITE_ASSETS[key]);
      this.textures[key].minFilter = THREE.LinearMipmapLinearFilter;
    });
    this.coastReady=new Promise((resolve,reject)=>{
      this.textures.bg_town_transparent=loader.load('assets/comics/coast-cape-v5.png',texture=>{
        this.fitCoastTexture(texture);this.renderDirty=true;resolve();
      },undefined,()=>reject(Error('Берег недоступен')));
    });
    this.coastReady.catch(()=>{});
    this.textures.shark_fin=loader.load('assets/comics/shark-directions-sheet.png');
    this.textures.shark_fin.userData={directionAtlas:true};
    this.textures.shark_fin.generateMipmaps=false;this.textures.shark_fin.minFilter=THREE.LinearFilter;
    this.wave = new PaperWave(this.scene);
    this.player = this.makeSurfer(1, 0x145990);
    this.player.board.scale.set(2.7,1.25,1);
    this.companion=new CrabCompanion(this);
    this.mug = new ComicBeerLiquid();
    this.mug.addSpillListener((side, amount) => {
      if (this.state !== 'playing') return;
      this.spillFlash = Math.max(this.spillFlash, Math.min(.5, amount * 14));
      if(amount>.002)this.companion.react('spill');
    });
    this.beerCanvas = document.getElementById('beer-canvas');
    this.beerCtx = this.beerCanvas.getContext('2d');
    this.heroAnimator=new HeroAnimator(this);this.handBeer=new HandBeer(this);this.waveRide=new WaveRide(this);
    this.initBackdrop(); this.initParticles(); this.initTrail(); this.initLandingEffects(); this.initRivals(); this.initCaps(); this.initFinish();
    this.world=new ComicsWorld(this);this.wave.wakeField=(x,z)=>this.world.wakeAt(x,z);this.comics=new ComicDirector(this);this.jump=new SurfJump(this);this.balance=new SurfBalance(this);
    this.onboarding=new SurfOnboarding(this);
    this.chase=new FoamChase(this);this.chain=new TrickChain(this);this.juice=new ArcadeJuice(this);this.meta=new RunMeta(this);this.runComic=new RunComic(this);
    this.trickRoute=new TrickRoute(this);this.speedBlur=new SpeedBlur(this);
    this.flowTest=window.FLOW_TEST_MODE?new (window.DRIVE_TEST_MODE?DriveTest:FlowTest)(this):null;
    this.ribbon=this.flowTest?null:new WaveRibbon(this);
    this.openingGuide=this.flowTest?null:new WaveRibbon(this,{route:z=>this.trickRoute.bypassPoint(z)});
    this.container.classList.toggle('ribbon-ride',!this.flowTest);
    this.reset(); this.resize(); this.bindUI();
    this.journey=new SurfJourney(this);
    this.flowTest?.mount();
    document.getElementById('cap-icon').src = SPRITE_ASSETS.cap_fish;
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
    this.town = this.sprite(this.textures.bg_town_transparent, 32, 13);
    this.town.center.set(.5,0);this.coastRatio=2.7;
    this.coastAnchor=new THREE.Vector3();this.coastRay=new THREE.Vector3();
    this.birds = [this.sprite(this.textures.seagull_1, 5, 4), this.sprite(this.textures.seagull_2, 4, 3)];
  }
  fitCoastTexture(texture){
    // Display crop only: keep the generated PNG and its transparency intact.
    const image=texture.image,canvas=document.createElement('canvas');
    canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let left=image.width,top=image.height,right=0,bottom=0;
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(pixels[(y*image.width+x)*4+3]>40){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    left=Math.max(0,left-3);top=Math.max(0,top-3);right=Math.min(image.width-1,right+3);bottom=Math.min(image.height-1,bottom+3);
    const width=right-left+1,height=bottom-top+1;
    texture.repeat.set(width/image.width,height/image.height);texture.offset.set(left/image.width,1-(bottom+1)/image.height);
    texture.needsUpdate=true;this.coastRatio=width/height;
  }
  placeCoast(){
    const baseY=-.34,z=this.p.z+158;
    this.coastAnchor.set(-25,baseY,z).project(this.camera);
    // Keep the entire low skyline inside the right third through steering.
    this.coastRay.set(.50,this.coastAnchor.y,.5).unproject(this.camera).sub(this.camera.position).normalize();
    const distance=(baseY-this.camera.position.y)/this.coastRay.y;
    if(Number.isFinite(distance)&&distance>0)this.town.position.copy(this.camera.position).addScaledVector(this.coastRay,distance);
    else this.town.position.set(-25,baseY,z);
    const depth=this.town.position.distanceTo(this.camera.position);
    const viewWidth=2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*depth*this.camera.aspect;
    const width=Math.min(36,viewWidth*.32);
    this.town.scale.set(width,width/this.coastRatio,1);
  }
  initParticles() {
    const canvas = document.createElement('canvas');canvas.width=64;canvas.height=64;
    const c=canvas.getContext('2d');c.fillStyle='#f8efd9';c.strokeStyle='#235570';c.lineWidth=2;
    c.beginPath();c.moveTo(31,4);c.lineTo(48,29);c.lineTo(45,47);c.lineTo(25,55);c.lineTo(13,36);c.closePath();c.fill();c.stroke();
    this.dropTexture = new THREE.CanvasTexture(canvas);
    const spray=document.createElement('canvas');spray.width=spray.height=64;const sc=spray.getContext('2d');
    const mist=sc.createRadialGradient(32,32,2,32,32,29);
    mist.addColorStop(0,'rgba(246,250,237,.96)');mist.addColorStop(.30,'rgba(229,244,235,.80)');mist.addColorStop(.68,'rgba(204,234,225,.30)');mist.addColorStop(1,'rgba(204,234,225,0)');
    sc.fillStyle=mist;sc.fillRect(0,0,64,64);this.sprayTexture=new THREE.CanvasTexture(spray);
    const amber=document.createElement('canvas');amber.width=64;amber.height=64;const ac=amber.getContext('2d');
    ac.fillStyle='#f9b52c';ac.strokeStyle='#fff0bb';ac.lineWidth=5;ac.beginPath();ac.moveTo(31,6);ac.bezierCurveTo(60,34,52,56,30,58);ac.bezierCurveTo(8,54,6,32,31,6);ac.fill();ac.stroke();this.beerDropTexture=new THREE.CanvasTexture(amber);
    this.particles=[];
    for(let i=0;i<85;i++){const mesh=this.sprite(this.dropTexture,.2,.3);mesh.visible=false;this.particles.push({mesh,life:0,x:0,y:0,z:0,vx:0,vy:0,vz:0});}
  }
  initTrail() {
    this.trailPoints = [];
    const geo = new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(34*2*3),3));
    const uv=new Float32Array(34*2*2);for(let i=0;i<34;i++){uv.set([0,i/33,1,i/33],i*4);}geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const ix=[];for(let i=0;i<33;i++){let a=i*2;ix.push(a,a+1,a+2,a+1,a+3,a+2);}geo.setIndex(ix);
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:this.wave.waterTime},transparent:true,side:THREE.DoubleSide,depthWrite:false,
      vertexShader:`varying vec2 wakeUV;void main(){wakeUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`
        uniform float uTime;varying vec2 wakeUV;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        void main(){
          float edge=pow(max(0.0,sin(wakeUV.x*3.14159)),1.4);
          float age=pow(1.0-wakeUV.y,1.8);
          float bubbles=noise(wakeUV*vec2(7.0,55.0)+vec2(uTime*.12,-uTime*.6));
          float alpha=edge*age*smoothstep(.24,.74,bubbles)*.48;
          gl_FragColor=vec4(mix(vec3(.68,.83,.80),vec3(.97,.98,.89),bubbles),alpha);
        }`
    });
    this.trail = new THREE.Mesh(geo,material);this.trail.frustumCulled=false;this.scene.add(this.trail);
  }
  initRivals() {
    this.rivals = [{scale:1,color:0x268f83},{scale:1,color:0xe9714e}];
    this.rivals.forEach((r,i)=>{
      r.rig=this.makeSurfer(r.scale,r.color);
      r.wake=[];for(let j=0;j<9;j++){let s=this.sprite(this.dropTexture,.25,.25);r.wake.push(s);}
      r.index=i;
    });
    this.rivalCast=new RivalCast(this);
  }
  initLandingEffects(){
    this.landingRings=Array.from({length:4},()=>{
      const geometry=new THREE.RingGeometry(.72,1,48,3);geometry.rotateX(-Math.PI/2);
      const original=Float32Array.from(geometry.attributes.position.array);
      const material=new THREE.MeshBasicMaterial({color:0xf0f3df,map:this.wave.foamTexture,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.visible=false;this.scene.add(mesh);
      return {mesh,original,life:0,x:0,z:0,strength:0};
    });
  }
  landingSplash(strength){
    const ring=this.landingRings.find(r=>r.life<=0)||this.landingRings.reduce((a,b)=>a.life<b.life?a:b);
    ring.life=1;ring.strength=strength;ring.x=this.p.x;ring.z=this.p.z;ring.mesh.visible=true;
  }
  updateLandingEffects(dt){
    for(const ring of this.landingRings){
      if(ring.life<=0)continue;
      ring.life=Math.max(0,ring.life-dt/ .85);ring.mesh.visible=ring.life>0;
      const age=1-ring.life,radius=.65+age*(3.2+ring.strength*1.3),pos=ring.mesh.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        const x=Math.fround(ring.x-ring.original[i*3]*radius),z=Math.fround(ring.z+ring.original[i*3+2]*radius*.72);
        pos.setXYZ(i,-x,this.wave.height(x,z)+.055,z);
      }
      pos.needsUpdate=true;ring.mesh.material.opacity=ring.life*ring.life*(.45+ring.strength*.22);
    }
  }
  initCaps() {
    // Pickups are shelved while testing waves, rivals and ramps.
    this.caps=[];
  }
  initFinish() {
    this.finishSign=this.sprite(this.label('ПЛЯЖНЫЙ БАР','#124f6a',512,90),11,1.9);
    this.finishPosts=[];
    for(const x of [-7,7]){
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,7,5),new THREE.MeshBasicMaterial({color:0xddc99e}));this.scene.add(pole);this.finishPosts.push({pole,x});
    }
  }
  bindUI() {
    this.input.bindSteering();
    document.getElementById('start-button').addEventListener('click',()=>this.flowTest?this.start(false):this.journey.open('setup'));
    document.getElementById('replay-button').addEventListener('click',()=>this.start(false));
    document.getElementById('pause-button').addEventListener('click',()=>this.pause());
    const sound=document.getElementById('sound-button');
    const renderSound=()=>{sound.setAttribute('aria-pressed',String(this.audio.isMuted));sound.setAttribute('aria-label',this.audio.isMuted?'Включить звук':'Отключить звук');sound.title=this.audio.isMuted?'Включить звук':'Отключить звук';};
    sound.addEventListener('click',()=>{if(this.audio.isMuted)this.audio.unlock();this.audio.toggleMute();renderSound();});renderSound();
    document.getElementById('resume-button').addEventListener('click',()=>this.resume());
    document.getElementById('reset-button').addEventListener('click',()=>this.start(false));
    document.getElementById('center-button').addEventListener('click',()=>{this.input.recenter();document.getElementById('center-button').textContent='◎ Нейтраль запомнили';});
    document.getElementById('camera-toggle').addEventListener('click',()=>{this.juice.setLiveCamera(!this.juice.liveCamera);this.renderCameraToggle();});
    if(this.ribbon){
      const toggle=document.createElement('button');toggle.id='ribbon-toggle';toggle.className='text-button';toggle.type='button';
      document.getElementById('camera-toggle').after(toggle);toggle.addEventListener('click',()=>this.ribbon.setEnabled(!this.ribbon.enabled));this.ribbon.renderToggle();
    }
    document.getElementById('quick-button').addEventListener('click',()=>{this.journey.hideAll();this.start(true).then(()=>{if(this.state==='playing')this.journey.screen='playing';});});
    window.addEventListener('keydown',e=>{
      if(e.repeat||e.target.closest?.('input,textarea'))return;
      if(this.ribbon&&e.code==='KeyL'){e.preventDefault();this.ribbon.setEnabled(!this.ribbon.enabled);return;}
      const sharing=!document.getElementById('share-screen').classList.contains('hidden');
      if(this.state==='finished'&&!sharing&&(e.code==='KeyR'||e.code==='Enter'&&e.target.tagName!=='BUTTON')){e.preventDefault();this.start(false);}
      else if(this.state==='playing'&&e.code==='KeyR'){e.preventDefault();this.start(false);}
      else if(sharing&&e.code==='Escape'){e.preventDefault();this.runComic.close();}
    });
    this.renderMenuMeta();
  }
  renderMenuMeta(){
    const meta=this.meta,best=meta.daily?.score,label=document.getElementById('daily-label');
    label.textContent='ВОЛНА ДНЯ · '+meta.dayLabel+(best?' · РЕКОРД '+best.toLocaleString('ru-RU'):'')+(meta.challenge?' · ВЫЗОВ '+meta.challenge.toLocaleString('ru-RU'):'');
    document.getElementById('quick-button').classList.toggle('hidden',!meta.storySeen);
  }
  reset() {
    this.input.reset();this.time=this.elapsed=this.accumulator=this.score=this.collected=0;
    this.p={x:1.4,z:0,y:0,speed:29,heading:0,lean:0,pitch:0,smoothLean:0,sideVelocity:0,verticalVelocity:0,crouch:.1,balance:0,recovering:0,airborne:false,airY:0,spin:0};
    this.wave.resetWaves(this.meta.seed);this.deliveryBonus=0;
    this.spillFlash=this.impactCooldown=this.momentTime=this.hintIndex=this.trickCooldown=this.carveClock=this.wakeClock=0;
    this.combo=1;this.hintTime=0;this.tricksSeen=new Set();this.world.reset();this.comics.reset();this.onboarding.reset();
    this.chase.reset();this.chain.reset();this.juice.reset();this.meta.reset();this.runComic.reset();this.trickRoute.reset();this.speedBlur.reset();
    this.mug.reset();this.mug.foam=.18;this.mug.totalSpilled=0;this.mug.lastSpillTime=0;
    this.waveRide.reset();this.heroAnimator.reset();this.handBeer.reset();this.jump.reset();this.balance.reset();this.container.classList.remove('fallen');
    this.companion.reset();
    this.flowTest?.reset();
    this.ribbon?.reset();
    this.openingGuide?.reset();
    if(!this.flowTest)this.chase.startIntro();
    this.p.y=this.wave.height(this.p.x,0,0);this.trailPoints=[];this.sprayAccumulator=this.trailClock=0;
    this.particles.forEach(d=>{d.life=0;d.mesh.visible=false;});
    this.landingRings.forEach(r=>{r.life=0;r.mesh.visible=false;});
    this.caps.forEach(c=>{c.collected=false;c.mesh.visible=true;});
    this.rivalCast.reset();
    document.getElementById('moment').classList.remove('visible');document.getElementById('hint').classList.add('invisible');
    this.wave.update(0,0,true);this.updateCamera(1,true);this.updateVisuals(0);this.updateHUD();
  }

  async start(calibrate = true) {
    if (this.starting) return;this.starting=true;
    try {
      this.audio.unlock();
      const button=document.getElementById('start-button');button.disabled=true;
      if(this.flowTest)calibrate=false;
      if(calibrate&&matchMedia('(pointer:coarse)').matches)button.textContent='ЗАПОМИНАЕМ НАКЛОН…';
      await Promise.all([this.heroAnimator.ready,this.rivalCast.ready,this.comics.ready,this.world.ready,this.coastReady,this.wave.ready,this.companion.ready,calibrate?this.input.calibrate():Promise.resolve()]);
      this.rivalCast.run++;
      this.reset();this.state='playing';this.container.classList.add('playing');
      this.journey?.hideAll();
      ['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
      document.getElementById('touch-guide').classList.remove('visible');document.getElementById('share-screen').classList.add('hidden');this.updateHUD();
      if(this.meta.challenge)this.hint('ВЫЗОВ: ПОБЕЙ '+this.meta.challenge.toLocaleString('ru-RU'),3.5);
      this.audio.startBGM();
    } catch(error){console.error(error);this.journey?.showError('Не удалось загрузить изображения. Проверь соединение и попробуй ещё раз.');} finally {this.starting=false;const button=document.getElementById('start-button');button.disabled=false;button.textContent='ИГРАТЬ';}
  }
  pause() {
    if(this.state!=='playing')return;this.state='paused';this.input.reset();this.jump.cancel();this.audio.stopBGM();this.audio.stopJetski?.();
    document.querySelector('.pause-balance-help').classList.toggle('hidden',this.assist);
    document.getElementById('center-button').textContent='◎ Запомнить нейтраль';
    document.getElementById('center-button').classList.toggle('hidden',this.input.mode!=='gyro');
    document.getElementById('pause-help').innerHTML=this.input.mode==='keys'?'← → / A D — курс по склону.<br>↑ ↓ / W S — вес на доске.':this.input.mode==='touch'?'Тяни вбок — курс по склону.<br>Вверх / вниз — вес на доске.':'Вбок — курс по склону.<br>Вперёд / назад — вес на доске.';
    document.getElementById('pause-help').innerHTML+='<br>Кнопка / пробел: первое нажатие — прыжок, второе в воздухе — 360°. Высокий вылет с гребня открывает переворот: кнопка покажет «ФЛИП».<br>После ошибки пена возвращается за спину. Чистая езда, новая волна и удачная посадка помогают оторваться; повторная ошибка приближает накрытие. Малый пролив уменьшает множитель цепочки; удар, падение и накрытие сжигают её. Очки трюков считаются отдельно от бонуса доставки.';
    document.getElementById('pause-help').innerHTML+='<br>Пунктир — маршрут: зелёный, когда держишь линию; красный, когда отклоняешься. L — подсказки на воде. На боковой борт заезжай поперёк с воды. Трамплин подбрасывает сам; прыжок на нём усиливает вылет. В воздухе нажми ещё раз для трюка. Ближе к пене — больше очков; скорость помогает оторваться.';
    if(this.flowTest)document.getElementById('pause-help').innerHTML='← → / A D или кнопки — поворот.<br>Пробел / прыжок — вылет, ещё раз — трюк.<br>L — лента, R — тот же участок заново.';
    if(window.DRIVE_TEST_MODE)document.getElementById('pause-help').innerHTML+='<br>Трамплин слева, спокойный объезд справа. После посадки отпусти поворот, чтобы зачесть цепочку. Небольшой пролив уменьшает её множитель; падение сжигает цепочку. Довези не меньше 30% бокала.';
    this.renderCameraToggle();this.renderMissions(document.getElementById('pause-missions'),this.meta.missions.map(m=>({...m,done:this.meta.completedLive.has(m.id)})));
    document.getElementById('pause-screen').classList.remove('hidden');
    document.getElementById('moment')?.classList.remove('visible');
    document.getElementById('chain-toast')?.classList.remove('visible');
    if(this.chain)this.chain.toastTime=0;
  }
  resume() {if(this.state!=='paused')return;this.state='playing';this.input.reset();document.getElementById('pause-screen').classList.add('hidden');this.audio.startBGM();}
  hint(text,seconds=4) {document.getElementById('hint').textContent=text;document.getElementById('hint').classList.remove('invisible');this.hintTime=seconds;}
  moment(word,sub='',bad=false,seconds=1) {
    const el=document.getElementById('moment');el.querySelector('strong').textContent=word;el.querySelector('strong').style.fontSize='';el.querySelector('span').textContent=sub;el.querySelector('span').style.display=sub?'table':'none';el.classList.toggle('bad',bad);el.classList.remove('reward','big-reward','visible');el.querySelector('.moment-points').textContent='';el.querySelector('.moment-mult').textContent='';void el.offsetWidth;el.classList.add('visible');this.momentTime=seconds;
  }
  awardTrick(name,points,quiet=false){
    if(this.flowTest){this.flowTest.award(name,points);return;}
    this.tricksSeen.add(name);const gain=this.chain.add(name,points);this.combo=this.chain.multiplier;
    this.waveRide.reward(name);this.chase.onTrick(name);
    if(!quiet){
      this.moment(name,'',false,1.15);
      const el=document.getElementById('moment');el.classList.add('reward');el.classList.toggle('big-reward',points>=600);
      el.querySelector('.moment-points').textContent='+'+gain.toLocaleString('ru-RU');
      el.querySelector('.moment-mult').textContent='ЦЕПОЧКА ×'+this.chain.multiplier;
    }
    const word=PaperSurfGame.trickWords[name];if(word&&this.p)this.juice.pop(word,this.p.x,this.p.y+2.3,this.p.z,'trick');
    if(!['ПОЙМАЛ ВОЛНУ','ОТОРВАЛСЯ!','РАЗОШЛИСЬ','КАРМАН'].includes(name))this.companion.react('trick');
    if(this.audio){
      if(points>=180||this.combo>=3){
        this.audio.playCrowdCheer(true);
        this.audio.playTrickTriumph(0.9);
      }else{
        this.audio.playTrickTriumph(0.65);
        this.audio.playCrowdCheer(false);
      }
    }
  }
  nearMiss(name,points,x,z,word='ВЖУХ!',quiet=false){
    this.chain.nearMisses++;this.awardTrick(name,points,quiet);
    this.juice.hitstop(.06);this.juice.punch(1.5);this.juice.pop(word,x,this.wave.height(x,z)+1.6,z,'near');
    this.runComic.capture('near',word,name,52);
  }
  runStats(finished){
    const sharks=this.world.hazards.filter(h=>h.type==='shark');
    return {finished,beer:this.mug.level,score:Math.round(this.score+(finished?0:this.chain.value)),tricks:this.jump.tricks,special:this.jump.specialTricks,
      pocket2:this.chase.pocket2Time,longest:this.chain.longest,bestBank:this.chain.best,near:this.chain.nearMisses,wake:this.world.wakeRides,
      sharkAir:sharks.filter(h=>h.escaped&&h.airDodge).length,falls:this.balance.falls,wipes:this.chase.wipes};
  }
  spill(amount,reason) {
    if(this.flowTest){if(!this.flowTest.handleSpill?.(amount,reason))this.chain.burn();}
    else {this.chain.penalize(amount);this.waveRide.momentum=amount>=.10?0:this.waveRide.momentum*.55;this.chase.onMistake(amount,reason);}
    this.combo=this.chain.multiplier;this.juice.shake(.3+amount*3);
    this.mug.level=Math.max(0,this.mug.level-amount);this.mug.applyStumbleImpulse(0);this.mug.onSpill(Math.sign(this.p.lean),amount);this.spillFlash=.7;
    this.moment(reason.toUpperCase(),'',true,.85);this.audio.playScratch();
    this.companion.react('spill');
  }

  step(dt) {
    this.time+=dt;this.elapsed+=dt;this.wave.time=this.time;this.input.update(dt);
    this.companion.step();
    if(this.p.fallen){this.chase.end('fall');this.trickRoute.step(dt);this.balance.stepFall(dt);return;}
    const p=this.p,s=this.wave.sample(p.x,p.z),previousLean=p.lean,previousHeading=p.heading,previousY=p.y,previousPosition={x:p.x,z:p.z};
    p.lean=this.input.lean;p.pitch=this.flowTest?0:this.input.pitch;p.smoothLean+=(p.lean-p.smoothLean)*(1-Math.exp(-dt/.18));
    this.impactCooldown=Math.max(0,this.impactCooldown-dt);
    const steering=(this.assist?.53:.55)*(this.balance.mode==='recovery'?.55:1);
    p.heading+=(p.lean*steering-p.heading)*(1-Math.exp(-10*dt));
    const bank=this.trickRoute.riding;
    const freeLateral=Math.sin(p.heading)*p.speed*.38+(p.airborne?this.jump.sideKick:s.flowX*.55-s.baseDx*.32);
    const lateral=bank?.type==='side'?bank.edgeSide*(4.8+Math.max(0,p.lean*bank.edgeSide)*1.5):
      p.airborne&&this.jump.takeoffRamp?.type==='side'?THREE.MathUtils.clamp(freeLateral,-7,7):freeLateral;
    p.sideVelocity+=(lateral-p.sideVelocity)*(1-Math.exp(-9*dt));
    // The moving wake transfers energy; it is not a static hill to climb.
    // Its full surface still controls board height, banking, knees and beer.
    const slope=p.airborne?0:s.baseDz*Math.cos(p.heading)+s.baseDx*p.sideVelocity/Math.max(1,p.speed);
    this.waveRide.step(dt);
    const wake=p.airborne?0:this.world.wakeQualityAt(p.x,p.z);
    const trim=p.pitch*(this.waveRide.caught||wake>.3?3.2:.6);
    const target=this.flowTest?this.flowTest.targetSpeed(slope):THREE.MathUtils.clamp((p.airborne?Math.max(this.assist?25:27,p.speed-.8):(this.assist?24:26)+this.waveRide.boost)+this.waveRide.momentum+this.jump.landingBoost-slope*9+trim-Math.abs(p.heading)*1.2+(p.airborne?0:s.flowZ*.4)+(wake>.3?5*wake:0)-(p.recovering>0?5:0),18,42);
    p.speed+=(target-p.speed)*(1-Math.exp(-1.65*dt));
    p.x=THREE.MathUtils.clamp(p.x+p.sideVelocity*dt,-9,9.2);p.z+=p.speed*Math.cos(p.heading)*dt;
    const next=this.trickRoute.stepRide(dt,previousPosition,this.wave.sample(p.x,p.z));this.jump.step(dt,next);
    const vertical=(p.y-previousY)/dt,verticalImpulse=THREE.MathUtils.clamp((vertical-p.verticalVelocity)*.16,-1.5,1.5);
    p.verticalVelocity+=(vertical-p.verticalVelocity)*(1-Math.exp(-10*dt));
    const autoKnees=THREE.MathUtils.clamp(.12+Math.abs(p.lean)*.4+Math.abs(next.dx)*.15+Math.abs(vertical)*.035+wake*.35+this.jump.charge*.5+(this.flowTest?.catchPulse||this.waveRide.catchPulse||0)*.55,.12,.85);
    p.crouch+=(autoKnees-p.crouch)*(1-Math.exp(-10*dt));
    this.balance.step(dt,next,wake,Math.abs(p.lean-p.smoothLean));
    this.onboarding.step(dt);
    if(p.fallen){this.trickRoute.step(dt);return;}
    if(!this.flowTest){this.chase.step(dt);this.chain.step(dt);this.combo=this.chain.multiplier;this.meta.step(dt);}
    if(!this.flowTest&&this.elapsed>4&&!this.runComic.shots.length&&!this.runComic.pending)this.runComic.capture('opening','ПОГНАЛИ!','ПАРИ ПРИНЯТО',5);
    this.trickCooldown=Math.max(0,this.trickCooldown-dt);
    this.carveClock=this.waveRide.caught&&Math.abs(p.lean)>.35?this.carveClock+dt:0;
    if(this.carveClock>.6&&this.trickCooldown===0){this.awardTrick('КАРВИНГ',100);this.trickCooldown=3;this.carveClock=0;}
    this.wakeClock=wake>.4&&p.balance<.7?this.wakeClock+dt:0;
    if(this.wakeClock>.45&&this.trickCooldown===0){this.awardTrick('НА ХВОСТЕ',180);this.trickCooldown=3;this.world.wakeRides++;this.juice.punch(2);}
    const waterImpact=verticalImpulse*(this.assist&&this.jump.landingPulse>0?.22:1);
    this.handBeer.step(dt,(p.heading-previousHeading)/dt,wake+waterImpact,THREE.MathUtils.clamp((p.lean-previousLean)/dt,-3,3));
    if(!this.flowTest){this.world.step(dt);this.updateRivals(dt);this.updateCaps(dt);}
    this.flowTest?.step?.(dt);this.trickRoute.step(dt);this.updateParticles(dt);
    this.updateLandingEffects(dt);
    if(!p.airborne)this.sprayAccumulator+=dt*(Math.abs(p.lean)*20+this.waveRide.boost*.55+wake*12);
    if(this.sprayAccumulator>1){const n=Math.floor(this.sprayAccumulator);this.emit(n,.6+Math.abs(p.lean));this.sprayAccumulator-=n;}
    this.trailClock+=dt;if(!p.airborne&&this.trailClock>.035){this.trailClock=0;this.trailPoints.unshift({x:p.x,z:p.z-.7});if(this.trailPoints.length>34)this.trailPoints.pop();}
    this.momentTime-=dt;if(this.momentTime<=0)document.getElementById('moment').classList.remove('visible');
    this.hintTime-=dt;if(this.hintTime<=0)document.getElementById('hint').classList.add('invisible');
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
      if(Math.abs(r.z-p.z)<2.2)r.nearest=Math.min(r.nearest,Math.abs(r.x-p.x));
      if(!r.passed&&p.z-r.z>3){r.passed=true;this.score+=100;if(!r.collided&&r.nearest<1.7)this.nearMiss('ВПРИТЫК!',90,r.x,r.z);}
      if(!r.collided&&!r.contactLocked&&Math.abs(r.z-p.z)<1.5&&Math.abs(r.x-p.x)<.85&&this.impactCooldown===0){
        r.collided=r.contactLocked=true;r.yieldTime=3.5;r.yieldSide=r.x>p.x?1:-1;
        this.spill(.08,r.name+': «Сорян!»');p.speed*=.8;this.impactCooldown=1.6;r.x+=r.yieldSide*1.5;r.z+=2;this.emit(16,1);
      }
      if(r.z<p.z-24){r.z=p.z+50+r.index*13;r.passed=r.chat=r.contactLocked=false;r.yieldTime=0;r.nearest=Infinity;}
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
  emit(count,strength,soft=false) {
    const p=this.p;
    for(let i=0;i<count;i++){
      const d=this.particles.find(item=>item.life<=0);if(!d)break;
      d.mesh.material.map=soft?this.sprayTexture:this.dropTexture;
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
    if(this.flowTest){this.flowTest.finish();return;}
    if(this.state==='finished')return;
    this.chain.bank();this.chase.end('finish');
    this.runComic.capture('finish','ДОВЁЗ!','БАР УЖЕ ТУТ',6,true);this.renderDirty=true;
    this.state='finished';this.audio.stopBGM();this.audio.stopJetski?.();this.input.reset();this.juice.reset();
    const pct=Math.floor(this.mug.level*100);
    const success=this.mug.level>=.30;
    this.deliveryBonus=success?Math.round(this.mug.level*1200):0;this.score+=this.deliveryBonus;
    if(this.audio){
      if(success){
        this.audio.playFanfareWin();
        this.audio.playCrowdCheer(true);
        this.audio.playCrowdApplause();
      }else{
        this.audio.playSlam();
      }
    }
    document.getElementById('result-title').textContent=success?'ПАРИ ВЫИГРАНО!':'ЕЩЁ ПОПРОБУЕМ?';
    document.getElementById('result-beer').textContent=pct+'%';
    document.getElementById('result-comment').textContent=success?'Кубок бухты твой.':'Довези хотя бы 30%.';
    this.companion.showResult(success);
    document.getElementById('result-score').textContent=Math.round(this.score);
    this.renderResultMeta(this.meta.finish());
    this.comics.reset();
    document.getElementById('result-screen').classList.remove('hidden');this.container.classList.remove('playing');
    document.getElementById('moment')?.classList.remove('visible');
    document.getElementById('chain-toast')?.classList.remove('visible');
    if(this.chain)this.chain.toastTime=0;
  }

  renderMissions(list,missions){
    list.replaceChildren(...missions.map(m=>{const li=document.createElement('li');li.className=m.done?'done':'';li.textContent=m.text;li.setAttribute('aria-label',m.text+(m.done?' — выполнено':' — не выполнено'));return li;}));
  }
  renderResultMeta(summary){
    const record=document.getElementById('result-record'),fmt=v=>v.toLocaleString('ru-RU');
    record.classList.toggle('is-record',summary.record||summary.dailyRecord);
    record.textContent=summary.challenge?(summary.beatChallenge?'ВЫЗОВ ПРИНЯТ — '+fmt(summary.challenge)+' ПОБИТ!':'ДО ВЫЗОВА ЕЩЁ '+fmt(summary.challenge-summary.score+1)):
      summary.record?'НОВЫЙ РЕКОРД!':summary.dailyRecord?'РЕКОРД ВОЛНЫ ДНЯ':'РЕКОРД '+fmt(summary.best);
    this.renderMissions(document.getElementById('result-missions'),summary.missions);
    document.getElementById('result-stars').textContent='★ '+summary.stars;
    this.renderMenuMeta();
  }
  renderCameraToggle(){
    const button=document.getElementById('camera-toggle'),live=this.juice.liveCamera&&!this.reducedMotion;
    button.textContent='Камера: '+(live?'живая':'спокойная');button.setAttribute('aria-pressed',String(live));button.disabled=this.reducedMotion;
  }
  updateSurfer(rig,x,z,y,lean,airY,crouch,poseFrame){
    const sample=rig===this.player&&this.trickRoute.riding?this.trickRoute.surface(this.trickRoute.riding,x,z):this.wave.sample(x,z);rig.group.position.set(-x,y,z);rig.group.quaternion.identity();
    if(rig===this.player)rig.group.scale.setScalar(1);
    const normal=rig===this.player&&this.p.airborne?new THREE.Vector3(0,1,0):new THREE.Vector3(sample.dx,1,-sample.dz).normalize();
    const surfaceRotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal);
    if(rig===this.player){
      const pitch=p=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),p);
      surfaceRotation.premultiply(pitch(this.p.airborne?-this.jump.boardPitch:-this.jump.landingPulse*.055));
    }
    rig.board.quaternion.copy(surfaceRotation)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI+(rig===this.player?this.p.heading:lean*.3)));
    rig.board.position.y=.12-(rig===this.player?this.jump.landingPulse*.07:0);rig.board.visible=true;
    rig.card.quaternion.copy(this.camera.quaternion);rig.card.rotateZ(-lean*.16+Math.atan(sample.dx)*.30);
    if(rig===this.player){
      rig.card.rotateZ(-this.balance.roll*.3);
      surfaceRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),this.balance.roll*.12));
      this.heroAnimator.fitDeck(surfaceRotation,this.p.heading);
      rig.card.scale.y=1-this.jump.landingPulse*.065;this.heroAnimator.placeOnBoard();
      if(this.p.airborne&&this.p.spin){
        const axis=this.jump.trickKind==='flip'?new THREE.Vector3(1,0,0):this.jump.trickKind==='cork'?new THREE.Vector3(.6,.18,.8).normalize():new THREE.Vector3(0,0,1);
        rig.group.quaternion.setFromAxisAngle(axis.applyQuaternion(this.camera.quaternion),this.p.spin);
        // Tuck during a somersault so the raised tail stays framed on a phone.
        if(this.jump.trickKind==='flip')rig.group.scale.setScalar(1-.16*Math.sin(Math.PI*this.jump.spinProgress));
        // Rotate the whole cutout around its centre, keeping the mug and board
        // attached and the silhouette inside the phone's narrow viewport.
        const pivot=new THREE.Vector3(0,1.4,0).applyQuaternion(this.camera.quaternion);
        rig.group.position.add(pivot.clone().sub(pivot.applyQuaternion(rig.group.quaternion).multiplyScalar(rig.group.scale.x)));
      }
      rig.group.visible=!this.p.fallen||this.balance.fallTime>.55;
      if(this.p.fallen){rig.group.position.y-=Math.max(0,1.25-this.balance.fallTime)*2;rig.card.rotateZ((1.25-this.balance.fallTime)*1.2);}
    }
    if(rig.castProfile)this.rivalCast.place(rig);
    else if(rig!==this.player&&poseFrame!==this.lastPoseFrame){
      const pose=Math.abs(lean)>.2?'turn':'norma';rig.card.material.map=this.textures['surfer_'+pose];rig.pose=pose;
      rig.card.scale.set(pose==='turn'&&lean<0?-1:1,1,1);
    }
    rig.shadow.position.set(-x,sample.height+.04,z-.15);rig.shadow.material.opacity=.25/(1+airY*.8);
    rig.shadow.rotation.z=Math.atan(sample.dx);rig.shadow.scale.set(rig.castProfile?.couple?1.6:1,1.5,1);
  }

  updateVisuals(dt) {
    const p=this.p,frame=Math.floor(this.time*12);
    this.updateCamera(dt);
    if(!this.animationReview)this.heroAnimator.update(this.state==='playing'?dt*this.comics.timeScale:0);
    this.updateSurfer(this.player,p.x,p.z,p.y,p.lean,p.airY,p.crouch,frame);
    this.rivals.forEach(r=>{
      const s=this.wave.sample(r.x,r.z);this.updateSurfer(r.rig,r.x,r.z,s.height+r.airY,r.lean,r.airY,0,frame);
      r.wake.forEach((drop,i)=>{const z=r.z-1-i*.65;const x=r.x+Math.sin(i*2+this.time*4)*.2;drop.position.set(-x,this.wave.height(x,z)+.06,z);drop.scale.set(.4+i*.05,.14+i*.02,1);drop.visible=r.airY<.3;});
    });
    this.meta.updateGhost(frame);
    this.lastPoseFrame=frame;
    this.chase.update(this.state==='playing'?dt:0);this.juice.update(dt);this.speedBlur.update(dt);this.trickRoute.update(this.state==='playing'?dt:0);
    this.handBeer.update();this.waveRide.update();
    this.companion.update();
    this.placeCoast();
    this.world.update();
    this.birds.forEach((b,i)=>{b.position.set((i===0?18:-19)+Math.sin(this.time*.6+i)*3,15+Math.sin(this.time*1.4+i),p.z+75+i*22);b.material.rotation=Math.sin(Math.floor(this.time*12)*.2+i)*.1;});
    this.caps.forEach(c=>{if(!c.collected)c.mesh.position.set(-c.x,this.wave.height(c.x,c.z)+.8+Math.sin(this.time*3+c.z)*.09,c.z);});
    this.finishSign.position.set(0,7,this.distance+2);this.finishPosts.forEach(({pole,x})=>pole.position.set(x,3,this.distance+2));
    // Only connect recorded points. Repeating the final point with an expanding
    // width creates a vertical paper fan on a curved wave face.
    this.trail.visible=this.trailPoints.length>1&&!p.fallen;
    this.trail.geometry.setDrawRange(0,Math.max(0,Math.min(33,this.trailPoints.length-1))*6);
    const pos=this.trail.geometry.attributes.position;
    for(let i=0;i<34;i++){
      const t=this.trailPoints[Math.min(i,this.trailPoints.length-1)]||{x:p.x,z:p.z};
      const spread=.22+i*.045;
      pos.setXYZ(i*2,-t.x-spread,this.wave.height(t.x+spread,t.z)+.035,t.z);
      pos.setXYZ(i*2+1,-t.x+spread,this.wave.height(t.x-spread,t.z)+.035,t.z);
    }
    pos.needsUpdate=true;
    this.flowTest?.update(dt);
    this.ribbon?.update();
    if(this.openingGuide){this.openingGuide.enabled=this.ribbon.enabled;this.openingGuide.update();}
  }
  updateCamera(dt,snap=false) {
    // Camera and route share game time, including a comic freeze or onboarding slow-down.
    dt*=Math.min(this.comics.timeScale,this.onboarding.timeScale);
    const p=this.p;
    // Reveal the pursuing crest from the start, rather than waiting until it is at the board.
    const chaseNear=this.wave.smooth((12-this.chase.gap)/9.5);
    const chaseTarget=this.chase.active&&!p.fallen&&!this.juice.calm?.78+.22*chaseNear:0;
    const chaseLiftTarget=chaseTarget*(-.65+3.2*chaseNear);
    if(snap){this.cameraChasePull=chaseTarget;this.cameraChaseLift=chaseLiftTarget;}
    else{
      const easing=1-Math.exp(-dt/(chaseTarget>this.cameraChasePull ? .75 : 1.15));
      this.cameraChasePull+=(chaseTarget-this.cameraChasePull)*easing;
      this.cameraChaseLift+=(chaseLiftTarget-this.cameraChaseLift)*easing;
    }
    const back=15+this.cameraChasePull*6.4;
    const ground=this.wave.height(p.x,p.z,this.time,false);
    // Release the takeoff crest during flight so the camera can descend before
    // touchdown, instead of holding a high-water offset until the landing frame.
    const release=this.wave.smooth((this.jump.airTime-.25)/.75);
    const base=p.airborne?THREE.MathUtils.lerp(p.takeoffHeight??ground,ground,release):ground;
    // Begin low to show the distant crest, then lift to keep the rider clear of the approaching wall.
    const targetY=7.5+base*.90+(p.airborne?Math.max(0,p.y-base)*.32:0)+this.cameraChaseLift;
    if(snap){
      this.camera.position.set(-p.x*.94,targetY,p.z-back);
      this.cameraLateralSpeed=this.cameraVerticalSpeed=0;this.cameraForwardSpeed=p.speed*Math.cos(p.heading);
    }
    else{
      const damping=1-Math.exp(-dt/.20);
      const lateral=THREE.MathUtils.clamp((-p.x*.94-p.sideVelocity*.22-this.camera.position.x)/.42,-7.5,7.5);
      const vertical=THREE.MathUtils.clamp((targetY-this.camera.position.y)/.62,-2.6,2.6);
      this.cameraLateralSpeed+=(lateral-this.cameraLateralSpeed)*damping;
      this.cameraVerticalSpeed+=(vertical-this.cameraVerticalSpeed)*damping;
      this.camera.position.x+=this.cameraLateralSpeed*dt;
      this.camera.position.y+=this.cameraVerticalSpeed*dt;
      // Speed prediction removes steady follow lag without snapping to route progress.
      this.cameraForwardSpeed+=(p.speed*Math.cos(p.heading)-this.cameraForwardSpeed)*(1-Math.exp(-dt/.35));
      const forward=p.z-back+this.cameraForwardSpeed*.28;
      this.camera.position.z+=(forward-this.camera.position.z)*(1-Math.exp(-dt/.28));
    }
    // Fixed pitch and yaw; a small carve roll and FOV kick come from ArcadeJuice and return to zero in the air.
    this.camera.up.set(0,1,0);
    this.camera.lookAt(this.camera.position.clone().add(new THREE.Vector3(0,-9,30)));
    this.camera.updateMatrixWorld();
    this.juice.updateCamera(snap?0:dt,this.camera);
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
    const routeTicket=document.querySelector('.route-ticket');routeTicket.setAttribute('aria-valuemax',this.distance);routeTicket.setAttribute('aria-valuenow',Math.min(this.distance,Math.round(this.p.z)));
    routeTicket.setAttribute('aria-valuetext','До бара '+Math.max(0,Math.ceil(this.distance-this.p.z))+' метров');
    const earned=Math.min(3,this.waveRide.totalCaught);document.getElementById('collection-value').textContent=earned+' / 3';
    document.querySelectorAll('.wave-cap').forEach((cap,i)=>{cap.classList.toggle('earned',i<earned);cap.setAttribute('aria-label',i<earned?'Крышка волны получена':'Крышка волны ещё не получена');});
    document.getElementById('weight-dot').style.left=(50+this.p.pitch*40)+'%';
    document.getElementById('weight-label').textContent=this.p.pitch>.2?'ВЕС НА НОС':this.p.pitch<-.2?'ВЕС НА ХВОСТ':'ВЕС ПО ЦЕНТРУ';
    document.getElementById('balance-fill').style.width=Math.min(100,this.p.balance*100)+'%';
    document.getElementById('balance-label').textContent=this.p.recovering>0?'ВЫРУЛИВАЙ':this.p.balance>.6?(Math.abs(this.p.pitch)>.45?'ВЕС К ЦЕНТРУ':'ПЛАВНЕЕ КУРС'):this.p.balance>.3?'РАСТЁТ':'НИЗКИЙ';
    const ride=this.waveRide;document.getElementById('wave-fill').style.width=ride.charge*100+'%';
    const guidance=ride.guidance();document.querySelector('.wave-ticket').dataset.phase=guidance.phase;
    document.getElementById('wave-label').textContent=guidance.label;document.getElementById('wave-number').textContent=guidance.number;
    document.getElementById('wave-status').textContent=guidance.status;document.getElementById('wave-remaining').textContent=guidance.remaining;
    this.updateCoach(guidance);

    this.container.classList.toggle('wave-caught',ride.caught);this.container.classList.toggle('unstable',this.p.balance>.6);
    const threat=this.world.threat(),danger=threat?THREE.MathUtils.clamp(1-Math.max(0,threat.gap)/36,0,1):0;
    const fin=document.getElementById('shark-threat');fin.classList.toggle('visible',!!threat);fin.classList.toggle('close',danger>.7);fin.dataset.phase=threat?.shark.attackPhase||'chase';fin.querySelector('b').style.transform='scaleX('+danger+')';
    document.getElementById('spill-flash').style.opacity=this.spillFlash;this.drawBeer();
    this.balance.updateHUD();this.chain.render();
    const mult=document.getElementById('beer-mult'),label='×'+this.mug.multiplier;if(mult.textContent!==label){mult.textContent=label;mult.dataset.level=this.mug.multiplier;}mult.title='Бонус доставки '+label;mult.setAttribute('aria-label','Бонус доставки '+label);
    document.querySelector('.score-ticket').classList.toggle('beaten',this.meta.challenge>0&&this.score>this.meta.challenge);
  }
  updateCoach(guidance){
    const p=this.p,s=this.wave.sample(p.x,p.z),threat=this.world.threat(),lesson=this.onboarding.cue();let title='',line='',id='';
    const obstacle=this.world.hazards.filter(h=>!h.hit&&!h.done&&h.type!=='shark'&&h.z-p.z>3&&h.z-p.z<35&&Math.abs(h.x-p.x)<2.2).sort((a,b)=>a.z-b.z)[0];
    if(p.fallen){this.onboarding.highlight='';}
    else if(this.balance.mode==='recovery'){id='balance';title=this.balance.recoveryAge<1.2?this.balance.reason:lesson?.id==='balance'?lesson.title:this.assist?'ОТПУСТИ ПОВОРОТ':'ПОЙМАЙ БАЛАНС';line=lesson?.id==='balance'?lesson.line:this.assist?'Отпусти поворот — доска выровняется.':'Против завала. В центре — отпусти.';}
    else if(p.airborne){
      if(this.jump.canSpin&&(this.jump.tricks===0||this.jump.canSpecial&&this.jump.specialTricks===0)){
        id='spin';title=this.jump.canSpecial?'ЕЩЁ РАЗ → ПЕРЕВОРОТ':this.jump.takeoffRamp?.type==='side'?'ЕЩЁ РАЗ → КОСОЙ 360°':'ЕЩЁ РАЗ → 360°';
        line=this.input.mode==='keys'&&!matchMedia('(pointer:coarse)').matches?'Нажми пробел в воздухе.':'Нажми эту же кнопку в воздухе.';this.onboarding.highlight='jump';
      }else if(this.jump.spinStarted&&this.jump.tricks===0){id='landing';title=this.jump.spinCompleted?'ПРИЗЕМЛИСЬ РОВНО':this.jump.trickKind==='flip'?'ПЕРЕВОРОТ':'360°';line='Отпусти поворот и перенос веса.';}
      else if(!lesson&&this.jump.airTime<.16&&this.jump.tricks===0){id='spin';title='ПРЫЖОК → ТРЮК';line='После отрыва нажми ещё раз.';}
      else {id='landing';title=this.assist?'':lesson?.title||'';line=this.assist?'':lesson?.line||'';}
    }
    else if(this.chase.critical){id='chase';title='ПЕНА ВПЛОТНУЮ!';line=this.input.mode==='keys'&&!matchMedia('(pointer:coarse)').matches?'Пробел — перепрыгни гребень.':'Нажми прыжок — перепрыгни гребень.';this.onboarding.highlight='jump';}
    else if(threat){id='danger';title=threat.shark.attackPhase==='windup'?'АКУЛА ГОТОВИТ БРОСОК!':threat.shark.attackPhase==='lunge'?'БРОСОК! УЙДИ С ЛИНИИ':'АКУЛА НА ХВОСТЕ!';line='Уйди с её линии в сторону.';this.onboarding.highlight='';}
    else if(lesson?.id==='steer'){({title,line,id}=lesson);}
    else if(obstacle){id='danger';const left=obstacle.type==='buoy'?this.trickRoute.routePoint(obstacle.z)<obstacle.x:p.x<obstacle.x;title=(obstacle.type==='buoy'?'БУЙ ВПЕРЕДИ':'АКВАБАЙК РЯДОМ')+' '+(left?'←':'→');line='Обойди или перепрыгни.';this.onboarding.highlight='';}
    else if(!this.flowTest&&p.z>175&&p.z<212){id='danger';title='← ВЫЛЕТ · ОБЪЕЗД →';line='Трамплин подбрасывает сам.';}
    else if(lesson){({title,line,id}=lesson);}
    else if(this.jump.rampTricks===0){
      const ramp=this.trickRoute.lines.find(l=>!l.done&&l.z-p.z>0&&l.z-p.z<38);
      if(ramp){id='ramp';title=ramp.type==='side'?'БОРТ У КРАЯ':'ТРАМПЛИН ВПЕРЕДИ';line=ramp.type==='side'?'Заедь сбоку с воды — вылетишь к середине.':'Держи пунктир — доска взлетит сама.';}
    }
    // Once learned, the wave and the highlighted jump control carry the cue.
    if(!lesson&&['balance','landing','danger'].includes(id)&&!(id==='landing'&&this.jump.spinStarted&&this.jump.tricks===0))line='';
    const urgent=['balance','landing','danger','spin','chase'].includes(id),coach=document.getElementById('ride-coach');coach.dataset.lesson=id;
    coach.classList.toggle('hidden',!title||this.comics.pending||this.comics.active||(this.momentTime>0&&!urgent));
    document.getElementById('moment').classList.toggle('coach-muted',urgent&&!coach.classList.contains('hidden'));
    if(document.getElementById('coach-title').textContent!==title)document.getElementById('coach-title').textContent=title;
    if(document.getElementById('coach-line').textContent!==line)document.getElementById('coach-line').textContent=line;
    if(coach.classList.contains('hidden')&&!(p.airborne&&this.jump.canSpin&&this.jump.tricks===0))this.onboarding.highlight='';this.onboarding.renderHighlight();
  }
  resize() {const {width,height}=this.container.getBoundingClientRect();this.renderDirty=true;this.container.style.setProperty('--panel-size',Math.max(width,height)+'px');this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  animate(now) {
    requestAnimationFrame(this.animate);
    const realDt=this.lastTime?Math.min((now-this.lastTime)/1000,.25):1/60,dt=Math.min(realDt,.05);this.lastTime=now;
    if(this.state!=='playing'&&!this.renderDirty)return;
    this.renderDirty=false;
    if(this.state==='playing'){
      this.comics.update(realDt);
      if(!this.juice.consumeStop(realDt))this.accumulator+=dt*Math.min(this.comics.timeScale,this.onboarding.timeScale);
      while(this.accumulator>=1/120&&this.state==='playing'){this.step(1/120);this.accumulator-=1/120;if(this.comics.pending){this.accumulator=0;break;}}
      const foamPressure=this.chase.active?.25+.75*this.wave.smooth((12-this.chase.gap)/10.9):0;
      this.audio.updateWave(this.p.speed/32,false,foamPressure);
      this.audio.updateAmbient?.(realDt);
      if(!this.flowTest)this.rivalCast.music(realDt);
      const wake=this.p.airborne?0:this.world.wakeQualityAt(this.p.x,this.p.z);
      const jetski=this.world.hazards.find(h=>h.type==='jetski'&&h.activeAt!==null&&Math.abs(h.z-this.p.z)<48);
      if(jetski){
        const dist=Math.hypot(jetski.x-this.p.x,jetski.z-this.p.z);
        const lateral=(jetski.x-this.p.x)/8;
        this.audio.updateJetski(dist,wake,lateral);
      }else{
        this.audio.updateJetski(999,0,0);
      }
    }
    this.wave.update(this.p.z,this.time);this.updateVisuals(dt);this.updateHUD();
    this.juice.beforeRender(this.camera,realDt);this.speedBlur.render();this.juice.afterRender(this.camera);
    this.comics.capture();this.runComic.flush();
  }
}

PaperSurfGame.trickWords={'КАРВИНГ':'ШШУХ!','КАТБЭК':'ВЖИК!','НА ХВОСТЕ':'ВРУМ!','НА ГРЕБНЕ':'УАУ!','ПЕРЕХОД':'ВЖУХ!','ОТОРВАЛСЯ!':'ФУХ!','НАД АКУЛОЙ!':'ХАП!','ВЫРУЛИЛ':'ФУХ!'};

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
