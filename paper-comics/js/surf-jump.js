/* Tap to leave any wave; a second tap risks a single 360, paid on landing. */
class SurfJump {
  constructor(game){
    this.game=game;this.button=document.getElementById('jump-button');this.reset();
    this.button.addEventListener('pointerdown',e=>{e.preventDefault();if(e.isTrusted)this.button.setPointerCapture(e.pointerId);this.press();});
    this.button.addEventListener('pointerup',e=>{e.preventDefault();this.release();});
    this.button.addEventListener('pointercancel',()=>this.cancel());
    window.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();if(!e.repeat)this.press();}});
    window.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();this.release();}});
    window.addEventListener('blur',()=>this.cancel());
  }
  reset(){this.holding=this.requested=this.apexFired=false;this.charge=this.cooldown=this.airTime=this.lastHeight=this.landingBoost=this.landingPulse=this.landingAge=this.boardPitch=this.launchStrength=0;this.gravity=20;this.takeoffZone='flat';this.takeoffWave=null;this.jumps=this.cleanLandings=this.tricks=0;this.rewardedWaves=new Map();this.clearSpin();this.cancel();this.button?.classList.remove('airborne');this.updateButton();}
  clearSpin(){this.spinStarted=this.spinCompleted=false;this.spinProgress=0;this.spinDirection=1;this.spinDuration=.68;if(this.game.p)this.game.p.spin=0;}
  get flightRemaining(){const p=this.game.p;return p?.airborne?(p.jumpVelocity+Math.sqrt(p.jumpVelocity*p.jumpVelocity+2*this.gravity*p.airY))/this.gravity:0;}
  get canSpin(){const p=this.game.p;return !!p?.airborne&&!this.spinStarted&&p.jumpVelocity>-6&&p.airY>.45&&this.airTime>.04&&(!this.game.assist||this.flightRemaining>.30);}
  cancel(){this.holding=this.requested=false;this.charge=0;this.button?.classList.remove('preparing');this.button?.style.setProperty('--jump-charge','0deg');this.button?.style.setProperty('--jump-percent','0%');}
  press(){
    if(this.game.state!=='playing')return;
    if(this.canSpin){this.spinStarted=true;this.spinDirection=this.game.p.lean<0?-1:1;this.spinDuration=this.game.assist?THREE.MathUtils.clamp(this.flightRemaining*.72,.20,.62):.68;return;}
    if(this.holding||this.game.p.airborne||this.game.p.fallen||this.game.p.recovering>0||this.cooldown>0)return;
    this.requested=true;
  }
  release(){}
  step(dt,surface){
    const g=this.game,p=g.p;this.cooldown=Math.max(0,this.cooldown-dt);
    this.landingBoost*=Math.exp(-dt/.95);
    this.landingAge+=dt;this.landingPulse=Math.max(0,this.landingPulse-dt/ .38);
    if(this.requested){
      this.requested=false;
      if(!p.airborne&&this.cooldown===0){
        this.takeoffZone=surface.zone;this.takeoffWave=surface.wave?.id??null;
        this.airTime=this.lastHeight=0;this.apexFired=false;this.clearSpin();
        const rise=THREE.MathUtils.clamp(surface.dz*p.speed*Math.cos(p.heading)+surface.dx*p.sideVelocity+surface.waterVelocity,0,1.4);
        const lip=surface.wave?surface.wave.height*surface.energy*(.85+surface.crest*1.05):0;
        p.airborne=true;p.jumpVelocity=THREE.MathUtils.clamp(6.2+lip+rise+Math.max(0,p.speed-24)*.08,6.2,14.8);
        this.launchStrength=THREE.MathUtils.clamp((p.jumpVelocity-7)/7.8,0,1);this.landingPulse=0;
        p.takeoffHeight=surface.height;p.y=surface.height+.06;g.trailPoints=[];this.jumps++;
        g.heroAnimator.beginTurn(0);g.emit(12,.7,true);
        if(g.audio)g.audio.playJump(this.launchStrength);
      }
      this.charge=0;
    }
    if(p.airborne){
      this.airTime+=dt;p.jumpVelocity-=this.gravity*dt;p.y+=p.jumpVelocity*dt;p.airY=Math.max(0,p.y-surface.height);
      const lift=g.wave.smooth(this.airTime/.14),level=g.wave.smooth((this.airTime-.22)/(.45+this.launchStrength*.12));
      const glide=(.16+this.launchStrength*.22)*g.wave.smooth((this.airTime-.35)/.25)*g.wave.smooth(this.flightRemaining/.35);
      this.boardPitch=(.40+this.launchStrength*1.03)*lift*(1-level)+glide;
      if(this.spinStarted&&!this.spinCompleted){
        this.spinProgress=Math.min(1,this.spinProgress+dt/this.spinDuration);
        const ease=this.spinProgress*this.spinProgress*(3-2*this.spinProgress);
        p.spin=this.spinDirection*ease*Math.PI*2;
        if(this.spinProgress===1){this.spinCompleted=true;p.spin=0;}
      }
      this.lastHeight=Math.max(this.lastHeight,p.airY);
      if(!this.apexFired&&p.jumpVelocity<=0){
        this.apexFired=true;
        if(p.airY>1.5&&g.audio)g.audio.playCrowdAwe();
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
          if(g.assist)g.balance.immunity=Math.max(g.balance.immunity,.65);
          this.cleanLandings++;
          const points=this.spinCompleted?600:140,previous=this.rewardedWaves.get(this.takeoffWave)||0;
          if(this.takeoffWave!==null&&points>previous){
            this.rewardedWaves.set(this.takeoffWave,points);
            if(this.spinCompleted){this.tricks++;g.awardTrick('360°',points-previous);this.landingBoost=4;}
            else {g.awardTrick('МЯГКАЯ ПОСАДКА',points-previous,true);this.landingBoost=1.5;}
          }
        }
        else {g.spill(clean<.4?.06:.025,'Неудачная посадка');p.speed*=clean<.4?.8:.92;g.balance.disturb(.25+(1-clean)*.42,'ЖЁСТКАЯ ПОСАДКА');}
        this.clearSpin();
      }
    }else{p.y=surface.height;p.airY=0;this.boardPitch=0;}
    this.updateButton();
  }
  updateButton(){
    const p=this.game.p||{};
    this.button.classList.toggle('preparing',this.holding);
    this.button.classList.toggle('airborne',p.airborne);
    this.button.classList.toggle('spin-ready',this.canSpin);
    this.button.classList.toggle('spinning',p.airborne&&this.spinStarted&&!this.spinCompleted);
    const glyph=document.getElementById('jump-glyph');if(glyph)glyph.textContent=this.canSpin||p.airborne&&this.spinStarted?'↻':'↑';
    this.button.setAttribute('aria-label',this.canSpin?'Вращение 360°: нажать ещё раз':'Прыжок: нажать один раз');
    this.button.style.setProperty('--jump-charge',this.charge*360+'deg');
    this.button.style.setProperty('--jump-percent',this.charge*100+'%');
  }
}
window.SurfJump=SurfJump;
