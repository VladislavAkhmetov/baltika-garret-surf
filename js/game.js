/**
 * Tony's Garret — Surf Rush (Papercraft 2.5D Edition)
 * Главный оркестратор игры — Фаза 1
 * Соответствие LEVEL1_SPEC
 */

class GarretSurfGame {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.state = 'start'; // 'start', 'calibrating', 'playing', 'paused', 'gameover'

    // Выбранный вкус (по умолчанию Cherry)
    this.flavorKey = 'cherry';
    this.currentFlavor = CFG.flavors.cherry;

    // Временные шкалы
    this.clock = new THREE.Clock();
    this.totalTime = 0;
    this.realTime = 0;
    this.frameCount = 0;
    this.fps = 60;
    this.lastFpsUpdate = 0;

    // Реюзабельные векторы для 0-аллокаций
    this._camTargetPos = new THREE.Vector3();
    this._camLookTarget = new THREE.Vector3();
    this._tempQuat = new THREE.Quaternion();
    this._upVec = new THREE.Vector3(0, 1, 0);

    // Чтение URL-параметров
    this.urlParams = new URLSearchParams(window.location.search);
    this.isDebug = this.urlParams.get('debug') === '1';
    this.targetSectionId = this.urlParams.get('section') || null;
    this.seed = this.urlParams.get('seed') ? parseInt(this.urlParams.get('seed'), 10) : Date.now();
    this.fxTestWord = this.urlParams.get('fx') || null;

    // Модули игры
    this.audio = new SurfAudio();
    this.input = new InputManager();
    this.fx = new FxDirector();
    this.meta = new MetaManager();
    this.mug = new MugLiquid();
    const mugCanvas = document.getElementById('mug-canvas');
    this.mugRenderer = new MugRenderer(mugCanvas);
    this.mugRenderer.setColor(this.flavorKey);
    this.balance = new BalanceSystem(this);
    this._prevTargetX = 0;

    // Событие выплеска пива (§5.1, §5.2)
    this.mug.addSpillListener((side, amount) => {
      if (this.mugRenderer) {
        this.mugRenderer.emitSpillParticles(side);
      }
      this.audio.playCarve(0.4);
      this.stats.combo = 0;
    });

    this._prevPlayerX = 0;
    this._prevVx = 0;
    this._prevPlayerAirY = 0;
    this._prevVy = 0;
    this._landingTapRegistered = false;
    this._landingRingEl = document.getElementById('landing-ring');

    // Регистрация тапа в окне посадки для чистой посадки в режиме свайпов
    window.addEventListener('pointerdown', () => {
      if (this.player && this.player.isJumping) {
        const dur = this.player.jumpDuration || CFG.player.jumpDuration;
        const timeLeft = dur - this.player.jumpTime;
        if (timeLeft <= 0.25) {
          this._landingTapRegistered = true;
        }
      }
    });

    // Игрок и кинематика
    this.player = {
      x: 0,
      targetX: 0,
      y: 0,
      z: 0,
      speed: CFG.speed.start,
      roll: 0,
      pitch: 0,
      yaw: 0,
      airY: 0,
      airVy: 0,
      isJumping: false,
      jumpTime: 0,
      isDucking: false,
      duckTime: 0,
      steerStrength: 0,
      currentPose: 'norma',
      lastPoseChangeTime: 0
    };

    // Статистика заезда
    this.stats = {
      distance: 0,
      score: 0,
      combo: 0,
      comboMultiplier: 1,
      multiplier: 1,
      beerLevel: 100,
      beer: 100,
      capsCount: 0,
      rank: 4 // 1/4 ... 4/4
    };

    // Состояние столкновений и правил Subway (Фаза 2, §4.4)
    this.lastStumbleTime = 0;
    this.stumbleTimer = 0;
    this.goldCapsCollected = [false, false, false];
    this.scoreMultiplier = 3;

    // Paper Boil таймеры
    this.paperBoilTimer = 0;
    this.hudCards = [];

    // Инициализация Three.js и сцены
    this.initThree();

    // Инициализация UI и событий
    this.initUI();

    // Старт с выбранной секции, если указана в URL
    if (this.targetSectionId) {
      this.jumpToSection(this.targetSectionId);
    }

    // Запуск цикла анимации
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    this.scene = new THREE.Scene();

    // Туман сцены строго по спецификации (без фиолетового!)
    this.scene.fog = new THREE.FogExp2(CFG.fog.color, CFG.fog.density);

    const container = document.getElementById('app-container') || document.body;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const aspect = w / h;

    // Перспективная камера
    this.camera = new THREE.PerspectiveCamera(CFG.camera.baseFov, aspect, 0.1, 400);
    this.camera.position.set(0, CFG.camera.offsetY, CFG.camera.offsetZ);

    // WebGL Renderer с прозрачностью (чтобы видеть градиент неба на контейнере)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    // Освещение (теплое солнце и мягкий свет)
    const ambientLight = new THREE.AmbientLight(0xfffaea, 1.3);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffb74d, 1.4);
    sunLight.position.set(10, 30, 40);
    this.scene.add(sunLight);

    const oceanRimLight = new THREE.DirectionalLight(CFG.threeColors.oceanLight, 0.6);
    oceanRimLight.position.set(-16, 12, -10);
    this.scene.add(oceanRimLight);

    // 1. Океан с 3 полосами (OceanLanes)
    this.ocean = new OceanLanes(this.scene);

    // 2. Бумажный сёрфер (PaperSurferRig)
    this.surferRig = SurfModels.createPaperSurferRig(this.currentFlavor);
    this.scene.add(this.surferRig);

    // 3. Модули сущностей, спавнера и соперников
    this.entities = new EntityFactory(this.scene);
    this.spawner = new LevelSpawner(this, this.scene, this.entities);
    this.rivals = new RivalManager(this.scene);
    this.events = new LevelEvents(this.scene);

    window.addEventListener('resize', () => this.onResize());
  }

  initUI() {
    // 1. Кнопка старта
    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
      btnStart.addEventListener('click', () => this.onStartButtonClicked());
    }

    // 2. Кнопка перезапуска
    const btnReplay = document.getElementById('btn-replay');
    if (btnReplay) {
      btnReplay.addEventListener('click', () => this.restartGame());
    }

    // 3. Переключатель звука
    const btnSound = document.getElementById('btn-sound-toggle');
    if (btnSound) {
      btnSound.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.toggleMute();
        btnSound.textContent = this.audio.isMuted ? '🔇' : '🔊';
      });
    }

    // 4. Карточки выбора вкусов в меню
    const flavorCards = document.querySelectorAll('.flavor-card');
    flavorCards.forEach((card) => {
      card.addEventListener('click', (e) => {
        const flavor = card.getAttribute('data-flavor');
        this.setFlavor(flavor);
      });
    });

    // 5. Поиск HUD-плашек для Paper Boil
    this.hudCards = Array.from(document.querySelectorAll('.paper-hud-card, .paper-sub-pill'));

    // 6. Debug-оверлей
    this.debugOverlay = document.getElementById('debug-overlay');
    if (this.isDebug && this.debugOverlay) {
      this.debugOverlay.classList.remove('hide');
    }
  }

  setFlavor(flavorKey) {
    if (!CFG.flavors[flavorKey]) return;
    this.flavorKey = flavorKey;
    this.currentFlavor = CFG.flavors[flavorKey];
    if (this.mugRenderer) {
      this.mugRenderer.setColor(flavorKey);
    }
    if (this.balance) {
      this.balance.updateFlavorAssist(flavorKey);
    }

    // Обновляем визуальный активный статус в меню
    document.querySelectorAll('.flavor-card').forEach((card) => {
      if (card.getAttribute('data-flavor') === flavorKey) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // Обновляем цвет доски и кружки у сёрфера
    if (this.surferRig && this.surferRig.userData && this.surferRig.userData.beerMug) {
      const liquidMesh = this.surferRig.userData.beerMug.getObjectByName('mugLiquid');
      if (liquidMesh && liquidMesh.material) {
        liquidMesh.material.color.set(this.currentFlavor.beerHex);
      }
    }
  }

  async onStartButtonClicked() {
    this.audio.unlock();
    this.audio.startBgm();

    // 1. Немедленный запрос разрешений iOS на доступ к датчикам (строго в контексте клика)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const resp = await DeviceOrientationEvent.requestPermission();
        if (resp !== 'granted') {
          console.warn('Gyro permission not granted, switching to swipe');
          this.input.setMode('swipe');
        }
      } catch (err) {
        console.warn('Gyro permission request error:', err);
      }
    }
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        await DeviceMotionEvent.requestPermission();
      } catch (err) {}
    }

    // Скрываем стартовое меню
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.classList.add('hide');

    // Проверяем гироскоп и калибровку (§3.4)
    const calScreen = document.getElementById('calibration-screen');
    const calCount = document.getElementById('calibration-count');
    const isMobileWithTouch = typeof window !== 'undefined' && ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));

    if ((this.input.state.balanceMode === 'gyro' || (!this.input.forcedMode && isMobileWithTouch && typeof DeviceOrientationEvent !== 'undefined')) && !this.input.gyroCalibrated) {
      if (calScreen) calScreen.classList.remove('hide');
      this.state = 'calibrating';

      let count = 3;
      if (calCount) calCount.textContent = count;
      const countInterval = setInterval(() => {
        count--;
        if (count > 0 && calCount) {
          calCount.textContent = count;
        } else {
          clearInterval(countInterval);
          if (calScreen) calScreen.classList.add('hide');
          this.input.requestPermissionsAndCalibrate((calibrated) => {
            this.state = 'playing';
          });
        }
      }, 700);
    } else {
      this.state = 'playing';
    }
  }

  jumpToSection(sectionId) {
    const sec = LEVEL1.sections.find((s) => s.id === sectionId);
    if (sec) {
      this.player.z = sec.fromM;
      this.stats.distance = sec.fromM;
      if (this.spawner) {
        this.spawner.reset(sec.fromM);
      }
      console.log(`Starting directly at section "${sec.name}" (z = ${sec.fromM}m)`);
    }
  }

  // --- Основной цикл обновления ---
  animate() {
    requestAnimationFrame(this.animate);

    const realDt = Math.min(this.clock.getDelta(), 0.1);
    this.realTime += realDt;
    this.frameCount++;

    // Расчет FPS
    if (this.realTime - this.lastFpsUpdate > 0.5) {
      this.fps = Math.round(this.frameCount / (this.realTime - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = this.realTime;
    }

    // Игровой dt с учетом FX timeScale
    const dt = realDt * this.fx.timeScale;

    // Обновление ввода и FX
    this.input.update(realDt);
    this.fx.update(realDt);

    // Обновление состояния игры
    if (this.state === 'playing') {
      this.updatePlayer(dt);
      this.updateOcean(dt);
      if (this.spawner) {
        this.spawner.update(dt, this.player.z, this.ocean);
      }
      this.updateCamera(dt, realDt);
      this.updateHUD(dt);
      this.updatePaperBoil(realDt);
      if (this.mugRenderer) {
        const mugTilt = this.balance ? this.balance.mugTilt : 0;
        this.mugRenderer.render(this.mug, dt, mugTilt);
      }
    } else if (this.state === 'start' || this.state === 'calibrating') {
      // Покачивание в меню
      this.updateOcean(dt * 0.5);
      this.updateIdleSurfer(realDt);
      if (this.mugRenderer) {
        this.mugRenderer.render(this.mug, dt * 0.5, 0);
      }
    }

    // Рендер сцены
    this.renderer.render(this.scene, this.camera);

    // Обновление Debug-оверлея
    if (this.isDebug) {
      this.updateDebugOverlay();
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    const inp = this.input.state;

    // 1. Поступательное движение вперед по Z
    if (this.stumbleTimer > 0) {
      this.stumbleTimer -= dt;
    }
    const stumbleMult = this.stumbleTimer > 0 ? (1 - CFG.speed.stumblePenalty) : 1.0;

    const maxSpeed = CFG.speed.max * this.currentFlavor.speedMult;
    if (p.z >= CFG.level.length - CFG.speed.finishDecelDist) {
      // Финишное замедление (за 80 м до конца)
      const distToFinish = Math.max(0, CFG.level.length - p.z);
      const decelFraction = distToFinish / CFG.speed.finishDecelDist;
      p.speed = Math.max(0, CFG.speed.start * decelFraction);
      if (distToFinish <= 0.5 && this.state === 'playing') {
        this.onGameFinish();
      }
    } else if (p.speed < maxSpeed) {
      p.speed = Math.min(maxSpeed, p.speed + CFG.speed.accel * dt);
    }

    const effSpeed = p.speed * stumbleMult;
    p.z += effSpeed * dt;
    this.stats.distance = Math.floor(p.z);

    // 2. Боковое перемещение (сглаженный переход к targetX)
    p.targetX = inp.targetX;
    const steerDiff = p.targetX - p.x;

    // Регистрация смены полосы для системы баланса (§5.3)
    if (this._prevTargetLane === undefined) {
      this._prevTargetLane = inp.laneIndex;
    }
    if (inp.laneIndex !== this._prevTargetLane) {
      const steerDir = Math.sign(CFG.lanes.x[inp.laneIndex] - CFG.lanes.x[this._prevTargetLane]);
      if (this.balance) {
        this.balance.onLaneChange(steerDir, inp.playerTilt);
      }
      this._prevTargetLane = inp.laneIndex;
    }

    // Высокая отзывчивость сглаживания
    p.x += steerDiff * Math.min(1, 14 * dt);
    p.steerStrength = steerDiff;

    // 3. Прыжок
    if (this.input.consumeJump() && !p.isJumping) {
      p.isJumping = true;
      p.jumpTime = 0;
      p.jumpDuration = CFG.player.jumpDuration;
      p.targetAirHeight = CFG.player.jumpHeight;
      this.audio.playJump();
    }

    if (p.isJumping) {
      p.jumpTime += dt;
      const dur = p.jumpDuration || CFG.player.jumpDuration;
      const progress = p.jumpTime / dur;
      if (progress < 1.0) {
        // Параболическая траектория
        const h = p.targetAirHeight || CFG.player.jumpHeight;
        p.airY = Math.sin(progress * Math.PI) * h;
      } else {
        p.airY = 0;
        p.isJumping = false;
        p.jumpDuration = CFG.player.jumpDuration;
        p.targetAirHeight = CFG.player.jumpHeight;
        // Посадка
        this.onPlayerLanding();
      }
    }

    // 4. Нырок
    p.isDucking = inp.duckPressed;

    // 5. Высота по поверхности воды
    const surface = this.ocean.getSurfaceInfo(p.x, p.z);
    p.y = surface.height + p.airY;

    // 6. Поза и анимация персонажа (Stop-motion 12 кадров/с)
    const now = performance.now();
    if (now - p.lastPoseChangeTime >= CFG.player.stopMotionInterval * 1000) {
      p.lastPoseChangeTime = now;
      let targetPose = 'norma';
      if (p.isJumping) {
        targetPose = 'jump';
      } else if (p.isDucking) {
        targetPose = 'duck';
      } else if (Math.abs(steerDiff) > 0.08) {
        targetPose = 'turn';
      }

      if (this.surferRig && this.surferRig.userData.setPose) {
        this.surferRig.userData.setPose(targetPose, steerDiff);
      }
      p.currentPose = targetPose;
    }

    // Подсказка обучения перед первой большой волной (§5.3)
    if (p.z >= 425 && p.z <= 445 && !this._balanceHintShown) {
      this._balanceHintShown = true;
      this.showBanner('🌊 ВОЛНА КРЕНИТ — НАКЛОНЯЙ НАВСТРЕЧУ!');
    }

    // 7. Позиция и вращение 2.5D рига
    if (this.surferRig) {
      this.surferRig.position.set(p.x, p.y, p.z);

      // Крен (roll) при поворотах: наклон влево при +X, вправо при -X
      const targetRoll = steerDiff * 0.22;
      p.roll += (targetRoll - p.roll) * Math.min(1, 12 * dt);

      // Визуал крена (§5.3):
      // Сёрфер: rotation.z = worldRoll (его кренит волна) + крен маневра
      const worldRoll = this.balance ? this.balance.worldRoll : 0;
      this.surferRig.rotation.set(0, 0, worldRoll + p.roll * 0.4);

      // Рука с кружкой: -playerTilt (видно, как сёрфер компенсирует контр-наклоном)
      const playerTilt = inp.playerTilt || 0;
      if (this.surferRig.userData && this.surferRig.userData.beerMug) {
        this.surferRig.userData.beerMug.rotation.z = -playerTilt;
      }

      // 3D Paper Boil: микро-поворот каждые 125 мс
      if (this.paperBoilActive) {
        this.surferRig.rotation.z += (Math.random() - 0.5) * CFG.fx.paperBoilRot3d;
      }
    }

    // 8. Баланс и физика кружки с пивом (§5.1, §5.3 LEVEL1_SPEC)
    const playerTilt = inp.playerTilt || 0;
    if (this.balance) {
      this.balance.update(dt, p.z, p.speed, playerTilt);
    }

    const curVx = (p.x - this._prevPlayerX) / Math.max(0.001, dt);
    const ax = ((curVx - this._prevVx) / Math.max(0.001, dt)) / CFG.mug.axDiv;
    this._prevPlayerX = p.x;
    this._prevVx = curVx;

    const curVy = (p.airY - this._prevPlayerAirY) / Math.max(0.001, dt);
    const ay = ((curVy - this._prevVy) / Math.max(0.001, dt)) / CFG.mug.ayDiv;
    this._prevPlayerAirY = p.airY;
    this._prevVy = curVy;

    const totalAx = ax + (this.balance ? this.balance.axImpulse : 0);
    const effectiveTilt = this.balance ? this.balance.mugTilt : playerTilt;
    this.mug.update(dt, totalAx, ay, effectiveTilt);

    this.stats.beer = Math.max(0, this.mug.level * 100);
    this.scoreMultiplier = this.mug.multiplier;

    // Пиво 0% -> конец заезда (§4.4)
    if (this.stats.beer <= 0 && this.state === 'playing') {
      this.onPlayerCrash('Пиво пролито до дна!');
    }

    // Подсказка кольца посадки перед касанием в режиме свайпов
    if (this._landingRingEl) {
      if (p.isJumping) {
        const dur = p.jumpDuration || CFG.player.jumpDuration;
        const progress = p.jumpTime / dur;
        if (progress >= 0.65) {
          this._landingRingEl.classList.remove('hide');
          if (this.camera && this.surferRig) {
            const v = new THREE.Vector3(p.x, p.y, p.z);
            v.project(this.camera);
            const w = window.innerWidth;
            const h = window.innerHeight;
            const scrX = (v.x * 0.5 + 0.5) * w;
            const scrY = (-v.y * 0.5 + 0.5) * h;
            this._landingRingEl.style.left = `${scrX.toFixed(1)}px`;
            this._landingRingEl.style.top = `${scrY.toFixed(1)}px`;
          }
        } else {
          this._landingRingEl.classList.add('hide');
        }
      } else {
        this._landingRingEl.classList.add('hide');
      }
    }

    // Синхронизация поверхности жидкости в 3D кружке у сёрфера
    if (this.surferRig && this.surferRig.userData && this.surferRig.userData.beerMug) {
      const mugUserData = this.surferRig.userData.beerMug.userData;
      if (mugUserData && mugUserData.updateSlosh) {
        const sloshAngle = (this.mug.h[this.mug.n - 1] - this.mug.h[0]) * 0.85;
        const sloshPitch = -ay * 0.4;
        mugUserData.updateSlosh(sloshAngle, sloshPitch, this.stats.beer);
      }
    }
  }

  onPlayerLanding() {
    // Чистая посадка (v2 §5.1): |mugTilt| < 6° в момент касания для всех режимов баланса
    const mugTiltDeg = this.balance ? Math.abs(this.balance.mugTilt * (180 / Math.PI)) : 0;
    const cleanThreshold = CFG.mug.cleanGyroThreshold || 6;
    let cleanVal = 0;
    if (mugTiltDeg <= cleanThreshold) {
      cleanVal = 1.0;
    } else if (mugTiltDeg >= 20) {
      cleanVal = 0.0;
    } else {
      cleanVal = 1.0 - (mugTiltDeg - cleanThreshold) / (20 - cleanThreshold);
    }

    const isClean = cleanVal > 0.65;
    this.mug.applyLandingImpulse(cleanVal);
    this._landingTapRegistered = false;

    if (this._landingRingEl) {
      this._landingRingEl.classList.add('hide');
    }

    if (isClean) {
      this.showTrickSticker('ЧИСТО!', '+250 ★');
      this.stats.score += 250;
      this.audio.playCarve(0.8);
    } else {
      this.audio.playCarve(0.4);
    }
  }

  updateIdleSurfer(realDt) {
    if (!this.surferRig) return;
    const surface = this.ocean.getSurfaceInfo(0, 0);
    this.surferRig.position.set(0, surface.height + Math.sin(this.realTime * 2.0) * 0.06, 0);
    this.surferRig.rotation.z = Math.sin(this.realTime * 1.5) * 0.04;
  }

  updateOcean(dt) {
    this.ocean.update(dt, this.player.z);
  }

  // Камера (§3.3)
  updateCamera(dt, realDt) {
    const p = this.player;

    // Позиция: camX (следование с коэффициентом 0.8), Y/Z оффсеты от игрока
    const camX = p.x * CFG.camera.camXFactor;
    this._camTargetPos.set(
      camX,
      p.y + CFG.camera.offsetY,
      p.z + CFG.camera.offsetZ
    );

    // Сглаживание: позиция lerp 1 - exp(-10 * dt), Z - жестко
    const lerpRate = 1 - Math.exp(-CFG.camera.lerpPosRate * dt);
    this.camera.position.x += (this._camTargetPos.x - this.camera.position.x) * lerpRate;
    this.camera.position.y += (this._camTargetPos.y - this.camera.position.y) * lerpRate;
    this.camera.position.z = this._camTargetPos.z; // Z жестко без отставания!

    // Цель взгляда: player + (player.x * -0.25, 1.1, 14)
    const lookX = p.x + p.x * CFG.camera.targetXFactor;
    const lookY = p.y + CFG.camera.targetOffsetY;
    const lookZ = p.z + CFG.camera.targetOffsetZ;
    this.camera.lookAt(lookX, lookY, lookZ);

    // FOV: 58 + (speed - 26) * 0.7
    const targetFov = CFG.camera.baseFov + (p.speed - CFG.speed.start) * CFG.camera.fovSpeedFactor;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    // Покачивающийся оператор: camera.rotation.z += sin(t * 1.3) * 0.006
    this.camera.rotation.z += Math.sin(this.realTime * CFG.camera.bobRate) * CFG.camera.bobAmp;

    // Крен горизонта от волн (§5.3): camera.rotation.z += worldRoll * 0.25, максимум 4°
    if (this.balance) {
      const maxCamTilt = (CFG.balance.maxCameraTiltDeg * Math.PI) / 180;
      const camTilt = Math.max(-maxCamTilt, Math.min(maxCamTilt, this.balance.worldRoll * CFG.balance.cameraTiltFactor));
      this.camera.rotation.z += camTilt;
    }

    // Тряска экрана от FX
    if (this.fx.shakeAmount > 0) {
      const sh = this.fx.shakeAmount;
      this.camera.position.x += (Math.random() - 0.5) * 0.3 * sh;
      this.camera.position.y += (Math.random() - 0.5) * 0.3 * sh;
    }
  }

  // Paper Boil для HUD-плашек: каждые 125 мс смещение ±0.6px и поворот ±0.4°
  updatePaperBoil(realDt) {
    this.paperBoilTimer += realDt;
    if (this.paperBoilTimer >= CFG.fx.paperBoilInterval / 1000) {
      this.paperBoilTimer = 0;
      this.paperBoilActive = true;

      const posAmp = CFG.fx.paperBoilPos;
      const rotAmp = CFG.fx.paperBoilRot;

      this.hudCards.forEach((card) => {
        const dx = (Math.random() - 0.5) * posAmp * 2;
        const dy = (Math.random() - 0.5) * posAmp * 2;
        const dr = (Math.random() - 0.5) * rotAmp * 2;
        card.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${dr.toFixed(1)}deg)`;
      });
    }
  }

  updateHUD(dt) {
    // 1. Одометр счета
    const odo = document.getElementById('score-odometer-text');
    if (odo) {
      const scoreStr = String(Math.floor(this.stats.score)).padStart(6, '0');
      odo.textContent = scoreStr;
    }

    // 2. Индикатор пива и процент
    const beerVal = document.getElementById('beer-level-val');
    const beerBar = document.getElementById('beer-bar-inner');
    if (beerVal && beerBar) {
      const curBeer = Math.max(0, Math.round(this.stats.beer));
      beerVal.textContent = curBeer;
      beerBar.style.width = curBeer + '%';
    }
  }

  updateDebugOverlay() {
    if (!this.debugOverlay) return;

    // Определяем текущую секцию
    const curZ = this.player.z;
    const currentSection = LEVEL1.sections.find((s) => curZ >= s.fromM && curZ < s.toM) || LEVEL1.sections[0];

    const speedMs = this.player.speed.toFixed(1);
    const routeMode = this.input.state.mode;
    const balMode = this.input.state.balanceMode;
    const laneNames = ['0 [Левая +2.4]', '1 [Центр 0.0]', '2 [Правая -2.4]'];
    const laneStr = laneNames[this.input.state.laneIndex] || this.input.state.laneIndex;
    const activeCount = this.spawner ? this.spawner.activeEntities.length : 0;
    const stumbleInfo = this.stumbleTimer > 0 ? `Спотыкание (${this.stumbleTimer.toFixed(1)}с)` : 'Норма';

    const wRoll = this.balance ? ((this.balance.worldRoll * 180) / Math.PI).toFixed(1) : '0';
    const pTilt = this.balance ? ((this.balance.playerTilt * 180) / Math.PI).toFixed(1) : '0';
    const mTilt = this.balance ? ((this.balance.mugTilt * 180) / Math.PI).toFixed(1) : '0';
    const sourcesSummary = this.balance ? this.balance.getActiveSourcesSummary() : '-';
    const assistVal = this.balance ? this.balance.assist.toFixed(1) : '-';

    this.debugOverlay.innerHTML = `
      <b>GARRET DEBUG [v2 Controls & P3.5]</b><br>
      FPS: ${this.fps}<br>
      Секция: ${currentSection.name} (${currentSection.id})<br>
      Дистанция: ${Math.floor(curZ)} / ${CFG.level.length} м<br>
      Скорость: ${speedMs} м/с | Статус: ${stumbleInfo}<br>
      Полоса: ${laneStr} (X: ${this.player.x.toFixed(2)})<br>
      Ввод: маршрут <b>${routeMode}</b> | баланс <b>${balMode}</b><br>
      Крен: мир ${wRoll}° | игрок ${pTilt}°<br>
      Кружка: mugTilt <b>${mTilt}°</b> | assist ${assistVal}<br>
      Волны: ${sourcesSummary}<br>
      Пиво: ${Math.round(this.stats.beer)}% | Очки: ${this.stats.score}
    `;
  }

  onResize() {
    const container = document.getElementById('app-container') || document.body;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  restartGame() {
    this.player.x = 0;
    this.player.z = 0;
    this.player.airY = 0;
    this.player.isJumping = false;
    this.player.jumpDuration = CFG.player.jumpDuration;
    this.player.targetAirHeight = CFG.player.jumpHeight;
    this.player.speed = CFG.speed.start;
    this.stats.distance = 0;
    this.stats.score = 0;
    this.stats.beer = 100;
    this.lastStumbleTime = 0;
    this.stumbleTimer = 0;
    this.goldCapsCollected = [false, false, false];

    if (this.spawner) {
      this.spawner.reset(0);
    }

    for (let i = 1; i <= 3; i++) {
      const el = document.getElementById(`cap-icon-${i}`);
      if (el) {
        el.src = 'assets/sprites/cap_empty.png';
        el.className = 'slot-cap-img empty';
      }
    }

    const resultScreen = document.getElementById('result-screen');
    if (resultScreen) resultScreen.classList.add('hide');

    this.state = 'playing';
  }

  // --- События Фазы 2: Сбор предметов, трамплины, бонусы, препятствия ---

  onCapCollected(e) {
    const gained = e.score * this.scoreMultiplier;
    this.stats.score += gained;
    this.stats.capsCount++;
    this.audio.playCapCatch();
    this.showTrickSticker('КРЫШКА', '+' + gained);

    if (e.goldSlot) {
      this.goldCapsCollected[e.goldSlot - 1] = true;
      const slotEl = document.getElementById(`cap-icon-${e.goldSlot}`);
      if (slotEl) {
        slotEl.src = e.goldSlot === 1 ? 'assets/sprites/cap_fish.png' : (e.goldSlot === 2 ? 'assets/sprites/cap_palm.png' : 'assets/sprites/cap_fish_clean.png');
        slotEl.className = 'slot-cap-img collected';
      }
      this.showTrickSticker('ЗОЛОТАЯ КРЫШКА!', '+500 ★');
    }
  }

  onRampLaunch(e) {
    const p = this.player;
    p.isJumping = true;
    p.jumpTime = 0;
    p.jumpDuration = e.isMega ? 1.6 : 0.85;
    p.targetAirHeight = e.launchAirY;
    p.airY = 0.4;
    this.audio.playJump();
    this.showTrickSticker(e.isMega ? 'МЕГА ТРАМПЛИН' : 'ТРАМПЛИН', e.isMega ? '+500' : '+150');
  }

  onBonusIce() {
    this.stats.beer = Math.min(100, this.stats.beer + 25);
    this.showBanner('❄️ ЛЕДЯНАЯ КРУЖКА! +25% ПИВА');
    this.audio.playCarve(1.0);
  }

  onBonusMagnet() {
    this.showBanner('🧲 МАГНИТ! ВСЕ КРЫШКИ ТВОИ');
    this.audio.playCarve(0.8);
  }

  onObstacleHit(e) {
    const now = performance.now();
    const timeSinceLast = (now - this.lastStumbleTime) / 1000;

    if (this.lastStumbleTime > 0 && timeSinceLast < CFG.speed.stumbleWindowForCrash) {
      // Второй удар в течение 5 с = падение (падение -> конец заезда, §4.4)
      this.onPlayerCrash('Двойное столкновение!');
    } else {
      // Первый удар = спотыкание (§4.4: скорость -30% на 1.2с, импульс в кружку, тряска)
      this.lastStumbleTime = now;
      this.stumbleTimer = CFG.speed.stumbleDuration;
      if (this.balance) {
        this.balance.onHit();
      }
      this.fx.triggerShake(0.5);
      this.audio.playWipeout(0.6);
      this.stats.beer = Math.max(0, this.stats.beer - 14);
      this.stats.combo = 0;
      this.showBanner('⚠️ СПОТКНУЛСЯ! (−30% СКОРОСТЬ)');

      if (this.stats.beer <= 0) {
        this.onPlayerCrash('Пиво пролито до дна!');
      }
    }
  }

  onPlayerCrash(reason) {
    this.state = 'crashed';
    this.audio.playWipeout(1.0);
    this.fx.triggerShake(0.8);
    this.showBanner('💥 ПАДЕНИЕ! ' + reason, 2500);

    setTimeout(() => {
      const resultScreen = document.getElementById('result-screen');
      const rankEl = document.getElementById('pass-rank');
      const scoreEl = document.getElementById('pass-score');
      const beerEl = document.getElementById('pass-beer');
      const distEl = document.getElementById('pass-distance');

      if (rankEl) rankEl.textContent = 'Заезд прерван';
      if (scoreEl) scoreEl.textContent = String(this.stats.score).padStart(6, '0');
      if (beerEl) beerEl.textContent = Math.round(this.stats.beer) + '%';
      if (distEl) distEl.textContent = Math.floor(this.player.z) + 'м';

      if (resultScreen) resultScreen.classList.remove('hide');
    }, 1200);
  }

  onGameFinish() {
    this.state = 'finished';
    this.audio.playFruit();
    this.showBanner('🏆 ФИНИШ! ПЛЯЖНЫЙ БАР!', 3000);

    setTimeout(() => {
      const resultScreen = document.getElementById('result-screen');
      const rankEl = document.getElementById('pass-rank');
      const scoreEl = document.getElementById('pass-score');
      const beerEl = document.getElementById('pass-beer');
      const distEl = document.getElementById('pass-distance');

      if (rankEl) rankEl.textContent = 'Король Волны';
      if (scoreEl) scoreEl.textContent = String(this.stats.score).padStart(6, '0');
      if (beerEl) beerEl.textContent = Math.round(this.stats.beer) + '%';
      if (distEl) distEl.textContent = '2700м';

      if (resultScreen) resultScreen.classList.remove('hide');
    }, 1500);
  }

  onSectionEnter(sec) {
    if (sec.hint) {
      this.showBanner(sec.hint, 2800);
    }
  }

  showBanner(text, duration = 2200) {
    const banner = document.getElementById('banner-popup');
    if (!banner) return;
    banner.textContent = text;
    banner.classList.add('banner-active');
    clearTimeout(this._bannerTimeout);
    this._bannerTimeout = setTimeout(() => {
      banner.classList.remove('banner-active');
    }, duration);
  }

  showTrickSticker(tag, val) {
    const sticker = document.getElementById('trick-sticker');
    const tagEl = document.getElementById('trick-tag');
    const valEl = document.getElementById('trick-val');
    if (sticker && tagEl && valEl) {
      tagEl.textContent = tag;
      valEl.textContent = val;
      sticker.classList.remove('hide');
      clearTimeout(this._trickTimeout);
      this._trickTimeout = setTimeout(() => {
        sticker.classList.add('hide');
      }, 1100);
    }
  }

  // Метод обратной совместимости для старых тестов
  collectCap(type) {
    this.stats.capsCount++;
    this.audio.playFruit();
  }

  showTrick(val, tag) {
    this.showTrickSticker(tag || 'ТРЮК', val || '+250');
  }

  jump() {
    this.player.isJumping = true;
    this.player.jumpTime = 0;
    this.audio.playJump();
  }

  endGame() {
    this.state = 'gameover';
    const resultScreen = document.getElementById('result-screen');
    if (resultScreen) resultScreen.classList.remove('hide');
  }
}

// Запуск игры после загрузки DOM
window.addEventListener('DOMContentLoaded', () => {
  window.game = new GarretSurfGame();
});
