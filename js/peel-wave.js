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
    this.H = 6.0; // максимальная высота гребня (м) — ТЗ ревью п. 1
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
    let waveEnvelope = 1.0;
    if (cycleZ < 25.0) {
      waveEnvelope = Math.max(0, cycleZ / 25.0);
    } else if (cycleZ > 275.0 && cycleZ <= 300.0) {
      waveEnvelope = Math.max(0, (300.0 - cycleZ) / 25.0);
    } else if (cycleZ > 300.0 && cycleZ < 330.0) {
      waveEnvelope = 0.0;
    }

    let waveHeight = 0.0;
    let waveSlope = 0.0;
    let inPocket = 0.0;
    let dh_dx = 0.0;

    if (waveEnvelope > 0) {
      // Профиль ТЗ (масштаб высоты x1.6, губа на 6.2 м, нависание 1.6 м):
      // x >= 5: 0м
      // x ∈ [0, 5]: плавный подъем от 0 до 2.24м
      // x ∈ [-3, 0]: крутая стена от 2.24м до 5.44м
      // x ∈ [-4.2, -3]: гребень / губа от 5.44м до 6.20м
      // x < -4.2: гребень 6.20м
      if (x >= 5.0) {
        waveHeight = 0.0;
        dh_dx = 0.0;
      } else if (x >= 0.0) {
        // [0, 5] -> плавно вверх к 2.24м
        const u = (5.0 - x) / 5.0; // 0..1
        const s = u * u * (3.0 - 2.0 * u);
        waveHeight = 2.24 * s;
        const ds_du = 6.0 * u * (1.0 - u);
        dh_dx = 2.24 * ds_du * (-1.0 / 5.0);
      } else if (x >= -3.0) {
        // [-3, 0] -> крутой подъем от 2.24м до 5.44м
        const u = (-x) / 3.0; // 0..1
        const s = u * u * (3.0 - 2.0 * u);
        waveHeight = 2.24 + 3.20 * s;
        const ds_du = 6.0 * u * (1.0 - u);
        dh_dx = -3.20 * ds_du / 3.0;
      } else if (x >= -4.2) {
        // [-4.2, -3] -> гребень к 6.20м
        const u = (-x - 3.0) / 1.2; // 0..1
        const s = u * (2.0 - u);
        waveHeight = 5.44 + 0.76 * s;
        const ds_du = 2.0 - 2.0 * u;
        dh_dx = -0.76 * ds_du / 1.2;
      } else {
        waveHeight = 6.20;
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

    // 27 профильных точек вдоль оси X (worldX = -x)
    // Включая закручивающуюся нависающую губу на 1.6м в сторону игрока (H = 6.2м)!
    this.profilePoints = [
      { wx: -6.0, y: 0.00 }, // 0: дно / гладь воды
      { wx: -5.0, y: 0.00 }, // 1: подошва волны (x = 5)
      { wx: -4.3, y: 0.19 }, // 2
      { wx: -3.6, y: 0.45 }, // 3
      { wx: -2.9, y: 0.80 }, // 4
      { wx: -2.2, y: 1.22 }, // 5
      { wx: -1.5, y: 1.63 }, // 6
      { wx: -0.7, y: 1.98 }, // 7
      { wx:  0.0, y: 2.24 }, // 8: карман у подошвы (x = 0)
      { wx:  0.4, y: 2.64 }, // 9
      { wx:  0.8, y: 3.12 }, // 10
      { wx:  1.2, y: 3.60 }, // 11
      { wx:  1.6, y: 4.08 }, // 12
      { wx:  2.0, y: 4.56 }, // 13
      { wx:  2.4, y: 4.99 }, // 14
      { wx:  2.7, y: 5.25 }, // 15
      { wx:  3.0, y: 5.44 }, // 16: крутой склон (x = -3)
      { wx:  3.3, y: 5.68 }, // 17
      { wx:  3.6, y: 5.92 }, // 18
      { wx:  3.9, y: 6.11 }, // 19
      { wx:  4.2, y: 6.20 }, // 20: пик губы на 6.2 м (x = -4.2)
      // Нависающая часть губы на 1.6м в сторону игрока (overhang 1.6m towards player, до wx = 2.6)
      { wx:  4.05, y: 6.18 }, // 21
      { wx:  3.80, y: 6.10 }, // 22
      { wx:  3.50, y: 5.92 }, // 23
      { wx:  3.20, y: 5.60 }, // 24
      { wx:  2.90, y: 5.20 }, // 25
      { wx:  2.60, y: 4.75 }  // 26: завиток губы загибается вниз-вправо с нависанием 1.6м
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
      const u = (iz / segZ) * 8.0; // UV u вдоль Z (8 широких живописных мазков на 280 м)

      for (let ix = 0; ix < numProfile; ix++) {
        const p = this.profilePoints[ix];
        pos1.push(p.wx, p.y, z);

        const v = ix / (numProfile - 1); // UV v вдоль склона (от подошвы 0 к гребню 1)
        uvs1.push(u, v);

        // Цвета по высоте профиля (ТЗ ревью п. 1):
        // подошва: --ocean-light #5CC8E8
        // середина: --ocean-mid #1F78B4
        // под губой: --ocean-deep #0E3B6E
        // губа (верхние 0.6м): --foam #F6F1E4
        let c = new THREE.Color();
        if (p.y <= 2.2) {
          c.copy(colLight);
        } else if (p.y <= 4.2) {
          const t = (p.y - 2.2) / 2.0;
          c.copy(colLight).lerp(colMid, t);
        } else if (p.y <= 5.6) {
          const t = (p.y - 4.2) / 1.4;
          c.copy(colMid).lerp(colDeep, t);
        } else {
          const t = Math.min(1.0, (p.y - 5.6) / 0.6);
          c.copy(colDeep).lerp(colFoam, t);
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
    this.waveTexture.repeat.set(1, 1);

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

        let c = new THREE.Color();
        if (p.y <= 4.2) {
          c.copy(colLight).lerp(colMid, Math.max(0, (p.y - 2.2) / 2.0));
        } else if (p.y <= 5.6) {
          c.copy(colMid).lerp(colDeep, (p.y - 4.2) / 1.4);
        } else {
          c.copy(colDeep).lerp(colFoam, Math.min(1.0, (p.y - 5.6) / 0.6));
        }
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

    // --- СЛОЙ 3: Рваная кромка белой пены по всей длине гребня (Lip Foam Strip) шириной 0.6 м ---
    this.initLipFoamStrip(lengthZ, segZ);

    this.scene.add(this.waveGroup);
  }

  // Рваная белая бумажная кромка пены шириной 0.6 м по вершине губы (ТЗ ревью п. 1)
  initLipFoamStrip(lengthZ, segZ) {
    const geo = new THREE.PlaneGeometry(0.6, lengthZ, 4, segZ);
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
    ctx.fillRect(0, 0, 8, 256);
    ctx.fillRect(120, 0, 8, 256);

    // Бумажные рваные зубчики
    ctx.fillStyle = 'rgba(28, 26, 34, 0.20)';
    for (let y = 0; y < 256; y += 16) {
      ctx.beginPath();
      ctx.arc(64, y + 8, 14, 0, Math.PI * 2);
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
    // Располагаем прямо на вершине губы на высоте 6.18м
    this.lipFoamMesh.position.set(3.8, 6.18, 0);
    this.lipFoamMesh.rotation.z = -0.15;
    this.waveGroup.add(this.lipFoamMesh);
  }

  // Процедурная текстура бумаги с контрастными вертикальными мазками воды (ТЗ ревью п. 1)
  createPaperWaveTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Базовый цвет светлой бумаги
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 256, 256);

    // Контрастные живописные полосы-мазки течения воды вверх по склону (§4 ТЗ, п. 1 ревью)
    // Шаг 32px дает 8 выразительных широких полос на повтор
    for (let x = 0; x < 256; x += 32) {
      // Тёмный океанический мазок глубокой воды
      ctx.fillStyle = 'rgba(14, 59, 110, 0.90)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 10, 0);
      ctx.lineTo(x + 13, 256);
      ctx.lineTo(x + 3, 256);
      ctx.fill();

      // Яркий контрастный мазок белой пены
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.moveTo(x + 12, 0);
      ctx.lineTo(x + 22, 0);
      ctx.lineTo(x + 25, 256);
      ctx.lineTo(x + 15, 256);
      ctx.fill();

      // Тонкий контур тушью с рваным бумажным краем
      ctx.strokeStyle = 'rgba(28, 26, 34, 0.55)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(x + 11, 0);
      ctx.lineTo(x + 14, 256);
      ctx.stroke();

      // Мазок морской лазури
      ctx.fillStyle = 'rgba(92, 200, 232, 0.75)';
      ctx.beginPath();
      ctx.moveTo(x + 23, 0);
      ctx.lineTo(x + 29, 0);
      ctx.lineTo(x + 31, 256);
      ctx.lineTo(x + 25, 256);
      ctx.fill();
    }

    // Бумажный полутоновый растр
    ctx.fillStyle = 'rgba(28, 26, 34, 0.15)';
    for (let x = 0; x < 256; x += 12) {
      for (let y = 0; y < 256; y += 12) {
        ctx.beginPath();
        ctx.arc(x + (y % 24 === 0 ? 6 : 0), y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return new THREE.CanvasTexture(canvas);
  }

  // =========================================================================
  // 3. Стена пены позади точки ломки (30 кипящих бумажных шаров, п. 1 и §4 ТЗ)
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
    const ballGeo = new THREE.PlaneGeometry(1.8, 1.8);
    const ballMat = new THREE.MeshBasicMaterial({
      map: ballTex,
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide
    });

    // 30 бумажных шаров:
    // 16 шаров в пенном гребне позади peelZ (H до 6.2м)
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(ballGeo, ballMat);
      const relX = 1.2 + Math.random() * 3.2;   // в зоне гребня губы
      const relY = 1.5 + Math.random() * 4.5;   // на высоте от 1.5м до 6.0м
      const relZ = -(Math.random() * 12.0);     // позади точки ломки

      mesh.position.set(relX, relY, relZ);
      mesh.scale.setScalar(0.9 + Math.random() * 0.7);

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

    // 14 шаров, накатывающих вперед перед точкой ломки (влетают в кадр снизу-слева при < 10м)
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(ballGeo, ballMat);
      const relX = -0.2 + Math.random() * 2.8;  // карман и переход к плечу
      const relY = 0.4 + Math.random() * 2.8;   // нижняя и средняя часть волны
      const relZ = 1.0 + Math.random() * 6.5;   // выкатываются вперед на 1..7.5м перед peelZ!

      mesh.position.set(relX, relY, relZ);
      mesh.scale.setScalar(1.0 + Math.random() * 0.8);

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
    const sprayGeo = new THREE.PlaneGeometry(0.65, 0.65);
    const sprayMat = new THREE.MeshBasicMaterial({
      map: sprayTex,
      transparent: true,
      alphaTest: 0.2
    });

    for (let i = 0; i < 45; i++) {
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
  // 5. Выброс губы: предупреждение и захлопывание (§4 ТЗ, п. 1 ревью)
  // =========================================================================
  initLipThrowWarning() {
    // 1. Темная тень на воде в зоне выброса (14м длины, x < 1.5)
    const shadowGeo = new THREE.PlaneGeometry(4.2, 14.0);
    shadowGeo.rotateX(-Math.PI * 0.5);

    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x1C1A22, // --ink
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });

    this.throwShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.throwShadowMesh.position.set(1.2, 0.05, 0);
    this.throwShadowMesh.visible = false;
    this.scene.add(this.throwShadowMesh);

    // 2. Реальный 3D загибающийся слой губы волны (Arched Lip Mesh 14м длины)
    // Строится как 3D изогнутая бумажная лента с градиентом от глубокого океана к пене
    const lipArchGeo = this.createCurledLipGeometry();
    const lipArchMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });

    this.lipFlapMesh = new THREE.Mesh(lipArchGeo, lipArchMat);
    this.lipFlapMesh.position.set(0, 0, 0);
    this.lipFlapMesh.visible = false;
    this.scene.add(this.lipFlapMesh);

    // 3. Большой всплеск пены при ударе губы по воде (Foam Splash on impact)
    const splashGeo = new THREE.PlaneGeometry(6.5, 14.0);
    splashGeo.rotateX(-Math.PI * 0.5);
    const splashCanvas = document.createElement('canvas');
    splashCanvas.width = 256;
    splashCanvas.height = 256;
    const spCtx = splashCanvas.getContext('2d');
    spCtx.fillStyle = '#FFFFFF'; // яркая белая бумага пены
    spCtx.beginPath();
    spCtx.ellipse(128, 128, 124, 108, 0, 0, Math.PI * 2);
    spCtx.fill();
    spCtx.strokeStyle = '#1C1A22';
    spCtx.lineWidth = 10;
    spCtx.stroke();
    // Бумажные пенные кружки в месте удара
    spCtx.fillStyle = '#F6F1E4';
    for (let i = 0; i < 22; i++) {
      spCtx.beginPath();
      spCtx.arc(32 + (i * 29) % 192, 32 + (i * 37) % 192, 18 + (i % 6) * 4, 0, Math.PI * 2);
      spCtx.fill();
      spCtx.strokeStyle = '#1C1A22';
      spCtx.lineWidth = 4;
      spCtx.stroke();
    }
    const splashTex = new THREE.CanvasTexture(splashCanvas);
    const splashMat = new THREE.MeshBasicMaterial({
      map: splashTex,
      transparent: true,
      side: THREE.DoubleSide,
      alphaTest: 0.15
    });
    this.impactSplashMesh = new THREE.Mesh(splashGeo, splashMat);
    this.impactSplashMesh.position.set(0.8, 0.20, 0);
    this.impactSplashMesh.visible = false;
    this.scene.add(this.impactSplashMesh);
  }

  // Генерация 3D сетки изгибающейся арки губы (п. 1 ревью)
  createCurledLipGeometry() {
    const numT = 14;
    const numZ = 12;
    const lengthZ = 14.0;
    const dz = lengthZ / (numZ - 1);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(numT * numZ * 3);
    const colors = new Float32Array(numT * numZ * 3);
    const indices = [];

    const colDeep = new THREE.Color(0x0E3B6E);
    const colMid = new THREE.Color(0x1F78B4);
    const colLight = new THREE.Color(0x5CC8E8);
    const colFoam = new THREE.Color(0xF6F1E4);

    for (let iz = 0; iz < numZ; iz++) {
      const z = -lengthZ * 0.5 + iz * dz;
      for (let it = 0; it < numT; it++) {
        const idx = (iz * numT + it) * 3;
        const t = it / (numT - 1);
        pos[idx] = 3.8 - t * 0.8;
        pos[idx + 1] = 6.2 - t * 0.6;
        pos[idx + 2] = z;

        let c = new THREE.Color();
        if (it === numT - 1) {
          // Чёрный контур тушью по кромке
          c.setHex(0x1C1A22);
        } else if (t >= 0.70) {
          // Белая бумажная пена губы
          c.copy(colFoam);
        } else if (t >= 0.40) {
          // Океаническая лазурь
          const k = (t - 0.40) / 0.30;
          c.copy(colMid).lerp(colLight, k);
        } else {
          // Глубокий океан
          const k = t / 0.40;
          c.copy(colDeep).lerp(colMid, k);
        }
        colors[idx] = c.r;
        colors[idx + 1] = c.g;
        colors[idx + 2] = c.b;
      }
    }

    for (let iz = 0; iz < numZ - 1; iz++) {
      for (let it = 0; it < numT - 1; it++) {
        const a = iz * numT + it;
        const b = (iz + 1) * numT + it;
        const c = (iz + 1) * numT + (it + 1);
        const d = iz * numT + (it + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // Обновление положения 3D арки губы при захлопывании (Bezier curl)
  updateCurledLipPositions(p, quiverX = 0, quiverY = 0, midZ = 0) {
    if (!this.lipFlapMesh || !this.lipFlapMesh.geometry) return;
    const posAttr = this.lipFlapMesh.geometry.attributes.position;
    const pos = posAttr.array;
    const numT = 14;
    const numZ = 12;

    // Высота поверхности воды в точке падения губы (wx = 0.8 -> x = -0.8)
    const surfInfo = this.getSurface(-0.8, midZ || 0);
    const waterY = surfInfo ? surfInfo.height : 0.0;

    // Контрольные точки Безье профиля изгиба губы в X-Y:
    // P0: гребень волны (3.8м, 6.2м)
    // P1: вершина арки (закручивается в сторону сёрфера над водой)
    // P2: точка удара о воду (0.8м, waterY + 0.15м)
    const p0 = { x: 3.8 + quiverX, y: 6.2 + quiverY };
    const p1 = { x: 3.8 - (2.4 * p + 0.6) + quiverX, y: 6.2 + 0.3 * p + quiverY };
    const p2 = { x: 3.8 - (3.0 * p + 0.6), y: THREE.MathUtils.lerp(5.4, waterY + 0.15, p) };

    for (let iz = 0; iz < numZ; iz++) {
      for (let it = 0; it < numT; it++) {
        const idx = (iz * numT + it) * 3;
        const t = it / (numT - 1);
        const inv = 1 - t;
        const wx = inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x;
        const y = inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y;
        pos[idx] = wx;
        pos[idx + 1] = y;
      }
    }
    posAttr.needsUpdate = true;
    this.lipFlapMesh.geometry.computeVertexNormals();
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

    // 2. Вода тянется вверх: скролл текстуры по V вверх со скоростью 0.6 * speed (§4 ТЗ, п. 1 ревью)
    if (this.waveTexture) {
      this.waveTexture.offset.y -= 0.6 * playerSpeed * dt * 0.035;
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
    if (Math.random() < 0.45) {
      this.emitLipSpray(playerZ);
    }
    this.updateSprayParticles(dt);

    // 7. Периодический выброс губы (каждые 6–10 с)
    this.updateLipThrow(dt, playerZ);
  }

  // Генерация брызг с вершины губы назад (высота 5.8-6.4м)
  emitLipSpray(playerZ) {
    const free = this.sprayParticles.find((p) => p.life <= 0);
    if (!free) return;

    free.x = 3.4 + Math.random() * 0.9;
    free.y = 5.8 + Math.random() * 0.5;
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
      free.y = 0.3 + Math.random() * 2.5;
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

  // Обновление выброса губы (ТЗ ревью п. 1)
  updateLipThrow(dt, playerZ) {
    if (this._frozenThrow) return;
    this.nextThrowTimer -= dt;

    if (this.nextThrowTimer <= 0 && !this.activeThrow) {
      this.nextThrowTimer = 7.0 + Math.random() * 3.0; // каждые 7-10 с
      const throwLen = 14.0;

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
        // Губа темнеет и дрожит на 25 Гц, на воде растет темная тень
        const warnProgress = Math.min(1.0, (1.45 - t) / 1.2);

        if (this.throwShadowMesh) {
          this.throwShadowMesh.visible = true;
          this.throwShadowMesh.position.set(1.2, 0.06, midZ);
          this.throwShadowMesh.scale.set(0.8 + warnProgress * 0.6, 1.0, 1.0);
        }

        if (this.lipFlapMesh) {
          this.lipFlapMesh.visible = true;
          this.lipFlapMesh.position.set(0, 0, midZ);
          // Дрожание кромки на 25 Гц
          const quiverX = (Math.random() - 0.5) * 0.20;
          const quiverY = Math.sin(this.time * 25.0 * Math.PI * 2) * 0.18;
          this.updateCurledLipPositions(0.06 + warnProgress * 0.10, quiverX, quiverY, midZ);
        }

        if (this.impactSplashMesh) {
          this.impactSplashMesh.visible = false;
        }
      } else if (t > 0.0) {
        // Фаза захлопывания (0.25 с):
        // Слой реально загибается вниз и бьёт по воде всплеском пены! (п. 1 ревью)
        const collapseT = (0.25 - t) / 0.25; // 0..1

        if (this.throwShadowMesh) this.throwShadowMesh.visible = false;

        if (this.lipFlapMesh) {
          this.lipFlapMesh.visible = true;
          this.lipFlapMesh.position.set(0, 0, midZ);
          // 3D арка динамически закручивается вниз и вперед к воде
          this.updateCurledLipPositions(collapseT, 0, 0, midZ);
        }

        // Всплеск пены на воде в месте удара (активен при приближении к воде)
        if (this.impactSplashMesh) {
          const surfInfo = this.getSurface(-0.8, midZ);
          const waterY = surfInfo ? surfInfo.height : 0.0;
          this.impactSplashMesh.visible = true;
          this.impactSplashMesh.position.set(0.8, waterY + 0.18, midZ);
          this.impactSplashMesh.rotation.z = surfInfo ? surfInfo.slope : 0;
          this.impactSplashMesh.scale.setScalar(0.8 + collapseT * 0.9);
        }

        // Всплеск пены частицами
        this.emitFoamSpray(midZ, 5);

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
        if (this.impactSplashMesh) this.impactSplashMesh.visible = false;
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.PeelingWave = PeelingWave;
}
