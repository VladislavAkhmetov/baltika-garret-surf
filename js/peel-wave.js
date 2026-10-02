/**
 * Tony's Garret — Surf Rush
 * PeelingWave: Главный объект «Стена Волны» (§4 VERTICAL_SLICE_SPEC.md, LEVEL1_SPEC §2)
 * 
 * Особенности:
 * 1. Профиль стены: x = 5 -> 0м (подошва), x = 0 -> 1.4м, x = -3 -> 3.4м (крутой склон),
 *    губа x = -4.2 -> 3.9м с нависанием на 1.2м в сторону игрока (до 3.1м).
 * 2. Три бумажных слоя (коллаж, сдвиг 0.15м): --ocean-deep -> --ocean-mid -> --ocean-light
 *    (vertex colors по высоте) + рваная белая кромка пены по всей губе + брызги-наклейки.
 * 3. Вода тянется вверх: скролл текстуры по V вверх со скоростью 0.6 * speed.
 * 4. Точка ломки и пена: стена пены из 25 бумажных кругов-шаров (--foam с обводкой --ink),
 *    кипят ±10% на 6 Гц. При дистанции < 10м шары пены влетают в кадр снизу-слева; < 4м — накрыло.
 * 5. Выброс губы: участок 12м за 1.2с темнеет, дрожит, тень на воде; захлопывается вниз за 0.25с.
 * 6. Сёрфер на склоне: крен = slope, стоит выше по волне при приближении к карману.
 */

class PeelingWave {
  constructor(scene, ocean) {
    this.scene = scene;
    this.ocean = ocean;

    // Параметры профиля и зоны
    this.H = 3.9; // максимальная высота гребня (м)
    this.pocketWidth = (CFG && CFG.surf && CFG.surf.pocketWidth) || 4.0;

    // Состояние точки ломки
    this.peelZ = -15.0; // Z точки ломки волны (начинается позади игрока)
    this.peelDistance = 15.0; // текущая дистанция от игрока до пены
    this.nextThrowTimer = 6.0; // отсчет до следующего выброса губы
    this.activeThrow = null;   // активный выброс губы
    this.time = 0.0;
    this.camShakeBonus = 0.0;  // дрожание камеры от приближения пены

    // Коллбэки
    this.onWipeCallback = null;
    this.onCheckLipStrike = null;

    // Построение 3D-мешей волны
    this.initWaveLayers();
    this.initFoamWall();
    this.initLipThrowWarning();
    this.initSprayParticles();
  }

  // =========================================================================
  // 1. Единый аналитический профиль поверхности для физики и ригов
  // =========================================================================
  getSurface(x, z) {
    const worldX = -x; // строгое правило проекта: worldX = -x
    const oceanSurface = this.ocean ? this.ocean.getSurfaceInfo(worldX, z) : { height: 0, normal: new THREE.Vector3(0, 1, 0) };

    const cycleZ = ((z % 900) + 900) % 900;

    // Огибающая зоны волны (в срезе волна непрерывна либо активна в зоне кармана 0-300м / 330-900м)
    // Для универсальности: плавно нарастает от старта
    let waveEnvelope = 1.0;
    if (cycleZ < 25.0) {
      waveEnvelope = Math.max(0, cycleZ / 25.0);
    } else if (cycleZ > 275.0 && cycleZ <= 300.0) {
      waveEnvelope = Math.max(0, (300.0 - cycleZ) / 25.0);
    } else if (cycleZ > 300.0 && cycleZ < 330.0) {
      // Зона перехода в зыбь
      waveEnvelope = 0.0;
    }

    let waveHeight = 0.0;
    let waveSlope = 0.0;
    let inPocket = 0.0;
    let dh_dx = 0.0;

    if (waveEnvelope > 0) {
      // Профиль ТЗ:
      // x >= 5: 0м
      // x ∈ [0, 5]: плавный подъем от 0 до 1.4м
      // x ∈ [-3, 0]: крутая стена от 1.4м до 3.4м
      // x ∈ [-4.2, -3]: губа от 3.4м до 3.9м
      // x < -4.2: гребень / труба 3.9м
      if (x >= 5.0) {
        waveHeight = 0.0;
        dh_dx = 0.0;
      } else if (x >= 0.0) {
        // [0, 5] -> плавно вверх к 1.4м
        const u = (5.0 - x) / 5.0; // 0..1
        const s = u * u * (3.0 - 2.0 * u);
        waveHeight = 1.4 * s;
        const ds_du = 6.0 * u * (1.0 - u);
        dh_dx = 1.4 * ds_du * (-1.0 / 5.0);
      } else if (x >= -3.0) {
        // [-3, 0] -> крутой подъем от 1.4м до 3.4м
        const u = (-x) / 3.0; // 0..1
        const s = u * u * (3.0 - 2.0 * u);
        waveHeight = 1.4 + 2.0 * s;
        const ds_du = 6.0 * u * (1.0 - u);
        dh_dx = -2.0 * ds_du / 3.0;
      } else if (x >= -4.2) {
        // [-4.2, -3] -> гребень к 3.9м
        const u = (-x - 3.0) / 1.2; // 0..1
        const s = u * (2.0 - u);
        waveHeight = 3.4 + 0.5 * s;
        const ds_du = 2.0 - 2.0 * u;
        dh_dx = -0.5 * ds_du / 1.2;
      } else {
        waveHeight = 3.9;
        dh_dx = 0.0;
      }

      waveHeight *= waveEnvelope;
      dh_dx *= waveEnvelope;

      // Крен сёрфера: dh_dx отрицательный (высота растет влево к -X / +worldX)
      // Наклон в сторону кармана (положительный крен вправо по экрану)
      waveSlope = Math.atan2(-dh_dx, 1.0);

      // Карман: наивысший буст в диапазоне x ∈ [-1.5, 2.0]
      if (x > 4.5) {
        inPocket = 0.0;
      } else if (x >= 0.5) {
        inPocket = ((4.5 - x) / 4.0);
      } else if (x >= -2.0) {
        inPocket = 1.0;
      } else {
        inPocket = Math.max(0, 1.0 - (-2.0 - x) / 2.5);
      }
      inPocket *= waveEnvelope;
    }

    // 2. Зыбь зоны 300–550 м для накачки
    let swellHeight = 0.0;
    let swellDhDz = 0.0;

    if (cycleZ >= 300.0 && cycleZ <= 550.0) {
      const swellZ = cycleZ - 300.0;
      let swellEnvelope = 1.0;
      if (swellZ < 20.0) swellEnvelope = swellZ / 20.0;
      else if (swellZ > 230.0) swellEnvelope = (250.0 - swellZ) / 20.0;

      const wavePeriod = 65.0; // 4 гребня
      const phase = (swellZ / wavePeriod) * Math.PI * 2;
      const hBase = 1.2 * 0.5 * (1.0 + Math.sin(phase));
      swellHeight = hBase * swellEnvelope;

      const k = (Math.PI * 2) / wavePeriod;
      swellDhDz = 1.2 * 0.5 * Math.cos(phase) * k * swellEnvelope;
    }

    const totalHeight = oceanSurface.height + waveHeight + swellHeight;
    const totalSlope = waveSlope;

    return {
      height: totalHeight,
      slope: totalSlope,
      inPocket: inPocket,
      dhdz: swellDhDz,
      waveEnvelope: waveEnvelope
    };
  }

  // =========================================================================
  // 2. Генерация 3-слойного 3D-меша стены волны (§4 ТЗ)
  // =========================================================================
  initWaveLayers() {
    this.waveGroup = new THREE.Group();
    this.waveGroup.name = 'peelingWaveGroup';

    // 28 профильных точек вдоль оси X (worldX = -x)
    // Включая закручивающуюся нависающую губу на 1.2м в сторону игрока!
    this.profilePoints = [
      { wx: -6.0, y: 0.00 }, // 0: дно / гладь воды
      { wx: -5.0, y: 0.00 }, // 1: подошва волны (x = 5)
      { wx: -4.3, y: 0.12 }, // 2
      { wx: -3.6, y: 0.28 }, // 3
      { wx: -2.9, y: 0.50 }, // 4
      { wx: -2.2, y: 0.76 }, // 5
      { wx: -1.5, y: 1.02 }, // 6
      { wx: -0.7, y: 1.24 }, // 7
      { wx:  0.0, y: 1.40 }, // 8: карман у подошвы (x = 0)
      { wx:  0.4, y: 1.65 }, // 9
      { wx:  0.8, y: 1.95 }, // 10
      { wx:  1.2, y: 2.25 }, // 11
      { wx:  1.6, y: 2.55 }, // 12
      { wx:  2.0, y: 2.85 }, // 13
      { wx:  2.4, y: 3.12 }, // 14
      { wx:  2.7, y: 3.28 }, // 15
      { wx:  3.0, y: 3.40 }, // 16: крутой склон (x = -3)
      { wx:  3.3, y: 3.55 }, // 17
      { wx:  3.6, y: 3.70 }, // 18
      { wx:  3.9, y: 3.82 }, // 19
      { wx:  4.2, y: 3.90 }, // 20: пик губы (x = -4.2)
      // Нависающая часть губы (curl overhanging on 1.2m towards player)
      { wx:  4.05, y: 3.88 }, // 21
      { wx:  3.85, y: 3.80 }, // 22
      { wx:  3.60, y: 3.68 }, // 23
      { wx:  3.35, y: 3.48 }, // 24
      { wx:  3.15, y: 3.30 }, // 25
      { wx:  3.00, y: 3.10 }  // 26: завиток губы загибается вниз-вправо до 3.1м
    ];

    const numProfile = this.profilePoints.length; // 27 точек профиля
    const lengthZ = 280; // длина секции волны (м)
    const segZ = 70;
    const dz = lengthZ / segZ;

    // --- СЛОЙ 1: Главная стена волны (Main Wall Layer) ---
    const geo1 = new THREE.BufferGeometry();
    const pos1 = [];
    const uvs1 = [];
    const colors1 = [];
    const indices1 = [];

    const colDeep = new THREE.Color(CFG.threeColors.oceanDeep);   // #0E3B6E
    const colMid = new THREE.Color(CFG.threeColors.oceanMid);     // #1F78B4
    const colLight = new THREE.Color(CFG.threeColors.oceanLight); // #5CC8E8
    const colFoam = new THREE.Color(CFG.threeColors.foam);        // #F6F1E4

    for (let iz = 0; iz <= segZ; iz++) {
      const z = -lengthZ * 0.5 + iz * dz;
      const v = iz / segZ * 12.0; // UV v

      for (let ix = 0; ix < numProfile; ix++) {
        const p = this.profilePoints[ix];
        pos1.push(p.wx, p.y, z);

        const u = ix / (numProfile - 1);
        uvs1.push(u, v);

        // Цвета по высоте профиля (paper collage gradient)
        let c = new THREE.Color();
        if (p.y < 0.6) {
          c.copy(colDeep);
        } else if (p.y < 2.5) {
          const t = (p.y - 0.6) / 1.9;
          c.copy(colDeep).lerp(colMid, t);
        } else if (p.y < 3.6) {
          const t = (p.y - 2.5) / 1.1;
          c.copy(colMid).lerp(colLight, t);
        } else {
          const t = (p.y - 3.6) / 0.3;
          c.copy(colLight).lerp(colFoam, t);
        }
        colors1.push(c.r, c.g, c.b);
      }
    }

    // Индексы полигонов для полосы
    for (let iz = 0; iz < segZ; iz++) {
      for (let ix = 0; ix < numProfile - 1; ix++) {
        const a = iz * numProfile + ix;
        const b = (iz + 1) * numProfile + ix;
        const c = (iz + 1) * numProfile + (ix + 1);
        const d = iz * numProfile + (ix + 1);

        indices1.push(a, b, d);
        indices1.push(b, c, d);
      }
    }

    geo1.setAttribute('position', new THREE.Float32BufferAttribute(pos1, 3));
    geo1.setAttribute('uv', new THREE.Float32BufferAttribute(uvs1, 2));
    geo1.setAttribute('color', new THREE.Float32BufferAttribute(colors1, 3));
    geo1.setIndex(indices1);
    geo1.computeVertexNormals();

    // Создаем процедурную бесшовную бумажную текстуру с диагональным растром
    this.waveTexture = this.createPaperWaveTexture();
    this.waveTexture.wrapS = THREE.RepeatWrapping;
    this.waveTexture.wrapT = THREE.RepeatWrapping;
    this.waveTexture.repeat.set(1, 10);

    const mat1 = new THREE.MeshBasicMaterial({
      map: this.waveTexture,
      vertexColors: true,
      side: THREE.DoubleSide
    });

    this.mainWallMesh = new THREE.Mesh(geo1, mat1);
    this.waveGroup.add(this.mainWallMesh);

    // --- СЛОЙ 2: Средний бумажный слой (Middle Collage Step, сдвиг 0.15м) ---
    // Покрывает среднюю и верхнюю часть склона (ix = 8..26)
    const geo2 = new THREE.BufferGeometry();
    const pos2 = [];
    const colors2 = [];
    const indices2 = [];
    const stepStartIx = 8;
    const numStep = numProfile - stepStartIx;

    for (let iz = 0; iz <= segZ; iz++) {
      const z = -lengthZ * 0.5 + iz * dz;

      for (let ix = stepStartIx; ix < numProfile; ix++) {
        const p = this.profilePoints[ix];
        // Сдвиг на 0.15м вперед по Z и чуть перпендикулярно для видимого бумажного выреза
        pos2.push(p.wx + 0.05, p.y + 0.05, z + 0.15);

        let c = new THREE.Color().copy(colMid).lerp(colLight, (p.y - 1.4) / 2.5);
        colors2.push(c.r, c.g, c.b);
      }
    }

    for (let iz = 0; iz < segZ; iz++) {
      for (let ix = 0; ix < numStep - 1; ix++) {
        const a = iz * numStep + ix;
        const b = (iz + 1) * numStep + ix;
        const c = (iz + 1) * numStep + (ix + 1);
        const d = iz * numStep + (ix + 1);

        indices2.push(a, b, d);
        indices2.push(b, c, d);
      }
    }

    geo2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
    geo2.setAttribute('color', new THREE.Float32BufferAttribute(colors2, 3));
    geo2.setIndex(indices2);

    const mat2 = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.90
    });

    this.stepLayerMesh = new THREE.Mesh(geo2, mat2);
    this.waveGroup.add(this.stepLayerMesh);

    // --- СЛОЙ 3: Рваная кромка белой пены по всей длине гребня (Lip Foam Strip) ---
    this.initLipFoamStrip(lengthZ, segZ);

    this.scene.add(this.waveGroup);
  }

  // Рваная белая бумажная кромка пены по вершине губы
  initLipFoamStrip(lengthZ, segZ) {
    const geo = new THREE.PlaneGeometry(1.4, lengthZ, 4, segZ);
    geo.rotateX(-Math.PI * 0.5);

    // Рисуем зубчатый бумажный контур кромки
    const foamCanvas = document.createElement('canvas');
    foamCanvas.width = 128;
    foamCanvas.height = 256;
    const ctx = foamCanvas.getContext('2d');

    ctx.fillStyle = '#F6F1E4'; // --foam
    ctx.fillRect(0, 0, 128, 256);

    // Черный контур тушью по внешнему краю
    ctx.fillStyle = '#1C1A22';
    ctx.fillRect(0, 0, 6, 256);
    ctx.fillRect(122, 0, 6, 256);

    // Бумажные рваные зубчики
    ctx.fillStyle = 'rgba(28, 26, 34, 0.15)';
    for (let y = 0; y < 256; y += 16) {
      ctx.beginPath();
      ctx.arc(64, y + 8, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    const foamTex = new THREE.CanvasTexture(foamCanvas);
    foamTex.wrapS = THREE.RepeatWrapping;
    foamTex.wrapT = THREE.RepeatWrapping;
    foamTex.repeat.set(1, 16);

    const mat = new THREE.MeshBasicMaterial({
      map: foamTex,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.2
    });

    this.lipFoamMesh = new THREE.Mesh(geo, mat);
    // Располагаем прямо на перегибе завитка губы
    this.lipFoamMesh.position.set(3.7, 3.85, 0);
    this.waveGroup.add(this.lipFoamMesh);
  }

  // Процедурная текстура бумаги с полутоновым растром
  createPaperWaveTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Базовый цвет бумаги
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 256, 256);

    // Вертикальные бумажные волокна / волнистые линии течения воды
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let x = 0; x < 256; x += 8) {
      ctx.fillRect(x, 0, 3, 256);
    }

    // Полутоновый растр точками
    ctx.fillStyle = 'rgba(28, 26, 34, 0.08)';
    for (let x = 0; x < 256; x += 12) {
      for (let y = 0; y < 256; y += 12) {
        ctx.beginPath();
        ctx.arc(x + (y % 24 === 0 ? 6 : 0), y, 2.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return new THREE.CanvasTexture(canvas);
  }

  // =========================================================================
  // 3. Стена пены позади точки ломки (25 кипящих бумажных шаров)
  // =========================================================================
  initFoamWall() {
    this.foamBallGroup = new THREE.Group();
    this.foamBallGroup.name = 'foamWallBalls';
    this.foamBalls = [];

    // Создаем процедурную текстуру бумажного шара пены с черной обводкой тушью
    const ballCanvas = document.createElement('canvas');
    ballCanvas.width = 128;
    ballCanvas.height = 128;
    const bCtx = ballCanvas.getContext('2d');

    bCtx.fillStyle = '#F6F1E4'; // --foam
    bCtx.beginPath();
    bCtx.arc(64, 64, 56, 0, Math.PI * 2);
    bCtx.fill();

    bCtx.strokeStyle = '#1C1A22'; // --ink
    bCtx.lineWidth = 6;
    bCtx.stroke();

    // Внутренние пузырьковые детали
    bCtx.strokeStyle = 'rgba(28, 26, 34, 0.25)';
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.arc(52, 52, 22, 0, Math.PI * 2);
    bCtx.stroke();

    const ballTex = new THREE.CanvasTexture(ballCanvas);
    const ballGeo = new THREE.PlaneGeometry(1.6, 1.6);
    const ballMat = new THREE.MeshBasicMaterial({
      map: ballTex,
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide
    });

    // 25 бумажных шаров в хаотичном пенном гребне позади peelZ
    for (let i = 0; i < 25; i++) {
      const mesh = new THREE.Mesh(ballGeo, ballMat);
      const relX = 2.0 + Math.random() * 2.8;   // в зоне гребня губы
      const relY = 1.8 + Math.random() * 2.3;   // на высоте от 1.8м до 4.1м
      const relZ = -(Math.random() * 12.0);     // позади точки ломки

      mesh.position.set(relX, relY, relZ);
      mesh.scale.setScalar(0.7 + Math.random() * 0.6);

      this.foamBalls.push({
        mesh: mesh,
        baseX: relX,
        baseY: relY,
        offsetZ: relZ,
        phase: Math.random() * Math.PI * 2,
        speed: 4.0 + Math.random() * 4.0,
        baseScale: mesh.scale.x
      });

      this.foamBallGroup.add(mesh);
    }

    this.scene.add(this.foamBallGroup);
  }

  // =========================================================================
  // 4. Брызги-наклейки, срывающиеся с губы назад
  // =========================================================================
  initSprayParticles() {
    this.sprayParticles = [];
    const sprayGroup = new THREE.Group();
    sprayGroup.name = 'lipSprayParticles';

    const sprayCanvas = document.createElement('canvas');
    sprayCanvas.width = 64;
    sprayCanvas.height = 64;
    const sCtx = sprayCanvas.getContext('2d');
    sCtx.fillStyle = '#FFFFFF';
    sCtx.beginPath();
    sCtx.arc(32, 32, 26, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.strokeStyle = '#1C1A22';
    sCtx.lineWidth = 4;
    sCtx.stroke();

    const sprayTex = new THREE.CanvasTexture(sprayCanvas);
    const sprayGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const sprayMat = new THREE.MeshBasicMaterial({
      map: sprayTex,
      transparent: true,
      alphaTest: 0.2
    });

    for (let i = 0; i < 35; i++) {
      const mesh = new THREE.Mesh(sprayGeo, sprayMat);
      mesh.visible = false;
      sprayGroup.add(mesh);

      this.sprayParticles.push({
        mesh: mesh,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1.0
      });
    }

    this.sprayGroup = sprayGroup;
    this.scene.add(sprayGroup);
  }

  // =========================================================================
  // 5. Выброс губы: предупреждение и захлопывание (§4 ТЗ)
  // =========================================================================
  initLipThrowWarning() {
    // Темная тень на воде в зоне выброса (12м длины, x < 1)
    const geo = new THREE.PlaneGeometry(3.5, 12.0);
    geo.rotateX(-Math.PI * 0.5);

    const mat = new THREE.MeshBasicMaterial({
      color: 0x1C1A22, // --ink
      transparent: true,
      opacity: 0.40,
      side: THREE.DoubleSide
    });

    this.throwShadowMesh = new THREE.Mesh(geo, mat);
    this.throwShadowMesh.position.set(-0.5, 0.05, 0);
    this.throwShadowMesh.visible = false;
    this.scene.add(this.throwShadowMesh);

    // Захлопывающийся сегмент губы (падающий бумажный козырек)
    const lipFlapGeo = new THREE.PlaneGeometry(2.5, 12.0);
    lipFlapGeo.rotateX(-Math.PI * 0.5);
    const lipFlapMat = new THREE.MeshBasicMaterial({
      color: 0x0E3B6E, // темнеет перед падением
      side: THREE.DoubleSide
    });

    this.lipFlapMesh = new THREE.Mesh(lipFlapGeo, lipFlapMat);
    this.lipFlapMesh.position.set(3.0, 3.8, 0);
    this.lipFlapMesh.visible = false;
    this.scene.add(this.lipFlapMesh);
  }

  // =========================================================================
  // 6. Главный покадровый цикл обновления (§4 ТЗ)
  // =========================================================================
  update(dt, playerZ, playerSpeed) {
    this.time += dt;

    // 1. Позиционирование меша стены волны вдоль хода игрока
    if (this.waveGroup) {
      this.waveGroup.position.z = playerZ;
    }

    // 2. Вода тянется вверх: скролл текстуры по V вверх со скоростью 0.6 * speed (§4 ТЗ)
    if (this.waveTexture) {
      this.waveTexture.offset.y += 0.6 * playerSpeed * dt * 0.035;
      this.waveTexture.needsUpdate = true;
    }

    // 3. Движение точки ломки волны peelZ
    const peelSpeedFactor = (CFG && CFG.surf && CFG.surf.peelSpeed) || 0.98;
    const peelSpeed = playerSpeed * peelSpeedFactor;
    this.peelZ += peelSpeed * dt;

    // Подтягиваем точку ломки, если слишком отстала или ушла вперед
    const distToPlayer = playerZ - this.peelZ;
    this.peelDistance = distToPlayer;

    if (distToPlayer > 45.0) {
      this.peelZ = playerZ - 20.0;
    } else if (distToPlayer < -5.0) {
      this.peelZ = playerZ - 12.0;
    }

    // 4. Обновление стены кипящей пены позади точки ломки
    if (this.foamBallGroup) {
      this.foamBallGroup.position.z = this.peelZ;

      const boilScale = 1.0 + Math.sin(this.time * 6.0 * Math.PI * 2) * 0.10; // кипение ±10% на 6 Гц
      this.foamBalls.forEach((b) => {
        const wobble = Math.sin(this.time * b.speed + b.phase) * 0.25;
        b.mesh.position.set(b.baseX + wobble, b.baseY + wobble * 0.5, b.offsetZ);
        b.mesh.scale.setScalar(b.baseScale * boilScale);
      });
    }

    // 5. Приближение пены (< 10м): брызги влетают в экран, тряска; < 4м — накрыло!
    if (distToPlayer < 10.0) {
      this.camShakeBonus = (10.0 - distToPlayer) * 0.035;

      // Выбрасываем частицы пены мимо камеры
      this.emitFoamSpray(playerZ, 2);

      if (distToPlayer < 4.0) {
        if (this.onWipeCallback) {
          this.onWipeCallback('Накрыло пеной!');
        }
      }
    } else {
      this.camShakeBonus = 0.0;
    }

    // 6. Брызги, срывающиеся с губы назад
    if (Math.random() < 0.4) {
      this.emitLipSpray(playerZ);
    }
    this.updateSprayParticles(dt);

    // 7. Периодический выброс губы (каждые 6–10 с)
    this.updateLipThrow(dt, playerZ);
  }

  // Генерация брызг с вершины губы назад
  emitLipSpray(playerZ) {
    const free = this.sprayParticles.find((p) => p.life <= 0);
    if (!free) return;

    free.x = 3.5 + Math.random() * 0.8;
    free.y = 3.8 + Math.random() * 0.4;
    free.z = playerZ + 5.0 + Math.random() * 15.0;

    free.vx = -1.5 - Math.random() * 2.0;
    free.vy = 0.5 + Math.random() * 1.5;
    free.vz = -10.0 - Math.random() * 15.0; // летят назад

    free.life = 0.7;
    free.maxLife = 0.7;
    free.mesh.visible = true;
    free.mesh.position.set(free.x, free.y, free.z);
  }

  // Выброс пены в кадр при близкой стене пены (< 10м)
  emitFoamSpray(playerZ, count = 2) {
    for (let c = 0; c < count; c++) {
      const free = this.sprayParticles.find((p) => p.life <= 0);
      if (!free) return;

      free.x = 1.0 + Math.random() * 2.5;
      free.y = 0.3 + Math.random() * 2.2;
      free.z = playerZ - 3.5 + Math.random() * 3.0;

      free.vx = -1.5 - Math.random() * 2.5;
      free.vy = 2.5 + Math.random() * 3.5;
      free.vz = 14.0 + Math.random() * 10.0; // летят вперед мимо камеры

      free.life = 0.7;
      free.maxLife = 0.7;
      free.mesh.visible = true;
      free.mesh.position.set(free.x, free.y, free.z);
    }
  }

  updateSprayParticles(dt) {
    this.sprayParticles.forEach((p) => {
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 9.8 * dt; // гравитация

        p.mesh.position.set(p.x, p.y, p.z);
        const alpha = Math.max(0, p.life / p.maxLife);
        p.mesh.scale.setScalar(alpha * 1.2);

        if (p.life <= 0) {
          p.mesh.visible = false;
        }
      }
    });
  }

  // Обновление выброса губы
  updateLipThrow(dt, playerZ) {
    this.nextThrowTimer -= dt;

    if (this.nextThrowTimer <= 0 && !this.activeThrow) {
      this.nextThrowTimer = 7.0 + Math.random() * 3.0; // каждые 7-10 с
      const throwLen = 12.0;

      this.activeThrow = {
        zStart: playerZ + 20.0,
        zEnd: playerZ + 20.0 + throwLen,
        timer: 1.45, // 1.2с предупреждение + 0.25с падение
        totalDur: 1.45
      };
    }

    if (this.activeThrow) {
      this.activeThrow.timer -= dt;
      const t = this.activeThrow.timer;
      const midZ = (this.activeThrow.zStart + this.activeThrow.zEnd) * 0.5;

      if (t > 0.25) {
        // Фаза предупреждения (1.2 с):
        // Губа темнеет и дрожит, на воде растет черная тень
        const warnProgress = Math.min(1.0, (1.45 - t) / 1.2);

        if (this.throwShadowMesh) {
          this.throwShadowMesh.visible = true;
          this.throwShadowMesh.position.set(0.2, 0.05, midZ);
          this.throwShadowMesh.scale.set(1.0 + warnProgress * 0.4, 1.0, 1.0);
        }

        if (this.lipFlapMesh) {
          this.lipFlapMesh.visible = true;
          // Дрожание на 25 Гц
          const quiver = Math.sin(this.time * 25.0 * Math.PI * 2) * 0.12;
          this.lipFlapMesh.position.set(3.2 + quiver, 3.8 + quiver, midZ);
          this.lipFlapMesh.rotation.z = 0;
        }
      } else if (t > 0.0) {
        // Фаза захлопывания (0.25 с):
        // Губа захлопывается вниз (поворот за 0.25 с) + брызги
        const collapseT = (0.25 - t) / 0.25; // 0..1

        if (this.throwShadowMesh) this.throwShadowMesh.visible = false;

        if (this.lipFlapMesh) {
          this.lipFlapMesh.visible = true;
          this.lipFlapMesh.rotation.z = collapseT * Math.PI * 0.45;
          this.lipFlapMesh.position.y = 3.8 - collapseT * 2.8;
        }

        // Всплеск пены в зоне падения
        this.emitFoamSpray(midZ, 3);

        // Проверка удара по сёрферу в опасной зоне x < 1
        if (playerZ >= this.activeThrow.zStart && playerZ <= this.activeThrow.zEnd) {
          if (this.onCheckLipStrike) {
            this.onCheckLipStrike(this.activeThrow);
          }
        }
      } else {
        // Завершение
        this.activeThrow = null;
        if (this.throwShadowMesh) this.throwShadowMesh.visible = false;
        if (this.lipFlapMesh) this.lipFlapMesh.visible = false;
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.PeelingWave = PeelingWave;
}
