/**
 * Tony's Garret — Surf Rush (Sandbox v3)
 * PeelingWave: Ломающаяся волна слева, карман, обрушение гребня (§2.1, §4.3 CONTROLS_SANDBOX_SPEC.md)
 */

class PeelingWave {
  constructor(scene, ocean) {
    this.scene = scene;
    this.ocean = ocean;

    // Параметры волны из CFG.peel
    this.H = (CFG && CFG.peel && CFG.peel.H) || 3.2;
    this.faceFromX = (CFG && CFG.peel && CFG.peel.faceFromX) || -6;
    this.faceToX = (CFG && CFG.peel && CFG.peel.faceToX) || 4;
    this.lipX = (CFG && CFG.peel && CFG.peel.lipX) || -5;
    this.pocketWidth = (CFG && CFG.surf && CFG.surf.pocketWidth) || 4;

    // Состояние обрушения
    this.peelZ = 0; // Z точки ломки волны
    this.nextThrowTimer = 7.0; // отсчет до следующего выброса губы (6-10 с)
    this.activeThrow = null;   // { zStart, zEnd, timer, totalDur, isWarning }
    this.onWipeCallback = null;

    // Меши волны и пены
    this.initWaveMesh();
    this.initLipFoamMesh();
    this.initLipThrowWarningMesh();
  }

  // Единая функция поверхности для песочницы:
  // складывает ocean.getSurfaceInfo + склон волны + зыбь зоны 300–550 м
  getSurface(x, z) {
    const worldX = -x; // строгое правило: worldX = -x
    const oceanSurface = this.ocean ? this.ocean.getSurfaceInfo(worldX, z) : { height: 0, normal: new THREE.Vector3(0, 1, 0) };

    const cycleZ = ((z % 900) + 900) % 900;

    // 1. Огибающая зоны «Волна» (0–300 м)
    let waveEnvelope = 0.0;
    if (cycleZ >= 0 && cycleZ <= 300) {
      if (cycleZ < 30) {
        waveEnvelope = cycleZ / 30.0;
      } else if (cycleZ > 270) {
        waveEnvelope = (300 - cycleZ) / 30.0;
      } else {
        waveEnvelope = 1.0;
      }
    }

    // Высота и уклон склона волны над x ∈ [-6, 4]
    let waveHeight = 0.0;
    let waveSlope = 0.0;
    let inPocket = 0.0;

    if (waveEnvelope > 0) {
      // smoothstep(4, -6, x): при x >= 4 -> 0, при x <= -6 -> 1
      const t = Math.max(0, Math.min(1, (4 - x) / 10.0));
      const s = t * t * (3 - 2 * t);
      waveHeight = this.H * s * waveEnvelope;

      // Уклон поверхности (в радианах)
      // Производная ds/dt = 6t - 6t^2, dt/dx = -0.1
      const ds_dt = 6 * t * (1 - t);
      const dh_dx = this.H * ds_dt * (-0.1) * waveEnvelope;
      // При x < 4 dh_dx < 0 (высота падает с ростом x). Крен в радианах:
      waveSlope = Math.atan2(dh_dx, 1.0);

      // Карман: inPocket = clamp(1 - x / pocketWidth, 0, 1)
      inPocket = Math.max(0, Math.min(1, 1.0 - (x / this.pocketWidth))) * waveEnvelope;
    }

    // 2. Зыбь зоны 300–550 м (3 гребня по 40 м длины, высота 1.2 м)
    let swellHeight = 0.0;
    let swellDhDz = 0.0;

    if (cycleZ >= 300 && cycleZ <= 550) {
      const swellZ = cycleZ - 300; // 0..250
      // 3 гребня: гребень каждые 70 м, длина гребня 40 м
      // Огибающая перехода на границах зоны 300 и 550 м
      let swellEnvelope = 1.0;
      if (swellZ < 20) swellEnvelope = swellZ / 20.0;
      else if (swellZ > 230) swellEnvelope = (250 - swellZ) / 20.0;

      const wavePeriod = 65.0; // м
      const phase = (swellZ / wavePeriod) * Math.PI * 2;
      const hBase = 1.2 * 0.5 * (1 + Math.sin(phase)); // 0..1.2 м
      swellHeight = hBase * swellEnvelope;

      // Производная dh/dz для механики накачки (dh/dz < 0 = спуск)
      const k = (Math.PI * 2) / wavePeriod;
      swellDhDz = 1.2 * 0.5 * Math.cos(phase) * k * swellEnvelope;
    }

    const totalHeight = oceanSurface.height + waveHeight + swellHeight;
    const totalSlope = waveSlope; // крен от склона волны

    return {
      height: totalHeight,
      slope: totalSlope,
      inPocket: inPocket,
      dhdz: swellDhDz,
      waveEnvelope: waveEnvelope
    };
  }

  initWaveMesh() {
    // 3D-меш склона волны слева: 260 м длины, ширина по X от -7 до 5
    const length = 260;
    const width = 12; // от x = -7 до x = 5
    const segX = 24;
    const segZ = 65;

    const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
    geo.rotateX(-Math.PI * 0.5);

    // Цвет: градиент рваной бумаги --ocean-mid -> --ocean-light
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cMid = new THREE.Color(CFG.threeColors.oceanMid || 0x1F78B4);
    const cLight = new THREE.Color(CFG.threeColors.oceanLight || 0x5CC8E8);

    for (let i = 0; i < pos.count; i++) {
      const localX = pos.getX(i); // от -6 до 6
      // Нормализуем по высоте склона
      const t = Math.max(0, Math.min(1, (localX + 6) / 12));
      const col = new THREE.Color().copy(cMid).lerp(cLight, t);
      colors[i * 3 + 0] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });

    this.waveMesh = new THREE.Mesh(geo, mat);
    // В мире склон находится слева экрана (worldX = -x, при x = -1 -> worldX = +1)
    this.waveMesh.position.set(1.0, 0, 0);
    this.scene.add(this.waveMesh);
  }

  initLipFoamMesh() {
    // Белая кромка гребня волны по x ≈ -5 (worldX ≈ +5)
    const geo = new THREE.PlaneGeometry(0.8, 260);
    geo.rotateX(-Math.PI * 0.5);

    const mat = new THREE.MeshBasicMaterial({
      color: 0xF6F1E4, // --foam
      side: THREE.DoubleSide
    });

    this.lipMesh = new THREE.Mesh(geo, mat);
    this.lipMesh.position.set(5.0, this.H, 0);
    this.scene.add(this.lipMesh);
  }

  initLipThrowWarningMesh() {
    // Тень-предупреждение падающей губы (12 м длины, ширина 2 м, полупрозрачная тушь)
    const geo = new THREE.PlaneGeometry(2.0, 12.0);
    geo.rotateX(-Math.PI * 0.5);

    const mat = new THREE.MeshBasicMaterial({
      color: 0x1C1A22, // --ink
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });

    this.throwWarningMesh = new THREE.Mesh(geo, mat);
    this.throwWarningMesh.position.set(0, 0.05, 0);
    this.throwWarningMesh.visible = false;
    this.scene.add(this.throwWarningMesh);
  }

  // Обновление физики обрушения и выбросов каждый кадр
  update(dt, playerZ, playerSpeed) {
    const cycleZ = ((playerZ % 900) + 900) % 900;
    const inWaveZone = cycleZ >= 0 && cycleZ <= 300;

    // Видимость меша волны (активен только в зоне 0–300 м)
    if (this.waveMesh) {
      this.waveMesh.visible = inWaveZone;
      this.lipMesh.visible = inWaveZone;
    }

    if (!inWaveZone) {
      if (this.throwWarningMesh) this.throwWarningMesh.visible = false;
      return;
    }

    // 1. Движение точки ломки волны со скоростью peelSpeed
    const peelSpeedFactor = (CFG && CFG.surf && CFG.surf.peelSpeed) || 1.0;
    const peelSpeed = playerSpeed * peelSpeedFactor;
    this.peelZ += peelSpeed * dt;

    // Если точка ломки слишком отстала или ушла вперед, мягко подтягиваем в окрестность игрока
    if (Math.abs(this.peelZ - playerZ) > 80) {
      this.peelZ = playerZ - 20;
    }

    // Позиционируем меш волны вдоль хода игрока
    if (this.waveMesh) {
      this.waveMesh.position.z = playerZ;
      this.lipMesh.position.z = playerZ;

      // Деформация вершин склона волны
      const pos = this.waveMesh.geometry.attributes.position;
      const count = pos.count;
      for (let i = 0; i < count; i++) {
        const lx = pos.getX(i);
        const lz = pos.getZ(i);
        // экранный x: worldX = -x -> x = -(lx + waveMesh.x)
        const screenX = -(lx + this.waveMesh.position.x);
        const worldZ = lz + playerZ;
        const sInfo = this.getSurface(screenX, worldZ);
        pos.setY(i, sInfo.height);
      }
      pos.needsUpdate = true;
    }

    // 2. Таймер и запуск периодического выброса губы (каждые 6–10 с)
    this.nextThrowTimer -= dt;
    if (this.nextThrowTimer <= 0 && !this.activeThrow) {
      const minT = (CFG.peel && CFG.peel.lipThrowEvery && CFG.peel.lipThrowEvery[0]) || 6;
      const maxT = (CFG.peel && CFG.peel.lipThrowEvery && CFG.peel.lipThrowEvery[1]) || 10;
      this.nextThrowTimer = minT + Math.random() * (maxT - minT);

      const throwLen = (CFG.peel && CFG.peel.lipThrowLen) || 12;
      const warnDur = (CFG.peel && CFG.peel.lipThrowWarn) || 1.2;

      this.activeThrow = {
        zStart: playerZ + 15,
        zEnd: playerZ + 15 + throwLen,
        timer: warnDur + 0.8, // 1.2 с предупреждение + 0.8 с само падение
        warnDur: warnDur,
        totalDur: warnDur + 0.8
      };
    }

    // 3. Обработка активного выброса губы
    if (this.activeThrow) {
      this.activeThrow.timer -= dt;
      const t = this.activeThrow.timer;

      if (t > 0.8) {
        // Фаза предупреждения: показываем тень на воде
        if (this.throwWarningMesh) {
          this.throwWarningMesh.visible = true;
          this.throwWarningMesh.position.set(0.5, 0.05, (this.activeThrow.zStart + this.activeThrow.zEnd) * 0.5);
        }
      } else if (t > 0) {
        // Фаза падения губы: губа накрывает зону x < 1
        if (this.throwWarningMesh) this.throwWarningMesh.visible = false;
        // Проверка попадания игрока в зону падения
        if (playerZ >= this.activeThrow.zStart && playerZ <= this.activeThrow.zEnd) {
          // Вызывается извне в surf-physics при x < 1
          if (this.onCheckLipStrike) {
            this.onCheckLipStrike(this.activeThrow);
          }
        }
      } else {
        // Завершение выброса
        this.activeThrow = null;
        if (this.throwWarningMesh) this.throwWarningMesh.visible = false;
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.PeelingWave = PeelingWave;
}
