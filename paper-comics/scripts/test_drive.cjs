const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const review=path.resolve(__dirname,'../review/comics/drive-test');fs.mkdirSync(review,{recursive:true});
  const profile=fs.mkdtempSync(path.join(review,'.chrome-'));
  let browser;const errors=[],report={};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',userDataDir:profile,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base)&&!r.url().endsWith('favicon.ico'))errors.push('HTTP '+r.status()+' '+r.url());});
    await page.setViewport({width:1280,height:800});
    await page.goto(base+'/?flowtest=1&drive=1',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>window.game?.flowTest instanceof DriveTest);
    await page.evaluate(()=>localStorage.setItem('garret_comics_arcade_v1',JSON.stringify({best:{score:12345},runs:7})));
    await page.click('#start-button');await page.waitForFunction(()=>game.state==='playing');
    await page.evaluate(()=>game.state='paused');
    report.runs=await page.evaluate(()=>{
      const g=game,dt=1/120;
      function simulate(path,spin,ribbon=true,drive=true){
        g.flowTest.setEnabled(ribbon);g.reset();g.state='playing';g.input.mode='touch';
        let spinPressed=false,launch=null,landing=null,maxAir=0;const samples=[];
        for(let i=0;i<120*48&&g.state==='playing';i++){
          const z=g.p.z+9,target=path==='ramp'?(g.flowTest.riskPoint(z)??g.flowTest.routePoint(z)):g.flowTest.routePoint(z);
          g.input.target=drive?THREE.MathUtils.clamp(((target??g.p.x)-g.p.x)*.75-g.p.sideVelocity*.12,-1,1):0;
          if(g.p.z>DriveTest.layout.quietFrom)g.input.target=0;
          if(spin&&g.p.airborne&&!spinPressed&&g.jump.airTime>.18){g.jump.press();spinPressed=true;}
          const air=g.p.airborne;g.step(dt);maxAir=Math.max(maxAir,g.p.airY);
          if(!air&&g.p.airborne)launch={x:g.p.x,z:g.p.z,speed:g.p.speed,source:g.jump.takeoffSource};
          if(air&&!g.p.airborne)landing={x:g.p.x,z:g.p.z,speed:g.p.speed,clean:g.jump.cleanLandings};
          if(i%120===0)samples.push([g.p.z,g.p.x,g.p.speed,g.chain.value,g.score]);
        }
        const result={...g.flowTest.lastRun,finished:g.state==='finished',falls:g.balance.falls,tricks:g.jump.tricks,
          launches:g.trickRoute.launches,maxAir,launch,landing,samples};g.state='paused';return result;
      }
      return {bypass:simulate('bypass',false),ramp:simulate('ramp',false),trick:simulate('ramp',true),
        noRibbon:simulate('ramp',true,false),coast:simulate('bypass',false,true,false),storage:JSON.parse(localStorage.getItem('garret_comics_arcade_v1'))};
    });
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    const {bypass,ramp,trick,noRibbon,coast}=report.runs;
    for(const r of [bypass,ramp,trick]){
      assert.equal(r.finished,true,'both paths reach the result');
      assert.ok(r.catches>=2,'ordinary steering links the first two waves');
      assert.ok(r.firstCatchTime<1.5,'the first wave responds within the opening seconds');
      assert.ok(r.openingPassed===3&&r.openingHits===0,'the opening slalom is avoidable with ordinary steering');
      assert.ok(r.time>=20&&r.time<=30,'an active run lasts 20–30 seconds');
      assert.equal(r.falls,0,'the authored path can be learned without a forced fall');
      assert.ok(r.beer>=.30&&r.banks>=1&&r.score>0,'delivery and chain cashing work');
    }
    assert.equal(bypass.launches,0,'the visible bypass does not auto-launch');
    assert.equal(bypass.choice,'bypass');
    assert.equal(ramp.launches,1,'the optional ramp launches once');
    assert.ok(ramp.rampLanded&&ramp.maxAir>2&&ramp.landings>=1,'the ramp has a clean, rewarded landing');
    assert.ok(trick.tricks>=1&&trick.score>ramp.score&&ramp.score>bypass.score,'taking more voluntary risk pays more');
    assert.ok(trick.landing.speed>27,'landing carries real speed into the next section');
    assert.deepEqual(trick.samples,noRibbon.samples,'guides never affect physics or points');
    assert.ok(trick.maxSpeed>coast.maxSpeed+3,'good riding earns speed');
    assert.ok(coast.openingHits>=2,'the opening requires evasive action rather than a straight coast');
    assert.ok(bypass.samples[3][2]>coast.samples[3][2]+6,'avoiding the opening hazards preserves noticeable speed');
    assert.deepEqual(report.runs.storage,{best:{score:12345},runs:7},'the experiment leaves campaign progress untouched');

    report.penalties=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.awardTrick('ПОДХВАТ',160);g.awardTrick('СВЯЗАЛ ВОЛНЫ',240);
      const before={points:g.chain.points,count:g.chain.count};g.spill(.025,'Неудачная посадка');
      const small={points:g.chain.points,count:g.chain.count,beer:g.mug.level};g.spill(.18,'ПАДЕНИЕ');
      const fall={points:g.chain.points,count:g.chain.count};
      g.awardTrick('ПОДХВАТ',160);g.mug.level=.35;g.flowTest.bank();
      const lowBeerScore=g.score;g.state='paused';return {before,small,fall,lowBeerScore};
    });
    assert.equal(report.penalties.small.points,report.penalties.before.points,'minor spill retains pending points');
    assert.equal(report.penalties.small.count,1,'minor spill reduces the multiplier');
    assert.deepEqual(report.penalties.fall,{points:0,count:0},'fall burns the chain');
    assert.equal(report.penalties.lowBeerScore,160,'delivery volume does not multiply trick scores');

    await page.evaluate(()=>{game.reset();game.state='playing';game.container.classList.add('playing');game.journey.hideAll();document.getElementById('result-screen').classList.add('hidden');});
    await page.click('#flow-toggle');assert.equal(await page.evaluate(()=>game.flowTest.riskGuide.enabled),false);
    await page.keyboard.press('KeyL');assert.equal(await page.evaluate(()=>game.flowTest.riskGuide.enabled),true);
    await page.click('#flow-pause');assert.equal(await page.evaluate(()=>game.state),'paused');
    await page.click('#resume-button');assert.equal(await page.evaluate(()=>game.state),'playing');
    await page.click('#flow-restart');await page.waitForFunction(()=>!game.starting&&game.state==='playing');
    assert.ok(await page.evaluate(()=>game.p.z<25),'restart returns to the same beginning');

    report.layouts=[];
    for(const [name,width,height] of [['desktop',1280,800],['mobile',393,852],['small',320,640],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:name!=='desktop',hasTouch:name!=='desktop',deviceScaleFactor:1});
      await page.evaluate(()=>{game.reset();document.getElementById('result-screen').classList.add('hidden');game.journey.open('start');});
      await page.evaluate(()=>document.fonts.ready);
      await page.screenshot({path:path.join(review,name+'-intro.png')});
      assert.ok(await page.$eval('#start-button',e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),'start fits '+name);
      await page.evaluate(()=>{
        const g=game;g.reset();g.state='playing';g.input.mode='touch';g.journey.hideAll();document.getElementById('result-screen').classList.add('hidden');g.container.classList.add('playing');
        for(let i=0;i<120;i++){
          const x=g.flowTest.routePoint(g.p.z+9)??g.p.x;
          g.input.target=THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);g.step(1/120);
        }
        g.state='paused';g.resize();g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.speedBlur.render();
      });
      await page.screenshot({path:path.join(review,name+'-opening.png')});
      assert.ok(await page.evaluate(()=>game.flowTest.openingHazards[0].group.visible),'first obstacle is visible within the first second');
      assert.ok(await page.evaluate(()=>document.querySelector('.flow-cue').getBoundingClientRect().bottom<=document.querySelector('.speed-ticket').getBoundingClientRect().top),'opening cue stays clear of the speed display on '+name);
      await page.evaluate(()=>{
        const g=game;g.state='playing';
        for(let i=0;i<2400&&g.p.z<DriveTest.layout.signZ-36;i++){
          const z=g.p.z+9,x=g.flowTest.riskPoint(z)??g.flowTest.routePoint(z)??g.p.x;
          g.input.target=THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);g.step(1/120);
        }
        g.state='paused';g.resize();g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.speedBlur.render();
      });
      await page.screenshot({path:path.join(review,name+'-choice.png')});
      const layout=await page.evaluate(()=>{
        const inside=id=>{const r=document.getElementById(id).getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;};
        const g=game,ribbon=g.flowTest.riskGuide.mesh.geometry.attributes.position;
        let surfaceError=0;for(let i=0;i<ribbon.count;i+=11)surfaceError=Math.max(surfaceError,Math.abs(ribbon.getY(i)-g.trickRoute.guidanceHeight(-ribbon.getX(i),ribbon.getZ(i))-.065));
        const rect=document.querySelector('.drive-hud').getBoundingClientRect();
        return {controls:['flow-toggle','flow-restart','flow-pause','steer-left','steer-right','jump-button'].every(inside),
          hudFits:rect.left>=0&&rect.right<=innerWidth,surfaceError,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.ok(layout.controls&&layout.hudFits&&!layout.overflow,'controls and HUD fit '+name);
      assert.ok(layout.surfaceError<.005,'optional guide follows the ramp surface');report.layouts.push({name,...layout});
      await page.evaluate(()=>{
        const g=game;g.state='playing';g.input.mode='touch';let spun=false;
        for(let i=0;i<120*35&&g.state==='playing';i++){
          const z=g.p.z+9,x=g.flowTest.riskPoint(z)??g.flowTest.routePoint(z)??g.p.x;
          g.input.target=g.p.z>DriveTest.layout.quietFrom?0:THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
          if(g.p.airborne&&!spun&&g.jump.airTime>.18){g.jump.press();spun=true;}
          g.step(1/120);
        }
        g.updateVisuals(0);g.updateHUD();g.speedBlur.render();
      });
      await page.screenshot({path:path.join(review,name+'-result.png')});
      assert.ok(await page.$eval('#flow-again',e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'replay fits '+name);
    }
    await page.goto(base+'/?flowtest=1',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.game?.flowTest?.constructor.name==='FlowTest');
    assert.equal(await page.evaluate(()=>game.flowTest.constructor.name),'FlowTest');
    assert.equal(await page.evaluate(()=>game.trickRoute.lines.length),0,'original three waves stay ramp-free');
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.game?.trickRoute);
    await page.evaluate(()=>Promise.all([game.world.ready,game.coastReady]));
    assert.equal(await page.evaluate(()=>game.flowTest),null);assert.equal(await page.evaluate(()=>game.trickRoute.lines.length),9);
    assert.deepEqual(errors,[]);report.errors=errors;
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({runs:Object.fromEntries(Object.entries(report.runs).filter(([k])=>k!=='storage').map(([k,r])=>[k,{...r,samples:undefined}])),penalties:report.penalties,layouts:report.layouts,errors,review},null,2));
  }finally{
    if(browser)await browser.close();await new Promise(r=>server.close(r));
    if(path.resolve(profile).startsWith(review+path.sep+'.chrome-')){
      await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(e=>{
        if(!['EBUSY','EPERM'].includes(e.code))throw e;
      });
    }
  }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
