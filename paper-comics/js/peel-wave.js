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
      const u = (iz / segZ) * 4.0; // 4 повтора бесшовной текстуры на 280 м

      // П. 5 ревью: Волна сужается вперёд (+60 м до +140 м)
      // Высота плавно падает с 6.0 до 2.5 м, губа становится ниже и гладкой, без завитка
      let hScale = 1.0;
      let overhangScale = 1.0;
      if (z > 60.0) {
        const t = Math.min(1.0, (z - 60.0) / 80.0); // 0..1
        const smoothT = t * t * (3.0 - 2.0 * t);
        hScale = 1.0 - smoothT * (1.0 - 2.50 / 6.20); // 1.0 -> 0.4032 (6.2м -> 2.5м)
        overhangScale = 1.0 - smoothT; // 1.0 -> 0.0 (завиток плавно разворачивается в гладкое плечо)
      }

      for (let ix = 0; ix < numProfile; ix++) {
        const p = this.profilePoints[ix];
        let wx = p.wx;
        let y = p.y * hScale;

        if (ix > 20) {
          // Завиток губы: при overhangScale -> 0 плавно сворачивается в гребень wx = 4.2
          wx = 4.20 - (4.20 - p.wx) * overhangScale;
          y = (6.20 - (6.20 - p.y) * overhangScale) * hScale;
        }

        pos1.push(wx, y, z);

        const v = ix / (numProfile - 1);
        uvs1.push(u, v);

        // Цвета по высоте профиля (п. 2 и 3 ревью):
        // Подошва и нижние 0.8 м: мягкий градиент через vertex colors
        // Середина и склон: белый тинт (1, 1, 1) для сочных текстурных цветов
        // Нижняя сторона губы и завиток (ix >= 21): --ocean-deep #0E3B6E с осветлением к краю
        let c = new THREE.Color();
        if (p.y <= 0.01) {
          c.copy(colLight);
        } else if (p.y <= 0.80) {
          // Мягкий градиент на нижних 0.8 м от --ocean-light к чистому отображению текстуры
          const t = p.y / 0.80;
          c.copy(colLight).lerp(new THREE.Color(1.0, 1.0, 1.0), t);
        } else if (ix <= 20) {
          // Склон волны: чистый белый множитель, текстура отображается своими цветами #1F78B4, #5CC8E8, #2E8FC9
          c.setRGB(1.0, 1.0, 1.0);
        } else {
          // П. 3 ревью: Нижняя сторона нависающей губы и внутренность завитка — --ocean-deep #0E3B6E с небольшим осветлением к краю
          const t = (ix - 21) / 5.0; // 0..1
          c.copy(colDeep).lerp(colMid, t * 0.20);
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

    // Создаем процедурную бесшовную бумажную текстуру склона 1024×1024 (п. 1 ревью)
    this.waveTexture = this.createPaperWaveTexture();
    this.waveTexture.wrapS = THREE.RepeatWrapping;
    this.waveTexture.wrapT = THREE.RepeatWrapping;

    // П. 2 ревью: плоская вода у подошвы — та же текстура, что у плоской воды справа
    const flatTex = (this.ocean && this.ocean.waveTexture) ? this.ocean.waveTexture : this.createFlatWaterTexture();

    const mat1 = new THREE.MeshBasicMaterial({
      map: this.waveTexture,
      vertexColors: true,
      side: THREE.DoubleSide
    });

    // Шейдерный бленд: плоская вода у основания -> склон волны (п. 2 ревью)
    mat1.onBeforeCompile = (shader) => {
      shader.uniforms.mapFlat = { value: flatTex };
      shader.uniforms.slopeOffsetY = { value: 0.0 };
      this.wallShaderUniforms = shader.uniforms;

      shader.vertexShader = `
        varying float vHeight;
        varying vec2 vFlatUv;
        varying vec2 vSlopeUv;
        uniform float slopeOffsetY;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `
        #include <uv_vertex>
        vHeight = position.y;
        vSlopeUv = vec2(uv.x, uv.y + slopeOffsetY);
        vFlatUv = vec2((position.x + 7.0) / 14.0 * 2.0, (position.z / 220.0) * 24.0);
        `
      );

      shader.fragmentShader = `
        uniform sampler2D mapFlat;
        varying float vHeight;
        varying vec2 vFlatUv;
        varying vec2 vSlopeUv;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec4 colSlope = texture2D(map, vSlopeUv);
          vec4 colFlat = texture2D(mapFlat, vFlatUv);
          // Переход от плоской воды к склону на нижних 0.8 м профиля
          float blend = smoothstep(0.0, 0.80, vHeight);
          vec4 texColor = mix(colFlat, colSlope, blend);
          diffuseColor *= texColor;
        #endif
        `
      );
    };

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

      let hScale = 1.0;
      let overhangScale = 1.0;
      if (z > 60.0) {
        const t = Math.min(1.0, (z - 60.0) / 80.0);
        const smoothT = t * t * (3.0 - 2.0 * t);
        hScale = 1.0 - smoothT * (1.0 - 2.50 / 6.20);
        overhangScale = 1.0 - smoothT;
      }

      for (let ix = stepStartIx; ix < numProfile; ix++) {
        const p = this.profilePoints[ix];
        let wx = p.wx + 0.05;
        let y = (p.y + 0.05) * hScale;

        if (ix > 20) {
          wx = 4.25 - (4.20 - p.wx) * overhangScale;
          y = (6.25 - (6.20 - p.y) * overhangScale) * hScale;
        }

        pos2.push(wx, y, z + 0.15);

        let c = new THREE.Color();
        if (p.y <= 4.2) {
          c.copy(colLight).lerp(colMid, Math.max(0, (p.y - 2.2) / 2.0));
        } else if (p.y <= 5.6) {
          c.copy(colMid).lerp(colDeep, (p.y - 4.2) / 1.4);
        } else if (ix <= 20) {
          c.copy(colDeep).lerp(colFoam, 0.40);
        } else {
          // Завиток — --ocean-deep #0E3B6E с небольшим осветлением
          const t = (ix - 21) / 5.0;
          c.copy(colDeep).lerp(colMid, t * 0.20);
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

    // --- СЛОЙ 3: Рваная кромка белой пены по всей длине гребня шириной 0.9 м (п. 3 ревью) ---
    this.initLipFoamStrip(lengthZ, segZ);

    this.scene.add(this.waveGroup);
  }

  // Рваная белая бумажная кромка пены шириной 0.9 м по вершине губы (п. 3 ревью)
  initLipFoamStrip(lengthZ, segZ) {
    const geo = new THREE.BufferGeometry();
    const pos = [];
    const uvs = [];
    const indices = [];
    const width = 0.90; // ширина 0.9 м (п. 3 ревью)
    const dz = lengthZ / segZ;

    for (let iz = 0; iz <= segZ; iz++) {
      const z = -lengthZ * 0.5 + iz * dz;
      let hScale = 1.0;
      if (z > 60.0) {
        const t = Math.min(1.0, (z - 60.0) / 80.0);
        const smoothT = t * t * (3.0 - 2.0 * t);
        hScale = 1.0 - smoothT * (1.0 - 2.50 / 6.20);
      }
      const crestY = 6.18 * hScale;
      const crestX = 3.80;

      // Две вершины по ширине кромки 0.9 м
      pos.push(crestX - width * 0.45, crestY - 0.04, z);
      uvs.push(0, (iz / segZ) * 16.0);

      pos.push(crestX + width * 0.55, crestY + 0.04, z);
      uvs.push(1, (iz / segZ) * 16.0);
    }

    for (let iz = 0; iz < segZ; iz++) {
      const a = iz * 2;
      const b = (iz + 1) * 2;
      const c = (iz + 1) * 2 + 1;
      const d = iz * 2 + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Зубчатый бумажный контур кромки пены: неровный край, обводка --ink 1.5px с opacity 0.4
    const foamCanvas = document.createElement('canvas');
    foamCanvas.width = 128;
    foamCanvas.height = 512;
    const ctx = foamCanvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 512);

    // Заливка --foam с рваным краем
    ctx.fillStyle = '#F6F1E4';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 512);
    for (let y = 512; y >= 0; y -= 8) {
      const edgeX = 100 + Math.sin(y * 0.08) * 12 + Math.cos(y * 0.22) * 8 + Math.sin(y * 0.7) * 4;
      ctx.lineTo(edgeX, y);
    }
    ctx.closePath();
    ctx.fill();

    // Неровные рваные зубчики
    ctx.fillStyle = '#F6F1E4';
    for (let y = 0; y < 512; y += 16) {
      const edgeX = 100 + Math.sin(y * 0.08) * 12;
      ctx.beginPath();
      ctx.arc(edgeX, y + 8, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Обводка --ink 1.5px с opacity 0.4 (п. 3 ревью)
    ctx.strokeStyle = 'rgba(28, 26, 34, 0.40)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = 0; y <= 512; y += 8) {
      const edgeX = 100 + Math.sin(y * 0.08) * 12 + Math.cos(y * 0.22) * 8 + Math.sin(y * 0.7) * 4;
      if (y === 0) ctx.moveTo(edgeX, y);
      else ctx.lineTo(edgeX, y);
    }
    ctx.stroke();

    const foamTex = new THREE.CanvasTexture(foamCanvas);
    foamTex.wrapS = THREE.RepeatWrapping;
    foamTex.wrapT = THREE.RepeatWrapping;
    foamTex.repeat.set(1, 16);

    const mat = new THREE.MeshBasicMaterial({
      map: foamTex,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.15
    });

    this.lipFoamMesh = new THREE.Mesh(geo, mat);
    this.waveGroup.add(this.lipFoamMesh);
  }

  // Процедурная бесшовная текстура 1024×1024 (п. 1 ревью):
  // фон --ocean-mid #1F78B4, 40-60 мазков рваной бумаги вдоль потока,
  // цвета --ocean-light #5CC8E8 (50%), #2E8FC9 (35%), --ocean-deep (15%),
  // белого --foam <= 5% площади (редкие блики), растр 2px opacity 0.15.
  createPaperWaveTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // 1. Фон --ocean-mid #1F78B4 (п. 1 ревью)
    ctx.fillStyle = '#1F78B4';
    ctx.fillRect(0, 0, 1024, 1024);

    // Функция рисования бесшовного мазка рваной бумаги вдоль потока (Y)
    const drawStroke = (cx, cy, len, width, color) => {
      ctx.fillStyle = color;
      // Чтобы текстура была строго бесшовной, рисуем мазок с обёртыванием по границам 1024
      const offsetsX = [0];
      if (cx - width < 0) offsetsX.push(1024);
      if (cx + width > 1024) offsetsX.push(-1024);

      const offsetsY = [0];
      if (cy - len * 0.5 < 0) offsetsY.push(1024);
      if (cy + len * 0.5 > 1024) offsetsY.push(-1024);

      offsetsX.forEach(ox => {
        offsetsY.forEach(oy => {
          const x0 = cx + ox;
          const y0 = cy + oy;
          const numSteps = 14;

          ctx.beginPath();
          // Правый контур сверху вниз
          for (let i = 0; i <= numSteps; i++) {
            const t = i / numSteps; // 0..1
            const y = y0 - len * 0.5 + t * len;
            // Сужение к обоим концам: sin(pi * t)
            const taper = Math.sin(Math.PI * t);
            // Неровный рваный край бумаги
            const edgeNoise = 0.85 + Math.sin(t * 19.0 + cx) * 0.15 + Math.cos(t * 37.0) * 0.10;
            const w = (width * 0.5) * taper * edgeNoise;
            const wobbleX = Math.sin(t * Math.PI * 2.0) * (width * 0.15);
            const x = x0 + wobbleX + w;
            if (i === 0) ctx.moveTo(x0 + wobbleX, y);
            else ctx.lineTo(x, y);
          }
          // Левый контур снизу вверх
          for (let i = numSteps; i >= 0; i--) {
            const t = i / numSteps;
            const y = y0 - len * 0.5 + t * len;
            const taper = Math.sin(Math.PI * t);
            const edgeNoise = 0.85 + Math.cos(t * 23.0 + cy) * 0.15 + Math.sin(t * 41.0) * 0.10;
            const w = (width * 0.5) * taper * edgeNoise;
            const wobbleX = Math.sin(t * Math.PI * 2.0) * (width * 0.15);
            const x = x0 + wobbleX - w;
            ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        });
      });
    };

    // 2. 52 мазка рваной бумаги, вытянутых вдоль потока Y (п. 1 ревью):
    // длина 80–300px, ширина 6–30px, концы сужаются, края неровные.
    // Цвета случайно: --ocean-light #5CC8E8 (50%), #2E8FC9 (35%), --ocean-deep (15%)
    let seed = 42;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const colors = [
      '#5CC8E8', // 50%
      '#2E8FC9', // 35%
      '#0E3B6E'  // 15%
    ];

    for (let i = 0; i < 52; i++) {
      const cx = rnd() * 1024;
      const cy = rnd() * 1024;
      const len = 80 + rnd() * 220;   // 80–300px
      const width = 8 + rnd() * 22;   // 8–30px

      const roll = rnd();
      let col = colors[0];
      if (roll < 0.50) col = colors[0];       // #5CC8E8 (50%)
      else if (roll < 0.85) col = colors[1];  // #2E8FC9 (35%)
      else col = colors[2];                   // #0E3B6E (15%)

      drawStroke(cx, cy, len, width, col);
    }

    // 3. Белого --foam на склоне не больше 5% площади — только редкие короткие блики (п. 1 ревью)
    for (let i = 0; i < 12; i++) {
      const cx = rnd() * 1024;
      const cy = rnd() * 1024;
      const len = 30 + rnd() * 35; // короткие 30–65px
      const width = 3 + rnd() * 4; // тонкие 3–7px
      drawStroke(cx, cy, len, width, 'rgba(246, 241, 228, 0.85)'); // --foam
    }

    // 4. Поверх мелкий растр 2px, opacity 0.15 (п. 1 ревью)
    ctx.fillStyle = 'rgba(28, 26, 34, 0.15)';
    for (let y = 0; y < 1024; y += 8) {
      const offsetX = (y % 16 === 0) ? 4 : 0;
      for (let x = 0; x < 1024; x += 8) {
        ctx.beginPath();
        ctx.arc(x + offsetX, y, 1.0, 0, Math.PI * 2); // 2px диаметр
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 1);
    return tex;
  }

  // Запасная генерация текстуры плоской воды (если ocean.waveTexture недоступен)
  createFlatWaterTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#5CC8E8';
    ctx.fillRect(0, 0, 512, 512);

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

  // =========================================================================
  // 3. Стена пены позади точки ломки (п. 4 ревью)
  // =========================================================================
  initFoamWall() {
    this.foamBallGroup = new THREE.Group();
    this.foamBallGroup.name = 'foamWallBalls';
    this.foamBalls = [];

    // П. 4 ревью: заливка --foam (#F6F1E4), обводка 1px #9FC3D6 вместо чёрной
    const ballCanvas = document.createElement('canvas');
    ballCanvas.width = 128;
    ballCanvas.height = 128;
    const bCtx = ballCanvas.getContext('2d');

    bCtx.fillStyle = '#F6F1E4'; // --foam
    bCtx.beginPath();
    bCtx.arc(64, 64, 58, 0, Math.PI * 2);
    bCtx.fill();

    bCtx.strokeStyle = '#9FC3D6'; // обводка 1px #9FC3D6
    bCtx.lineWidth = 2.5;
    bCtx.stroke();

    // Нежные пузырьковые детали
    bCtx.strokeStyle = 'rgba(159, 195, 214, 0.45)';
    bCtx.lineWidth = 1.5;
    bCtx.beginPath();
    bCtx.arc(52, 52, 22, 0, Math.PI * 2);
    bCtx.stroke();

    const ballTex = new THREE.CanvasTexture(ballCanvas);
    const ballGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const ballMat = new THREE.MeshBasicMaterial({
      map: ballTex,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide
    });

    // П. 4 ревью: Размер 0.4–1.6 м с разбросом, кучками по 3–6 штук
    const clusters = [
      // 4 кучки позади точки ломки (вдоль гребня и склона)
      { cx: 3.4, cy: 5.2, cz: -3.0, count: 5 },
      { cx: 2.6, cy: 3.8, cz: -7.0, count: 4 },
      { cx: 1.8, cy: 2.4, cz: -11.0, count: 5 },
      { cx: 1.2, cy: 1.5, cz: -5.0, count: 4 },
      // 3 кучки накатывают вперед (влетают в кадр снизу-слева при < 10м)
      { cx: 0.8, cy: 1.1, cz: 2.2, count: 5 },
      { cx: 1.5, cy: 1.8, cz: 4.5, count: 4 },
      { cx: 0.2, cy: 0.7, cz: 6.2, count: 5 }
    ];

    let seed = 17;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    clusters.forEach(cl => {
      for (let k = 0; k < cl.count; k++) {
        const mesh = new THREE.Mesh(ballGeo, ballMat);
        const ox = (rnd() - 0.5) * 1.2;
        const oy = (rnd() - 0.5) * 0.9;
        const oz = (rnd() - 0.5) * 1.5;
        // Размер 0.4–1.6 м с разбросом
        const diameter = 0.40 + rnd() * 1.20;

        const posX = cl.cx + ox;
        const posY = Math.max(0.3, cl.cy + oy);
        const posZ = cl.cz + oz;

        mesh.position.set(posX, posY, posZ);
        mesh.scale.setScalar(diameter);

        this.foamBalls.push({
          mesh: mesh,
          baseX: posX,
          baseY: posY,
          offsetZ: posZ,
          phase: rnd() * Math.PI * 2,
          speed: 4.0 + rnd() * 4.0,
          baseScale: diameter
        });

        this.foamBallGroup.add(mesh);
      }
    });

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
    // Мягкий контур #9FC3D6 вместо жирной туши (п. 4 ревью)
    spCtx.strokeStyle = '#9FC3D6';
    spCtx.lineWidth = 3.0;
    spCtx.stroke();
    // Бумажные пенные кружки в месте удара
    spCtx.fillStyle = '#F6F1E4';
    for (let i = 0; i < 22; i++) {
      spCtx.beginPath();
      spCtx.arc(32 + (i * 29) % 192, 32 + (i * 37) % 192, 18 + (i % 6) * 4, 0, Math.PI * 2);
      spCtx.fill();
      spCtx.strokeStyle = '#9FC3D6';
      spCtx.lineWidth = 1.5;
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
    const colFoam = new THREE.Color(0xF6F1E4);

    for (let iz = 0; iz < numZ; iz++) {
      const z = -lengthZ * 0.5 + iz * dz;
      for (let it = 0; it < numT; it++) {
        const idx = (iz * numT + it) * 3;
        const t = it / (numT - 1);
        pos[idx] = 3.8 - t * 0.8;
        pos[idx + 1] = 6.2 - t * 0.6;
        pos[idx + 2] = z;

        // П. 3 ревью: Нижняя сторона нависающей губы и внутренность завитка — --ocean-deep #0E3B6E с осветлением к краю.
        // Чёрные линии-каракули с завитка убрать.
        let c = new THREE.Color();
        if (t >= 0.90) {
          c.copy(colFoam); // пена только на самом гребне
        } else if (t >= 0.50) {
          const k = (t - 0.50) / 0.40;
          c.copy(colMid).lerp(colFoam, k * 0.30);
        } else {
          // Внутренность завитка и нижняя сторона — чистый --ocean-deep #0E3B6E
          const k = t / 0.50;
          c.copy(colDeep).lerp(colMid, k * 0.25);
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
  update(dt, playerZ, playerSpeed, camera = null) {
    this.time += dt;
    if (camera) this.camera = camera;

    // 1. Позиционирование меша стены волны вдоль хода игрока
    if (this.waveGroup) {
      this.waveGroup.position.z = playerZ;
    }

    // 2. Вода тянется вверх: скролл текстуры по V вверх со скоростью 0.6 * speed (§4 ТЗ, п. 1 ревью)
    const scrollDelta = 0.6 * playerSpeed * dt * 0.035;
    if (this.wallShaderUniforms) {
      this.wallShaderUniforms.slopeOffsetY.value -= scrollDelta;
    }
    if (this.waveTexture) {
      this.waveTexture.offset.y -= scrollDelta;
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
      const cam = this.camera;
      const wWidth = typeof window !== 'undefined' ? window.innerWidth : 393;
      const wHeight = typeof window !== 'undefined' ? window.innerHeight : 852;

      this.foamBalls.forEach((b) => {
        const wobble = Math.sin(this.time * b.speed + b.phase) * 0.20;
        b.mesh.position.set(b.baseX + wobble, b.baseY + wobble * 0.5, b.offsetZ);
        b.mesh.scale.setScalar(b.baseScale * boilScale);

        // П. 4 ревью: не появляются в прямоугольнике HUD-кружки плюс 30px (screenX < 145, screenY > wHeight - 165)
        if (cam) {
          if (!this._tempVec) this._tempVec = new THREE.Vector3();
          b.mesh.updateWorldMatrix(true, false);
          b.mesh.getWorldPosition(this._tempVec);
          this._tempVec.project(cam);
          const sx = (this._tempVec.x * 0.5 + 0.5) * wWidth;
          const sy = (1.0 - (this._tempVec.y * 0.5 + 0.5)) * wHeight;
          const inMugRect = (sx < 145 && sy > (wHeight - 165) && this._tempVec.z > 0 && this._tempVec.z < 1);
          b.mesh.visible = !inMugRect;
        }
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

    // 6. Брызги, срывающиеся с губы назад: строго 6–10 в секунду (п. 3 ревью)
    this.lipSprayTimer = (this.lipSprayTimer || 0) + dt;
    const sprayInterval = 1.0 / (7.0 + Math.sin(this.time * 4.0) * 2.5); // 5 to 9.5 Hz (6–10 / сек)
    if (this.lipSprayTimer >= sprayInterval) {
      this.lipSprayTimer = 0;
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
