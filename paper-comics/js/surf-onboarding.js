/* Learn on the water. One contextual cue, with progress remembered for this session. */
class SurfOnboarding {
  constructor(game){this.game=game;this.completed=new Set();this.reset();}
  reset(){this.age=this.turnTime=this.neutralTime=this.jumpOfferTime=0;this.jumpOffered=false;this.turnTried=false;this.highlight='';this.clearHighlight();}
  step(dt){
    const g=this.game,p=g.p;this.age+=dt;
    if(!p.fallen&&!p.airborne&&this.age<6&&!this.completed.has('steer')){
      if(Math.abs(g.input.lean)>.18){this.turnTime+=dt;if(this.turnTime>.12)this.turnTried=true;this.neutralTime=0;}
      else if(this.turnTried){this.neutralTime+=dt;if(this.neutralTime>.18)this.completed.add('steer');}
    }
    if(g.waveRide.totalCaught>0)this.completed.add('wave');
    if(g.jump.jumps>0)this.completed.add('jump');
    if(g.jump.cleanLandings>0)this.completed.add('landing');
    if(g.balance.saves>0)this.completed.add('balance');
    if(this.jumpOffered&&!p.airborne&&!p.fallen&&g.balance.mode!=='recovery')this.jumpOfferTime+=dt;
  }
  get timeScale(){
    if(this.game.p.fallen||this.game.p.airborne)return 1;
    if(this.game.balance.mode==='recovery')return this.game.assist||this.completed.has('balance')?1:.75;
    return 1;
  }
  cue(){
    const g=this.game,p=g.p,coarse=matchMedia('(pointer:coarse)').matches,keys=g.input.mode==='keys'&&!coarse;
    this.highlight='';
    if(p.fallen)return null;
    if(g.balance.mode==='recovery'&&!this.completed.has('balance')){
      if(g.assist)return {id:'balance',title:'ОТПУСТИ ПОВОРОТ',line:'Доска сама выровняется.'};
      const roll=g.balance.roll;
      return {id:'balance',title:'ПОЙМАЙ БАЛАНС',line:roll>.08?'Коротко влево. В центре — отпусти.':roll<-.08?'Коротко вправо. В центре — отпусти.':'Не поворачивай. Держи маркер в центре.'};
    }
    if(p.airborne&&!this.completed.has('landing'))return {id:'landing',title:'ПРИЗЕМЛИСЬ РОВНО',line:g.input.mode==='gyro'?'Верни телефон в нейтраль.':keys?'Отпусти поворот.':'Отпусти палец — доска выровняется.'};
    if(!this.completed.has('steer')&&this.age<4){
      this.highlight=this.turnTried?'':'steer';
      return {id:'steer',title:this.turnTried?'ВЕРНИ КУРС В ЦЕНТР':'ПОПРОБУЙ ПОВОРОТ',line:this.turnTried?(g.input.mode==='gyro'?'Верни телефон в нейтраль.':'Отпусти поворот — доска выпрямится.'):g.input.mode==='gyro'?'Наклони телефон. Крышки ‹ › — запасной руль.':keys?'Коротко нажми ← → или A D.':'Положи палец '+(g.input.jumpSide==='right'?'слева':'справа')+' и потяни вбок.'};
    }
    if(!this.completed.has('wave')&&p.z<260){
      const guide=g.waveRide.guidance();return {id:'wave',title:guide.label,line:'Лови склон рядом с белой пеной.'};
    }
    if(!this.completed.has('jump')&&this.completed.has('wave')&&this.jumpOfferTime<5&&p.z<250&&g.balance.mode==='stable'){
      this.jumpOffered=true;this.highlight='jump';
      return {id:'jump',title:'ПРЫЖОК → ТРЮК',line:keys?'Пробел на гребне, в воздухе — трюк.':'Тап на гребне, в воздухе — трюк.'};
    }
    return null;
  }
  renderHighlight(){
    for(const [id,active] of [['steer-left',this.highlight==='steer'],['steer-right',this.highlight==='steer'],['jump-button',this.highlight==='jump']])document.getElementById(id).classList.toggle('learn-control',active);
  }
  clearHighlight(){this.highlight='';this.renderHighlight();}
}
window.SurfOnboarding=SurfOnboarding;
