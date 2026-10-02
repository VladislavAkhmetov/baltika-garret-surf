/**
 * Tony's Garret — Surf Rush
 * BalanceSystem (Фаза 3.5 — Баланс и возмущения, LEVEL1_SPEC §5.3)
 *
 * Модель:
 * mugTilt = worldRoll * (1 - assist) + playerTilt
 * Задача игрока — держать mugTilt ≈ 0.
 */

class BalanceSystem {
  constructor(game) {
    this.game = game;
    const C = CFG.balance;

    // Пул источников (16 штук, zero-allocation)
    this.poolSize = C.poolSize || 16;
    this.sources = [];
    for (let i = 0; i < this.poolSize; i++) {
      this.sources.push({
        id: i,
        active: false,
        type: 'wave',
        zTrigger: 0,
        zEnd: 0,
        startTime: 0,
        elapsed: 0,
        dur: 2.0,
        dir: 1, // +1 (лево / +X) или -1 (право / -X)
        maxRollRad: (12 * Math.PI) / 180,
        ax: 0,
        telegraphLead: 1.5, // секунд заранее
        waiterChecked: false,
        waiterRewarded: false,
        damped: false
      });
    }

    // Состояние баланса
    this.worldRoll = 0.0;    // радианы
    this.playerTilt = 0.0;   // радианы
    this.mugTilt = 0.0;      // радианы
    this.axImpulse = 0.0;

    // Assist: 0.4 в первом заезде, далее 0. Вкус Cherry -0.1
    this.isFirstRun = !localStorage.getItem('garret_first_run_completed');
    this.baseAssist = this.isFirstRun ? C.defaultAssist : 0.0;
    this.assist = this.baseAssist;
    this.updateFlavorAssist(game.flavorKey || 'cherry');

    // Баланс-зона (|mugTilt| < 4°)
    this.balanceZoneRad = (C.balanceZoneDeg * Math.PI) / 180;
    this.balanceContinuousTime = 0.0;
    this.isInBalanceZone = false;

    // Телеграф волн (для отображения на воде и стрелки на HUD-кружке)
    this.activeTelegraph = null; // { type, dir, timeLeft, sizeDeg }
    this.telegraphArrowEl = null;

    // Кэш запланированных событий уровня (из LEVEL1.sections)
    this.scheduledEvents = [];
    this.initLevelEvents();

    this.initHUD();
  }

  updateFlavorAssist(flavorKey) {
    let a = this.baseAssist;
    if (flavorKey === 'cherry') {
      a += CFG.balance.cherryAssistPenalty; // -0.1
    }
    this.assist = Math.max(0, Math.min(1.0, a));
  }

  initHUD() {
    this.telegraphArrowEl = document.getElementById('mug-telegraph-arrow');
    this.mugContainerEl = document.getElementById('hud-mug-container');
  }

  initLevelEvents() {
    if (typeof LEVEL1 === 'undefined' || !LEVEL1.sections) return;
    this.scheduledEvents = [];

    LEVEL1.sections.forEach((s) => {
      if (s.events) {
        s.events.forEach((e) => {
          if (['wave', 'waveS', 'swellZone', 'barrelLean'].includes(e.type)) {
            this.scheduledEvents.push({
              atM: e.atM,
              toM: e.toM || e.atM + 100,
              type: e.type,
              dir: e.dir || 1,
              size: e.size || 12,
              triggered: false,
              telegraphed: false
            });
          }
        });
      }
    });

    // Сортировка по дистанции
    this.scheduledEvents.sort((a, b) => a.atM - b.atM);
  }

  // Получить свободный слот из пула источников
  acquireSource() {
    for (let i = 0; i < this.poolSize; i++) {
      if (!this.sources[i].active) {
        const s = this.sources[i];
        s.active = true;
        s.elapsed = 0;
        s.startTime = performance.now();
        s.waiterChecked = false;
        s.waiterRewarded = false;
        s.damped = false;
        return s;
      }
    }
    return null; // пул заполнен
  }

  // -------------------------------------------------------------
  // Методы добавления возмущений (§5.3 спецификации)
  // -------------------------------------------------------------

  addWave(dir = 1, sizeDeg = 12, dur = 2.0) {
    const s = this.acquireSource();
    if (!s) return null;
    s.type = 'wave';
    s.dir = dir;
    s.dur = dur;
    s.maxRollRad = (sizeDeg * Math.PI) / 180;
    s.ax = dir * 0.45;
    s.telegraphLead = 1.5;
    return s;
  }

  addWaveS(sizeDeg = 12) {
    const s = this.acquireSource();
    if (!s) return null;
    s.type = 'waveS';
    s.dir = 1;
    s.dur = CFG.balance.types.waveS.dur; // 3.6 с
    s.maxRollRad = (sizeDeg * Math.PI) / 180;
    s.ax = 0.5;
    s.telegraphLead = 1.8;
    return s;
  }

  addSwell(dur = 5.0) {
    const s = this.acquireSource();
    if (!s) return null;
    s.type = 'swell';
    s.dir = 1;
    s.dur = dur;
    s.maxRollRad = (CFG.balance.types.swell.rollDeg * Math.PI) / 180;
    s.ax = 0;
    s.telegraphLead = 0;
    return s;
  }

  addWake(dir = 1, dur = 2.0) {
    const s = this.acquireSource();
    if (!s) return null;
    s.type = 'wake';
    s.dir = dir;
    s.dur = dur;
    s.maxRollRad = (CFG.balance.types.wake.rollDeg * Math.PI) / 180;
    s.ax = dir * 0.2;
    s.telegraphLead = 0;
    return s;
  }

  // Своя смена полосы: 7° против направления, 0.25 с импульс
  onLaneChange(steerDir, playerTilt = null) {
    if (playerTilt !== null) {
      this.playerTilt = playerTilt;
    }
    const s = this.acquireSource();
    if (!s) return null;
    s.type = 'laneChange';
    // Инерция кренит против направления движения (смена влево -> крен вправо)
    s.dir = -steerDir;
    s.dur = CFG.balance.types.laneChange.dur; // 0.25 с
    s.maxRollRad = (CFG.balance.types.laneChange.rollDeg * Math.PI) / 180;
    s.ax = -steerDir * 0.35;
    s.telegraphLead = 0;

    // Проверка официантского бонуса в момент начала смены полосы
    this.checkWaiterBonus(s);
    return s;
  }

  // Удар / спотыкание: 18° в случайную сторону + ax 1.0, спад 0.6 с
  onHit(dir = null) {
    const s = this.acquireSource();
    if (!s) return null;
    s.type = 'hit';
    s.dir = dir !== null ? dir : (Math.random() > 0.5 ? 1 : -1);
    s.dur = CFG.balance.types.hit.dur; // 0.6 с
    s.maxRollRad = (CFG.balance.types.hit.rollDeg * Math.PI) / 180;
    s.ax = s.dir * CFG.balance.types.hit.ax;
    s.telegraphLead = 0;
    return s;
  }

  // Чайка: 10° со стороны чайки, импульс 0.3 с
  onSeagull(sideDir) {
    const s = this.acquireSource();
    if (!s) return null;
    s.type = 'seagull';
    s.dir = sideDir;
    s.dur = CFG.balance.types.seagull.dur; // 0.3 с
    s.maxRollRad = (CFG.balance.types.seagull.rollDeg * Math.PI) / 180;
    s.ax = sideDir * 0.5;
    s.telegraphLead = 0;
    return s;
  }

  // В трубе: 6° в сторону стены трубы постоянно
  enterBarrel(sideDir = 1, dur = 8.0) {
    const s = this.acquireSource();
    if (!s) return null;
    s.type = 'barrelLean';
    s.dir = sideDir;
    s.dur = dur;
    s.maxRollRad = (CFG.balance.types.barrelLean.rollDeg * Math.PI) / 180;
    s.ax = sideDir * 0.15;
    s.telegraphLead = 0;
    return s;
  }

  // -------------------------------------------------------------
  // Проверка «Официантского» бонуса (§5.3)
  // Игрок заранее наклонил телефон в нужную сторону >= 60%
  // -------------------------------------------------------------
  checkWaiterBonus(source) {
    if (source.waiterChecked || source.waiterRewarded) return;
    source.waiterChecked = true;

    // Нужный наклон игрока для компенсации крена:
    // если волна/инерция кренит в +dir, игрок должен компенсировать в -dir
    const requiredSign = -source.dir;
    const requiredMag = source.maxRollRad * CFG.balance.waiterThreshold;

    const playerTilt = this.playerTilt;
    const isRightDirection = Math.sign(playerTilt) === requiredSign;
    const hasEnoughTilt = Math.abs(playerTilt) >= requiredMag;

    if (isRightDirection && hasEnoughTilt) {
      source.waiterRewarded = true;
      source.damped = true;

      // Гашение источника на 70%
      source.maxRollRad *= (1.0 - CFG.balance.waiterDamp);
      source.ax *= (1.0 - CFG.balance.waiterDamp);

      // Награда: toast «ПО-ОФИЦИАНТСКИ! +100», +1 комбо
      if (this.game) {
        this.game.stats.score += 100;
        this.game.stats.combo = (this.game.stats.combo || 0) + 1;
        this.game.showTrickSticker('ПО-ОФИЦИАНТСКИ!', '+100 ★');
        this.game.audio.playCarve(0.9);
      }
    }
  }

  // -------------------------------------------------------------
  // Обновление состояния баланса каждый кадр
  // -------------------------------------------------------------
  update(dt, playerZ, playerSpeed, playerTilt) {
    this.playerTilt = playerTilt || 0.0;

    // 1. Проверка триггеров расписания волн по Z
    this.updateScheduledWaves(playerZ, playerSpeed);

    // 2. Суммирование возмущений: worldRoll = Σ source.roll(t), axImpulse = Σ source.ax(t)
    let totalRoll = 0.0;
    let totalAx = 0.0;
    this.activeTelegraph = null;

    for (let i = 0; i < this.poolSize; i++) {
      const s = this.sources[i];
      if (!s.active) continue;

      s.elapsed += dt;
      if (s.elapsed >= s.dur) {
        s.active = false;
        continue;
      }

      const t = s.elapsed;
      const res = this.evaluateSource(s, t);
      totalRoll += res.roll;
      totalAx += res.ax;

      // Проверка официантского бонуса на пике волны
      if (!s.waiterChecked && (s.type === 'wave' || s.type === 'waveS') && t >= 0.7) {
        this.checkWaiterBonus(s);
      }
    }

    this.worldRoll = totalRoll;
    this.axImpulse = totalAx;

    // 3. Формула кружки: mugTilt = worldRoll * (1 - assist) + playerTilt
    this.mugTilt = this.worldRoll * (1.0 - this.assist) + this.playerTilt;

    // 4. Зона баланса: |mugTilt| < 4°
    const inZone = Math.abs(this.mugTilt) < this.balanceZoneRad;
    this.isInBalanceZone = inZone;

    if (inZone) {
      // Пена растет +0.08/с до foamMax
      if (this.game && this.game.mug) {
        this.game.mug.foam = Math.min(CFG.mug.foamMax, this.game.mug.foam + CFG.balance.foamBonusRate * dt);
      }

      this.balanceContinuousTime += dt;
      // 5 с подряд в балансе -> +1 комбо, toast «РОВНО ДЕРЖИШЬ»
      if (this.balanceContinuousTime >= CFG.balance.balanceHoldTime) {
        this.balanceContinuousTime = 0; // перезапуск счетчика
        if (this.game) {
          this.game.stats.combo = (this.game.stats.combo || 0) + 1;
          this.game.stats.score += 150;
          this.game.showTrickSticker('РОВНО ДЕРЖИШЬ!', '+150 ★');
          this.game.audio.playCarve(0.7);
        }
      }
    } else {
      this.balanceContinuousTime = 0.0;
    }

    // 5. Обновление UI подсветки баланс-зоны и стрелки телеграфа
    this.updateHUDIndicators();
  }

  // Вычисление формы кривой возмущения по типу
  evaluateSource(s, t) {
    let roll = 0.0;
    let ax = 0.0;
    const factor = s.damped ? (1.0 - CFG.balance.waiterDamp) : 1.0;

    switch (s.type) {
      case 'swell': {
        // Синус 0.6 Гц
        const phase = 2 * Math.PI * CFG.balance.types.swell.freq * t;
        roll = Math.sin(phase) * s.maxRollRad;
        ax = Math.cos(phase) * 0.15 * s.dir;
        break;
      }

      case 'wave': {
        // Трапеция: нарастание 0.8с -> удержание 0.6с -> спад 0.6с (всего 2.0с)
        const rampUp = CFG.balance.types.wave.rampUp;   // 0.8
        const hold = CFG.balance.types.wave.hold;       // 0.6
        const rampDown = CFG.balance.types.wave.rampDown; // 0.6
        let curve = 0;

        if (t < rampUp) {
          const prog = t / rampUp;
          curve = Math.sin(prog * Math.PI * 0.5);
        } else if (t < rampUp + hold) {
          curve = 1.0;
        } else if (t < rampUp + hold + rampDown) {
          const prog = (t - rampUp - hold) / rampDown;
          curve = Math.cos(prog * Math.PI * 0.5);
        }

        roll = curve * s.maxRollRad * s.dir * factor;
        ax = curve * s.ax * factor;
        break;
      }

      case 'waveS': {
        // Две wave подряд (+12°, затем -12°) с паузой 0.3с
        const dur1 = 1.65;
        const pause = CFG.balance.types.waveS.pause; // 0.3
        const dur2 = 1.65;
        let curve = 0;
        let dir = s.dir;

        if (t < dur1) {
          const prog = t / dur1;
          curve = Math.sin(prog * Math.PI);
          dir = s.dir;
        } else if (t < dur1 + pause) {
          curve = 0;
        } else if (t < dur1 + pause + dur2) {
          const prog = (t - dur1 - pause) / dur2;
          curve = Math.sin(prog * Math.PI);
          dir = -s.dir; // противофаза
        }

        roll = curve * s.maxRollRad * dir * factor;
        ax = curve * s.ax * dir * factor;
        break;
      }

      case 'wake': {
        // Шум 6 Гц (сумма 2 синусов с разной фазой)
        const term1 = Math.sin(2 * Math.PI * 6.0 * t);
        const term2 = Math.sin(2 * Math.PI * 8.3 * t + 1.2) * 0.5;
        const curve = (term1 + term2) * 0.66;
        roll = curve * s.maxRollRad * s.dir * factor;
        ax = curve * s.ax * factor;
        break;
      }

      case 'laneChange': {
        // Импульс 0.25 с, экспоненциальный спад
        const curve = Math.exp(-t / 0.08);
        roll = curve * s.maxRollRad * s.dir * factor;
        ax = curve * s.ax * factor;
        break;
      }

      case 'hit': {
        // 18° в случайную сторону + ax 1.0, спад 0.6 с
        const curve = Math.max(0, 1.0 - t / s.dur) * Math.cos(t * 14.0);
        roll = curve * s.maxRollRad * s.dir;
        ax = curve * s.ax;
        break;
      }

      case 'seagull': {
        // 10° со стороны чайки, импульс 0.3 с
        const curve = Math.sin((t / s.dur) * Math.PI);
        roll = curve * s.maxRollRad * s.dir;
        ax = curve * s.ax;
        break;
      }

      case 'barrelLean': {
        // Постоянный крен 6°
        roll = s.maxRollRad * s.dir * factor;
        ax = s.ax * factor;
        break;
      }
    }

    return { roll, ax };
  }

  // Расписание волн по Z
  updateScheduledWaves(playerZ, playerSpeed) {
    const leadTime = 1.5; // секунд телеграфа заранее
    const leadDist = playerSpeed * leadTime;

    this.scheduledEvents.forEach((ev) => {
      // 1. Телеграф за 1.5 с до волны
      if (!ev.telegraphed && playerZ >= ev.atM - leadDist && playerZ < ev.atM) {
        ev.telegraphed = true;
        this.triggerTelegraph(ev, playerSpeed);
      }

      // 2. Непосредственный вход в волну
      if (!ev.triggered && playerZ >= ev.atM) {
        ev.triggered = true;
        this.triggerEvent(ev);
      }
    });
  }

  triggerTelegraph(ev, speed) {
    const timeLeft = Math.max(0.1, (ev.atM - this.game.player.z) / Math.max(10, speed));
    this.activeTelegraph = {
      type: ev.type,
      dir: ev.dir,
      size: ev.size,
      timeLeft: timeLeft
    };

    // Наклон полосы воды в ocean.js (виден заранее на подходе!)
    if (this.game && this.game.ocean && this.game.ocean.setTilt) {
      const z0 = ev.atM - 20;
      const z1 = ev.toM || (ev.atM + 60);
      const angleRad = (ev.size * Math.PI) / 180 * ev.dir;
      this.game.ocean.setTilt(z0, z1, angleRad);
    }

    // Звук нарастающего гула волны
    if (this.game && this.game.audio) {
      this.game.audio.playCarve(0.5);
    }
  }

  triggerEvent(ev) {
    switch (ev.type) {
      case 'wave':
        this.addWave(ev.dir, ev.size, 2.0);
        break;
      case 'waveS':
        this.addWaveS(ev.size);
        break;
      case 'swellZone':
        this.addSwell((ev.toM - ev.atM) / Math.max(10, this.game.player.speed));
        break;
      case 'barrelLean':
        this.enterBarrel(1, (ev.toM - ev.atM) / Math.max(10, this.game.player.speed));
        break;
    }
  }

  updateHUDIndicators() {
    // Подсветка зоны баланса
    if (this.mugContainerEl) {
      if (this.isInBalanceZone) {
        this.mugContainerEl.classList.add('balance-glow');
      } else {
        this.mugContainerEl.classList.remove('balance-glow');
      }
    }

    // Стрелка-телеграф на HUD-кружке (◀ или ▶ или zigzag ⚡)
    if (this.telegraphArrowEl) {
      if (this.activeTelegraph) {
        this.telegraphArrowEl.classList.remove('hide');
        const isLeft = this.activeTelegraph.dir > 0;
        this.telegraphArrowEl.textContent = this.activeTelegraph.type === 'waveS' ? '⚡' : (isLeft ? '◀' : '▶');
        this.telegraphArrowEl.className = isLeft ? 'telegraph-arrow arrow-left' : 'telegraph-arrow arrow-right';
      } else {
        this.telegraphArrowEl.classList.add('hide');
      }
    }
  }

  // Список активных источников для debug-оверлея
  getActiveSourcesSummary() {
    const list = [];
    for (let i = 0; i < this.poolSize; i++) {
      if (this.sources[i].active) {
        list.push(`${this.sources[i].type}(${this.sources[i].dir > 0 ? '+' : '-'}${((this.sources[i].maxRollRad * 180) / Math.PI).toFixed(0)}°)`);
      }
    }
    return list.length > 0 ? list.join(', ') : 'штиль';
  }
}

if (typeof window !== 'undefined') {
  window.BalanceSystem = BalanceSystem;
}
