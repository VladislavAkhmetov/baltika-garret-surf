/* Signed board roll: the player catches an unstable landing, not a countdown. */
class SurfBalance {
  constructor(game) { this.game=game; this.reset(); }
  reset() {
    this.roll=this.velocity=this.settle=this.recoveryAge=this.fallTime=this.immunity=0;
    this.mode='stable';this.falls=this.saves=0;this.reason='';
    document.getElementById('wipeout-screen')?.classList.add('hidden');
  }
  disturb(strength, reason, side=0) {
    if(this.mode==='fall'||this.immunity>0)return;
    const p=this.game.p;
    const direction=side||Math.sign(p.lean)||Math.sign(this.roll)||1;
    this.roll=THREE.MathUtils.clamp(this.roll+direction*strength,-.85,.85);
    this.velocity+=direction*strength*.9;
    this.mode='recovery';this.reason=reason;this.settle=this.recoveryAge=0;p.recovering=.9;
  }
  fall() {
    if(this.mode==='fall')return;
    const g=this.game,p=g.p;
    this.mode='fall';this.fallTime=1.25;this.falls++;this.reason='НЕ УДЕРЖАЛ БАЛАНС';
    p.fallen=true;p.airborne=false;p.airY=0;p.jumpVelocity=0;p.recovering=0;
    g.jump.cancel();g.comics.reset();g.waveRide.caught=false;g.waveRide.charge=g.waveRide.boost=0;
    g.spill(.18,'Падение · возвращаемся на воду');g.emit(36,1.5);
    document.getElementById('wipeout-screen').classList.remove('hidden');
    g.container.classList.add('fallen');
  }
  stepFall(dt) {
    const g=this.game;this.fallTime-=dt;
    g.updateParticles(dt);
    if(this.fallTime>0)return;
    const p=g.p;
    // Keep route progress and collected items; find clear water ahead without
    // rewinding hazards or providing another chance to collect the same cap.
    p.z=Math.min(g.distance-1,p.z+4);
    const candidates=[8.5,7,-8,-7,5,3];
    p.x=candidates.find(x=>g.wave.sample(x,p.z).energy<.15&&g.world.hazards.every(h=>h.done||Math.abs(h.z-p.z)>7||Math.abs(h.x-x)>2))??8.5;
    p.heading=p.lean=p.pitch=p.smoothLean=p.sideVelocity=p.verticalVelocity=0;
    p.speed=19;p.y=g.wave.height(p.x,p.z);p.balance=0;p.fallen=false;p.recovering=0;
    this.roll=this.velocity=this.settle=this.recoveryAge=0;this.mode='stable';this.immunity=2.5;
    g.input.reset();g.impactCooldown=2.5;g.trailPoints=[];g.jump.cooldown=.6;g.spillFlash=0;
    g.world.hazards.filter(h=>h.chasing).forEach(h=>g.world.endChase(h));
    g.container.classList.remove('fallen');document.getElementById('wipeout-screen').classList.add('hidden');
    g.moment('СНОВА НА ВОДЕ','',false,1.2);g.updateCamera(1,true);
  }
  step(dt,surface,wake,jerk) {
    const g=this.game,p=g.p;this.immunity=Math.max(0,this.immunity-dt);
    if(p.airborne){this.velocity*=Math.exp(-dt*2);return;}
    // External collisions also enter the same catchable balance state.
    if(p.recovering>0&&this.mode==='stable'&&this.immunity===0)this.disturb(.34,'УДАР');
    const crest=surface.zone==='crest'&&surface.energy>.45&&this.immunity===0;
    const recovering=this.mode==='recovery';
    const unstable=crest||recovering;
    const gust=crest?(.42+.65*Math.sin(g.time*2.3+(surface.wave?.id||0)*1.7))*surface.energy:0;
    const pitchRisk=Math.max(0,Math.abs(p.pitch)-(crest?.22:.5));
    const force=(unstable?this.roll*2.5:-this.roll*6)+p.lean*(unstable?4.8:1.2)+gust
      +(unstable?Math.sign(this.roll||1)*pitchRisk*1.9:0)+Math.sin(g.time*7)*wake*.6;
    this.velocity+=(force-this.velocity*(unstable?1.65:4))*dt;
    this.roll=THREE.MathUtils.clamp(this.roll+this.velocity*dt,-1.4,1.4);
    p.balance=THREE.MathUtils.clamp(Math.abs(this.roll)+Math.abs(this.velocity)*.16+jerk*.1,0,1.15);
    if(crest&&p.balance>.53&&this.mode==='stable'){
      this.mode='recovery';this.reason='СРЫВ С ГРЕБНЯ';this.recoveryAge=this.settle=0;
    }
    if(this.mode==='recovery'){
      this.recoveryAge+=dt;p.recovering=.9;
      const centered=Math.abs(this.roll)<.14&&Math.abs(this.velocity)<.32&&Math.abs(p.pitch)<.35;
      this.settle=centered?this.settle+dt:0;
      if(this.settle>.42){
        this.mode='stable';p.recovering=0;this.saves++;this.settle=this.recoveryAge=0;
        g.awardTrick('ВЫРУЛИЛ',130,true);g.comics.trigger('ФУХ!','БАЛАНС ПОЙМАН. КРУЖКА С НАМИ.','save',2);
      }else if(this.recoveryAge>3.4||p.balance>=1.05)this.fall();
    }else p.recovering=0;
    if(this.mode!=='fall'&&p.balance>=1.05&&this.immunity===0)this.fall();
  }
  updateHUD() {
    const g=this.game,p=g.p,el=document.getElementById('balance-cue');
    const crest=g.wave.sample(p.x,p.z).zone==='crest';
    el.classList.toggle('hidden',!g.container.classList.contains('playing')||p.fallen||p.airborne||(!crest&&this.mode!=='recovery'&&p.balance<.4));
    el.classList.toggle('catching',this.mode==='recovery');
    el.querySelector('strong').textContent=this.mode==='recovery'?'ПОЙМАЙ БАЛАНС':'ДЕРЖИ ГРЕБЕНЬ';
    const control=g.input.mode==='keys'?(this.roll>.08?'← / A':this.roll<-.08?'→ / D':'ОТПУСТИ КУРС'):(this.roll>.08?'ВЛЕВО':this.roll<-.08?'ВПРАВО':'ПО ЦЕНТРУ');
    el.querySelector('small').textContent=Math.abs(p.pitch)>.35?'↕ ВЕС К ЦЕНТРУ':control;
    el.querySelector('.balance-needle').style.left=(50+THREE.MathUtils.clamp(this.roll,-1,1)*43)+'%';
    el.querySelector('.catch-fill').style.width=(this.settle/.42*100)+'%';
    el.setAttribute('aria-label',(this.mode==='recovery'?'Поймай баланс. ':'Гребень. ')+control);
  }
}
window.SurfBalance=SurfBalance;
