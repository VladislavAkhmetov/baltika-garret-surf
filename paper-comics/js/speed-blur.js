/* Radial speed blur: distant scenery at top speed, peripheral water during
   earned acceleration. The rider's central corridor and DOM HUD stay sharp. */
class SpeedBlur {
  constructor(game){
    this.game=game;this.amount=this.burst=this.burstTime=0;this.width=this.height=0;this.size=new THREE.Vector2();
    const renderer=game.renderer;
    this.supported=renderer.capabilities.isWebGL2||renderer.extensions.has('WEBGL_depth_texture');
    if(!this.supported)return;
    this.target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,depthBuffer:true,stencilBuffer:false});
    this.target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedShortType);
    this.material=new THREE.ShaderMaterial({
      depthTest:false,depthWrite:false,
      uniforms:{uColor:{value:this.target.texture},uDepth:{value:this.target.depthTexture},uAmount:{value:0},uBurst:{value:0},uNear:{value:game.camera.near},uFar:{value:game.camera.far},uAspect:{value:1}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
      fragmentShader:`
        uniform sampler2D uColor,uDepth;
        uniform float uAmount,uBurst,uNear,uFar,uAspect;
        varying vec2 vUv;
        float distanceAt(vec2 uv){float d=texture2D(uDepth,uv).x;return uNear*uFar/(uFar-d*(uFar-uNear));}
        void main(){
          vec4 base=texture2D(uColor,vUv);float distance=distanceAt(vUv);
          vec2 ray=vUv-vec2(.5,.57);
          float edge=smoothstep(.10,.52,length(ray*vec2(uAspect,1.0)));
          float farMask=smoothstep(25.0,65.0,distance);
          // Printed yellow/coral guides are readable even at the edge of the frame.
          float warm=step(base.b*1.45,base.r)*step(.38,base.r)*step(base.b*1.18,base.g);
          // Pad activation has its own immediate perimeter pulse, even below top speed.
          float perimeter=max(smoothstep(.22,.43,abs(ray.x)),smoothstep(.24,.46,ray.y)*.8);
          float burst=uBurst*perimeter*smoothstep(5.0,12.0,distance);
          float amount=max(uAmount*edge*farMask*(1.0-warm*.9),burst*2.8);
          if(amount<.001){gl_FragColor=base;return;}
          vec4 sum=base;float weight=1.0;
          for(int i=1;i<=12;i++){
            float t=float(i)/12.0;vec2 uv=clamp(vUv-ray*amount*t*.075,vec2(.002),vec2(.998));
            float sampleDistance=distanceAt(uv);
            vec4 sampleColor=texture2D(uColor,uv);
            float safe=smoothstep(mix(23.0,5.0,uBurst),mix(35.0,12.0,uBurst),sampleDistance)*(1.0-step(.12,abs(sampleColor.a-base.a)));
            float w=(1.0-t*.6)*safe;sum+=sampleColor*w;weight+=w;
          }
          gl_FragColor=sum/weight;
        }`
    });
    this.scene=new THREE.Scene();this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  }
  reset(){this.amount=0;this.cancelBurst();this.game.container.style.setProperty('--speed-blur','0');}
  triggerBurst(){if(!this.game.juice.calm){this.burstTime=1.05;this.burst=1;this.amount=Math.max(this.amount,.8);}}
  cancelBurst(){this.burst=this.burstTime=0;}
  update(dt){
    const g=this.game,max=g.assist?35:42;
    const enabled=g.state==='playing'&&!g.juice.calm&&!g.p.fallen;
    if(g.juice.calm||g.p.fallen)this.cancelBurst();
    if(g.state==='playing')this.burstTime=Math.max(0,this.burstTime-dt);
    const pad=g.rush?.padTime>0&&g.p.recovering===0?THREE.MathUtils.smoothstep(g.rush.padTime,0,.3):0;
    const ride=g.waveRide;
    const crest=ride?.caught&&ride.zone==='crest'&&!g.p.airborne&&g.p.recovering===0&&g.p.balance<.5
      ?THREE.MathUtils.smoothstep(ride.crestTime,.2,.65):0;
    this.burst=enabled?Math.max(THREE.MathUtils.smoothstep(this.burstTime,0,.8),pad,crest):0;
    const target=enabled?THREE.MathUtils.smoothstep(g.p.speed,max-5,max-.5):0;
    this.amount+=(target-this.amount)*(1-Math.exp(-dt*5));
    this.amount=Math.max(this.amount,this.burst*.8);
    if(!enabled)this.amount=0;
    g.container.style.setProperty('--speed-blur',this.amount.toFixed(3));
  }
  render(){
    const g=this.game,r=g.renderer;
    if(!this.supported||this.amount<.015){r.render(g.scene,g.camera);return;}
    const size=r.getDrawingBufferSize(this.size);
    // Match the normal render resolution: the foreground does not lose detail.
    if(size.x!==this.width||size.y!==this.height){this.width=size.x;this.height=size.y;this.target.setSize(size.x,size.y);}
    this.material.uniforms.uAmount.value=this.amount;this.material.uniforms.uBurst.value=this.burst;this.material.uniforms.uAspect.value=g.camera.aspect;
    r.setRenderTarget(this.target);r.render(g.scene,g.camera);
    r.setRenderTarget(null);r.render(this.scene,this.camera);
  }
}
window.SpeedBlur=SpeedBlur;
