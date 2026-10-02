/**
 * Tony's Garret — Surf Rush
 * EntityFactory: Пулы 3D объектов и препятствий (§4 LEVEL1_SPEC)
 * Все объекты создаются заранее в пулах (без аллокаций в рантайме)
 */

class EntityFactory {
  constructor(scene) {
    this.scene = scene;
    this.entitiesGroup = new THREE.Group();
    this.entitiesGroup.name = 'entitiesGroup';
    this.scene.add(this.entitiesGroup);

    this.textures = {};
    this.materials = {};
    this.pools = {};

    this.initTextures();
    this.initMaterials();
    this.initPools();
  }

  // Создание и кэширование текстур
  initTextures() {
    const loader = new THREE.TextureLoader();

    // 1. Крышки рыб/пальм из ассетов
    if (typeof window !== 'undefined' && window.SPRITE_ASSETS) {
      if (window.SPRITE_ASSETS.cap_fish) {
        this.textures.capFish = loader.load(window.SPRITE_ASSETS.cap_fish);
      }
      if (window.SPRITE_ASSETS.cap_palm) {
        this.textures.capPalm = loader.load(window.SPRITE_ASSETS.cap_palm);
      }
      if (window.SPRITE_ASSETS.chevron_sign) {
        this.textures.chevron = loader.load(window.SPRITE_ASSETS.chevron_sign);
      }
    }

    // 2. Процедурная золотая крышка
    this.textures.capGold = this.createCanvasTexture(256, 256, (ctx) => {
      // Золотой градиент
      const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 120);
      grad.addColorStop(0, '#FFF6A5');
      grad.addColorStop(0.5, '#F8C83A');
      grad.addColorStop(1, '#D48806');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(128, 128, 110, 0, Math.PI * 2);
      ctx.fill();

      // Зубчатый край кроненпробки
      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < 21; i++) {
        const a = (i * Math.PI * 2) / 21;
        const x = 128 + Math.cos(a) * 115;
        const y = 128 + Math.sin(a) * 115;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Звезда в центре
      ctx.fillStyle = '#9E0832';
      ctx.font = '900 110px Rubik, Montserrat, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', 128, 132);
    });

    // 3. Текстура трамплина (желтые шевроны на дереве/бумаге)
    this.textures.rampChevron = this.createCanvasTexture(256, 512, (ctx) => {
      ctx.fillStyle = '#E9D8B4'; // крафт-бумага
      ctx.fillRect(0, 0, 256, 512);

      // Шевроны вверх (▲ ▲ ▲)
      ctx.fillStyle = '#F8C83A';
      ctx.strokeStyle = '#1C1A22';
      ctx.lineWidth = 6;

      for (let y = 60; y < 512; y += 120) {
        ctx.beginPath();
        ctx.moveTo(128, y);
        ctx.lineTo(220, y + 60);
        ctx.lineTo(190, y + 80);
        ctx.lineTo(128, y + 36);
        ctx.lineTo(66, y + 80);
        ctx.lineTo(36, y + 60);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });

    // 4. Текстура буя (полосатый красно-белый спасательный буй)
    this.textures.buoy = this.createCanvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = '#FF4D4D';
      ctx.fillRect(0, 0, 256, 256);

      ctx.fillStyle = '#F4ECDC';
      ctx.fillRect(0, 80, 256, 96);

      ctx.fillStyle = '#1C1A22';
      ctx.font = 'bold 36px Montserrat, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GARRET', 128, 140);
    });

    // 5. Текстура скалы-препятствия
    this.textures.rock = this.createCanvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = '#0E3B6E'; // --ocean-deep
      ctx.beginPath();
      ctx.moveTo(128, 18);
      ctx.lineTo(210, 110);
      ctx.lineTo(236, 240);
      ctx.lineTo(20, 240);
      ctx.lineTo(46, 120);
      ctx.closePath();
      ctx.fill();

      // Белый рваный бумажный гребень
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 10;
      ctx.stroke();

      // Тень тушью
      ctx.fillStyle = 'rgba(28, 26, 34, 0.4)';
      ctx.beginPath();
      ctx.moveTo(128, 26);
      ctx.lineTo(210, 115);
      ctx.lineTo(230, 235);
      ctx.lineTo(128, 235);
      ctx.closePath();
      ctx.fill();
    });

    // 6. Текстура стены пены
    this.textures.foamWall = this.createCanvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = 'rgba(246, 241, 228, 0.95)';
      ctx.fillRect(0, 40, 256, 216);

      // Гребешки волны
      ctx.fillStyle = '#FFFFFF';
      for (let x = 16; x < 256; x += 32) {
        ctx.beginPath();
        ctx.arc(x, 46, 24, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = '#1C1A22';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 40, 248, 212);
    });

    // 7. Бонус Ледяная кружка
    this.textures.iceMug = this.createCanvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = '#5CC8E8'; // лед
      ctx.beginPath();
      ctx.arc(128, 128, 100, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 12;
      ctx.stroke();

      ctx.font = '100px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('❄️', 128, 128);
    });

    // 8. Бонус Магнит
    this.textures.magnet = this.createCanvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = '#FF6B4A';
      ctx.beginPath();
      ctx.arc(128, 128, 100, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 12;
      ctx.stroke();

      ctx.font = '100px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧲', 128, 128);
    });
  }

  createCanvasTexture(w, h, drawFn) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    drawFn(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  initMaterials() {
    this.materials.capFish = new THREE.MeshBasicMaterial({
      map: this.textures.capFish || this.textures.capGold,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide
    });

    this.materials.capPalm = new THREE.MeshBasicMaterial({
      map: this.textures.capPalm || this.textures.capGold,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide
    });

    this.materials.capGold = new THREE.MeshBasicMaterial({
      map: this.textures.capGold,
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide
    });

    this.materials.ramp = new THREE.MeshBasicMaterial({
      map: this.textures.rampChevron,
      side: THREE.DoubleSide
    });

    this.materials.megaRamp = new THREE.MeshBasicMaterial({
      map: this.textures.rampChevron,
      side: THREE.DoubleSide
    });

    this.materials.buoy = new THREE.MeshBasicMaterial({
      map: this.textures.buoy,
      side: THREE.DoubleSide
    });

    this.materials.rock = new THREE.MeshBasicMaterial({
      map: this.textures.rock,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide
    });

    this.materials.foamWall = new THREE.MeshBasicMaterial({
      map: this.textures.foamWall,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide
    });

    this.materials.iceMug = new THREE.MeshBasicMaterial({
      map: this.textures.iceMug,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide
    });

    this.materials.magnet = new THREE.MeshBasicMaterial({
      map: this.textures.magnet,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide
    });
  }

  // Создание пулов
  initPools() {
    this.pools.cap_fish = this.createPool('cap_fish', 36, () => this.buildCapMesh('cap_fish'));
    this.pools.cap_palm = this.createPool('cap_palm', 24, () => this.buildCapMesh('cap_palm'));
    this.pools.cap_gold = this.createPool('cap_gold', 8, () => this.buildCapMesh('cap_gold'));
    this.pools.cap_high = this.createPool('cap_high', 16, () => this.buildCapMesh('cap_high'));

    this.pools.ramp = this.createPool('ramp', 8, () => this.buildRampMesh(false));
    this.pools.mega_ramp = this.createPool('mega_ramp', 3, () => this.buildRampMesh(true));

    this.pools.buoy = this.createPool('buoy', 18, () => this.buildBuoyMesh());
    this.pools.rock = this.createPool('rock', 16, () => this.buildRockMesh());
    this.pools.foam_wall = this.createPool('foam_wall', 12, () => this.buildFoamWallMesh());
    this.pools.jetski = this.createPool('jetski', 6, () => this.buildJetskiMesh());

    this.pools.bonus_ice = this.createPool('bonus_ice', 6, () => this.buildBonusMesh('bonus_ice'));
    this.pools.bonus_magnet = this.createPool('bonus_magnet', 6, () => this.buildBonusMesh('bonus_magnet'));
  }

  createPool(type, count, createFn) {
    const list = [];
    for (let i = 0; i < count; i++) {
      const entity = createFn();
      entity.type = type;
      entity.active = false;
      entity.mesh.visible = false;
      this.entitiesGroup.add(entity.mesh);
      list.push(entity);
    }
    return list;
  }

  // Сборка 3D мешей для каждого типа
  buildCapMesh(capType) {
    const group = new THREE.Group();
    const isGold = capType === 'cap_gold';
    const radius = isGold ? 0.44 : 0.35;

    let mat = this.materials.capFish;
    if (capType === 'cap_palm') mat = this.materials.capPalm;
    if (isGold) mat = this.materials.capGold;

    // Круглая плоская крышка с поворотом вокруг Y
    const geo = new THREE.CircleGeometry(radius, 20);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'capDisc';
    group.add(mesh);

    // Легкая тень на воде
    const shadowGeo = new THREE.CircleGeometry(radius * 0.9, 14);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI * 0.5;
    shadow.position.y = -0.55;
    group.add(shadow);

    return {
      mesh: group,
      isCollectible: true,
      isHigh: capType === 'cap_high',
      score: isGold ? 500 : (capType === 'cap_palm' ? 25 : 10),
      hitRadiusX: 0.9,
      hitDepthZ: 1.1,
      hitHeightMin: capType === 'cap_high' ? 2.5 : -0.5,
      hitHeightMax: capType === 'cap_high' ? 5.2 : 2.5,
      rotSpeed: isGold ? 10.5 : 8.5
    };
  }

  buildRampMesh(isMega) {
    const group = new THREE.Group();
    const width = isMega ? 5.8 : 1.9;
    const length = isMega ? 10.0 : 4.5;
    const height = isMega ? 3.2 : 1.35;

    // Наклонная плоскость трамплина
    const slopeGeo = new THREE.PlaneGeometry(width, length);
    slopeGeo.rotateX(-Math.PI * 0.5 + Math.atan2(height, length));
    const slopeMat = isMega ? this.materials.megaRamp : this.materials.ramp;
    const slopeMesh = new THREE.Mesh(slopeGeo, slopeMat);
    slopeMesh.position.set(0, height * 0.5, 0);
    group.add(slopeMesh);

    // Боковые бумажные стенки (крафт)
    const sideGeo = new THREE.BufferGeometry();
    const halfW = width * 0.5;
    const halfL = length * 0.5;
    const sideVertices = new Float32Array([
      // Левая сторона
      halfW, 0, -halfL,   halfW, 0, halfL,   halfW, height, halfL,
      // Правая сторона
      -halfW, 0, -halfL,  -halfW, height, halfL,  -halfW, 0, halfL
    ]);
    sideGeo.setAttribute('position', new THREE.BufferAttribute(sideVertices, 3));
    const sideMat = new THREE.MeshBasicMaterial({ color: 0xD8B880, side: THREE.DoubleSide });
    const sideMesh = new THREE.Mesh(sideGeo, sideMat);
    group.add(sideMesh);

    return {
      mesh: group,
      isRamp: true,
      isMega: isMega,
      rampHeight: height,
      rampLength: length,
      launchAirY: isMega ? 4.2 : 1.85,
      hitRadiusX: width * 0.52,
      hitDepthZ: length * 0.55
    };
  }

  buildBuoyMesh() {
    const group = new THREE.Group();
    // Конический плавучий буй
    const coneGeo = new THREE.CylinderGeometry(0.2, 0.55, 1.25, 12);
    const coneMesh = new THREE.Mesh(coneGeo, this.materials.buoy);
    coneMesh.position.y = 0.62;
    group.add(coneMesh);

    return {
      mesh: group,
      isObstacle: true,
      canJumpOver: true,
      canDuckUnder: false,
      hitRadiusX: 0.75,
      hitDepthZ: 0.9,
      jumpClearHeight: 0.75 // прыжок выше 0.75 м безопасен
    };
  }

  buildRockMesh() {
    const group = new THREE.Group();
    // Бумажная скала высотой 2.6 м (не перепрыгивается, только объезд)
    const rockGeo = new THREE.PlaneGeometry(1.6, 2.7);
    const rockMesh = new THREE.Mesh(rockGeo, this.materials.rock);
    rockMesh.position.y = 1.35;
    group.add(rockMesh);

    return {
      mesh: group,
      isObstacle: true,
      canJumpOver: false, // только объезд!
      canDuckUnder: false,
      hitRadiusX: 0.85,
      hitDepthZ: 1.0,
      jumpClearHeight: 999
    };
  }

  buildFoamWallMesh() {
    const group = new THREE.Group();
    // Стена пены высотой 1.9 м (нырок или высокий прыжок)
    const foamGeo = new THREE.PlaneGeometry(2.1, 1.9);
    const foamMesh = new THREE.Mesh(foamGeo, this.materials.foamWall);
    foamMesh.position.y = 1.0;
    group.add(foamMesh);

    return {
      mesh: group,
      isObstacle: true,
      canJumpOver: true,
      canDuckUnder: true, // нырок спасает!
      hitRadiusX: 1.0,
      hitDepthZ: 0.9,
      jumpClearHeight: 1.45
    };
  }

  buildJetskiMesh() {
    const group = new THREE.Group();
    // Гидроцикл с кильватером
    const bodyGeo = new THREE.BoxGeometry(0.9, 0.5, 1.8);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xD93829 });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.35;
    group.add(bodyMesh);

    return {
      mesh: group,
      isObstacle: true,
      canJumpOver: true,
      canDuckUnder: false,
      hitRadiusX: 0.8,
      hitDepthZ: 1.1,
      jumpClearHeight: 0.9
    };
  }

  buildBonusMesh(bonusType) {
    const group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(0.85, 0.85);
    const mat = bonusType === 'bonus_ice' ? this.materials.iceMug : this.materials.magnet;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.65;
    group.add(mesh);

    return {
      mesh: group,
      isBonus: true,
      bonusType: bonusType,
      hitRadiusX: 0.85,
      hitDepthZ: 1.0
    };
  }

  // Получить свободный объект из пула
  spawn(type, x, z, laneIndex, goldSlot = null) {
    const pool = this.pools[type];
    if (!pool) return null;

    for (let i = 0; i < pool.length; i++) {
      const e = pool[i];
      if (!e.active) {
        e.active = true;
        e.laneIndex = laneIndex;
        e.goldSlot = goldSlot;
        e.collected = false;
        e.x = x;
        e.z = z;
        e.baseY = 0;
        e.mesh.position.set(x, 0, z);
        e.mesh.visible = true;
        return e;
      }
    }
    return null;
  }

  // Статичные объекты для свободного размещения (песочница)
  createRamp(x, z, isMega = false) {
    const item = this.buildRampMesh(isMega);
    item.mesh.position.set(x, 0, z);
    this.scene.add(item.mesh);
    return item.mesh;
  }

  createBuoy(x, z) {
    const item = this.buildBuoyMesh();
    item.mesh.position.set(x, 0, z);
    this.scene.add(item.mesh);
    return item.mesh;
  }
}

if (typeof window !== 'undefined') {
  window.EntityFactory = EntityFactory;
}
