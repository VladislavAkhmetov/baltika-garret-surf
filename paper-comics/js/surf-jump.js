/* One hold/release action: compression, flight, weight-controlled landing. */
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
  reset(){this.holding=this.requested=this.apexFired=false;this.charge=this.cooldown=this.airTime=this.lastHeight=0;this.takeoffZone='flat';this.jumps=this.cleanLandings=0;this.cancel();this.button?.classList.remove('airborne');}
  cancel(){this.holding=this.requested=false;this.charge=0;this.button?.classList.remove('preparing');this.button?.style.setProperty('--jump-charge','0deg');}
  press(){if(this.game.state!=='playing'||this.holding||this.game.p.airborne||this.cooldown>0)return;this.holding=true;this.charge=0;}
  release(){if(this.holding){this.requested=true;this.holding=false;}}
  step(dt,surface){
    const g=this.game,p=g.p;this.cooldown=Math.max(0,this.cooldown-dt);
    if(this.holding)this.charge=Math.min(1,this.charge+dt/.5);
    if(this.requested){
      this.requested=false;
      if(!p.airborne&&this.cooldown===0){
        this.takeoffZone=surface.zone;this.airTime=0;this.apexFired=false;
        const rise=THREE.MathUtils.clamp(surface.dz*p.speed*Math.cos(p.heading)+surface.dx*p.sideVelocity,-1.5,2.5);
        p.airborne=true;p.jumpVelocity=6+this.charge*3+rise+(surface.zone==='crest'&&surface.energy>.35?1.6:0);p.y=surface.height+.06;this.jumps++;
        g.heroAnimator.beginTurn(0);g.emit(12,.7);
      }
      this.charge=0;
    }
    if(p.airborne){
      this.airTime+=dt;p.jumpVelocity-=20*dt;p.y+=p.jumpVelocity*dt;p.airY=Math.max(0,p.y-surface.height);
      this.lastHeight=Math.max(this.lastHeight,p.airY);
      if(!this.apexFired&&p.jumpVelocity<=0){
        this.apexFired=true;
        if(p.airY>1.6&&this.takeoffZone==='crest')g.comics.trigger('УАУ!','ВЫШЕ ВОЛНЫ!','crest',2);
      }
      if(p.jumpVelocity<0&&p.y<=surface.height){
        p.airborne=false;p.airY=0;p.y=surface.height;p.jumpVelocity=0;this.cooldown=.55;
        const clean=THREE.MathUtils.clamp(1-Math.abs(p.pitch)*.85-Math.abs(p.lean-p.smoothLean)*.8,0,1);
        g.handBeer.impact(clean);g.emit(18,.8);p.crouch=.85;
        if(clean>.72){this.cleanLandings++;g.awardTrick('МЯГКАЯ ПОСАДКА',140,true);}
        else if(clean<.4){g.spill(.06,'Жёсткая посадка');p.speed*=.8;p.recovering=.9;}
      }
    }else{p.y=surface.height;p.airY=0;}
    this.button.classList.toggle('preparing',this.holding);
    this.button.classList.toggle('airborne',p.airborne);
    this.button.style.setProperty('--jump-charge',this.charge*360+'deg');
  }
}
window.SurfJump=SurfJump;
