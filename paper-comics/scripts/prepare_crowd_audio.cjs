const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const gameRoot=path.resolve(__dirname,'..');
const sourceDir=path.join(gameRoot,'review/comics/crowd-sourcing');
const sounds=[
  {source:'girls-audience-applause-510.wav',name:'crowd_applause_female.wav',start:.35,end:3.15},
  {source:'crowd-975.wav',name:'crowd_flight_happy.wav',start:.35,end:2.55,trebleDb:-4},
  {source:'crowd-518.wav',name:'crowd_flight_group.wav',start:.48,end:2.88,trebleDb:-4},
  {source:'crowd-3038.wav',name:'crowd_flight_bonus.wav',start:.10,end:2.35,trebleDb:-4},
  {source:'girls-crowd-cheer-515.wav',name:'crowd_cheer_female.wav',start:1.75,end:4.75}
];
const flightClips=[];

for(const sound of sounds){
  const input=fs.readFileSync(path.join(sourceDir,sound.source));
  assert.equal(input.toString('ascii',0,4),'RIFF');assert.equal(input.toString('ascii',8,12),'WAVE');
  let format,pcm;
  for(let offset=12;offset+8<=input.length;){
    const id=input.toString('ascii',offset,offset+4),size=input.readUInt32LE(offset+4);
    if(id==='fmt ')format={kind:input.readUInt16LE(offset+8)===65534?input.readUInt32LE(offset+32):input.readUInt16LE(offset+8),channels:input.readUInt16LE(offset+10),rate:input.readUInt32LE(offset+12),bits:input.readUInt16LE(offset+22)};
    if(id==='data')pcm=input.subarray(offset+8,offset+8+size);
    offset+=8+size+(size%2);
  }
  assert.ok(format&&pcm);assert.equal(format.kind,1);assert.ok([16,24].includes(format.bits));
  const {channels,rate}=format,start=Math.round(sound.start*rate),frames=Math.round((sound.end-sound.start)*rate);
  const bytesPerSample=format.bits/8;
  assert.ok((start+frames)*channels*bytesPerSample<=pcm.length);
  const values=new Float64Array(frames*channels),means=new Float64Array(channels);
  for(let i=0;i<values.length;i++){values[i]=pcm.readIntLE((start*channels+i)*bytesPerSample,bytesPerSample)/2**(format.bits-1);means[i%channels]+=values[i]/frames;}
  for(let i=0;i<values.length;i++)values[i]-=means[i%channels];
  if(sound.trebleDb){
    // A gentle high shelf softens shrillness while preserving the voices' pitch.
    const A=10**(sound.trebleDb/40),w=2*Math.PI*2800/rate,c=Math.cos(w),beta=Math.sin(w)*Math.sqrt(2*A);
    const b0=A*((A+1)+(A-1)*c+beta),b1=-2*A*((A-1)+(A+1)*c),b2=A*((A+1)+(A-1)*c-beta);
    const a0=(A+1)-(A-1)*c+beta,a1=2*((A-1)-(A+1)*c),a2=(A+1)-(A-1)*c-beta;
    for(let channel=0;channel<channels;channel++){
      let x1=0,x2=0,y1=0,y2=0;
      for(let frame=0;frame<frames;frame++){
        const i=frame*channels+channel,x=values[i],y=(b0*x+b1*x1+b2*x2-a1*y1-a2*y2)/a0;
        values[i]=y;x2=x1;x1=x;y2=y1;y1=y;
      }
    }
  }
  let peak=0;
  for(let frame=0;frame<frames;frame++)for(let c=0;c<channels;c++){
    const i=frame*channels+c,fade=Math.min(1,frame/(rate*.015),(frames-1-frame)/(rate*.22));
    values[i]*=fade;peak=Math.max(peak,Math.abs(values[i]));
  }
  assert.ok(peak>.01);
  const rms=Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);
  const output=Buffer.alloc(44+values.length*2),scale=sound.trebleDb?Math.min(.86/peak,.20/rms):.86/peak;
  output.write('RIFF');output.writeUInt32LE(output.length-8,4);output.write('WAVEfmt ',8);
  output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(channels,22);
  output.writeUInt32LE(rate,24);output.writeUInt32LE(rate*channels*2,28);output.writeUInt16LE(channels*2,32);output.writeUInt16LE(16,34);
  output.write('data',36);output.writeUInt32LE(values.length*2,40);
  for(let i=0;i<values.length;i++)output.writeInt16LE(Math.round(values[i]*scale*32767),44+i*2);
  for(const dir of [path.join(gameRoot,'assets/audio'),path.resolve(gameRoot,'../assets/audio')])fs.writeFileSync(path.join(dir,sound.name),output);
  if(sound.trebleDb)flightClips.push(output);
  console.log(JSON.stringify({file:sound.name,seconds:frames/rate,channels,rate,peak:peak*scale,rms:rms*scale,bytes:output.length}));
}

// A single audition file presents the three flight recordings with short gaps.
const segments=[];
for(const [i,clip] of flightClips.entries()){
  if(i)segments.push(Buffer.alloc(Math.round(.4*44100)*4));
  const pcm=Buffer.from(clip.subarray(44));
  for(let sample=0;sample<pcm.length;sample+=2)pcm.writeInt16LE(Math.round(pcm.readInt16LE(sample)*.6),sample);
  segments.push(pcm);
}
const audition=Buffer.concat([flightClips[0].subarray(0,44),...segments]);
audition.writeUInt32LE(audition.length-8,4);audition.writeUInt32LE(audition.length-44,40);
fs.writeFileSync(path.join(sourceDir,'flight-reactions-preview.wav'),audition);
