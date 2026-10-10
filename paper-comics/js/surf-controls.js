/* One steering axis, one action. A temporary override never changes the chosen scheme. */
class PaperInput {
  constructor(container) {
    this.container=container;
    this.mobile=matchMedia('(pointer:coarse)').matches;
    let saved={};
    try {saved=JSON.parse(localStorage.getItem('garret_comics_controls')||'{}')||{};} catch (_) {}
    this.preferredMode=['gyro','touch','keys'].includes(saved.mode)?saved.mode:this.mobile?'gyro':'keys';
    this.mode=this.preferredMode==='gyro'?'touch':this.preferredMode;
    this.sensitivity=Number.isFinite(saved.sensitivity)?Math.max(.65,Math.min(1.7,saved.sensitivity)):1;
    this.jumpSide=saved.jumpSide==='left'?'left':'right';
    this.buttonSize=Number.isFinite(saved.buttonSize)?Math.max(64,Math.min(96,saved.buttonSize)):72;
    this.lean=this.pitch=this.target=this.pitchTarget=0;
    this.keys=new Set();this.pointers=new Map();this.buttonPointers=new Map();
    this.gamma=this.beta=null;this.neutral=this.neutralBeta=0;
    this.sensorTime=-Infinity;this.sensorSequence=0;this.calibrationVersion=0;this.status='';
    const isControl=target=>target.closest?.('#jump-button,.steer-controls,#steer-pad');
    container.addEventListener('contextmenu',e=>{if(e.target.closest?.('button,canvas'))e.preventDefault();});
    container.addEventListener('touchstart',e=>{if(isControl(e.target))e.preventDefault();},{passive:false});
    container.addEventListener('selectstart',e=>{if(isControl(e.target))e.preventDefault();});
    container.addEventListener('dragstart',e=>{if(isControl(e.target))e.preventDefault();});
    window.addEventListener('deviceorientation',e=>{
      if(!Number.isFinite(e.gamma)||!Number.isFinite(e.beta))return;
      const angle=screen.orientation?.angle??window.orientation??0;
      this.gamma=angle===90?-e.beta:angle===270||angle===-90?e.beta:angle===180?-e.gamma:e.gamma;
      this.beta=angle===90?e.gamma:angle===270||angle===-90?-e.gamma:e.beta;
      this.sensorTime=performance.now();this.sensorSequence++;
      if(this.orientationAngle!==undefined&&this.orientationAngle!==angle&&this.mode==='gyro')this.recenter();
      this.orientationAngle=angle;
    });
    window.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)||e.target.closest?.('input,select,textarea')||!this.active)return;
      e.preventDefault();this.keys.add(e.code);
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    container.addEventListener('pointerdown',e=>{
      if(!this.active||this.mode!=='touch'||this.pointers.size||e.button>0||e.target.closest('button,input,select,.screen,.hud'))return;
      const rect=container.getBoundingClientRect(),x=e.clientX-rect.left;
      if(this.jumpSide==='right'?x>rect.width*.58:x<rect.width*.42)return;
      e.preventDefault();this.target=0;
      this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      this.showPad(e.clientX-rect.left,e.clientY-rect.top,0);
      if(e.isTrusted)container.setPointerCapture(e.pointerId);
    });
    container.addEventListener('pointermove',e=>{
      const point=this.pointers.get(e.pointerId);if(!point)return;
      const distance=90/this.sensitivity,dx=e.clientX-point.x;
      this.target=THREE.MathUtils.clamp(dx/distance,-1,1);
      const rect=container.getBoundingClientRect();this.showPad(point.x-rect.left,point.y-rect.top,this.target);
    });
    const end=e=>{if(!this.pointers.has(e.pointerId))return;this.pointers.delete(e.pointerId);this.target=0;this.hidePad();};
    container.addEventListener('pointerup',end);container.addEventListener('pointercancel',end);container.addEventListener('lostpointercapture',end);
    window.addEventListener('blur',()=>this.reset());
    this.render();
  }
  get active() {
    return this.container.classList.contains('playing')&&document.getElementById('pause-screen').classList.contains('hidden')&&
      (!document.getElementById('controls-screen')||document.getElementById('controls-screen').classList.contains('hidden'));
  }
  save() {
    try {localStorage.setItem('garret_comics_controls',JSON.stringify({mode:this.preferredMode,sensitivity:this.sensitivity,jumpSide:this.jumpSide,buttonSize:this.buttonSize}));} catch (_) {}
  }
  render() {
    this.container.dataset.inputMode=this.mode;this.container.dataset.jumpSide=this.jumpSide;
    this.container.style.setProperty('--action-size',this.buttonSize+'px');
    const guide=document.querySelector('#touch-guide span');
    if(guide)guide.textContent=this.mode==='gyro'?'НАКЛОНЯЙ ВБОК · НАЖМИ ДЛЯ ПРЫЖКА':this.mode==='touch'?'ТЯНИ ВБОК · НАЖМИ ДЛЯ ПРЫЖКА':'← → КУРС · ПРОБЕЛ ПРЫЖОК';
  }
  async selectMode(mode) {
    if(!['gyro','touch','keys'].includes(mode))return;
    this.calibrationVersion++;this.calibrating=false;this.reset();this.preferredMode=mode;this.status='';
    if(mode==='gyro')await this.calibrate();
    else {this.mode=mode;this.save();this.render();}
  }
  async calibrate() {
    if(this.preferredMode!=='gyro')return false;
    const version=++this.calibrationVersion;
    this.calibrating=true;
    this.status='Держи телефон удобно — запоминаем нейтраль.';
    try {
      if(typeof DeviceOrientationEvent==='undefined')throw Error('unavailable');
      if(typeof DeviceOrientationEvent.requestPermission==='function'&&await DeviceOrientationEvent.requestPermission()!=='granted')throw Error('denied');
      const samples=[],start=performance.now();let sequence=-1;
      while(performance.now()-start<900&&samples.length<8) {
        if(version!==this.calibrationVersion)return false;
        if(this.sensorSequence!==sequence&&performance.now()-this.sensorTime<200) {
          samples.push([this.gamma,this.beta]);sequence=this.sensorSequence;
        }
        if(samples.length<8)await new Promise(resolve=>setTimeout(resolve,40));
      }
      if(version!==this.calibrationVersion)return false;
      if(!samples.length||performance.now()-this.sensorTime>250)throw Error('unavailable');
      this.neutral=samples.reduce((sum,v)=>sum+v[0],0)/samples.length;
      this.neutralBeta=samples.reduce((sum,v)=>sum+v[1],0)/samples.length;
      this.calibrating=false;this.mode='gyro';this.status='Наклоняй телефон вбок. Вес на доске — автоматически.';
      this.reset();this.save();this.render();return true;
    } catch (_) {
      if(version!==this.calibrationVersion)return false;
      this.calibrating=false;this.mode=this.preferredMode='touch';this.status='Наклон недоступен. Включили управление пальцем.';
      this.reset();this.save();this.render();return false;
    }
  }
  bindSteering() {
    for(const [id,code] of [['steer-left','ArrowLeft'],['steer-right','ArrowRight']]) {
      const button=document.getElementById(id);
      button.addEventListener('pointerdown',e=>{
        if(!this.active||e.button>0)return;e.preventDefault();
        this.buttonPointers.set(e.pointerId,code);button.classList.add('pressed');
        if(e.isTrusted)button.setPointerCapture(e.pointerId);
      });
      const release=e=>{
        if(this.buttonPointers.get(e.pointerId)!==code)return;
        this.buttonPointers.delete(e.pointerId);
        if(![...this.buttonPointers.values()].includes(code))button.classList.remove('pressed');
      };
      button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    }
  }
  showPad(x,y,value) {
    const pad=document.getElementById('steer-pad');if(!pad)return;
    pad.classList.add('active');pad.style.left=x+'px';pad.style.top=y+'px';pad.style.setProperty('--steer-offset',(value*24)+'px');
  }
  hidePad() {document.getElementById('steer-pad')?.classList.remove('active');}
  reset() {
    const ids=[...this.pointers.keys()];this.keys.clear();this.pointers.clear();this.buttonPointers.clear();
    this.target=this.pitchTarget=this.lean=this.pitch=0;this.hidePad();
    for(const id of ids)if(this.container.hasPointerCapture?.(id))this.container.releasePointerCapture(id);
    document.querySelectorAll('.steer-controls .pressed').forEach(b=>b.classList.remove('pressed'));
  }
  recenter() {
    if(this.gamma===null||performance.now()-this.sensorTime>500)return false;
    this.neutral=this.gamma;this.neutralBeta=this.beta;this.lean=this.pitch=0;return true;
  }
  update(dt) {
    let lean=this.mode==='touch'?this.target:0;
    if(this.mode==='gyro') {
      const delta=(this.gamma??this.neutral)-this.neutral,deadzone=1.25;
      const value=Math.max(0,Math.abs(delta)-deadzone)/(18/this.sensitivity);
      lean=Math.sign(delta)*Math.pow(Math.min(1,value),1.12);
    }
    const pressed=new Set([...this.keys,...this.buttonPointers.values()]);
    if(pressed.size)lean=Number(pressed.has('ArrowRight')||pressed.has('KeyD'))-Number(pressed.has('ArrowLeft')||pressed.has('KeyA'));
    this.lean+=(lean-this.lean)*(1-Math.exp(-(lean===0?22:18)*dt));
    this.pitch=0;
  }
}

class SurfControlSettings {
  constructor(game) {
    this.game=game;this.input=game.input;
    this.screen=document.createElement('section');this.screen.id='controls-screen';this.screen.className='screen hidden';
    this.screen.setAttribute('role','dialog');this.screen.setAttribute('aria-modal','true');this.screen.setAttribute('aria-labelledby','controls-title');
    this.screen.innerHTML=`<div class="controls-card paper"><span class="eyebrow">УПРАВЛЕНИЕ</span><h2 id="controls-title">ТВОЯ ВОЛНА.</h2>
      <fieldset><legend>Как вести доску</legend><div class="control-options"><button type="button" data-input="gyro">Наклон телефона</button><button type="button" data-input="touch">Пальцем</button><button type="button" data-input="keys">Клавиатура</button></div></fieldset>
      <p id="controls-description"></p><p id="controls-status" role="status" aria-live="polite"></p>
      <label class="control-slider" for="control-sensitivity">Чувствительность <output id="sensitivity-value" for="control-sensitivity"></output><input id="control-sensitivity" type="range" min="0.65" max="1.7" step="0.05"><span><small>Плавнее</small><small>Резче</small></span></label>
      <fieldset><legend>Кнопка прыжка</legend><div class="control-options"><button type="button" data-jump-side="right">Справа</button><button type="button" data-jump-side="left">Слева</button></div></fieldset>
      <label class="control-slider" for="control-size">Размер кнопки <output id="size-value" for="control-size"></output><input id="control-size" type="range" min="64" max="96" step="4"><span><small>Компактнее</small><small>Крупнее</small></span></label>
      <button id="control-center" type="button" class="text-button">◎ Запомнить нейтраль</button><p class="controls-action-help">Нажми — прыжок. Ещё раз в воздухе — трюк.<br>Верни курс в центр для чистой посадки.</p><button id="controls-close" type="button" class="yellow-button">ГОТОВО</button></div>`;
    game.container.append(this.screen);
    const pad=document.createElement('div');pad.id='steer-pad';pad.setAttribute('aria-hidden','true');pad.innerHTML='<i></i>';game.container.append(pad);
    for(const [parent,label] of [['start-screen','Управление'],['selection-footer','Управление'],['pause-card','Управление']]) {
      const button=document.createElement('button');button.type='button';button.className='text-button controls-open';button.textContent=label;
      button.addEventListener('click',e=>{if(performance.now()-(window.__lastTouchTime||0)<350)return;this.open(button);});
      (document.getElementById(parent)||document.querySelector('.'+parent)).append(button);
    }
    this.screen.querySelectorAll('[data-input]').forEach(b=>b.addEventListener('click',async e=>{
      if(performance.now()-(window.__lastTouchTime||0)<350)return;
      const task=this.input.selectMode(b.dataset.input);this.render();await task;this.render();
    }));
    this.screen.querySelectorAll('[data-jump-side]').forEach(b=>b.addEventListener('click',e=>{
      if(performance.now()-(window.__lastTouchTime||0)<350)return;
      this.input.reset();game.jump.cancel();this.input.jumpSide=b.dataset.jumpSide;this.input.save();this.render();
    }));
    document.getElementById('control-sensitivity').addEventListener('input',e=>{this.input.sensitivity=Number(e.target.value);this.input.save();this.render();});
    document.getElementById('control-size').addEventListener('input',e=>{this.input.buttonSize=Number(e.target.value);this.input.save();this.render();});
    document.getElementById('control-center').addEventListener('click',e=>{
      if(performance.now()-(window.__lastTouchTime||0)<350)return;
      this.input.status=this.input.recenter()?'Нейтраль запомнили.': 'Подожди сигнал датчика и попробуй ещё раз.';this.render();
    });
    document.getElementById('controls-close').addEventListener('click',e=>{
      if(performance.now()-(window.__lastTouchTime||0)<350)return;
      this.close();
    });
    window.addEventListener('keydown',e=>{
      if(this.screen.classList.contains('hidden'))return;
      if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.close();}
      if(e.code==='Tab') {
        const list=[...this.screen.querySelectorAll('button,input')].filter(el=>!el.disabled&&el.getClientRects().length),first=list[0],last=list[list.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    },true);
    this.render();
  }
  open(opener) {this.opener=opener;this.input.reset();this.game.jump.cancel();this.render();this.screen.classList.remove('hidden');this.screen.querySelector('[data-input="'+this.input.preferredMode+'"]').focus({preventScroll:true});this.screen.scrollTop=0;}
  close() {if(this.input.calibrating)return;this.screen.classList.add('hidden');this.input.reset();this.game.renderControlHelp();this.opener?.focus({preventScroll:true});}
  render() {
    const input=this.input;input.render();
    this.screen.querySelectorAll('[data-input]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.input===input.preferredMode));b.classList.toggle('hidden',b.dataset.input==='keys'&&input.mobile);});
    this.screen.querySelectorAll('[data-jump-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.jumpSide===input.jumpSide)));
    document.getElementById('control-sensitivity').value=input.sensitivity;document.getElementById('sensitivity-value').textContent=input.sensitivity.toFixed(2)+'×';
    document.getElementById('control-size').value=input.buttonSize;document.getElementById('size-value').textContent=input.buttonSize<=68?'Компактная':input.buttonSize<=76?'Обычная':input.buttonSize<=88?'Крупная':'Очень крупная';
    document.getElementById('controls-description').textContent=input.preferredMode==='gyro'?'Небольшой наклон — точная коррекция, сильнее — широкая дуга.':input.preferredMode==='touch'?'Положи палец '+(input.jumpSide==='right'?'слева':'справа')+' и тяни вбок. Отпусти — доска выпрямится.':'← → или A D — курс. Пробел — прыжок и трюк.';
    document.getElementById('controls-status').textContent=input.status;
    document.getElementById('controls-close').disabled=!!input.calibrating;
    document.getElementById('control-center').classList.toggle('hidden',input.mode!=='gyro');
  }
}
