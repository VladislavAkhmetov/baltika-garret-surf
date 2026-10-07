/* Small printed dots mark a fixed course; only their ink responds to the rider. */
class WaveRibbon {
  constructor(game,options={}){
    this.game=game;this.customRoute=options.route||null;
    const params=new URLSearchParams(location.search);
    let saved=true;try{saved=localStorage.getItem('garret_comics_ribbon')!=='off';}catch(_){}
    this.enabled=options.enabled??(params.has('ribbon')?params.get('ribbon')!=='off':saved);
    this.rows=64;this.columns=6;this.route=[];this.planAt=-100;this.planZ=-100;
    const geometry=new THREE.PlaneGeometry(1,1,this.columns,this.rows);
    geometry.index.setUsage(THREE.DynamicDrawUsage);geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.uniforms={uAccuracy:{value:0},uQuiet:{value:game.reducedMotion?1:0}};this.feedbackTime=-1;
    const material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,
      side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
      vertexShader:`varying vec2 ribbonUV;varying float routeZ;
        void main(){ribbonUV=uv;routeZ=position.z;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`
        uniform float uAccuracy;
        varying vec2 ribbonUV;varying float routeZ;
        float grain(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
        void main(){
          float across=(ribbonUV.x-.5)*.64;
          float along=mod(routeZ+1.1,2.2)-1.1;
          float radius=length(vec2(across,along));
          float rim=1.0-smoothstep(.175,.205,radius);
          float print=1.0-smoothstep(.135,.165,radius);
          float endFade=smoothstep(0.0,.06,ribbonUV.y)*(1.0-smoothstep(.58,1.0,ribbonUV.y));
          vec3 color=mix(vec3(.91,.30,.24),vec3(1.0,.75,.29),smoothstep(0.0,.5,uAccuracy));
          color=mix(color,vec3(.39,.83,.57),smoothstep(.5,1.0,uAccuracy));
          vec3 ink=mix(vec3(.98,.92,.78),color,print);
          float alpha=.84*rim*endFade;
          gl_FragColor=vec4(ink,alpha*(.91+.09*grain(vec2(ribbonUV.x*230.0,routeZ*12.0))));
        }`
    });
    this.mesh=new THREE.Mesh(geometry,material);this.mesh.frustumCulled=false;this.mesh.renderOrder=1;game.scene.add(this.mesh);
  }
  reset(){
    this.route=[];this.planAt=this.planZ=-100;
    this.uniforms.uAccuracy.value=0;this.feedbackTime=-1;
  }
  setEnabled(enabled){
    this.enabled=enabled;this.game.renderDirty=true;this.planAt=-100;
    if(!this.customRoute){try{localStorage.setItem('garret_comics_ribbon',enabled?'on':'off');}catch(_){}this.renderToggle();}
  }
  renderToggle(){
    const button=document.getElementById('ribbon-toggle');if(!button)return;
    button.textContent='Подсказки на воде: '+(this.enabled?'вкл.':'выкл.');button.setAttribute('aria-pressed',String(this.enabled));
  }
  catchWave(){}
  hazardsAt(z){return this.game.trickRoute.hazardsAt(z);}
  candidate(z,previous){return this.game.trickRoute.candidate(z,previous);}
  plan(){this.game.trickRoute.plan();this.route=this.game.trickRoute.route;}
  routePoint(z){return this.customRoute?this.customRoute(z):this.game.trickRoute.routePoint(z);}
  accuracy(){
    const p=this.game.p,x=this.routePoint(p.z);if(x===null)return 0;
    const ahead=this.routePoint(p.z+3),behind=this.routePoint(p.z-3);
    const slope=ahead===null||behind===null?0:(ahead-behind)/6;
    const heading=THREE.MathUtils.clamp(Math.atan2(slope,.38),-.53,.53);
    const distance=THREE.MathUtils.clamp((Math.abs(p.x-x)-.35)/2.6,0,1);
    return 1-THREE.MathUtils.clamp(distance+Math.abs(p.heading-heading)*.30,0,1);
  }
  update(){
    const g=this.game,p=g.p;
    this.mesh.visible=this.enabled&&['playing','paused'].includes(g.state)&&!p.fallen;
    if(!this.mesh.visible)return;
    const pos=this.mesh.geometry.attributes.position,uv=this.mesh.geometry.attributes.uv;
    // Align every row and dot to a world grid, so speed cannot change their spacing or path.
    const start=Math.floor((p.z+2)/2.2)*2.2,length=70.4;
    for(let row=0;row<=this.rows;row++){
      const t=row/this.rows,z=start+length*t,x=this.routePoint(z),width=x===null?0:.32;
      for(let col=0;col<=this.columns;col++){
        const index=row*(this.columns+1)+col,across=col/this.columns,px=(x??p.x)+(across-.5)*width*2;
        const ground=this.customRoute?g.wave.height(px,z):g.trickRoute.guidanceHeight(px,z);
        pos.setXYZ(index,-px,ground+.065,z);uv.setXY(index,across,t);
      }
    }
    // The isolated flow test may intentionally leave sections without a line.
    const indices=this.mesh.geometry.index.array;let cursor=0;
    for(let row=0;row<this.rows;row++){
      const z=start+length*(row+.5)/this.rows;
      if(this.routePoint(start+length*row/this.rows)===null||this.routePoint(z)===null||this.routePoint(start+length*(row+1)/this.rows)===null)continue;
      for(let col=0;col<this.columns;col++){
        const a=row*(this.columns+1)+col,b=a+this.columns+1;
        indices[cursor++]=a;indices[cursor++]=b;indices[cursor++]=a+1;indices[cursor++]=b;indices[cursor++]=b+1;indices[cursor++]=a+1;
      }
    }
    this.mesh.geometry.setDrawRange(0,cursor);this.mesh.geometry.index.needsUpdate=true;pos.needsUpdate=uv.needsUpdate=true;
    const accuracy=this.accuracy(),dt=Math.max(0,g.time-this.feedbackTime);
    this.uniforms.uAccuracy.value=this.feedbackTime<0?accuracy:THREE.MathUtils.lerp(this.uniforms.uAccuracy.value,accuracy,1-Math.exp(-dt/.14));
    this.feedbackTime=g.time;
    this.uniforms.uQuiet.value=g.reducedMotion||g.juice.calm?1:0;
  }
}
window.WaveRibbon=WaveRibbon;
