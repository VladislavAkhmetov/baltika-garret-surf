/* A replayable beat: catch, carry speed, choose a jump, land and cash the chain. */
class DriveTest extends FlowTest {
  static layout={forkFrom:274,quietFrom:552,finish:680,rampZ:414,signZ:386};
  static opening=COMICS_COURSE.opening;
  static configureWaves(wave){
    FlowTest.configureWaves(wave);
    Object.assign(wave.waves[0],{anchorFrom:-72,anchorTo:180,encounterTime:54/28,
      flowShape:[-3.6,-4.8,-3,-4.2],flowFace:[.34,.30,.48,.30]});
    Object.assign(wave.waves[1],{anchorFrom:144,anchorTo:358,encounterTime:251/28});
    const last=wave.waves[2];
    Object.assign(last,{anchorFrom:302,anchorTo:552,encounterTime:427/28,
      flowShape:[-4.2,-5.2,-4.6,-3.2],flowFace:[.38,.43,.38,.40]});
  }
  constructor(game){
    super(game);
    game.container.classList.add('drive-test');
    this.riskGuide=new WaveRibbon(game,{enabled:this.enabled,route:z=>this.riskPoint(z),
      height:(x,z)=>game.trickRoute.guidanceHeight(x,z)});
    this.signs=[['ВЫЛЕТ',-2.7,DriveTest.layout.signZ,'#c56943'],['ОБЪЕЗД',3.1,DriveTest.layout.signZ,'#236b67']].map(([text,x,z,color])=>{
      const mesh=game.sprite(game.label(text,color,256,64),3.6,.9);
      mesh.visible=false;return {mesh,x,z};
    });
  }
  mount(){
    super.mount();
    document.title='Поймай кураж — Paper Comics';
    const start=document.getElementById('start-screen');
    start.querySelector('.menu-title').innerHTML='ПОЙМАЙ<br>КУРАЖ.';
    start.querySelector('.flow-eyebrow').textContent='СЛАЛОМ · СВЯЗКА · БОЛЬШОЙ ВЫЛЕТ';
    start.querySelector('.flow-intro-copy>p').innerHTML='Сразу на волне: обходи буи.<br>Связывай волны и выбирай вылет.';
    this.stage.parentElement.querySelector('small').textContent='ПОЙМАЙ КУРАЖ';
    const hud=document.createElement('div');hud.className='drive-hud';
    hud.innerHTML='<div class="drive-banked"><small>ЗАЧТЕНО</small><strong id="drive-score">0</strong></div><div class="drive-pending"><small id="drive-chain-label">СВЯЖИ ВОЛНЫ</small><strong id="drive-chain">0</strong><div class="drive-chain-track"><i id="drive-chain-fill"></i></div></div><div class="drive-beer"><small>ДОВЕЗИ ≥30%</small><strong id="drive-beer">100%</strong></div>';
    this.game.container.append(hud);this.hud=hud;
    const result=document.querySelector('.flow-result');
    result.querySelector('.flow-eyebrow').textContent='ПОЙМАЙ КУРАЖ';
    result.querySelector('h2').id='drive-result-title';
    const summary=document.createElement('p');summary.id='drive-result-summary';
    result.querySelector('.flow-stats').after(summary);
    const compare=document.getElementById('flow-compare');
    compare.hidden=true;
    const baseline=document.createElement('a');baseline.href='index.html?flowtest=1';baseline.textContent='Сравнить с «Тремя волнами» ↗';
    result.append(baseline);
    const link=document.createElement('a');link.className='drive-baseline';link.href='index.html?flowtest=1';link.textContent='Исходные «Три волны» ↗';start.append(link);
    this.renderHUD();
  }
  setEnabled(enabled){
    super.setEnabled(enabled);this.riskGuide?.setEnabled(enabled);
  }
  reset(){
    super.reset();
    const g=this.game;
    g.distance=DriveTest.layout.finish;g.p.x=DriveTest.opening[0].x;g.p.speed=29;this.maxSpeed=29;
    this.momentum=0;this.bestMomentum=0;this.banks=0;this.softErrors=0;this.hardErrors=0;
    this.firstCatchTime=null;
    this.choice='bypass';this.landedRamp=false;this.lastAward=null;this.awardAt=new Map();this.lastBank=0;
    const buoys=g.world.hazards.filter(h=>h.type==='buoy').slice(0,3);
    const placements=[{x:1.4,z:35},{x:-1.6,z:80},{x:1.5,z:125}];
    this.openingHazards=buoys;
    buoys.forEach((h,i)=>Object.assign(h,{...placements[i],initialX:placements[i].x,initialZ:placements[i].z,done:false}));
    this.riskGuide?.reset();
    this.renderHUD();
  }
  routePoint(z){
    // The ordinary line stays on the open shoulder, clear of the optional ramp.
    const base=super.routePoint(z);
    const opening=DriveTest.opening,smooth=this.game.wave.smooth;
    if(z<=opening[opening.length-1].z){
      const i=Math.max(0,opening.findIndex(point=>point.z>=z)-1),a=opening[i],b=opening[i+1];
      return THREE.MathUtils.lerp(a.x,b.x,smooth((z-a.z)/(b.z-a.z)));
    }
    if(z<214)return THREE.MathUtils.lerp(opening[opening.length-1].x,super.routePoint(214)??.8,smooth((z-174)/40));
    const {forkFrom,quietFrom}=DriveTest.layout;
    if(z<forkFrom||z>quietFrom)return base;
    const blend=smooth(Math.min((z-forkFrom)/70,(quietFrom-z)/55));
    return THREE.MathUtils.lerp(base??2.4,2.8,blend);
  }
  riskPoint(z){
    const line=this.game.trickRoute.lines[0];
    const {forkFrom,quietFrom}=DriveTest.layout,returnZ=quietFrom-40;
    if(!line||z<forkFrom||z>returnZ)return null;
    const entry=line.entry,exit=line.exit,smooth=this.game.wave.smooth;
    if(z<entry.z)return THREE.MathUtils.lerp(this.routePoint(forkFrom)??1,line.x,smooth((z-forkFrom)/(entry.z-forkFrom)));
    if(z<=exit.z)return line.x;
    return THREE.MathUtils.lerp(line.x,this.routePoint(returnZ)??2.8,smooth((z-exit.z)/(returnZ-exit.z)));
  }
  stepRide(dt,s){
    const before=this.caughtWaves.size;
    super.stepRide(dt,s);
    this.momentum=Math.max(0,this.momentum-dt*(this.game.p.airborne?.20:this.game.waveRide.caught?.18:.85));
    if(this.caughtWaves.size>before){
      if(this.firstCatchTime===null)this.firstCatchTime=this.game.time;
      this.momentum=Math.min(7,this.momentum+3.5);
      this.game.awardTrick('ПОДХВАТ',160,true);
      if(before)this.game.awardTrick('СВЯЗАЛ ВОЛНЫ',240,true);
      this.say(before?'СВЯЗАЛ! СОХРАНИ РАЗГОН':'ПОДХВАТИЛО!',1.2);
    }
    this.bestMomentum=Math.max(this.bestMomentum,this.momentum);
  }
  targetSpeed(slope){
    const base=super.targetSpeed(slope);
    return THREE.MathUtils.clamp(base+this.momentum,19,42);
  }
  award(name,points=0){
    const g=this.game;
    // Carving pays at most once per wave; varied transitions grow the chain.
    const source=name==='КАРВИНГ'?name+':'+g.waveRide.activeId:name;
    if(name==='КАРВИНГ'&&this.awardAt.has(source))return;
    this.awardAt.set(source,g.time);
    g.chain.add(name,points);g.combo=g.chain.multiplier;
    this.lastAward=name;
    if(['ВПРИТЫК!','НАД БУЕМ!','РАЗОШЛИСЬ'].includes(name)){
      this.momentum=Math.min(8,this.momentum+2);this.say(name+' · РАЗГОН!',1.1);
    }
    if(['360°','ПЕРЕВОРОТ!','ПРЯМОЙ ВЫЛЕТ','МЯГКАЯ ПОСАДКА'].includes(name)){
      if(g.jump.takeoffRamp){this.landedRamp=true;this.choice='ramp';}
      this.momentum=Math.min(8,this.momentum+(name==='ПЕРЕВОРОТ!'?5:3));
      this.say(name==='ПРЯМОЙ ВЫЛЕТ'?'ЧИСТО! РАЗГОН СОХРАНЁН':name+' · ЧИСТО!',1.4);
      g.audio.playTrickTriumph(.8);g.juice.punch(4);
    }
  }
  handleSpill(amount){
    const g=this.game;
    if(amount>=.10){
      this.hardErrors++;g.chain.burn();this.momentum=0;
      this.say('ЦЕПОЧКА СГОРЕЛА · ЛОВИ СЛЕДУЮЩУЮ',1.5);
    }else{
      this.softErrors++;
      if(g.chain.count)g.chain.count=Math.max(1,g.chain.count-1);
      this.momentum*=.55;
      this.say('ПОШАТНУЛО · ЦЕПОЧКА ЖИВА',1.4);
    }
    return true;
  }
  bank(){
    const g=this.game;if(!g.chain.count)return;
    // Delivery is a separate objective here, so a splash cannot reduce all future scores.
    const value=g.chain.value;g.score+=value;g.chain.total+=value;g.chain.best=Math.max(g.chain.best,value);
    g.chain.banked++;g.chain.clear();this.banks++;this.lastBank=value;
    this.say('ЗАЧТЕНО +'+value.toLocaleString('ru-RU'),1.6);
    g.audio.playTrickTriumph(.9);g.juice.punch(3);g.juice.buzz(18);
  }
  step(dt){
    const g=this.game,p=g.p,chain=g.chain;
    g.world.step(dt,this.openingHazards);
    if(g.trickRoute.launches)this.choice='ramp';
    if(chain.count){
      const active=p.airborne||!!g.trickRoute.riding||(p.z<DriveTest.layout.quietFrom&&g.waveRide.caught);
      if(active)chain.timer=chain.window;
      else if(Math.abs(p.lean)<.35)chain.timer-=dt;
      if(chain.timer<=0)this.bank();
    }
  }
  renderHUD(){
    if(!this.hud)return;
    const g=this.game,chain=g.chain;
    document.getElementById('drive-score').textContent=Math.round(g.score).toLocaleString('ru-RU');
    document.getElementById('drive-chain').textContent=chain.count?Math.round(chain.points).toLocaleString('ru-RU')+' ×'+chain.multiplier:'—';
    document.getElementById('drive-chain-label').textContent=chain.count?(g.p.z>=DriveTest.layout.quietFrom?'ВЫРОВНЯЙ ДОСКУ — ЗАЧЁТ':'ЦЕПОЧКА В ИГРЕ'):'СВЯЖИ ВОЛНЫ';
    document.getElementById('drive-chain-fill').style.transform='scaleX('+(chain.count?THREE.MathUtils.clamp(chain.timer/chain.window,0,1):0)+')';
    document.getElementById('drive-beer').textContent=Math.floor(g.mug.level*100)+'%';
    this.hud.classList.toggle('has-chain',chain.count>0);
  }
  update(dt){
    super.update(dt);
    const g=this.game,p=g.p;this.riskGuide.update();
    for(const h of this.openingHazards){
      h.group.visible=['playing','paused'].includes(g.state)&&h.z-p.z<120&&h.z-p.z>-12;
      if(h.type==='jetski')h.wake.forEach(m=>{m.visible=h.activeAt!==null&&g.time-h.activeAt<9&&h.z-p.z>-35;});
    }
    for(const sign of this.signs){
      sign.mesh.visible=['playing','paused'].includes(g.state)&&sign.z-p.z<108&&sign.z-p.z>24;
      sign.mesh.position.set(-sign.x,g.wave.height(sign.x,sign.z)+2.5,sign.z);
    }
    if(!this.stage)return;
    const {forkFrom,quietFrom,rampZ}=DriveTest.layout;
    this.stage.textContent=p.z<144?'01 / СЛАЛОМ':p.z<214?'02 / ЛОВИ ВОЛНУ':p.z<forkFrom?'03 / СВЯЗКА':p.z<rampZ-6?'04 / ВЫБОР':p.z<quietFrom?'05 / ВЫЛЕТ':'06 / ЗАЧЁТ';
    let text=this.cue.textContent;
    const imminentBuoy=this.openingHazards.find(h=>h.type==='buoy'&&h.z-p.z>2&&h.z-p.z<60);
    if(imminentBuoy&&!p.airborne&&!p.recovering){
      text=imminentBuoy.x>0?'← БУЙ СПРАВА · ОБОЙДИ ИЛИ ПРЫГНИ':'БУЙ СЛЕВА · ОБОЙДИ ИЛИ ПРЫГНИ →';
    }else if(g.time>=this.noticeUntil){
      if(p.airborne)text=g.jump.canSpecial?'ЕЩЁ НАЖАТИЕ — ПЕРЕВОРОТ':g.jump.canSpin?'ЕЩЁ НАЖАТИЕ — 360°':'ГОТОВЬ ПОСАДКУ';
      else if(g.trickRoute.riding)text='ПРЫЖОК — УСИЛЬ ВЫЛЕТ';
      else if(p.z<132){
        const buoy=this.openingHazards.find(h=>h.type==='buoy'&&h.z-p.z>2);
        text=buoy?(buoy.x>0?'← БУЙ СПРАВА · ОБОЙДИ ИЛИ ПРЫГНИ':'БУЙ СЛЕВА · ОБОЙДИ ИЛИ ПРЫГНИ →'):'ДЕРЖИ РАЗГОН';
      }
      else if(p.z<182)text='ДЕРЖИ СКЛОН · ГОТОВЬ СВЯЗКУ';
      else if(p.z>=quietFrom)text=g.chain.count?'ОТПУСТИ ПОВОРОТ — ЗАЧТИ ЦЕПОЧКУ':'ДОВЕЗИ БОКАЛ';
      else if(p.z>=forkFrom&&p.z<rampZ-6)text='← ТРАМПЛИН · ОБЪЕЗД →';
      else if(p.z>=rampZ-6&&this.choice==='ramp')text='СОХРАНИ РАЗГОН ПОСЛЕ ПОСАДКИ';
      else if(g.waveRide.caught)text='СВЯЖИ ДУГУ СО СЛЕДУЮЩЕЙ ВОЛНОЙ';
    }
    this.cue.textContent=text;this.renderHUD();
  }
  finish(){
    if(this.game.state==='finished')return;
    this.bank();
    const prev=this.lastRun;
    super.finish();
    const run=this.lastRun,g=this.game;
    Object.assign(run,{score:g.score,choice:this.choice,beer:g.mug.level,banks:this.banks,rampLanded:this.landedRamp,softErrors:this.softErrors,firstCatchTime:this.firstCatchTime,
      openingPassed:this.openingHazards.filter(h=>h.passed&&!h.hit).length,openingHits:this.openingHazards.filter(h=>h.hit).length});
    const success=g.mug.level>=.30;
    document.getElementById('drive-result-title').textContent=success?'ДОВЁЗ С КУРАЖОМ!':'РАЗОГНАЛСЯ, НО РАСПЛЕСКАЛ';
    document.getElementById('flow-result-mode').textContent=this.choice==='ramp'?(this.landedRamp?'Через трамплин · чистая посадка':'Через трамплин · попробуй посадку ровнее'):'Спокойный объезд · бокал важнее';
    const banksLabel=run.banks%10===1&&run.banks%100!==11?'зачёт':run.banks%10>=2&&run.banks%10<=4&&(run.banks%100<12||run.banks%100>14)?'зачёта':'зачётов';
    document.getElementById('drive-result-summary').textContent=Math.round(run.score).toLocaleString('ru-RU')+' очков · '+Math.floor(run.beer*100)+'% довёз · '+run.banks+' '+banksLabel+' цепочки';
    document.getElementById('flow-comparison').textContent=prev&&Number.isFinite(prev.score)?'Предыдущий: '+(prev.choice==='ramp'?'трамплин':'объезд')+' · '+Math.round(prev.score).toLocaleString('ru-RU')+' очков · '+prev.time.toFixed(1)+' с':'Повтори: попробуй другой путь или добавь трюк.';
    this.renderHUD();
  }
}
window.DriveTest=DriveTest;
