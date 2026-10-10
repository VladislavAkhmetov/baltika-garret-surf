/* Tap to leave the water; a second tap chooses the trick earned at takeoff. */
class SurfJump {
  constructor(game){
    this.game=game;this.button=document.getElementById('jump-button');this.reset();
    this.button.addEventListener('pointerdown',e=>{e.preventDefault();if(this.pointerId!==null||e.button>0)return;this.pointerId=e.pointerId;if(e.isTrusted)this.button.setPointerCapture(e.pointerId);this.press();});
    this.button.addEventListener('pointerup',e=>{e.preventDefault();if(e.pointerId===this.pointerId){this.pointerId=null;this.release();}});
    this.button.addEventListener('pointercancel',e=>{if(e.pointerId===this.pointerId)this.cancel();});
    this.button.addEventListener('lostpointercapture',e=>{if(e.pointerId===this.pointerId)this.cancel();});
    this.button.addEventListener('keydown',e=>{if(['Space','Enter'].includes(e.code)&&this.game.input.active){e.preventDefault();if(!e.repeat)this.press();}});
    window.addEventListener('keydown',e=>{if(e.code==='Space'&&this.game.input.active&&!e.target.closest?.('button,input,select,textarea')){e.preventDefault();if(!e.repeat)this.press();}});
    window.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();this.release();}});
    window.addEventListener('blur',()=>this.cancel());
  }
  reset(){this.holding=this.requested=this.apexFired=this.specialLaunch=false;this.charge=this.cooldown=this.airTime=this.lastHeight=this.landingBoost=this.landingPulse=this.landingAge=this.boardPitch=this.launchStrength=this.sideKick=0;this.gravity=20;this.takeoffZone='flat';this.takeoffWave=this.takeoffSource=this.takeoffRamp=null;this.jumps=this.cleanLandings=this.tricks=this.specialTricks=this.airTransfers=this.rampTricks=0;this.rewardedWaves=new Map();this.clearSpin();this.cancel();this.button?.classList.remove('airborne');this.updateButton();}
  clearSpin(){this.spinStarted=this.spinCompleted=false;this.spinShot=null;this.spinProgress=this.spinRequest=0;this.spinDirection=1;this.spinDuration=.68;this.trickKind=null;if(this.game.p)this.game.p.spin=0;}
  get flightRemaining(){const p=this.game.p;return p?.airborne?(p.jumpVelocity+Math.sqrt(p.jumpVelocity*p.jumpVelocity+2*this.gravity*p.airY))/this.gravity:0;}
  get canSpin(){const p=this.game.p;return !!p?.airborne&&!this.spinStarted&&p.jumpVelocity>-6&&p.airY>.45&&this.airTime>.04&&(!this.game.assist||this.flightRemaining>.30);}
  get canSpecial(){return this.canSpin&&this.specialLaunch&&this.flightRemaining>1.02;}
  cancel(){this.pointerId=null;this.holding=this.requested=false;this.charge=this.spinRequest=0;this.button?.classList.remove('preparing');this.button?.style.setProperty('--jump-charge','0deg');this.button?.style.setProperty('--jump-percent','0%');}
  press(){
    if(this.game.state!=='playing'||document.getElementById('controls-screen')?.classList.contains('hidden')===false)return;
    if(this.canSpin){this.startSpin();return;}
    // A quick second tap just after takeoff waits briefly for enough clearance above the water.
    if(this.game.p.airborne&&!this.spinStarted&&this.airTime<.16){this.spinRequest=.18;return;}
    if(this.holding||this.game.p.airborne||this.game.p.fallen||this.game.p.recovering>0||this.cooldown>0)return;
    this.requested=true;
  }
  startSpin(){
    this.trickKind=this.canSpecial?'flip':this.takeoffRamp?.type==='side'?'cork':'spin';this.spinStarted=true;this.spinRequest=0;
    this.spinDirection=this.trickKind==='flip'?-1:this.game.p.lean<0?-1:1;
    this.spinDuration=this.trickKind==='flip'?.86:this.game.assist?THREE.MathUtils.clamp(this.flightRemaining*.72,.20,.62):.68;
  }
  release(){}
  launchRamp(line,surface,pop=false){
    const g=this.game,p=g.p;
    this.takeoffRamp=line;this.takeoffZone='ramp';this.takeoffWave=surface.wave?.id??null;this.takeoffSource='ramp:'+line.id;
    this.airTime=this.lastHeight=0;this.apexFired=false;this.clearSpin();
    const speed=THREE.MathUtils.clamp(p.speed-24,0,16);
    p.jumpVelocity=THREE.MathUtils.clamp((line.type==='side'?10.8:12.4)+speed*.15+(pop?1.3:0),10.8,15);
    this.specialLaunch=line.type==='straight'&&p.jumpVelocity>=12.5;
    this.sideKick=line.type==='side'?line.side*6.5:0;
    if(line.type==='side'){p.sideVelocity=line.side*5.2;p.heading=line.side*.18;}
    this.launchStrength=THREE.MathUtils.clamp((p.jumpVelocity-7)/7.8,0,1);this.landingPulse=0;
    p.airborne=true;p.takeoffHeight=surface.height;p.y=surface.height+.06;p.airY=.06;p.crouch=.7;
    g.trailPoints=[];this.jumps++;g.heroAnimator.beginTurn(0);g.emit(18,.85,true);
    g.audio.playJump(this.launchStrength);g.juice.punch(2.8);g.juice.buzz(18);
    this.updateButton();
  }
  step(dt,surface){
    const g=this.game,p=g.p;this.cooldown=Math.max(0,this.cooldown-dt);
    this.landingBoost*=Math.exp(-dt/.95);this.sideKick*=Math.exp(-dt/1.1);
    this.landingAge+=dt;this.landingPulse=Math.max(0,this.landingPulse-dt/ .38);
    if(this.requested){
      this.requested=false;
      if(!p.airborne&&this.cooldown===0){
        this.takeoffRamp=null;this.sideKick=0;
        this.takeoffZone=surface.zone;this.takeoffWave=surface.wave?.id??null;
        const wake=g.world.wakeSourceAt(p.x,p.z);
        this.takeoffSource=wake.quality>.3?'wake:'+wake.hazard.index:this.takeoffWave;
        this.airTime=this.lastHeight=0;this.apexFired=false;this.clearSpin();
        const rise=THREE.MathUtils.clamp(surface.dz*p.speed*Math.cos(p.heading)+surface.dx*p.sideVelocity+surface.waterVelocity,0,1.4);
        const lip=surface.wave?surface.wave.height*surface.energy*(.85+surface.crest*1.05):0;
        p.airborne=true;p.jumpVelocity=THREE.MathUtils.clamp(6.2+lip+rise+Math.max(0,p.speed-24)*.08+wake.quality*2.8,6.2,14.8);
        this.specialLaunch=!!surface.wave&&surface.wave.height>=4.2&&surface.energy>=.7&&surface.crest>=.72&&p.speed>=25.5&&p.jumpVelocity>=12.5;
        this.launchStrength=THREE.MathUtils.clamp((p.jumpVelocity-7)/7.8,0,1);this.landingPulse=0;
        p.takeoffHeight=surface.height;p.y=surface.height+.06;p.crouch=.6;g.trailPoints=[];this.jumps++;
        g.heroAnimator.beginTurn(0);g.emit(12,.7,true);
        g.juice.punch(1.2+this.launchStrength*1.7);g.juice.buzz(12);
        if(g.audio)g.audio.playJump(this.launchStrength);
      }
      this.charge=0;
    }
    if(p.airborne){
      this.airTime+=dt;p.jumpVelocity-=this.gravity*dt;p.y+=p.jumpVelocity*dt;p.airY=Math.max(0,p.y-surface.height);
      if(this.spinRequest>0){this.spinRequest=Math.max(0,this.spinRequest-dt);if(this.canSpin)this.startSpin();}
      const lift=g.wave.smooth(this.airTime/.14),level=g.wave.smooth((this.airTime-.22)/(.45+this.launchStrength*.12));
      const glide=(.16+this.launchStrength*.22)*g.wave.smooth((this.airTime-.35)/.25)*g.wave.smooth(this.flightRemaining/.35);
      this.boardPitch=(.40+this.launchStrength*1.03)*lift*(1-level)+glide;
      if(this.spinStarted&&!this.spinCompleted){
        this.spinProgress=Math.min(1,this.spinProgress+dt/this.spinDuration);
        const ease=this.spinProgress*this.spinProgress*(3-2*this.spinProgress);
        p.spin=this.spinDirection*ease*Math.PI*2;
        if(!this.spinShot&&this.spinProgress>=.5)this.spinShot=g.runComic.capture(this.trickKind,this.trickKind==='flip'?'БАМ!':'ВЖУХ!',this.trickKind==='flip'?'ПЕРЕВОРОТ С КРУЖКОЙ':this.trickKind==='cork'?'КОСОЙ 360°':'360° НАД ВОЛНОЙ',this.trickKind==='flip'?92:70);
        if(this.spinProgress===1){this.spinCompleted=true;p.spin=0;}
      }
      this.lastHeight=Math.max(this.lastHeight,p.airY);
      if(!this.apexFired&&p.jumpVelocity<=0){
        this.apexFired=true;
        if(p.airY>1.5&&g.audio)g.audio.playCrowdAwe();
        if(p.airY>3.2&&!this.spinStarted)g.runComic.capture('air','ОП-ПА!','ВЫШЕ ГРЕБНЯ',48);
      }
      if(p.jumpVelocity<0&&p.y<=surface.height){
        const impact=THREE.MathUtils.clamp(Math.abs(p.jumpVelocity)/14,.25,1);
        p.airborne=false;p.airY=0;p.y=surface.height;p.jumpVelocity=0;this.cooldown=.55;
        this.boardPitch=0;this.landingPulse=.65+impact*.35;this.landingAge=0;
        const unfinished=this.spinStarted&&!this.spinCompleted;
        // Routine landings are assisted; choosing a late trick is the real risk.
        const clean=THREE.MathUtils.clamp(1-Math.abs(p.pitch)*.26-Math.abs(p.lean-p.smoothLean)*.35-Math.abs(p.heading)*.10-(unfinished?.72:0),0,1);
        g.handBeer.impact(clean);g.emit(22+Math.round(impact*18),.9+impact*.65,true);g.landingSplash?.(impact);p.crouch=.85;
        if(g.audio)g.audio.playLanding(clean>.72,impact);
        if(clean>.72){
          if(!this.spinCompleted){g.juice.punch(1.4);g.juice.buzz(16);}
          if(g.assist)g.balance.immunity=Math.max(g.balance.immunity,.65);
          this.cleanLandings++;
          const special=this.spinCompleted&&this.trickKind==='flip';
          const transfer=this.takeoffWave!==null&&surface.wave&&surface.wave.id!==this.takeoffWave&&surface.face>=0&&surface.energy>.3;
          const ramp=this.takeoffRamp,cork=this.spinCompleted&&this.trickKind==='cork';
          const points=(this.spinCompleted?special?1000:cork?750:600:ramp?ramp.type==='side'?360:260:140)+(transfer?220:0),previous=this.rewardedWaves.get(this.takeoffSource)||0;
          if(this.takeoffSource!==null&&points>previous){
            this.rewardedWaves.set(this.takeoffSource,points);
            if(transfer){this.airTransfers++;g.waveRide.transfers++;}
            if(this.spinCompleted){
              this.tricks++;if(special)this.specialTricks++;if(ramp)this.rampTricks++;g.awardTrick(special?'ПЕРЕВОРОТ!':cork?'КОСОЙ 360°':'360°',points-previous);this.landingBoost=special?5:4;
              g.juice.hitstop(special?.11:.08);g.juice.punch(special?5:3.5);g.juice.shake(.2);g.juice.buzz(special?[20,30,40]:25);g.juice.pop(special?'БАМ!':'ПЛЮХ!',p.x,p.y+1.7,p.z,'trick');
            }
            else {if(ramp)this.rampTricks++;g.awardTrick(ramp?ramp.type==='side'?'БОКОВОЙ ПЕРЕЛЁТ':'ПРЯМОЙ ВЫЛЕТ':'МЯГКАЯ ПОСАДКА',points-previous,!ramp);this.landingBoost=ramp?3:1.5;}
          }
        }
        else {
          if(this.spinShot)Object.assign(this.spinShot,{word:'ПЛЮХ!',caption:'ПОЧТИ ПОЛУЧИЛОСЬ',priority:this.spinShot.priority-15});
          g.juice.pop('ПЛЮХ!',p.x,p.y+1.4,p.z,'bad');
          g.spill(clean<.4?.06:.025,'Неудачная посадка');p.speed*=clean<.4?.8:.92;g.balance.disturb(.25+(1-clean)*.42,'ЖЁСТКАЯ ПОСАДКА');}
        g.setpiece?.onLanding(this.takeoffRamp,clean>.72);
        if(this.takeoffRamp)g.trickRoute.land(this.takeoffRamp,clean>.72);
        this.takeoffRamp=null;this.sideKick=0;this.clearSpin();
      }
    }else{p.y=surface.height;p.airY=0;this.boardPitch=0;}
    this.updateButton();
  }
  updateButton(){
    const p=this.game.p||{};
    this.button.classList.toggle('preparing',this.holding);
    this.button.classList.toggle('airborne',p.airborne);
    this.button.classList.toggle('spin-ready',this.canSpin);
    this.button.classList.toggle('special-ready',this.canSpecial);
    this.button.classList.toggle('spinning',p.airborne&&this.spinStarted&&!this.spinCompleted);
    this.button.classList.toggle('landing',p.airborne&&this.spinCompleted);
    const special=this.canSpecial||p.airborne&&this.trickKind==='flip';
    const glyph=document.getElementById('jump-glyph');if(glyph)glyph.textContent=p.airborne&&this.spinCompleted?'✓':special?'✦':this.canSpin||p.airborne&&this.spinStarted?'↻':'↑';
    this.button.querySelector('.jump-action').textContent=p.airborne&&this.spinCompleted?'РОВНО':special?'ФЛИП':p.airborne&&this.takeoffRamp?.type==='side'?'КОСОЙ':p.airborne?'360°':'ПРЫЖОК';
    const aerialName=this.takeoffRamp?.type==='side'?'Косой 360°':'Вращение 360°';
    this.button.setAttribute('aria-label',p.airborne&&this.spinCompleted?'Трюк выполнен. Приземляйся ровно':this.canSpecial?'Спецтрюк: переворот. Нажать ещё раз':this.canSpin?aerialName+': нажать ещё раз':'Прыжок: нажать один раз');
    this.button.title=this.canSpecial?'Переворот · второе нажатие':this.canSpin?aerialName+' · второе нажатие':'Прыжок · одно нажатие';
    this.button.style.setProperty('--jump-charge',this.charge*360+'deg');
    this.button.style.setProperty('--jump-percent',this.charge*100+'%');
  }
}
window.SurfJump=SurfJump;
