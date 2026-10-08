const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const review=path.resolve(__dirname,'../review/comics/rivals');fs.mkdirSync(review,{recursive:true});const errors=[],report={};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push('HTTP '+r.status()+' '+r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});
    const pause=()=>{game.state='paused';game.journey.hideAll();document.getElementById('pause-screen').classList.add('hidden');};
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.journey.hideAll();});
    report.first=await page.evaluate(()=>game.rivals.map(r=>r.id));
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.journey.hideAll();});
    report.second=await page.evaluate(()=>game.rivals.map(r=>r.id));
    assert.deepEqual(report.first,['grandma','dj']);assert.deepEqual(report.second,['blonde','couple']);
    report.scene=await page.evaluate(()=>{
      const g=game;g.reset();g.state='paused';
      const beer=document.querySelector('.beer-ticket').getBoundingClientRect(),score=document.querySelector('.score-ticket').getBoundingClientRect();
      return {caps:g.caps.length,collection:getComputedStyle(document.querySelector('.collection-ticket')).display,
        jetskis:g.world.hazards.filter(h=>h.type==='jetski').map(h=>h.initialZ),rivals:g.rivals.length,
        hudFits:beer.left>=0&&score.right<=innerWidth&&beer.right<score.left};
    });
    assert.equal(report.scene.caps,0);assert.equal(report.scene.collection,'none');assert.equal(report.scene.rivals,2);assert.ok(report.scene.hudFits);assert.ok(Math.min(...report.scene.jetskis)>=658);
    report.cast=[];
    for(const id of ['grandma','dj','blonde','couple']){
      const r=await page.evaluate(id=>{
        const g=game;g.reset();g.state='paused';g.journey.hideAll();g.p.x=0;g.p.z=340;g.time=12;g.wave.time=12;g.p.y=g.wave.height(0,340);
        const rival=g.rivals[0],profile=g.rivalCast.profiles.find(p=>p.id===id);g.rivalCast.apply(rival,profile);rival.x=-3.8;rival.z=g.p.z+7;rival.lean=0;g.rivals[1].z=g.p.z+250;
        g.world.hazards.forEach(h=>h.done=true);g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.speedBlur.render();
        const image=profile.texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
        const alpha=ctx.getImageData(0,0,1,1).data[3],anchor=rival.rig.footAnchor.clone().applyQuaternion(rival.rig.card.quaternion).add(rival.rig.card.position);
        const footer=anchor.distanceTo(rival.rig.board.position);
        return {id,height:rival.rig.card.geometry.parameters.height,boardWidth:rival.rig.board.scale.x,texture:image.src,alpha,footer,finite:rival.rig.card.matrixWorld.elements.every(Number.isFinite)};
      },id);
      assert.ok(r.height>=3.2&&r.height<=3.5,'adult cutouts match the hero scale');assert.ok(r.alpha<=2,'source background is transparent');assert.ok(r.footer<.0001&&r.finite,'photographed stance stays anchored on the shared board');
      report.cast.push(r);await page.screenshot({path:path.join(review,id+'.png')});
    }
    assert.equal(new Set(report.cast.map(r=>r.texture)).size,4);assert.ok(report.cast[3].boardWidth>report.cast[0].boardWidth);
    report.props=[];
    for(const id of ['ship','umbrella','rescue','sign']){
      const r=await page.evaluate(id=>{
        const g=game;g.reset();g.state='paused';g.journey.hideAll();const line=g.trickRoute.lines.find(l=>l.prop===id),entry=g.trickRoute.position(line,0);
        g.p.x=entry.x;g.p.z=entry.z-19;g.time=g.p.z/30;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,g.p.z);g.rivals.forEach(r=>r.z=g.p.z+250);
        g.world.hazards.forEach(h=>h.done=true);g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.speedBlur.render();
        const pos=line.top.geometry.attributes.position;let flatError=0,surfaceError=0;const center=g.trickRoute.point(line,.5,0);
        for(let i=0;i<pos.count;i++){
          const x=-pos.getX(i),z=pos.getZ(i);flatError=Math.max(flatError,Math.abs(pos.getY(i)-center.y-(x-center.x)*line.edgeSide*line.height/line.width-(z-center.z)*line.forwardRise/line.length));
          surfaceError=Math.max(surfaceError,Math.abs(pos.getY(i)-g.trickRoute.surface(line,x,z).height));
        }
        return {id,visible:line.group.visible,arrows:line.arrows.length,flatError,surfaceError,width:line.width,length:line.length};
      },id);
      assert.ok(r.visible&&r.flatError<.001&&r.surfaceError<.001,'rendered prop is the same flat surface that supports the board');assert.equal(r.arrows,id==='ship'||id==='umbrella'?0:3);
      report.props.push(r);await page.screenshot({path:path.join(review,id+'.png')});
    }
    report.blur=await page.evaluate(()=>{
      const g=game;g.state='playing';g.juice.calm=false;g.p.fallen=false;g.assist=true;g.p.speed=26;g.speedBlur.reset();g.speedBlur.update(1);const slow=g.speedBlur.amount;
      g.p.speed=35;g.speedBlur.update(1);const fast=g.speedBlur.amount;g.state='paused';g.speedBlur.update(1);return {slow,fast,paused:g.speedBlur.amount,supported:g.speedBlur.supported};
    });
    assert.equal(report.blur.slow,0);assert.ok(report.blur.fast>.9);assert.equal(report.blur.paused,0);
    report.music=await page.evaluate(()=>{
      const a=game.audio;a.unlock();a.isMuted=false;a.bgmPlaying=true;a.updateRivalMusic(1,5,.5);const plays=!!a.rivalMusicGain&&a.rivalMusicBeat>0;
      a.stopBGM();const paused=a.rivalMusicGain?.gain.value===0;
      a.bgmPlaying=true;a.isMuted=true;a.updateRivalMusic(1,5,0);const muted=a.rivalMusicGain?.gain.value===0;
      a.isMuted=false;a.updateRivalMusic(1,999,0);return {plays,paused,muted,distant:a.rivalMusicGain?.gain.value===0};
    });
    assert.deepEqual(report.music,{plays:true,paused:true,muted:true,distant:true});
    assert.deepEqual(errors,[]);report.errors=errors;fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
