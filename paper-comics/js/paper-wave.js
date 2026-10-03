/* A moving paper terrain. Rendering and physics sample the same surface. */
class PaperWave {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.period = 58;
    this.drift = 3.2;
    this.lastPrintFrame = -1;
    this.colors = [new THREE.Color('#063957'), new THREE.Color('#207ca3'), new THREE.Color('#65aeb4')];
    const texture = new THREE.TextureLoader().load(SPRITE_ASSETS.wave_paper_texture);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(7, 15);
    texture.anisotropy = 4;
    const geometry = new THREE.PlaneGeometry(84, 232, 64, 144);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(30,0,0);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
    this.originalZ = Float32Array.from(geometry.attributes.position.array.filter((_, i) => i % 3 === 2));
    this.sea = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({map:texture, vertexColors:true, side:THREE.DoubleSide}));
    this.sea.frustumCulled = false;
    scene.add(this.sea);
    this.crests = [];
    for (let i = 0; i < 6; i++) {
      const edge = this.ribbon(0xf5ebd2, 1.1);
      const fold = this.ribbon(0xd4cbb3, .45);
      const shadow = this.ribbon(0x092e48, 1.25);
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

  height(x, z, time = this.time) {
    const phase = (z - time * this.drift + x * .82) / this.period * Math.PI * 2;
    const ridge = Math.pow((Math.sin(phase) + 1) * .5, 3);
    const leftBank = Math.max(0, Math.min(1, (-x + 1) / 10));
    const rightBank = Math.max(0, Math.min(1, (x - 3) / 12));
    const wall = 1.6 * leftBank * leftBank * (.6 + .4 * Math.sin(z * .035));
    return -.5 + 3.8 * ridge + wall + .7 * rightBank * rightBank + .12 * Math.sin(z * .23 + x * .41 - time * 1.4);
  }

  sample(x, z) {
    const h = this.height(x, z);
    const dx = (this.height(x + .12, z) - this.height(x - .12, z)) / .24;
    const dz = (this.height(x, z + .15) - this.height(x, z - .15)) / .3;
    const phase = (z - this.time * this.drift + x * .82) / this.period * Math.PI * 2;
    return {height:h, dx, dz, crest:Math.pow((Math.sin(phase) + 1) * .5, 3)};
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
    this.sea.material.map.offset.y = -centerZ / 232 * 15;
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
      col.setXYZ(i, .72 + c.r * .45, .72 + c.g * .35, .74 + c.b * .32);
    }
    pos.needsUpdate = col.needsUpdate = true;
    this.sea.geometry.computeVertexNormals();
    const first = Math.floor((playerZ - 26 - time * this.drift) / this.period);
    this.crests.forEach((crest, index) => {
      const n = first + index;
      [crest.shadow, crest.fold, crest.edge].forEach((mesh, layer) => {
        const p = mesh.geometry.attributes.position;
        for (let j = 0; j <= 80; j++) {
          const x = -64 + j / 80 * 76;
          const center = n * this.period + this.period / 4 + time * this.drift - x * .82;
          const rag = (this.hash(j + n * 89) - .5) * .55;
          for (let side = 0; side < 2; side++) {
            const z = center + (side - .5) * mesh.userData.width + rag + (layer === 1 ? -.38 : 0);
            const lift = layer === 0 ? .025 : layer === 1 ? .08 + side * .16 : .16 + side * .2;
            p.setXYZ(j * 2 + side, -x, this.height(x, z) + lift, z);
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
