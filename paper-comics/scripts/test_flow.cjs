const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port,review=path.resolve(__dirname,'../review/comics/flow-test');
  fs.mkdirSync(review,{recursive:true});let browser;const errors=[],report={};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base)&&!r.url().endsWith('favicon.ico'))errors.push('HTTP '+r.status()+' '+r.url());});
    await page.setViewport({width:1280,height:800});
    await page.goto(base+'/?flowtest=1',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>window.game?.flowTest);
    await page.screenshot({path:path.join(review,'desktop-intro.png')});
    await page.evaluate(()=>{localStorage.setItem('garret_comics_arcade_v1',JSON.stringify({best:{score:12345},runs:7}));});
    await page.click('#start-button');await page.waitForFunction(()=>game.state==='playing');
    await page.evaluate(()=>{game.state='paused';});
    report.runs=await page.evaluate(()=>{
      const g=game,dt=1/120;
      function simulate(ribbon,drive){
        g.flowTest.setEnabled(ribbon);g.reset();g.state='playing';g.input.mode='touch';
        let jumped=false,spin=false,peakAir=0,frames=0;const samples=[];
        for(;frames<120*45&&g.state==='playing';frames++){
          const x=g.flowTest.routePoint(g.p.z+10)??g.p.x;
          g.input.target=drive?THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1):0;
          const s=g.wave.sample(g.p.x,g.p.z);
          if(drive&&!jumped&&g.p.z>500&&s.energy>.55&&s.face<.20){g.jump.press();jumped=true;}
          if(jumped&&!spin&&g.p.airborne&&g.jump.airTime>.18){g.jump.press();spin=true;}
          g.step(dt);peakAir=Math.max(peakAir,g.p.airY);
          if(frames%120===0)samples.push([g.p.z,g.p.x,g.p.speed,g.waveRide.caught]);
        }
        const result={...g.flowTest.lastRun,finished:g.state==='finished',falls:g.balance.falls,tricks:g.jump.tricks,peakAir,frames,samples};
        g.state='paused';return result;
      }
      const guided=simulate(true,true),unguided=simulate(false,true),coast=simulate(true,false);
      return {guided,unguided,coast,storage:JSON.parse(localStorage.getItem('garret_comics_arcade_v1'))};
    });
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    const {guided,unguided,coast}=report.runs;
    assert.equal(guided.finished,true,'the authored course reaches its own result screen');
    assert.equal(guided.catches,3,'steering through the suggested arcs catches all three waves');
    assert.ok(guided.time>=20&&guided.time<=30,'an active run lasts 20–30 seconds');
    assert.ok(guided.peakAir>2&&guided.landings>=1&&guided.tricks>=1,'the third wave supports a voluntary trick and clean landing');
    assert.equal(guided.falls,0,'the intended route is forgiving');
    assert.deepEqual(guided.samples,unguided.samples,'ribbon visibility must not alter physics or grant rewards');
    assert.ok(guided.maxSpeed>coast.maxSpeed+4,'riding the wave has a meaningful speed advantage over coasting');
    assert.deepEqual(report.runs.storage,{best:{score:12345},runs:7},'the experiment never modifies main-game progress');

    report.controls=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.container.classList.add('playing');
      document.getElementById('result-screen').classList.add('hidden');
      g.flowTest.setEnabled(true);g.renderDirty=true;return {waves:g.wave.waves.length,distance:g.distance};
    });
    await page.click('#flow-toggle');
    assert.equal(await page.$eval('#flow-toggle',e=>e.getAttribute('aria-pressed')),'false');
    await page.keyboard.press('KeyL');
    assert.equal(await page.$eval('#flow-toggle',e=>e.getAttribute('aria-pressed')),'true');
    await page.click('#flow-pause');assert.equal(await page.evaluate(()=>game.state),'paused');
    await page.click('#resume-button');assert.equal(await page.evaluate(()=>game.state),'playing');
    await page.click('#flow-restart');await page.waitForFunction(()=>!game.starting&&game.state==='playing');
    assert.ok(await page.evaluate(()=>game.p.z<25),'restart returns to the beginning');

    for(const [name,width,height] of [['desktop',1280,800],['mobile',393,852],['small',320,640],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:name!=='desktop',hasTouch:name!=='desktop',deviceScaleFactor:1});
      await page.evaluate(()=>{
        const g=game;g.reset();g.state='playing';g.input.mode='touch';g.flowTest.setEnabled(true);
        g.journey.hideAll();document.getElementById('result-screen').classList.add('hidden');g.container.classList.add('playing');
        for(let i=0;i<720;i++){
          const x=g.flowTest.routePoint(g.p.z+10)??g.p.x;
          g.input.target=THREE.MathUtils.clamp((x-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);g.step(1/120);
        }
        g.state='paused';g.resize();g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.speedBlur.render();
      });
      await page.screenshot({path:path.join(review,name+'-ribbon.png')});
      const layout=await page.evaluate(()=>{
        const inside=id=>{const r=document.getElementById(id).getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;};
        const g=game,points=g.flowTest.ribbon.geometry.attributes.position;
        let maxError=0;for(let i=0;i<points.count;i+=11)maxError=Math.max(maxError,Math.abs(points.getY(i)-g.wave.height(-points.getX(i),points.getZ(i))-.065));
        return {controls:['flow-toggle','flow-restart','flow-pause','steer-left','steer-right','jump-button'].every(inside),ribbonSurfaceError:maxError,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.ok(layout.controls&&!layout.overflow,name+' controls fit');assert.ok(layout.ribbonSurfaceError<.005,'ribbon conforms to real water');
      await page.evaluate(()=>{game.flowTest.setEnabled(false);game.updateVisuals(0);game.speedBlur.render();});
      await page.screenshot({path:path.join(review,name+'-no-ribbon.png')});
      await page.evaluate(()=>{game.flowTest.finish();});
      await page.screenshot({path:path.join(review,name+'-result.png')});
      await page.evaluate(()=>{document.getElementById('result-screen').classList.add('hidden');game.journey.open('start');});
      await page.screenshot({path:path.join(review,name+'-intro.png')});
      const startFits=await page.$eval('#start-button',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});
      assert.ok(startFits,name+' launch button fits');
    }
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.goto(base+'/?flowtest=1&ribbon=off',{waitUntil:'networkidle0'});
    assert.equal(await page.evaluate(()=>game.flowTest.enabled),false,'shareable no-ribbon URL');
    assert.equal(await page.evaluate(()=>game.flowTest.uniforms.uQuiet.value),1,'reduced motion disables traveling pulses');
    await page.goto(base+'/',{waitUntil:'networkidle0'});
    assert.equal(await page.evaluate(()=>game.flowTest),null);assert.equal(await page.evaluate(()=>game.wave.waves.length),21);
    assert.equal(await page.evaluate(()=>game.trickRoute.lines.length),9,'full course has physical ramp opportunities');
    assert.equal(await page.evaluate(()=>game.meta.data.best.score),12345,'full game still reads its saved record');
    assert.deepEqual(errors,[]);
    report.errors=errors;fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({guided:{...guided,samples:undefined},coast:{...coast,samples:undefined},errors,review},null,2));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
