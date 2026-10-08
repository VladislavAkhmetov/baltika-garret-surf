const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const review=path.resolve(__dirname,'../review/comics/maneuvers');fs.mkdirSync(review,{recursive:true});
  const errors=[],report={};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))errors.push(m.text());});
    await page.setViewport({width:1280,height:800});await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';});
    report.ramps=await page.evaluate(()=>{
      const g=game,dt=1/120,results=[];
      function prepare(index){
        g.reset();g.state='playing';g.comics.trigger=()=>false;g.input.mode='touch';g.assist=true;
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.world.hazards.forEach(h=>h.done=true);g.rivals.forEach(r=>r.collided=true);
        const line=g.trickRoute.lines[index],entry=g.trickRoute.position(line,0);
        g.p.z=entry.z-18;g.time=g.p.z/30;g.wave.time=g.time;g.p.x=entry.x;g.p.speed=31;g.p.y=g.wave.height(g.p.x,g.p.z);
        return line;
      }
      for(const [index,spin,pop] of [[0,false,false],[1,false,false],[0,true,false],[1,true,false],[0,false,true],[3,true,false],[5,true,false],[7,true,false]]){
        const line=prepare(index);let pressed=false,spinPressed=false,launch=null,maxAir=0,landing=null;
        for(let i=0;i<120*7;i++){
          const target=g.trickRoute.routePoint(g.p.z+7)??g.p.x;
          g.input.target=THREE.MathUtils.clamp((target-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
          if(pop&&g.trickRoute.riding&&!pressed&&g.trickRoute.local(line,g.p.x,g.p.z).t>.5){g.jump.press();pressed=true;}
          if(spin&&g.p.airborne&&!spinPressed&&g.jump.airTime>.17){g.jump.press();spinPressed=true;}
          const wasAir=g.p.airborne;g.step(dt);g.comics.update(dt);
          if(!launch&&g.p.airborne)launch={x:g.p.x,z:g.p.z,velocity:g.p.jumpVelocity,source:g.jump.takeoffSource};
          maxAir=Math.max(maxAir,g.p.airY);
          if(wasAir&&!g.p.airborne){landing={x:g.p.x,z:g.p.z,clean:g.jump.cleanLandings,boost:g.jump.landingBoost};break;}
        }
        results.push({type:line.type,id:line.id,spin,pop,launch,landing,maxAir,kind:spinPressed?g.tricksSeen.has('КОСОЙ 360°')?'cork':g.tricksSeen.has('ПЕРЕВОРОТ!')?'flip':g.tricksSeen.has('360°')?'spin':null:null,
          launches:g.trickRoute.launches,completed:g.trickRoute.completed,tricks:g.jump.tricks,rampTricks:g.jump.rampTricks,points:g.chain.points,falls:g.balance.falls,beer:g.mug.level});
      }
      const line=prepare(0);g.p.x=line.x+line.width+1;g.input.target=0;
      for(let i=0;i<150;i++)g.step(dt);const bypass={launches:g.trickRoute.launches,jumps:g.jump.jumps};
      g.state='paused';return {runs:results,bypass};
    });
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    for(const r of report.ramps.runs){
      assert.ok(r.launch&&r.landing,r.type+' is entered and launched using normal steering');
      assert.equal(r.launch.source,'ramp:'+r.id,'the intended ramp supplies the jump');
      assert.match(r.launch.source,/^ramp:/);assert.equal(r.launches,1);assert.equal(r.completed,1);
      assert.ok(r.maxAir>2&&r.rampTricks===1&&r.points>=260&&r.landing.boost>1.5,'a real flight pays once at clean touchdown');assert.equal(r.falls,0);
    }
    assert.equal(report.ramps.runs[2].kind,'flip');assert.equal(report.ramps.runs[3].kind,'cork');
    assert.ok(report.ramps.runs[4].launch.velocity>report.ramps.runs[0].launch.velocity+.7,'a voluntary pop strengthens takeoff');
    assert.deepEqual(report.ramps.bypass,{launches:0,jumps:0},'passing outside the visible ramp does not trigger a jump');
    report.fullRide=await page.evaluate(()=>{
      const g=game,dt=1/120;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
      g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);let spun=0;const kinds=new Set(),entries=[];
      for(let i=0;i<120*90&&g.state==='playing';i++){
        const x=g.trickRoute.routePoint(g.p.z+8)??g.p.x;
        g.input.target=THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
        if(g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;kinds.add(g.jump.trickKind);}
        for(const line of g.trickRoute.lines){const entry=g.trickRoute.position(line,0);if(g.p.z>entry.z-2&&!entries.some(e=>e.id===line.id))entries.push({id:line.id,playerX:g.p.x,entryX:entry.x,route:g.trickRoute.routePoint(entry.z),speed:g.p.speed});}
        g.step(dt);g.comics.update(dt);
      }
      const result={state:g.state,seconds:g.elapsed,launches:g.trickRoute.launches,completed:g.trickRoute.completed,tricks:g.jump.tricks,rampTricks:g.jump.rampTricks,kinds:[...kinds],falls:g.balance.falls,beer:g.mug.level,entries};g.state='paused';return result;
    });
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    assert.equal(report.fullRide.state,'finished');assert.ok(report.fullRide.launches>=5&&report.fullRide.rampTricks>=5,'the full route regularly offers successful ramp tricks');
    assert.ok(report.fullRide.kinds.includes('flip')&&report.fullRide.kinds.includes('cork'),'both kinds of maneuver work through the real obstacle course');
    report.wave=await page.evaluate(()=>{
      const g=game;g.reset();g.onboarding.completed.add('wave');g.world.hazards.forEach(h=>h.done=true);
      const w=g.wave.waves[5];g.time=w.peelOriginTime;g.wave.time=g.time;
      const front=g.wave.frontAt(w);g.p.z=front.z+4;g.p.x=g.wave.crestX(w,g.p.z)+w.width*.34;
      function measure(speed,gap){
        g.chase.reset();g.p.speed=speed;g.p.z=front.z+gap;g.p.x=g.wave.crestX(w,g.p.z)+w.width*.34;
        g.chase.begin(w);g.chase.step(1/120);return {z:g.chase.z,speed:g.chase.speed,gap:g.chase.gap,id:g.chase.wave?.id};
      }
      const close=measure(18,4),far=measure(42,30);
      g.time+=.5;g.wave.time=g.time;g.chase.step(.5);
      const advanced={z:g.chase.z,expected:g.wave.frontAt(w).z,speed:g.chase.speed};
      const initial=g.wave.breaking(w,front.z+4,w.peelOriginTime),ahead=g.wave.breaking(w,front.z+20,w.peelOriginTime);
      g.p.z=g.wave.frontAt(w).z+.4;g.p.x=g.wave.crestX(w,g.p.z)-12;g.p.airborne=false;g.p.airY=0;g.balance.immunity=g.impactCooldown=0;
      g.chase.step(1/120);const outsideWipes=g.chase.wipes;
      g.state='paused';return {close,far,advanced,initial,ahead,outsideWipes};
    });
    assert.equal(report.wave.close.z,report.wave.far.z);assert.equal(report.wave.close.speed,report.wave.far.speed);
    assert.equal(report.wave.far.gap,30,'a real 30 m lead is not capped or teleported');
    assert.equal(report.wave.advanced.z,report.wave.advanced.expected,'the front follows its wave clock');
    assert.ok(report.wave.initial>.3&&report.wave.ahead===0,'the same clock controls the visible breaking section');
    assert.equal(report.wave.outsideWipes,0,'leaving the physical width of the wave avoids its foam');
    report.layouts=[];
    for(const [name,width,height] of [['desktop',1280,800],['mobile',393,852],['small',320,640],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:name!=='desktop',hasTouch:name!=='desktop',deviceScaleFactor:1});
      for(const type of ['straight','side']){
        const layout=await page.evaluate(type=>{
          const g=game;g.reset();g.state='paused';g.journey.hideAll();document.getElementById('result-screen').classList.add('hidden');g.container.classList.add('playing');g.world.hazards.forEach(h=>h.done=true);
          g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);const line=g.trickRoute.lines.find(l=>l.type===type),entry=g.trickRoute.position(line,0);
          g.p.z=entry.z-22;g.p.x=entry.x;g.p.speed=30;g.time=g.p.z/30;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,g.p.z);
          g.resize();g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.speedBlur.render();
          const exit=g.trickRoute.position(line,1);
          let error=0;for(const t of [0,.25,.5,.75,1]){const z=THREE.MathUtils.lerp(entry.z,exit.z,t),x=g.ribbon.routePoint(z);error=Math.max(error,Math.abs(x-THREE.MathUtils.lerp(entry.x,exit.x,t)));}
          let surfaceError=0;const pos=line.top.geometry.attributes.position;
          for(let i=0;i<pos.count;i++)surfaceError=Math.max(surfaceError,Math.abs(pos.getY(i)-g.trickRoute.surface(line,-pos.getX(i),pos.getZ(i)).height));
          const inner=line.x-line.edgeSide*line.width/2,outer=line.x+line.edgeSide*line.width*.499;
          const wallSlope=line.type==='side'?Math.abs(g.trickRoute.surface(line,outer,line.z).dx):0;
          const forwardSlope=line.type==='side'?g.trickRoute.surface(line,outer,line.z).dz:0;
          let flatError=0;if(line.type==='side')for(let i=0;i<pos.count;i++){
            const x=-pos.getX(i),z=pos.getZ(i),center=g.trickRoute.point(line,.5,0);
            flatError=Math.max(flatError,Math.abs(pos.getY(i)-center.y-(x-center.x)*line.edgeSide*line.height/line.width-(z-center.z)*line.forwardRise/line.length));
          }
          return {error,surfaceError,flatError,wallSlope,forwardSlope,edge:Math.min(Math.abs(inner),Math.abs(outer)),finite:Array.from(pos.array).every(Number.isFinite),visible:line.group.visible,overflow:document.documentElement.scrollWidth>innerWidth};
        },type);
        assert.ok(layout.error<.001&&layout.surfaceError<.001&&layout.finite&&layout.visible&&!layout.overflow,'printed route and physical geometry agree');
        if(type==='side')assert.ok(layout.edge>=5&&layout.wallSlope>.4&&layout.wallSlope<1&&layout.forwardSlope>0&&layout.flatError<.001,'side ramps are flat planes sloped outward and forward at the course edge');
        report.layouts.push({name,type,...layout});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(review,name+'-'+type+'.png')});
      }
    }
    assert.deepEqual(errors,[]);report.errors=errors;fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
