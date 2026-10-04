/* A moving paper terrain. Rendering and physics sample the same surface. */
class PaperWave {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.waves = COMICS_COURSE.waves;
    this.wakeField = null;
    this.lastPrintFrame = -1;
    this.colors = [new THREE.Color('#063957'), new THREE.Color('#207ca3'), new THREE.Color('#65aeb4')];
    const texture = new THREE.TextureLoader().load(SPRITE_ASSETS.wave_paper_texture);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 4;
    const geometry = new THREE.PlaneGeometry(84, 232, 64, 144);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(30,0,0);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
    this.originalZ = Float32Array.from(geometry.attributes.position.array.filter((_, i) => i % 3 === 2));
    this.sea = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({map:texture, vertexColors:true, side:THREE.DoubleSide}));
    // Three differently rotated photograph samples blend in world space. Smooth
    // noise hides tile boundaries while preserving the original printed water.
    this.sea.material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPaperWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvPaperWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 vPaperWorld;
        float paperHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float paperNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(paperHash(i),paperHash(i+vec2(1,0)),f.x),mix(paperHash(i+vec2(0,1)),paperHash(i+vec2(1,1)),f.x),f.y);}
      `).replace('#include <map_fragment>',`
        #ifdef USE_MAP
          vec2 world=vPaperWorld.xz;
          vec2 warp=vec2(paperNoise(world*.043),paperNoise(world*.036+17.0))*.9;
          vec2 uv=world*vec2(.041,.054)+warp;
          vec4 a=texture2D(map,uv);
          vec4 b=texture2D(map,mat2(.8,-.6,.6,.8)*uv*.73+vec2(8.2,3.7));
          vec4 d=texture2D(map,mat2(-.36,.93,.93,.36)*uv*1.23+vec2(1.7,12.8));
          float blend=paperNoise(world*.066+7.0);
          vec4 texelColor=mix(mix(a,b,.22+blend*.5),d,.17+paperNoise(world*.031)*.18);
          texelColor=mapTexelToLinear(texelColor);
          diffuseColor*=texelColor;
        #endif
      `);
    };
    this.sea.material.customProgramCacheKey=()=> 'paper-water-aperiodic-v2';
    this.sea.frustumCulled = false;
    scene.add(this.sea);
    this.crests = [];
    for (let i = 0; i < this.waves.length; i++) {
      const edge = this.ribbon(0xf6f0da, 1.1);
      const fold = this.ribbon(0x76c9cc, 1.8);
      const shadow = this.ribbon(0x092e48, 2.4);
      [edge,fold,shadow].forEach((mesh,layer)=>{mesh.material.transparent=true;mesh.material.opacity=[.88,.38,.12][layer];mesh.material.depthWrite=false;});
      this.crests.push({edge, fold, shadow});
    }
    this.flecks = [];
    const material = new THREE.MeshBasicMaterial({color:0xf3e8d0, side:THREE.DoubleSide});
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 72; i++) {
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      this.flecks.push({mesh, x:(this.hash(i * 3) - .5) * 44, offset:this.hash(i * 3 + 1) * 190, size:.15 + this.hash(i * 3 + 2) * .75});
      scene.add(mesh);
    }
  }

  hash(n) { const a = Math.sin(n * 127.1 + 311.7) * 43758.5453; return a - Math.floor(a); }

  smooth(t){t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);}
  envelope(w,z){return this.smooth((z-w.from)/24)*this.smooth((w.to-z)/24);}
  crestX(w,z,time=this.time){
    const t=THREE.MathUtils.clamp((z-w.from)/(w.to-w.from),0,1);
    return w.start+(w.end-w.start)*t+(w.arc||0)*Math.sin(Math.PI*t)+.22*Math.sin(z*.045+w.id)+THREE.MathUtils.clamp((time-w.from/30)*.07,-.55,.65);
  }
  field(x,z,time=this.time){
    let best={wave:null,energy:0,face:2,lift:0,zone:'flat'};
    for(const w of this.waves){
      const energy=this.envelope(w,z);if(energy===0)continue;
      const face=(x-this.crestX(w,z,time))/w.width;
      // Both flanks meet with zero slope at a rounded crest. The shoreward
      // face stays broad enough to carve rather than acting like a knife edge.
      const radius=face>=0?face:-face/.72;
      const profile=radius<1?.5+.5*Math.cos(Math.PI*radius):0;
      const lift=w.height*energy*profile;
      if(lift>best.lift)best={wave:w,energy,face,lift,zone:face<0?'back':face<.18?'crest':face<.65?'face':'base'};
    }
    return best;
  }

  height(x, z, time = this.time, includeWake = true) {
    return -.32+this.field(x,z,time).lift+.065*Math.sin(z*.19+x*.41-time*1.4)+.035*Math.sin(x*.8-z*.09+time)+(includeWake&&this.wakeField?this.wakeField(x,z):0);
  }

  sample(x, z) {
    const h = this.height(x, z);
    const dx = (this.height(x + .12, z) - this.height(x - .12, z)) / .24;
    const dz = (this.height(x, z + .15) - this.height(x, z - .15)) / .3;
    const baseDx=(this.height(x+.12,z,this.time,false)-this.height(x-.12,z,this.time,false))/.24;
    const baseDz=(this.height(x,z+.15,this.time,false)-this.height(x,z-.15,this.time,false))/.3;
    const f=this.field(x,z);
    return {height:h,dx,dz,baseDx,baseDz,...f,crest:f.wave?Math.max(0,1-Math.abs(f.face)*3):0};
  }

  ribbon(color, width) {
    const n = 80, geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3));
    const indices = [];
    for (let i = 0; i < n; i++) { const a = i * 2; indices.push(a, a+1, a+2, a+1, a+3, a+2); }
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color, side:THREE.DoubleSide}));
    mesh.frustumCulled = false;
    mesh.userData.width = width;
    this.scene.add(mesh);
    return mesh;
  }

  update(playerZ, time, force = false) {
    this.time = time;
    const frame = Math.floor(time * 24);
    if (frame === this.lastPrintFrame && !force) return;
    this.lastPrintFrame = frame;
    const pos = this.sea.geometry.attributes.position;
    const col = this.sea.geometry.attributes.color;
    const centerZ = playerZ + 91;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i), z = this.originalZ[i] + centerZ;
      const x = -wx, h = this.height(x, z);
      pos.setY(i, h);
      pos.setZ(i, z);
      const crest = Math.max(0, Math.min(1, (h + .5) / 4.3));
      c.copy(this.colors[0]).lerp(this.colors[1], Math.min(1, crest * 2.5));
      if (crest > .65) c.lerp(this.colors[2], (crest - .65) * 1.3);
      // Preserve the photographic water grain while making troughs visibly deeper.
      col.setXYZ(i, .59 + c.r * .64, .64 + c.g * .44, .68 + c.b * .35);
    }
    pos.needsUpdate = col.needsUpdate = true;
    this.sea.geometry.computeVertexNormals();
    this.crests.forEach((crest, index) => {
      const w=this.waves[index];
      [crest.shadow, crest.fold, crest.edge].forEach((mesh, layer) => {
        mesh.visible=w.to>playerZ-27&&w.from<playerZ+205;
        const p = mesh.geometry.attributes.position;
        for (let j = 0; j <= 80; j++) {
          const z=w.from+j/80*(w.to-w.from),center=this.crestX(w,z,time),energy=this.envelope(w,z);
          const rag=(this.hash(j+index*89)-.5)*.22;
          const patch=layer===2&&(j+index*17)%19>14?.08:.45+this.hash(j*3+index*71)*.7;
          for (let side = 0; side < 2; side++) {
            const x=center+((side-.5)*mesh.userData.width*patch+rag+(layer===1?.35:layer===0?-.3:0))*energy;
            const lift=(layer===0?.025:layer===1?.045:.07)*energy;
            p.setXYZ(j*2+side,-x,this.height(x,z)+lift,z);
          }
        }
        p.needsUpdate = true;
      });
    });
    this.flecks.forEach((f, i) => {
      f.mesh.visible=f.x<11;
      const z = playerZ - 20 + ((f.offset - playerZ * .94) % 190 + 190) % 190;
      const h = this.height(f.x, z);
      f.mesh.position.set(-f.x, h + .045, z);
      f.mesh.scale.set(f.size, .4 + f.size * 1.8, 1);
      f.mesh.rotation.z = Math.sin(i * 3) * .3;
    });
  }
}

window.PaperWave = PaperWave;
