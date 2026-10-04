/* Hold/release to jump; press again over a launch wave for a paper 360. */
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
  reset(){this.holding=this.requested=this.apexFired=false;this.charge=this.cooldown=this.airTime=this.lastHeight=0;this.takeoffZone='flat';this.jumps=this.cleanLandings=this.rampJumps=this.tricks=0;this.rampJump=false;this.clearSpin();this.cancel();this.button?.classList.remove('airborne');this.updateButton();}
  clearSpin(){this.spinStarted=this.spinCompleted=false;this.spinProgress=0;this.spinDirection=1;if(this.game.p)this.game.p.spin=0;}
  get canSpin(){const p=this.game.p;return !!p?.airborne&&this.rampJump&&!this.spinStarted&&p.jumpVelocity>-3&&this.airTime>.04;}
  cancel(){this.holding=this.requested=false;this.charge=0;this.button?.classList.remove('preparing');this.button?.style.setProperty('--jump-charge','0deg');this.button?.style.setProperty('--jump-percent','0%');}
  press(){
    if(this.game.state!=='playing')return;
    if(this.canSpin){this.spinStarted=true;this.spinDirection=this.game.p.lean<0?-1:1;return;}
    if(this.holding||this.game.p.airborne||this.game.p.fallen||this.game.p.recovering>0||this.cooldown>0)return;
    this.holding=true;this.charge=0;
  }
  release(){if(this.holding){this.requested=true;this.holding=false;}}
  step(dt,surface){
    const g=this.game,p=g.p;this.cooldown=Math.max(0,this.cooldown-dt);
    if(this.holding)this.charge=Math.min(1,this.charge+dt/.5);
    if(this.requested){
      this.requested=false;
      if(!p.airborne&&this.cooldown===0){
        this.takeoffZone=surface.zone;this.airTime=0;this.apexFired=false;this.clearSpin();
        this.rampJump=!!surface.ramp&&surface.rampEnergy>.32&&surface.rampAlong>-.65&&surface.rampAlong<.35;
        const rise=THREE.MathUtils.clamp(surface.dz*p.speed*Math.cos(p.heading)+surface.dx*p.sideVelocity,-1.5,2.5);
        p.airborne=true;p.jumpVelocity=this.rampJump?10+this.charge*4+Math.max(0,rise)*.5:6+this.charge*3+rise+(surface.zone==='crest'&&surface.energy>.35?1.6:0);p.y=surface.height+.06;this.jumps++;
        if(this.rampJump)this.rampJumps++;
        g.heroAnimator.beginTurn(0);g.emit(12,.7);
        if(g.audio)g.audio.playJump();
      }
      this.charge=0;
    }
    if(p.airborne){
      this.airTime+=dt;p.jumpVelocity-=20*dt;p.y+=p.jumpVelocity*dt;p.airY=Math.max(0,p.y-surface.height);
      if(this.spinStarted&&!this.spinCompleted){
        this.spinProgress=Math.min(1,this.spinProgress+dt/.68);
        const ease=this.spinProgress*this.spinProgress*(3-2*this.spinProgress);
        p.spin=this.spinDirection*ease*Math.PI*2;
        if(this.spinProgress===1){this.spinCompleted=true;p.spin=0;}
      }
      this.lastHeight=Math.max(this.lastHeight,p.airY);
      if(!this.apexFired&&p.jumpVelocity<=0){
        this.apexFired=true;
        if(p.airY>1.5&&g.audio)g.audio.playCrowdAwe();
        if(!this.rampJump&&p.airY>1.6&&this.takeoffZone==='crest')g.comics.trigger('УАУ!','ВЫШЕ ВОЛНЫ!','crest',2);
      }
      if(p.jumpVelocity<0&&p.y<=surface.height){
        p.airborne=false;p.airY=0;p.y=surface.height;p.jumpVelocity=0;this.cooldown=.55;
        const unfinished=this.spinStarted&&!this.spinCompleted;
        const clean=THREE.MathUtils.clamp(1-Math.abs(p.pitch)*.85-Math.abs(p.lean-p.smoothLean)*.8-Math.abs(p.heading)*.22-(unfinished?.6:0),0,1);
        g.handBeer.impact(clean);g.emit(18,.8);p.crouch=.85;
        if(g.audio)g.audio.playLanding(clean>.72);
        if(clean>.72){
          this.cleanLandings++;
          if(this.spinCompleted){this.tricks++;g.awardTrick('360°',600);g.comics.trigger('360°','ЧИСТАЯ ПОСАДКА!','crest',2);}
          else g.awardTrick('МЯГКАЯ ПОСАДКА',140,true);
        }
        else {g.spill(clean<.4?.06:.025,'Неудачная посадка');p.speed*=clean<.4?.8:.92;g.balance.disturb(.25+(1-clean)*.42,'ЖЁСТКАЯ ПОСАДКА');}
        this.rampJump=false;this.clearSpin();
      }
    }else{p.y=surface.height;p.airY=0;}
    this.updateButton();
  }
  updateButton(){
    const p=this.game.p||{};
    this.button.classList.toggle('preparing',this.holding);
    this.button.classList.toggle('airborne',p.airborne);
    this.button.classList.toggle('spin-ready',this.canSpin);
    this.button.classList.toggle('spinning',p.airborne&&this.spinStarted&&!this.spinCompleted);
    const glyph=document.getElementById('jump-glyph');if(glyph)glyph.textContent=this.canSpin||p.airborne&&this.spinStarted?'↻':'↑';
    this.button.setAttribute('aria-label',this.canSpin?'Вращение 360°: нажать ещё раз':'Прыжок: удержать и отпустить');
    this.button.style.setProperty('--jump-charge',this.charge*360+'deg');
    this.button.style.setProperty('--jump-percent',this.charge*100+'%');
  }
}
window.SurfJump=SurfJump;
