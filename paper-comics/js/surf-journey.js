/* Game carousels, two comic pages and launch. */
class SurfJourney {
  constructor(game) {
    this.game=game;this.page=0;this.screen='start';this.heroIndex=this.locationIndex=0;
    this.screens=['start','setup','story'];
    this.heroes=[{name:'МАКС',available:true},{name:'ВИТЯ',available:false},{name:'СТАС',available:false}];
    this.locations=[{name:'БУХТА GARRET',available:true},{name:'СЕВЕРНЫЙ РИФ',available:false},{name:'НОЧНОЙ ПОРТ',available:false}];
    this.story=[
      {label:'Пари и незваный штурман',panels:[
        {id:'tony',alt:'Тони в оранжевом фартуке предлагает пари у бара Tony’s Garret',speaker:'Тони',line:'Довезёшь бокал\nдо бара —\nкубок твой!'},
        {id:'max',alt:'Крупный план Макса: сёрфер улыбается и принимает вызов',speaker:'Макс',line:'По рукам!'},
        {id:'crab',alt:'Клешня цепляется за хвост синей доски, вокруг летят брызги',speaker:'Клешня',line:'Эй! Я тут\nзагорал!',sound:'ПОГНАЛИ!'}
      ]},
      {label:'Погоня и кубок бухты',panels:[
        {id:'boris',alt:'Борис поднимает волну на красном гидроцикле',speaker:'Борис',line:'Жми, Макс!',sound:'ВЖУ-УХ!'},
        {id:'shark',alt:'Макс с бокалом и Клешня на хвосте доски уходят от акулы',speaker:'Клешня',line:'ЗУБЫ\nСЗАДИ!'},
        {id:'cup',alt:'На стойке бара ждёт золотой кубок; в бокале осталось около трети напитка',speaker:'Тони',line:'Лови волны!\nСохрани 30% —\nзабери кубок!'}
      ]}
    ];
    this.comicImages=new Map();this.storyRender=0;
    this.story.flatMap(s=>s.panels).forEach(p=>this.loadComicImage(p.id).catch(()=>{}));
    const bindTap=(id,handler)=>{
      const el=typeof id==='string'?document.getElementById(id):id;if(!el)return;
      let localTouchTime=0;
      const activate=(e)=>{
        const isTouch=e.type==='touchend'||(e.type==='pointerup'&&e.pointerType!=='mouse');
        const now=performance.now();
        if(isTouch){
          if(now-localTouchTime<350)return;
          localTouchTime=now;
          window.__lastTouchTime=now;
          handler(e);
        }else if(e.type==='click'){
          if(now-(window.__lastTouchTime||0)<350)return;
          handler(e);
        }
      };
      el.addEventListener('pointerup',e=>{if(e.pointerType==='touch'||e.pointerType==='pen')activate(e);});
      el.addEventListener('touchend',activate,{passive:true});
      el.addEventListener('click',activate);
    };
    document.querySelectorAll('[data-cycle]').forEach(b=>bindTap(b,()=>this.cycle(b.dataset.cycle,Number(b.dataset.direction))));
    bindTap('setup-next',()=>{this.page=0;this.open('story');});
    bindTap('assist-toggle',()=>{game.assist=!game.assist;this.renderSelection();});
    bindTap('story-next',()=>this.advance());
    bindTap('story-skip',()=>this.launch());
    bindTap('story-prev',()=>{if(this.page>0){this.page--;this.renderStory();}else this.open('setup');});
    document.querySelectorAll('[data-journey-back]').forEach(b=>bindTap(b,()=>this.open(b.dataset.journeyBack)));
    document.querySelectorAll('[data-home]').forEach(b=>bindTap(b,()=>this.home()));
    document.querySelectorAll('[data-setup]').forEach(b=>bindTap(b,()=>{this.home();this.open('setup');}));
    bindTap('comic-retry',()=>this.renderStory());
    this.renderStory();this.renderSelection();
    window.addEventListener('keydown',e=>{
      if(!document.getElementById('controls-screen').classList.contains('hidden'))return;
      if(game.state!=='start')return;
      if(this.launching)return;
      if(this.screen==='story'&&['ArrowRight','Enter'].includes(e.code)&&e.target.tagName!=='BUTTON'){e.preventDefault();this.advance();}
      if(this.screen==='story'&&e.code==='ArrowLeft'){e.preventDefault();if(this.page>0){this.page--;this.renderStory();}}
      if(this.screen==='setup'&&['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();this.cycle(e.target.closest('[data-choice="location"]')?'location':'hero',e.code==='ArrowRight'?1:-1);}
      if(e.code==='Escape'&&this.screen!=='start')this.open(this.screen==='setup'?'start':'setup');
    });
    if(new URLSearchParams(window.location.search).has('comic'))this.open('story');
  }
  cycle(type,direction){const list=type==='hero'?this.heroes:this.locations,key=type==='hero'?'heroIndex':'locationIndex';this[key]=(this[key]+direction+list.length)%list.length;this.renderSelection();}
  renderSelection(){
    for(const type of ['hero','location']){
      const index=type==='hero'?this.heroIndex:this.locationIndex,item=(type==='hero'?this.heroes:this.locations)[index];
      document.getElementById(type+'-name').textContent=item.name;
      const card=document.querySelector('[data-choice="'+type+'"]');card.classList.toggle('is-locked',!item.available);card.setAttribute('aria-label',item.name+(item.available?' — доступен':' — пока закрыт'));
      if(type==='hero')card.querySelector('img').alt=item.available?'Макс, кудрявый сёрфер с кружкой и синей доской':'Силуэт закрытого персонажа';
    }
    const available=this.heroes[this.heroIndex].available&&this.locations[this.locationIndex].available,b=document.getElementById('setup-next');b.disabled=!available;b.textContent=available?'ПРОДОЛЖИТЬ':'ЗАКРЫТО';
    const assist=document.getElementById('assist-toggle');assist.textContent='Сложность: '+(this.game.assist?'обычная':'высокая');assist.setAttribute('aria-pressed',!this.game.assist);assist.setAttribute('aria-label','Сложность: '+(this.game.assist?'обычная. Включить высокую':'высокая. Включить обычную'));
    document.querySelector('.pause-balance-help').classList.toggle('hidden',this.game.assist);
  }
  hideAll(){this.screens.forEach(name=>document.getElementById(name+'-screen').classList.add('hidden'));}
  open(name){
    if(name==='character'||name==='location')name='setup';
    this.game.state='start';this.game.input.reset();this.game.jump.cancel();this.game.comics.reset();
    this.game.onboarding.clearHighlight();this.launchFailed=false;document.getElementById('story-error').classList.add('hidden');
    this.game.container.classList.remove('playing');this.hideAll();this.screen=name;
    document.getElementById(name+'-screen').classList.remove('hidden');
    if(name==='story')this.renderStory();if(name==='setup')this.renderSelection();
    (document.querySelector('#'+name+'-screen [data-primary]')||document.querySelector('#'+name+'-screen button'))?.focus({preventScroll:true});
  }
  home(){this.game.audio.stopBGM();this.game.reset();this.game.renderMenuMeta();['pause-screen','result-screen','share-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));this.open('start');}
  loadComicImage(id){
    if(this.comicImages.has(id))return this.comicImages.get(id);
    const image=new Image();image.decoding='async';
    const ready=new Promise((resolve,reject)=>{
      image.onload=()=>image.decode().then(()=>resolve(image),reject);
      image.onerror=()=>reject(Error('Не удалось загрузить кадр комикса'));
      image.src='assets/comics/comic-'+id+'-v4.png';
    });
    this.comicImages.set(id,ready);
    ready.catch(()=>{if(this.comicImages.get(id)===ready)this.comicImages.delete(id);});
    return ready;
  }
  renderStory(){
    const s=this.story[this.page],el=document.getElementById('story-screen'),book=document.getElementById('comic-page'),version=++this.storyRender;
    el.dataset.page=this.page;book.dataset.comicPage=this.page;book.setAttribute('aria-label',s.label);book.replaceChildren();
    const loading=document.getElementById('comic-loading'),retry=document.getElementById('comic-retry');
    loading.hidden=false;loading.querySelector('span').textContent='РИСУЕМ ВОЛНУ…';retry.hidden=true;
    book.setAttribute('aria-busy','true');
    const ready=s.panels.map(p=>{
      const panel=document.createElement('figure');panel.className='comic-panel comic-'+p.id;
      const bubble=document.createElement('p');bubble.className='comic-bubble';bubble.textContent=p.line;bubble.setAttribute('aria-label',p.speaker+': '+p.line.replace(/\n/g,' '));panel.append(bubble);
      if(p.sound){const sound=document.createElement('span');sound.className='comic-sfx';sound.textContent=p.sound;panel.append(sound);}
      book.append(panel);
      return this.loadComicImage(p.id).then(image=>{if(version!==this.storyRender)return;image.alt=p.alt;panel.prepend(image);});
    });
    Promise.all(ready).then(()=>{
      if(version!==this.storyRender)return;loading.hidden=true;book.removeAttribute('aria-busy');
    }).catch(()=>{
      if(version!==this.storyRender)return;loading.querySelector('span').textContent='КАДР НЕ ЗАГРУЗИЛСЯ';retry.hidden=false;book.removeAttribute('aria-busy');
    });
    document.getElementById('story-next').textContent=this.page===this.story.length-1?'НА ВОЛНУ ↗':'ДАЛЬШЕ →';
    document.getElementById('story-prev').setAttribute('aria-label',this.page?'Предыдущая страница комикса':'Вернуться к выбору');
    el.classList.remove('story-enter');void el.offsetWidth;el.classList.add('story-enter');
  }
  advance(){if(this.launching)return;if(this.launchFailed||this.page===this.story.length-1)this.launch();else{this.page++;this.renderStory();}}
  async launch(){
    if(this.launching)return;this.launching=true;this.launchFailed=false;this.game.meta.markStorySeen();
    document.getElementById('story-error').classList.add('hidden');
    const buttons=['story-next','story-skip','story-prev'].map(id=>document.getElementById(id));buttons.forEach(b=>b.disabled=true);
    document.getElementById('story-screen').setAttribute('aria-busy','true');buttons[0].textContent='НА ВОДУ…';
    try{await this.game.start(true);}finally{
      this.launching=false;buttons.forEach(b=>b.disabled=false);document.getElementById('story-screen').removeAttribute('aria-busy');
      buttons[0].textContent=this.launchFailed?'ПОВТОРИТЬ':this.page===this.story.length-1?'НА ВОЛНУ ↗':'ДАЛЬШЕ →';
      if(this.game.state==='playing'){this.screen='playing';this.game.container.focus({preventScroll:true});}
    }
  }
  showError(text){this.open('story');this.launchFailed=true;const el=document.getElementById('story-error');el.textContent=text;el.classList.remove('hidden');document.getElementById('story-next').textContent='ПОВТОРИТЬ';}
}
window.SurfJourney=SurfJourney;
