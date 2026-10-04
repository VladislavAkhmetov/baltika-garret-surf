/* The sloped surface itself is the rideable wave; no independent booster lane. */
class WaveRide {
  constructor(game){this.game=game;this.reset();}
  reset(){
    this.charge=this.boost=this.quality=0;this.caught=false;this.zone='flat';this.totalCaught=0;this.transfers=0;
    this.capturedIds=new Set();this.crestAwards=new Set();this.cutbackAwards=new Set();this.lastId=null;this.lastCatchTime=-100;
    this.crestTime=0;this.departure=null;this.activeId=null;this.previousFace=null;
  }
  step(dt){
    const g=this.game,p=g.p,s=g.wave.sample(p.x,p.z),w=s.wave;
    this.zone=s.zone;
    const direction=w?Math.atan((g.wave.crestX(w,p.z+1)-g.wave.crestX(w,p.z-1))/2/.38):0;
    const alignment=Math.max(.2,1-Math.abs(p.heading-direction)/1.2);
    const energy=s.face<0?0:s.face<.18?.72:s.face<.65?1:.5;
    this.quality=w&&s.face<.96?s.energy*energy*alignment:0;
    const engaging=this.quality>.2&&p.recovering===0&&!p.airborne;
    const waveId=w?.id??null;
    if(waveId!==this.activeId){this.charge*=.5;this.crestTime=0;this.departure=null;this.previousFace=null;this.activeId=waveId;}
    if(this.departure&&(g.time-this.departure.time>3||p.recovering>0))this.departure=null;
    this.charge=THREE.MathUtils.clamp(this.charge+dt*(engaging?2.3*this.quality:-1.35),0,1);
    this.caught=engaging&&this.charge>.24;
    const pocket=Math.exp(-Math.pow((s.face-.42)/.28,2));
    const target=this.caught?(s.zone==='crest'?7:3+9*pocket)*this.charge*s.energy:0;
    this.boost+=(target-this.boost)*(1-Math.exp(-dt*(this.caught?3:1.8)));
    if(this.caught&&w){
      if(!this.capturedIds.has(w.id)){
        const transfer=this.lastId!==null&&this.lastId!==w.id&&g.time-this.lastCatchTime<4.8;
        this.capturedIds.add(w.id);this.totalCaught++;this.lastId=w.id;g.awardTrick('ПОЙМАЛ ВОЛНУ',120);
        if(transfer){this.transfers++;g.awardTrick('ПЕРЕХОД',220,true);if(p.speed>31&&p.balance<.35)g.comics.trigger('ВЖУХ!','С ОДНОЙ ВОЛНЫ НА ДРУГУЮ','transfer');}
      }
      this.lastCatchTime=g.time;
      this.crestTime=s.zone==='crest'&&p.balance<.5?this.crestTime+dt:Math.max(0,this.crestTime-dt*2);
      if(this.crestTime>1.15&&!this.crestAwards.has(w.id)){
        this.crestAwards.add(w.id);g.awardTrick('НА ГРЕБНЕ',250,true);g.comics.trigger('УАУ!','ВЫШЕ ВСЕХ. ПИВО НА МЕСТЕ.','crest');
      }
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
