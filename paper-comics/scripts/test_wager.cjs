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
      for(let i=0;i<4;i++){
        const layout=await page.evaluate(()=>{
          const panel=document.querySelector('.story-main-panel').getBoundingClientRect(),title=document.getElementById('story-title');
          const range=document.createRange();range.selectNodeContents(title);const text=range.getBoundingClientRect();
          const button=document.getElementById('story-next').getBoundingClientRect(),stage=game.container.getBoundingClientRect();
          const dialogue=document.querySelector('.story-dialogue').getBoundingClientRect();
          return {page:game.journey.page,titleFits:text.right<=panel.right+2,buttonFits:button.bottom<=stage.bottom+1&&button.right<=stage.right+1,dialogueFits:dialogue.bottom<button.top,tag:document.getElementById('story-tag').textContent};
        });layouts.push({name,...layout});assert.equal(layout.page,i);assert.ok(layout.titleFits,name+' title '+i);assert.ok(layout.buttonFits,name+' button '+i);assert.ok(layout.dialogueFits,name+' dialogue '+i);
        assert.ok(['ПАРИ','БЕЗУМНЫЙ','СУДЬЯ','КУБОК'].some(word=>layout.tag.includes(word)));
        await shot(name+'-story-'+(i+1));await page.click('#story-next');
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
        await page.evaluate(level=>{game.mug.level=level;game.waveRide.totalCaught=0;game.finish();},level);
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
      g.time+=4;g.awardTrick('КАРВИНГ',100);const trick=g.companion.heard.has('trick');
      g.time+=4;g.companion.step();const expired=!document.getElementById('crab-callout').classList.contains('visible');
      g.reset();const reset=g.companion.heard.size===0&&g.companion.pose==='rest';
      return {spill,shark,priority,repeated,escape,trick,expired,reset};
    });assert.deepEqual(events,{spill:true,shark:true,priority:'shark',repeated:false,escape:true,trick:true,expired:true,reset:true});
    await page.goto(base+'/prototype.html',{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.game);await page.evaluate(async()=>{await game.start(false);});assert.equal(await page.evaluate(()=>game.state),'playing');
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    fs.writeFileSync(path.join(review,'verification.json'),JSON.stringify({layouts,events,errors,missing},null,2));
    console.log('PASS: wager comic in four viewports, tail attachment, jump/turn poses, 30% win boundary, result CTA, event priorities/cooldowns, reset and prototype entry.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
