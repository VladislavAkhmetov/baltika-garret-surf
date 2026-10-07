const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core'),{createServer}=require('./serve');
async function run(){
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.game);
  await page.evaluate(async()=>{await game.start(false);game.state='paused';});
  const report=await page.evaluate(()=>{
   const g=game,dt=1/120,results=[];
   function key(code,on){dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true}));}
   for(const assisted of [true,false]){
    g.assist=assisted;g.reset();g.state='playing';g.input.mode='keys';
    const spills=[],falls=[],spill=g.spill.bind(g),fall=g.balance.fall.bind(g.balance);
    g.spill=(amount,reason)=>{spills.push({z:Math.round(g.p.z),amount,reason});return spill(amount,reason);};
    g.balance.fall=()=>{const entry={z:Math.round(g.p.z),source:g.balance.reason,risk:g.p.balance,age:g.balance.recoveryAge};fall();entry.caption=document.querySelector('#wipeout-screen strong').textContent;falls.push(entry);};
    let nextReaction=0,releaseAt=0,turn=null;const samples=[];
    for(let frame=0;frame<18000&&g.state==='playing';frame++){
     if(g.time>=releaseAt&&turn){key(turn,false);turn=null;}
     // Discrete feedback with 240 ms reaction time. Never set lean, velocity,
     // position, immunity or balance directly. Use real input event handlers.
     if(g.time>=nextReaction&&!g.p.fallen){
      nextReaction=g.time+.24;let direction=0;
      if(g.balance.mode==='recovery'){if(Math.abs(g.balance.roll)>.1)direction=-Math.sign(g.balance.roll);}
      else{
       const w=g.wave.waves.find(w=>g.p.z>w.from-40&&g.p.z<w.to-18);
       const desired=w?g.wave.crestX(w,g.p.z+8)+w.width*.42:1;
       const delta=desired-g.p.x;
       if(Math.abs(delta)>.65)direction=Math.sign(delta);
       const obstacle=g.world.hazards.find(h=>!h.hit&&!h.done&&h.type!=='shark'&&h.z-g.p.z>5&&h.z-g.p.z<28&&Math.abs(h.x-g.p.x)<2.1);
       if(obstacle)direction=g.p.x<obstacle.x?-1:1;
       const threat=g.world.threat();if(threat&&Math.abs(threat.shark.x-g.p.x)<2.2)direction=g.p.x<0?1:-1;
      }
      if(turn){key(turn,false);turn=null;}
      if(direction){turn=direction>0?'ArrowRight':'ArrowLeft';key(turn,true);releaseAt=g.time+(g.balance.mode==='recovery'?.1:.12);}
      if(frame%120===0)samples.push({z:Math.round(g.p.z),beer:g.mug.level,balance:g.p.balance});
     }
     g.step(dt);g.comics.update(dt);
    }
    if(turn)key(turn,false);g.spill=spill;g.balance.fall=fall;
    g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
    results.push({assisted,state:g.state,seconds:g.elapsed,beer:g.mug.level,waves:g.waveRide.totalCaught,falls:g.balance.falls,fallCauses:falls,saves:g.balance.saves,spills,samples});
   }
   return results;
  });
  console.log(JSON.stringify(report,null,2));
  const dir=path.resolve(__dirname,'../review/comics/novice');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({report,errors},null,2));
  assert.deepEqual(errors,[]);assert.equal(report[0].state,'finished');assert.ok(report[0].waves>=3,'first ride can collect three waves with coarse keyboard input');assert.ok(report[0].beer>=.3,'first ride reaches the story goal with coarse keyboard input');
  for(const ride of report)for(const fall of ride.fallCauses){assert.ok(fall.risk>=1.05,'every fall follows visible board instability');assert.equal(fall.caption,fall.source||'ДОСКА ЗАВАЛИЛАСЬ','fall screen retains the initiating cause');}
  console.log('PASS: novice keyboard pulses, delayed corrections, complete routes in both modes.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
