/* UV sprite animation: original generated sheets remain untouched. */
class HeroAnimator {
  constructor(game){
    this.game=game;this.width=2.7;this.height=3.6;this.state='trim';this.frame=0;this.clock=0;this.turnStage=0;this.turnDirection=0;this.releasing=false;
    this.atlases={};this.framesSeen=new Set();
    // grip = centre of the fingers, foot = stance centre. Coordinates in a 384x512 cell.
    this.metadata={
      trim:{grips:[[334,122],[352,143],[325,164],[312,111],[346,91],[350,136],[323,98],[320,99]],feet:[[230,495],[227,494],[213,491],[222,495],[273,476],[273,459],[235,475],[228,479]]},
      left:{grips:[[332,116],[344,132],[354,142],[331,179],[336,145],[336,119],[312,107],[321,108]],feet:[[227,492],[235,489],[239,485],[234,484],[273,459],[244,467],[225,469],[222,469]]},
      right:{grips:[[333,116],[352,126],[355,150],[345,175],[346,134],[342,101],[324,98],[321,101]],feet:[[233,487],[234,486],[232,478],[222,473],[251,452],[269,452],[247,454],[226,462]]},
      recovery:{grips:[[329,111],[346,128],[323,152],[337,202],[343,104],[348,89],[339,90],[319,97]],feet:[[230,496],[251,494],[247,492],[215,493],[251,472],[259,470],[244,472],[220,472]]}
    };
    const files={trim:'hero-trim-rear-v2.png',left:'hero-carve-left-rear-v2.png',right:'hero-carve-right-rear-v2.png',recovery:'hero-recovery-rear-v2.png'};
    const loader=new THREE.TextureLoader();
    this.ready=Promise.all(Object.entries(files).map(([key,file])=>new Promise((resolve,reject)=>{
      loader.load('assets/comics/'+file,texture=>{
        texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
        texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.repeat.set(.25,.5);this.atlases[key]=texture;resolve();
      },undefined,()=>reject(new Error('Не удалось загрузить анимацию '+file)));
    })));
    const card=game.player.card;
    card.geometry.dispose();card.geometry=new THREE.PlaneGeometry(this.width,this.height);
    card.material.depthWrite=false;card.renderOrder=3;
    // Clip neighbouring torn fibres in UV space; preserve all source PNGs.
    this.clip={value:new THREE.Vector2(0,1)};
    card.material.onBeforeCompile=shader=>{
      shader.uniforms.heroClip=this.clip;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vHeroLocalUv;').replace('#include <uv_vertex>','#include <uv_vertex>\nvHeroLocalUv=uv;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vHeroLocalUv;\nuniform vec2 heroClip;').replace('#include <map_fragment>','if(vHeroLocalUv.x<heroClip.x&&vHeroLocalUv.y>heroClip.y)discard;\n#include <map_fragment>');
    };
    card.material.customProgramCacheKey=()=> 'hero-atlas-clean-v1';card.material.needsUpdate=true;
    const geometry=new THREE.PlaneGeometry(this.width*.09,this.height*.075);
    this.fingers=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({transparent:true,alphaTest:.25,depthWrite:false,side:THREE.DoubleSide}));
    this.fingers.position.z=.085;this.fingers.renderOrder=6;card.add(this.fingers);
    this.fingerTextures={};
    this.ready.then(()=>{for(const [key,t] of Object.entries(this.atlases)){this.fingerTextures[key]=t.clone();this.fingerTextures[key].needsUpdate=true;}this.apply('trim',0);}).catch(error=>{this.error=error;});
  }
  reset(){this.state='trim';this.frame=0;this.clock=0;this.beginTurn(0);this.previousWeight=0;this.weightRelease=0;this.framesSeen.clear();if(this.atlases.trim)this.apply('trim',0);}
  beginTurn(direction){this.turnDirection=direction;this.turnStage=0;this.turnClock=0;this.releasing=false;this.releaseMode=null;}
  apply(state,frame){
    const texture=this.atlases[state];if(!texture)return;
    this.state=state;this.frame=frame;this.framesSeen.add(state+':'+frame);
    texture.offset.set(frame%4/4,(1-Math.floor(frame/4))*.5);
    this.clip.value.set(state==='recovery'&&frame===2?.065:0,.5);
    const meta=this.metadata[state],grip=meta.grips[frame],foot=meta.feet[frame],card=this.game.player.card;
    card.material.map=texture;this.game.player.pose=state;
    card.position.set((.5-foot[0]/384)*this.width,(foot[1]/512-.5)*this.height+.12,0);
    card.scale.set(1,1,1);
    this.currentGrip={x:(grip[0]/384-.5)*this.width,y:(.5-grip[1]/512)*this.height};
    const fingers=this.fingerTextures[state];
    if(fingers){
      fingers.repeat.set(.09/4,.075/2);
      fingers.offset.set((frame%4+grip[0]/384-.045)/4,(1-Math.floor(frame/4))*.5+(1-grip[1]/512-.0375)/2);
      if(!this.fingers.material.map)this.fingers.material.needsUpdate=true;
      this.fingers.material.map=fingers;this.fingers.position.set(this.currentGrip.x,this.currentGrip.y,.085);
    }
  }
  update(dt){
    const p=this.game.p;this.clock+=dt;
    if(p.airborne){this.beginTurn(0);this.apply('trim',2);return;}
    if(p.recovering>0||p.fallen){this.beginTurn(0);this.apply('recovery',Math.floor(this.clock*10)%8);return;}
    if(this.game.jump.holding&&this.game.jump.charge>.1){this.beginTurn(0);this.apply('trim',this.game.jump.charge>.6?2:1);return;}
    const direction=Math.abs(p.lean)>.18?Math.sign(p.lean):0;
    if(!this.turnDirection&&direction)this.beginTurn(direction);
    if(this.turnDirection){
      this.turnClock+=dt;
      if(direction!==this.turnDirection&&!this.releasing){this.releasing=true;this.releaseMode=this.turnStage<4?'unwind':'exit';}
      // Finish the old arc before entering the opposite arc. Hold each exit
      // photograph for a full beat, including the final upright frame.
      while(this.turnClock>=1/14&&this.turnDirection){
        this.turnClock-=1/14;
        if(!this.releasing)this.turnStage=Math.min(4,this.turnStage+1);
        else if(this.releaseMode==='unwind'){
          if(this.turnStage>0)this.turnStage--;else this.beginTurn(direction);
        }else if(this.turnStage<7)this.turnStage++;else this.beginTurn(direction);
      }
      if(this.turnDirection){this.apply(this.turnDirection<0?'left':'right',this.turnStage);return;}
    }
    {
      const pitch=p.pitch||0;
      const weight=pitch>.18?1:pitch<-.18?-1:0;
      if(weight===0&&this.previousWeight!==0){this.weightRelease=.16;this.releaseFrame=this.previousWeight>0?3:6;}
      this.previousWeight=weight;this.weightRelease=Math.max(0,(this.weightRelease||0)-dt);
      let frame=weight>0?(pitch>.55?2:1):weight<0?(pitch<-.55?5:4):this.weightRelease>0?this.releaseFrame:this.game.waveRide.zone==='crest'?(Math.floor(this.clock*6)%2?7:6):p.crouch>.6?2:0;
      this.apply('trim',frame);
    }
  }
}
window.HeroAnimator=HeroAnimator;
