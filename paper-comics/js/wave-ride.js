/* The sloped surface itself is the rideable wave; no independent booster lane. */
class WaveRide {
  constructor(game){this.game=game;this.reset();}
  reset(){
    this.charge=this.boost=this.quality=0;this.caught=false;this.zone='flat';this.totalCaught=0;this.transfers=0;
    this.capturedIds=new Set();this.crestAwards=new Set();this.cutbackAwards=new Set();this.lastId=null;this.lastCatchTime=-100;
    this.crestTime=0;this.departure=null;this.activeId=null;this.previousFace=null;
    this.catchPulse=0;this.soundClock=0;
    this.momentum=0;this.firstCatchTime=null;
  }
  reward(name){
    if(['ВПРИТЫК!','НАД БУЕМ!','РАЗОШЛИСЬ'].includes(name))this.momentum=Math.min(8,this.momentum+2);
    if(['360°','КОСОЙ 360°','ПЕРЕВОРОТ!','ПРЯМОЙ ВЫЛЕТ','БОКОВОЙ ПЕРЕЛЁТ','МЯГКАЯ ПОСАДКА'].includes(name))this.momentum=Math.min(8,this.momentum+(name==='ПЕРЕВОРОТ!'?5:3));
  }
  step(dt){
    const g=this.game,p=g.p,s=g.wave.sample(p.x,p.z),w=s.wave;
    if(g.flowTest){g.flowTest.stepRide(dt,s);return;}
    this.momentum=Math.max(0,this.momentum-dt*(p.airborne?.20:this.caught?.18:.85));
    this.zone=s.zone;
    const direction=w?Math.atan((g.wave.crestX(w,p.z+1)-g.wave.crestX(w,p.z-1))/2/.38):0;
    this.catchPulse=Math.max(0,this.catchPulse-dt*1.8);this.soundClock=Math.max(0,this.soundClock-dt);
    const alignment=THREE.MathUtils.clamp(1-Math.abs(p.heading-direction)*.65,.25,1);
    const energy=s.face<0?0:s.zone==='crest'?.72:Math.exp(-Math.pow((s.face-.34)/.37,2));
    this.quality=w&&s.face<.78?s.energy*energy*alignment:0;
    const engaging=this.quality>.12&&p.recovering===0&&!p.airborne;
    const waveId=w?.id??null;
    if(waveId!==this.activeId){this.charge*=.5;this.crestTime=0;this.departure=null;this.previousFace=null;this.activeId=waveId;}
    if(this.departure&&(g.time-this.departure.time>3||p.recovering>0))this.departure=null;
    this.charge=THREE.MathUtils.clamp(this.charge+dt*(engaging?3.2*this.quality:-1.5),0,1);
    this.caught=engaging&&this.charge>.32;
    const descending=this.previousFace!==null?Math.max(0,(s.face-this.previousFace)/dt):0;
    const pump=this.caught?Math.min(3.4,descending*6):0;
    const target=this.caught?(7.5+this.quality*5.5)*this.charge*Math.min(1,s.energy*1.5)+pump:0;
    this.boost+=(target-this.boost)*(1-Math.exp(-dt*(this.caught?5:1.2)));
    if(this.caught&&w){
      if(!this.capturedIds.has(w.id)){
        const transfer=this.lastId!==null&&this.lastId!==w.id&&g.time-this.lastCatchTime<4.8;
        this.capturedIds.add(w.id);this.totalCaught++;this.lastId=w.id;g.awardTrick('ПОЙМАЛ ВОЛНУ',120,this.totalCaught>1);
        this.firstCatchTime??=g.time;this.momentum=Math.min(7,this.momentum+3.5);
        p.speed=Math.min(g.assist?38:42,p.speed+2.4+this.quality*1.8);this.catchPulse=1;
        g.ribbon?.catchWave();g.juice.punch(3.8);g.juice.buzz(18);g.emit(18,1.15,true);g.audio?.playCarve(.95);this.soundClock=.9;
        if(transfer){this.transfers++;g.awardTrick('ПЕРЕХОД',220,true);}
      }
      this.lastCatchTime=g.time;
      this.crestTime=s.zone==='crest'&&p.balance<.5?this.crestTime+dt:Math.max(0,this.crestTime-dt*2);
      if(this.crestTime>1.15&&!this.crestAwards.has(w.id)){
        this.crestAwards.add(w.id);g.awardTrick('НА ГРЕБНЕ',250,true);
      }
      if(Math.abs(p.lean)>.24&&this.soundClock===0){g.audio?.playCarve(Math.min(1.1,.4+this.quality));this.soundClock=.9;}
    }
    // A shoulder turn briefly loses the pocket's acceleration. Keep the
    // departure outside the caught state, then require contact on the return.
    const relativeHeading=p.heading-direction;
    if(w&&!this.departure&&this.capturedIds.has(w.id)&&g.time-this.lastCatchTime<1&&this.previousFace!==null&&this.previousFace<=.67&&s.face>.67&&relativeHeading>.06&&!this.cutbackAwards.has(w.id)){
      this.departure={id:w.id,time:g.time,returning:false};
    }
    if(this.departure&&relativeHeading<-.06)this.departure.returning=true;
    if(this.departure?.returning&&this.caught&&s.face<.53&&!this.cutbackAwards.has(w.id)){
      this.cutbackAwards.add(w.id);g.awardTrick('КАТБЭК',180);this.departure=null;
    }
    this.previousFace=w?s.face:null;
  }
  guidance(){
    const g=this.game,p=g.p,s=g.wave.field(p.x,p.z),waves=g.wave.waves;
    let w=s.wave;
    if(!w)w=waves.filter(w=>p.z>w.from&&p.z<w.to).sort((a,b)=>g.wave.envelope(b,p.z)-g.wave.envelope(a,p.z))[0];
    const arrow=wave=>{
      const z=THREE.MathUtils.clamp(p.z+24,wave.from+24,wave.to-24);
      const delta=g.wave.crestX(wave,z)+wave.width*.42-p.x;
      return delta<-.7?'←':delta>.7?'→':'ПРЯМО';
    };
    if(w){
      const remaining=Math.max(0,Math.ceil(w.to-p.z)),next=waves.find(next=>next.id>w.id);
      const ending=remaining<=30;
      const zones={crest:'ГРЕБЕНЬ · ДЕРЖИ БАЛАНС',face:'СКЛОН · РЕЖЬ ДУГУ',base:'ПОДНОЖИЕ · НАБИРАЙ ВЫСОТУ',back:'ЗА ГРЕБНЕМ · ВЕРНИСЬ'};
      const onSurface=s.wave?.id===w.id;
      const caught=onSurface&&this.caught;
      return {number:(w.id+1)+'/'+waves.length,phase:ending?'ending':caught?'ride':'catch',
        label:onSurface?(s.zone==='back'?'ЗА ГРЕБНЕМ · ВЕРНИСЬ '+arrow(w):caught?zones[s.zone]:'ЛОВИ СКЛОН '+arrow(w)):'ВОЛНА РЯДОМ · ВХОДИ '+arrow(w),
        status:ending?(next?'ГОТОВЬ ПЕРЕХОД':'ПОСЛЕДНЯЯ ВОЛНА'):caught?'РАЗГОН +'+Math.round(this.boost):'ЛОВЛЯ '+Math.round(this.charge*100)+'%',
        remaining:ending&&next?'НОВАЯ '+arrow(next):'ЕЩЁ '+remaining+' М'};
    }
    const next=waves.find(w=>w.from>=p.z);
    return next?{number:(next.id+1)+'/'+waves.length,phase:'gap',label:'ВОЛНА ВПЕРЕДИ '+arrow(next),status:'СПОКОЙНЫЙ УЧАСТОК',remaining:'ЧЕРЕЗ '+Math.ceil(next.from-p.z)+' М'}:
      {number:waves.length+'/'+waves.length,phase:'finish',label:'БАР ПРЯМО ПО КУРСУ',status:'ДОВЕЗИ ОСТАТКИ',remaining:Math.max(0,Math.ceil(g.distance-p.z))+' М'};
  }
  update(){}
}
window.WaveRide=WaveRide;
