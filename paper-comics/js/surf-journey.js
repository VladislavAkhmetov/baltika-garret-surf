/* The front of the comic: selection, three deliberate story beats, and launch. */
class SurfJourney {
  constructor(game) {
    this.game=game;this.page=0;this.screen='start';
    this.screens=['start','character','location','story','ready'];
    this.story=[
      {tag:'01 / ОБЕЩАНИЕ',title:'ДО БАРА.\nНИ КАПЛИ.',line:'Тони: «Бар за мысом. Довезёшь кружку — первая волна за мой счёт».',caption:'Всего одна кружка. Что может пойти не так?',word:'ДЗЫНЬ!'},
      {tag:'02 / НЕ ПО ПЛАНУ',title:'ЭЙ!\nТИШЕ НА ВОДЕ!',line:'Аквабайк режет бухту. След поднимает доску, а ветер уносит последний спокойный вечер.',caption:'Теперь держаться придётся крепче.',word:'ВЖУХ!'},
      {tag:'03 / ТВОЯ ВОЛНА',title:'ВОЛНА БОЛЬШАЯ.\nОБЕЩАНИЕ ТОЖЕ.',line:'Гребни, местные сёрферы и пара очень любопытных акул. Бар всё ещё ждёт за мысом.',caption:'Лови волну. Держи баланс. Довези пиво.',word:'ПОГНАЛИ!'}
    ];
    document.getElementById('character-next').addEventListener('click',()=>this.open('location'));
    document.getElementById('location-next').addEventListener('click',()=>{this.page=0;this.renderStory();this.open('story');});
    document.getElementById('story-next').addEventListener('click',()=>this.advance());
    document.getElementById('story-skip').addEventListener('click',()=>this.open('ready'));
    document.getElementById('story-prev').addEventListener('click',()=>{if(this.page>0){this.page--;this.renderStory();}else this.open('location');});
    document.getElementById('ride-button').addEventListener('click',()=>this.launch());
    document.querySelectorAll('[data-journey-back]').forEach(button=>button.addEventListener('click',()=>this.open(button.dataset.journeyBack)));
    document.querySelectorAll('[data-home]').forEach(button=>button.addEventListener('click',()=>this.home()));
    document.getElementById('home-how').addEventListener('click',()=>{document.getElementById('home-instructions').classList.toggle('hidden');document.getElementById('home-how').setAttribute('aria-expanded',!document.getElementById('home-instructions').classList.contains('hidden'));});
    this.renderStory();
    window.addEventListener('keydown',e=>{
      if(this.game.state!=='start')return;
      if(this.screen==='story'&&(e.code==='ArrowRight'||e.code==='Enter')&&e.target.tagName!=='BUTTON'){e.preventDefault();this.advance();}
      if(e.code==='Escape'&&this.screen!=='start')this.open(this.screen==='character'?'start':this.screen==='location'?'character':'location');
    });
  }
  hideAll() { this.screens.forEach(name=>document.getElementById(name+'-screen').classList.add('hidden')); }
  open(name) {
    this.game.state='start';this.game.input.reset();this.game.jump.cancel();this.game.comics.reset();
    this.game.container.classList.remove('playing');this.hideAll();this.screen=name;
    document.getElementById(name+'-screen').classList.remove('hidden');
    if(name==='story')this.renderStory();
    const focus=document.querySelector('#'+name+'-screen [data-primary]')||document.querySelector('#'+name+'-screen button');
    focus?.focus({preventScroll:true});
  }
  home() {
    this.game.audio.stopBGM();this.game.reset();
    ['pause-screen','result-screen'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    this.open('start');
  }
  renderStory() {
    const s=this.story[this.page],el=document.getElementById('story-screen');
    el.dataset.page=this.page;
    for(const [id,value] of [['story-tag',s.tag],['story-title',s.title],['story-line',s.line],['story-caption',s.caption],['story-word',s.word]])document.getElementById(id).textContent=value;
    document.getElementById('story-next').textContent=this.page===2?'НА ВОДУ ↗':'ДАЛЬШЕ →';
    document.querySelectorAll('.story-dot').forEach((dot,i)=>{dot.classList.toggle('active',i===this.page);dot.setAttribute('aria-current',i===this.page?'step':'false');});
    el.classList.remove('story-enter');void el.offsetWidth;el.classList.add('story-enter');
  }
  advance() { if(this.page<2){this.page++;this.renderStory();}else this.open('ready'); }
  async launch() {
    const button=document.getElementById('ride-button');button.disabled=true;button.textContent='ГОТОВИМ ДОСКУ…';
    document.getElementById('launch-error').classList.add('hidden');
    await this.game.start(true);button.disabled=false;button.textContent='ЛОВИ ВОЛНУ ↗';
  }
  showError(text) {this.open('ready');const error=document.getElementById('launch-error');error.textContent=text;error.classList.remove('hidden');}
}
window.SurfJourney=SurfJourney;
