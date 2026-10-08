/* Rideable 3D water: the board and the main mesh sample the same height field. */
class PaperWave {
  constructor(scene) {
    this.scene = scene;
    this._time = 0;
    // Route landmarks shape a denser wave train, rather than seven isolated walls.
    this.waves = Array.from({length:window.FLOW_TEST_MODE?3:COMICS_COURSE.waveCount},(_,id)=>({id}));
    this.wakeField = null;
    this.peelFront = null;
    this.lastPrintFrame = -1;
    const loader=new THREE.TextureLoader();
    let resolveWater,rejectWater;
    this.ready=new Promise((resolve,reject)=>{resolveWater=resolve;rejectWater=reject;});
    this.ready.catch(()=>{});
    const texture = loader.load('assets/comics/water-surface-v5.png',resolveWater,undefined,()=>rejectWater(Error('Не удалось загрузить воду')));
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 4;
    const geometry = new THREE.PlaneGeometry(100, 232, 128, 192);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(22,0,0);
    // Spend horizontal detail around the route, rather than on the open sea.
    const vertices=geometry.attributes.position;
    for(let i=0;i<vertices.count;i++){
      const t=(vertices.getX(i)+28)/100;
      const x=t<.16?-28+t/.16*12:t<.82?-16+(t-.16)/.66*34:18+(t-.82)/.18*54;
      vertices.setX(i,x);
    }
    geometry.setAttribute('waterFoam',new THREE.BufferAttribute(new Float32Array(vertices.count),1));
    this.originalZ = Float32Array.from(geometry.attributes.position.array.filter((_, i) => i % 3 === 2));
    this.waterTime={value:0};
    this.waterMaterial=this.makeWaterMaterial(texture);
    this.sea = new THREE.Mesh(geometry,this.waterMaterial);
    this.sea.frustumCulled = false;
    scene.add(this.sea);
    this.foamTexture=this.makeFoamTexture();
    this.swellLips=this.waves.map(()=>this.makeLip(112));
    this.spray=this.waves.map(()=>{
      const mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(.07,5,4),new THREE.MeshBasicMaterial({color:0xd8eee7,transparent:true,opacity:.65,depthWrite:false}),18);
      mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);return mesh;
    });
    this.sprayDummy=new THREE.Object3D();
    this.resetWaves();
    this.flecks = [];
    const material = new THREE.MeshBasicMaterial({color:0xfff7e5,map:this.foamTexture,transparent:true,opacity:.45,alphaTest:.06,depthWrite:false,side:THREE.DoubleSide});
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      this.flecks.push({mesh, x:(this.hash(i * 3) - .5) * 44, offset:this.hash(i * 3 + 1) * 190, size:.18 + this.hash(i * 3 + 2) * .4});
      scene.add(mesh);
    }
  }

  hash(n) { const a = Math.sin(n * 127.1 + 311.7) * 43758.5453; return a - Math.floor(a); }

  get time(){return this._time;}
  set time(value){
    this._time=value;
    // A travelling wave has a world position independent of the player.
    for(const w of this.waves){
      if(w.anchorFrom===undefined)continue;
      const age=value-w.encounterTime;
      w.from=w.anchorFrom+w.velocityZ*age;w.to=w.anchorTo+w.velocityZ*age;
      w.start=w.anchorStart+w.velocityX*age;w.end=w.anchorEnd+w.velocityX*age;
    }
  }

  makeWaterMaterial(texture){
    const material=new THREE.ShaderMaterial({
      uniforms:{uWaterPrint:{value:texture},uTime:this.waterTime,uFogColor:{value:new THREE.Color(0xc7d7c9)}},
      side:THREE.DoubleSide,
      vertexShader:`
        attribute float waterFoam;
        varying vec3 vWaterWorld;
        varying vec3 vWaterNormal;
        varying float vWaterFoam;
        void main(){
          vec4 world=modelMatrix*vec4(position,1.0);
          vWaterWorld=world.xyz;vWaterNormal=mat3(modelMatrix)*normal;vWaterFoam=waterFoam;
          gl_Position=projectionMatrix*viewMatrix*world;
        }
      `,
      fragmentShader:`
        uniform sampler2D uWaterPrint;
        uniform float uTime;
        uniform vec3 uFogColor;
        varying vec3 vWaterWorld;
        varying vec3 vWaterNormal;
        varying float vWaterFoam;
        float waterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float waterNoise(vec2 p){
          vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(waterHash(i),waterHash(i+vec2(1,0)),f.x),mix(waterHash(i+vec2(0,1)),waterHash(i+vec2(1,1)),f.x),f.y);
        }
        void main(){
          vec2 world=vWaterWorld.xz;
          vec2 flow=vec2(.005,-.010)*uTime;
          vec2 waterUV=world*vec2(.040,.046)+vec2(0.0,-vWaterWorld.y*.061)+flow;
          vec3 print=texture2D(uWaterPrint,waterUV).rgb;
          float grain=dot(print,vec3(.25,.5,.25));
          vec2 printSlope=vec2(dot(texture2D(uWaterPrint,waterUV+vec2(.0025,0.0)).rgb,vec3(.25,.5,.25)),dot(texture2D(uWaterPrint,waterUV+vec2(0.0,.0025)).rgb,vec3(.25,.5,.25)))-grain;
          float phaseA=dot(world,vec2(1.32,.64))-uTime*1.75+waterNoise(world*.24+uTime*.035)*5.0;
          float phaseB=dot(world,vec2(-.78,1.47))+uTime*1.22+waterNoise(world*.38-uTime*.02)*4.4;
          float phaseC=dot(world,vec2(3.12,-1.3))-uTime*2.1;
          float phaseD=dot(world,vec2(-1.76,-3.62))+uTime*2.7;
          vec2 ripple=vec2(1.32,.64)*cos(phaseA)*.019+vec2(-.78,1.47)*cos(phaseB)*.014+vec2(3.12,-1.3)*cos(phaseC)*.006+vec2(-1.76,-3.62)*cos(phaseD)*.005+printSlope*.23;
          vec3 normal=normalize(vWaterNormal+vec3(-ripple.x,0.0,-ripple.y));
          if(!gl_FrontFacing)normal=-normal;
          vec3 view=normalize(cameraPosition-vWaterWorld);
          vec3 sun=normalize(vec3(.14,.38,1.0));
          float facing=clamp(dot(normal,view),0.0,1.0);
          float fresnel=.065+.52*pow(1.0-facing,4.0);
          float crest=smoothstep(-.1,4.8,vWaterWorld.y);
          vec3 deep=vec3(.018,.255,.32),clear=vec3(.12,.58,.57);
          vec3 water=mix(deep,clear,.22+crest*.65);
          water*=.78+.22*max(0.0,dot(normal,sun));
          water*=.94+grain*.12;
          water+=vec3(.045,.13,.09)*crest*(1.0-clamp(normal.y,0.0,1.0))*.55;
          vec3 reflected=reflect(-view,normal);
          vec3 sky=mix(vec3(.62,.78,.77),vec3(.24,.58,.67),clamp(reflected.y,0.0,1.0));
          water=mix(water,sky,fresnel);
          vec3 halfVector=normalize(view+sun);
          float sparkle=pow(max(0.0,dot(normal,halfVector)),115.0)*.38;
          float sheen=pow(max(0.0,dot(normal,halfVector)),24.0)*.075;
          water+=vec3(1.0,.88,.63)*(sparkle+sheen);
          water*=mix(.66,1.0,smoothstep(-.4,.1,normal.y));
          // Broken whitewater belongs to the crest, rather than painted stripes.
          if(vWaterFoam>.015){
            vec2 foamWorld=(world+vec2(vWaterWorld.y*.35,-vWaterWorld.y*.65))*1.10+vec2(uTime*.32,-uTime*.48);
            float clumps=waterNoise(foamWorld*.72)*.65+waterNoise(foamWorld*2.7)*.35;
            float bubbles=waterNoise(foamWorld*8.3+5.0);
            float density=smoothstep(.10,.72,vWaterFoam);
            float cells=smoothstep(.20,.67,clumps+bubbles*.20);
            // Dense whitewater on the chasing lip keeps a solid frothy core with broken edges.
            cells=mix(cells,.85+bubbles*.15,smoothstep(.95,1.4,vWaterFoam));
            float foam=density*cells;
            vec3 foamColor=mix(vec3(.68,.83,.80),vec3(.98,.98,.88),.55+bubbles*.45);
            water=mix(water,foamColor,foam);
          }
          float fog=smoothstep(100.0,235.0,distance(cameraPosition,vWaterWorld));
          gl_FragColor=vec4(mix(water,uFogColor,fog),1.0);
        }
      `
    });
    return material;
  }
  makeLip(lengthSegments){
    const geometry=new THREE.PlaneGeometry(1,1,lengthSegments,12);
    geometry.setAttribute('waterFoam',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count),1));
    const mesh=new THREE.Mesh(geometry,this.waterMaterial);mesh.frustumCulled=false;
    mesh.userData.lengthSegments=lengthSegments;this.scene.add(mesh);return mesh;
  }

  resetWaves(seed=Math.random()*10000){
    if(window.FLOW_TEST_MODE){(window.DRIVE_TEST_MODE?DriveTest:FlowTest).configureWaves(this);return;}
    this.seed=seed;
    this.waves.forEach((w,i)=>{
      const variation=this.hash(seed+i*37+21),progress=i/(this.waves.length-1);
      const template=COMICS_COURSE.waves[Math.min(COMICS_COURSE.waves.length-1,Math.floor(progress*COMICS_COURSE.waves.length))];
      // Alternate readable small shoulders and strong peaks, with continuous variation.
      const rhythm=[.16,.53,.26,.92],phase=Math.floor(this.hash(seed+83)*4);
      w.size=i===0?.36:THREE.MathUtils.clamp(rhythm[(i+phase)%4]+(variation-.5)*.18,.07,1);
      if(i===1)w.size=Math.min(w.size,.55);
      w.height=1.1+w.size*4.0;
      const centerZ=70+progress*(COMICS_COURSE.length-105);
      const length=84+w.height*9+this.hash(seed+i*53)*12;
      w.anchorFrom=centerZ-length/2;w.anchorTo=centerZ+length/2;
      w.centerX=(template.start+template.end)/2+(this.hash(seed+i*59)-.5)*1.6;
      // Crests run obliquely along the coast. Motion is mainly towards the beach (+X).
      w.crestSlope=1/(.10+this.hash(seed+i*41)*.10);w.span=24+w.height;
      w.width=12-w.size*3.2;w.backWidth=w.width*1.7;
      w.anchorStart=w.centerX-length/2/w.crestSlope;
      w.anchorEnd=w.centerX+length/2/w.crestSlope;
      w.arc=template.arc*.22;w.bow=.8+this.hash(seed+i*47)*.9;w.encounterTime=centerZ/25;
      w.velocityX=.55+this.hash(seed+i*19+7)*.18;
      w.velocityZ=-w.velocityX/w.crestSlope;
      w.breakRate=.026+this.hash(seed+i*31+17)*.009;
      // Every wave owns its breaking front from level time zero. Player speed cannot move it.
      w.peelSpeed=28.2+w.size*1.4;
      w.peelOriginZ=centerZ-14;w.peelOriginTime=centerZ/30;
    });
    Object.assign(this.waves[0],{anchorFrom:-72,anchorTo:180,anchorStart:-3.6,anchorEnd:-4.2,
      height:3.7,size:.65,width:10,backWidth:15,centerX:-3,span:38,arc:0,bow:0,crestSlope:50,
      encounterTime:54/28,velocityX:.12,velocityZ:-.02,breakRate:.014,
      flowShape:[-3.6,-4.8,-3,-4.2],flowFace:[.34,.30,.48,.30]});
    this.time=0;this.lastPrintFrame=-1;
  }

  smooth(t){t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);}
  envelope(w,z,time=this.time){
    const from=w.anchorFrom+w.velocityZ*(time-w.encounterTime),to=w.anchorTo+w.velocityZ*(time-w.encounterTime);
    const t=(z-from)/(to-from);
    if(t<=0||t>=1)return 0;
    const peak=.70+.30*Math.exp(-Math.pow((t-.5)/(.22-w.size*.06),2));
    return Math.pow(Math.sin(Math.PI*t),1.45)*peak;
  }
  crestX(w,z,time=this.time){
    if(w.flowShape)return FlowTest.crestX(w,z,time);
    const age=time-w.encounterTime,from=w.anchorFrom+w.velocityZ*age;
    const t=THREE.MathUtils.clamp((z-from)/(w.anchorTo-w.anchorFrom),0,1);
    const centerDistance=z-from-(w.anchorTo-w.anchorFrom)/2;
    return w.anchorStart+(w.anchorEnd-w.anchorStart)*t+w.velocityX*age+(w.arc||0)*Math.sin(Math.PI*t)
      +w.bow*(1-Math.exp(-centerDistance*centerDistance/576));
  }
  breaking(w,z,time=this.time){
    if(!w.flowShape)return this.smooth((this.frontAt(w,time).z+10-z)/10);
    const t=(z-w.anchorFrom-w.velocityZ*(time-w.encounterTime))/(w.anchorTo-w.anchorFrom);
    // The breaking section peels along the crest, leaving an open shoulder ahead.
    const peel=.55+(time-w.encounterTime)*w.breakRate;
    return this.smooth((peel-t+.18)/.28);
  }
  frontAt(w,time=this.time){
    return {id:w.id,z:w.peelOriginZ+(time-w.peelOriginTime)*w.peelSpeed,speed:w.peelSpeed};
  }
  shoulder(w,x,time=this.time){
    const center=w.centerX+w.velocityX*(time-w.encounterTime);
    const across=(x-center)/w.span;
    return Math.pow(Math.max(0,1-across*across),1.35)*Math.exp(-Math.pow((across+.15)/.78,2));
  }
  faceProfile(face){
    if(face>=1)return 0;
    if(face>=.10)return Math.pow(1-face,3.25);
    const t=face/.10,end=Math.pow(.9,3.25),slope=-3.25*Math.pow(.9,2.25)*.10;
    return (2*t*t*t-3*t*t+1)+(-2*t*t*t+3*t*t)*end+(t*t*t-t*t)*slope;
  }
  field(x,z,time=this.time){
    let best={wave:null,energy:0,face:2,lift:0,zone:'flat'};
    for(const w of this.waves){
      const envelope=this.envelope(w,z,time);if(envelope===0)continue;
      const face=(x-this.crestX(w,z,time))/w.width;
      const rear=-face*w.width/w.backWidth;
      if(face>=1||rear>=1)continue;
      const energy=envelope*this.shoulder(w,x,time);if(energy===0)continue;
      const profile=face>=0?this.faceProfile(face):rear<1?.5+.5*Math.cos(Math.PI*rear):0;
      const lift=w.height*energy*profile;
      if(lift>best.lift)best={wave:w,energy,face,lift,zone:face<0?'back':face<.14?'crest':face<.65?'face':'base'};
    }
    return best;
  }

  baseHeight(x,z,time){
    return -.32+.13*Math.sin(x*.21-z*.075-time*.48)+.075*Math.sin(x*.39+z*.14-time*.81)+.025*Math.sin(x*.88-z*.29-time*1.36);
  }
  height(x, z, time = this.time, includeWake = true) {
    return this.baseHeight(x,z,time)+this.field(x,z,time).lift+(includeWake&&this.wakeField?this.wakeField(x,z):0);
  }

  sample(x, z) {
    const h = this.height(x, z);
    const dx = (this.height(x + .12, z) - this.height(x - .12, z)) / .24;
    const dz = (this.height(x, z + .15) - this.height(x, z - .15)) / .3;
    const baseDx=(this.height(x+.12,z,this.time,false)-this.height(x-.12,z,this.time,false))/.24;
    const baseDz=(this.height(x,z+.15,this.time,false)-this.height(x,z-.15,this.time,false))/.3;
    const f=this.field(x,z);
    const waterVelocity=(this.height(x,z,this.time+.04,false)-this.height(x,z,this.time-.04,false))/.08;
    return {height:h,dx,dz,baseDx,baseDz,...f,waterVelocity,
      flowX:f.wave?f.wave.velocityX*f.energy:0,flowZ:f.wave?f.wave.velocityZ*f.energy:0,
      crest:f.wave?Math.max(0,1-Math.abs(f.face)*2.8):0};
  }

  makeFoamTexture(){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';
    for(let i=0;i<220;i++){
      const x=this.hash(i*3+11)*256,y=32+(this.hash(i*3+12)-.5)*44;
      const radius=2+this.hash(i*3+13)*7;ctx.globalAlpha=.4+this.hash(i+91)*.6;
      ctx.beginPath();ctx.ellipse(x,y,radius*1.5,radius,0,0,Math.PI*2);ctx.fill();
    }
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=THREE.RepeatWrapping;texture.repeat.set(8,1);return texture;
  }
  ribbon(color, width) {
    const n=80,geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3));
    const indices = [];
    for (let i = 0; i < n; i++) { const a = i * 2; indices.push(a, a+1, a+2, a+1, a+3, a+2); }
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
    mesh.frustumCulled = false;
    mesh.userData.width = width;
    this.scene.add(mesh);
    return mesh;
  }

  update(playerZ, time, force = false) {
    this.time = time;
    this.waterTime.value=time;
    const frame = Math.floor(time * 30);
    if (frame === this.lastPrintFrame && !force) return;
    this.lastPrintFrame = frame;
    const pos = this.sea.geometry.attributes.position;
    const foam = this.sea.geometry.attributes.waterFoam;
    const centerZ = playerZ + 91;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i), z = Math.fround(this.originalZ[i] + centerZ);
      const x=-wx,f=this.field(x,z,time);
      const h=this.baseHeight(x,z,time)+f.lift+(this.wakeField?this.wakeField(x,z):0);
      pos.setY(i, h);
      pos.setZ(i, z);
      const breakAmount=f.wave?this.breaking(f.wave,z):0;
      const crestFoam=f.energy*Math.exp(-Math.pow((f.face-.04)/.07,2))*(.42+breakAmount*.48);
      const wash=f.energy*breakAmount*.48*Math.exp(-Math.pow((f.face-.24)/.15,2));
      // Pursuing whitewater is a band behind the front; it thins out towards the camera.
      const front=this.peelFront,whitewater=front&&f.wave?.id===front.id&&f.face>-.15&&f.face<.92?f.energy*this.smooth((front.z+1.5-z)/5)*(1-this.smooth((front.z-5-z)/9))*(.45+.3*this.smooth(1-f.face)):0;
      foam.setX(i,Math.max(crestFoam,wash,whitewater));
    }
    pos.needsUpdate = foam.needsUpdate = true;
    this.sea.geometry.computeVertexNormals();
    this.swellLips.forEach((mesh,i)=>this.updateLip(mesh,this.waves[i],playerZ));
    this.updateSpray(playerZ,time);
    this.flecks.forEach((f, i) => {
      f.mesh.visible=f.x<11;
      const z = playerZ - 20 + ((f.offset+time*1.6-playerZ) % 190 + 190) % 190;
      const h = this.height(f.x, z);
      f.mesh.position.set(-f.x, h + .045, z);
      f.mesh.scale.set(f.size,1,f.size*.55);
      f.mesh.rotation.y = Math.sin(i*3)*.6;
    });
  }
  updateLip(mesh,wave,playerZ){
    mesh.visible=wave.to>playerZ-27&&wave.from<playerZ+205;
    if(!mesh.visible)return;
    const p=mesh.geometry.attributes.position,foam=mesh.geometry.attributes.waterFoam,n=mesh.userData.lengthSegments;
    for(let j=0;j<=n;j++){
      const u=j/n,z=wave.from+u*(wave.to-wave.from),x=this.crestX(wave,z);
      const field=this.field(x,z);
      const ownEnergy=this.envelope(wave,z)*this.shoulder(wave,x);
      // A neighbouring peak can cover this crest: collapse the hidden lip into the surface.
      const exposure=1-this.smooth((field.lift-wave.height*ownEnergy)/.35);
      const energy=ownEnergy*exposure,breakAmount=this.breaking(wave,z);
      const radius=wave.height*.27*energy*(.12+.88*breakAmount);
      const h=this.height(x,z);
      const tangent=(this.crestX(wave,z+.1)-this.crestX(wave,z-.1))/.2;
      const nx=1/Math.sqrt(1+tangent*tangent),nz=-tangent*nx;
      for(let row=0;row<=12;row++){
        // Closed outer/inner lip joins the same crest, rather than floating above it.
        const t=row<=6?row/6:(row-6)/6,b=1-t;
        const curl=row<=6?(3*b*b*t*1.05+3*b*t*t*2.45+t*t*t*2.25)*radius:
          (b*b*b*2.25+3*b*b*t*1.45+3*b*t*t*.10)*radius;
        const drop=row<=6?(3*b*b*t*.16-3*b*t*t*.04-t*t*t*.55)*radius:
          (-b*b*b*.55-3*b*b*t*.28+3*b*t*t*.06)*radius;
        const index=row*(n+1)+j;
        p.setXYZ(index,-x-curl*nx,h+drop,z+curl*nz);
        const crestFoam=Math.exp(-Math.pow((row/12-.24)/.19,2))*(.42+breakAmount*.52);
        const tipFoam=Math.exp(-Math.pow((row/12-.50)/.13,2))*breakAmount*.86;
        const patch=.84+.16*Math.sin(j*.19+this.time*.68+wave.id);
        foam.setX(index,Math.max(crestFoam,tipFoam)*energy*patch);
      }
    }
    p.needsUpdate=foam.needsUpdate=true;mesh.geometry.computeVertexNormals();
  }
  updateSpray(playerZ,time){
    this.spray.forEach((mesh,index)=>{
      const wave=this.waves[index];mesh.visible=wave.to>playerZ-27&&wave.from<playerZ+145;if(!mesh.visible)return;
      for(let i=0;i<18;i++){
        const seed=index*113+i*7,u=.12+this.hash(seed+1)*.76;
        const phase=(time*.72+this.hash(seed+2))%1,z=wave.from+u*(wave.to-wave.from),x=this.crestX(wave,z);
        const field=this.field(x,z),ownEnergy=this.envelope(wave,z)*this.shoulder(wave,x);
        const energy=ownEnergy*(1-this.smooth((field.lift-wave.height*ownEnergy)/.35)),breaking=this.breaking(wave,z);
        const y=this.height(x,z)+Math.sin(phase*Math.PI)*(.35+wave.height*.13)-phase*.3;
        this.sprayDummy.position.set(-x-phase*.9,y,z-phase*1.3);
        this.sprayDummy.scale.setScalar((.45+this.hash(seed+3)*.75)*Math.sin(Math.PI*phase)*energy*breaking);this.sprayDummy.updateMatrix();
        mesh.setMatrixAt(i,this.sprayDummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
    });
  }
}

window.PaperWave = PaperWave;
