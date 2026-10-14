/* Paper scenery projected from fixed world anchors. The DOM keeps the cutout
   texture crisp and behind the WebGL scene, outside the speed-blur pass. */
class PaperSky {
  constructor(game) {
    this.game = game;
    this.element = game.container.querySelector('.sky');
    this.projected = new THREE.Vector3();
    this.view = new THREE.Vector3();
    this.edge = new THREE.Vector3();
    this.layers = [
      {selector:'.sun-halo',position:[-430,80,5010],width:950,height:950,turn:13},
      {selector:'.sun',position:[-420,70,5000],width:640,height:640,turn:-5},
      {selector:'.cloud-one',position:[680,40,4000],width:1300,height:170,turn:-7},
      {selector:'.cloud-two',position:[-700,180,6100],width:1300,height:180,turn:5}
    ].map(layer => ({...layer,element:this.element.querySelector(layer.selector),
      position:new THREE.Vector3(...layer.position)}));
    this.element.classList.add('world-sky');
  }
  update() {
    const camera = this.game.camera;
    const width = this.game.renderer.domElement.clientWidth;
    const height = this.game.renderer.domElement.clientHeight;
    if (!width || !height) return;
    camera.updateMatrixWorld();
    const focal = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    for (const layer of this.layers) {
      this.view.copy(layer.position).applyMatrix4(camera.matrixWorldInverse);
      const depth = -this.view.z;
      layer.element.style.visibility = depth > 0 ? 'visible' : 'hidden';
      if (depth <= 0) continue;
      this.projected.copy(layer.position).project(camera);
      // World +X points left in the view down +Z. Its projection also captures
      // the camera's carve roll, without attaching the scenery to the camera.
      this.edge.copy(layer.position);this.edge.x-=1;this.edge.project(camera);
      const roll = Math.atan2(-(this.edge.y-this.projected.y)*height,
        (this.edge.x-this.projected.x)*width) * 180 / Math.PI;
      const style = layer.element.style;
      style.setProperty('--sky-x', ((this.projected.x+1)*width/2).toFixed(3)+'px');
      style.setProperty('--sky-y', ((1-this.projected.y)*height/2).toFixed(3)+'px');
      style.setProperty('--sky-width', (layer.width*focal/depth).toFixed(3)+'px');
      style.setProperty('--sky-height', (layer.height*focal/depth).toFixed(3)+'px');
      style.setProperty('--sky-turn', (roll+layer.turn).toFixed(3)+'deg');
    }
  }
}
window.PaperSky = PaperSky;
