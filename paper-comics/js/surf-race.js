/* Short authored encounters. An intent is fixed before the rival moves across it. */
class SurfRace {
  constructor(game){
    this.game=game;
    // The cast cruises outside the course; only Max and Boris contest the wager.
    this.scenes=[];
    this.callouts=game.rivals.map(()=>{
      const el=document.createElement('div');el.className='race-callout';game.container.append(el);return el;
    });
    this.cues=game.rivals.map(()=>{
      const mesh=game.wave.ribbon(0xffd264,.15);mesh.material.transparent=true;mesh.material.depthWrite=false;mesh.visible=false;return mesh;
    });
    this.point=new THREE.Vector3();this.reset();
  }
  reset(){
    this.enabled=!this.game.flowTest;this.cursor=0;this.events=[];this.boost=this.boostTime=this.overtakes=0;
    this.game.container.classList.toggle('race-mode',this.enabled);
    this.game.container.classList.remove('race-boost');
    this.game.rivals.forEach((r,i)=>{
      r.encounter=null;this.callouts[i].classList.remove('visible');this.cues[i].visible=false;
      r.scenic=this.enabled;
      if(r.scenic){r.x=i===0?-12:12;r.z=48+i*36;r.speed=26;r.lean=r.airY=0;}
    });
  }
  begin(scene){
    const g=this.game,r=g.rivals[scene.slot],profile=g.rivalCast.profiles.find(p=>p.id===scene.id);
    if(r.encounter||r.rig.group.visible&&g.rivalCast.inView(r))return false;
    g.rivalCast.apply(r,profile);
    const lane=THREE.MathUtils.clamp(g.trickRoute.routePoint(g.p.z+35),-4,4),side=scene.slot===0?-1:1;
    const from=THREE.MathUtils.clamp(lane+side*3.4,-7,7),to=THREE.MathUtils.clamp(lane-side*.9,-6,6);
    Object.assign(r,{x:from,speed:g.p.speed,lean:0,airY:0,freeEntry:false,scenic:false,
      passed:false,wasAhead:false,collided:false,chat:false,contactLocked:false,yieldTime:0,nearest:Infinity});
    if(!g.rivalCast.enterBehind(r))return false;
    r.x=g.rivalWaterLane(r,from);
    r.encounter={...scene,age:0,phase:'entry',entryGap:scene.move==='sprint'?-7:14,from:r.x,to,lane,baseSpeed:g.p.speed,spokenUntil:0};
    this.callouts[scene.slot].textContent=scene.line;this.callouts[scene.slot].classList.remove('visible');
    this.events.push({id:scene.id,move:scene.move,z:g.p.z,at:g.time,spawn:{x:r.x,z:r.z}});
    return true;
  }
  step(dt){
    if(!this.enabled)return;
    const g=this.game;
    this.boostTime=Math.max(0,this.boostTime-dt);
    this.boost+=( (this.boostTime>0?4.2:0)-this.boost)*(1-Math.exp(-dt*(this.boostTime>0?8:3)));
    g.container.classList.toggle('race-boost',this.boost>1);
    for(const r of g.rivals){
      const e=r.encounter;if(!e)continue;
      if(e.phase==='entry'&&e.duration>0){
        if(r.z-g.p.z<e.entryGap)continue;
        e.phase='approach';e.age=0;e.baseSpeed=g.p.speed;e.spokenUntil=g.time+1.4;
      }
      e.age+=dt;
      e.phase=e.duration<=0?'exit':e.age<.85?'approach':e.age<e.duration&&!r.passed?'move':'exit';
      if(e.phase==='exit'&&e.exitAt===undefined)e.exitAt=e.age;
      if(e.phase==='exit'&&!g.rivalCast.inView(r)){
        r.encounter=null;this.callouts[r.index].classList.remove('visible');this.cues[r.index].visible=false;
      }
    }
    const scene=this.scenes[this.cursor];
    if(scene&&g.p.z>=scene.z&&!g.p.fallen&&!g.rivals[scene.slot].encounter&&g.setpiece?.canStartRival(scene)!==false&&this.begin(scene))this.cursor++;
  }
  plan(r){
    const e=r.encounter;if(!this.enabled||!e)return null;
    if(e.phase==='entry')return {x:e.from,speed:Math.min(58,this.game.p.speed+18),air:0};
    const t=Math.max(0,e.age-.85),s=this.game.wave.smooth(Math.min(1,t/1.15));
    let x=e.from,speed=e.baseSpeed-4,air=0;
    if(e.phase==='exit')return {x:r.x,speed:Math.max(0,this.game.p.speed-12),air:0};
    if(e.move==='sprint'){
      const merge=this.game.wave.smooth(Math.max(0,Math.min(1,(e.age-1.25)/1.2)));
      x=THREE.MathUtils.lerp(e.from,e.to,merge);speed=e.age<2.65?e.baseSpeed+12:Math.min(27,e.baseSpeed-4);
    }else if(e.move==='weave'){
      x=THREE.MathUtils.lerp(e.from,e.lane+Math.sin(t*1.65)*2.6,s);speed=Math.min(27,e.baseSpeed-3);
    }else if(e.move==='gate'){
      x=THREE.MathUtils.lerp(e.from,e.to+Math.sin(t*1.2)*.8,s);speed=Math.min(25,e.baseSpeed-4);
    }else{
      x=THREE.MathUtils.lerp(e.from,e.lane-Math.sin(t*1.15)*2.4,s);speed=Math.min(29,e.baseSpeed-2);
      if(t>1.2&&t<2.1)air=Math.sin((t-1.2)/.9*Math.PI)*1.1;
    }
    return {x:THREE.MathUtils.clamp(x,-7.5,7.5),speed:THREE.MathUtils.clamp(speed,18,e.move==='sprint'?48:42),air};
  }
  onPass(r){
    const e=r.encounter;if(!this.enabled||!e||e.phase==='entry'||e.phase==='exit'||r.collided)return;
    this.overtakes++;this.game.awardTrick('ЧИСТЫЙ ОБГОН',110,true);
    this.callouts[r.index].textContent=r.id==='grandma'?'Ну, погоди!':r.id==='couple'?'Красиво прошёл!':'Вот это темп!';
    e.spokenUntil=this.game.time+1.2;this.callouts[r.index].classList.add('visible');
    this.game.juice.pop('ВЖУХ!',r.x,this.game.wave.height(r.x,r.z)+1.7,r.z,'near');
  }
  reward(name){
    if(!this.enabled||!['ЧИСТЫЙ ОБГОН','ВПРИТЫК!','НАД ПРЕДМЕТОМ!','РАЗОШЛИСЬ','НА ХВОСТЕ','360°','КОСОЙ 360°','ПЕРЕВОРОТ!','ПРЯМОЙ ВЫЛЕТ','БОКОВОЙ ПЕРЕЛЁТ','КАТБЭК','НАД АКУЛОЙ!'].includes(name))return;
    this.boostTime=Math.min(2.6,this.boostTime+1.15);this.game.juice.punch(2);this.game.juice.buzz(12);
  }
  update(){
    const g=this.game;
    g.rivals.forEach((r,i)=>{
      const e=r.encounter,el=this.callouts[i],cue=this.cues[i];
      for(const rider of r.rig.castRiders||[])rider.card.material.opacity=1;
      r.rig.board.material.opacity=1;
      cue.visible=this.enabled&&!!e&&e.phase==='approach';
      if(cue.visible){
        const pos=cue.geometry.attributes.position;
        for(let j=0;j<=80;j++)for(let side=0;side<2;side++){
          const t=j/80,x=THREE.MathUtils.lerp(r.x,e.to,t)+(side-.5)*.18,z=r.z+t*18;
          pos.setXYZ(j*2+side,-x,g.wave.height(x,z)+.10,z);
        }
        pos.needsUpdate=true;cue.material.opacity=.45;
      }
      if(!e||g.time>e.spokenUntil){el.classList.remove('visible');return;}
      this.point.set(-r.x,g.wave.height(r.x,r.z)+r.airY+3.6,r.z).project(g.camera);
      const visible=Math.abs(this.point.x)<.92&&Math.abs(this.point.y)<.82&&this.point.z<1&&this.point.z>-1&&!g.p.fallen;
      el.classList.toggle('visible',visible);
      const width=g.container.clientWidth,height=g.container.clientHeight;
      el.style.left=THREE.MathUtils.clamp((this.point.x+1)*width/2,70,width-70)+'px';
      el.style.top=Math.max(150,(1-this.point.y)*height/2-20)+'px';
    });
  }
}
window.SurfRace=SurfRace;
