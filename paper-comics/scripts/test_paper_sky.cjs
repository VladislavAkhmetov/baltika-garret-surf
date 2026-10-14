const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const review=path.resolve(__dirname,'../review/comics/paper-sky');fs.mkdirSync(review,{recursive:true});
  const errors=[],missing=[],report={};let browser;
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',
      userDataDir:path.join(review,'chrome-profile'),headless:true,
      args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))missing.push(response.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto(base,{waitUntil:'networkidle0'});
    report.projection=await page.evaluate(()=>{
      const g=game,sky=g.paperSky;g.state='paused';
      const read=()=>sky.layers.map(layer=>({anchor:layer.position.toArray(),
        x:parseFloat(layer.element.style.getPropertyValue('--sky-x')),
        y:parseFloat(layer.element.style.getPropertyValue('--sky-y')),
        width:parseFloat(layer.element.style.getPropertyValue('--sky-width')),
        turn:parseFloat(layer.element.style.getPropertyValue('--sky-turn')),
        visibility:getComputedStyle(layer.element).visibility}));
      g.reset();g.state='paused';g.resize();g.updateCamera(1,true);sky.update();const initial=read();
      g.p.z=700;g.p.x=8;g.updateCamera(1,true);sky.update();const progress=read();
      const orientation=g.camera.quaternion.clone();
      g.camera.rotateY(.12);sky.update();const turning=read();
      g.camera.quaternion.copy(orientation);g.camera.rotateZ(.08);sky.update();const rolled=read();
      g.camera.lookAt(g.camera.position.clone().add(new THREE.Vector3(0,0,-1)));sky.update();const behind=read();
      g.reset();g.state='paused';g.updateCamera(1,true);sky.update();const reset=read();
      g.container.style.setProperty('--speed-blur','1');g.reducedMotion=true;sky.update();
      const crisp={sky:getComputedStyle(sky.element).filter,
        paper:sky.layers.map(layer=>getComputedStyle(layer.element,'::before').filter)};
      g.reducedMotion=false;
      return {initial,progress,turning,rolled,behind,reset,crisp};
    });
    const p=report.projection;
    fs.writeFileSync(path.join(review,'projection.json'),JSON.stringify(p,null,2));
    assert.deepEqual(p.initial.map(l=>l.anchor),p.progress.map(l=>l.anchor),'rider movement must not re-anchor sky scenery');
    assert.ok(p.initial.every((l,i)=>Math.hypot(l.x-p.progress[i].x,l.y-p.progress[i].y)>1&&p.progress[i].width>l.width),'forward movement changes position and perspective scale');
    assert.ok(p.progress.every((l,i)=>Math.hypot(l.x-p.turning[i].x,l.y-p.turning[i].y)>20),'camera yaw must move every paper layer');
    assert.ok(p.progress.every((l,i)=>Math.abs(l.turn-p.rolled[i].turn)>3),'camera roll must rotate every paper layer');
    assert.ok(p.behind.every(l=>l.visibility==='hidden'),'sky layers behind the camera must disappear');
    assert.deepEqual(p.initial,p.reset,'reset must restore the same world projection');
    assert.equal(p.crisp.sky,'none');assert.ok(p.crisp.paper.every(filter=>filter==='none'),'speed and motion settings must not blur the paper');
    report.frames=[];
    for(const [name,width,height] of [['phone',393,852],['small',360,640],['desktop',1280,800],['landscape',844,390]]){
      await page.setViewport({width,height,isMobile:name!=='desktop',hasTouch:name!=='desktop'});
      for(const z of [0,700]){
        const frame=await page.evaluate(z=>{
          const g=game;g.reset();g.state='paused';g.journey.hideAll();g.container.classList.add('playing');
          g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.p.z=z;g.p.x=0;
          g.time=z/30;g.wave.time=g.time;g.p.y=g.wave.height(g.p.x,z,g.time);g.resize();g.updateCamera(1,true);
          g.wave.update(z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);g.renderDirty=false;
          const sky=g.paperSky;
          return {z,overflow:document.documentElement.scrollWidth>innerWidth,
            finite:sky.layers.every(l=>['--sky-x','--sky-y','--sky-width','--sky-height','--sky-turn'].every(key=>Number.isFinite(parseFloat(l.element.style.getPropertyValue(key))))),
            filter:getComputedStyle(sky.element).filter};
        },z);
        assert.ok(frame.finite&&!frame.overflow);assert.equal(frame.filter,'none');report.frames.push({name,...frame});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        await page.screenshot({path:path.join(review,name+'-'+z+'.png')});
      }
    }
    await page.goto(base+'/prototype.html',{waitUntil:'networkidle0'});
    assert.equal(await page.evaluate(()=>game.paperSky.layers.length),4,'both game entry pages must initialize the projected sky');
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    fs.writeFileSync(path.join(review,'verification.json'),JSON.stringify({...report,errors,missing},null,2));
    console.log('PASS: fixed world anchors, perspective, camera yaw/roll, visibility, reset, crisp paper, four viewports and both entry pages.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
