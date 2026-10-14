const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const dir=path.resolve(__dirname,'../review/comics/speed-blur');fs.mkdirSync(dir,{recursive:true});
  const report={frames:[],errors:[]};let browser;
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
      args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))report.errors.push(m.text());});
    for(const entry of ['index.html','prototype.html']){
      await page.goto('http://127.0.0.1:'+server.address().port+'/'+entry+'?seed=42',{waitUntil:'networkidle0'});
      await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();await game.rush.ready;});
      for(const [layout,width,height] of [['phone',393,852],['desktop',1280,800]]){
        await page.setViewport({width,height});
        for(const event of ['pad','crest']){
          const result=await page.evaluate(event=>{
            const g=game;g.reset();g.state='playing';g.reducedMotion=false;g.juice.setLiveCamera(true);g.resize();
            g.p.speed=24;g.journey.hideAll();g.rivals.forEach(r=>{r.z=-100;r.encounter=null;});
            if(event==='pad'){
              const pad=g.rush.accelerators[0];g.p.z=pad.z;g.p.x=pad.x;
              g.time=pad.z/33;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,g.p.z);
              g.rush.collectAccelerators();
            }else{
              const w=g.wave.waves[0];g.time=w.encounterTime;g.wave.time=g.time;g.p.z=54;
              g.p.x=g.wave.crestX(w,g.p.z)+w.width*.07;g.p.y=g.wave.height(g.p.x,g.p.z);
              g.p.heading=Math.atan((g.wave.crestX(w,g.p.z+1)-g.wave.crestX(w,g.p.z-1))/2/.38);
              for(let i=0;i<180;i++)g.waveRide.step(1/120);
              // The visual must work below the old speed threshold, even after a speed loss.
              g.p.speed=24;
            }
            g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(1/60);
            const active={amount:g.speedBlur.amount,burst:g.speedBlur.burst,crestTime:g.waveRide.crestTime,padTime:g.rush.padTime};
            const source=g.renderer.domElement,c=document.createElement('canvas');c.width=source.width;c.height=source.height;
            const ctx=c.getContext('2d');
            const frame=()=>{g.speedBlur.render();ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(source,0,0);return {pixels:ctx.getImageData(0,0,c.width,c.height).data,png:c.toDataURL()};};
            const fast=frame();g.speedBlur.reset();
            // Match the render-target path so MSAA differences do not count as blur.
            g.speedBlur.amount=.015;const normal=frame();
            const region=(x0,y0,x1,y1)=>{let sum=0,changed=0,n=0;
              for(let y=Math.floor(c.height*y0);y<c.height*y1;y++)for(let x=Math.floor(c.width*x0);x<c.width*x1;x++){
                const i=(y*c.width+x)*4;let delta=0;for(let k=0;k<3;k++)delta+=Math.abs(fast.pixels[i+k]-normal.pixels[i+k]);
                sum+=delta/3;changed+=delta>15?1:0;n++;
              }return {mean:sum/n,changed:changed/n};};
            const pixels={left:region(.02,.45,.22,.94),right:region(.78,.45,.98,.94),rider:region(.34,.44,.70,.72)};
            g.speedBlur.update(1/60);
            const sustained=g.speedBlur.burst;
            g.state='paused';g.speedBlur.update(.1);const paused=g.speedBlur.amount;
            g.state='playing';g.reducedMotion=true;g.speedBlur.update(.1);const reduced=g.speedBlur.amount;
            g.reducedMotion=false;g.juice.setLiveCamera(false);g.speedBlur.update(.1);const calm=g.speedBlur.amount;
            g.juice.setLiveCamera(true);g.p.fallen=true;g.speedBlur.update(.1);const fallen=g.speedBlur.amount;
            g.p.fallen=false;g.p.airborne=true;g.rush.padTime=0;g.speedBlur.update(.1);const airborneCrest=g.speedBlur.burst;
            g.p.airborne=false;g.p.recovering=.9;g.speedBlur.update(.1);const recoveringCrest=g.speedBlur.burst;
            g.p.recovering=0;g.rush.padTime=0;g.waveRide.caught=false;g.speedBlur.update(2);const expired=g.speedBlur.amount;
            g.state='paused';
            return {active,pixels,sustained,paused,reduced,calm,fallen,airborneCrest,recoveringCrest,expired,normal:normal.png,fast:fast.png};
          },event);
          const name=entry.replace('.html','')+'-'+layout+'-'+event;
          for(const kind of ['normal','fast']){fs.writeFileSync(path.join(dir,name+'-'+kind+'.png'),Buffer.from(result[kind].split(',')[1],'base64'));delete result[kind];}
          report.frames.push({name,...result});fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
          assert.ok(result.active.burst>.9&&result.active.amount>=.8,name+': acceleration enables blur below top speed');
          assert.ok(result.sustained>.9,name+': blur lasts throughout earned acceleration');
          assert.ok(Math.max(result.pixels.left.mean,result.pixels.right.mean)>2&&Math.max(result.pixels.left.changed,result.pixels.right.changed)>.1,name+': visible peripheral smear '+JSON.stringify(result.pixels));
          assert.ok(result.pixels.rider.mean<.2,name+': the rider stays sharp');
          for(const key of ['paused','reduced','calm','fallen','airborneCrest','recoveringCrest'])assert.equal(result[key],0,name+': '+key);
          assert.ok(result.expired<.01,name+': effect ends after acceleration');
        }
      }
    }
    assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
