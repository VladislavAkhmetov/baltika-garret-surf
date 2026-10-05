const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');

async function run(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const folder=path.resolve(__dirname,'../review/comics/pages');fs.mkdirSync(folder,{recursive:true});
  let browser;
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();
    await page.setViewport({width:1080,height:1080,deviceScaleFactor:2});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.goto('http://127.0.0.1:'+server.address().port+'/?comic',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>window.game&&game.journey.screen==='story');
    for(let i=0;i<2;i++){
      await page.waitForFunction(()=>document.getElementById('comic-loading').hidden);
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
      assert.equal(await page.evaluate(()=>game.journey.page),i);
      assert.equal(await page.$$eval('.comic-panel img',images=>images.length===3&&images.every(image=>image.complete&&image.naturalWidth>500)),true);
      await (await page.$('.comic-book')).screenshot({path:path.join(folder,'garret-comic-0'+(i+1)+'.png')});
      if(i===0)await page.click('#story-next');
    }
    console.log('PASS: comic preview link; two comic pages exported to '+folder);
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
