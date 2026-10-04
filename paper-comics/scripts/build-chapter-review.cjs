const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
async function run(){
  const folder=path.resolve(__dirname,'../review/comics/chapter');
  const groups=[
    ['menus',['mobile-01-home','mobile-02-character','mobile-03-location','mobile-04-story-1','mobile-04-story-2','mobile-04-story-3','mobile-05-ready']],
    ['small-phone',['small-01-home','small-02-character','small-03-location','small-04-story-1','small-04-story-2','small-04-story-3','small-05-ready']],
    ['gameplay',['scene-crest','scene-shark','scene-jetski-cross','scene-jetski-rear','scene-large-wave','scene-recovery','scene-fall','scene-finish']],
    ['desktop',['desktop-01-home','desktop-02-character','desktop-03-location','desktop-04-story-1','desktop-04-story-2','desktop-04-story-3','desktop-05-ready']],
    ['landscape',['landscape-01-home','landscape-02-character','landscape-03-location','landscape-04-story-1','landscape-04-story-2','landscape-04-story-3','landscape-05-ready']]
  ];
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    for(const [name,files] of groups){
      const wide=name==='desktop'||name==='landscape',columns=wide?4:files.length,width=wide?1500:files.length*235;
      await page.setViewport({width,height:wide?1000:600,deviceScaleFactor:1});
      const html='<!doctype html><html lang="ru"><meta charset="utf-8"><title>Paper comics — '+name+'</title><style>body{margin:0;padding:12px;background:#e9dec4;color:#173847;font:12px Arial}h1{font-size:18px;margin:3px 0 12px}main{display:grid;grid-template-columns:repeat('+columns+',1fr);gap:8px}figure{margin:0;background:#142f3d;padding:4px}img{width:100%;display:block}figcaption{color:#fff0d1;padding:8px 3px;font-size:11px}</style><h1>GARRET / PAPER COMICS — '+name+'</h1><main>'+files.map(file=>'<figure><img src="data:image/png;base64,'+fs.readFileSync(path.join(folder,file+'.png')).toString('base64')+'"><figcaption>'+file+'</figcaption></figure>').join('')+'</main></html>';
      await page.setContent(html,{waitUntil:'load'});await page.screenshot({path:path.join(folder,'review-'+name+'.png'),fullPage:true});
      fs.writeFileSync(path.join(folder,'review-'+name+'.html'),html);
    }
    console.log('Five visual review boards saved to '+folder);
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
