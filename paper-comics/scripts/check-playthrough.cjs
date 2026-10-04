const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port,review=path.resolve(__dirname,'../review/comics/playthrough');
  fs.mkdirSync(review,{recursive:true});let browser;const errors=[];
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.game);
    await page.evaluate(async()=>{
      await game.start(false);game.input.mode='touch';
      window.runReview={frames:0,events:[],spills:[],samples:[]};
      const trigger=game.comics.trigger.bind(game.comics);
      game.comics.trigger=(...args)=>{const accepted=trigger(...args);if(accepted)runReview.events.push({word:args[0],variant:args[2],at:game.time});return accepted;};
      const spill=game.spill.bind(game);
      game.spill=(amount,reason)=>{runReview.spills.push({amount,reason,at:game.time});return spill(amount,reason);};
      let nextSample=0,plannedJump=false;const sharkJumps=new Set();
      const key=type=>dispatchEvent(new KeyboardEvent(type,{code:'Space',bubbles:true}));
      function steer(){
        const g=game,p=g.p;
        if(g.state==='playing'){
          let w=g.wave.waves.find(w=>p.z>w.from&&p.z<w.to-22);
          if(!w)w=g.wave.waves.find(w=>w.to>p.z&&w.from<p.z+65);
          const desired=w?g.wave.crestX(w,p.z+5)+w.width*.38:1;
          const vx=(desired-p.x)*1.6+g.wave.sample(p.x,p.z).dx*.4;
          const gain=(g.assist?.43:.55)*(g.balance.mode==='recovery'?.55:1);
          g.input.target=g.balance.mode==='recovery'?THREE.MathUtils.clamp(-g.balance.roll*1.7-g.balance.velocity*.85,-1,1):THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(vx/(p.speed*.38),-.5,.5))/gain,-1,1);
          g.input.pitchTarget=.1;runReview.frames++;
          const threat=g.world.threat();
          if(!plannedJump&&p.z>95&&!p.airborne&&g.jump.cooldown===0){key('keydown');plannedJump=true;}
          if(threat&&threat.gap<14&&!sharkJumps.has(threat.shark.index)&&!p.airborne&&g.jump.cooldown===0&&!g.jump.holding){key('keydown');sharkJumps.add(threat.shark.index);}
          if(g.jump.holding&&g.jump.charge>.95&&(!threat||threat.gap<5))key('keyup');
          if(g.time>=nextSample){runReview.samples.push({at:g.time,z:p.z,speed:p.speed,beer:g.mug.level,wave:g.waveRide.activeId});nextSample+=2;}
        }
        if(g.state!=='finished')requestAnimationFrame(steer);
      }
      requestAnimationFrame(steer);
    });
    await page.waitForFunction(()=>game.p.z>=65,{timeout:180000,polling:100});await page.screenshot({path:path.join(review,'01-first-wave.png')});console.log('first wave');
    await page.waitForFunction(()=>game.p.airborne,{timeout:180000,polling:30});await page.screenshot({path:path.join(review,'02-jump.png')});console.log('jump');
    const markers=[['03-wave-gap',365],['04-shark-chase',412],['05-jetski',625],['06-big-wave',980]];
    for(const [name,z] of markers){
      await page.waitForFunction(z=>game.p.z>=z,{timeout:180000,polling:100},z);
      await page.screenshot({path:path.join(review,name+'.png')});
      console.log(name+': '+Math.round(await page.evaluate(()=>game.p.z))+' m');
    }
    await page.waitForFunction(()=>game.state==='finished',{timeout:180000,polling:100});
    await page.screenshot({path:path.join(review,'07-finish.png')});
    const result=await page.evaluate(()=>({state:game.state,z:game.p.z,seconds:game.elapsed,beer:game.mug.level,caught:game.waveRide.totalCaught,falls:game.balance.falls,saves:game.balance.saves,tricks:[...game.tricksSeen],jumps:game.jump.jumps,landings:game.jump.cleanLandings,escapes:game.world.escapes,sharks:game.world.hazards.filter(h=>h.type==='shark').map(h=>({hit:h.hit,escaped:h.escaped,done:h.done})),caps:game.collected,...runReview}));
    assert.equal(result.state,'finished');assert.ok(result.caught>=5);assert.ok(result.beer>=.3);assert.ok(result.frames>100);assert.deepEqual(errors,[]);
    assert.ok(result.jumps>=1&&result.landings>=1);assert.ok(result.sharks.every(h=>h.done),'both finite shark encounters should resolve');
    // Restart through the UI, so the route, props and result overlay reset together.
    await page.click('#replay-button');await page.waitForFunction(()=>game.state==='playing'&&game.p.z<10);
    const restart=await page.evaluate(()=>({beer:game.mug.level,caught:game.waveRide.totalCaught,resultHidden:document.getElementById('result-screen').classList.contains('hidden')}));
    assert.equal(restart.beer,1);assert.equal(restart.caught,0);assert.equal(restart.resultHidden,true);
    fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({result,restart,errors},null,2));
    console.log(JSON.stringify({state:result.state,seconds:result.seconds,caught:result.caught,beer:result.beer,jumps:result.jumps,escapes:result.escapes,frames:result.frames,comicEvents:result.events.length,restart},null,2));
    console.log('PASS: rendered mobile run, jumps via Space, shark encounters, all hazards and rivals, finish and replay UI.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
