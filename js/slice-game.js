/**
 * Tony's Garret — Surf Rush (Vertical Slice 45s)
 * SliceGame: Главный оркестратор вертикального среза 45 секунд (~1300 м)
 * (§1, §3, §5, §6, §7, §8 VERTICAL_SLICE_SPEC.md)
 */

class SliceGame extends SandboxGame {
  constructor() {
    super();
    console.log('[SliceGame] Initialized Vertical Slice 45s (~1300m)');

    // 1. Инициализация ключевых систем среза
    this.fx = new FxDirector(this);
    this.script = SLICE_SCRIPT;
    this.rivalsManager = new SliceRivals(this);

    // Золотистый лагер / Hard Drink по главному арт-референсу (media_1790951632188)
    if (this.mugRenderer) {
      this.mugRenderer.setColor('lemon');
    }

    // Состояние сценария
    this.currentBeatIndex = 0;
    this.currentBeat = this.script.beats[0];
    this.sliceScore = 0;
    this.sliceCombo = 1;
    this.sliceCapsCollected = 0;
    this.totalCaps = 28;
    this.hasGoldCap = false;
    this.raceStartTime = 0;
    this.raceFinishTime = 0;
    this.isRaceFinished = false;

    // Интро-синематика (3 с)
    this.isIntro = false;
    this.introTimer = 0.0;
    this.introDuration = 3.0;

    // Подсказки обучения (Caveat)
    this.tutorialHintEl = document.getElementById('slice-tutorial-hint');
    this.tutorialTextEl = document.getElementById('slice-hint-text');
    this.tutorialTimer = 0.0;
    this.shownHints = new Set();

    // HUD элементы среза
    this.rankBadgeEl = document.getElementById('slice-rank-badge');
    this.capsCountEl = document.getElementById('slice-caps-count');
    this.progressBarEl = document.getElementById('slice-progress-bar');
    this.iconPlayerEl = document.getElementById('slice-icon-player');
    this.iconTonyEl = document.getElementById('slice-icon-tony');
    this.iconKiterEl = document.getElementById('slice-icon-kiter');
    this.scoreLabelEl = document.getElementById('slice-score-label');
    this.comboBadgeEl = document.getElementById('slice-combo-badge');
    this.speedLinesEl = document.getElementById('speed-lines');

    // Эффекты скорости (§5)
    this.pocketFovImpulse = 0.0;
    this.pocketShake = 0.0;
    this.prevInPocket = 0.0;
    this.initSpeedVFX();

    // Спавн 3D объектов сценария
    this.initScriptObjects();

    // Привязка кнопок финишной карточки
    this.initResultsScreen();

    // Проверка query-параметра ?beat=<id>
    this.checkBeatUrlParam();
  }

  // =========================================================================
  // 1. Эффекты скорости (§5 ТЗ)
  // =========================================================================
  initSpeedVFX() {
    // А. Пул 40 бумажных капель-наклеек из-под доски
    this.boardSprayPool = [];
    const sprayGeo = new THREE.PlaneGeometry(0.35, 0.35);

    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1C1A22'; ctx.lineWidth = 4; ctx.stroke();
    const sprayTex = new THREE.CanvasTexture(canvas);

    const sprayMat = new THREE.MeshBasicMaterial({
      map: sprayTex,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide
    });

    const sprayGroup = new THREE.Group();
    sprayGroup.name = 'boardSprayGroup';
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(sprayGeo, sprayMat);
      mesh.visible = false;
      sprayGroup.add(mesh);
      this.boardSprayPool.push({
        mesh, x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 0.4
      });
    }
    this.scene.add(sprayGroup);

    // Б. Пул 30 кремовых бликов пены на воде (бегут навстречу)
    this.foamFleckPool = [];
    const fleckGeo = new THREE.PlaneGeometry(0.6, 1.2);
    fleckGeo.rotateX(-Math.PI * 0.5);

    const fCanvas = document.createElement('canvas');
    fCanvas.width = 64; fCanvas.height = 128;
    const fCtx = fCanvas.getContext('2d');
    fCtx.fillStyle = '#F6F1E4'; // --foam
    fCtx.beginPath(); fCtx.ellipse(32, 64, 26, 52, 0, 0, Math.PI * 2); fCtx.fill();
    fCtx.strokeStyle = 'rgba(28, 26, 34, 0.25)'; fCtx.lineWidth = 3; fCtx.stroke();
    const fleckTex = new THREE.CanvasTexture(fCanvas);

    const fleckMat = new THREE.MeshBasicMaterial({
      map: fleckTex,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });

    const fleckGroup = new THREE.Group();
    fleckGroup.name = 'foamFleckGroup';
    for (let i = 0; i < 30; i++) {
      const mesh = new THREE.Mesh(fleckGeo, fleckMat);
      fleckGroup.add(mesh);
      this.foamFleckPool.push({
        mesh,
        relX: (Math.random() - 0.5) * 12.0,
        relZ: Math.random() * 80.0
      });
    }
    this.scene.add(fleckGroup);
  }

  emitBoardSpray(dt, speed, heading, inPocket) {
    const intensity = speed * (Math.abs(heading) * 1.5 + inPocket * 0.8);
    const count = Math.min(4, Math.floor(intensity * dt * 8.0));
    if (count <= 0) return;

    const p = this.physics.state;
    const sign = heading >= 0 ? -1 : 1;

    for (let c = 0; c < count; c++) {
      const free = this.boardSprayPool.find(p => p.life <= 0);
      if (!free) break;

      free.x = p.worldX + sign * 0.4 + (Math.random() - 0.5) * 0.2;
      free.y = p.y + 0.15;
      free.z = p.z - 0.5;

      free.vx = sign * (1.5 + Math.random() * 3.5);
      free.vy = 1.0 + Math.random() * 2.5;
      free.vz = -speed * 0.4 - Math.random() * 8.0;

      free.life = 0.35;
      free.maxLife = 0.35;
      free.mesh.visible = true;
      free.mesh.position.set(free.x, free.y, free.z);
    }
  }

  updateBoardSpray(dt) {
    this.boardSprayPool.forEach(p => {
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 9.8 * dt;

        p.mesh.position.set(p.x, p.y, p.z);
        const alpha = Math.max(0, p.life / p.maxLife);
        p.mesh.scale.setScalar(alpha);

        if (p.life <= 0) p.mesh.visible = false;
      }
    });
  }

  updateFoamFlecks(dt, playerZ, speed) {
    const wave = this.peelWave;
    this.foamFleckPool.forEach(f => {
      f.relZ -= speed * dt * 0.95;
      if (f.relZ < -15.0) {
        f.relZ = 65.0 + Math.random() * 20.0;
        f.relX = (Math.random() - 0.5) * 14.0;
      }

      const worldX = SurfPhysics.toWorldX(f.relX);
      const worldZ = playerZ + f.relZ;
      const surface = wave ? wave.getSurface(f.relX, worldZ) : { height: 0, slope: 0 };

      f.mesh.position.set(worldX, surface.height + 0.04, worldZ);
      f.mesh.rotation.z = surface.slope;
    });
  }

  // =========================================================================
  // 2. Спавн 3D объектов сценария из SLICE_SCRIPT (§3 ТЗ)
  // =========================================================================
  initScriptObjects() {
    this.scriptMeshObjects = [];

    this.script.objects.forEach((cfg) => {
      const worldX = SurfPhysics.toWorldX(cfg.x);

      if (cfg.type.startsWith('cap_')) {
        const item = this.entities.buildCapMesh(cfg.type);
        const surface = this.peelWave ? this.peelWave.getSurface(cfg.x, cfg.z) : { height: 0, slope: 0 };
        const capY = cfg.type === 'cap_high' ? 4.2 : surface.height + 0.55;

        item.mesh.position.set(worldX, capY, cfg.z);
        item.mesh.rotation.z = surface.slope;
        this.scene.add(item.mesh);

        this.scriptMeshObjects.push({
          type: cfg.type,
          x: cfg.x,
          z: cfg.z,
          y: capY,
          mesh: item.mesh,
          collected: false,
          isHigh: cfg.type === 'cap_high',
          isGold: cfg.type === 'cap_gold',
          rotSpeed: item.rotSpeed || 8.0
        });
      } else if (cfg.type === 'ramp_wave') {
        const ramp = this.entities.createRamp(worldX, cfg.z);
        ramp.scale.set(1.5, 1.4, 1.3);
        const surface = this.peelWave ? this.peelWave.getSurface(cfg.x, cfg.z) : { height: 0, slope: 0 };
        ramp.position.y = surface.height;
        this.scriptMeshObjects.push({
          type: 'ramp',
          x: cfg.x,
          z: cfg.z,
          mesh: ramp,
          isMega: true
        });
      } else if (cfg.type === 'buoy' || cfg.type === 'finish_buoy') {
        const buoy = this.entities.createBuoy(worldX, cfg.z);
        const surface = this.peelWave ? this.peelWave.getSurface(cfg.x, cfg.z) : { height: 0, slope: 0 };
        buoy.position.y = surface.height;
        this.scriptMeshObjects.push({
          type: cfg.type,
          x: cfg.x,
          z: cfg.z,
          mesh: buoy
        });
      } else if (cfg.type === 'lip_throw') {
        // Конфигурация выброса губы
        this.scriptMeshObjects.push({
          type: 'lip_throw',
          z: cfg.z,
          triggered: false
        });
      }
    });
  }

  // =========================================================================
  // 3. Быстрый переход по битам (?beat=<id>)
  // =========================================================================
  checkBeatUrlParam() {
    if (typeof window !== 'undefined' && window.location) {
      const p = new URLSearchParams(window.location.search);
      const beatId = p.get('beat');
      if (beatId) {
        this.jumpToBeat(beatId);
      }
    }
  }

  jumpToBeat(beatId) {
    const beat = this.script.getBeatById(beatId);
    if (!beat) return;

    console.log(`[SliceGame] Jumping to beat: ${beat.id} (${beat.fromM}m)`);
    this.currentBeat = beat;
    this.currentBeatIndex = this.script.beats.indexOf(beat);

    const startZ = Math.max(0, beat.fromM);
    const startX = beat.id === 'pocket' ? 1.0 : (beat.id === 'shoulder' ? 6.0 : 2.0);

    this.physics.reset(startX, startZ);
    this.snapCamera();
    this.rivalsManager.reset(startZ);

    if (this.peelWave) {
      this.peelWave.peelZ = startZ - 14.0;
    }

    if (beat.hint) {
      this.showTutorialHint(beat.hint);
    }
  }

  // =========================================================================
  // 4. Старт заезда и Интро-синематика
  // =========================================================================
  async onStart() {
    await super.onStart();

    // Запуск 3-секундного интро облёта волны (§3 ТЗ)
    this.isIntro = true;
    this.introTimer = 0.0;
    this.raceStartTime = performance.now();
    this.isRaceFinished = false;

    // Сброс очков и сборщиков
    this.sliceScore = 0;
    this.sliceCombo = 1;
    this.sliceCapsCollected = 0;
    this.hasGoldCap = false;
    this.scriptMeshObjects.forEach(o => {
      if (o.collected) {
        o.collected = false;
        if (o.mesh) o.mesh.visible = true;
      }
    });
    this.rivalsManager.reset(0);

    // Скрытие карточки результатов если была открыта
    const resEl = document.getElementById('slice-results-screen');
    if (resEl) resEl.classList.add('hide');

    console.log('[SliceGame] Race started! Intro 3s cinematic active...');
  }

  showTutorialHint(text) {
    if (!this.tutorialHintEl || !this.tutorialTextEl) return;
    this.tutorialTextEl.textContent = text;
    this.tutorialHintEl.classList.remove('hide');
    this.tutorialTimer = 3.2;
  }

  // =========================================================================
  // 5. Главный цикл анимации (override animate с realDt и timeScale)
  // =========================================================================
  animate(time) {
    requestAnimationFrame(this.animate);

    if (!this.lastTime) {
      this.lastTime = time;
      return;
    }

    const realDt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    // Обновление FxDirector в реальном времени (§6.2)
    if (this.fx) {
      this.fx.update(realDt);
    }

    if (this.isPaused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Игровой dt с учетом замедления timeScale от FxDirector
    const gameDt = realDt * (this.fx ? this.fx.timeScale : 1.0);

    if (this.isIntro) {
      this.updateIntroCinematic(realDt);
      this.updateVisuals(realDt);
    } else if (this.state === 'playing') {
      this.updateGame(gameDt, realDt);
    } else {
      this.ocean.update(gameDt * 0.5, 0);
      this.updateVisuals(gameDt * 0.5);
    }
  }

  updateIntroCinematic(realDt) {
    this.introTimer += realDt;
    const progress = Math.min(1.0, this.introTimer / this.introDuration);
    const p = this.physics.state;

    // Траектория облёта волны сбоку за спину (§3 ТЗ):
    // t=0: сбоку сверху (x=8, y=6, z=+12), смотрит на завиток волны и сёрфера
    // t=1: за спиной сёрфера (camX=worldX-1.2, camY=3.2, camZ=z-6.5)
    const smoothT = progress * progress * (3.0 - 2.0 * progress);

    const startCamX = 7.5;
    const startCamY = 6.2;
    const startCamZ = p.z + 10.0;

    const endCamX = p.worldX - 1.2;
    const endCamY = p.y + 3.2;
    const endCamZ = p.z - 6.5;

    this.camera.position.x = startCamX + (endCamX - startCamX) * smoothT;
    this.camera.position.y = startCamY + (endCamY - startCamY) * smoothT;
    this.camera.position.z = startCamZ + (endCamZ - startCamZ) * smoothT;

    const lookX = p.worldX + (1.0 - smoothT) * 2.0;
    const lookY = p.y + 1.2;
    const lookZ = p.z + (1.0 - smoothT) * 8.0 + 4.0;
    this.camera.lookAt(lookX, lookY, lookZ);

    if (progress >= 1.0) {
      this.isIntro = false;
      // Стоп-кадр старта «ЛОВИ / ВОЛНУ» (§6.4 LEVEL1, §3 VERTICAL_SLICE_SPEC)
      if (this.fx) {
        this.fx.moment({
          word: 'ЛОВИ',
          sub: 'ВОЛНУ',
          tone: 'yellow',
          freeze: 600,
          priority: 3,
          sound: 'slam'
        });
      }
      this.showTutorialHint('НАКЛОНЯЙ — ПОВОРАЧИВАЙ ↘');
    }
  }

  // =========================================================================
  // 6. Обновление игры (override updateGame)
  // =========================================================================
  updateGame(dt, realDt = 0.016) {
    const p = this.physics.state;

    // 1. Определение текущего бита сценария
    const beat = this.script.getBeatAt(p.z);
    if (beat !== this.currentBeat) {
      this.onBeatEnter(beat);
    }

    // 2. Обработка ввода
    this.input.update(dt);

    // 3. Поверхность волны
    const surface = this.peelWave ? this.peelWave.getSurface(p.x, p.z) : { height: 0, slope: 0, inPocket: 0 };

    // 4. Проверка сбора крышек и взаимодействия с объектами
    this.updateScriptInteractions(dt, p, surface);

    // 5. Обновление соперников (Тони и Кайтер)
    if (this.rivalsManager) {
      this.rivalsManager.update(dt, p, this.currentBeat);
    }

    // 6. Шаг физики сёрфера
    const disturbances = {
      roll: this.balance.worldRoll,
      ax: this.balance.axImpulse,
      ay: 0
    };
    this.physics.update(dt, this.input.state, surface, disturbances);

    // 7. Физика кружки
    const mugOut = this.physics.mugOutputs;
    this.balance.update(dt, p.z, p.speed, mugOut.jerkTilt);
    this.mug.update(dt, mugOut.ax, mugOut.ay, mugOut.mugTilt);

    // 8. Обновление волны и океана
    this.ocean.update(dt, p.z);
    this.peelWave.update(dt, p.z, p.speed);

    // 9. Эффекты скорости (§5)
    this.emitBoardSpray(dt, p.speed, p.heading, surface.inPocket);
    this.updateBoardSpray(dt);
    this.updateFoamFlecks(dt, p.z, p.speed);

    // Speed lines в DOM при скорости > 31 м/с
    if (this.speedLinesEl) {
      if (p.speed > 31.0) {
        this.speedLinesEl.classList.add('barrel-active-lines');
        this.speedLinesEl.style.opacity = Math.min(1.0, (p.speed - 31.0) / 4.0);
      } else {
        this.speedLinesEl.classList.remove('barrel-active-lines');
        this.speedLinesEl.style.opacity = '0';
      }
    }

    // Импульс FOV при входе в карман (+4° на 0.3 с)
    if (surface.inPocket >= 0.6 && this.prevInPocket < 0.6) {
      this.pocketFovImpulse = 4.0;
    }
    this.prevInPocket = surface.inPocket;
    if (this.pocketFovImpulse > 0) {
      this.pocketFovImpulse = Math.max(0, this.pocketFovImpulse - dt * 13.0);
    }

    // Тряска камеры в кармане (0.04 * inPocket на 14 Гц)
    if (surface.inPocket > 0.1) {
      const shakeAmp = 0.04 * surface.inPocket;
      this.pocketShake = Math.sin(performance.now() * 0.014 * Math.PI * 2) * shakeAmp;
    } else {
      this.pocketShake = 0.0;
    }

    // 10. Визуал и камера
    this.updateVisuals(dt);

    // 11. Обновление верхнего HUD среза
    this.updateSliceHUD(p);

    // 12. Подсказки обучения
    if (this.tutorialTimer > 0) {
      this.tutorialTimer -= realDt;
      if (this.tutorialTimer <= 0 && this.tutorialHintEl) {
        this.tutorialHintEl.classList.add('hide');
      }
    }

    // 13. Проверка финиша на 1275 м
    if (p.z >= 1275.0 && !this.isRaceFinished) {
      this.onRaceFinish();
    }
  }

  onBeatEnter(beat) {
    this.currentBeat = beat;
    this.currentBeatIndex = this.script.beats.indexOf(beat);
    console.log(`[SliceGame] Beat entered: ${beat.id} (${beat.title})`);

    // Подсказка бита
    if (beat.hint && !this.shownHints.has(beat.id)) {
      this.shownHints.add(beat.id);
      this.showTutorialHint(beat.hint);
    }

    // Звук нарастающего гула в rise
    if (beat.id === 'rise' && this.audio && this.audio.playCarve) {
      this.audio.playCarve(0.9);
    }
  }

  // =========================================================================
  // 7. Сбор крышек и столкновения
  // =========================================================================
  updateScriptInteractions(dt, p, surface) {
    // Вращение крышек
    this.scriptMeshObjects.forEach(obj => {
      if (obj.mesh && !obj.collected && obj.type.startsWith('cap_')) {
        obj.mesh.rotation.y += (obj.rotSpeed || 8.0) * dt;

        // Проверка сбора крышки
        const dz = Math.abs(p.z - obj.z);
        const dx = Math.abs(p.x - obj.x);
        const dy = Math.abs(p.y - obj.y);

        if (dz < 1.4 && dx < 1.3 && dy < 1.6) {
          this.collectCap(obj);
        }
      } else if (obj.type === 'ramp') {
        // Трамплин в кармане (launch beat)
        const dz = Math.abs(p.z - obj.z);
        const dx = Math.abs(p.x - obj.x);
        if (dz < 3.2 && dx < 2.0 && !p.airborne) {
          this.physics.onRamp = true;
        }
      } else if (obj.type === 'buoy') {
        // Буёк на слаломе (shoulder beat)
        const dz = Math.abs(p.z - obj.z);
        const dx = Math.abs(p.x - obj.x);
        if (dz < 1.2 && dx < 1.2) {
          this.physics.triggerStumble('Столкновение с буйком');
        }
      } else if (obj.type === 'lip_throw' && !obj.triggered) {
        // Выброс губы волны по сценарию (520м, 760м)
        if (p.z >= obj.z - 25.0) {
          obj.triggered = true;
          if (this.peelWave) {
            this.peelWave.activeThrow = {
              zStart: obj.z,
              zEnd: obj.z + 14.0,
              timer: 1.45,
              totalDur: 1.45
            };
          }
        }
      }
    });

    // Накачка на спусках волн в бите pump (§3 ТЗ)
    if (this.currentBeat && this.currentBeat.id === 'pump') {
      if (surface.dhdz < -0.06 && this.input.state.crouch > 0.6) {
        if (!this._pumpRewardCooldown) {
          this._pumpRewardCooldown = true;
          this.addScore(100);
          this.physics.pumpBonus = Math.min(8.0, this.physics.pumpBonus + 2.5);
          if (this.fx) this.fx.toast('НАКАЧКА! ⚡', 'yellow');
          setTimeout(() => { this._pumpRewardCooldown = false; }, 800);
        }
      }
    }
  }

  collectCap(cap) {
    cap.collected = true;
    if (cap.mesh) cap.mesh.visible = false;
    this.sliceCapsCollected++;

    if (cap.isGold) {
      this.hasGoldCap = true;
      this.addScore(1000);
      if (this.fx) {
        this.fx.moment({
          word: 'ЗОЛОТО!',
          sub: '1 ИЗ 1',
          tone: 'gold',
          freeze: 420,
          priority: 3,
          sound: 'slam'
        });
      }
    } else {
      const pts = cap.type === 'cap_palm' ? 50 : 25;
      this.addScore(pts);
      if (this.audio && this.audio.playCarve) {
        this.audio.playCarve(0.4);
      }
    }
  }

  addScore(pts) {
    this.sliceScore += pts * this.mug.multiplier;
  }

  // =========================================================================
  // 8. Финиш заезда и Карточка результата (§8 ТЗ)
  // =========================================================================
  onRaceFinish() {
    this.isRaceFinished = true;
    this.raceFinishTime = performance.now();
    const totalSec = Math.max(1, (this.raceFinishTime - this.raceStartTime) / 1000);

    const beerPct = Math.round(this.mug.level * 100);
    const rank = this.rivalsManager ? this.rivalsManager.getPlayerRank(this.physics.state.z) : 1;

    // Плавное торможение
    this.physics.state.speed *= 0.5;

    // Стоп-кадр «ДОВЁЗ! / N%» (§6.4 LEVEL1, §8 VERTICAL_SLICE_SPEC)
    if (this.fx) {
      this.fx.moment({
        word: 'ДОВЁЗ!',
        sub: `${beerPct}%`,
        tone: 'gold',
        freeze: 800,
        priority: 3,
        sound: 'crowd'
      });
    }

    // Звёзды: ★ финиш, ★★ пиво >= 70%, ★★★ 1-е место + золото
    let stars = '★';
    if (beerPct >= 70) stars = '★★';
    if (rank === 1 && this.hasGoldCap && beerPct >= 70) stars = '★★★';

    // Заполнение полей карточки
    const resEl = document.getElementById('slice-results-screen');
    const timeStr = `0:${Math.floor(totalSec).toString().padStart(2, '0')}.${Math.floor((totalSec % 1) * 10)}`;

    document.getElementById('res-time').textContent = timeStr;
    document.getElementById('res-place').textContent = `${rank}/3`;
    document.getElementById('res-beer').textContent = `${beerPct}%`;
    document.getElementById('res-caps').textContent = `${this.sliceCapsCollected} / ${this.totalCaps}`;
    document.getElementById('res-gold').textContent = this.hasGoldCap ? 'ДА ★' : 'НЕТ';
    document.getElementById('res-score').textContent = this.sliceScore.toString();
    document.getElementById('results-stars').textContent = stars;

    // Показ карточки через 1.1 с (после завершения стоп-кадра)
    setTimeout(() => {
      if (this.fx && this.fx.momentBox) {
        this.fx.momentBox.classList.remove('fx-moment-in');
        this.fx.momentBox.style.opacity = '0';
        this.fx.momentBox.style.display = 'none';
      }
      if (this.tutorialHintEl) this.tutorialHintEl.classList.add('hide');
      if (resEl) resEl.classList.remove('hide');
    }, 1100);
  }

  initResultsScreen() {
    const btnReplay = document.getElementById('btn-slice-replay');
    if (btnReplay) {
      btnReplay.addEventListener('click', () => {
        this.onStart();
      });
    }

    const btnSandbox = document.getElementById('btn-slice-sandbox');
    if (btnSandbox) {
      btnSandbox.addEventListener('click', () => {
        window.location.href = 'sandbox.html';
      });
    }
  }

  // =========================================================================
  // 9. Верхний HUD среза
  // =========================================================================
  updateSliceHUD(p) {
    // 1. Позиция (1/3, 2/3, 3/3)
    const rank = this.rivalsManager ? this.rivalsManager.getPlayerRank(p.z) : 1;
    if (this.rankBadgeEl) {
      this.rankBadgeEl.textContent = `${rank}/3`;
      this.rankBadgeEl.style.background = rank === 1 ? '#F8C83A' : '#F4ECDC';
    }

    // 2. Счётчик крышек
    if (this.capsCountEl) {
      this.capsCountEl.textContent = this.sliceCapsCollected;
    }

    // 3. Полоса прогресса (1300 м)
    const progress = Math.max(0, Math.min(1.0, p.z / this.script.totalDistance));
    if (this.progressBarEl) {
      this.progressBarEl.style.width = `${(progress * 100).toFixed(1)}%`;
    }

    // Иконки соперников на прогресс-баре
    if (this.iconPlayerEl) {
      this.iconPlayerEl.style.left = `${(progress * 100).toFixed(1)}%`;
    }
    if (this.rivalsManager) {
      const tony = this.rivalsManager.rivals[0];
      const kiter = this.rivalsManager.rivals[1];

      if (this.iconTonyEl && tony) {
        const tonyP = Math.max(0, Math.min(1.0, tony.z / this.script.totalDistance));
        this.iconTonyEl.style.left = `${(tonyP * 100).toFixed(1)}%`;
      }
      if (this.iconKiterEl && kiter) {
        const kiterP = Math.max(0, Math.min(1.0, kiter.z / this.script.totalDistance));
        this.iconKiterEl.style.left = `${(kiterP * 100).toFixed(1)}%`;
      }
    }

    // 4. Счёт и множитель
    if (this.scoreLabelEl) {
      this.scoreLabelEl.textContent = `СЧЁТ ${this.sliceScore.toString().padStart(6, '0')}`;
    }
    if (this.comboBadgeEl) {
      this.comboBadgeEl.textContent = `×${this.mug.multiplier}`;
    }
  }

  // =========================================================================
  // 10. Камера и визуал (override updateVisuals с FOV и Shake)
  // =========================================================================
  updateVisuals(dt) {
    const p = this.physics.state;
    const surface = this.peelWave ? this.peelWave.getSurface(p.x, p.z) : { height: 0, slope: 0 };

    if (!this.isIntro) {
      // 1. Позиция рига сёрфера
      if (this.surferRig) {
        this.surferRig.position.set(p.worldX, p.y, p.z);
        this.surferRig.rotation.set(0, -p.heading + (p.spin * Math.PI / 180), p.roll);

        if (this.surferRig.userData && this.surferRig.userData.setPose) {
          this.surferRig.userData.setPose(p.pose, p.heading);
        }

        const shadow = this.surferRig.getObjectByName('waterShadow');
        if (shadow) {
          shadow.position.y = -p.airY + 0.03;
          shadow.rotation.z = surface.slope;
        }
      }

      // 2. Free-roam камера по handoff (коэф. 1.0, lerp 1 - exp(-8*dt))
      const targetCamX = p.worldX - 1.2;
      const lerpRate = 1.0 - Math.exp(-8.0 * dt);
      this.camera.position.x += (targetCamX - this.camera.position.x) * lerpRate;
      this.camera.position.y += ((p.y + 3.2) - this.camera.position.y) * lerpRate;
      this.camera.position.z = p.z - 6.5;

      // Тряска камеры (пена + карман + FxDirector)
      const shakeAmt = (this.peelWave ? this.peelWave.camShakeBonus : 0) +
                       this.pocketShake +
                       (this.fx ? this.fx.shakeAmount * 0.25 : 0);
      if (shakeAmt > 0) {
        this.camera.position.x += (Math.random() - 0.5) * shakeAmt;
        this.camera.position.y += (Math.random() - 0.5) * shakeAmt;
      }

      this._camLookPos.set(
        p.worldX + 0.8 - Math.sin(p.heading) * 4.0,
        p.y + 0.6,
        p.z + 14.0
      );
      this.camera.lookAt(this._camLookPos);

      // Крен камеры
      const maxCamRoll = (5.0 * Math.PI) / 180;
      const camRoll = Math.max(-maxCamRoll, Math.min(maxCamRoll, p.roll * 0.15));
      this.camera.rotation.z += camRoll;

      // FOV с учетом зума FxDirector и импульса кармана (§5, §6)
      const baseFov = 58.0 + (p.speed - 26.0) * 0.9 + this.pocketFovImpulse;
      const fxZoom = this.fx ? this.fx.zoomFactor : 1.0;
      const targetFov = baseFov * fxZoom;

      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov = targetFov;
        this.camera.updateProjectionMatrix();
      }
    }

    // 3. Рендер кружки
    if (this.mugRenderer) {
      this.mugRenderer.render(this.mug, dt, this.physics.mugOutputs.mugTilt);
    }

    // 4. Рендер Three.js
    this.renderer.render(this.scene, this.camera);
  }
}

if (typeof window !== 'undefined') {
  window.SliceGame = SliceGame;
}
