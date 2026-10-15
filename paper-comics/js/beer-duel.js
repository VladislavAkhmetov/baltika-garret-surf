/* First to the bar wins. Beer is a separate delivery bonus. */
class BeerDuel {
  constructor(game){
    this.game=game;
    this.boris=game.world.hazards.find(h=>h.mode==='duel');
    this.boris.duelControlled=true;
    this.liquid=new ComicBeerLiquid();
    this.mount();
    this.frame=new Image();
    this.ready=Promise.all([game.world.ready,new Promise((resolve,reject)=>{
      let fallbackTried=false;
      this.frame.onload=resolve;
      this.frame.onerror=()=>{if(!fallbackTried){fallbackTried=true;this.frame.src='assets/comics/glass-paper-frame.png';}else reject(Error('Не удалось загрузить стакан Бориса'));};
      this.frame.src='assets/comics/glass-paper-frame.webp';
    })]).then(()=>{
      const card=this.boris.jetCard,view=game.world.jetViews[2];card.material.map=view.map;card.geometry.dispose();
      card.geometry=new THREE.PlaneGeometry(view.width*1.2,3.6);card.position.y=1.8;
      // The right-hand anchor is measured on the rear-view sprite atlas.
      const b=view.bounds,w=card.geometry.parameters.width;
      this.glass.position.set(w*((2070-b.left)/(b.right-b.left+1)-.5)+.10,3.6*(.5-(285-b.top)/(b.bottom-b.top+1))+.26,.02);
      this.printFrame=-1;this.update();
    });
    this.ready.catch(()=>{});this.reset();
  }
  mount(){
    this.ticket=document.createElement('div');this.ticket.className='duel-ticket paper';
    this.ticket.innerHTML='<span>МЕСТО</span><strong id="race-place-value">1<small> / 2</small></strong>';
    document.getElementById('hud').insertBefore(this.ticket,document.getElementById('pause-button'));
    this.status=document.createElement('div');this.status.className='duel-status';this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');this.game.container.append(this.status);
    this.glassCanvas=document.createElement('canvas');this.glassCanvas.width=128;this.glassCanvas.height=200;
    this.glassTexture=new THREE.CanvasTexture(this.glassCanvas);this.glassTexture.minFilter=THREE.LinearFilter;this.glassTexture.generateMipmaps=false;
    this.glass=new THREE.Mesh(new THREE.PlaneGeometry(.65,.9),new THREE.MeshBasicMaterial({map:this.glassTexture,transparent:true,depthWrite:false,depthTest:false,side:THREE.DoubleSide}));
    this.glass.renderOrder=4;this.boris.jetCard.add(this.glass);
  }
  reset(){
    this.enabled=!this.game.flowTest;this.game.container.classList.toggle('beer-duel',this.enabled);
    document.querySelector('.beer-ticket .ticket-label').textContent=this.enabled?'ПИВО · БОНУС':'ДОВЕЗИ';
    this.liquid.reset();this.liquid.foam=.18;this.liquid.totalSpilled=0;
    this.clock=this.cooldown=this.previousVy=this.roll=0;this.arrived=false;this.arrivalTime=null;this.deliveredBeer=null;this.result=null;this.lastStatus='';
    this.contacts=new Set();this.laneTarget=undefined;this.events=[];this.recovery=0;this.nextHop=5;
    Object.assign(this.boris,{x:5,z:0,speed:29,heading:0,airY:0,airVelocity:0,activeAt:this.enabled?0:null,motion:{x:0,z:1},done:false,hit:false,passed:false});
    this.boris.group.visible=this.enabled;this.status.textContent='';this.printFrame=-1;this.updateHUD();
  }
  spill(amount){
    const loss=Math.min(this.liquid.level,Math.max(0,amount));this.liquid.level-=loss;
    this.liquid.onSpill(Math.sign(this.roll)||1,loss);
  }
  step(dt){
    if(!this.enabled||this.result)return;
    this.advance(dt);
    const p=this.game.p,b=this.boris;
    this.cooldown=Math.max(0,this.cooldown-dt);
    if(!p.fallen&&!this.arrived&&Math.abs(p.z-b.z)<1.8&&Math.abs(p.x-b.x)<1.35&&Math.abs(p.airY-b.airY)<1&&this.cooldown===0&&this.game.impactCooldown===0){
      this.spill(.1);this.game.spill(.1,'СТОЛКНУЛИСЬ С БОРИСОМ',true);p.speed*=.8;b.speed*=.8;
      this.game.impactCooldown=this.cooldown=2;this.game.emit(20,1.1);
    }
  }
  obstacles(){
    const g=this.game,rows=[],margin=.85;
    // Player hit/done flags never remove a physical obstacle for Boris.
    for(const h of g.world.hazards)if(h.type==='flotsam')rows.push({id:h,left:h.x-h.collisionRadius-margin,right:h.x+h.collisionRadius+margin,
      from:h.z-h.collisionDepth-.9,to:h.z+h.collisionDepth+.9,clearance:h.jumpClearance,factor:.65,spill:.1,kind:h.prop});
    for(const line of g.trickRoute.lines)if(!line.disabled)rows.push({id:line,left:line.x-line.width/2-margin,right:line.x+line.width/2+margin,
      from:line.z-line.length/2-.9,to:line.z+line.length/2+.9,clearance:Infinity,factor:.65,spill:.06,solid:true,kind:'ramp'});
    if(g.beats.enabled)for(const rope of g.beats.ropes)rows.push({id:rope,left:rope.x-rope.halfWidth-margin,right:rope.x+rope.halfWidth+margin,
      from:rope.z-.7,to:rope.z+.7,clearance:rope.rampBarrier?.75:.95,factor:rope.rampBarrier?.72:.9,spill:rope.rampBarrier?0:.025,kind:rope.rampBarrier?'buoys':'rope'});
    if(g.setpiece.enabled)for(const rock of g.setpiece.rocks)rows.push({id:rock,left:rock.x-rock.rx-margin,right:rock.x+rock.rx+margin,
      from:rock.z-rock.rz-1,to:rock.z+rock.rz+1,clearance:Infinity,factor:rock.reef?.88:.78,spill:rock.reef?.04:.08,solid:true,kind:rock.reef?'reef':'rock'});
    return rows.sort((a,b)=>a.from-b.from);
  }
  waterLane(desired,rows){
    const b=this.boris,limit=8.8,lookahead=Math.max(100,b.speed*3);
    desired=THREE.MathUtils.clamp(desired,-limit,limit);
    const upcoming=rows.filter(o=>o.to>=b.z&&o.from<=b.z+lookahead);
    if(!upcoming.length)return desired;
    // Predict the actual capped steering arc through the next three seconds,
    // rather than assuming the craft instantly reaches a safe target lane.
    const predict=(x,t)=>{
      const delta=x-b.x,sign=Math.sign(delta),linear=Math.max(0,(Math.abs(delta)-7/2.4)/7);
      return t<=linear?b.x+sign*7*t:x-sign*Math.min(Math.abs(delta),7/2.4)*Math.exp(-2.4*(t-linear));
    };
    const cost=x=>{
      let score=Math.abs(x-desired)*.35+Math.abs(x-b.x)*.08;
      for(const o of upcoming){
        const from=Math.max(0,(o.from-b.z)/Math.max(20,b.speed)),to=Math.max(0,(o.to-b.z)/Math.max(20,b.speed));
        const a=predict(x,from),c=predict(x,to),min=Math.min(a,c),max=Math.max(a,c);
        if(max>o.left-.2&&min<o.right+.2)score+=1000/(1+from)+Math.min(Math.abs(a-o.left),Math.abs(a-o.right))*20;
      }
      return score;
    };
    const options=[desired,...upcoming.flatMap(o=>[o.left-.9,o.right+.9])];
    for(let x=-limit;x<=limit+.001;x+=.4)options.push(x);
    const legal=options.filter(x=>Math.abs(x)<=limit);
    let best=desired,bestCost=cost(desired);
    for(const x of legal){const score=cost(x);if(score<bestCost){best=x;bestCost=score;}}
    if(this.laneTarget!==undefined&&Math.abs(this.laneTarget)<=limit&&cost(this.laneTarget)<bestCost+.12)best=this.laneTarget;
    this.laneTarget=best;return best;
  }
  contactTime(a,b,o){
    let enter=0,leave=1;
    for(const [key,min,max] of [['x',o.left,o.right],['z',o.from,o.to]]){
      const delta=b[key]-a[key];
      if(Math.abs(delta)<1e-9){if(a[key]<min||a[key]>max)return null;continue;}
      const t1=(min-a[key])/delta,t2=(max-a[key])/delta;
      enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));
      if(enter>leave)return null;
    }
    return enter;
  }
  collide(previous,rows){
    const b=this.boris;
    for(const o of rows){
      if(this.contacts.has(o.id)&&!o.solid||o.to<previous.z||o.from>b.z)continue;
      const t=this.contactTime(previous,b,o);if(t===null)continue;
      if(THREE.MathUtils.lerp(previous.airY,b.airY,t)>=o.clearance)continue;
      if(!this.contacts.has(o.id)){
        this.contacts.add(o.id);b.speed*=o.factor;this.recovery=Math.max(this.recovery,.8);this.spill(o.spill);
        this.events.push({type:'hit',kind:o.kind,z:b.z,time:this.clock,speed:b.speed});
      }
      // Slide sideways along a solid edge until the craft clears it.
      if(o.solid)b.z=THREE.MathUtils.lerp(previous.z,b.z,Math.max(0,t-.002));
    }
  }
  advance(dt){
    if(this.arrived||dt<=0)return;
    const g=this.game,b=this.boris,startTime=this.clock;this.clock+=dt;
    const s=g.wave.sample(b.x,b.z),oldX=b.x,oldSpeed=b.speed,previous={x:b.x,z:b.z,airY:b.airY},rows=this.obstacles();
    // Boris chooses the broad water channel and visibly weaves with the swell.
    let lane=4.8+Math.sin(b.z*.014)*1.5;
    for(const [from,to] of [[350,550],[760,1040]])if(b.z>from&&b.z<to){
      const weave=Math.sin((b.z-from)/(to-from)*Math.PI);
      lane=THREE.MathUtils.lerp(lane,1.2+Math.sin(b.z*.045)*2.8,weave);
    }
    const wide=g.setpiece.path(b.z,true);if(wide!==null)lane=wide+2;
    const home=g.setpiece.finishPath(b.z);if(home!==null)lane=home+3;
    lane=this.waterLane(lane,rows);
    b.x+=THREE.MathUtils.clamp((lane-b.x)*(1-Math.exp(-2.4*dt)),-7*dt,7*dt);
    const vx=(b.x-oldX)/dt,heading=Math.atan2(vx,Math.max(18,b.speed)),turn=(heading-b.heading)/dt;b.heading=heading;
    // An independent pace: player boosts and mistakes change the actual gap.
    const roughness=Math.abs(s.dx)*.6+Math.abs(s.dz)*.4;
    const finishEase=b.z>1100?.45:0;
    let target=THREE.MathUtils.clamp(40-finishEase+Math.sin(this.clock*.7)*2.4-roughness*.9-Math.abs(vx)*.35,34-finishEase,43-finishEase);
    if(this.recovery>0)target=Math.min(target,oldSpeed+3);
    this.recovery=Math.max(0,this.recovery-dt);
    b.speed+=(target-b.speed)*(1-Math.exp(-1.7*dt));
    const remaining=g.distance-b.z,travel=b.speed*Math.cos(heading)*dt;
    const activeDt=travel>=remaining?dt*remaining/travel:dt;
    b.z=Math.min(g.distance,b.z+travel);
    const clear=rows.every(o=>o.to<b.z-5||o.from>b.z+32);
    if(b.airY===0&&this.clock>=this.nextHop&&clear&&(s.energy>.16||Math.abs(s.dz)>.018)&&Math.abs(heading)<.14){
      b.airVelocity=4.8;this.nextHop=this.clock+6;this.events.push({type:'hop',z:b.z,time:this.clock});
    }
    if(b.airVelocity!==0||b.airY>0){
      b.airY=Math.max(0,b.airY+b.airVelocity*activeDt-6.5*activeDt*activeDt);b.airVelocity-=13*activeDt;
      if(b.airY===0){b.airVelocity=0;b.speed*=.98;this.spill(.004);}
    }
    this.collide(previous,rows);
    const next=g.wave.sample(b.x,b.z),vy=(next.height-s.height)/dt;
    const jolt=THREE.MathUtils.clamp(Math.abs(vy-this.previousVy)*.12,0,2);this.previousVy=vy;
    this.roll+=(-heading*.55-this.roll)*(1-Math.exp(-8*dt));
    this.liquid.update(activeDt,turn*.18,Math.abs(vy)*.04,-this.roll);
    // Open glass on a motor craft: turns and pounding waves spill actual volume.
    const loss=(Math.abs(vx)*.003+Math.abs(b.speed-oldSpeed)/dt*.0005+roughness*.017*(b.speed/28)**2+jolt*.004)*activeDt;
    if(loss>0)this.spill(loss);
    b.motion={x:Math.sin(heading),z:Math.cos(heading)};
    if(b.z>=g.distance){this.arrived=true;this.arrivalTime=startTime+activeDt;this.deliveredBeer=this.liquid.level;b.speed=0;}
  }
  settle(maxTime=this.game.elapsed){
    if(this.result)return this.result;
    // Compare interpolated crossings, including two arrivals in the same step.
    const max=Math.round(THREE.MathUtils.clamp(this.game.mug.level,0,1)*100);
    const boris=Math.round(THREE.MathUtils.clamp(this.deliveredBeer??this.liquid.level,0,1)*100);
    const delta=this.arrived?maxTime-this.arrivalTime:-Infinity;
    const outcome=Math.abs(delta)<1e-6?'tie':delta<0?'victory':'defeat';
    this.result=Object.freeze({max,boris,outcome,place:outcome==='defeat'?2:1,maxTime,borisTime:this.arrivalTime,beerBonus:Math.round(max*50)});
    this.updateHUD();return this.result;
  }
  updateHUD(){
    const gap=(this.game.p?.z??0)-this.boris.z,place=this.result?.place??(gap>=0?1:2),el=document.getElementById('race-place-value');
    if(el.dataset.value!==String(place)){el.innerHTML=place+'<small> / 2</small>';el.dataset.value=place;}
    el.setAttribute('aria-label',place+' место из 2');
    const metres=Math.round(Math.abs(gap));
    const line=this.arrived?'БОРИС У БАРА · ДОЕЗЖАЙ':metres<1?'БОК О БОК · ОБГОНИ БОРИСА':gap>0?'ТЫ ВПЕРЕДИ · '+metres+' М':'БОРИС ВПЕРЕДИ · '+metres+' М';
    this.status.dataset.leader=gap>0?'max':gap<0?'boris':'tie';
    if(line!==this.lastStatus){this.status.textContent=line;this.lastStatus=line;}
  }
  update(){
    this.glass.visible=this.enabled;
    if(!this.enabled)return;
    const frame=Math.floor(this.clock*24);if(frame===this.printFrame)return;this.printFrame=frame;
    const c=this.glassCanvas.getContext('2d'),l=this.liquid;c.clearRect(0,0,128,200);
    const top=157-l.level*126;
    c.save();c.beginPath();c.moveTo(24,20);c.lineTo(103,20);c.lineTo(98,158);c.lineTo(30,158);c.closePath();c.clip();
    const beer=c.createLinearGradient(0,5,0,195);beer.addColorStop(0,'#ffd55c');beer.addColorStop(1,'#b36a1b');c.fillStyle=beer;
    if(l.level>0){
      c.beginPath();for(let i=0;i<l.n;i++){const x=24+i/(l.n-1)*79,y=top-l.h[i]*126;i?c.lineTo(x,y):c.moveTo(x,y);}c.lineTo(103,160);c.lineTo(24,160);c.closePath();c.fill();
      c.strokeStyle='#fff4cf';c.lineWidth=6;c.beginPath();for(let i=0;i<l.n;i++){const x=24+i/(l.n-1)*79,y=top-l.h[i]*126;i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
    }
    c.restore();
    if(this.frame.complete&&this.frame.naturalWidth)c.drawImage(this.frame,0,0,128,200);
    this.glass.rotation.z=0;
    this.glassTexture.needsUpdate=true;
  }
}
window.BeerDuel=BeerDuel;
