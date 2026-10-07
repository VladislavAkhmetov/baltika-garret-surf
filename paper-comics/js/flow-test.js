/* A fixed, isolated three-wave playground. The ribbon is visual only. */
window.FLOW_TEST_MODE=new URLSearchParams(location.search).get('flowtest')==='1';

class FlowTest {
  static configureWaves(wave){
    const sections=[
      {from:8,to:260,height:3.7,width:10,shape:[-3.2,-5.0,-4.2,-3.2],face:[.56,.32,.49,.31]},
      {from:204,to:487,height:4.5,width:9.5,shape:[-3.2,-1.8,-5.1,-4.2],face:[.32,.48,.28,.28]},
      {from:426,to:716,height:5.2,width:10,shape:[-4.2,-5.5,-4.6,-3.2],face:[.32,.44,.09,.40]}
    ];
    wave.seed=7301;
    wave.waves.forEach((w,i)=>{
      const s=sections[i];
      Object.assign(w,{height:s.height,width:s.width,backWidth:s.width*1.5,size:(s.height-1.1)/4,
        anchorFrom:s.from,anchorTo:s.to,anchorStart:s.shape[0],anchorEnd:s.shape[3],
        centerX:-3,span:38,arc:0,bow:0,crestSlope:50,encounterTime:(s.from+s.to)/56,
        velocityX:.12,velocityZ:-.02,breakRate:.014,flowShape:s.shape,flowFace:s.face});
    });
    wave.time=0;wave.lastPrintFrame=-1;
  }
  static curve(values,t){
    const part=Math.min(2,Math.floor(t*3)),u=Math.max(0,Math.min(1,t*3-part));
    return values[part]+(values[part+1]-values[part])*u*u*(3-2*u);
  }
  static crestX(w,z,time){
    const age=time-w.encounterTime;
    const t=THREE.MathUtils.clamp((z-w.anchorFrom-w.velocityZ*age)/(w.anchorTo-w.anchorFrom),0,1);
    return FlowTest.curve(w.flowShape,t)+w.velocityX*age;
  }
  constructor(game){
    this.game=game;this.enabled=new URLSearchParams(location.search).get('ribbon')!=='off';
    this.lastRun=null;
    this.guide=new WaveRibbon(game,{enabled:this.enabled,route:z=>this.routePoint(z)});
    this.ribbon=this.guide.mesh;this.uniforms=this.guide.uniforms;
    this.game.container.classList.add('flow-test');
  }
  mount(){
    const g=this.game,start=document.getElementById('start-screen');
    document.title='Три волны — Paper Comics';
    start.classList.add('flow-intro');
    start.querySelector('.menu-title').innerHTML='ПОЙМАЙ<br>ПОТОК.';
    const copy=document.createElement('div');copy.className='flow-intro-copy';
    copy.innerHTML='<span class="flow-eyebrow">ТРИ ВОЛНЫ · ОКОЛО 25 СЕКУНД</span><p>Зайди на склон. Разгонись по дуге.<br>Вылети с гребня.</p><fieldset class="flow-options"><legend>Подсказка траектории</legend><label><input type="radio" name="flow-ribbon" value="on"> С лентой</label><label><input type="radio" name="flow-ribbon" value="off"> Без ленты</label></fieldset><p class="flow-help">← → / A D — поворот · пробел — прыжок<br>На телефоне — кнопки или движение пальцем.<br>В воздухе нажми прыжок ещё раз — трюк.</p>';
    start.append(copy);
    copy.querySelectorAll('input').forEach(input=>{input.checked=(input.value==='on')===this.enabled;input.addEventListener('change',()=>this.setEnabled(input.value==='on'));});
    const toolbar=document.createElement('div');toolbar.className='flow-toolbar';
    toolbar.innerHTML='<div class="flow-section"><small>ТРИ ВОЛНЫ</small><strong id="flow-stage">01 / ЗАХОД</strong></div><div class="flow-actions"><button id="flow-toggle" type="button" aria-pressed="true">Лента: вкл.</button><button id="flow-restart" type="button" aria-label="Начать участок заново">Заново</button><button id="flow-pause" type="button" aria-label="Пауза">Ⅱ</button></div>';
    g.container.append(toolbar);
    this.toggle=document.getElementById('flow-toggle');this.stage=document.getElementById('flow-stage');
    this.toggle.addEventListener('click',()=>this.setEnabled(!this.enabled));
    document.getElementById('flow-restart').addEventListener('click',()=>g.start(false));
    document.getElementById('flow-pause').addEventListener('click',()=>g.pause());
    this.cue=document.createElement('div');this.cue.className='flow-cue';this.cue.setAttribute('aria-live','polite');g.container.append(this.cue);
    const result=document.createElement('div');result.className='flow-result paper';
    result.innerHTML='<span class="flow-eyebrow">ТРИ ВОЛНЫ</span><h2>КАК ПОШЛО?</h2><p id="flow-result-mode"></p><div class="flow-stats"><div><strong id="flow-catches">0 / 3</strong><span>поймано волн</span></div><div><strong id="flow-top-speed">0</strong><span>пик скорости, м/с</span></div><div><strong id="flow-landings">0</strong><span>чистых посадок</span></div><div><strong id="flow-duration">0</strong><span>секунд в заезде</span></div></div><p id="flow-comparison"></p><button type="button" class="yellow-button" id="flow-again">ЕЩЁ РАЗ</button><button type="button" class="flow-compare-button" id="flow-compare">ПОПРОБОВАТЬ БЕЗ ЛЕНТЫ</button><a href="index.html">В полную игру ↗</a>';
    document.getElementById('result-screen').append(result);
    document.getElementById('flow-again').addEventListener('click',()=>g.start(false));
    document.getElementById('flow-compare').addEventListener('click',()=>{this.setEnabled(!this.enabled);g.start(false);});
    window.addEventListener('keydown',e=>{if(e.code==='KeyL'&&!e.repeat&&!e.target.closest('input,textarea')){e.preventDefault();this.setEnabled(!this.enabled);}});
    this.setEnabled(this.enabled);
  }
  setEnabled(enabled){
    this.enabled=enabled;
    this.guide.setEnabled(enabled);
    if(this.toggle){this.toggle.textContent='Лента: '+(enabled?'вкл.':'выкл.');this.toggle.setAttribute('aria-pressed',String(enabled));}
    document.querySelectorAll('input[name="flow-ribbon"]').forEach(input=>{input.checked=(input.value==='on')===enabled;});
    if(this.game.state==='playing')this.switched=true;
    this.game.renderDirty=true;
  }
  reset(){
    const g=this.game;
    g.distance=730;g.assist=true;g.p.x=5.2;g.p.speed=22;g.input.mode=matchMedia('(pointer:coarse)').matches?'touch':'keys';
    g.meta.challenge=0;g.meta.ghost=null;
    g.world.hazards.forEach(h=>{h.done=true;h.group.visible=false;h.wake.forEach(m=>m.visible=false);});
    g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
    this.maxSpeed=22;this.rideTime=0;this.soundClock=0;this.catchPulse=0;this.previousFace=null;this.previousWave=null;
    this.caughtWaves=new Set();this.switched=false;this.startEnabled=this.enabled;this.noticeUntil=0;
    this.guide.reset();
  }
  routePoint(z){
    const wave=this.game.wave;let weight=0,x=0;
    for(const w of wave.waves){
      const t=THREE.MathUtils.clamp((z-w.from)/(w.to-w.from),0,1);
      const strength=Math.pow(wave.envelope(w,z),3);
      x+=(wave.crestX(w,z)+w.width*FlowTest.curve(w.flowFace,t))*strength;weight+=strength;
    }
    return weight>.0001?x/weight:null;
  }
  stepRide(dt,s){
    const g=this.game,p=g.p,ride=g.waveRide,w=s.wave;
    const tangent=w?Math.atan((g.wave.crestX(w,p.z+1)-g.wave.crestX(w,p.z-1))/2/.38):0;
    const alignment=THREE.MathUtils.clamp(1-Math.abs(p.heading-tangent)*.65,.25,1);
    const working=!!w&&s.face>.06&&s.face<.72&&s.energy>.20&&!p.airborne&&p.recovering===0;
    const quality=working?s.energy*Math.exp(-Math.pow((s.face-.34)/.37,2))*alignment:0;
    ride.zone=s.zone;ride.quality=quality;
    ride.charge=THREE.MathUtils.clamp(ride.charge+dt*(working?3.2*quality:-1.5),0,1);
    ride.caught=working&&ride.charge>.32;ride.activeId=w?.id??null;
    const descending=w?.id===this.previousWave&&this.previousFace!==null?Math.max(0,(s.face-this.previousFace)/dt):0;
    const pump=ride.caught?Math.min(3.4,descending*6):0;
    const target=ride.caught?(7.5+quality*5.5)*ride.charge+pump:0;
    ride.boost+=(target-ride.boost)*(1-Math.exp(-dt*(ride.caught?5:1.2)));
    if(ride.caught){
      this.rideTime+=dt;
      if(!this.caughtWaves.has(w.id)){
        this.caughtWaves.add(w.id);ride.capturedIds.add(w.id);ride.totalCaught=this.caughtWaves.size;
        ride.transfers=Math.max(0,ride.totalCaught-1);ride.lastId=w.id;
        this.catchPulse=1;
        p.speed=Math.min(38,p.speed+2.4+quality*1.8);
        g.juice.punch(3.8);g.juice.buzz(18);g.emit(18,1.15,true);g.audio.playCarve(.95);
        this.say(ride.totalCaught===1?'ПОДХВАТИЛО!':'ЕЩЁ ОДНА!',1.1);
      }
      this.soundClock-=dt;
      if(Math.abs(p.lean)>.24&&this.soundClock<=0){g.audio.playCarve(Math.min(1.1,.4+quality));this.soundClock=.9;}
      ride.lastCatchTime=g.time;
    }
    this.catchPulse=Math.max(0,this.catchPulse-dt*1.8);
    this.previousFace=w?s.face:null;this.previousWave=w?.id??null;
    this.maxSpeed=Math.max(this.maxSpeed,p.speed);
  }
  targetSpeed(slope){
    const g=this.game,p=g.p;
    const base=p.airborne?Math.max(25,p.speed-.8):22+g.waveRide.boost;
    return THREE.MathUtils.clamp(base+g.jump.landingBoost-slope*9-Math.abs(p.heading)*1.2-(p.recovering?4:0),19,38);
  }
  award(name){
    if(['360°','ПЕРЕВОРОТ!','МЯГКАЯ ПОСАДКА'].includes(name))this.say(name==='МЯГКАЯ ПОСАДКА'?'МЯГКО! ДАЛЬШЕ ПО ДУГЕ':name+' · ЧИСТО!',1.3);
  }
  say(text,seconds){this.notice=text;this.noticeUntil=this.game.time+seconds;}
  update(){
    const g=this.game,p=g.p;
    // Keep only the wave, rider and the rider's real wake in this experiment.
    g.rivals.forEach(r=>{r.rig.group.visible=r.rig.shadow.visible=false;r.wake.forEach(m=>m.visible=false);});
    g.caps.forEach(c=>c.mesh.visible=false);g.meta.hideGhost();g.finishSign.visible=false;g.finishPosts.forEach(f=>f.pole.visible=false);
    g.world.hazards.forEach(h=>{h.group.visible=false;h.wake.forEach(m=>m.visible=false);if(h.attackCue)h.attackCue.visible=false;});
    this.guide.update();
    if(!this.cue)return;
    const section=p.z<225?0:p.z<444?1:2;
    this.stage.textContent=['01 / ПОДХВАТ','02 / РАЗГОН','03 / ВЫЛЕТ'][section];
    const s=g.wave.sample(p.x,p.z),target=this.routePoint(p.z+22),delta=(target??p.x)-p.x;
    let text;
    if(g.time<this.noticeUntil)text=this.notice;
    else if(p.airborne)text=g.jump.canSpin?'ЕЩЁ НАЖАТИЕ — ТРЮК':'ЛЕТИМ';
    else if(s.energy>.5&&s.face<.24&&s.face>-.05)text='С ГРЕБНЯ — ПРЫЖОК';
    else if(g.waveRide.caught)text=section===2?'К ГРЕБНЮ — И ВЫЛЕТ':'ВЕДИ ПЛАВНУЮ ДУГУ';
    else text=delta<-.6?'← ЗАЙДИ НА СКЛОН':delta>.6?'ЗАЙДИ НА СКЛОН →':'ДЕРЖИ ЭТУ ЛИНИЮ';
    if(this.cue.textContent!==text)this.cue.textContent=text;
    this.cue.classList.toggle('is-catch',g.time<this.noticeUntil);
    if(g.state==='playing')this.maxSpeed=Math.max(this.maxSpeed,p.speed);
  }
  finish(){
    const g=this.game;if(g.state==='finished')return;
    g.state='finished';g.audio.stopBGM();g.audio.stopJetski?.();g.input.reset();g.jump.cancel();g.juice.reset();g.comics.reset();g.renderDirty=true;
    const run={ribbon:this.startEnabled,mixed:this.switched,catches:this.caughtWaves.size,maxSpeed:this.maxSpeed,landings:g.jump.cleanLandings,time:g.elapsed};
    document.getElementById('flow-result-mode').textContent=run.mixed?'Лента переключалась во время заезда':run.ribbon?'Заезд с лентой':'Заезд без ленты';
    document.getElementById('flow-catches').textContent=run.catches+' / 3';
    document.getElementById('flow-top-speed').textContent=run.maxSpeed.toFixed(1);
    document.getElementById('flow-landings').textContent=run.landings;
    document.getElementById('flow-duration').textContent=run.time.toFixed(1);
    const prev=this.lastRun;
    document.getElementById('flow-comparison').textContent=prev?'Предыдущий: '+(prev.mixed?'лента переключалась':prev.ribbon?'с лентой':'без ленты')+' · '+prev.catches+'/3 волн · '+prev.landings+' посадок · '+prev.time.toFixed(1)+' с':'Повтори тот же участок с другой подсказкой.';
    document.getElementById('flow-compare').textContent=this.enabled?'ПОПРОБОВАТЬ БЕЗ ЛЕНТЫ':'ПОПРОБОВАТЬ С ЛЕНТОЙ';
    this.lastRun=run;
    document.getElementById('result-screen').classList.remove('hidden');g.container.classList.remove('playing');
  }
}
window.FlowTest=FlowTest;
