/* Tricks bank separately from delivery; small spills reduce the chain multiplier. */
class TrickChain {
  constructor(game){
    this.game=game;this.el=document.getElementById('arcade-chain');this.toast=document.getElementById('chain-toast');
    this.itemsEl=this.el.querySelector('.chain-items');this.pointsEl=this.el.querySelector('.chain-points');this.countEl=this.el.querySelector('.chain-count');
    this.timerEl=this.el.querySelector('.chain-timer i');this.chaseEl=this.el.querySelector('.chase-row');
    this.chaseFill=this.el.querySelector('.chase-fill');this.chaseMult=this.el.querySelector('.chase-mult');
    this.chaseDistance=this.el.querySelector('.chase-distance');this.chaseStatus=this.el.querySelector('.chase-status');
    this.pursuitCue=document.createElement('small');this.pursuitCue.className='pursuit-cue';this.pursuitCue.setAttribute('role','status');this.el.append(this.pursuitCue);
    this.reset();
  }
  reset(){
    this.items=[];this.points=this.count=this.timer=this.toastTime=0;
    this.banked=this.burned=this.best=this.longest=this.total=this.nearMisses=0;this.lastText='';
    this.toast.classList.remove('visible');this.render();
  }
  get window(){return 2.6;}
  get multiplier(){return Math.max(1,Math.min(10,this.count));}
  get value(){return Math.round(this.points*this.multiplier);}
  add(name,points){
    const pocket=this.game.chase.multiplier,gain=Math.round(points*pocket);
    this.points+=gain;this.count++;this.items.push(pocket>1?name+' ×'+pocket:name);if(this.items.length>4)this.items.shift();
    this.timer=this.window;this.longest=Math.max(this.longest,this.count);
    return gain;
  }
  addPocket(points){
    if(!this.count){this.count=1;this.items.push('КАРМАН');}
    this.points+=points;this.timer=Math.max(this.timer,1.2);
  }
  step(dt){
    this.toastTime=Math.max(0,this.toastTime-dt);if(this.toastTime===0)this.toast.classList.remove('visible');
    if(!this.count)return;
    const g=this.game;
    if(g.p.airborne||g.trickRoute.riding||g.waveRide.caught||g.chase.level>0)this.timer=this.window;
    else if(Math.abs(g.p.lean)<.35)this.timer-=dt;
    if(this.timer<=0)this.bank();
  }
  bank(){
    if(!this.count)return 0;
    const g=this.game,count=this.count,value=this.value;
    g.score+=value;this.total+=value;this.banked++;this.best=Math.max(this.best,value);this.clear();
    if(value>=2500&&count>=3)this.show('ЗАЧТЕНО','+'+value.toLocaleString('ru-RU'),false);
    if(g.state==='playing'){
      g.juice.punch(Math.min(5,1.5+value/2500));g.juice.buzz(18);
      if(value>=2500){g.juice.hitstop(.07);g.runComic.capture('bank','БАМ!','ЦЕПОЧКА ×'+count+' · +'+value.toLocaleString('ru-RU'),40+Math.min(30,value/400));}
    }
    return value;
  }
  burn(){
    if(!this.count)return 0;
    const lost=this.value;this.burned++;this.clear();
    if(lost>=150)this.show('ЦЕПОЧКА СГОРЕЛА','−'+lost.toLocaleString('ru-RU'),true);
    return lost;
  }
  penalize(amount){
    if(amount<.01)return 0;
    if(amount>=.10)return this.burn();
    if(!this.count)return 0;
    this.count=Math.max(1,this.count-1);
    this.show('ЦЕПОЧКА ЖИВА','МНОЖИТЕЛЬ ×'+this.multiplier,true);
    return 0;
  }
  clear(){this.items=[];this.points=this.count=this.timer=0;}
  show(title,line,bad){
    if(!bad&&!this.game.reserveRewardNotice('chain:'+title))return false;
    this.toast.querySelector('strong').textContent=title;this.toast.querySelector('span').textContent=line;
    this.toast.classList.toggle('bad',bad);this.toast.classList.remove('visible');void this.toast.offsetWidth;this.toast.classList.add('visible');this.toastTime=bad?1.3:1.7;return true;
  }
  render(){
    const g=this.game,chase=g.chase,p=g.p||{},active=this.count>0;
    const text=active?this.items.join(' + '):'';
    if(text!==this.lastText){this.itemsEl.textContent=text;this.lastText=text;}
    this.pointsEl.textContent=Math.round(this.points).toLocaleString('ru-RU');this.countEl.textContent=this.multiplier;
    this.timerEl.style.transform='scaleX('+(active?THREE.MathUtils.clamp(this.timer/this.window,0,1):0)+')';
    this.el.classList.toggle('has-chain',active);this.el.classList.toggle('held',active&&(p.airborne||g.trickRoute?.riding||g.waveRide?.caught||chase.level>0));
    const chasing=!!chase?.active;this.el.classList.toggle('chasing',chasing);
    this.el.classList.toggle('pursuing',chasing&&chase.pursuit&&chase.phase!=='intro');
    this.pursuitCue.textContent=chase.critical?'ПЕНА ВПЛОТНУЮ · ПРЫГАЙ!':chase.rush>0?'ЕЩЁ ОШИБКА — ПЕНА БЛИЖЕ':chase.reason==='pace'?'МАЛО СКОРОСТИ · ЛОВИ ВОЛНУ':'ПЕНА ЗА СПИНОЙ · ЛОВИ ВОЛНУ';
    if(chasing){
      this.chaseFill.style.transform='scaleX('+THREE.MathUtils.clamp(1-(chase.gap-1.1)/20.9,0,1)+')';
      this.chaseMult.textContent='×'+chase.multiplier;this.chaseEl.dataset.level=chase.level;
      this.chaseDistance.textContent=chase.distanceLeft.toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+' М';
      const closing=chase.closingSpeed,eta=chase.impactETA;
      this.chaseStatus.textContent=p.airY>=1.2?'НАД ПЕНОЙ':closing>.35?'ДОГОНЯЕТ'+(eta<8?' · ДО УДАРА ≈ '+eta.toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+' С':''):closing<-.35?'ОТСТАЁТ':'ДЕРЖИ ОТРЫВ';
      this.chaseEl.dataset.risk=chase.critical?'critical':chase.distanceLeft<5?'close':'safe';
      this.chaseEl.title='До фронта накрытия '+this.chaseDistance.textContent+'. '+this.chaseStatus.textContent;
    }
  }
}
window.TrickChain=TrickChain;
