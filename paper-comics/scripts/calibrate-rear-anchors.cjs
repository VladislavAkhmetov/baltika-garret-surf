// Read original PNG pixels to locate grip/foot anchors; no image is rewritten.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const {createServer}=require('./serve');
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const metadata=await page.evaluate(async()=>{
   const files={trim:'hero-trim-rear-v2.png',left:'hero-carve-left-rear-v2.png',right:'hero-carve-right-rear-v2.png',recovery:'hero-recovery-rear-v2.png'},result={};
   for(const [state,file] of Object.entries(files)){
    const image=new Image();image.src='assets/comics/'+file;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data,w=image.width/4,h=image.height/2;
    const color=(f,x,y)=>{const i=((Math.floor(f/4)*h+y)*image.width+(f%4)*w+x)*4;return pixels.subarray(i,i+4);};
    const skin=c=>c[3]>150&&c[0]>150&&c[1]/c[0]>.44&&c[1]/c[0]<.8&&c[2]/c[1]>.3&&c[2]/c[1]<.81;
    const grips=[],feet=[];
    for(let f=0;f<8;f++){
     let top=h,bottom=0;
     for(let y=30;y<h*.52;y++)for(let x=Math.ceil(w*.74);x<w-10;x++)if(skin(color(f,x,y)))top=Math.min(top,y);
     for(let y=Math.floor(h*.6);y<h-6;y++)for(let x=10;x<w-10;x++)if(color(f,x,y)[3]>180)bottom=Math.max(bottom,y);
     let sx=0,sy=0,n=0,l=w,r=0;
     for(let y=top;y<Math.min(top+34,h*.52);y++)for(let x=Math.ceil(w*.74);x<w-10;x++)if(skin(color(f,x,y))){sx+=x;sy+=y;n++;}
     for(let y=bottom-65;y<=bottom;y++)for(let x=10;x<w-10;x++)if(skin(color(f,x,y))){l=Math.min(l,x);r=Math.max(r,x);}
     grips.push([Math.round(sx/n),Math.round(sy/n)]);feet.push([Math.round((l+r)/2),bottom]);
    }
    result[state]={grips,feet};
   }
   return result;
  });
  for(const data of Object.values(metadata))for(const pair of [...data.grips,...data.feet])assert.ok(pair.every(Number.isFinite));
  // Two skin highlights belong to the shoulder/hair; corrected by visual review.
  metadata.trim.grips[1]=[352,143];metadata.recovery.grips[1]=[346,128];
  fs.writeFileSync(path.resolve(__dirname,'../assets/comics/hero-rear-anchors-v2.json'),JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify(metadata));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
