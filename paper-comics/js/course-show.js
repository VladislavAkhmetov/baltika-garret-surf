/* Authored scenery stays in world space. Gameplay rewards run on simulation time;
   the delivery epilogue runs separately after the final score has been settled. */
class CourseShow {
  constructor(game){
    this.game=game;this.props=[];this.materials=new Map();this.flags=[];
    this.boxGeometry=new THREE.BoxGeometry(1,1,1);
    this.sections=[
      {from:0,to:145,id:'beach',name:'ПОЙМАЙ РИТМ',sky:0x479db0,fog:0xc7d7c9,deep:0x086578,clear:0x42b9ad},
      {from:145,to:264,id:'promenade',name:'НАБЕРЕЖНАЯ',sky:0x66aaa9,fog:0xded9bc,deep:0x12687a,clear:0x54b8a7},
      {from:264,to:343,id:'gates',name:'КАМЕННЫЕ ВОРОТА',sky:0x527d91,fog:0xa6bcc0,deep:0x164e67,clear:0x399d9d},
      {from:343,to:880,id:'boris',name:'ПО СЛЕДУ БОРИСА',sky:0x4199b1,fog:0xb6d5cc,deep:0x075d7c,clear:0x3bbbb0},
      {from:880,to:1168,id:'swell',name:'БОЛЬШАЯ ВОДА',sky:0x426b92,fog:0xa5bdcc,deep:0x123f6d,clear:0x329da9},
      {from:1168,to:1360,id:'home',name:'ДОСТАВКА В GARRET',sky:0x91aaa7,fog:0xf0d5a6,deep:0x286b78,clear:0x79bba8}
    ];
    this.colors={sky:new THREE.Color(),fog:new THREE.Color(),deep:new THREE.Color(),clear:new THREE.Color()};
    this.colorA=new THREE.Color();this.colorB=new THREE.Color();
    this.assets=[];this.cutoutTasks=[];this.textureCache=new Map();this.makePromenade();this.makeGates();this.makeHarbor();this.makeBar();
    this.mount();this.reset();
  }
  load() {
    if (this._readyPromise) return this._readyPromise;
    const loader = new THREE.TextureLoader();
    const promises = (this.cutoutTasks || []).map(task => {
      const file = task.file;
      if (!this.textureCache.has(file)) {
        this.textureCache.set(file, new Promise((resolve, reject) => {
          loader.load('assets/comics/' + file.replace(/\.png$/, '.webp'), resolve, undefined, () => {
            loader.load('assets/comics/' + file, resolve, undefined, () => reject(Error('Не удалось загрузить декорацию ' + file)));
          });
        }));
      }
      return this.textureCache.get(file).then(texture => {
        task.material.map = texture;
        task.material.needsUpdate = true;
        this.game.renderDirty = true;
      });
    });
    this._readyPromise = Promise.all(promises);
    this._readyPromise.catch(() => {});
    return this._readyPromise;
  }
  get ready() {
    return this._readyOverride || this.load();
  }
  set ready(v) {
    this._readyOverride = v;
  }
  ink(color){if(!this.materials.has(color))this.materials.set(color,this.game.trickRoute.makeInk(color));return this.materials.get(color);}
  box(parent,x,y,z,w,h,d,color){
    const mesh=new THREE.Mesh(this.boxGeometry,this.ink(color));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
  }
  group(z,extent=25){const mesh=new THREE.Group();mesh.position.z=z;this.game.scene.add(mesh);this.props.push({mesh,z,extent});return mesh;}
  sign(parent,text,x,y,z,w=7,color='#164858'){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,w*.22),new THREE.MeshBasicMaterial({map:this.game.label(text,color,768,144),side:THREE.DoubleSide}));
    mesh.position.set(x,y,z);mesh.rotation.y=Math.PI;parent.add(mesh);return mesh;
  }
  cutout(file,parent,x,y,z,width,height){
    const material=new THREE.SpriteMaterial({transparent:true,alphaTest:.12,depthWrite:false,fog:true});
    const mesh=new THREE.Sprite(material);mesh.center.set(.5,0);mesh.position.set(x,y,z);mesh.scale.set(width,height,1);parent.add(mesh);
    this.cutoutTasks.push({file, material});
    return mesh;
  }
  pennants(parent,from,to,y,z,count=12){
    const positions=[];
    for(let i=0;i<=count;i++){
      const t=i/count;positions.push(THREE.MathUtils.lerp(from,to,t),y-Math.sin(t*Math.PI)*1.1,z);
      if(i===count)continue;
      const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(.85,-.08);shape.lineTo(.43,-1);shape.closePath();
      const flag=new THREE.Mesh(new THREE.ShapeGeometry(shape),this.ink([0xe8815d,0xf7ca4f,0x408e87][i%3]));
      flag.position.set(THREE.MathUtils.lerp(from,to,t),y-Math.sin(t*Math.PI)*1.1,z);parent.add(flag);this.flags.push(flag);
    }
    parent.add(new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)),new THREE.LineBasicMaterial({color:0xf7e8c5})));
  }
  person(parent,x,y,z,color,scale=1){
    const group=new THREE.Group();group.position.set(x,y,z);group.scale.setScalar(scale);parent.add(group);
    this.box(group,0,.85,0,.55,.95,.24,color);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.25,7,5),this.ink(0xe2ae7b));head.position.y=1.57;group.add(head);
    for(const side of [-1,1]){
      this.box(group,side*.16,.2,0,.16,.65,.2,0x254552);
      const arm=this.box(group,side*.39,1.08,0,.15,.64,.17,0xe2ae7b);arm.rotation.z=side*.7;
    }
    return group;
  }
  makePromenade(){
    // Negative scene X is the right shore when the camera looks down +Z.
    for(const [x,z,width] of [[-22,145,24],[-23,247,26]]){
      const g=this.group(z,15);
      this.box(g,x,-1,0,width,2.4,7,0xc6b18f);
      this.cutout('promenade-v14.png',g,x,.2,0,width,width*2/3);
      this.pennants(g,x-width*.45,x+width*.45,4,-3,14);
    }
  }
  makeGates(){
    // The collision rocks already define the two exits. These distant cliff faces
    // frame them from outside the playable strip (|x| > 10), without fake blockers.
    for(const [x,z,h] of [[-16,278,18],[17,290,22],[-17,323,23],[18,342,17]]){
      const g=this.group(z,14);
      this.cutout('sea-stack-v10.png',g,x,-.5,0,13,h);
    }
  }
  boat(x,z,color){
    const g=this.group(z,12);g.position.x=x;
    const hull=new THREE.Mesh(new THREE.CylinderGeometry(1.1,.7,6,5),this.ink(color));hull.rotation.x=Math.PI/2;hull.position.y=.8;g.add(hull);
    this.box(g,0,1,0,1.8,.25,4.9,0xf5dfb4);this.box(g,0,2.8,0,.1,4.6,.1,0xeedbb7);
    const shape=new THREE.Shape();shape.moveTo(.15,0);shape.lineTo(.15,3.8);shape.lineTo(2.2,.2);shape.closePath();
    const sail=new THREE.Mesh(new THREE.ShapeGeometry(shape),this.ink(0xf8e6bb));sail.position.set(0,1.5,0);g.add(sail);
    g.userData.bob=true;
  }
  makeHarbor(){
    this.boat(14,382,0xd87b5c);this.boat(-16,570,0x367f8e);this.boat(16,834,0xe1aa50);
    const g=this.group(710,52);this.sign(g,this.game.isAviasales?'АЭРОПОРТ-ЭКСПРЕСС ↗':'БОРИС · ДАЙ ВОЛНУ!',-15,7,-28,8,'#ab5938');
    for(let i=0;i<6;i++)this.person(g,-14+(i%2)*2,3.8,-26+i*10,[0xe77656,0xdeb84f,0x539791][i%3]);
    this.pennants(g,-18,-12,8,-5,6);
    const rest=this.group(843,16);this.sign(rest,this.game.isAviasales?'РЕЙС БЛИЗКО!':'ВЫДОХНИ',-16,4,0,5,'#357e73');
  }
  makeBar(){
    const g=this.group(1372,40);this.bar=g;
    const dockX=this.game.isAviasales?9:-13;
    this.box(g,dockX,.8,0,13,1.4,23,0xa97851);
    for(let i=0;i<12;i++)this.box(g,dockX,1.53,-10.5+i*1.9,13,.05,.07,0xf0d9ac);
    for(const x of [dockX-6,dockX+6])for(const z of [-10,0,10])this.box(g,x,-1,z,.5,5,.5,0x65513d);
    if(this.game.isAviasales){
      this.shuttle=this.cutout('airport-shuttle-aviasales.png',g,-3.5,-.8,0,13.2,8.8);
      this.sign(g,'АЭРОПОРТ-ЭКСПРЕСС',dockX-2,3.5,-8,7.5,'#0c73fe');
      this.sign(g,'ТРАП',dockX-4.8,2.3,-6,2,'#0c73fe');
    }else{
      this.cutout('bar-delivery-v14.png',g,-13,1.5,4,16,10.67);
      this.pennants(g,-20,8,9.5,-7,24);
      // A physical glass on the counter uses the actual delivered fraction.
      this.glass=new THREE.Group();this.glass.position.set(-13,6.6,2);this.glass.scale.setScalar(2);g.add(this.glass);
      this.box(this.glass,0,.36,0,.45,.72,.45,0xffe7bb);
      this.drink=this.box(this.glass,0,.34,-.24,.32,.57,.035,0xe7a526);
      this.foam=this.box(this.glass,0,.66,-.25,.34,.10,.045,0xfff5d9);
      this.borisGlass=this.glass.clone(true);this.borisGlass.position.x=-10.5;g.add(this.borisGlass);
      this.borisDrink=this.borisGlass.children[1];this.borisFoam=this.borisGlass.children[2];
      // The counter shows the same paper glass and liquid as each rider's hand.
      this.maxCup=new THREE.Sprite(new THREE.SpriteMaterial({map:this.game.handBeer.texture,transparent:true,depthWrite:false,depthTest:false}));
      this.borisCup=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false,depthTest:false}));
      for(const [cup,holder] of [[this.maxCup,this.glass],[this.borisCup,this.borisGlass]]){cup.center.set(.5,0);cup.scale.set(.78,1,1);cup.renderOrder=6;holder.add(cup);}
      this.sign(g,'МАКС',-13,6.3,1.5,1.8,'#27596b');this.sign(g,'БОРИС',-10.5,6.3,1.5,1.8,'#b7633d');
    }
    this.finishBanner=this.sign(g,this.game.isAviasales?'ПОСАДКА':'ФИНИШ',1,8,-10,10,'#b7633d');
    this.finishBannerPosts=[-6,8].map(x=>this.box(g,x,3.8,-10,.20,8,.20,0xf4dbb0));
    this.confetti=[];
    for(let i=0;i<28;i++){
      const m=new THREE.Mesh(new THREE.PlaneGeometry(.13,.3),this.ink([0xefc44b,0xe98563,0xf7e6ba][i%3]));m.visible=false;g.add(m);this.confetti.push(m);
    }
  }
  mount(){
    const g=this.game;
    this.delivery=document.createElement('div');this.delivery.id='delivery-scene';this.delivery.className='hidden';
    this.deliveryLine=document.createElement('p');this.deliveryLine.id='delivery-line';this.delivery.append(this.deliveryLine);
    if(g.isAviasales){
      this.boardingCard=document.createElement('section');this.boardingCard.className='boarding-card hidden';
      this.boardingCard.setAttribute('aria-labelledby','boarding-title');
      this.boardingCard.innerHTML=`<img class="boarding-art" width="1024" height="1280" decoding="async" fetchpriority="low" alt="Макс с чемоданом и загранпаспортом поднимается на катер у пирса">
        <div class="boarding-copy"><h2 id="boarding-title">УСПЕЛ!</h2><p class="boarding-metrics"><span id="boarding-passport"></span><span id="boarding-bonus"></span></p></div>`;
      const art=this.boardingCard.querySelector('img');
      art.addEventListener('error',()=>{art.hidden=true;});
      art.src='assets/comics/comic-boarding-aviasales.webp';
      this.boardingPassport=this.boardingCard.querySelector('#boarding-passport');
      this.boardingBonus=this.boardingCard.querySelector('#boarding-bonus');
      this.delivery.append(this.boardingCard);
    }
    this.deliveryButton=document.createElement('button');this.deliveryButton.type='button';this.deliveryButton.className='yellow-button';this.deliveryButton.textContent='К РЕЗУЛЬТАТАМ';
    this.deliveryButton.addEventListener('click',()=>this.endDelivery());this.delivery.append(this.deliveryButton);g.container.append(this.delivery);
  }
  get deliveryAnimating(){return this.deliveryActive&&!this.boardingShown;}
  hideDelivery(){
    this.deliveryActive=false;this.boardingShown=false;
    this.delivery.classList.add('hidden');this.delivery.classList.remove('boarding-open');
    this.boardingCard?.classList.add('hidden');this.deliveryLine.hidden=false;
    this.game.container.classList.remove('delivery-active');
    this.confetti.forEach(m=>m.visible=false);
  }
  reset(){
    this.enabled=!this.game.flowTest;this.index=-1;this.events=[];this.wakeWins=new Set();this.wakeSeconds=0;this.wakeSource=null;this.wakeUntil=0;
    this.deliveryTime=0;this.hideDelivery();this.finishBanner.visible=true;
    this.applyPalette(0);
    if(this.shuttle){
      this.shuttle.position.set(-3.5,-.8,0);
      this.finishBannerPosts.forEach(post=>post.visible=true);
    }
    else this.glass.visible=this.borisGlass.visible=false;
  }
  sectionAt(z){const index=this.sections.findIndex(s=>z<s.to);return index<0?this.sections.length-1:index;}
  step(dt){
    if(!this.enabled)return;
    const g=this.game,p=g.p,index=Math.max(0,Math.min(5,this.sectionAt(Math.min(p.z,1359))));
    if(index!==this.index){
      this.index=index;this.events.push({type:'section',id:this.sections[index].id,z:p.z,time:g.time});
      if(index===5)g.companion.react('home');
    }
    if(p.fallen||p.recovering>0){this.wakeSeconds=0;this.wakeSource=null;this.wakeUntil=0;return;}
    if(!p.airborne){
      const wake=g.world.wakeSourceAt(p.x,p.z),source=wake.hazard?.index;
      if(wake.quality>.3){
        if(source!==this.wakeSource)this.wakeSeconds=0;
        this.wakeSource=source;this.wakeSeconds+=dt;
        if(this.wakeSeconds>=.12)this.wakeUntil=g.time+2;
      }else if(g.time>this.wakeUntil){this.wakeSeconds=0;this.wakeSource=null;}
    }
  }
  onLanding(source,clean){
    const g=this.game;
    if(!this.enabled||!clean||typeof source!=='string'||!source.startsWith('wake:')||this.wakeWins.has(source))return;
    // The jump must physically start on a live wake, not merely follow a nearby craft.
    const index=Number(source.slice(5));
    if(index!==this.wakeSource||this.wakeSeconds<.12||g.time>this.wakeUntil+3)return;
    this.wakeWins.add(source);this.events.push({type:'wake-link',source,z:g.p.z,time:g.time});
    g.awardTrick('ВОЛНА БОРИСА',320);g.race.boostTime=Math.max(g.race.boostTime,1.6);g.companion.react('wake');
  }
  cue(){
    const g=this.game;
    if(!this.enabled||g.p.airborne||g.p.fallen||this.wakeSeconds<.12||g.time>this.wakeUntil||this.wakeWins.has('wake:'+this.wakeSource))return null;
    if(g.world.wakeSourceAt(g.p.x,g.p.z).quality<=.3)return null;
    return {id:'ramp',title:'ПОЙМАЛ СЛЕД · ПРЫЖОК ↑',line:'Чистая посадка — бонус от Бориса.'};
  }
  applyPalette(z){
    if(!this.enabled)z=0;
    const index=Math.max(0,this.sectionAt(Math.min(z,1359))),s=this.sections[index],previous=this.sections[Math.max(0,index-1)];
    const t=this.game.wave.smooth((z-s.from)/45);
    for(const key of ['sky','fog','deep','clear'])this.colors[key].copy(this.colorA.set(previous[key])).lerp(this.colorB.set(s[key]),t);
    const accent=this.enabled?this.game.demo?.paletteAt(z):null;
    if(accent)for(const key of ['sky','fog','deep','clear'])this.colors[key].lerp(this.colorA.set(accent[key]),accent.mix);
    this.game.scene.fog.color.copy(this.colors.fog);
    const water=this.game.wave.sea.material.uniforms;
    water.uFogColor.value.copy(this.colors.fog);water.uDeep.value.copy(this.colors.deep);water.uClear.value.copy(this.colors.clear);
    if(!this.enabled){water.uDeep.value.setRGB(.025,.32,.44);water.uClear.value.setRGB(.15,.67,.66);}
    // All wave lips use the same water material or the same uniform references.
    this.game.container.style.setProperty('--course-sky','#'+this.colors.sky.getHexString());
    this.game.container.style.setProperty('--course-horizon','#'+this.colors.fog.getHexString());
    this.game.container.dataset.course=this.enabled?s.id:'beach';
  }
  update(dt){
    const g=this.game,z=g.p.z;this.applyPalette(z);
    for(const p of this.props){p.mesh.visible=this.enabled&&p.z-z+p.extent> -22&&p.z-z-p.extent<165;if(p.mesh.userData.bob&&p.mesh.visible)p.mesh.position.y=g.wave.height(-p.mesh.position.x,p.z)*.45;}
    if(this.shuttle&&this.bar.visible){
      const p=this.shuttle.position;
      p.y=-.8+g.wave.height(-p.x,this.bar.position.z+p.z)*.45;
    }
    for(let i=0;i<this.flags.length;i++)this.flags[i].rotation.y=g.reducedMotion?0:Math.sin(g.time*2+i)*.18;
    // The skyline yields to nearby architecture and vanishes on open water.
    g.town.material.opacity=this.enabled&&z>875&&z<1080?.15:1;
    const open=this.enabled&&z>880&&z<1120;g.world.beach.visible=g.world.shore.visible=!open;
    for(const {group} of [...g.world.palms,...g.world.umbrellas])group.visible=!open;
    g.finishSign.visible=!this.enabled;g.finishPosts.forEach(({pole})=>pole.visible=!this.enabled);
    // Concentrate existing collage cliffs around the gate and swell, leaving the
    // waterfront, breathing bay and finish distinct rather than repeating rocks.
    if(this.enabled)for(const p of g.rush.scenery)if(p.mesh.isSprite&&(p.z<250||p.z>360&&p.z<610||p.z>800&&p.z<880||p.z>1160))p.mesh.visible=false;
    if(this.deliveryAnimating)this.updateDelivery(dt);
  }
  beginDelivery(success){
    if(!this.enabled)return;
    const g=this.game;this.success=success;this.deliveryActive=true;this.deliveryTime=0;this.finishBanner.visible=false;
    if(this.shuttle)this.finishBannerPosts.forEach(post=>post.visible=false);
    if(!this.shuttle){
      this.glass.visible=true;this.borisGlass.visible=g.duel.arrived;
      for(const [drink,foam,level] of [[this.drink,this.foam,g.mug.level],[this.borisDrink,this.borisFoam,g.duel.deliveredBeer??0]]){
        drink.visible=foam.visible=false;drink.scale.y=.57*level;drink.position.y=.055+.285*level;foam.position.y=.075+.57*level;
      }
      this.glass.children[0].visible=this.borisGlass.children[0].visible=false;
      g.handBeer.draw();g.handBeer.texture.needsUpdate=true;g.duel.printFrame=-1;g.duel.update();
      this.borisCup.material.map=g.duel.glassTexture;this.borisCup.material.needsUpdate=true;
    }
    this.cameraFrom=g.camera.position.clone();this.lookFrom=new THREE.Vector3(0,0,-1).applyQuaternion(g.camera.quaternion).multiplyScalar(22).add(g.camera.position);
    g.container.classList.add('delivery-active');
    const result=g.duel.result;
    if(success&&this.boardingCard){
      this.boardingPassport.textContent='Паспорт сухой на '+result.max+'%';
      this.boardingBonus.textContent='Бонус +'+result.beerBonus.toLocaleString('ru-RU');
      const {x,y,z,heading,lean}=g.p;
      this.boardingFrom={x,y,z,heading,lean};
      this.boardingZ=Math.max(z,this.bar.position.z-5);
      if(g.reducedMotion)this.showBoarding();
      else g.container.focus({preventScroll:true});
      g.renderDirty=true;return;
    }
    this.delivery.classList.remove('hidden');
    if(g.isAviasales){
      this.deliveryLine.textContent='КАПИТАН: «КАТЕР УШЁЛ...»\nПАСПОРТ '+result.max+'% СУХОЙ · БОНУС +'+result.beerBonus.toLocaleString('ru-RU');
    } else {
      this.deliveryLine.textContent=(success?'ТОНИ: «МАКС ПЕРВЫЙ! КУБОК ТВОЙ!»':result.outcome==='tie'?'ТОНИ: «ФОТОФИНИШ! ОБЪЯВЛЯЮ НИЧЬЮ.»':'ТОНИ: «БОРИС ПЕРВЫЙ. РЕВАНШ?»')+'\nПИВО '+result.max+'% · БОНУС +'+result.beerBonus.toLocaleString('ru-RU');
    }
    this.deliveryButton.focus({preventScroll:true});g.renderDirty=true;
  }
  showBoarding(){
    this.boardingShown=true;this.deliveryLine.hidden=true;
    this.boardingCard.classList.remove('hidden');
    this.delivery.classList.add('boarding-open');this.delivery.classList.remove('hidden');
    this.deliveryButton.focus({preventScroll:true});
  }
  updateBoardingApproach(){
    const g=this.game,p=g.p,from=this.boardingFrom,lerp=THREE.MathUtils.lerp;
    const t=Math.min(1,this.deliveryTime/1.05),glide=1-(1-t)**2;
    p.x=lerp(from.x,-.8,glide);p.z=lerp(from.z,this.boardingZ,glide);
    p.y=lerp(from.y,g.wave.height(p.x,p.z),glide);
    p.heading=lerp(from.heading,0,glide);p.lean=lerp(from.lean,0,glide);
    p.airborne=false;p.fallen=false;
    g.camera.position.copy(this.cameraFrom).lerp(new THREE.Vector3(.8,4.7,this.boardingZ-15),glide);
    g.camera.lookAt(this.lookFrom.clone().lerp(new THREE.Vector3(-.7,2.8,this.bar.position.z),glide));
    if(t===1)this.showBoarding();
  }
  updateDelivery(dt){
    const g=this.game;if(!this.deliveryAnimating||document.hidden)return;
    this.deliveryTime+=Math.min(dt,.05);
    if(this.success&&this.boardingCard){this.updateBoardingApproach();return;}
    const t=g.wave.smooth(this.deliveryTime/2.4);
    if(this.shuttle&&!this.success){
      this.shuttle.position.x=-3.5-9*t;
      this.shuttle.position.z=25*t;
    }
    if(!g.reducedMotion){
      const pullback=g.camera.aspect<.7?43:32;
      g.camera.position.copy(this.cameraFrom).lerp(new THREE.Vector3(2,8,1372-pullback),t);
      g.camera.lookAt(this.lookFrom.clone().lerp(new THREE.Vector3(this.shuttle?0:-8,4.8,1372),t));
    }
    this.confetti.forEach((m,i)=>{
      m.visible=this.success&&!g.reducedMotion;
      m.position.set(-18+(i*7%23),10-((this.deliveryTime*2+i*.31)%8),-9+(i*3%12));m.rotation.z=i+this.deliveryTime;
    });
    if(this.deliveryTime>3.8)this.endDelivery();
  }
  endDelivery(){
    if(!this.deliveryActive)return;
    this.hideDelivery();
    this.game.renderDirty=true;document.getElementById('replay-button').focus({preventScroll:true});
  }
}
window.CourseShow=CourseShow;
