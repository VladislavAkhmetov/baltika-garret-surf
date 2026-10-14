/* Daily wave, records, best-run ghost and three standing missions. Everything stays in localStorage. */
const ARCADE_STORE='garret_comics_arcade_v1';
const ARCADE_MISSIONS=[
  {id:'spin',text:'Чисто приземли 360°',test:s=>s.tricks>=1},
  {id:'pocket5',text:'5 секунд в кармане ×2',test:s=>s.pocket2>=5},
  {id:'beer70',text:'Довези 70% пива',test:s=>s.finished&&s.beer>=.7},
  {id:'near3',text:'3 раза «впритык»',test:s=>s.near>=3},
  {id:'chain5',text:'Цепочка из 5 трюков',test:s=>s.longest>=5},
  {id:'bank3000',text:'Зачти цепочку на 3 000',test:s=>s.bestBank>=3000},
  {id:'wake',text:'Прокатись на следе аквабайка',test:s=>s.wake>=1},
  {id:'flip',text:'Сделай переворот ✦',test:s=>s.special>=1},
  {id:'sharkAir',text:'Перелети акулу',test:s=>s.sharkAir>=1},
  {id:'clean',text:'Ни падений, ни пены',test:s=>s.finished&&s.falls===0&&s.wipes===0},
  {id:'score20k',text:'Набери 20 000 очков',test:s=>s.score>=20000},
  {id:'beer90',text:'Довези 90% пива',test:s=>s.finished&&s.beer>=.9}
];
class RunMeta {
  constructor(game){
    this.game=game;this.data=this.load();
    const params=new URLSearchParams(location.search);
    this.today=RunMeta.dayKey(new Date());
    this.seed=params.has('seed')&&Number.isFinite(Number(params.get('seed')))?Number(params.get('seed')):RunMeta.seedFor(this.today);
    this.challenge=Math.max(0,Math.round(Number(params.get('vs'))||0));
    this.ensureMissions();this.makeGhost();this.reset();
  }
  static dayKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  static seedFor(key){let h=2166136261;for(const c of key){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0)%100000;}
  get dayLabel(){const [,m,d]=this.today.split('-');return d+'.'+m;}
  load(){if(window.FLOW_TEST_MODE)return {};try{return JSON.parse(localStorage.getItem(ARCADE_STORE))||{};}catch(_){return {};}}
  save(){if(window.FLOW_TEST_MODE)return;try{localStorage.setItem(ARCADE_STORE,JSON.stringify(this.data));}catch(_){}}
  get storySeen(){return !!this.data.storySeen;}
  markStorySeen(){if(!this.data.storySeen){this.data.storySeen=true;this.save();}}
  get daily(){return this.data.daily?.day===this.today&&this.data.daily?.seed===this.seed?this.data.daily:null;}
  ensureMissions(){
    const d=this.data;d.missions??={active:[],done:[]};d.stars??=0;
    const {active,done}=d.missions;
    if(ARCADE_MISSIONS.every(m=>done.includes(m.id)||active.includes(m.id))&&active.length<3)done.length=0;
    for(const m of ARCADE_MISSIONS){if(active.length>=3)break;if(!active.includes(m.id)&&!done.includes(m.id))active.push(m.id);}
  }
  get missions(){return this.data.missions.active.map(id=>ARCADE_MISSIONS.find(m=>m.id===id)).filter(Boolean);}
  makeGhost(){
    const g=this.game,rig=g.makeSurfer(1,0xf6ebd0);
    rig.group.scale.setScalar(1.2);
    rig.card.material.transparent=true;rig.card.material.opacity=.58;rig.card.material.depthWrite=false;
    rig.board.material.transparent=true;rig.board.material.opacity=.35;rig.shadow.visible=false;
    rig.board.children.forEach(child=>{child.material.transparent=true;child.material.opacity=.25;});
    this.ghostRig=rig;this.hideGhost();
  }
  hideGhost(){this.ghostRig.group.visible=this.ghostRig.shadow.visible=false;}
  reset(){
    this.recording=[];this.recordClock=0;this.liveClock=0;this.completedLive=new Set();this.summary=null;
    this.ghost=this.daily?.ghost||null;this.ghostIndex=0;this.hideGhost();
    if(this.challenge)this.game.container.classList.toggle('has-challenge',true);
  }
  step(dt){
    const g=this.game,p=g.p;
    this.recordClock+=dt;
    if(this.recordClock>=1/15){
      this.recordClock-=1/15;
      const r=v=>Math.round(v*100)/100;
      this.recording.push([r(g.elapsed),r(p.x),r(p.z),r(p.airY),r(p.lean)]);
    }
    this.liveClock+=dt;
    if(this.liveClock>=.25){
      this.liveClock=0;const stats=g.runStats(false);
      for(const m of this.missions){
        if(this.completedLive.has(m.id)||!m.test(stats))continue;
        this.completedLive.add(m.id);g.chain.show('ЗАДАНИЕ ✓',m.text,false);g.audio?.playCapCatch?.();
      }
    }
  }
  updateGhost(frame){
    const g=this.game,rig=this.ghostRig,samples=this.ghost;
    if(!samples||samples.length<2||g.state==='start'||g.state==='countdown'){this.hideGhost();return;}
    const t=g.elapsed;
    while(this.ghostIndex<samples.length-2&&samples[this.ghostIndex+1][0]<t)this.ghostIndex++;
    while(this.ghostIndex>0&&samples[this.ghostIndex][0]>t)this.ghostIndex--;
    const a=samples[this.ghostIndex],b=samples[this.ghostIndex+1];
    if(t>b[0]+.5){this.hideGhost();return;}
    const k=THREE.MathUtils.clamp((t-a[0])/Math.max(.001,b[0]-a[0]),0,1),lerp=i=>a[i]+(b[i]-a[i])*k;
    const x=lerp(1),z=lerp(2),air=lerp(3),lean=lerp(4),gap=z-g.p.z;
    if(gap<-4||gap>140){this.hideGhost();return;}
    const y=g.wave.height(x,z)+air;
    g.updateSurfer(rig,x,z,y,lean,air,0,frame);
    rig.group.visible=true;rig.shadow.visible=false;
  }
  finish(){
    const g=this.game,stats=g.runStats(true),d=this.data,score=Math.round(g.score);
    const completed=this.missions.filter(m=>m.test(stats));
    d.stars+=completed.length;d.missions.done.push(...completed.map(m=>m.id));
    const shown=this.missions.map(m=>({id:m.id,text:m.text,done:completed.includes(m)}));
    d.missions.active=d.missions.active.filter(id=>!completed.some(m=>m.id===id));this.ensureMissions();
    const previousBest=d.best?.score||0,previousDaily=this.daily?.score||0;
    const record=score>previousBest,dailyRecord=score>previousDaily;
    if(record)d.best={score,beer:stats.beer,day:this.today};
    if(dailyRecord)d.daily={day:this.today,seed:this.seed,score,ghost:this.recording};
    d.runs=(d.runs||0)+1;this.save();
    this.summary={score,record,dailyRecord,previousBest,previousDaily,best:Math.max(score,previousBest),missions:shown,newMissions:completed.length?this.missions.slice(-completed.length):[],stars:d.stars,
      challenge:this.challenge,beatChallenge:this.challenge>0&&score>this.challenge};
    return this.summary;
  }
}
window.RunMeta=RunMeta;window.ARCADE_MISSIONS=ARCADE_MISSIONS;
