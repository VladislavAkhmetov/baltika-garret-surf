/* Whitewater returns after a mistake; its visible front is the actual contact line. */
class FoamChase {
  constructor(game){
    this.game=game;
    this.columns=48;this.rows=28;
    const geometry=new THREE.PlaneGeometry(1,1,this.columns,this.rows);
    geometry.setAttribute('waterFoam',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count),1));
    this.frontMesh=new THREE.Mesh(geometry,game.wave.waterMaterial);this.frontMesh.frustumCulled=false;game.scene.add(this.frontMesh);
    const frothMaterial=new THREE.ShaderMaterial({
      vertexShader:`
        varying vec3 frothNormal;varying vec3 frothWorld;
        void main(){
          vec4 world=modelMatrix*instanceMatrix*vec4(position,1.0);
          frothNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);frothWorld=world.xyz;
          gl_Position=projectionMatrix*viewMatrix*world;
        }`,
      fragmentShader:`
        varying vec3 frothNormal;varying vec3 frothWorld;
        void main(){
          float light=max(0.0,dot(normalize(frothNormal),normalize(vec3(-.2,.85,.45))));
          float grain=fract(sin(dot(frothWorld.xz*41.0,vec2(12.9,78.2)))*43758.5);
          vec3 ink=mix(vec3(.32,.62,.61),vec3(.98,.99,.89),.38+.62*light)*( .97+grain*.03);
          gl_FragColor=vec4(ink,1.0);
        }`
    });
    this.crestFroth=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.11,1),frothMaterial,this.columns*2);
    this.crestFroth.frustumCulled=false;this.crestFroth.instanceMatrix.setUsage(THREE.DynamicDrawUsage);game.scene.add(this.crestFroth);
    this.frothDummy=new THREE.Object3D();
    this.sprayTexture=this.makeSprayTexture();
    this.spray=Array.from({length:48},()=>{
      const mesh=game.sprite(this.sprayTexture,.9,.9);mesh.visible=false;mesh.material.depthWrite=false;
      return {mesh,life:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:1};
    });
    this.taught=false;this.reset();
  }
  reset(){
    this.active=false;this.wave=null;this.z=this.speed=this.level=this.danger=this.offWave=this.rideScore=this.sprayClock=this.spraySerial=0;
    this.gap=Infinity;this.pocketTime=this.pocket2Time=this.wipes=this.chases=0;this.done=new Set();
    this.phase='idle';this.pursuit=false;this.age=this.cleanTime=this.rush=this.cooldown=this.strikes=this.escapes=0;
    this.lastMistake=-100;this.inWipe=false;
    this.game.wave.peelFront=null;
    this.spray.forEach(s=>{s.life=0;s.mesh.visible=false;});
    this.frontMesh.visible=this.crestFroth.visible=false;
  }
  get multiplier(){return this.level===2?2:this.level===1?1.5:1;}
  get distanceLeft(){return this.active?Math.max(0,this.gap-1.1):Infinity;}
  get closingSpeed(){return this.active?this.speed-this.game.p.speed*Math.cos(this.game.p.heading):0;}
  get impactETA(){return this.closingSpeed>.35?this.distanceLeft/this.closingSpeed:Infinity;}
  get critical(){return this.active&&!['intro','warning'].includes(this.phase)&&this.game.p.airY<1.2&&(this.distanceLeft<1.4||this.impactETA<1.2);}
  frontEnergy(w,z,u){
    const energy=this.game.wave.envelope(w,z);
    return (this.pursuit?Math.max(.65,energy):energy)*Math.pow(Math.sin(Math.PI*u),.45);
  }
  frontX(w,z,u){return this.pursuit?(u-.5)*19:this.game.wave.crestX(w,z)+w.width*(.015+u*.91);}
  makeSprayTexture(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const c=canvas.getContext('2d');
    // Crisp broken flecks carry the foam texture into the air without large soft circles.
    for(let i=0;i<17;i++){
      const angle=i*2.39996,radius=8+Math.sqrt(i/17)*26,x=48+Math.cos(angle)*radius,y=48+Math.sin(angle)*radius;
      c.fillStyle=i%3===0?'rgba(205,239,226,.65)':'rgba(252,252,234,.92)';
      c.beginPath();for(let j=0;j<7;j++){
        const a=j/7*Math.PI*2,r=3+(i%4)*.8+(j%2)*1.3;
        const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;(j?c.lineTo(px,py):c.moveTo(px,py));
      }c.closePath();c.fill();
    }
    return new THREE.CanvasTexture(canvas);
  }
  tuning(){return {spill:this.game.assist?.04:.10};}
  eligible(w){
    const g=this.game,p=g.p;
    const front=g.wave.frontAt(w),gap=p.z-front.z;
    return w.height>=2.3&&g.onboarding.completed.has('wave')&&p.z>180&&w.to-p.z>15&&gap>1.1&&gap<65&&!this.done.has(w.id);
  }
  startIntro(){this.begin(this.game.wave.waves[0],{pursuit:true,intro:true});}
  onMistake(amount){
    const g=this.game;
    if(amount<.02||this.inWipe||g.p.fallen||g.state!=='playing'||g.time-this.lastMistake<.65||g.setpiece?.enabled&&g.p.z>1145)return;
    if(this.active&&this.phase==='intro'){this.end('intro');this.cooldown=0;}
    if(!this.active){
      if(this.cooldown>0)return;
      this.begin(g.wave.field(g.p.x,g.p.z).wave||g.wave.waves.reduce((a,b)=>Math.abs((a.from+a.to)/2-g.p.z)<Math.abs((b.from+b.to)/2-g.p.z)?a:b),{pursuit:true});
      g.hint('ПЕНА ЗА СПИНОЙ · ЛОВИ ВОЛНУ И ДЕРЖИ КУРС',2.4);
    }else if(this.pursuit){
      this.strikes++;this.rush=Math.min(3,this.rush+1.6);this.cleanTime=0;
      g.hint('ЕЩЁ ОШИБКА — ПЕНА БЛИЖЕ! ПРЫЖОК ИЛИ РАЗГОН',2.2);
      g.juice.punch(2);
    }
    this.lastMistake=g.time;
  }
  onTrick(name){
    if(!this.active||!this.pursuit||this.phase==='intro')return;
    if(['ПОЙМАЛ ВОЛНУ','ПЕРЕХОД','ВЫРУЛИЛ','ВПРИТЫК!','НАД БУЕМ!','РАЗОШЛИСЬ'].includes(name))this.cleanTime+=.7;
    if(['360°','КОСОЙ 360°','ПЕРЕВОРОТ!','ПРЯМОЙ ВЫЛЕТ','БОКОВОЙ ПЕРЕЛЁТ','МЯГКАЯ ПОСАДКА'].includes(name))this.cleanTime+=1.6;
  }
  begin(w,options={}){
    const g=this.game,p=g.p;
    const front=g.wave.frontAt(w);
    this.active=true;this.wave=w;this.z=front.z;this.gap=p.z-this.z;this.speed=front.speed;this.offWave=this.rideScore=0;
    this.pursuit=!!options.pursuit;this.phase=options.intro?'intro':this.pursuit?'warning':'chasing';
    this.age=this.cleanTime=this.rush=0;this.strikes=options.intro?0:1;this.level=0;
    if(this.pursuit){this.z=p.z-(options.intro?10:24);this.gap=p.z-this.z;this.speed=options.intro?18:20;}
    if(!options.intro)this.chases++;
  }
  end(reason){
    if(!this.active)return;
    const g=this.game;this.done.add(this.wave.id);
    if(this.pursuit&&reason==='escape'&&this.strikes){
      this.escapes++;g.awardTrick('ОТОРВАЛСЯ ОТ ПЕНЫ',200,true);g.hint('ОТОРВАЛСЯ! СОХРАНИ РАЗГОН',1.7);
    }else if(!this.pursuit&&reason!=='wipe'&&reason!=='fall'&&this.rideScore>1){
      g.awardTrick('КАРМАН',Math.round((100+this.rideScore*45)/10)*10);
    }
    this.cooldown=reason==='wipe'?3.5:reason==='fall'?2.5:reason==='escape'?1.5:reason==='intro'?.35:0;
    this.active=false;this.wave=null;this.level=0;this.phase='idle';this.gap=Infinity;g.wave.peelFront=null;
    this.frontMesh.visible=this.crestFroth.visible=false;
  }
  wipe(){
    const g=this.game,p=g.p,t=this.tuning();
    this.wipes++;this.end('wipe');
    this.inWipe=true;g.chain.burn();g.spill(t.spill,'Пена догнала');this.inWipe=false;g.moment('ПЕНА НАКРЫЛА!','',true,1.1);
    p.speed*=.75;g.impactCooldown=1.5;g.balance.disturb(.42,'НАКРЫЛО ПЕНОЙ');g.emit(30,1.4,true);
    g.juice.hitstop(.11);g.juice.shake(.55);g.juice.buzz([30,40,60]);g.juice.pop('ХРЯСЬ!',p.x,p.y+1.8,p.z,'bad');
    g.runComic.capture('wipe','ХРЯСЬ!','ПЕНА ДОГНАЛА',80);
  }
  step(dt){
    const g=this.game,p=g.p,s=g.wave.field(p.x,p.z);
    this.cooldown=Math.max(0,this.cooldown-dt);
    if(!this.active)return;
    if(this.pursuit){this.stepPursuit(dt);return;}
    const onWave=s.wave?.id===this.wave.id&&s.face<1||p.airborne&&p.z<this.wave.to+10;
    this.offWave=onWave?0:this.offWave+dt;
    if(this.offWave>.45){this.end('left');return;}
    const front=g.wave.frontAt(this.wave);this.z=front.z;this.speed=front.speed;this.gap=p.z-this.z;
    if(this.z>this.wave.to-2||p.z>this.wave.to+10){this.end('finished');return;}
    if(!p.airborne){
      const previous=this.level;
      this.level=!onWave?0:this.gap<5.5?2:this.gap<11?1:0;
      if(this.level===2&&previous<2){g.juice.punch(2);g.juice.pop('ШШУХ!',p.x,p.y+2,p.z-1,'pocket');}
    }
    if(this.level>0&&!p.airborne){
      this.pocketTime+=dt;if(this.level===2)this.pocket2Time+=dt;
      this.rideScore+=dt*this.level;g.chain.addPocket(dt*(this.level===2?90:45));
      if(this.level===2&&this.rideScore>2.2)g.runComic.capture('pocket','ШШУХ!','В КАРМАНЕ ×2',72);
    }
    g.wave.peelFront={id:this.wave.id,z:this.z};
    if(this.gap<=1.1){
      // Contact happens once. A passed crest cannot hit later when immunity expires or the rider lands.
      const face=(p.x-g.wave.crestX(this.wave,this.z))/this.wave.width;
      if(onWave&&face>-.1&&face<1&&p.airY<1.2&&g.impactCooldown===0&&g.balance.immunity===0)this.wipe();
      else this.end('passed');
    }
  }
  stepPursuit(dt){
    const g=this.game,p=g.p;this.age+=dt;this.rush=Math.max(0,this.rush-dt);
    if(this.phase==='intro'){
      this.speed=18;this.z+=this.speed*dt;this.gap=p.z-this.z;
      if(this.age>=1.4){this.end('intro');return;}
    }else{
      this.phase=this.age<.9?'warning':'chasing';
      this.speed=this.phase==='warning'?20:(g.assist?26:29)+(this.rush>0?7:0);
      this.z+=this.speed*dt;this.gap=p.z-this.z;
      if(this.phase==='chasing'&&p.recovering===0&&p.balance<.65&&g.time-this.lastMistake>.9)this.cleanTime+=dt;
      if(this.gap>38||this.age>1.7&&this.cleanTime>=4.6){this.end('escape');return;}
      this.level=this.phase==='warning'||p.airborne?0:this.gap<5.5?2:this.gap<11?1:0;
      if(this.level){
        this.pocketTime+=dt;if(this.level===2)this.pocket2Time+=dt;
        this.rideScore+=dt*this.level;g.chain.addPocket(dt*(this.level===2?90:45));
      }
      if(this.gap<=1.1){
        if(this.phase==='chasing'&&p.airY<1.2&&g.impactCooldown===0&&g.balance.immunity===0)this.wipe();
        else this.end(p.airY>=1.2?'escape':'passed');
        return;
      }
    }
    if(g.wave.envelope(this.wave,this.z)<.2)this.wave=g.wave.waves.reduce((a,b)=>g.wave.envelope(a,this.z)>g.wave.envelope(b,this.z)?a:b);
    g.wave.peelFront={id:this.wave.id,z:this.z};
  }
  update(dt){
    const g=this.game,target=this.active?THREE.MathUtils.clamp(1-(this.gap-1.1)/11,0,1):0;
    this.danger+=(target-this.danger)*(1-Math.exp(-dt*6));
    this.updateFront();
    if(this.active&&this.gap<14&&g.state==='playing'){
      this.sprayClock+=dt*(20+this.danger*45);
      while(this.sprayClock>1){this.sprayClock--;this.launchSpray();}
    }
    for(const s of this.spray){
      if(s.life<=0)continue;
      s.life-=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;s.vy-=7*dt;
      s.mesh.position.set(-s.x,s.y,s.z);const size=s.size*(1.4-s.life*.6);s.mesh.scale.set(size,size*1.6,1);
      s.mesh.material.opacity=Math.min(1,s.life*1.8)*.68;
      s.mesh.visible=s.mesh.position.distanceToSquared(g.camera.position)>12.0;
      if(s.life<=0)s.mesh.visible=false;
    }
  }
  updateFront(){
    const g=this.game,w=this.wave,mesh=this.frontMesh;
    mesh.visible=this.crestFroth.visible=this.active&&!!w&&['playing','paused'].includes(g.state);if(!mesh.visible)return;
    const pos=mesh.geometry.attributes.position,foam=mesh.geometry.attributes.waterFoam;
    for(let col=0;col<=this.columns;col++){
      const u=col/this.columns;
      const skew=(u-.5)*1.8,energy=this.frontEnergy(w,this.z+skew,u);
      const chop=.91+.06*Math.sin(u*24-g.time*3.8)+.03*Math.sin(u*47+g.time*5.2);
      const height=(.8+w.size*1.1)*energy*chop,radius=height*.52,reach=1.65*Math.min(1,energy*1.3);
      for(let row=0;row<=this.rows;row++){
        const v=row/this.rows;let along,lift;
        if(v<=.58){
          const t=v/.58;along=-5.4+4.8*t;lift=height*g.wave.smooth(t);
        }else if(v<=.84){
          const angle=(v-.58)/.26*2.2;along=-.6+reach*Math.sin(angle);lift=height-radius*(1-Math.cos(angle));
        }else{
          const t=(v-.84)/.16;along=THREE.MathUtils.lerp(-.6+reach*Math.sin(2.2),1.1,t);
          lift=(height-radius*(1-Math.cos(2.2)))*(1-g.wave.smooth(t));
        }
        // The leading white tongue ends at the actual capture threshold, not an arbitrary visual offset.
        const z=Math.min(this.z+1.1,this.z+along+skew*(1-g.wave.smooth((v-.45)/.42))),x=this.frontX(w,z,u);
        const i=row*(this.columns+1)+col;pos.setXYZ(i,-x,g.wave.height(x,z)+.025+lift,z);
        const crest=g.wave.smooth((v-.32)/.23)*(1-g.wave.smooth((v-.87)/.13));
        const tongue=g.wave.smooth((v-.88)/.1);
        foam.setX(i,(.22+crest*2.7+tongue*1.8)*energy*(.91+.09*Math.sin(col*.7+row*.8-g.time*3)));
      }
      if(col<this.columns)for(let puff=0;puff<2;puff++){
        const z=this.z-.6+skew*.8+puff*.25,x=this.frontX(w,z,u);
        const y=g.wave.height(x,z)+height+.08+Math.sin(g.time*5.2+col*.9+puff)*.14*energy;
        const size=(.8+g.wave.hash(col*7+puff+15)*1.35)*energy;
        this.frothDummy.position.set(-x,y,z);
        if(this.frothDummy.position.distanceToSquared(g.camera.position)<16.0){
          this.frothDummy.scale.set(0,0,0);
        }else{
          this.frothDummy.scale.set(size,size*(.75+puff*.4),size*1.8);
        }
        this.frothDummy.rotation.set(col*.6,g.time*.5+col,col*.8);this.frothDummy.updateMatrix();this.crestFroth.setMatrixAt(col*2+puff,this.frothDummy.matrix);
      }
    }
    pos.needsUpdate=foam.needsUpdate=this.crestFroth.instanceMatrix.needsUpdate=true;mesh.geometry.computeVertexNormals();
  }
  launchSpray(){
    const g=this.game,w=this.wave,s=this.spray.find(item=>item.life<=0);if(!s||!w)return;
    const serial=this.spraySerial++,u=.08+(serial*.61803398875%1)*.84,energy=this.frontEnergy(w,this.z,u);
    s.x=this.frontX(w,this.z,u);s.z=this.z-.6+(u-.5)*1.8;s.y=g.wave.height(s.x,s.z)+(.8+w.size*1.1)*energy;
    s.vx=(Math.random()-.5)*2.6;s.vy=6.5+(serial%5)*.65;s.vz=this.speed+1.5+(serial%4)*.75;
    s.life=1.1+(serial%5)*.08;s.size=.28+((serial*7)%11)*.015;s.mesh.material.rotation=Math.random()*Math.PI;s.mesh.visible=true;
  }
}
window.FoamChase=FoamChase;
