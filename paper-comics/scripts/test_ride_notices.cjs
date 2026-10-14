const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const dir=path.resolve(__dirname,'../review/comics/ride-notices');fs.mkdirSync(dir,{recursive:true});
  const report={errors:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
      userDataDir:fs.mkdtempSync(path.join(dir,'.chrome-')),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';game.audio.stopBGM();});
    report.rules=await page.evaluate(()=>{
      const g=game,moment=document.getElementById('moment'),toast=document.getElementById('chain-toast');
      const expire=()=>{g.momentTime=g.chain.toastTime=0;moment.classList.remove('visible');toast.classList.remove('visible');};
      g.reset();g.state='playing';g.chase.end('test');
      for(let i=0;i<10;i++){g.time=i*3;g.awardTrick('КАРВИНГ',100);}
      const routine={count:g.chain.count,points:g.chain.points,visible:moment.classList.contains('visible')||toast.classList.contains('visible')};
      g.reset();g.state='playing';g.chase.end('test');g.chain.add('КАРВИНГ',100);const smallBank=g.chain.bank();
      const small={value:smallBank,score:g.score,visible:toast.classList.contains('visible')};
      g.reset();g.state='playing';g.chase.end('test');g.awardTrick('360°',800);
      const first={title:moment.querySelector('strong').textContent,visible:moment.classList.contains('visible'),duration:g.momentTime};
      const acceptedUntil=g.rewardNoticeTime;expire();g.time=2;g.awardTrick('ПЕРЕВОРОТ!',1600);
      const cooldown=moment.classList.contains('visible');expire();g.time=9;g.awardTrick('360°',800);
      const repeated=moment.classList.contains('visible');g.awardTrick('ПЕРЕВОРОТ!',1600);
      const next={title:moment.querySelector('strong').textContent,visible:moment.classList.contains('visible'),count:g.chain.count,points:g.chain.points};
      expire();g.time=20;g.chain.clear();for(let i=0;i<3;i++)g.chain.add('360°',1500);
      const bigBank=g.chain.bank(),bigVisible=toast.classList.contains('visible'),bigTitle=toast.querySelector('strong').textContent;
      expire();g.time=22;for(let i=0;i<3;i++)g.chain.add('360°',500);const anotherBank=g.chain.bank();
      const anotherVisible=toast.classList.contains('visible');
      g.spill(.025,'УДАР ОБ БУЙ');const warning={visible:moment.classList.contains('visible'),bad:moment.classList.contains('bad'),title:moment.querySelector('strong').textContent};
      g.jump.tricks=1;g.meta.step(.3);const mission=g.meta.completedLive.has('spin');
      const missionDuringCooldown=toast.classList.contains('visible');
      g.reset();g.state='playing';g.awardTrick('360°',800);const restarted=moment.classList.contains('visible');
      g.state='paused';return {routine,small,first,acceptedUntil,cooldown,repeated,next,bigBank,bigVisible,bigTitle,anotherBank,anotherVisible,warning,mission,missionDuringCooldown,restarted};
    });
    const r=report.rules;
    assert.deepEqual(r.routine,{count:10,points:1000,visible:false},'routine gains update scoring without banners');
    assert.deepEqual(r.small,{value:100,score:100,visible:false},'small chains bank silently');
    assert.ok(r.first.visible&&r.first.title==='360°'&&r.first.duration===1.7&&r.acceptedUntil===8);
    assert.equal(r.cooldown,false,'different reward sources share the cooldown');assert.equal(r.repeated,false,'the same trick banner appears once per run');
    assert.deepEqual(r.next,{title:'ПЕРЕВОРОТ!',visible:true,count:4,points:4800},'suppressed notices never suppress points');
    assert.ok(r.bigVisible&&r.bigTitle==='ЗАЧТЕНО'&&r.bigBank===13500);
    assert.equal(r.anotherBank,4500);assert.equal(r.anotherVisible,false,'large banks also respect the shared cooldown');
    assert.deepEqual(r.warning,{visible:true,bad:true,title:'УДАР ОБ БУЙ'},'impacts remain immediate');
    assert.ok(r.mission&&!r.missionDuringCooldown&&r.restarted,'mission progress is recorded and a new run resets notices');
    report.layouts=[];
    for(const [width,height] of [[360,640],[393,852],[430,932],[844,390],[1280,800]]){
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      const layout=await page.evaluate(async()=>{
        const g=game;g.reset();g.state='paused';g.chase.end('preview');g.journey.hideAll();g.container.classList.add('playing');
        g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
        ['start-screen','pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
        g.p.z=380;g.p.x=0;g.p.y=g.wave.height(g.p.x,g.p.z);g.awardTrick('360°',800);
        g.wave.update(g.p.z,g.time,true);g.updateCamera(1,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
        await document.fonts.ready;document.getAnimations().forEach(a=>{a.currentTime=400;a.pause();});
        const moment=document.getElementById('moment'),r=moment.getBoundingClientRect(),s=g.container.getBoundingClientRect();
        return {visible:getComputedStyle(moment).visibility==='visible',inside:r.left>=s.left&&r.right<=s.right&&r.top>=s.top&&r.bottom<=s.bottom,
          animation:getComputedStyle(moment).animationName,points:moment.querySelector('.moment-points').textContent};
      });
      assert.ok(layout.visible&&layout.inside,'important notice stays readable on '+width);
      assert.equal(layout.animation,'reward-note');assert.equal(layout.points,'+800');
      await page.screenshot({path:path.join(dir,width+'-important-trick.png')});report.layouts.push({width,height,...layout});
    }
    assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
