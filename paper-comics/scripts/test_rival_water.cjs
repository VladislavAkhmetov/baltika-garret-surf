const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const dir=path.resolve(__dirname,'../review/comics/rival-water');fs.mkdirSync(dir,{recursive:true});
  const report={errors:[],runs:[],frames:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
      userDataDir:fs.mkdtempSync(path.join(dir,'.chrome-')),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();});
    report.runs=await page.evaluate(()=>{
      const g=game,runs=[];
      for(const seed of [42,123,2026,9593])for(const cast of [1,2]){
        g.meta.seed=seed;g.rivalCast.run=cast;g.reset();g.state='playing';
        // Player completion must never make the scenery disappear from routing.
        g.world.hazards.forEach(h=>h.hit=h.done=true);g.trickRoute.lines.forEach(l=>l.done=true);g.setpiece.rocks.forEach(r=>r.hit=true);g.beats.ropes.forEach(r=>r.done=true);
        const before={beer:g.mug.level,score:g.score,speed:g.p.speed};
        const stats=g.rivals.map(r=>({id:r.id,contacts:[],contactFrames:[],maxInnerEdge:-Infinity,maxLateral:0,maxLean:0,maxLeanRate:0,maxAir:0,minSpeed:Infinity,maxSpeed:0,seconds:0}));
        for(let i=0;i<120*180&&g.rivals.some(r=>r.z<g.distance);i++){
          const old=g.rivals.map(r=>({x:r.x,z:r.z,lean:r.lean}));g.time=g.wave.time=(i+1)/120;
          // Keep recycling out of this full-course physics check.
          g.p.z=Math.min(...g.rivals.map(r=>r.z))-50;g.p.x=i%2?-9:9.2;g.updateRivals(1/120);
          g.rivals.forEach((r,j)=>{
            if(old[j].z>=g.distance)return;
            const s=stats[j];s.seconds=(i+1)/120;s.maxLateral=Math.max(s.maxLateral,Math.abs(r.x-old[j].x)*120);
            s.maxLean=Math.max(s.maxLean,Math.abs(r.lean));s.maxLeanRate=Math.max(s.maxLeanRate,Math.abs(r.lean-old[j].lean)*120);
            s.maxAir=Math.max(s.maxAir,r.airY);s.minSpeed=Math.min(s.minSpeed,r.speed);s.maxSpeed=Math.max(s.maxSpeed,r.speed);
            s.maxInnerEdge=Math.max(s.maxInnerEdge,r.x+r.waterRoute.radius);
            // The grid guard protects interpolation; it is outside the board's physical footprint.
            for(const o of r.waterRoute.obstacles)if(r.z>=o.from+r.waterRoute.spacing&&r.z<=o.to-r.waterRoute.spacing&&r.x>=o.left&&r.x<=o.right&&!s.contacts.includes(o.kind)){
              s.contacts.push(o.kind);s.contactFrames.push({z:r.z,x:r.x,obstacle:o});
            }
          });
        }
        runs.push({seed,cast,stats,finished:g.rivals.every(r=>r.z>=g.distance),unchanged:before.beer===g.mug.level&&before.score===g.score&&before.speed===g.p.speed});
      }
      g.state='paused';return runs;
    });
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
    for(const run of report.runs){
      assert.ok(run.finished&&run.unchanged,'scenic surfers finish independently: '+run.seed+' / '+run.cast);
      for(const r of run.stats){
        assert.deepEqual(r.contacts,[],'clear water for '+r.id+' / '+run.seed);
        assert.ok(r.maxLateral<=3.20001&&r.maxLean<=.350001&&r.maxLeanRate<1.1,'gentle continuous carving for '+r.id);
        assert.equal(r.maxAir,0,'scenic surfers remain on the water');assert.ok(r.maxSpeed<=28.0001);
        assert.ok(r.maxInnerEdge<=-16.5,'the whole deck stays away from the player and Boris');
      }
    }
    report.raceIndependence=await page.evaluate(()=>{
      const g=game,checks=[];
      for(const seed of [42,123,2026,9593]){
        const simulate=withScenery=>{
          g.meta.seed=seed;g.rivalCast.run=2;g.reset();g.state='playing';const samples=[];
          for(let i=0;i<120*45&&!g.duel.arrived;i++){
            g.time=g.wave.time=(i+1)/120;g.p.z=i/120*35;g.p.x=i%2?-9:9.2;
            g.duel.advance(1/120);if(withScenery)g.updateRivals(1/120);
            if(i%120===0||g.duel.arrived){const b=g.duel.boris;samples.push([b.x,b.z,b.speed,b.airY,g.duel.liquid.level,g.mug.level,g.score,g.p.speed]);}
          }
          return {samples,arrived:g.duel.arrived,arrivalTime:g.duel.arrivalTime};
        };
        const alone=simulate(false),scenery=simulate(true);
        checks.push({seed,arrived:scenery.arrived,samples:scenery.samples.length,identical:JSON.stringify(alone)===JSON.stringify(scenery)});
      }
      g.state='paused';return checks;
    });
    for(const race of report.raceIndependence)assert.ok(race.arrived&&race.identical,'decorative surfers do not change Boris or the player: '+race.seed);
    report.decks=await page.evaluate(()=>{
      const g=game,results=[];
      const overlaps=(poly,o)=>{
        const rect=[{x:o.left,z:o.from},{x:o.right,z:o.from},{x:o.right,z:o.to},{x:o.left,z:o.to}],axes=[{x:1,z:0},{x:0,z:1}];
        poly.forEach((p,i)=>{const q=poly[(i+1)%poly.length];axes.push({x:p.z-q.z,z:q.x-p.x});});
        return axes.every(a=>{
          const p=poly.map(p=>p.x*a.x+p.z*a.z),q=rect.map(p=>p.x*a.x+p.z*a.z);
          return Math.max(...p)>Math.min(...q)&&Math.max(...q)>Math.min(...p);
        });
      };
      for(const seed of [42,123,2026,9593,8,2147483647])for(const cast of [1,2]){
        g.meta.seed=seed;g.rivalCast.run=cast;g.reset();const obstacles=g.rivalCast.waterObstacles();
        for(const r of g.rivals){
          const contacts=[];
          for(let z=10;z<g.distance+10;z+=2){
            r.z=z;r.x=g.rivalCast.waterPoint(r,z);r.lean=Math.sign(g.rivalCast.waterPoint(r,z+1)-g.rivalCast.waterPoint(r,z-1))*.35;
            g.p.x=0;g.p.z=z-18;g.time=g.wave.time=z/25;g.p.y=g.wave.height(0,g.p.z);g.updateCamera(1,true);
            g.updateSurfer(r.rig,r.x,z,g.wave.height(r.x,z),r.lean,0,0,0);r.rig.group.updateMatrixWorld(true);
            const board=r.rig.board,w=board.geometry.parameters.width/2,h=board.geometry.parameters.height/2;
            // The complete rectangular mesh is stricter than the transparent board silhouette.
            const poly=[[-w,-h],[w,-h],[w,h],[-w,h]].map(([x,y])=>{
              const p=board.localToWorld(new THREE.Vector3(x,y,0));return {x:-p.x,z:p.z};
            });
            if(poly.some(p=>p.x<r.waterRoute.waterLeft)&&contacts.length<8)contacts.push({kind:'water-edge',z});
            if(poly.some(p=>p.x>-16.5)&&contacts.length<8)contacts.push({kind:'race-lane',z});
            for(const o of obstacles)if(o.from<z+8&&o.to>z-8&&overlaps(poly,o)&&contacts.length<8)contacts.push({kind:o.kind,z});
          }
          results.push({seed,id:r.id,contacts});
        }
      }
      return results;
    });
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
    for(const deck of report.decks)assert.deepEqual(deck.contacts,[],'whole board clears props: '+deck.id+' / '+deck.seed);
    report.generation=await page.evaluate(()=>{
      const g=game,seeds=[...Array.from({length:32},(_,i)=>i+1),4096,65535,2147483647,RunMeta.seedFor('2026-10-14')],failures=[];
      for(const seed of seeds)for(const cast of [1,2]){
        g.meta.seed=seed;g.rivalCast.run=cast;try{g.reset();}catch(e){failures.push({seed,cast,error:e.message});}
      }
      return {checks:seeds.length*2,failures};
    });
    assert.deepEqual(report.generation.failures,[],'crowded courses keep an open-water alternative');
    report.recycling=await page.evaluate(()=>{
      const g=game;g.meta.seed=42;g.rivalCast.run=2;g.reset();g.state='playing';let warps=0,visibleWarps=0;
      for(let i=0;i<120*55;i++){
        g.time=g.wave.time=(i+1)/120;g.p.z=i/120*35;g.p.y=g.wave.height(g.p.x,g.p.z);
        if(i%30===0){g.updateCamera(1,true);g.updateVisuals(0);}
        const old=g.rivals.map(r=>({z:r.z,inView:g.rivalCast.inView(r)}));g.updateRivals(1/120);
        g.rivals.forEach((r,j)=>{if(r.z-old[j].z>1){warps++;if(old[j].inView)visibleWarps++;}});
      }
      g.state='paused';const positions=g.rivals.map(r=>({x:r.x,z:r.z}));g.updateVisuals(0);
      return {warps,visibleWarps,paused:positions.every((p,i)=>p.x===g.rivals[i].x&&p.z===g.rivals[i].z)};
    });
    assert.ok(report.recycling.warps>0&&report.recycling.paused);assert.equal(report.recycling.visibleWarps,0);
    for(const [width,height] of [[360,640],[393,852],[430,932]]){
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      for(const [label,z] of [['shore-rock',218],['umbrella',565],['pier',710],['arch',812]]){
        const visible=await page.evaluate(z=>{
          const g=game;g.meta.seed=42;g.rivalCast.run=2;g.reset();g.state='paused';g.journey.hideAll();g.container.classList.add('playing');
          ['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
          g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
          g.p.x=0;g.p.z=z-166;g.time=g.wave.time=z/26;g.p.y=g.wave.height(g.p.x,g.p.z);
          g.rivals.forEach((r,i)=>{r.z=z+i*12;r.x=g.rivalCast.waterPoint(r,r.z);r.lean=0;});
          g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
          return g.rivals.filter(r=>{
            const point=r.rig.card.localToWorld(new THREE.Vector3()).project(g.camera);
            return r.rig.group.visible&&Math.abs(point.x)<1&&Math.abs(point.y)<1;
          }).length;
        },z);
        assert.equal(visible,2,'background surfers remain in the mobile view: '+width+' / '+label);
        const file=width+'-'+label+'.png';await page.screenshot({path:path.join(dir,file)});report.frames.push(file);
      }
    }
    assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
