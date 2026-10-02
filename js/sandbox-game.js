/**
 * Tony's Garret — Surf Rush (Sandbox v3)
 * SandboxGame: Главный оркестратор песочницы свободного управления (§2, §7 CONTROLS_SANDBOX_SPEC.md, HANDOFF v3)
 */

class SandboxGame {
  constructor() {
    this.isPaused = false;
    this.state = 'start'; // 'start' | 'calibrating' | 'playing' | 'respawning'
    this.respawnTimer = 0.0;

    this.clock = new THREE.Clock();
    this.realTime = 0.0;
    this.frameCount = 0;
    this.fps = 60;
    this.lastFpsTime = 0.0;
    this.bestSpeed = 26.0;

    // Переопределения океана и баланса для песочницы (HANDOFF v3 §2, §5)
    CFG.ocean.showLaneDividers = false;
    CFG.ocean.showLeftSteps = false;
    CFG.ocean.width = 30;
    CFG.ocean.waterCenterX = -5; // покрывает worldX ∈ [-20, 10]
    CFG.balance.model = 'jerk';

    // Векторы для камеры
    this._camTargetPos = new THREE.Vector3();
    this._camLookPos = new THREE.Vector3();

    // 1. Инициализация сцены Three.js
    this.initThree();

    // 2. Инициализация модулей
    this.ocean = new OceanLanes(this.scene);
    this.peelWave = new PeelingWave(this.scene, this.ocean);
    this.surferRig = SurfModels.createPaperSurferRig('cherry');
    this.scene.add(this.surferRig);

    this.entities = new EntityFactory(this.scene);
    this.mug = new MugLiquid();
    const mugCanvas = document.getElementById('mug-canvas');
    this.mugRenderer = new MugRenderer(mugCanvas);
    this.mugRenderer.setColor('cherry');
    this.balance = new BalanceSystem(this);
    this.input = new ControlInput();
    this.physics = new SurfPhysics();
    this.panel = new TuningPanel(this);

    // Подключение слушателя выплеска к партиклам MugRenderer
    this.mug.addSpillListener((side, amount) => {
      if (this.mugRenderer) {
        this.mugRenderer.emitSpillParticles(side);
      }
      if (this.audio) {
        this.audio.playCarve(0.4);
      }
    });

    // 3. Статические препятствия и бот для 900-метрового цикла
    this.initCycleObjects();
    this.initRivalBot();

    // 4. Подключение колбэков физики
    this.bindPhysicsCallbacks();

    // 5. Обработчики старта и телеметрии
    this.initUI();

    // 6. Запуск анимационного цикла
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(CFG.fog.color, CFG.fog.density);

    const container = document.getElementById('app-container') || document.body;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(58, w / h, 0.5, 600);
    this.camera.position.set(0, 3.5, -6.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('webgl-canvas'),
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    // Освещение (как в game.js)
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.95);
    this.scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(CFG.threeColors.sun, 1.1);
    sunLight.position.set(24, 45, 30);
    this.scene.add(sunLight);

    const oceanRimLight = new THREE.DirectionalLight(CFG.threeColors.oceanLight, 0.6);
    oceanRimLight.position.set(-16, 12, -10);
    this.scene.add(oceanRimLight);

    window.addEventListener('resize', () => this.onResize());
  }

  initCycleObjects() {
    this.cycleRamps = [];
    this.cycleBuoys = [];

    // Зона «Трамплины» (550–700 м): 3 трамплина на разных X
    const rampConfigs = [
      { x: 3.0, z: 580 },
      { x: 8.0, z: 625 },
      { x: 13.0, z: 670 }
    ];

    rampConfigs.forEach((cfg) => {
      const ramp = this.entities.createRamp(SurfPhysics.toWorldX(cfg.x), cfg.z);
      this.cycleRamps.push({ mesh: ramp, x: cfg.x, z: cfg.z });
    });

    // 6 буйков в зоне 550–700 м
    const buoyConfigs = [
      { x: 2.0, z: 565 },
      { x: 6.0, z: 595 },
      { x: 10.0, z: 610 },
      { x: 4.0, z: 645 },
      { x: 12.0, z: 660 },
      { x: 7.0, z: 690 }
    ];

    buoyConfigs.forEach((cfg) => {
      const buoy = this.entities.createBuoy(SurfPhysics.toWorldX(cfg.x), cfg.z);
      this.cycleBuoys.push({ mesh: buoy, x: cfg.x, z: cfg.z });
    });
  }

  initRivalBot() {
    // Бот-соперник (спрайт сёрфера с тинтом, держит x = 2 со скоростью 1.0 * baseSpeed)
    this.rivalBot = {
      x: 2.0,
      z: 720.0,
      speed: 26.0,
      mesh: null,
      active: true
    };

    const rig = SurfModels.createPaperSurferRig('peach');
    rig.position.set(SurfPhysics.toWorldX(2.0), 0, 720);
    this.scene.add(rig);
    this.rivalBot.mesh = rig;
  }

  bindPhysicsCallbacks() {
    const p = this.physics;

    p.onJump = (jumpType, mult) => {
      if (jumpType === 'ramp') {
        this.showToast('ТРАМПЛИН! 🛹');
      } else if (jumpType === 'lip') {
        this.showToast('ВЫЛЕТ С ГРЕБНЯ! 🤙');
      } else {
        this.showToast('ПРЫЖОК!');
      }
    };

    p.onLand = (clean, spinDeg) => {
      if (clean >= 0.85) {
        const spinNote = Math.abs(spinDeg) >= 300 ? ` (${Math.round(spinDeg)}°)` : '';
        this.showToast(`ЧИСТО!${spinNote} ★★★`);
        this.mug.applyLandingImpulse(1.0);
      } else if (clean >= 0.40) {
        this.showToast('ПЛЕСНУЛО!');
        this.mug.applyLandingImpulse(clean);
      }
    };

    p.onStumble = (reason) => {
      this.showToast(`СПОТЫКАНИЕ: ${reason}`);
      this.mug.applyStumbleImpulse();
      this.balance.onHit(Math.random() > 0.5 ? 1 : -1);
    };

    p.onWipe = (reason) => {
      this.showToast(`НАКРЫЛО: ${reason}`);
      this.state = 'respawning';
      this.respawnTimer = 1.0;
      this.mug.applyStumbleImpulse();
    };

    p.onPumpGood = () => {
      this.showPumpingFeedback(true);
    };

    p.onPumpBad = () => {
      this.showPumpingFeedback(false);
    };

    // Проверка попадания падающей губы волны и накрытия пеной
    if (this.peelWave) {
      this.peelWave.onCheckLipStrike = (activeThrow) => {
        if (this.physics.state.x < 1.0) {
          this.physics.triggerStumble('Удар губы волны');
          this.showToast('НАКРЫЛО! 💥');
        }
      };
      this.peelWave.onWipeCallback = (reason) => {
        this.physics.triggerStumble(reason);
        this.showToast('НАКРЫЛО ПЕНОЙ! 🌊');
      };
    }
  }

  initUI() {
    // 1. Старт песочницы
    const btnStart = document.getElementById('btn-sandbox-start');
    if (btnStart) {
      btnStart.addEventListener('click', () => this.onStart());
    }

    // 2. HUD-элементы телеметрии
    this.telemetryEl = document.getElementById('sandbox-telemetry');
    this.pocketBarInner = document.getElementById('pocket-bar-inner');
    this.pumpIndicator = document.getElementById('pump-indicator');
    this.toastEl = document.getElementById('sandbox-toast');
  }

  async onStart() {
    // 1. Немедленный запрос разрешений iOS на доступ к гироскопу строго в контексте клика
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const resp = await DeviceOrientationEvent.requestPermission();
        if (resp === 'granted') {
          this.input.hasGyro = true;
          this.input.state.mode = 'gyro';
        } else {
          console.warn('[ControlInput] Gyro permission not granted, switching to drag');
          this.input.state.mode = 'drag';
          this.input.setupGhostHints();
        }
      } catch (err) {
        console.warn('[ControlInput] Gyro permission error:', err);
      }
    }

    const startScreen = document.getElementById('sandbox-start-screen');
    if (startScreen) startScreen.classList.add('hide');

    const calScreen = document.getElementById('calibration-screen');
    const calCount = document.getElementById('calibration-count');

    // Если гироскоп доступен и не принудительный keys/drag
    if (this.input.state.mode === 'gyro') {
      if (calScreen) calScreen.classList.remove('hide');
      this.state = 'calibrating';

      // Начинаем сбор калибровки прямо во время обратного отсчета 3-2-1
      const samples = [];
      const sampleInterval = setInterval(() => {
        if (this.input.rawGamma !== undefined) {
          samples.push(this.input.rawGamma);
        }
      }, 50);

      const finishCalibration = () => {
        clearInterval(sampleInterval);
        if (samples.length > 0) {
          const sum = samples.reduce((a, b) => a + b, 0);
          this.input.neutralGamma = sum / samples.length;
        } else {
          this.input.neutralGamma = this.input.rawGamma || 0;
        }
        this.input.gyroCalibrated = true;
        this.input.hasGyro = true;
        this.input.state.mode = 'gyro';
        if (calScreen) calScreen.classList.add('hide');
        this.state = 'playing';
      };

      // Тап по модалке калибровки позволяет мгновенно начать игру
      const onSkipClick = () => {
        calScreen.removeEventListener('click', onSkipClick);
        clearInterval(countInterval);
        finishCalibration();
      };
      if (calScreen) calScreen.addEventListener('click', onSkipClick, { once: true });

      let count = 3;
      if (calCount) calCount.textContent = count;
      const countInterval = setInterval(() => {
        count--;
        if (count > 0 && calCount) {
          calCount.textContent = count;
        } else {
          clearInterval(countInterval);
          if (calScreen) calScreen.removeEventListener('click', onSkipClick);
          finishCalibration();
        }
      }, 450);
    } else {
      this.state = 'playing';
    }
  }

  showToast(text) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hide', 'show');
    void this.toastEl.offsetWidth; // перезапуск CSS анимации
    this.toastEl.classList.add('show');
  }

  showPumpingFeedback(isGood) {
    if (!this.pumpIndicator) return;
    this.pumpIndicator.className = isGood ? 'pump-good' : 'pump-bad';
    this.pumpIndicator.textContent = isGood ? '▲ НАКАЧКА' : '▼ СБОЙ';
    clearTimeout(this._pumpTimer);
    this._pumpTimer = setTimeout(() => {
      if (this.pumpIndicator) this.pumpIndicator.textContent = 'НАКАЧКА';
      if (this.pumpIndicator) this.pumpIndicator.className = '';
    }, 400);
  }

  snapCamera() {
    const p = this.physics.state;
    const camX = p.worldX - 1.2;
    this._camTargetPos.set(camX, p.y + 3.2, p.z - 6.5);
    this.camera.position.copy(this._camTargetPos);
    this._camLookPos.set(
      p.worldX + 0.8 - Math.sin(p.heading) * 4.0,
      p.y + 0.6,
      p.z + 14.0
    );
    this.camera.lookAt(this._camLookPos);
  }

  // --- Основной цикл обновления ---
  animate() {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.realTime += dt;
    this.frameCount++;

    if (this.realTime - this.lastFpsTime > 0.5) {
      this.fps = Math.round(this.frameCount / (this.realTime - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = this.realTime;
    }

    if (this.isPaused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'playing') {
      this.updateGame(dt);
    } else if (this.state === 'respawning') {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        // Респаун на том же месте цикла с полным пивом
        this.physics.reset(2.0, this.physics.state.z);
        this.snapCamera();
        this.mug.level = 1.0;
        this.mug.foam = 1.0;
        this.state = 'playing';
        this.showToast('РЕСПАУН!');
      }
      this.updateVisuals(dt);
    } else {
      // Покачивание в меню ожидания старта
      this.ocean.update(dt * 0.5, 0);
      this.updateVisuals(dt * 0.5);
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateGame(dt) {
    // 1. Ввод
    this.input.update(dt);

    // 2. Опрос единой поверхности волны и океана
    const pState = this.physics.state;
    const surface = this.peelWave.getSurface(pState.x, pState.z);

    // 3. Обновление источников возмущений
    // Шум на склоне в кармане
    this.balance.updateFaceChop(surface.inPocket);
    // Зыбь: bump при прохождении гребня
    if (surface.dhdz < -0.08 && !this._bumpTriggered) {
      this.balance.triggerSwellBump(1, 0.4);
      this._bumpTriggered = true;
    } else if (surface.dhdz >= 0) {
      this._bumpTriggered = false;
    }

    // 4. Проверка коллизий с трамплинами и буйками в цикле
    this.checkCycleCollisions();

    // 5. Обновление бота-соперника в зоне 700–900 м
    this.updateRivalBot(dt);

    // 6. Шаг физики сёрфера
    const disturbances = {
      roll: this.balance.worldRoll,
      ax: this.balance.axImpulse,
      ay: 0
    };
    this.physics.update(dt, this.input.state, surface, disturbances);

    // 7. Физика жидкости в кружке
    const mugOut = this.physics.mugOutputs;
    this.balance.update(dt, pState.z, pState.speed, mugOut.jerkTilt);
    this.mug.update(dt, mugOut.ax, mugOut.ay, mugOut.mugTilt);

    // 8. Обновление объектов окружения и океана
    this.ocean.update(dt, pState.z);
    this.peelWave.update(dt, pState.z, pState.speed);

    // 9. Визуал и камера
    this.updateVisuals(dt);

    // 10. Телеметрия и HUD
    this.updateTelemetry(surface);
  }

  checkCycleCollisions() {
    const p = this.physics.state;
    const cycleZ = ((p.z % 900) + 900) % 900;

    // Трамплины (x ∈ [cfg.x ± 1.5], |dz| < 2.5)
    this.cycleRamps.forEach((r) => {
      const dz = Math.abs(cycleZ - r.z);
      const dx = Math.abs(p.x - r.x);
      if (dz < 2.5 && dx < 1.6 && !p.airborne) {
        this.physics.onRamp = true;
      }
    });

    // Буйки (столкновение -> bump 18° + спотыкание)
    this.cycleBuoys.forEach((b) => {
      const dz = Math.abs(cycleZ - b.z);
      const dx = Math.abs(p.x - b.x);
      if (dz < 1.2 && dx < 1.2) {
        this.physics.triggerStumble('Столкновение с буйком');
      }
    });
  }

  updateRivalBot(dt) {
    const p = this.physics.state;
    const cycleZ = ((p.z % 900) + 900) % 900;
    const bot = this.rivalBot;

    if (cycleZ >= 680 && cycleZ <= 900) {
      if (bot.mesh) {
        bot.mesh.visible = true;
        // Исправление бага 2: масштаб рига бота = масштаб игрока
        if (this.surferRig) bot.mesh.scale.copy(this.surferRig.scale);
      }

      // Исправление бага 2: спавн не ближе 15 м по Z
      if (!bot.spawned || bot.z < p.z + 15) {
        bot.z = Math.max(p.z + 20, 720);
        bot.spawned = true;
      }

      bot.z += bot.speed * dt;
      // Если бот вышел за 900 м, возвращаем на старт зоны 720 м
      if (bot.z > 900) {
        bot.z = 720;
        bot.spawned = false;
      }

      const botWorldX = SurfPhysics.toWorldX(bot.x);
      const botSurface = this.peelWave ? this.peelWave.getSurface(bot.x, bot.z) : { height: 0, slope: 0 };
      if (bot.mesh) {
        // Исправление бага 2: бот стоит на поверхности и наклонен по склону
        bot.mesh.position.set(botWorldX, botSurface.height, bot.z);
        bot.mesh.rotation.z = botSurface.slope;
      }

      // Кильватер: 10 м позади бота
      const dz = p.z - bot.z;
      const dx = Math.abs(p.x - bot.x);
      if (dz > -10.0 && dz < 0.0 && dx < 2.0) {
        this.physics.wakeBonus = 2.0; // ускорение в кильватере
        this.balance.addWake(1, 0.5);
      } else {
        this.physics.wakeBonus = 0.0;
      }

      // Столкновение с ботом
      if (Math.abs(dz) < 1.4 && dx < 1.2) {
        this.physics.triggerStumble('Столкновение с соперником');
      }
    } else {
      if (bot.mesh) bot.mesh.visible = false;
      bot.spawned = false;
      this.physics.wakeBonus = 0.0;
    }
  }

  updateVisuals(dt) {
    const p = this.physics.state;
    const surface = this.peelWave ? this.peelWave.getSurface(p.x, p.z) : { height: 0, slope: 0 };

    // 1. Позиция и ориентация рига сёрфера
    if (this.surferRig) {
      this.surferRig.position.set(p.worldX, p.y, p.z);
      this.surferRig.rotation.set(0, -p.heading + (p.spin * Math.PI / 180), p.roll);

      // Смена поз
      if (this.surferRig.userData && this.surferRig.userData.setPose) {
        this.surferRig.userData.setPose(p.pose, p.heading);
      }

      // Исправление бага 4: тень на поверхности воды под сёрфером с наклоном по slope
      const shadow = this.surferRig.getObjectByName('waterShadow');
      if (shadow) {
        shadow.position.y = -p.airY + 0.03;
        shadow.rotation.z = surface.slope;
      }
    }

    // 2. Free-roam камера (исправление бага 1 по §2 VERTICAL_SLICE_SPEC)
    // camX = p.worldX − 1.2 (коэффициент 1.0, lerp 1 − exp(−8·dt))
    const targetCamX = p.worldX - 1.2;
    const lerpRate = 1.0 - Math.exp(-8.0 * dt);
    this.camera.position.x += (targetCamX - this.camera.position.x) * lerpRate;
    this.camera.position.y += ((p.y + 3.2) - this.camera.position.y) * lerpRate;
    this.camera.position.z = p.z - 6.5; // Z жёстко без отставания!

    // Взгляд по handoff: (p.worldX + 0.8 − sin(heading)·4, p.y + 0.6, p.z + 14)
    this._camLookPos.set(
      p.worldX + 0.8 - Math.sin(p.heading) * 4.0,
      p.y + 0.6,
      p.z + 14.0
    );
    this.camera.lookAt(this._camLookPos);

    // Крен камеры = roll * 0.15 (клэмп ±5°)
    const maxCamRoll = (5.0 * Math.PI) / 180;
    const camRoll = Math.max(-maxCamRoll, Math.min(maxCamRoll, p.roll * 0.15));
    this.camera.rotation.z += camRoll;

    // Тряска камеры при приближении стены пены (< 10м, §4 ТЗ)
    if (this.peelWave && this.peelWave.camShakeBonus > 0) {
      const shake = this.peelWave.camShakeBonus;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }

    // FOV = 58 + (speed - 26) * 0.7
    const targetFov = 58.0 + (p.speed - 26.0) * 0.7;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    // 3. Рендер HUD-кружки
    if (this.mugRenderer) {
      this.mugRenderer.render(this.mug, dt, this.physics.mugOutputs.mugTilt);
    }

    // 4. Рендер 3D сцены
    this.renderer.render(this.scene, this.camera);
  }

  updateTelemetry(surface) {
    const p = this.physics.state;
    if (p.speed > this.bestSpeed) this.bestSpeed = p.speed;

    const headingDeg = (p.heading * 180 / Math.PI).toFixed(1);
    const mugTiltDeg = (this.physics.mugOutputs.mugTilt * 180 / Math.PI).toFixed(1);
    const beerPct = Math.max(0, Math.round(this.mug.level * 100));
    const foamVal = this.mug.foam.toFixed(2);

    if (this.telemetryEl) {
      this.telemetryEl.innerHTML = `
        <b>FPS:</b> ${this.fps} | 
        <b>v:</b> ${p.speed.toFixed(1)} м/с | 
        <b>x:</b> ${p.x.toFixed(1)} | 
        <b>pocket:</b> ${surface.inPocket.toFixed(2)} | 
        <b>lean:</b> ${this.input.state.lean.toFixed(2)} | 
        <b>hdg:</b> ${headingDeg}° | 
        <b>tilt:</b> ${mugTiltDeg}° | 
        <b>пиво:</b> ${beerPct}% | 
        <b>пена:</b> ${foamVal} | 
        <b>падений:</b> ${this.physics.fallCount} | 
        <b>рекорд v:</b> ${this.bestSpeed.toFixed(1)}
      `;
    }

    if (this.pocketBarInner) {
      this.pocketBarInner.style.width = `${Math.round(surface.inPocket * 100)}%`;
    }
  }

  onResize() {
    const container = document.getElementById('app-container') || document.body;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    if (this.mugRenderer) {
      this.mugRenderer.updateSize();
    }
  }
}

if (typeof window !== 'undefined') {
  window.SandboxGame = SandboxGame;
}
