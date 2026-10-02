/**
 * Tony's Garret — Surf Rush
 * OceanLanes: 3-полосный океан из рваной бумаги (Three.js)
 * Исправленная система координат: лево на экране = +X, право = -X
 * Соответствие LEVEL1_SPEC §3.2 и замечаниям ревью
 */

class OceanLanes {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    // Реюзабельные структуры для нулевых аллокаций
    this.surfaceNormal = new THREE.Vector3(0, 1, 0);
    this.surfaceResult = {
      height: 0,
      normal: this.surfaceNormal,
      isInsideBarrel: false
    };

    // Зоны наклона воды от больших волн (LEVEL1_SPEC §5.3, ocean.setTilt)
    this.activeTilts = [];

    const loader = new THREE.TextureLoader();

    // 1. Процедурная бесшовная текстура бумаги для воды (repeat 2, 24, MirroredRepeatWrapping)
    this.waveTexture = this.createPaperWaterTexture();
    this.waveTexture.generateMipmaps = true;
    this.waveTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.waveTexture.magFilter = THREE.LinearFilter;
    this.waveTexture.anisotropy = 8;

    // 2. Текстура городка
    this.townTexture = loader.load(window.SPRITE_ASSETS.bg_town_transparent || window.SPRITE_ASSETS.bg_town);
    this.townTexture.generateMipmaps = true;

    // 3. Процедурные текстуры с гарантированной альфой (без артефактов)
    this.laneFoamTexture = this.createFoamStripTexture();
    this.stepsTexture = this.createSteppedWavesTexture();
    this.cloudTexture = this.createPaperCloudTexture();
    this.sunTexture = this.createPaperSunTexture();
    this.rocksTexture = this.createPaperRockTexture();

    // 1. Дальний океан (600 × 400 м, y = -0.15, цвет --ocean-deep, туман)
    this.initFarOcean();

    // 2. Основное полотно воды (14 × 220 м)
    this.initWaterPlane();

    // 3. Бумажные разделители полос (2 полосы пены)
    this.initLaneDividers();

    // 4. Левая сторона экрана (+X): ступенчатые волны и городок на скале
    this.initLeftSideDecor();

    // 5. Правая сторона экрана (-X): скалы в открытом море
    this.initRightSideDecor();

    // 6. Горизонт: солнце и бумажные облака (fog: false)
    this.initHorizon();
  }

  // Бесшовная процедурная текстура крафтовой бумаги для воды (рваные мазки и растровые точки)
  createPaperWaterTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Базовый ровный бирюзовый тон бумаги
    ctx.fillStyle = '#5CC8E8';
    ctx.fillRect(0, 0, 512, 512);

    // Мягкие горизонтальные рваные полосы волн (бесшовные по X и Y)
    for (let i = 0; i < 16; i++) {
      const baseY = i * 32;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(65, 175, 215, 0.45)' : 'rgba(120, 215, 240, 0.45)';
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= 512; x += 16) {
        const wave = Math.sin((2 * Math.PI * x) / 512 * ((i % 3) + 1)) * 6 + Math.cos((4 * Math.PI * x) / 512) * 3;
        ctx.lineTo(x, (baseY + wave) % 512);
      }
      ctx.lineTo(512, (baseY + 20) % 512);
      ctx.lineTo(0, (baseY + 20) % 512);
      ctx.closePath();
      ctx.fill();
    }

    // Тонкие белые гребешки пены из рваной бумаги
    ctx.fillStyle = 'rgba(246, 241, 228, 0.65)';
    for (let i = 0; i < 16; i += 2) {
      const baseY = i * 32;
      for (let x = 0; x <= 512; x += 20) {
        const wave = Math.sin((2 * Math.PI * x) / 512 * ((i % 3) + 1)) * 6;
        ctx.beginPath();
        ctx.arc(x, (baseY + wave) % 512, 3.5 + (x % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Бумажный растр (halftone dot pattern) для аутентичности коллажа
    ctx.fillStyle = 'rgba(28, 26, 34, 0.05)';
    for (let py = 0; py < 512; py += 8) {
      for (let px = 0; px < 512; px += 8) {
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.MirroredRepeatWrapping;
    tex.wrapT = THREE.MirroredRepeatWrapping;
    tex.repeat.set(2, 24);
    return tex;
  }

  // Создание бесшовной текстуры пены для разделителей (яркая белая пена с рваным краем)
  createFoamStripTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 128, 512);

    // Яркая кремово-белая полоса пены
    ctx.fillStyle = CFG.colors.foam; // #F6F1E4
    for (let y = 0; y < 512; y += 4) {
      const leftW = 16 + Math.sin(y * 0.08) * 8 + Math.cos(y * 0.22) * 5;
      const rightW = 112 - (Math.sin(y * 0.07) * 7 + Math.cos(y * 0.18) * 6);
      ctx.fillRect(leftW, y, rightW - leftW, 4);
    }

    // Бумажные кружки пены по краям
    ctx.fillStyle = CFG.colors.foam;
    for (let i = 0; i < 70; i++) {
      const cy = (i * 8) % 512;
      const cx = 28 + Math.sin(i * 1.5) * 36 + 36;
      const r = 3 + (i % 5);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Тонкий контур тушью для графичности бумаги
    ctx.strokeStyle = 'rgba(28, 26, 34, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = 0; y < 512; y += 8) {
      const leftX = 18 + Math.sin(y * 0.08) * 8;
      if (y === 0) ctx.moveTo(leftX, y);
      else ctx.lineTo(leftX, y);
    }
    ctx.stroke();

    ctx.beginPath();
    for (let y = 0; y < 512; y += 8) {
      const rightX = 110 - Math.sin(y * 0.07) * 7;
      if (y === 0) ctx.moveTo(rightX, y);
      else ctx.lineTo(rightX, y);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 16);
    return tex;
  }

  // Процедурная текстура ступенчатых волн: сплошная синяя заливка до низа (y = -0.5 под водой) с белым гребнем сверху
  createSteppedWavesTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 256);

    // Сплошная синяя заливка от y=60 до самого низа (256)
    ctx.fillStyle = CFG.colors.oceanMid;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(0, 60);
    for (let x = 0; x <= 512; x += 16) {
      const y = 60 + Math.sin(x * 0.02) * 16 + Math.cos(x * 0.05) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(512, 256);
    ctx.closePath();
    ctx.fill();

    // Гребень из белой рваной пены
    ctx.fillStyle = CFG.colors.foam;
    for (let x = 0; x <= 512; x += 10) {
      const y = 56 + Math.sin(x * 0.02) * 16 + Math.cos(x * 0.05) * 8;
      ctx.beginPath();
      ctx.arc(x, y, 9 + (x % 4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#FFFFFF';
    for (let x = 0; x <= 512; x += 14) {
      const y = 54 + Math.sin(x * 0.02) * 16 + Math.cos(x * 0.05) * 8;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Чернильный контур гребня
    ctx.strokeStyle = CFG.colors.ink;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 16) {
      const y = 52 + Math.sin(x * 0.02) * 16 + Math.cos(x * 0.05) * 8;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(4, 1);
    return tex;
  }

  // Процедурное облако из рваной бумаги (fog: false)
  createPaperCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 128);

    // Слои белых бумажных кругов
    ctx.fillStyle = '#FFFFFF';
    const puffs = [
      { x: 50, y: 75, r: 35 },
      { x: 95, y: 55, r: 45 },
      { x: 150, y: 50, r: 48 },
      { x: 200, y: 70, r: 38 },
      { x: 125, y: 80, r: 40 }
    ];

    puffs.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Белая вырубка и мягкая бумажная тень
    ctx.strokeStyle = 'rgba(28, 26, 34, 0.2)';
    ctx.lineWidth = 2;
    puffs.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
    });

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // Процедурное солнце из бумаги: яркий золотой круг с лучами и белой вырубкой (fog: false)
  createPaperSunTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 256);

    // Бумажные лучи
    ctx.fillStyle = 'rgba(255, 230, 140, 0.9)';
    for (let a = 0; a < 360; a += 45) {
      const rad = (a * Math.PI) / 180;
      const x1 = 128 + Math.cos(rad) * 95;
      const y1 = 128 + Math.sin(rad) * 95;
      const x2 = 128 + Math.cos(rad) * 122;
      const y2 = 128 + Math.sin(rad) * 122;
      ctx.beginPath();
      ctx.arc(x2, y2, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Белый вырубной контур 6px
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(128, 128, 96, 0, Math.PI * 2);
    ctx.fill();

    // Золотой диск солнца
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 90);
    grad.addColorStop(0, '#FFE875');
    grad.addColorStop(0.7, '#FFC93C');
    grad.addColorStop(1, '#FFA41B');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 128, 90, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // Процедурная бумажная скала: тёмно-синий силуэт --ocean-deep, белая обводка 6px, пена у основания
  createPaperRockTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 256);

    const pts = [
      [35, 240], [55, 160], [85, 80], [120, 35], [145, 40], [175, 95], [205, 170], [225, 240]
    ];

    // Белый вырубной контур 6px
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();

    // Тело скалы (--ocean-deep #0E3B6E)
    ctx.fillStyle = CFG.colors.oceanDeep;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + 6, pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] < 130 ? 6 : -6;
      ctx.lineTo(pts[i][0] + dx, pts[i][1] + (i === 3 || i === 4 ? 6 : 0));
    }
    ctx.closePath();
    ctx.fill();

    // Теневая правая грань (тушь)
    ctx.fillStyle = 'rgba(28, 26, 34, 0.45)';
    ctx.beginPath();
    ctx.moveTo(130, 42);
    ctx.lineTo(170, 95);
    ctx.lineTo(200, 170);
    ctx.lineTo(220, 240);
    ctx.lineTo(130, 240);
    ctx.closePath();
    ctx.fill();

    // Пена у основания
    ctx.fillStyle = CFG.colors.foam;
    for (let x = 25; x <= 235; x += 14) {
      ctx.beginPath();
      ctx.arc(x, 235, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // 1. Меш дальнего океана 600 × 400 м (y = -0.15, туман действует, цвет --ocean-deep)
  initFarOcean() {
    const geo = new THREE.PlaneGeometry(600, 400);
    geo.rotateX(-Math.PI * 0.5);

    const farTex = this.waveTexture.clone();
    farTex.wrapS = THREE.MirroredRepeatWrapping;
    farTex.wrapT = THREE.MirroredRepeatWrapping;
    farTex.repeat.set(60, 40);
    farTex.needsUpdate = true;
    this.farOceanTexture = farTex;

    const mat = new THREE.MeshBasicMaterial({
      map: farTex,
      color: CFG.threeColors.oceanDeep, // цвет --ocean-deep
      fog: true, // туман действует, растворяется в персиковом горизонте
      side: THREE.DoubleSide
    });

    this.farOceanMesh = new THREE.Mesh(geo, mat);
    this.farOceanMesh.position.set(0, -0.8, CFG.ocean.offsetZ + 110);
    this.scene.add(this.farOceanMesh);
  }

  // 1. Основное полотно воды 14 × 220 м
  initWaterPlane() {
    const W = CFG.ocean.width || 14;   // 14 м в игре, 30 м в песочнице
    const L = CFG.ocean.length || 220; // 220 м
    const centerX = CFG.ocean.waterCenterX || 0;
    // Шаг сетки <= 0.6 м (HANDOFF v3 §5)
    const segX = Math.max(28, Math.ceil(W / 0.5));
    const segZ = CFG.ocean.segZ || 140;

    const geo = new THREE.PlaneGeometry(W, L, segX, segZ);
    geo.rotateX(-Math.PI * 0.5);

    // Вершинные цвета:
    // у камеры (dist 0): --ocean-light #5CC8E8
    // к 60 м: --ocean-mid #1F78B4
    // к 150 м: --ocean-deep #0E3B6E
    const pos = geo.attributes.position;
    const count = pos.count;
    const colors = new Float32Array(count * 3);

    const cLight = new THREE.Color(CFG.threeColors.oceanLight);
    const cMid = new THREE.Color(CFG.threeColors.oceanMid);
    const cDeep = new THREE.Color(CFG.threeColors.oceanDeep);

    for (let i = 0; i < count; i++) {
      const localZ = pos.getZ(i); // от -110 до +110
      // Дистанция от игрока: z + 90
      const dist = localZ + 90.0;

      let col = new THREE.Color();
      if (dist <= 60.0) {
        const t = Math.max(0, dist / 60.0);
        col.copy(cLight).lerp(cMid, t);
      } else if (dist <= 150.0) {
        const t = (dist - 60.0) / 90.0;
        col.copy(cMid).lerp(cDeep, t);
      } else {
        col.copy(cDeep);
      }

      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Чистый базовый цвет 0xDDEFF5 для снижения контраста текстуры, с сохранением vertexColors
    const mat = new THREE.MeshBasicMaterial({
      map: this.waveTexture,
      vertexColors: true,
      color: 0xDDEFF5,
      side: THREE.DoubleSide
    });

    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.position.set(centerX, 0, CFG.ocean.offsetZ);
    this.scene.add(this.waterMesh);
  }

  // 2. Разделители полос на x = ±1.2 м (ширина 0.45 м)
  initLaneDividers() {
    this.dividers = [];
    if (CFG.ocean.showLaneDividers === false) return;
    const divWidth = CFG.lanes.dividerWidth; // 0.45 м
    const divLength = CFG.ocean.length;      // 220 м
    const segZ = CFG.ocean.segZ;             // 140

    const xs = CFG.lanes.dividerX; // [1.2, -1.2]

    xs.forEach((baseX) => {
      const geo = new THREE.PlaneGeometry(divWidth, divLength, 1, segZ);
      geo.rotateX(-Math.PI * 0.5);

      const origX = new Float32Array(geo.attributes.position.count);
      for (let i = 0; i < geo.attributes.position.count; i++) {
        origX[i] = geo.attributes.position.getX(i);
      }

      const mat = new THREE.MeshBasicMaterial({
        map: this.laneFoamTexture,
        color: 0xFFFFFF, // чистая белая пена без тонировки
        transparent: true,
        alphaTest: 0.15,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(baseX, 0.05, CFG.ocean.offsetZ);
      this.scene.add(mesh);

      this.dividers.push({
        mesh: mesh,
        baseX: baseX,
        geo: geo,
        origX: origX
      });
    });
  }

  // 3. Левая сторона экрана (+X): 3 сплошных слоя ступенчатых волн, уходящих под воду (y = -0.5)
  initLeftSideDecor() {
    this.leftSteps = [];
    if (CFG.ocean.showLeftSteps !== false) {
      const stepXs = CFG.ocean.sideStepsX; // [7, 9, 12] — слева на экране (+X)
      const stepHeights = [2.8, 4.2, 5.8]; // каждый следующий выше и дальше

      stepXs.forEach((x, idx) => {
        const H = stepHeights[idx];
        const geo = new THREE.PlaneGeometry(CFG.ocean.length, H);
        geo.rotateY(-Math.PI * 0.5); // развернуто лицом к дорожке (+X смотрит на дорожку)

        const mat = new THREE.MeshBasicMaterial({
          map: this.stepsTexture,
          transparent: true,
          alphaTest: 0.2,
          fog: false, // fog: false по ТЗ!
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geo, mat);
        // Низ слоя уходит под воду (y = -0.5): центр y = -0.5 + H * 0.5
        const centerY = -0.5 + H * 0.5;
        mesh.position.set(x, centerY, CFG.ocean.offsetZ);
        this.scene.add(mesh);

        this.leftSteps.push({
          mesh: mesh,
          baseX: x,
          baseY: centerY,
          parallax: CFG.ocean.sideStepsParallax[idx]
        });
      });
    }

    // Городок на скале слева на экране (+X) на x = +15
    const townGeo = new THREE.PlaneGeometry(36, 14);
    townGeo.rotateY(-Math.PI * 0.35);
    const townMat = new THREE.MeshBasicMaterial({
      map: this.townTexture,
      transparent: true,
      alphaTest: 0.3,
      fog: false,
      side: THREE.DoubleSide
    });
    this.townMesh = new THREE.Mesh(townGeo, townMat);
    this.townMesh.position.set(15, 8.5, 110);
    this.scene.add(this.townMesh);
  }

  // 4. Правая сторона экрана (-X): процедурные бумажные скалы с белой обводкой и пеной
  initRightSideDecor() {
    this.rocks = [];
    const rockPositions = [
      { x: -16, y: 3.2, zRel: 45, w: 14, h: 10 },
      { x: -24, y: 4.8, zRel: 105, w: 20, h: 14 },
      { x: -18, y: 3.8, zRel: 165, w: 16, h: 11 }
    ];

    rockPositions.forEach((rp) => {
      const geo = new THREE.PlaneGeometry(rp.w, rp.h);
      geo.rotateY(Math.PI * 0.3);
      const mat = new THREE.MeshBasicMaterial({
        map: this.rocksTexture,
        transparent: true,
        alphaTest: 0.2,
        fog: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(rp.x, rp.y, rp.zRel);
      this.scene.add(mesh);
      this.rocks.push({ mesh, x: rp.x, y: rp.y, zRel: rp.zRel });
    });
  }

  // 5. Горизонт: солнце (размер 30, y = 14, x = -10, низ диска касается горизонта) и облака
  initHorizon() {
    const sunGeo = new THREE.PlaneGeometry(CFG.ocean.sunSize, CFG.ocean.sunSize);
    const sunMat = new THREE.MeshBasicMaterial({
      map: this.sunTexture,
      transparent: true,
      alphaTest: 0.15,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.position.set(CFG.ocean.sunX, CFG.ocean.sunY, CFG.ocean.sunZOffset);
    this.scene.add(this.sunMesh);

    // 4 бумажных облака на горизонте (fog: false)
    this.clouds = [];
    const cloudConfigs = [
      { x: 18, y: 22, zRel: 190, w: 28, h: 12 },
      { x: -4, y: 26, zRel: 200, w: 34, h: 14 },
      { x: -22, y: 20, zRel: 185, w: 24, h: 11 },
      { x: 7, y: 24, zRel: 210, w: 22, h: 10 }
    ];

    cloudConfigs.forEach((c) => {
      const cGeo = new THREE.PlaneGeometry(c.w, c.h);
      const cMat = new THREE.MeshBasicMaterial({
        map: this.cloudTexture,
        transparent: true,
        alphaTest: 0.15,
        fog: false,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const cMesh = new THREE.Mesh(cGeo, cMat);
      cMesh.position.set(c.x, c.y, c.zRel);
      this.scene.add(cMesh);
      this.clouds.push({ mesh: cMesh, x: c.x, y: c.y, zRel: c.zRel });
    });
  }

  // Установка зоны поперечного крена волны (LEVEL1_SPEC §5.3, ocean.setTilt)
  setTilt(z0, z1, angle) {
    this.activeTilts.push({
      z0,
      z1,
      angle,
      tanAngle: Math.tan(angle)
    });
    if (this.activeTilts.length > 10) {
      this.activeTilts.shift();
    }
  }

  calcTiltH(x, z) {
    let totalTilt = 0;
    for (let i = 0; i < this.activeTilts.length; i++) {
      const t = this.activeTilts[i];
      if (z >= t.z0 && z <= t.z1) {
        const len = t.z1 - t.z0;
        const ramp = Math.min(18, len * 0.25);
        let weight = 1.0;
        if (z < t.z0 + ramp) {
          weight = Math.sin(((z - t.z0) / ramp) * Math.PI * 0.5);
        } else if (z > t.z1 - ramp) {
          weight = Math.cos(((z - (t.z1 - ramp)) / ramp) * Math.PI * 0.5);
        }
        totalTilt += t.tanAngle * x * weight;
      }
    }
    return totalTilt;
  }

  // Аналитическая формула волны (мягкая зыбь + поперечный крен больших волн)
  calcWaveH(x, z, t) {
    const w = CFG.ocean;
    const term1 = Math.sin((2 * Math.PI * (z + t * w.waveV)) / w.lambda1);
    const term2 = Math.sin((2 * Math.PI * (z * 0.37 - t * w.waveV * 0.6)) / w.lambda2 + x * 0.15);
    const baseH = w.waveA * term1 + w.waveB * term2;
    return baseH + this.calcTiltH(x, z);
  }

  // Аналитическая нормаль поверхности
  calcWaveNormal(x, z, t, targetNormal) {
    const w = CFG.ocean;
    const k1 = (2 * Math.PI) / w.lambda1;
    const k2 = (2 * Math.PI * 0.37) / w.lambda2;

    const cos1 = Math.cos((2 * Math.PI * (z + t * w.waveV)) / w.lambda1);
    const arg2 = (2 * Math.PI * (z * 0.37 - t * w.waveV * 0.6)) / w.lambda2 + x * 0.15;
    const cos2 = Math.cos(arg2);

    const dh_dx = w.waveB * 0.15 * cos2;
    const dh_dz = w.waveA * k1 * cos1 + w.waveB * k2 * cos2;

    targetNormal.set(-dh_dx, 1.0, -dh_dz).normalize();
    return targetNormal;
  }

  // getSurfaceInfo(x, z)
  getSurfaceInfo(x, z) {
    this.surfaceResult.height = this.calcWaveH(x, z, this.time);
    this.calcWaveNormal(x, z, this.time, this.surfaceNormal);
    this.surfaceResult.normal = this.surfaceNormal;
    this.surfaceResult.isInsideBarrel = false;
    return this.surfaceResult;
  }

  // Обновление каждый кадр
  update(dt, playerZ) {
    this.time += dt;

    // 0. Дальний океан: движется вместе с игроком, создавая ровную линию горизонта на всю ширину
    if (this.farOceanMesh) {
      this.farOceanMesh.position.z = playerZ + CFG.ocean.offsetZ + 110;
      this.farOceanTexture.offset.y = -(playerZ / 40.0) % 1;
    }

    // 1. Полотно воды (14 м дорожка поверх дальнего океана)
    this.waterMesh.position.z = playerZ + CFG.ocean.offsetZ;
    this.waveTexture.offset.y = -(playerZ / CFG.ocean.textureRepeatZ) % 1;

    const pos = this.waterMesh.geometry.attributes.position;
    const count = pos.count;
    const meshZ = this.waterMesh.position.z;

    for (let i = 0; i < count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const worldZ = vz + meshZ;
      const h = this.calcWaveH(vx, worldZ, this.time);
      pos.setY(i, h);
    }
    pos.needsUpdate = true;

    // 2. Разделители полос: сохраняют исходную ширину 0.45 м (d.origX) и динамически следуют за волной
    if (this.dividers && this.dividers.length > 0) {
      this.dividers.forEach((d) => {
        d.mesh.position.z = playerZ + CFG.ocean.offsetZ;
        const dPos = d.geo.attributes.position;
        const dCount = dPos.count;
        for (let i = 0; i < dCount; i++) {
          const vz = dPos.getZ(i);
          const worldZ = vz + d.mesh.position.z;
          const waveX = d.baseX + Math.sin(worldZ * 0.25 + this.time * 2.0) * CFG.ocean.dividerAmp;
          const surfaceH = this.calcWaveH(waveX, worldZ, this.time);

          dPos.setX(i, d.origX[i] + (waveX - d.baseX));
          dPos.setY(i, surfaceH + 0.05); // строго над поверхностью воды
        }
        dPos.needsUpdate = true;
      });
      this.laneFoamTexture.offset.y = -(playerZ / 30.0) % 1;
    }

    // 3. Левая сторона экрана (+X): ступеньки и городок
    if (this.leftSteps && this.leftSteps.length > 0) {
      this.leftSteps.forEach((s) => {
        s.mesh.position.z = playerZ + CFG.ocean.offsetZ * s.parallax;
      });
    }
    if (this.townMesh) {
      this.townMesh.position.z = playerZ + 110;
    }

    // 4. Правая сторона экрана (-X): скалы
    this.rocks.forEach((r) => {
      r.mesh.position.z = playerZ + r.zRel;
    });

    // 5. Солнце и облака на горизонте
    if (this.sunMesh) {
      this.sunMesh.position.z = playerZ + CFG.ocean.sunZOffset;
    }
    this.clouds.forEach((c) => {
      c.mesh.position.z = playerZ + c.zRel;
    });
  }
}

if (typeof window !== 'undefined') {
  window.OceanLanes = OceanLanes;
}
