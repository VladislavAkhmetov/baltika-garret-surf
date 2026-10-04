// Staged visual inspection of the actual renderer; functional runs are separate.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 const review=path.resolve(__dirname,'../review/comics/scenes');fs.mkdirSync(review,{recursive:true});
 try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.game);
  const prepare=()=>page.evaluate(async()=>{await game.start(false);game.state='paused';window.sceneAt=(z,face=.38)=>{const g=game;g.reset();g.state='paused';g.container.classList.add('playing');['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));g.p.z=z;const w=g.wave.waves.find(w=>z>w.from&&z<w.to);g.p.x=w?g.wave.crestX(w,z)+w.width*face:1;g.p.y=g.wave.height(g.p.x,z);g.heroAnimator.apply('trim',0);g.updateCamera(1,true);};window.drawScene=()=>{game.updateVisuals(0);game.updateHUD();game.wave.update(game.p.z,game.time,true);game.renderer.render(game.scene,game.camera);game.comics.capture();};});await prepare();
  for(const [name,z,face] of [['wave-face',110,.38],['wave-crest',480,.08],['wave-gap',370,.38]]){await page.evaluate((z,face)=>{sceneAt(z,face);drawScene();},z,face);await page.screenshot({path:path.join(review,name+'.png')});}
  await page.evaluate(()=>{sceneAt(412);game.world.step(1/120);const h=game.world.hazards.find(h=>h.type==='shark');h.z=game.p.z-5;h.x=h.targetX=game.p.x;game.updateCamera(1,true);drawScene();});await page.screenshot({path:path.join(review,'shark-close.png')});
  await page.evaluate(()=>{sceneAt(70,.08);game.state='playing';game.jump.press();for(let i=0;i<60;i++)game.step(1/120);game.jump.release();game.step(1/120);while(game.p.jumpVelocity>0)game.step(1/120);game.state='paused';game.comics.reset();game.heroAnimator.update(0);game.updateCamera(1,true);drawScene();});await page.screenshot({path:path.join(review,'jump-apex.png')});
  for(const variant of ['crest','save','transfer']){await page.evaluate(v=>{sceneAt(120);game.comics.reset();game.comics.trigger(v==='crest'?'УАУ!':v==='save'?'ФУХ!':'ВЖУХ!','КРУЖКА НА МЕСТЕ',v);drawScene();},variant);await new Promise(resolve=>setTimeout(resolve,220));await page.screenshot({path:path.join(review,'anime-'+variant+'.png')});}
  await page.setViewport({width:393,height:650,isMobile:true,hasTouch:true});await page.evaluate(()=>{sceneAt(480);game.comics.reset();game.resize();game.updateCamera(1,true);drawScene();});await page.screenshot({path:path.join(review,'short-mobile.png')});
  await page.setViewport({width:1240,height:900,isMobile:false,hasTouch:false});await page.waitForFunction(()=>window.game);await prepare();await page.evaluate(()=>{sceneAt(480);game.resize();game.updateCamera(1,true);drawScene();});await page.screenshot({path:path.join(review,'square-desktop.png')});
  console.log('Visual scenes saved to '+review);
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
