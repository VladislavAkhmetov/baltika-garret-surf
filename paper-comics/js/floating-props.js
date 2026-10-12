/* Small, authored sea debris. Geometry and collision sizes belong to the same prop. */
class FloatingProps {
  static definitions={
    flamingo:{name:'ФЛАМИНГО',cause:'УДАР ОБ ФЛАМИНГО',radius:1.15,depth:1.2,clearance:2.1,yaw:-.55},
    log:{name:'БРЕВНО',cause:'УДАР О БРЕВНО',radius:1.5,depth:.85,clearance:1.55,yaw:.32},
    barrel:{name:'БОЧКА',cause:'УДАР О БОЧКУ',radius:1.15,depth:.85,clearance:1.25,yaw:-.35},
    cooler:{name:'ХОЛОДИЛЬНИК',cause:'УДАР О ХОЛОДИЛЬНИК',radius:1.05,depth:.85,clearance:1.2,yaw:.4},
    suitcase:{name:'ЧЕМОДАН',cause:'УДАР О ЧЕМОДАН',radius:1.1,depth:.8,clearance:.85,yaw:-.5},
    ball:{name:'ПЛЯЖНЫЙ МЯЧ',cause:'УДАР О МЯЧ',radius:.85,depth:.85,clearance:1.3,yaw:.2}
  };
  constructor(game){
    this.game=game;this.materials=new Map();
  }
  ink(color){
    if(!this.materials.has(color))this.materials.set(color,this.game.paperToon.material(color));
    return this.materials.get(color);
  }
  mesh(group,geometry,color,position=[0,0,0],scale=null){
    const mesh=new THREE.Mesh(geometry,this.ink(color));mesh.position.set(...position);
    if(scale)mesh.scale.set(...scale);group.add(mesh);return mesh;
  }
  tube(group,points,radius,color){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    return this.mesh(group,new THREE.TubeGeometry(curve,16,radius,6,false),color);
  }
  ring(group,radius,tube,color,position,axis='y'){
    const mesh=this.mesh(group,new THREE.TorusGeometry(radius,tube,6,24),color,position);
    if(axis==='y')mesh.rotation.x=-Math.PI/2;
    if(axis==='x')mesh.rotation.y=Math.PI/2;
    return mesh;
  }
  build(kind){
    if(!FloatingProps.definitions[kind])throw Error('Unknown floating prop: '+kind);
    const group=new THREE.Group();group.name='Floating '+kind;
    group.userData.floatingProp=kind;
    this[kind](group);
    return group;
  }
  flamingo(g){
    const pink=0xf18fb2,deep=0xd85e8a,cream=0xffe7d5;
    const body=this.ring(g,.83,.27,pink,[0,.15,0]);body.scale.z=1.15;
    this.ring(g,.83,.026,deep,[0,.32,0]);
    this.mesh(g,new THREE.SphereGeometry(.45,12,8),pink,[0,.31,-.65],[1,.75,1.35]);
    this.tube(g,[[0,.28,-.65],[0,.75,-.94],[0,1.3,-.91],[0,1.62,-.58],[0,1.58,-.23]],.15,pink);
    this.mesh(g,new THREE.SphereGeometry(.27,12,8),pink,[0,1.59,-.32],[.85,1,1.25]);
    const beak=this.mesh(g,new THREE.ConeGeometry(.14,.38,8),cream,[0,1.48,-.04]);beak.rotation.x=-.9;
    const tip=this.mesh(g,new THREE.ConeGeometry(.105,.18,8),0x233f49,[0,1.36,.08]);tip.rotation.x=-.9;
    for(const side of [-1,1]){
      this.mesh(g,new THREE.SphereGeometry(.045,8,6),0x233f49,[side*.225,1.64,-.29]);
      this.mesh(g,new THREE.SphereGeometry(.3,10,6),deep,[side*.82,.28,.08],[.44,.65,1.6]);
      this.tube(g,[[side*.88,.33,-.1],[side*.93,.31,.08],[side*.86,.27,.4]],.017,cream);
    }
    const tail=this.mesh(g,new THREE.ConeGeometry(.24,.5,7),pink,[0,.39,.89]);tail.rotation.x=.9;
  }
  log(g){
    const bark=this.mesh(g,new THREE.CylinderGeometry(.46,.58,2.8,9,3),0x845532,[0,.17,0]);bark.rotation.z=Math.PI/2;
    for(const side of [-1,1]){
      const cap=this.mesh(g,new THREE.CylinderGeometry(.45,.45,.025,20),0xe2bc7a,[side*1.405,.17,0]);cap.rotation.z=Math.PI/2;
      for(const radius of [.13,.27,.38])this.ring(g,radius,.015,0x9a683f,[side*1.424,.17,0],'x');
    }
    for(const z of [-.32,0,.32])this.tube(g,[[-1.25,.52,z],[-.6,.57,z+.05],[.2,.58,z-.03],[1.27,.53,z]],.022,0x4a3c2b);
    this.tube(g,[[.28,.48,0],[.38,.75,.12],[.6,.92,.17],[.8,1.04,.2]],.12,0x845532);
    this.tube(g,[[.52,.86,.16],[.36,1.05,.2],[.3,1.16,.22]],.06,0x845532);
    this.mesh(g,new THREE.SphereGeometry(.13,8,6),0xe2bc7a,[.82,1.06,.2],[.7,.3,1]);
  }
  barrel(g){
    const points=[[-1,.49],[-.9,.57],[-.5,.66],[0,.7],[.5,.66],[.9,.57],[1,.49]].map(([y,r])=>new THREE.Vector2(r,y));
    const body=this.mesh(g,new THREE.LatheGeometry(points,16),0xa9713e,[0,.23,0]);body.rotation.z=Math.PI/2;
    for(const x of [-.75,.75])this.ring(g,.625,.065,0x354e54,[x,.23,0],'x');
    for(const side of [-1,1]){
      const cap=this.mesh(g,new THREE.CylinderGeometry(.49,.49,.045,16),0xd2a56c,[side*1.02,.23,0]);cap.rotation.z=Math.PI/2;
      this.ring(g,.48,.032,0x62472f,[side*1.047,.23,0],'x');
    }
    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2;
      this.tube(g,[[-.94,.23+Math.cos(a)*.53,Math.sin(a)*.53],[0,.23+Math.cos(a)*.705,Math.sin(a)*.705],[.94,.23+Math.cos(a)*.53,Math.sin(a)*.53]],.012,0x62472f);
    }
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
    const c=canvas.getContext('2d');c.fillStyle='#ead8aa';c.fillRect(0,0,128,64);c.fillStyle='#57432f';c.font='bold 36px Georgia';c.textAlign='center';c.fillText('RUM',64,44);
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.8,.4),this.game.paperToon.material(0xffffff,{map:new THREE.CanvasTexture(canvas)}));
    label.position.set(0,.63,-.57);label.rotation.x=.5;label.rotation.y=Math.PI;g.add(label);
    this.mesh(g,new THREE.CylinderGeometry(.11,.11,.06,8),0x62472f,[.1,.95,0]);
  }
  cooler(g){
    this.mesh(g,new THREE.BoxGeometry(1.7,.8,1.15),0x52b5b2,[0,.25,0]);
    this.mesh(g,new THREE.BoxGeometry(1.82,.18,1.25),0xf8ebcf,[0,.74,0]);
    this.mesh(g,new THREE.BoxGeometry(1.5,.035,.96),0xe5d4b2,[0,.84,0]);
    for(const side of [-1,1])this.tube(g,[[side*.88,.59,-.3],[side*1.05,.51,-.3],[side*1.05,.51,.3],[side*.88,.59,.3]],.055,0x214e57);
    this.mesh(g,new THREE.BoxGeometry(.18,.24,.045),0xf8ebcf,[0,.56,-.6]);
    this.mesh(g,new THREE.BoxGeometry(.7,.08,.045),0xf8ebcf,[0,.23,-.59]);
  }
  suitcase(g){
    this.mesh(g,new THREE.BoxGeometry(1.85,.46,1.25),0xe2ac45,[0,.17,0]);
    this.mesh(g,new THREE.BoxGeometry(1.88,.06,1.28),0x8b5834,[0,.18,0]);
    for(const x of [-.57,.57]){
      this.mesh(g,new THREE.BoxGeometry(.13,.48,1.28),0x945635,[x,.18,0]);
      this.mesh(g,new THREE.BoxGeometry(.21,.06,.25),0xf4dec1,[x,.45,-.2]);
    }
    this.tube(g,[[-.3,.28,-.65],[-.28,.29,-.87],[.28,.29,-.87],[.3,.28,-.65]],.06,0x483d30);
    for(const x of [-.86,.86])for(const z of [-.56,.56])this.mesh(g,new THREE.SphereGeometry(.15,8,6),0x945635,[x,.3,z],[1,.7,1]);
    const sticker=this.mesh(g,new THREE.CircleGeometry(.22,12),0xf4dec1,[.05,.415,.15]);sticker.rotation.x=-Math.PI/2;
  }
  ball(g){
    const colors=[0xf7de9d,0xe67451,0xf7de9d,0x4eaeb7,0xf7de9d,0xf0ad43];
    for(let i=0;i<6;i++)this.mesh(g,new THREE.SphereGeometry(.75,6,10,i/6*Math.PI*2,Math.PI/3),colors[i],[0,.36,0]);
    this.mesh(g,new THREE.SphereGeometry(.11,8,6),0xf7de9d,[0,1.105,0],[1,.3,1]);
  }
  update(h){
    const g=this.game,s=g.wave.sample(h.x,h.z),d=FloatingProps.definitions[h.prop];
    const bob=g.reducedMotion?0:Math.sin(g.time*1.6+h.index*1.9)*.035;
    h.group.position.y=s.height+.1+bob;
    h.group.rotation.set(THREE.MathUtils.clamp(s.dz*.16,-.12,.12),d.yaw,THREE.MathUtils.clamp(-s.dx*.16,-.13,.13));
  }
}
window.FloatingProps=FloatingProps;
