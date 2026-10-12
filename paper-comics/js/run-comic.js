/* Highlights of the run become a shareable 4:5 comic page; a link challenges a friend to beat the score. */
class RunComic {
  constructor(game){
    this.game=game;this.screen=document.getElementById('share-screen');this.image=document.getElementById('share-image');this.status=document.getElementById('share-status');
    this.fallbacks=['tony','cup','crab'].map(id=>{const image=new Image();image.src='assets/comics/comic-'+id+'-v4.png';return image;});
    document.getElementById('comic-button').addEventListener('click',()=>this.open());
    document.getElementById('challenge-button').addEventListener('click',()=>this.challenge());
    document.getElementById('share-button').addEventListener('click',()=>this.share());
    document.getElementById('share-download').addEventListener('click',()=>this.download());
    document.getElementById('share-close').addEventListener('click',()=>this.close());
    this.reset();
  }
  reset(){
    this.shots=[];this.pending=null;this.card=null;this.blob=null;
    if(this.url)URL.revokeObjectURL(this.url);this.url=null;
  }
  capture(kind,word,caption,priority,force=false){
    const g=this.game;if(g.state!=='playing'&&!force)return null;
    if(this.pending)return this.pending.priority>=priority?this.pending:Object.assign(this.pending,{kind,word,caption,priority});
    const recent=this.shots.find(s=>s.kind===kind&&g.elapsed-s.time<3);
    if(recent&&recent.priority>=priority)return recent;
    this.pending={kind,word,caption,priority,time:g.elapsed,canvas:null};return this.pending;
  }
  // Called right after the WebGL render, while the drawing buffer is still valid.
  flush(){
    if(!this.pending)return;
    const shot=this.pending,source=this.game.renderer.domElement;this.pending=null;
    if(!source.width||!source.height)return;
    const width=Math.min(640,source.width),height=Math.round(source.height*width/source.width);
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');this.paintSky(ctx,width,height);ctx.drawImage(source,0,0,width,height);
    const p=this.game.p,focus=new THREE.Vector3(-p.x,p.y+1.3,p.z).project(this.game.camera);
    shot.canvas=canvas;shot.focusX=THREE.MathUtils.clamp((focus.x+1)/2,0,1);shot.focusY=THREE.MathUtils.clamp((1-focus.y)/2,0,1);this.shots.push(shot);this.card=null;
    if(this.shots.length>8){this.shots.sort((a,b)=>b.priority-a.priority);this.shots.length=8;}
  }
  paintSky(ctx,w,h){
    const sky=ctx.createLinearGradient(0,0,0,h);
    [[0,'#3b95b0'],[.25,'#90b9b8'],[.53,'#f1d7a8'],[.63,'#f8dfb9']].forEach(([t,c])=>sky.addColorStop(t,c));
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    const disc=(left,top,size,color,alpha)=>{ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc((left+size/2)*w,top*h+size*w/2,size*w/2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;};
    disc(.22,.19,.72,'#ec8463',.84);disc(.34,.25,.47,'#f6c54c',1);
  }
  pick(){
    const chosen=[],kinds=new Set();
    for(const shot of [...this.shots].sort((a,b)=>b.priority-a.priority)){
      if(!shot.canvas||kinds.has(shot.kind))continue;kinds.add(shot.kind);chosen.push(shot);if(chosen.length===3)break;
    }
    // The strongest moment leads; the other two follow in ride order.
    const [lead,...rest]=chosen;return lead?[lead,...rest.sort((a,b)=>a.time-b.time)]:[];
  }
  async compose(){
    if(this.card)return this.card;
    await Promise.all(['400 64px "Russo One"','700 40px Caveat','700 30px Rubik'].map(f=>document.fonts?.load(f).catch(()=>{})));
    const g=this.game,meta=g.meta,summary=meta.summary||{},W=1080,H=1350,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    const c=canvas.getContext('2d'),ink='#17282c',cream='#f4e9cd',yellow='#ffc43d',coral='#eb643c';
    c.fillStyle=cream;c.fillRect(0,0,W,H);
    for(let i=0;i<5200;i++){c.fillStyle=i%2?'#00000010':'#ffffff22';c.fillRect(Math.random()*W,Math.random()*H,2,2);}
    c.save();c.translate(60,58);c.rotate(-.025);c.fillStyle=yellow;c.fillRect(-14,-4,520,104);c.fillStyle=ink;c.font='400 86px "Russo One"';c.textBaseline='top';c.fillText('НИ КАПЛИ!',0,4);c.restore();
    c.fillStyle=ink;c.font='700 40px Caveat';c.textAlign='right';c.fillText('Волна дня · '+meta.dayLabel,W-60,62);c.fillText('бухта Garret',W-60,104);c.textAlign='left';
    const shots=this.pick(),slots=[[40,178,1000,560,-.012],[40,770,490,400,.018],[550,770,490,400,-.02]];
    slots.forEach(([x,y,w,h,tilt],i)=>{
      const shot=shots[i];
      c.save();c.translate(x+w/2,y+h/2);c.rotate(tilt);c.translate(-w/2,-h/2);
      c.fillStyle=ink;c.fillRect(-9,-9,w+18,h+18);c.fillStyle='#fff6df';c.fillRect(-3,-3,w+6,h+6);
      c.save();c.beginPath();c.rect(0,0,w,h);c.clip();
      if(shot)this.drawCover(c,shot.canvas,w,h,shot.focusX??.5,shot.focusY??.55,i===0?1:1.4);
      else{const art=this.fallbacks[i-1]||this.fallbacks[0];c.fillStyle='#2d8fad';c.fillRect(0,0,w,h);if(art.complete&&art.naturalWidth)this.drawCover(c,art,w,h,.5,.42,1);}
      c.restore();
      if(shot){
        this.burst(c,i===0?w-170:w-120,i===0?96:78,i===0?150:110,shot.word,i===0?72:50,i%2?coral:yellow);
        if(shot.caption){c.font='700 '+(i===0?40:30)+'px Caveat';const tw=c.measureText(shot.caption).width;c.fillStyle=cream;c.fillRect(14,h-(i===0?70:54),tw+32,i===0?56:44);c.strokeStyle=ink;c.lineWidth=3;c.strokeRect(14,h-(i===0?70:54),tw+32,i===0?56:44);c.fillStyle=ink;c.textBaseline='middle';c.fillText(shot.caption,30,h-(i===0?42:32));}
      }
      c.restore();
    });
    c.textBaseline='alphabetic';
    c.fillStyle=ink;c.font='400 30px "Russo One"';c.fillText('СЧЁТ',60,1236);
    c.font='400 92px "Russo One"';c.fillText(Math.round(g.score).toLocaleString('ru-RU'),56,1320);
    const duel=g.duel.result;
    c.fillStyle=duel?.outcome==='victory'?'#125577':coral;c.font='400 38px "Russo One"';c.textAlign='right';c.fillText((duel?.outcome==='tie'?'ФОТОФИНИШ':(duel?.place??1)+'-е МЕСТО')+' · ПИВО '+(duel?.max??Math.round(g.mug.level*100))+'%',W-60,1262);
    c.fillStyle=ink;c.font='700 34px Caveat';c.fillText('Бонус за пиво +'+(duel?.beerBonus??g.deliveryBonus).toLocaleString('ru-RU'),W-60,1302);
    c.font='700 30px Caveat';c.fillText(summary.record?'НОВЫЙ РЕКОРД!':'Побей меня — ссылка в описании',W-60,1336);c.textAlign='left';
    this.card=canvas;
    this.blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(this.url)URL.revokeObjectURL(this.url);this.url=this.blob?URL.createObjectURL(this.blob):canvas.toDataURL('image/png');
    return canvas;
  }
  // Cover-fit around a focus point (the rider's projected position), with a slight zoom towards it.
  drawCover(c,image,w,h,focusX,focusY,zoom){
    const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,scale=Math.max(w/iw,h/ih)*zoom;
    const dw=iw*scale,dh=ih*scale;
    const dx=THREE.MathUtils.clamp(w/2-dw*focusX,w-dw,0),dy=THREE.MathUtils.clamp(h*.55-dh*focusY,h-dh,0);
    c.drawImage(image,dx,dy,dw,dh);
  }
  burst(c,x,y,r,word,size,color){
    c.save();c.translate(x,y);c.rotate(-.12);c.beginPath();
    for(let i=0;i<22;i++){const a=i/22*Math.PI*2,rad=i%2?r*.68:r;c.lineTo(Math.cos(a)*rad*1.25,Math.sin(a)*rad*.8);}
    c.closePath();c.fillStyle=color;c.fill();c.lineWidth=6;c.strokeStyle='#17282c';c.stroke();
    c.fillStyle='#17282c';c.font='400 '+size+'px "Russo One"';c.textAlign='center';c.textBaseline='middle';
    let s=size;while(c.measureText(word).width>r*2.1&&s>24){s-=4;c.font='400 '+s+'px "Russo One"';}
    c.fillText(word,0,4);c.restore();
  }
  async open(){
    this.screen.classList.remove('hidden');this.status.textContent='Рисуем комикс…';this.image.removeAttribute('src');
    try{await this.compose();this.image.src=this.url;this.status.textContent='';}
    catch(error){console.error(error);this.status.textContent='Не получилось собрать комикс.';}
    document.getElementById('share-button').focus({preventScroll:true});
  }
  close(){this.screen.classList.add('hidden');document.getElementById('replay-button').focus({preventScroll:true});}
  get fileName(){return 'ni-kapli-'+Math.round(this.game.score)+'.png';}
  challengeLink(){
    const url=new URL(location.href);url.search='';url.hash='';
    url.searchParams.set('vs',Math.round(this.game.score));url.searchParams.set('seed',this.game.meta.seed);return url.toString();
  }
  shareText(){const r=this.game.duel.result;return (r?.outcome==='tie'?'Финишировал одновременно с Борисом':r?.place===1?'Обогнал Бориса':'Занял 2-е место')+', сохранил '+(r?.max??Math.round(this.game.mug.level*100))+'% пива и набрал '+Math.round(this.game.score).toLocaleString('ru-RU')+' в «Ни капли!». Побьёшь?';}
  async share(){
    await this.compose();
    const file=this.blob&&typeof File==='function'?new File([this.blob],this.fileName,{type:'image/png'}):null;
    if(file&&navigator.canShare?.({files:[file]})){
      try{await navigator.share({files:[file],title:'Ни капли!',text:this.shareText()+' '+this.challengeLink()});this.status.textContent='Отправлено!';return;}
      catch(error){if(error.name==='AbortError')return;}
    }
    this.download();
  }
  async download(){
    await this.compose();
    const a=document.createElement('a');a.href=this.url;a.download=this.fileName;document.body.append(a);a.click();a.remove();
    this.status.textContent='Картинка сохранена.';
  }
  async challenge(){
    const link=this.challengeLink(),text=this.shareText()+' '+link,button=document.getElementById('challenge-button');
    if(navigator.share&&matchMedia('(pointer:coarse)').matches){try{await navigator.share({title:'Ни капли!',text:this.shareText(),url:link});return;}catch(error){if(error.name==='AbortError')return;}}
    try{await navigator.clipboard.writeText(text);button.textContent='ССЫЛКА СКОПИРОВАНА ✓';}
    catch(_){window.prompt('Скопируй ссылку для друга',link);}
    setTimeout(()=>{button.textContent='ВЫЗОВ ДРУГУ';},2200);
  }
}
window.RunComic=RunComic;
