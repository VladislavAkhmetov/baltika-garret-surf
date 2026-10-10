const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const dir=path.resolve(__dirname,'../review/comics/rush');fs.mkdirSync(dir,{recursive:true});
  const report={errors:[],frames:[]};
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
    await page.setViewport({width:393,height:852,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?seed=42',{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await game.start(false);game.state='paused';await game.rush.ready;game.audio.stopBGM();game.journey.hideAll();});
    report.rules=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';
      const r=g.rush;r.reward('ЛИНИЯ КРЫШЕК');const capsDoNotCharge=r.moves.size===0;
      r.reward('ЧИСТЫЙ ОБГОН');g.time+=1;r.reward('ЧИСТЫЙ ОБГОН');const duplicate=r.moves.size;
      g.time+=1;r.reward('НАД БУЕМ!');g.time+=1;r.reward('360°');r.step(.2);
      const started=r.active>3&&r.activations===1&&r.boost>3;
      g.state='paused';const before=r.active;g.updateVisuals(0);const paused=r.active===before;
      g.state='playing';g.spill(.025,'УДАР ОБ БУЙ');const broken=r.active===0&&r.moves.size===0;
      g.awardTrick('360°',600);g.updateHUD();const moment=document.getElementById('moment');
      const coherent=moment.classList.contains('bad')&&!moment.classList.contains('reward')&&moment.querySelector('.moment-points').textContent==='';
      const visible=['moment','ride-coach','chain-toast','hint'].filter(id=>{const e=document.getElementById(id);return getComputedStyle(e).visibility==='visible'&&!e.classList.contains('hidden')&&!e.classList.contains('invisible')&&(id==='ride-coach'||id==='hint'||e.classList.contains('visible'));});
      r.breakStreak();g.time+=1;r.reward('ЧИСТЫЙ ОБГОН');r.step(7);const expires=r.moves.size===0;
      g.reset();g.state='playing';const arc=g.rush.lines.find(l=>l.air);g.rush.lockArc(arc);
      const cap=arc.caps[3];g.p.x=cap.x;g.p.z=cap.z;g.p.y=cap.y-1.1;g.p.airY=5;g.p.airborne=true;
      g.updateCaps();const collected=g.collected;g.updateCaps();const onlyOnce=g.collected===collected;
      g.reset();const reset=g.collected===0&&g.rush.active===0&&g.caps.every(c=>!c.collected);
      g.state='paused';return {capsDoNotCharge,duplicate,started,paused,broken,coherent,visible,expires,collected,onlyOnce,reset};
    });
    assert.ok(report.rules.capsDoNotCharge&&report.rules.duplicate===1&&report.rules.started&&report.rules.paused&&report.rules.broken);
    assert.ok(report.rules.coherent&&report.rules.visible.length===1,'only one verbal signal; no reward points attached to an impact');
    assert.ok(report.rules.expires&&report.rules.collected===1&&report.rules.onlyOnce&&report.rules.reset);
    report.arc=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.comics.trigger=()=>false;g.input.mode='touch';const dt=1/120;
      let maxSpeed=0,frames=0;
      while(g.p.z<290&&g.state==='playing'&&frames++<120*30){
        const target=g.p.z>210?-2.7:g.trickRoute.routePoint(g.p.z+9);
        g.input.target=THREE.MathUtils.clamp((target-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);g.step(dt);maxSpeed=Math.max(maxSpeed,g.p.speed);
      }
      const line=g.rush.lines.find(l=>l.air);g.state='paused';return {taken:line.caps.filter(c=>c.collected).length,total:line.caps.length,jumps:g.jump.jumps,maxSpeed};
    });
    assert.ok(report.arc.jumps>0&&report.arc.taken>=3,'a real ramp jump intersects the airborne pickup arc');
    report.camera=await page.evaluate(()=>{
      const g=game;g.reset();g.state='playing';g.input.mode='touch';g.comics.trigger=()=>false;
      let frames=0,spun=0;const bounds={left:1,right:0,top:1,bottom:0},outliers=[];
      for(let i=0;i<120*50&&g.state==='playing';i++){
        const target=g.trickRoute.routePoint(g.p.z+9);g.input.target=THREE.MathUtils.clamp((target-g.p.x)*.75-g.p.sideVelocity*.12,-1,1);
        if(g.jump.canSpin&&g.jump.jumps>spun){g.jump.press();spun=g.jump.jumps;}
        g.step(1/120);
        if(i%4||g.p.fallen)continue;
        g.updateCamera(1/30);g.heroAnimator.update(1/30);g.updateSurfer(g.player,g.p.x,g.p.z,g.p.y,g.p.lean,g.p.airY,g.p.crouch,Math.floor(g.time*12));
        const frame={left:1,right:0,top:1,bottom:0};
        for(const mesh of [g.player.card,g.player.board]){
          mesh.updateWorldMatrix(true,false);const p=mesh.geometry.attributes.position;
          for(let j=0;j<p.count;j++){
            const v=new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(mesh.matrixWorld).project(g.camera),x=(v.x+1)/2,y=(1-v.y)/2;
            frame.left=Math.min(frame.left,x);frame.right=Math.max(frame.right,x);frame.top=Math.min(frame.top,y);frame.bottom=Math.max(frame.bottom,y);
          }
        }
        frames++;bounds.left=Math.min(bounds.left,frame.left);bounds.right=Math.max(bounds.right,frame.right);bounds.top=Math.min(bounds.top,frame.top);bounds.bottom=Math.max(bounds.bottom,frame.bottom);
        if(frame.left<-.12||frame.right>1.12||frame.top<.04||frame.bottom>.98)outliers.push({z:g.p.z,air:g.p.airborne,...frame});
      }
      g.state='paused';return {frames,bounds,outliers};
    });
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
    assert.ok(report.camera.frames>500&&report.camera.outliers.length===0,'moving camera keeps the rider and board in frame through the route and flips');
    for(const [name,width,height] of [['phone',393,852],['small',360,640],['landscape',844,390],['desktop',1240,900]]){
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      for(const [pose,z] of [['rocks',214],['air',250],['pier',695],['rush',324]]){
        const frame=await page.evaluate((pose,z)=>{
          const g=game;g.reset();g.journey.hideAll();for(const id of ['start-screen','pause-screen','result-screen'])document.getElementById(id).classList.add('hidden');
          g.state='playing';g.container.classList.add('playing');g.onboarding.completed=new Set(['steer','wave','jump','landing','balance']);
          g.p.z=z;g.time=z/33;g.wave.time=g.time;g.p.x=pose==='air'?-2.7:0;g.p.y=g.wave.height(g.p.x,z);g.p.speed=36;
          if(pose==='air'){g.p.airborne=true;g.p.airY=4;g.p.y+=4;g.p.takeoffHeight=g.p.y-4;g.jump.lastHeight=4;g.jump.airTime=.48;}
          if(pose==='rush'){g.rush.active=3;g.rush.step(.01);g.rush.splash(.45);g.p.lean=.4;g.emit(30,1.4,true);g.updateParticles(.12);}
          const event=g.race.scenes.find(e=>e.id===(pose==='pier'?'blonde':pose==='rocks'?'grandma':'dj'));g.race.begin(event);
          const rival=g.rivals[event.slot];rival.x=-2.8;rival.z=z+7;rival.encounter.spokenUntil=0;
          for(const line of g.rush.lines.filter(l=>l.air&&l.ramp.z-z<85))g.rush.lockArc(line);
          g.state='paused';g.updateCamera(1,true);g.wave.update(z,g.time,true);g.updateVisuals(0);g.updateHUD();g.renderer.render(g.scene,g.camera);
          const projected=[];
          for(const mesh of [g.player.card,g.player.board]){
            mesh.updateWorldMatrix(true,false);const pos=mesh.geometry.attributes.position;
            for(let i=0;i<pos.count;i++)projected.push(new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).project(g.camera));
          }
          const top=Math.min(...projected.map(v=>(1-v.y)/2)),bottom=Math.max(...projected.map(v=>(1-v.y)/2));
          const meter=document.getElementById('rush-meter').getBoundingClientRect();
          return {top,bottom,heroFraction:bottom-top,finite:projected.every(v=>Number.isFinite(v.x+v.y+v.z)),meter:{left:meter.left,right:meter.right},overflow:document.documentElement.scrollWidth>innerWidth};
        },pose,z);
        assert.ok(frame.finite&&!frame.overflow);assert.ok(frame.top>.15&&frame.bottom<.94,'hero and board fit between HUD and controls');
        if(width<height&&pose!=='air')assert.ok(frame.heroFraction>.25&&frame.heroFraction<.43,'close portrait framing');
        await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.hud')).opacity)>.98);
        await (await page.$('#app-container')).screenshot({path:path.join(dir,name+'-'+pose+'.png')});report.frames.push({name,pose,...frame});
      }
    }
    assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
