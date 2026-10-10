const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const review=path.resolve(__dirname,'../review/comics/action');fs.mkdirSync(review,{recursive:true});
  const errors=[],report={};let browser;
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
      args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:1280,height:800});await page.goto(base,{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.comics.trigger=()=>false;game.meta.seed=42;});
    report.runs=await page.evaluate(()=>{
      const g=game,dt=1/120;
      function simulate(bypass=false,coast=false){
        g.reset();g.state='playing';g.input.mode='touch';let firstLaunch=null,spun=0,maxSpeed=0;const samples=[];
        for(let i=0;i<120*(coast?7:90)&&g.state==='playing';i++){
          const z=g.p.z+9,x=bypass?(g.trickRoute.bypassPoint(z)??g.trickRoute.routePoint(z)):g.trickRoute.routePoint(z);
          g.input.target=coast?0:THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
          if(!coast&&g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;}
          const air=g.p.airborne;g.step(dt);maxSpeed=Math.max(maxSpeed,g.p.speed);
          if(!air&&g.p.airborne&&firstLaunch===null)firstLaunch=g.elapsed;
          if(i%120===0)samples.push([g.p.z,g.p.x,g.p.speed,g.mug.level]);
        }
        const result={state:g.state,time:g.elapsed,firstCatch:g.waveRide.firstCatchTime,firstLaunch,maxSpeed,
          firstRamp:g.trickRoute.lines[0].stage===2,openingHits:g.world.hazards.slice(0,3).filter(h=>h.hit).length,
          openingPassed:g.world.hazards.slice(0,3).filter(h=>h.passed&&!h.hit).length,
          launches:g.trickRoute.launches,tricks:g.jump.tricks,catches:g.waveRide.totalCaught,beer:g.mug.level,
          falls:g.balance.falls,wipes:g.chase.wipes,chases:g.chase.chases,escapes:g.chase.escapes,score:g.score,banks:g.chain.banked,samples};
        g.state='paused';return result;
      }
      return {ramp:simulate(),bypass:simulate(true),coast:simulate(false,true)};
    });
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    for(const r of [report.runs.ramp,report.runs.bypass]){
      assert.equal(r.state,'finished','the full authored course reaches the bar');
      assert.ok(r.firstCatch<1.5,'the wave responds immediately');
      assert.ok(r.openingPassed===3&&r.openingHits===0,'the opening slalom can be passed with ordinary steering');
      assert.ok(r.beer>=.30&&r.banks>0&&r.tricks>=4,'the full course supports delivery and repeated trick chains');
    }
    assert.ok(report.runs.ramp.firstRamp&&report.runs.ramp.firstLaunch<10,'the first optional ramp arrives in the opening ten seconds');
    assert.equal(report.runs.bypass.firstRamp,false,'the alternate opening line bypasses the ramp');
    assert.ok(report.runs.coast.openingHits>=2&&report.runs.coast.chases>=1,'straight coasting causes real impacts and pursuit');

    const preparePursuit=()=>{
      window.pursuitSetup=()=>{
        const g=game;g.reset();g.chase.reset();g.state='playing';g.input.mode='touch';g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
        g.world.hazards.forEach(h=>h.done=true);g.p.z=360;g.time=12;g.wave.time=12;g.p.x=0;g.p.speed=24;
        g.p.y=g.wave.height(g.p.x,g.p.z);g.balance.immunity=g.impactCooldown=0;return g;
      };
      window.advancePursuit=(seconds,speed=24)=>{
        const g=game;for(let i=0;i<Math.round(seconds*120);i++){g.time+=1/120;g.p.z+=speed/120;g.p.speed=speed;g.chase.step(1/120);}
      };
    };
    await page.evaluateOnNewDocument(preparePursuit);await page.evaluate(preparePursuit);
    report.pursuit=await page.evaluate(()=>{
      let g=pursuitSetup();g.spill(.005,'Капля');const micro=g.chase.active;
      g.awardTrick('А',100,true);g.awardTrick('Б',200,true);g.spill(.025,'Неудачная посадка');
      const first={active:g.chase.active,phase:g.chase.phase,gap:g.chase.gap,points:g.chain.points,count:g.chain.count};
      advancePursuit(1,24);const before={z:g.chase.z,speed:g.chase.speed};
      g.spill(.025,'Неудачная посадка');const second={z:g.chase.z,strikes:g.chase.strikes,rush:g.chase.rush};
      advancePursuit(.1,24);second.speed=g.chase.speed;g.spill(.025,'Тот же удар');second.debounced=g.chase.strikes;
      g=pursuitSetup();g.spill(.025,'Неудачная посадка');advancePursuit(7,24);
      const recover={active:g.chase.active,escapes:g.chase.escapes,wipes:g.chase.wipes,awarded:g.tricksSeen.has('ОТОРВАЛСЯ ОТ ПЕНЫ')};
      g=pursuitSetup();g.spill(.025,'Неудачная посадка');advancePursuit(1,24);g.awardTrick('МЯГКАЯ ПОСАДКА',140,true);
      const credit=g.chase.cleanTime;advancePursuit(4,24);const landingEscape=g.chase.escapes;
      g=pursuitSetup();g.spill(.10,'УДАР ОБ БУЙ');g.awardTrick('А',500,true);advancePursuit(5,12);
      const capture={wipes:g.chase.wipes,active:g.chase.active,count:g.chain.count,beer:g.mug.level,cooldown:g.chase.cooldown};
      const wipes=g.chase.wipes;g.chase.onMistake(.10);const protectedAfterWipe=!g.chase.active;advancePursuit(4,24);
      const delayedWipe=g.chase.wipes-wipes;g.chase.onMistake(.025);const reentry=g.chase.active;
      g=pursuitSetup();g.spill(.025,'Неудачная посадка');g.chase.age=1;g.chase.z=g.p.z-.5;g.p.airborne=true;g.p.airY=2;
      g.chase.step(1/120);const jump={wipes:g.chase.wipes,active:g.chase.active,escapes:g.chase.escapes};
      g=pursuitSetup();g.spill(.025,'Неудачная посадка');const age=g.chase.age,z=g.chase.z;
      g.pause();g.updateVisuals(0);const paused=g.chase.age===age&&g.chase.z===z;g.reset();
      const reset={phase:g.chase.phase,strikes:g.chase.strikes,chases:g.chase.chases};g.state='paused';
      return {micro,first,before,second,recover,credit,landingEscape,capture,protectedAfterWipe,delayedWipe,reentry,jump,paused,reset};
    });
    const p=report.pursuit;
    assert.equal(p.micro,false,'tiny liquid motion does not summon pursuit');
    assert.deepEqual(p.first,{active:true,phase:'warning',gap:24,points:300,count:1},'a mistake warns, preserves base points and leaves reaction distance');
    assert.equal(p.second.z,p.before.z,'a repeated mistake never teleports the foam');
    assert.ok(p.second.speed>p.before.speed&&p.second.strikes===2&&p.second.debounced===2,'the next mistake speeds up pursuit and the same impact is debounced');
    assert.deepEqual(p.recover,{active:false,escapes:1,wipes:0,awarded:true},'stable play can escape the first mistake without an unavoidable hit');
    assert.ok(p.credit>=1.6&&p.landingEscape===1,'a clean landing shortens recovery');
    assert.ok(p.capture.wipes===1&&!p.capture.active&&p.capture.count===0&&p.capture.beer<.90,'being caught spills liquid and burns the chain once');
    assert.ok(p.protectedAfterWipe&&p.delayedWipe===0&&p.reentry,'capture has a recovery period and only a new mistake starts the next chase');
    assert.deepEqual(p.jump,{wipes:0,active:false,escapes:1},'jumping over the actual contact line ends the encounter without a delayed hit');
    assert.ok(p.paused);assert.deepEqual(p.reset,{phase:'intro',strikes:0,chases:0},'restart clears all accumulated pursuit pressure');

    report.layouts=[];
    for(const [name,width,height] of [['desktop',1280,800],['mobile',393,852],['small',320,640],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:name!=='desktop',hasTouch:name!=='desktop'});
      await page.evaluate(async()=>{await game.start(false);game.state='paused';game.comics.trigger=()=>false;game.meta.seed=42;});
      const layout=await page.evaluate(()=>{
        const g=pursuitSetup();document.getElementById('pause-screen').classList.add('hidden');document.getElementById('result-screen').classList.add('hidden');g.journey.hideAll();g.container.classList.add('playing');
        g.spill(.025,'Неудачная посадка');g.chase.age=1.4;g.chase.phase='chasing';g.chase.z=g.p.z-2;g.chase.gap=2;
        g.momentTime=0;document.getElementById('moment').classList.remove('visible');g.hintTime=0;document.getElementById('hint').classList.add('invisible');
        g.state='paused';g.resize();g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.speedBlur.render();
        const r=document.getElementById('arcade-chain').getBoundingClientRect(),s=g.container.getBoundingClientRect(),jump=document.getElementById('jump-button').getBoundingClientRect();
        const cue=document.getElementById('ride-coach'),positions=g.chase.frontMesh.geometry.attributes.position;
        let front=-Infinity;for(let i=0;i<positions.count;i++)front=Math.max(front,positions.getZ(i));
        return {hudFits:r.left>=s.left&&r.right<=s.right&&r.bottom<jump.top,cueVisible:!cue.classList.contains('hidden')&&getComputedStyle(cue).visibility==='visible'&&cue.dataset.lesson==='chase',
          foamVisible:g.chase.frontMesh.visible,finite:Array.from(positions.array).every(Number.isFinite),frontError:Math.abs(front-g.chase.z-1.1),overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.ok(layout.hudFits&&layout.cueVisible&&layout.foamVisible&&layout.finite&&!layout.overflow&&layout.frontError<.001,'pursuit cue and physical foam fit '+name+': '+JSON.stringify(layout));
      await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(review,name+'-pursuit.png')});report.layouts.push({name,...layout});
    }
    assert.deepEqual(errors,[]);report.errors=errors;fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({...report,runs:Object.fromEntries(Object.entries(report.runs).map(([k,v])=>[k,{...v,samples:undefined}]))},null,2));
  }finally{await browser?.close();server.closeAllConnections?.();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
