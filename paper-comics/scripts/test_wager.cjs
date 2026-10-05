const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const review=path.resolve(__dirname,'../review/comics/wager');fs.mkdirSync(review,{recursive:true});
  const errors=[],missing=[],layouts=[];let browser;
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.setDefaultTimeout(30000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/WebGL|Shader|THREE/.test(m.text()))errors.push(m.text());});
    page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('favicon.ico'))missing.push(r.url());});
    const shot=async name=>{await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>['panel-hit','panel-slide'].includes(a.animationName)).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:path.join(review,name+'.png')});};
    for(const [name,width,height,mobile] of [['mobile',393,852,true],['small',360,640,true],['desktop',1240,900,false],['landscape',844,390,true]]){
      await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
      await page.goto(base,{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.game);
      await page.evaluate(async()=>{await game.companion.ready;});
      await page.click('#start-button');await page.click('#setup-next');
      const pages=await page.evaluate(()=>game.journey.story.length);assert.equal(pages,2);
      for(let i=0;i<pages;i++){
        await page.waitForFunction(()=>document.getElementById('comic-loading').hidden);
        await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
        const layout=await page.evaluate(()=>{
          const button=document.getElementById('story-next').getBoundingClientRect(),stage=game.container.getBoundingClientRect();
          const panels=[...document.querySelectorAll('.comic-panel')].map(panel=>{
            const image=panel.querySelector('img'),bubble=panel.querySelector('.comic-bubble'),r=panel.getBoundingClientRect(),b=bubble.getBoundingClientRect();
            const range=document.createRange();range.selectNodeContents(bubble);const text=range.getBoundingClientRect();
            return {image:image.complete&&image.naturalWidth>500,visible:r.width>=120&&r.height>=120,font:parseFloat(getComputedStyle(bubble).fontSize),bubbleFits:b.left>=r.left-2&&b.right<=r.right+2&&b.top>=r.top-2&&b.bottom<=r.bottom+2,textFits:text.width<b.width&&text.height<b.height,line:bubble.textContent};
          });
          return {page:game.journey.page,panels,buttonFits:button.bottom<=stage.bottom+1&&button.right<=stage.right+1,oldCaptions:document.querySelectorAll('.story-dialogue,.story-caption,#story-tag').length};
        });layouts.push({name,...layout});assert.equal(layout.page,i);assert.ok(layout.buttonFits,name+' button '+i);assert.equal(layout.oldCaptions,0);assert.equal(layout.panels.length,3);
        layout.panels.forEach((panel,j)=>{assert.ok(panel.image,name+' actual image '+i+'/'+j);assert.ok(panel.visible,name+' frame visible '+i+'/'+j);assert.ok(panel.font>=20,name+' readable bubble '+i+'/'+j);assert.ok(panel.bubbleFits&&panel.textFits,name+' bubble fits '+i+'/'+j);});
        await shot(name+'-story-'+(i+1));
        if(i===1){await page.click('#story-prev');assert.equal(await page.evaluate(()=>game.journey.page),0);await page.click('#story-next');await page.waitForFunction(()=>document.getElementById('comic-loading').hidden);}
        await page.click('#story-next');
      }
      await page.waitForFunction(()=>game.state==='playing');
      await page.evaluate(()=>{
        const g=game;g.state='paused';g.reset();g.journey.hideAll();g.container.classList.add('playing');
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);g.p.z=360;g.p.y=g.wave.height(g.p.x,g.p.z);
        g.updateCamera(1,true);g.wave.update(g.p.z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
      });await shot(name+'-tail-rest');
      const tail=await page.evaluate(()=>{
        const g=game,c=g.companion,anchor=g.player.board.localToWorld(c.tail.clone()),foot=c.card.getWorldPosition(new THREE.Vector3());foot.y-=c.frames[c.pose].height*.46;
        const screen=anchor.clone().project(g.camera),rect=g.container.getBoundingClientRect();
        return {pose:c.pose,visible:c.card.visible,attachmentError:anchor.distanceTo(foot),behind:anchor.z<g.p.z,screenX:(screen.x*.5+.5)*rect.width,screenY:(-.5*screen.y+.5)*rect.height,boardLength:g.player.board.geometry.parameters.height};
      });assert.equal(tail.pose,'rest');assert.equal(tail.visible,true);assert.ok(tail.attachmentError<.001);assert.equal(tail.behind,true);assert.equal(tail.boardLength,4.8);
      await page.evaluate(()=>{const g=game;g.p.airborne=true;g.p.airY=1.8;g.p.y+=1.8;g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);});
      assert.equal(await page.evaluate(()=>game.companion.pose),'raised');await shot(name+'-tail-jump');
      await page.evaluate(()=>{const g=game;g.p.airborne=false;g.p.airY=0;g.p.y=g.wave.height(g.p.x,g.p.z);g.p.lean=.65;g.p.heading=.2;g.balance.roll=.3;g.updateVisuals(0);g.renderer.render(g.scene,g.camera);});
      assert.ok(Math.abs(await page.evaluate(()=>game.companion.card.rotation.z))>.01);await shot(name+'-tail-turn');
      for(const [outcome,level] of [['victory',.30],['defeat',.299]]){
        await page.evaluate(level=>{game.state='paused';game.mug.level=level;game.waveRide.totalCaught=0;game.finish();},level);
        assert.equal(await page.$eval('#result-screen',el=>el.dataset.outcome),outcome);
        assert.equal(await page.$eval('#result-beer',el=>el.textContent),outcome==='victory'?'30%':'29%');
        const result=await page.evaluate(()=>{const c=document.querySelector('.result-card').getBoundingClientRect(),b=document.getElementById('replay-button').getBoundingClientRect();return {fits:b.top>=c.top&&b.bottom<=c.bottom,line:document.getElementById('result-crab-line').textContent,canvas:document.getElementById('result-crab').width};});
        assert.ok(result.fits,name+' result CTA '+outcome);assert.ok(result.canvas>0);assert.ok(result.line.includes(outcome==='victory'?'Мы легенды':'рулю я'));await shot(name+'-'+outcome);
      }
    }
    const events=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';
      g.spill(.04,'ТЕСТ');const spill=g.companion.heard.has('spill');
      const h=g.world.hazards.find(h=>h.type==='shark');g.p.z=h.initialZ-10;g.world.stepChaser(h,1/120);
      const shark=g.companion.heard.has('shark'),priority=document.getElementById('crab-callout').dataset.event;
      const repeated=g.companion.react('shark',true);
      g.time+=4;g.world.endChase(h,true);const escape=g.companion.heard.has('escape');
      g.time+=8;g.awardTrick('КАРВИНГ',100);const trick=g.companion.heard.has('trick');
      g.time+=4;g.companion.step();const expired=!document.getElementById('crab-callout').classList.contains('visible');
      g.reset();const reset=g.companion.heard.size===0&&g.companion.pose==='rest';
      return {spill,shark,priority,repeated,escape,trick,expired,reset};
    });assert.deepEqual(events,{spill:true,shark:true,priority:'shark',repeated:false,escape:true,trick:true,expired:true,reset:true});
    // An unavailable illustration must show a retry, never an empty blue panel.
    await page.setCacheEnabled(false);await page.setRequestInterception(true);
    let failComic=true;
    const intercept=request=>(failComic&&request.url().endsWith('comic-crab-v4.png')?request.abort():request.continue()).catch(()=>{});
    page.on('request',intercept);
    await page.goto(base,{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.game);
    await page.click('#start-button');await page.click('#setup-next');
    await page.waitForFunction(()=>!document.getElementById('comic-retry').hidden);
    assert.equal(await page.$eval('#comic-loading span',el=>el.textContent),'КАДР НЕ ЗАГРУЗИЛСЯ');
    failComic=false;await page.click('#comic-retry');await page.waitForFunction(()=>document.getElementById('comic-loading').hidden);
    assert.equal(await page.$$eval('.comic-panel img',images=>images.length===3&&images.every(image=>image.complete&&image.naturalWidth>500)),true);
    await page.evaluate(()=>document.activeElement.blur());
    await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>game.journey.page),1);
    await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>game.journey.page),0);
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>game.journey.screen),'setup');
    await page.click('#setup-next');await page.click('#story-skip');await page.waitForFunction(()=>game.state==='playing');
    page.off('request',intercept);await page.setRequestInterception(false);
    await page.goto(base+'/prototype.html',{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.game);await page.evaluate(async()=>{await game.start(false);});assert.equal(await page.evaluate(()=>game.state),'playing');
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    fs.writeFileSync(path.join(review,'verification.json'),JSON.stringify({layouts,events,imageRetry:true,keyboardNavigation:true,skip:true,errors,missing},null,2));
    console.log('PASS: two-page comic with decoded artwork and readable in-panel dialogue in four viewports, image retry, keyboard/back/skip navigation, tail attachment, jump/turn poses, 30% win boundary, result CTA, event priorities/cooldowns, reset and prototype entry.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
