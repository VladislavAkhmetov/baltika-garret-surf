/* Close scenery, readable pickup trajectories and a short earned rush. */
class SurfRush {
  constructor(game){
    this.game=game;this.lines=[];this.scenery=[];
    this.padTexture=this.makePadTexture();this.activePadTexture=this.makePadTexture(true);
    this.accelerators=[861,964,1084,1224,1324].map((z,i)=>this.makeAccelerator(z,i));
    this.meter=document.createElement('div');this.meter.id='rush-meter';
    this.meter.innerHTML='<strong>КУРАЖ</strong><span><i></i><i></i><i></i></span><small>0 крышек</small>';
    this.meter.setAttribute('aria-label','Кураж: три разных чистых манёвра подряд');game.container.append(this.meter);
    this.splashLayer=document.createElement('div');this.splashLayer.id='edge-spray';this.splashLayer.setAttribute('aria-hidden','true');
    for(let i=0;i<12;i++){const drop=document.createElement('i');drop.style.setProperty('--i',i);drop.style.setProperty('--d',i%3);this.splashLayer.append(drop);}game.container.append(this.splashLayer);
    this.makeScenery();this.reset();
  }
  makeScenery(){
    const g=this.game;
    this.rockSprites=[];
      // These are shore boundaries outside the playable strip, never invisible obstacles.
      const rocks=[[-21,218,25,19],[23,266,25,22],[-19,307,19,16],[21,364,22,18],
        [20,443,25,20],[-21,496,23,19],[22,551,26,22],[-22,577,19,15],
        [-24,623,27,22],[22,640,24,20],[-21,700,22,18],[-23,747,22,18],
        [-24,795,26,21],[21,840,25,21],[-19,924,22,18],[23,987,24,20],
        [-21,1044,24,19],[23,1147,27,22],[-19,1209,22,18],[21,1282,24,19],[-20,1338,21,17]];
      for(const [x,z,width,height] of rocks){
        const mesh=g.sprite(new THREE.Texture(),width,height);mesh.center.set(.5,0);mesh.position.set(-x,-.45,z);mesh.material.fog=true;
        this.rockSprites.push(mesh);
        this.scenery.push({mesh,x,z,halfWidth:width/2,halfDepth:width*.18,kind:'shore-rock'});
      }
    const wood=g.trickRoute.makeInk(0x996b45),edge=g.trickRoute.edge;
    const pier=new THREE.Group();g.scene.add(pier);
    const deck=new THREE.Mesh(new THREE.BoxGeometry(6,.45,86),wood);deck.position.set(-15,3.5,710);pier.add(deck);
    for(let i=0;i<10;i++){
      const z=671+i*8.5;
      for(const x of [-12.4,-17.6]){
        const post=new THREE.Mesh(new THREE.CylinderGeometry(.19,.24,6,6),wood);post.position.set(x,1,z);pier.add(post);
        const cap=new THREE.Mesh(new THREE.BoxGeometry(.52,.18,.52),edge);cap.position.set(x,4,z);pier.add(cap);
      }
      const seam=new THREE.Mesh(new THREE.BoxGeometry(6,.035,.07),g.trickRoute.dark);seam.position.set(-15,3.75,z);pier.add(seam);
    }
    for(let i=0;i<7;i++){
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(.8,1.1),g.trickRoute.makeInk(i%2?0xf3c24e:0xde7150));
      flag.position.set(-12.4,5.6,680+i*10);flag.rotation.y=Math.PI/2;pier.add(flag);
    }
    this.scenery.push({mesh:pier,x:15,z:710,halfWidth:3.3,halfDepth:44,kind:'pier',extent:48});
  }
  makePadTexture(active=false){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
    const c=canvas.getContext('2d');
    c.fillStyle='#fff0c8';c.beginPath();c.moveTo(15,8);c.lineTo(240,0);c.lineTo(250,492);c.lineTo(8,512);c.closePath();c.fill();
    c.fillStyle=active?'#75e2ad':'#ffcd41';c.fillRect(24,18,208,476);
    c.strokeStyle=active?'#28785c':'#b55a32';c.lineWidth=6;c.strokeRect(28,22,200,468);
    for(const y of [96,244,392]){
      c.beginPath();c.moveTo(62,y-25);c.lineTo(128,y+32);c.lineTo(194,y-25);
      c.lineJoin='miter';c.strokeStyle=active?'#28785c':'#dc6747';c.lineWidth=34;c.stroke();
      c.strokeStyle=active?'#ffffff':'#fff4d2';c.lineWidth=15;c.stroke();
    }
    c.fillStyle='rgba(85,63,36,.14)';
    for(let i=0;i<480;i++)c.fillRect((i*73)%256,(i*137)%512,1+i%2,2);
    const texture=new THREE.CanvasTexture(canvas);texture.anisotropy=Math.min(4,this.game.renderer.capabilities.getMaxAnisotropy());return texture;
  }
  makeAccelerator(z,index){
    const g=this.game,width=3.6,length=10;
    const geometry=new THREE.PlaneGeometry(width,length,4,12);geometry.rotateX(-Math.PI/2);
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const material=new THREE.MeshBasicMaterial({map:this.padTexture,transparent:true,alphaTest:.08,depthWrite:false,side:THREE.DoubleSide,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=1;mesh.visible=false;g.scene.add(mesh);
    return {z,index,width,length,mesh,strength:index===4?9.6:12,duration:index===4?1.1:1.65};
  }
  reset(){
    const g=this.game;this.enabled=!g.flowTest;this.moves=new Set();this.window=0;this.active=0;this.activations=0;this.boost=0;this.splashAmount=0;this.lastMove=-100;
    g.container.classList.toggle('rush-mode',this.enabled);g.container.classList.remove('in-rush');
    this.padBoost=this.padTime=this.padStrength=this.padHits=0;this.padEvents=[];
    for(const pad of this.accelerators){pad.x=g.trickRoute.routePoint(pad.z);pad.taken=pad.done=false;pad.flash=0;pad.mesh.visible=false;pad.mesh.material.color.set(0xffffff);pad.mesh.material.map=this.padTexture;}
    for(const c of g.caps){g.scene.remove(c.mesh);c.mesh.material.dispose();}
    g.caps=[];this.lines=[];
    if(this.enabled){
      for(const start of [145,286,408,565,645,805,902,1090]){
        const line={id:'water-'+start,caps:[],air:false};this.lines.push(line);
        for(let i=0;i<5;i++){
          const z=start+i*6,x=g.trickRoute.routePoint(z);
          // Keep surface pickups clear of the faces of solid ramps.
          if(z>=274&&z<=341||g.trickRoute.lines.some(r=>{const p=g.trickRoute.local(r,x,z);return !r.disabled&&p.t>-.1&&p.t<1.1&&Math.abs(p.across)<r.width/2+.8;}))continue;
          this.addCap(line,x,z,1.15,i===4);
        }
      }
      for(const ramp of g.trickRoute.lines.filter(r=>r.type==='straight'&&!r.disabled)){
        const line={id:'air-'+ramp.id,ramp,caps:[],air:true,locked:false};this.lines.push(line);
        for(let i=0;i<6;i++)this.addCap(line,ramp.x,ramp.exit.z+6+i*6,2,i===3);
      }
    }
    g.setpiece?.addCaps(this);
    g.beats?.addCaps(this);
    this.updateHUD();
  }
  addCap(line,x,z,height,bonus){
    const mesh=this.game.sprite(this.game.textures[bonus?'cap_palm':'cap_fish'],bonus?1.1:.86,bonus?1.1:.86);
    mesh.material.depthTest=true;mesh.renderOrder=0;
    const cap={line,x,z,height,bonus,mesh,collected:false,y:0};line.caps.push(cap);this.game.caps.push(cap);
  }
  lockArc(line){
    const g=this.game,r=line.ramp,speed=THREE.MathUtils.clamp(g.p.speed,28,42);
    const forecast=g.time+Math.max(0,r.exit.z-g.p.z)/speed;
    const base=g.wave.height(r.exit.x,r.exit.z,forecast)+.12+r.height;
    const velocity=THREE.MathUtils.clamp(12.4+(speed-24)*.15,10.8,15);
    line.caps.forEach((c,i)=>{const t=.14+i*.17;c.x=r.exit.x;c.z=r.exit.z+speed*t;c.y=base+velocity*t-10*t*t+1.1;});
    line.locked=true;
  }
  reward(name){
    if(!this.enabled||this.active>0)return;
    const family=['360°','КОСОЙ 360°','ПЕРЕВОРОТ!','ПРЯМОЙ ВЫЛЕТ','БОКОВОЙ ПЕРЕЛЁТ','МЯГКАЯ ПОСАДКА'].includes(name)?'air':
      name==='ЧИСТЫЙ ОБГОН'?'pass':['ВПРИТЫК!','НАД ПРЕДМЕТОМ!','НАД БУЕМ!','РАЗОШЛИСЬ','НАД АКУЛОЙ!','УЗКИЙ ПРОХОД','НАД КАНАТОМ!'].includes(name)?'dodge':
      ['КАТБЭК','КАРВИНГ','НА ХВОСТЕ','СЛАЛОМ'].includes(name)?'carve':['ПОЙМАЛ ВОЛНУ','ПОПУТНОЕ ТЕЧЕНИЕ'].includes(name)?'wave':null;
    if(!family||this.moves.has(family)||this.game.time-this.lastMove<.35)return;
    this.moves.add(family);this.window=6.5;this.lastMove=this.game.time;
    if(this.moves.size===3){
      this.active=3.6;this.activations++;this.moves.clear();this.window=0;
      this.game.juice.punch(3);this.game.juice.buzz([18,30,28]);this.game.audio.playTrickTriumph(1);
      this.splash(1);this.game.container.classList.add('in-rush');
    }
  }
  breakStreak(){this.moves.clear();this.window=this.active=this.padTime=0;this.boost*=.3;this.padBoost*=.3;this.game.speedBlur?.cancelBurst();this.game.audio?.stopAccelerator();this.game.container.classList.remove('in-rush');}
  splash(amount){if(!this.game.reducedMotion)this.splashAmount=Math.max(this.splashAmount,amount);}
  step(dt){
    if(!this.enabled)return;
    this.window=Math.max(0,this.window-dt);if(!this.window)this.moves.clear();
    this.active=Math.max(0,this.active-dt);
    this.boost+=((this.active>0?7:0)-this.boost)*(1-Math.exp(-dt*5));
    this.padTime=Math.max(0,this.padTime-dt);
    this.padBoost+=((this.padTime>0&&!this.game.p.fallen&&this.game.p.recovering===0?this.padStrength:0)-this.padBoost)*(1-Math.exp(-dt*8));
    this.splashAmount=Math.max(0,this.splashAmount-dt*2.4);
    for(const pad of this.accelerators)pad.flash=Math.max(0,pad.flash-dt);
    this.game.container.classList.toggle('in-rush',this.active>0);
    for(const line of this.lines)if(line.air&&!line.locked&&line.ramp.z-this.game.p.z<85)this.lockArc(line);
  }
  collectAccelerators(){
    const g=this.game,p=g.p;if(!this.enabled||g.state!=='playing')return;
    for(const pad of this.accelerators){
      if(pad.done)continue;
      if(p.z>pad.z+pad.length/2){pad.done=true;continue;}
      if(Math.abs(p.z-pad.z)>pad.length/2||p.airborne||p.fallen||p.recovering>0||
        Math.abs(p.x-g.trickRoute.routePoint(p.z))>pad.width/2-.15||Math.abs(p.y-g.wave.height(p.x,p.z))>.8)continue;
      pad.taken=pad.done=true;this.padHits++;this.padTime=Math.max(this.padTime,pad.duration);this.padStrength=pad.strength;
      // A small instant kick makes entering the arrows felt before the sustained pull.
      p.speed=Math.min(46,p.speed+3);this.padBoost=Math.max(this.padBoost,pad.strength*.7);
      this.padEvents.push({index:pad.index,z:p.z,time:g.time,speed:p.speed});
      pad.flash=.8;pad.mesh.material.map=this.activePadTexture;
      g.speedBlur?.triggerBurst();g.audio.playAccelerator(pad.strength);g.juice.punch(2.8);g.juice.buzz(20);this.splash(.85);
      g.emitRoosterTail?.(28);g.emit(16,1.2,true);
      g.juice.pop('ВЖУХ!',p.x,p.y+1.9,p.z,'pocket');
      g.moment('РАЗГОН!','',false,.7);
    }
  }
  cue(){
    if(!this.enabled)return null;
    const p=this.game.p,pad=this.accelerators.find(pad=>!pad.done&&pad.z-p.z>4&&pad.z-p.z<38);
    return pad?{id:'route',title:'ЗОЛОТАЯ ДОРОЖКА · РАЗГОН',line:'Заедь на стрелки.'}:null;
  }
  collect(){
    const g=this.game,p=g.p;
    for(const c of g.caps){
      if(c.collected)continue;
      const y=c.line.air?c.y:g.wave.height(c.x,c.z)+c.height;
      if(Math.abs(c.z-p.z)<1.8&&Math.abs(c.x-p.x)<1.25&&Math.abs(y-(p.y+1.1))<1.55){
        c.collected=true;c.mesh.visible=false;g.collected++;g.score+=(c.bonus?100:50)*g.mug.multiplier;g.audio.playFruit();
        if(c.line.caps.every(item=>item.collected)&&!c.line.complete){c.line.complete=true;g.awardTrick('ЛИНИЯ КРЫШЕК',c.line.air?240:120,true);}
      }
    }
  }
  update(){
    const g=this.game,p=g.p;
    for(const item of this.scenery)item.mesh.visible=this.enabled&&item.z+(item.extent||0)>p.z-22&&item.z-(item.extent||0)<p.z+165;
    for(const pad of this.accelerators){
      pad.mesh.visible=this.enabled&&['playing','paused'].includes(g.state)&&pad.z-p.z>-pad.length&&pad.z-p.z<110;
      if(!pad.mesh.visible)continue;
      const pos=pad.mesh.geometry.attributes.position;
      for(let row=0;row<=12;row++)for(let col=0;col<=4;col++){
        const z=pad.z+(row/12-.5)*pad.length,x=g.trickRoute.routePoint(z)+(col/4-.5)*pad.width;
        pos.setXYZ(row*5+col,-x,g.wave.height(x,z)+.095,z);
      }
      pos.needsUpdate=true;
      const flash=pad.flash/.8;
      pad.mesh.material.color.setRGB(1,1,1);
      if(pad.taken&&!g.reducedMotion)pad.mesh.material.color.setRGB(1+flash*.35,1+flash*.35,1+flash*.35);
    }
    for(const c of g.caps){
      c.mesh.visible=!c.collected&&c.z>p.z-3&&c.z<p.z+100&&(!c.line.air||c.line.locked);
      if(!c.mesh.visible)continue;
      const y=c.line.air?c.y:g.wave.height(c.x,c.z)+c.height;
      c.mesh.position.set(-c.x,y+Math.sin(g.time*3+c.z)*.06,c.z);c.mesh.material.rotation=Math.sin(g.time*2+c.z)*.12;
    }
    this.splashLayer.style.setProperty('--splash',Math.min(1,this.splashAmount).toFixed(3));
  }
  updateHUD(){
    const g=this.game;if(!this.enabled)return;
    this.meter.querySelector('strong').textContent=this.active>0?'КУРАЖ!':'КУРАЖ';
    this.meter.querySelectorAll('i').forEach((el,i)=>el.classList.toggle('lit',this.active>0||i<this.moves.size));
    this.meter.querySelector('small').textContent=g.collected+' крышек';
    this.meter.style.setProperty('--rush-left',this.active/3.6);
    const jump=document.getElementById('jump-button');if(jump){jump.style.setProperty('--courage',this.active>0?1:Math.min(3,this.moves.size)/3);jump.classList.toggle('courage-full',this.active>0);}
    // One verbal signal owns the screen. The score and controls stay readable.
    const moment=document.getElementById('moment'),coach=document.getElementById('ride-coach'),toast=document.getElementById('chain-toast'),hint=document.getElementById('hint');
    const hasMoment=g.momentTime>0&&moment.classList.contains('visible'),hasCoach=!coach.classList.contains('hidden');
    const danger=hasCoach&&['danger','chase','balance'].includes(coach.dataset.lesson);
    const winner=hasMoment&&moment.classList.contains('bad')?'moment':danger?'ride-coach':hasMoment?'moment':toast.classList.contains('visible')?'chain-toast':hasCoach?'ride-coach':g.hintTime>0?'hint':'';
    g.container.dataset.signal=winner;moment.classList.remove('coach-muted');
    g.container.classList.toggle('impact-message',hasMoment&&moment.classList.contains('bad'));
    for(const el of [moment,coach,toast,hint])el.style.visibility=el.id===winner?'visible':'hidden';
  }
  load() {
    if (this._readyPromise) return this._readyPromise;
    const g=this.game,loader=new THREE.TextureLoader();
    this._readyPromise=new Promise((resolve,reject)=>loader.load('assets/comics/sea-stack-v10.webp',texture=>{
      texture.minFilter=THREE.LinearMipmapLinearFilter;
      g.setpiece?.setRockTexture(texture);
      for(const mesh of this.rockSprites){
        mesh.material.map=texture;
        mesh.material.needsUpdate=true;
      }
      g.renderDirty=true;resolve();
    },undefined,()=>reject(Error('Не удалось загрузить скалы'))));
    this._readyPromise.catch(()=>{});
    return this._readyPromise;
  }
  get ready() {
    return this._readyOverride || this.load();
  }
  set ready(v) {
    this._readyOverride = v;
  }
}
window.SurfRush=SurfRush;
