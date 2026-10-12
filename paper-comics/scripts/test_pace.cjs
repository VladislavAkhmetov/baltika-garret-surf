const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const dir=path.resolve(__dirname,'../review/comics/pace');fs.mkdirSync(dir,{recursive:true});
  const report={errors:[],runs:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))report.errors.push(m.text());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();});
    for(const assist of [true,false]){
      for(const mode of ['quiet','surf']){
        report.runs.push(await page.evaluate((assist,mode)=>{
          const g=game;g.assist=assist;g.meta.seed=42;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
          // Keep real steering, waves, jumps, balance, mug and pursuit. Exclude
          // collisions and ramps so quiet cruising cannot be mistaken for a hit.
          g.world.hazards.forEach(h=>h.done=true);g.race.cursor=g.race.scenes.length;g.rivals=[];
          g.trickRoute.lines.forEach(l=>l.disabled=true);g.beats.enabled=false;g.setpiece.enabled=false;
          if(mode==='quiet'){g.p.x=-8.4;g.p.y=g.wave.height(g.p.x,0);}
          const samples=[];let firstChase=null,firstWipe=null,minGap=Infinity,speeds=[];
          for(let i=0;i<120*36&&g.state==='playing';i++){
            const z=g.p.z+8,w=g.wave.waves.filter(w=>z>=w.from&&z<=w.to).sort((a,b)=>g.wave.envelope(b,z)-g.wave.envelope(a,z))[0];
            const desired=mode==='quiet'?-8.4:w?THREE.MathUtils.clamp(g.wave.crestX(w,z)+w.width*.34,-8,8):g.p.x;
            g.input.target=THREE.MathUtils.clamp((desired-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);g.step(1/120);
            if(g.chase.reason==='pace'&&firstChase===null)firstChase={time:g.time,z:g.p.z,beer:g.mug.level,catches:g.waveRide.totalCaught};
            if(g.chase.wipes&&firstWipe===null)firstWipe=g.time;
            if(g.chase.reason==='pace')minGap=Math.min(minGap,g.chase.gap);
            if(g.time>6&&g.time<10)speeds.push(g.p.speed);
            if(i%120===0)samples.push({time:g.time,z:g.p.z,speed:g.p.speed,caught:g.waveRide.caught,chase:g.chase.reason,gap:Number.isFinite(g.chase.gap)?g.chase.gap:null});
          }
          const result={assist,mode,firstChase,firstWipe,minGap:Number.isFinite(minGap)?minGap:null,averageSpeed:speeds.reduce((a,b)=>a+b,0)/speeds.length,
            catches:g.waveRide.totalCaught,jumps:g.jump.jumps,paceChases:g.chase.paceChases,wipes:g.chase.wipes,escapes:g.chase.escapes,beer:g.mug.level,samples};
          g.state='paused';return result;
        },assist,mode));
      }
    }
    for(const r of report.runs.filter(r=>r.mode==='quiet')){
      assert.equal(r.catches,0);assert.equal(r.firstChase?.catches,0);assert.equal(r.jumps,0);
      assert.ok(r.firstChase&&r.firstChase.beer===1&&r.firstWipe>r.firstChase.time+3,'slow riding starts a chase without a spill and leaves reaction time');
      assert.ok(r.averageSpeed<(r.assist?25:27)&&r.wipes>=1&&r.paceChases>=2&&r.beer<1,'the independent faster crest catches quiet cruising and can return after recovery');
    }
    for(const r of report.runs.filter(r=>r.mode==='surf')){
      const quiet=report.runs.find(q=>q.assist===r.assist&&q.mode==='quiet');
      assert.ok(r.catches>=3&&r.jumps===0,'riding waves alone counts as active play');
      assert.ok(r.averageSpeed>quiet.averageSpeed+5&&r.wipes===0,'surfing produces real speed and keeps the foam away without jumps');
    }
    report.rules=await page.evaluate(()=>{
      const g=game;
      function setup(){g.assist=true;g.reset();g.state='playing';g.chase.end('test');g.elapsed=g.time=12;g.p.z=370;g.p.x=7.4;g.p.speed=22;g.p.airborne=false;g.p.recovering=0;g.p.balance=0;g.waveRide.caught=false;g.balance.immunity=0;g.chase.begin(g.chase.nearbyWave(),{pursuit:true,reason:'pace'});}
      function advance(seconds,speed){for(let i=0;i<Math.round(seconds*120);i++){g.time+=1/120;g.elapsed+=1/120;g.p.speed=speed;g.p.z+=speed/120;g.chase.step(1/120);}}
      setup();advance(5,22);const persistent=g.chase.active&&g.chase.reason==='pace'&&g.chase.cleanTime===0;
      const before={z:g.chase.z,gap:g.chase.gap};g.spill(.025,'Ошибка');const noTeleport=g.chase.z===before.z;
      setup();advance(3,37);const accelerated=!g.chase.active&&g.chase.escapes===1;
      setup();g.chase.z=g.p.z-.5;g.chase.gap=.5;g.chase.age=1.2;g.p.airborne=true;g.p.airY=2;g.chase.step(1/120);
      const jump=g.chase.wipes===0&&!g.chase.active&&g.chase.escapes===1;
      setup();const z=g.chase.z,age=g.chase.age;g.pause();g.updateVisuals(0);const pause=g.chase.z===z&&g.chase.age===age;
      g.reset();const reset=g.chase.slowTime===0&&g.chase.paceChases===0&&g.chase.reason==='intro';
      g.chase.end('test');g.state='playing';g.p.z=1200;g.elapsed=g.time=40;g.p.speed=20;
      for(let i=0;i<1200;i++)g.chase.step(1/120);const finish=!g.chase.active;g.state='paused';
      return {persistent,noTeleport,accelerated,jump,pause,reset,finish};
    });
    for(const [rule,ok] of Object.entries(report.rules))assert.ok(ok,rule);
    await page.evaluate(()=>{
      const g=game;g.assist=true;g.reset();g.journey.hideAll();['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
      g.container.classList.add('playing');g.p.z=385;g.p.x=7.4;g.p.speed=22;g.time=g.elapsed=16;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,g.p.z);
      g.chase.end('test');g.chase.begin(g.chase.nearbyWave(),{pursuit:true,reason:'pace'});g.chase.z=g.p.z-7;g.chase.gap=7;g.chase.age=2;g.chase.speed=28;g.chase.phase='chasing';
      g.state='paused';g.resize();g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
    });
    for(const [name,gap] of [['pace',14],['contact',2]]){
      report[name]=await page.evaluate(gap=>{
        const g=game;g.chase.z=g.p.z-gap;g.chase.gap=gap;g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
        const coach=document.getElementById('ride-coach');
        return {cue:g.chain.pursuitCue.textContent,coach:document.getElementById('coach-title').textContent,coachVisible:!coach.classList.contains('hidden'),frontVisible:g.chase.frontMesh.visible,overflow:document.documentElement.scrollWidth>innerWidth};
      },gap);
      assert.ok(report[name].frontVisible&&!report[name].overflow);
      assert.ok(report[name].cue.includes(name==='pace'?'МАЛО СКОРОСТИ':'ПРЫГАЙ'));
      assert.ok(report[name].coachVisible&&report[name].coach.includes(name==='pace'?'МАЛО СКОРОСТИ':'ВПЛОТНУЮ'));
      await page.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('arcade-chain')).opacity)>.98);
      await page.screenshot({path:path.join(dir,'phone-'+name+'.png')});
    }
    assert.deepEqual(report.errors,[]);console.log(JSON.stringify({runs:report.runs.map(({samples,...r})=>r),rules:report.rules,errors:report.errors},null,2));
  }finally{fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
