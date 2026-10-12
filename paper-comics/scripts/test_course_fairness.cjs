const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const dir=path.resolve(__dirname,'../review/comics/course-fairness');fs.mkdirSync(dir,{recursive:true});
  const report={errors:[],frames:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(dir,'.chrome-')),
      args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();});
    report.opening=await page.evaluate(()=>{
      const g=game;g.reset();return {first:g.world.hazards.find(h=>h.prop==='flamingo').z,placements:g.world.hazards.filter(h=>h.type==='flotsam').slice(0,3).map(h=>h.z),speed:g.p.speed};
    });
    assert.deepEqual(report.opening.placements,[70,115,160]);assert.ok(report.opening.first/report.opening.speed>2);
    report.boris=await page.evaluate(()=>{
      const g=game,runs=[];
      for(const seed of [42,123,2026,9593]){
        g.meta.seed=seed;g.reset();let minX=Infinity,maxX=-Infinity,maxAir=0,maxLateralSpeed=0;const samples=[];
        for(let i=0;i<120*60&&!g.duel.arrived;i++){
          const before=g.duel.boris.x;g.time=g.wave.time=(i+1)/120;g.duel.advance(1/120);
          const b=g.duel.boris;minX=Math.min(minX,b.x);maxX=Math.max(maxX,b.x);maxAir=Math.max(maxAir,b.airY);maxLateralSpeed=Math.max(maxLateralSpeed,Math.abs(b.x-before)*120);
          if(i%30===0)samples.push({z:b.z,x:b.x,speed:b.speed,air:b.airY});
        }
        runs.push({seed,arrived:g.duel.arrived,seconds:g.duel.arrivalTime,minX,maxX,maxAir,maxLateralSpeed,events:g.duel.events,samples});
      }
      return runs;
    });
    fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2));
    for(const r of report.boris){
      assert.ok(r.arrived&&r.seconds>31&&r.seconds<43,'Boris keeps a competitive independent pace: '+r.seed);
      assert.deepEqual(r.events.filter(e=>e.type==='hit'),[],'natural avoidance clears every obstacle: '+r.seed);
      assert.ok(r.maxX-r.minX>3&&r.maxAir>.5,'Boris carves and hops on real waves: '+r.seed);
      assert.ok(r.maxLateralSpeed<=7.00001,'steering stays continuous');
    }
    report.contacts=await page.evaluate(()=>{
      const g=game,results=[],steer=g.duel.waterLane;
      for(const mode of ['water','air','swept'])for(const index of g.duel.obstacles().map((o,i)=>i)){
        g.reset();const d=g.duel,b=d.boris,o=d.obstacles()[index];
        const x=(o.left+o.right)/2;b.x=x;b.z=o.from-.12;b.speed=40;
        // Every player completion flag is set; Boris must still see the geometry.
        g.world.hazards.forEach(h=>h.hit=h.done=true);g.beats.ropes.forEach(r=>r.done=true);g.setpiece.rocks.forEach(r=>r.hit=true);g.trickRoute.lines.forEach(r=>r.done=true);
        d.waterLane=()=>x;b.airY=mode==='air'&&Number.isFinite(o.clearance)?o.clearance+.5:0;
        d.advance(mode==='swept'?.5:1/60);
        const hit=d.events.find(e=>e.type==='hit'&&e.kind===o.kind);
        const first={kind:o.kind,mode,hit:!!hit,speed:b.speed,beer:d.liquid.level,stopped:!o.solid||b.z<=o.from+.001,solid:!!o.solid,expectedAir:mode==='air'&&Number.isFinite(o.clearance)};
        d.advance(1/120);first.once=d.events.filter(e=>e.type==='hit'&&e.kind===o.kind).length<=1;
        results.push(first);
      }
      g.duel.waterLane=steer;g.reset();return results;
    });
    for(const c of report.contacts){
      assert.equal(c.hit,!c.expectedAir,c.kind+' '+c.mode);assert.ok(c.once&&c.stopped,'single penalty and no passage through solid geometry');
      if(c.hit)assert.ok(c.speed<38,c.kind+' contact costs speed');
    }
    report.scenery=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';let closest=Infinity,warps=0,visibleWarps=0;
      const before={beer:g.mug.level,score:g.score,speed:g.p.speed};
      for(let i=0;i<120*45;i++){
        g.time=g.wave.time=(i+1)/120;g.p.z=i/120*35;g.p.x=i%2?-9:9;g.p.y=g.wave.height(g.p.x,g.p.z);
        if(i%30===0){g.updateCamera(1,true);g.updateVisuals(0);}
        const previous=g.rivals.map(r=>({z:r.z,inView:g.rivalCast.inView(r)}));g.updateRivals(1/120);
        g.rivals.forEach((r,j)=>{closest=Math.min(closest,Math.abs(r.x));if(r.z-previous[j].z>1){warps++;if(previous[j].inView)visibleWarps++;}});
      }
      const result={closest,warps,visibleWarps,unchanged:before.beer===g.mug.level&&before.score===g.score&&before.speed===g.p.speed,
        scenic:g.rivals.every(r=>r.scenic&&!r.encounter&&!r.collided),profiles:g.rivals.map(r=>r.id)};
      g.state='paused';g.reset();return result;
    });
    assert.ok(report.scenery.closest>=11.5&&report.scenery.unchanged&&report.scenery.scenic&&report.scenery.warps>0);
    assert.equal(report.scenery.visibleWarps,0,'visible surfers never teleport');
    report.rampRide=await page.evaluate(()=>{
      const g=game;g.meta.seed=42;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
      const line=g.trickRoute.lines.find(l=>l.prop==='umbrella'),start=g.trickRoute.point(line,.2,-line.edgeSide*(g.trickRoute.widthAt(line,.2)/2+.1));
      g.p.x=start.x;g.p.z=start.z;g.time=g.wave.time=g.p.z/35;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.speed=30;
      g.p.heading=line.edgeSide*.35;g.p.lean=line.edgeSide*.6;g.p.sideVelocity=line.edgeSide*5;
      let riding=false,launched=false,maxAir=0;
      for(let i=0;i<120*4;i++){
        g.input.target=line.edgeSide*.8;g.step(1/120);riding||=g.trickRoute.riding===line;launched||=g.jump.takeoffRamp===line;maxAir=Math.max(maxAir,g.p.airY);
        if(launched&&!g.p.airborne)break;
      }
      g.state='paused';return {riding,launched,maxAir,falls:g.balance.falls,landed:line.landed};
    });
    assert.ok(report.rampRide.riding&&report.rampRide.launched&&report.rampRide.maxAir>1&&report.rampRide.landed&&report.rampRide.falls===0,'the actual round rim launches and lands the surfer');
    for(const [width,height] of [[360,640],[393,852],[430,932]]){
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      for(const shot of ['opening','umbrella','surfers','boris']){
        const frame=await page.evaluate(shot=>{
          const g=game;g.meta.seed=42;g.reset();g.state='paused';g.journey.hideAll();g.container.classList.add('playing');
          ['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
          g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
          const umbrella=g.trickRoute.lines.find(l=>l.prop==='umbrella');
          g.p.z=shot==='opening'?0:shot==='umbrella'?umbrella.z-24:shot==='surfers'?130:380;g.p.x=shot==='umbrella'?3:0;
          g.time=g.wave.time=g.p.z/35;g.p.y=g.wave.height(g.p.x,g.p.z);
          if(shot==='surfers')g.rivals.forEach((r,i)=>{r.x=i?-12:12;r.z=g.p.z+30+i*14;});
          if(shot==='boris'){g.duel.boris.x=2.5;g.duel.boris.z=g.p.z+13;g.duel.boris.airY=.7;g.duel.roll=.15;}
          g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
          const pos=umbrella.top.geometry.attributes.position;let surfaceError=0;
          if(shot==='umbrella')for(let i=0;i<pos.count;i++)surfaceError=Math.max(surfaceError,Math.abs(pos.getY(i)-g.trickRoute.surface(umbrella,-pos.getX(i),pos.getZ(i)).height));
          return {shot,umbrellaVisible:umbrella.group.visible,surfaceError,ribs:umbrella.ribs.length,
            poleLength:umbrella.pole.scale.y,canopyRatio:umbrella.length/umbrella.width,scenicVisible:g.rivals.filter(r=>r.rig.group.visible&&g.rivalCast.inView(r)).length};
        },shot);
        if(shot==='umbrella')assert.ok(frame.umbrellaVisible&&frame.surfaceError<.001&&frame.ribs===8&&frame.poleLength>6&&frame.canopyRatio<1.5);
        if(shot==='surfers')assert.equal(frame.scenicVisible,2,'both outside lanes are visible on '+width);
        await page.screenshot({path:path.join(dir,width+'-'+shot+'.png')});report.frames.push({width,height,...frame});
      }
    }
    assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({opening:report.opening,boris:report.boris.map(({samples,...r})=>r),contacts:report.contacts.length,scenery:report.scenery,rampRide:report.rampRide,frames:report.frames.length,errors:report.errors},null,2));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
