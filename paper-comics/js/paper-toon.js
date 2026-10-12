/* Shared printed-paper material for solid props. World-space grain keeps long
   decks, narrow poles and scaled rocks at the same physical paper density. */
class PaperToonMaterials {
  constructor(game){
    this.game=game;this.paper=this.makePaper();
  }
  makePaper(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const c=canvas.getContext('2d'),pixels=c.createImageData(256,256);let seed=14051;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<pixels.data.length;i+=4){
      const grain=221+Math.floor(random()*32);
      pixels.data[i]=grain;pixels.data[i+1]=grain-3;pixels.data[i+2]=grain-10;pixels.data[i+3]=255;
    }
    c.putImageData(pixels,0,0);
    for(let i=0;i<1500;i++){
      const x=random()*256,y=random()*256;
      c.strokeStyle=i%3?'rgba(255,252,230,.34)':'rgba(91,73,46,.18)';c.lineWidth=.5+random()*.65;
      c.beginPath();c.moveTo(x,y);c.lineTo(x+1+random()*7,y-1+random()*2);c.stroke();
    }
    c.fillStyle='rgba(76,66,42,.11)';
    for(let y=4;y<256;y+=8)for(let x=4;x<256;x+=8){c.beginPath();c.arc(x+(y%16?2:0),y,.65,0,Math.PI*2);c.fill();}
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=Math.min(4,this.game.renderer.capabilities.getMaxAnisotropy());return texture;
  }
  material(color,{map=null,printMix=1}={}){
    if(map)map.updateMatrix();
    const material=new THREE.ShaderMaterial({
      side:THREE.DoubleSide,
      uniforms:{uInk:{value:new THREE.Color(color)},uPaper:{value:this.paper},uMap:{value:map||this.paper},
        uHasMap:{value:map?1:0},uPrintMix:{value:printMix},uMapTransform:{value:map?map.matrix.clone():new THREE.Matrix3()},
        uFogColor:{value:this.game.scene.fog.color},uFogNear:{value:100},uFogFar:{value:225}},
      vertexShader:`
        varying vec3 paperWorld;varying vec3 paperNormal;varying vec3 paperView;varying vec2 paperUV;
        void main(){
          vec4 world=modelMatrix*vec4(position,1.0),view=modelViewMatrix*vec4(position,1.0);
          paperWorld=world.xyz;paperNormal=normalMatrix*normal;paperView=-view.xyz;paperUV=uv;
          gl_Position=projectionMatrix*view;
        }`,
      fragmentShader:`
        uniform vec3 uInk,uFogColor;uniform sampler2D uPaper,uMap;
        uniform float uHasMap,uPrintMix,uFogNear,uFogFar;uniform mat3 uMapTransform;
        varying vec3 paperWorld,paperNormal,paperView;varying vec2 paperUV;
        void main(){
          vec3 n=length(paperNormal)>.001?normalize(paperNormal):vec3(0.0,1.0,0.0);
          if(!gl_FrontFacing)n=-n;
          vec3 worldN=vec3(dot(viewMatrix[0].xyz,n),dot(viewMatrix[1].xyz,n),dot(viewMatrix[2].xyz,n));
          vec3 weight=pow(abs(worldN),vec3(4.0));weight/=max(.001,weight.x+weight.y+weight.z);
          vec3 grain=texture2D(uPaper,paperWorld.yz*.32).rgb*weight.x
            +texture2D(uPaper,paperWorld.xz*.32).rgb*weight.y
            +texture2D(uPaper,paperWorld.xy*.32).rgb*weight.z;
          float light=dot(worldN,normalize(vec3(-.45,.85,-.35)));
          float band=light>.52?1.0:light>-.12?.80:.57;
          vec3 pigment=uInk;
          if(uHasMap>.5){
            vec3 print=texture2D(uMap,(uMapTransform*vec3(paperUV,1.0)).xy).rgb;
            pigment*=mix(vec3(1.0),print,uPrintMix);
          }
          vec3 ink=mix(pigment*vec3(.61,.72,.75),pigment,band);
          ink*=band*(.58+.48*grain);
          // A little missing ink exposes the warm fibre without glossy highlights.
          float fleck=smoothstep(.94,.995,grain.r)*.16;
          ink=mix(ink,vec3(.98,.93,.81),fleck);
          float edge=1.0-smoothstep(.10,.24,abs(dot(n,normalize(paperView))));
          ink=mix(ink,ink*vec3(.57,.65,.64),edge*.44);
          float fog=smoothstep(uFogNear,uFogFar,length(paperView));
          gl_FragColor=vec4(mix(ink,uFogColor,fog),1.0);
        }`
    });
    material.name='Paper toon';material.userData.paperToon=true;
    material.defaultAttributeValues.normal=[0,1,0];
    return material;
  }
}
window.PaperToonMaterials=PaperToonMaterials;
