const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

// Check event routing and audio scheduling without opening a browser or device.
class Param {
  constructor(value = 0) {this.value=value;this.events=[];}
  schedule(kind,value,time) {
    assert.ok(Number.isFinite(value)&&Number.isFinite(time)&&time>=0);
    if(kind==='exponential')assert.ok(value>0);
    this.value=value;this.events.push({kind,value,time});
  }
  setValueAtTime(v,t){this.schedule('value',v,t);}
  setTargetAtTime(v,t,c){assert.ok(c>0);this.schedule('target',v,t);}
  linearRampToValueAtTime(v,t){this.schedule('linear',v,t);}
  exponentialRampToValueAtTime(v,t){this.schedule('exponential',v,t);}
  cancelScheduledValues(t){this.events=this.events.filter(e=>e.time<t);}
}
class AudioNode {
  constructor(ctx){this.ctx=ctx;for(const key of ['gain','frequency','Q','pan','detune'])this[key]=new Param();this.playbackRate=new Param(1);}
  connect(node){assert.ok(node);(this.outputs??=[]).push(node);return node;}
  disconnect(){this.disconnected=true;}
  start(t=0){this.startedAt=t;this.ctx.sources.add(this);}
  stop(t=this.ctx.currentTime){this.stoppedAt=t;}
}
class AudioContext {
  constructor(){this.currentTime=0;this.sampleRate=48000;this.state='running';this.destination={};this.sources=new Set();}
  createGain(){return new AudioNode(this);}
  createBiquadFilter(){return new AudioNode(this);}
  createBufferSource(){return new AudioNode(this);}
  createOscillator(){return new AudioNode(this);}
  createStereoPanner(){return new AudioNode(this);}
  createMediaElementSource(){return new AudioNode(this);}
  createBuffer(channels,length,rate){const samples=new Float32Array(length);return {duration:length/rate,getChannelData:()=>samples};}
  resume(){return Promise.resolve();}
  advance(dt){this.currentTime+=dt;for(const s of this.sources)if(s.stoppedAt<=this.currentTime){this.sources.delete(s);s.onended?.();}}
  decodeAudioData(data){
    const b=Buffer.from(data);let format,length;assert.equal(b.toString('ascii',0,4),'RIFF');
    for(let p=12;p+8<=b.length;){
      const name=b.toString('ascii',p,p+4),size=b.readUInt32LE(p+4);
      if(name==='fmt ')format={channels:b.readUInt16LE(p+10),rate:b.readUInt32LE(p+12),bits:b.readUInt16LE(p+22)};
      if(name==='data')length=size;p+=8+size+(size%2);
    }
    assert.ok(format&&length>0);return Promise.resolve({duration:length/(format.rate*format.channels*format.bits/8)});
  }
}
class Music {
  constructor(url){this.url=url;this.paused=true;}
  play(){this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}
}
const element=()=>({classList:{add(){},remove(){},toggle(){},contains:()=>true},style:{setProperty(){}},addEventListener(){},setAttribute(){},querySelector:()=>element()});
const elements=new Map(),noop=()=>{};
const context=vm.createContext({
  console,Audio:Music,localStorage:{getItem:()=>null,setItem:noop},
  document:{readyState:'loading',getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}},
  window:{AudioContext,addEventListener:noop},THREE:{MathUtils:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v))}},
  fetch:async url=>{const b=fs.readFileSync(path.resolve(__dirname,'..',url));return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}
});
for(const file of ['audio.js','surf-jump.js','paper-prototype.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../js',file),'utf8'),context,{filename:file});
const SurfAudio=context.window.SurfAudio,SurfJump=context.window.SurfJump,Game=vm.runInContext('PaperSurfGame',context);

async function run(){
  const a=new SurfAudio();a.isMuted=true;a.unlock();await a.ready;
  assert.ok(Object.keys(a.manifest).every(name=>a.buffers[name]?.duration>0),'all recorded assets are valid WAV files');
  a.startBGM();assert.ok(a.bgmPlaying&&!a.bgmAudio,'muted start needs no music element');
  a.toggleMute();assert.ok(a.bgmAudio&&!a.bgmAudio.muted&&!a.bgmAudio.paused,'unmute starts music after a muted start');
  const calls=[],report={assets:Object.keys(a.manifest).length,flights:[]};
  for(const method of ['playJump','playLanding','playSpin','playCrowdAwe','playCrowdApplause','playTrickTriumph','playFanfareWin']){
    const original=a[method];a[method]=function(...args){calls.push({method,args});return original.apply(this,args);};
  }
  function prepare(){
    a.resetRide();calls.length=0;
    const g={
      state:'playing',assist:true,time:0,score:0,combo:1,audio:a,
      p:{x:0,z:10,y:0,speed:30,airY:0,jumpVelocity:0,pitch:0,lean:0,smoothLean:0,heading:0,sideVelocity:0},
      input:{reset:noop},world:{wakeSourceAt:()=>({quality:0}),finish:noop},
      wave:{smooth:t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}},
      heroAnimator:{beginTurn:noop},emit:noop,landingSplash:noop,
      juice:{punch:noop,buzz:noop,pop:noop,hitstop:noop,shake:noop,reset:noop},runComic:{capture:()=>({})},
      handBeer:{impact:noop},mug:{level:1},balance:{immunity:0,disturb:noop},spill:noop,
      setpiece:{onLanding:noop},courseShow:{onLanding:noop,beginDelivery:noop},duel:{settle:()=>({outcome:'victory',beerBonus:5000})},trickRoute:{land:noop},
      waveRide:{transfers:0,reward:noop},chain:{multiplier:3,add:()=>100,bank:noop},
      chase:{onTrick:noop,end:noop},race:{reward:noop},rush:{reward:noop},
      companion:{react:noop,showResult:noop},comics:{reset:noop},meta:{finish:noop},
      tricksSeen:new Set(),moment:()=>false,container:element(),renderResultMeta:noop
    };
    g.awardTrick=Game.prototype.awardTrick.bind(g);g.jump=new SurfJump(g);return g;
  }
  let g=prepare();
  for(const name of ['ПОЙМАЛ ВОЛНУ','НА ГРЕБНЕ','КАРВИНГ','ПЕРЕХОД','НА ХВОСТЕ','ВЫРУЛИЛ','ОТОРВАЛСЯ ОТ ПЕНЫ'])g.awardTrick(name,250);
  assert.equal(calls.length,0,'routine points cannot trigger spectators or jingles');
  const surface={height:0,zone:'flat',wave:null,dz:0,dx:0,waterVelocity:0,energy:0,crest:0,face:0};
  for(const kind of ['jump','spin','ramp','flip','failed','failed-ramp']){
    g=prepare();
    const ramp=['ramp','flip','failed-ramp'].includes(kind);
    if(ramp)g.jump.launchRamp({id:1,type:'straight'},surface);
    else{g.jump.press();g.jump.step(1/120,surface);}
    assert.equal(a.rampFlight,ramp,kind+': only the ramp ducks the entire world');
    if(ramp)assert.equal(a.sceneGain.gain.value,.48);
    let spun=false;
    for(let i=0;i<480&&g.p.airborne;i++){
      g.time+=1/120;a.ctx.advance(1/120);
      if(['spin','flip','failed','failed-ramp'].includes(kind)&&!spun&&g.jump.canSpin){g.jump.press();spun=true;if(kind.startsWith('failed'))g.jump.spinDuration=5;}
      if(ramp)assert.equal(a.sceneGain.gain.value,.48,'the entire flight remains quiet');
      g.jump.step(1/120,surface);
    }
    assert.ok(!g.p.airborne,kind+' touches down');const events=calls.map(c=>c.method);
    assert.equal(events.filter(m=>m==='playJump').length,1);assert.equal(events.filter(m=>m==='playLanding').length,1);
    assert.equal(events.filter(m=>m==='playCrowdAwe').length,kind==='jump'?0:1,'one gasp per flight');
    assert.equal(events.includes('playCrowdApplause'),['spin','ramp','flip'].includes(kind));
    assert.equal(calls.find(c=>c.method==='playLanding').args[0],!kind.startsWith('failed'));
    assert.equal(a.rampFlight,false,'touchdown ends the quiet flight mix');
    if(kind==='flip')assert.equal(calls.find(c=>c.method==='playCrowdApplause').args[0],true);
    report.flights.push({kind,events});
  }
  g=prepare();Game.prototype.finish.call(g);assert.deepEqual(calls.map(c=>c.method),['playFanfareWin'],'the finish has no crowd');
  a.resetRide();a.startBGM();a.updateRide({speed:30});const calm=a.boardGain.gain.value,sea=a.waveGain.gain.value;
  for(const bus of [a.sfxGain,a.ambientGain,a.bgmGain])assert.ok(bus.outputs.includes(a.sceneGain),'all world audio uses the flight bus');
  assert.ok(a.crowdGain.outputs.includes(a.masterGain)&&!a.crowdGain.outputs.includes(a.sceneGain),'the spectators keep their full volume');
  a.updateRide({speed:30,lean:0.9,energy:1,foamPressure:0.8});
  assert.ok(a.boardGain.gain.value>calm*1.6&&a.waveGain.gain.value>sea,'water responds to turning and wave energy');
  a.updateRide({speed:30,airborne:true});assert.equal(a.boardGain.gain.value,0);assert.ok(a.windGain.gain.value>0.1);
  a.playJump(0.6);const before=a.oneShots.size;a.playSpin();assert.ok(a.oneShots.size>before,'spin whoosh survives the takeoff');
  assert.ok(a.bgmGain.gain.events.some(e=>e.value===0.20)&&a.bgmGain.gain.events.some(e=>e.value===0.35&&e.time>a.ctx.currentTime),'music ducks and schedules recovery');
  a.resetRide();const awe=a.playCrowdAwe();assert.ok(awe);assert.equal(a.playCrowdAwe(),null);
  const applause=a.playCrowdApplause();assert.ok(applause);assert.equal(a.playCrowdApplause(),null);
  assert.ok(Math.abs(applause.endsAt-a.ctx.currentTime-1.6)<1e-9);
  a.ctx.advance(2.2);assert.equal(a.oneShots.size,0,'ended sources are disconnected and removed');
  a.resetRide();assert.ok(a.playCrowdAwe(),'replay clears reaction cooldowns');
  a.resetRide();a.flightCrowdBag=[];
  const variations=[];
  for(let i=0;i<60;i++){
    if(i%5===0)a.resetRide();
    const previous=a.lastFlightCrowd,voice=a.playCrowdAwe(true);
    assert.ok(voice);assert.notEqual(a.lastFlightCrowd,previous,'jump reactions never repeat, including across replay and shuffled-bag boundaries');
    variations.push(a.lastFlightCrowd);a.ctx.advance(2.5);
  }
  for(let i=0;i<variations.length;i+=3)assert.equal(new Set(variations.slice(i,i+3)).size,3,'each shuffled bag plays all three recordings');
  a.playCrowdAwe(true);const pending=a.flightCrowdBag.slice();
  assert.equal(a.playCrowdAwe(),null,'all variants share a cooldown');assert.deepEqual(a.flightCrowdBag,pending,'blocked playback does not consume a variant');
  a.toggleMute();assert.equal(a.playCrowdAwe(true),null);assert.deepEqual(a.flightCrowdBag,pending,'mute preserves the pending variant');a.toggleMute();
  a.resetRide();const flight=a.playCrowdAwe(true),sharkHit=a.playCrowdSharkHit();
  assert.ok(flight&&sharkHit&&flight.source.buffer!==sharkHit.source.buffer,'flight excitement and shark disappointment use different recordings');
  assert.equal(sharkHit.source.buffer,a.buffers.crowd_shark_hit);
  assert.equal(a.crowdVoice,sharkHit,'a shark hit replaces the flight celebration');
  assert.equal(a.playCrowdSharkHit(),null,'an overlapping contact cannot stack disappointed voices');
  a.ctx.advance(1.7);assert.equal(a.oneShots.size,0,'both crowd voices disconnect after the reaction');
  a.resetRide();a.playAccelerator(12);const boost=a.acceleratorVoice;
  assert.ok(boost?.source.loop&&boost.filter.type==='bandpass','acceleration has a sustained airy whoosh');
  const boostStart=boost.filter.frequency.value,entryVoices=a.oneShots.size;
  assert.equal(entryVoices,2,'contact has its own short accent');
  for(let i=0;i<120;i++)a.updateRide({speed:46,padTime:1.2,padStrength:12});
  assert.equal(a.acceleratorVoice,boost);assert.equal(a.oneShots.size,entryVoices,'frame updates never stack acceleration sources');
  assert.ok(boost.filter.frequency.value>boostStart&&boost.source.playbackRate.value>1.4,'the whoosh rises with speed');
  const fullBoost=boost.gain.gain.value;a.updateRide({speed:46,padTime:.1,padStrength:12});
  assert.ok(boost.gain.gain.value<fullBoost*.4,'the tail fades with remaining acceleration');
  a.updateRide({speed:30,padTime:0});assert.equal(a.acceleratorVoice,null);a.ctx.advance(.25);
  assert.equal(a.oneShots.size,0,'the whoosh releases and disconnects when acceleration ends');
  a.beginRampFlight();a.updateRide({airborne:true,rampFlight:true});a.ctx.advance(3);
  assert.equal(a.sceneGain.gain.value,.48,'quiet flight has no fixed timeout');
  a.stopBGM();assert.equal(a.sceneGain.gain.value,1);assert.equal(a.rampFlight,false,'pause clears the flight mix');
  a.startBGM();a.updateRide({airborne:true,rampFlight:true,padTime:1,padStrength:12});
  assert.ok(a.rampFlight&&a.acceleratorVoice,'resume restores a flight and boost that are still active');
  a.resetRide();assert.equal(a.sceneGain.gain.value,1);assert.equal(a.acceleratorVoice,null);
  a.resetRide();a.playImpact(.8);
  const impactVoices=[...a.oneShots];
  assert.equal(impactVoices.length,3,'an impact has a plop, a short filtered landing and a wooden attack');
  assert.ok(impactVoices.some(v=>v.filter?.frequency.value===900&&v.source.playbackRate.value===.82),'splash attack is dark and pitched down');
  assert.ok(impactVoices.every(v=>v.source.stoppedAt-a.ctx.currentTime<=.24+1e-9),'impact stays short');
  const impactCount=a.oneShots.size;a.playImpact(.8);assert.equal(a.oneShots.size,impactCount,'contact cannot stack impact voices');
  a.ctx.advance(.3);assert.equal(a.oneShots.size,0,'impact voices clean up after playback');
  a.playLanding(false,1);a.updateJetski(5);a.stopBGM();a.ctx.advance(0.1);
  assert.equal(a.oneShots.size,0);assert.equal(a.ambientGain.gain.value,0);assert.ok(!a.rideActive&&!a.jetskiSource&&a.bgmAudio.paused);
  a.startBGM();assert.equal(a.ambientGain.gain.value,0.9);a.playJump();a.toggleMute();
  assert.equal(a.oneShots.size,0);assert.equal(a.playSound('surf_jump'),null);assert.equal(a.masterGain.gain.value,0);
  a.playImpact();assert.equal(a.oneShots.size,0,'mute also blocks wooden impacts');
  console.log(JSON.stringify(report,null,2));
  console.log('PASS: audio events, WAV assets, scheduling, voice cleanup, pause and mute (without browser playback).');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
