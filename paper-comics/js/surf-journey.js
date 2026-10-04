/* Game carousels, four-page visual novel and launch. */
class SurfJourney {
  constructor(game) {
    this.game=game;this.page=0;this.screen='start';this.heroIndex=this.locationIndex=0;
    this.screens=['start','setup','story'];
    this.heroes=[{name:'МАКС',available:true},{name:'ВИТЯ',available:false},{name:'СТАС',available:false}];
    this.locations=[{name:'БУХТА GARRET',available:true},{name:'СЕВЕРНЫЙ РИФ',available:false},{name:'НОЧНОЙ ПОРТ',available:false}];
    this.story=[
      {tag:'01 / ПАРИ НА МИЛЛИОН БРЫЗГ',title:'ПАРИ НА\nВЫВЕСКУ!',speaker:'ТОНИ · ХОЗЯИН БАРА',line:'«Семь штормовых волн, рифы и голодные акулы. Никто в бухте не довезёт полный бокал Garret от дальнего мыса до стойки! Слабо, Макс?»',caption:'В бухте Garret легендами не рождаются — ими становятся на закате.',word:'ПО РУКАМ!',aside:'Слабо? Это мы ещё посмотрим!'},
      {tag:'02 / БЕЗУМНЫЙ СТАРТ',title:'ЭЙ, КУДА\nМЫ ПЛЫВЁМ?!',speaker:'КРАБ КЛЕШНЯ',line:'«Стой, кудрявый! Я просто грелся на хвосте доски! Куда мы несёмся?! Держи бокал ровнее — на меня пена капает!»',caption:'Макс поймал первую волну. Краб вцепился в борт намертво.',word:'ПОГНАЛИ!',aside:'У меня восемь ног. Паниковать будем на все восемь.'},
      {tag:'03 / СУДЬЯ НА ГИДРОЦИКЛЕ',title:'БОРИС\nПРИНИМАЕТ СТАВКИ!',speaker:'БОРИС · РЕФЕРИ БУХТЫ',line:'«Ставлю ящик Garret, что Макс довезёт хотя бы пену! Жми, кудрявый, акулы уже почуяли движ!»',caption:'Поддержка Бориса поднимает волны круче девятого вала.',word:'ВЖУ-УХ!',aside:'Борис, твоя волна смоет нас обоих!'},
      {tag:'04 / КУБОК БУХТЫ GARRET',title:'НИ КАПЛИ\nМИМО!',speaker:'ТВОЯ ИСТОРИЯ',line:'Оседлай 7 волн, уходи от соперников и акул. Довези хотя бы 30% бокала Garret до бара, чтобы забрать легендарный кубок сезона!',caption:'Холодный Garret ждёт на финише. Ни капли мимо!',word:'НА ВОЛНУ ↗',aside:'Краб верит в тебя (но на всякий случай зажмурился).'}
    ];
    document.querySelectorAll('[data-cycle]').forEach(b=>b.addEventListener('click',()=>this.cycle(b.dataset.cycle,Number(b.dataset.direction))));
    document.getElementById('setup-next').addEventListener('click',()=>{this.page=0;this.open('story');});
    document.getElementById('assist-toggle').addEventListener('click',()=>{game.assist=!game.assist;this.renderSelection();});
    document.getElementById('story-next').addEventListener('click',()=>this.advance());
    document.getElementById('story-skip').addEventListener('click',()=>this.launch());
    document.getElementById('story-prev').addEventListener('click',()=>{if(this.page>0){this.page--;this.renderStory();}else this.open('setup');});
    document.querySelectorAll('[data-journey-back]').forEach(b=>b.addEventListener('click',()=>this.open(b.dataset.journeyBack)));
    document.querySelectorAll('[data-home]').forEach(b=>b.addEventListener('click',()=>this.home()));
    document.querySelectorAll('[data-setup]').forEach(b=>b.addEventListener('click',()=>{this.home();this.open('setup');}));
    this.renderStory();this.renderSelection();
    new ResizeObserver(()=>this.frameStory()).observe(document.getElementById('story-screen'));
    window.addEventListener('keydown',e=>{
      if(game.state!=='start')return;
      if(this.launching)return;
      if(this.screen==='story'&&['ArrowRight','Enter'].includes(e.code)&&e.target.tagName!=='BUTTON'){e.preventDefault();this.advance();}
      if(this.screen==='story'&&e.code==='ArrowLeft'){e.preventDefault();if(this.page>0){this.page--;this.renderStory();}}
      if(this.screen==='setup'&&['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();this.cycle(e.target.closest('[data-choice="location"]')?'location':'hero',e.code==='ArrowRight'?1:-1);}
      if(e.code==='Escape'&&this.screen!=='start')this.open(this.screen==='setup'?'start':'setup');
    });
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
  home(){this.game.audio.stopBGM();this.game.reset();['pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));this.open('start');}
  renderStory(){
    const s=this.story[this.page],el=document.getElementById('story-screen');el.dataset.page=this.page;
    for(const [id,value] of [['story-tag',s.tag],['story-title',s.title],['story-speaker',s.speaker],['story-line',s.line],['story-caption',s.caption],['story-word',s.word],['story-aside',s.aside]])document.getElementById(id).textContent=value;
    document.getElementById('story-next').textContent=this.page===3?'НА ВОЛНУ ↗':'ДАЛЬШЕ →';
    this.game.companion?.drawStory(this.page);
    document.querySelectorAll('.story-dot').forEach((dot,i)=>{dot.classList.toggle('active',i===this.page);dot.setAttribute('aria-current',i===this.page?'step':'false');});
    el.classList.remove('story-enter');void el.offsetWidth;el.classList.add('story-enter');
    this.frameStory();
  }
  frameStory(){
    const art=document.querySelector('.story-art'),r=art.getBoundingClientRect(),size=Math.max(r.width,r.height);
    if(!size)return;
    const column=this.page%2,row=Math.floor(this.page/2);
    art.style.backgroundSize=(size*2)+'px '+(size*2)+'px';
    art.style.backgroundPosition=((r.width-size)/2-column*size)+'px '+((r.height-size)/2-row*size)+'px';
  }
  advance(){if(this.launching)return;if(this.launchFailed||this.page===3)this.launch();else{this.page++;this.renderStory();}}
  async launch(){
    if(this.launching)return;this.launching=true;this.launchFailed=false;
    document.getElementById('story-error').classList.add('hidden');
    const buttons=['story-next','story-skip','story-prev'].map(id=>document.getElementById(id));buttons.forEach(b=>b.disabled=true);
    document.getElementById('story-screen').setAttribute('aria-busy','true');buttons[0].textContent='НА ВОДУ…';
    try{await this.game.start(true);}finally{
      this.launching=false;buttons.forEach(b=>b.disabled=false);document.getElementById('story-screen').removeAttribute('aria-busy');
      buttons[0].textContent=this.launchFailed?'ПОВТОРИТЬ':this.page===3?'НА ВОЛНУ ↗':'ДАЛЬШЕ →';
      if(this.game.state==='playing'){this.screen='playing';this.game.container.focus({preventScroll:true});}
    }
  }
  showError(text){this.open('story');this.launchFailed=true;const el=document.getElementById('story-error');el.textContent=text;el.classList.remove('hidden');document.getElementById('story-next').textContent='ПОВТОРИТЬ';}
}
window.SurfJourney=SurfJourney;
