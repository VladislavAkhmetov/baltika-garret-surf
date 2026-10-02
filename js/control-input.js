/**
 * Tony's Garret — Surf Rush (Sandbox v3)
 * ControlInput: Свободное управление сёрфером (§3 CONTROLS_SANDBOX_SPEC.md, HANDOFF v3)
 * 
 * Выход: input.state = {
 *   lean,     // -1 (лево, карман) .. +1 (право, плечо)
 *   hold,     // true пока палец на экране / зажат пробел (присед на воде, грэб в воздухе)
 *   holdTime, // длительность удержания в секундах
 *   released, // true ровно на 1 кадр после отпускания
 *   mode      // 'gyro' | 'drag' | 'keys'
 * }
 */

class ControlInput {
  constructor() {
    this.state = {
      lean: 0,
      hold: false,
      holdTime: 0,
      released: false,
      mode: 'gyro'
    };

    // Флаг калибровки и гироскопа
    this.hasGyro = false;
    this.gyroCalibrated = false;
    this.rawGamma = 0;
    this.rawBeta = 0;
    this.neutralGamma = 0;
    this.filteredRelGamma = 0;

    // Клавиатура
    this.keyLeft = false;
    this.keyRight = false;
    this.keySpace = false;
    this.keyLeanValue = 0;

    // Тач / Драг
    this.touchPointers = new Map(); // pointerId -> { startX, startY, currentX, currentY, isLeftHalf, isHolding }
    this.dragPointerId = null;
    this.dragStartX = 0;
    this.dragCurrentX = 0;
    this.holdPointerId = null;

    // Счётчик использования подсказок фолбэка
    this.ghostHintsUses = parseInt(localStorage.getItem('garret_ghost_hints_uses') || '0', 10);

    // Принудительный режим из URL: ?input=gyro|drag|keys
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('input');
    if (forced === 'gyro' || forced === 'drag' || forced === 'keys') {
      this.forcedMode = forced;
      this.state.mode = forced;
    } else {
      this.forcedMode = null;
    }

    this.initEventListeners();
    this.setupGhostHints();
  }

  initEventListeners() {
    // 1. Клавиатура
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // 2. Указатели (мышь / тач)
    const container = document.getElementById('app-container') || document.body;
    container.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });

    // 3. Гироскоп
    window.addEventListener('deviceorientation', (e) => this.onDeviceOrientation(e));
  }

  setupGhostHints() {
    const leftHint = document.getElementById('ghost-hint-left');
    const rightHint = document.getElementById('ghost-hint-right');
    if (this.state.mode === 'drag' && this.ghostHintsUses < 3) {
      if (leftHint) leftHint.classList.remove('hide');
      if (rightHint) rightHint.classList.remove('hide');
    } else {
      if (leftHint) leftHint.classList.add('hide');
      if (rightHint) rightHint.classList.add('hide');
    }
  }

  recordHintUse() {
    this.ghostHintsUses++;
    localStorage.setItem('garret_ghost_hints_uses', this.ghostHintsUses.toString());
    if (this.ghostHintsUses >= 3) {
      const leftHint = document.getElementById('ghost-hint-left');
      const rightHint = document.getElementById('ghost-hint-right');
      if (leftHint) leftHint.classList.add('fade-out');
      if (rightHint) rightHint.classList.add('fade-out');
      setTimeout(() => {
        if (leftHint) leftHint.classList.add('hide');
        if (rightHint) rightHint.classList.add('hide');
      }, 500);
    }
  }

  // --- Запрос разрешений iOS и калибровка 3-2-1 ---
  async requestPermissionsAndCalibrate(onComplete) {
    if (this.forcedMode === 'drag' || this.forcedMode === 'keys') {
      this.state.mode = this.forcedMode;
      this.setupGhostHints();
      if (onComplete) onComplete(false);
      return;
    }

    let permissionGranted = false;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const resp = await DeviceOrientationEvent.requestPermission();
        if (resp === 'granted') permissionGranted = true;
      } else {
        permissionGranted = true;
      }
    } catch (err) {
      console.warn('Gyro permission error:', err);
    }

    setTimeout(() => {
      if (this.hasGyro && permissionGranted) {
        this.startCalibration(onComplete);
      } else {
        console.log('[ControlInput] Gyro not available, falling back to drag mode');
        this.state.mode = 'drag';
        this.setupGhostHints();
        if (onComplete) onComplete(false);
      }
    }, 250);
  }

  startCalibration(onComplete) {
    const samples = [];
    const startTime = performance.now();

    const sampler = () => {
      if (this.rawGamma !== undefined) {
        samples.push({ gamma: this.rawGamma, beta: this.rawBeta });
      }
      if (performance.now() - startTime < 800) {
        requestAnimationFrame(sampler);
      } else {
        let sumG = 0;
        let sumB = 0;
        for (const s of samples) {
          sumG += s.gamma;
          sumB += s.beta;
        }
        this.neutralGamma = samples.length > 0 ? (sumG / samples.length) : 0;
        this.gyroCalibrated = true;
        this.hasGyro = true;
        this.state.mode = 'gyro';
        console.log(`[ControlInput] Gyro calibrated: neutralGamma=${this.neutralGamma.toFixed(1)}°`);
        if (onComplete) onComplete(true);
      }
    };
    requestAnimationFrame(sampler);
  }

  onDeviceOrientation(e) {
    if (e.gamma === null || e.beta === null) return;
    this.hasGyro = true;

    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let gamma = e.gamma;
    let beta = e.beta;

    if (angle === 90) {
      gamma = -e.beta;
      beta = e.gamma;
    } else if (angle === -90 || angle === 270) {
      gamma = e.beta;
      beta = -e.gamma;
    } else if (angle === 180) {
      gamma = -e.gamma;
      beta = -e.beta;
    }

    this.rawGamma = gamma;
    this.rawBeta = beta;
  }

  // --- Обработка кликов и тачей ---

  onPointerDown(e) {
    // Игнорируем нажатия на кнопку настроек ⚙ и саму панель тюнинга
    if (e.target.closest('#btn-tuning-toggle, #tuning-panel, button, input, select')) return;

    const w = window.innerWidth;
    const isLeftHalf = e.clientX < w * 0.5;

    if (this.state.mode === 'drag') {
      if (isLeftHalf) {
        // Левая половина: Drag = наклон
        this.dragPointerId = e.pointerId;
        this.dragStartX = e.clientX;
        this.dragCurrentX = e.clientX;
        this.recordHintUse();
      } else {
        // Правая половина: Hold / Release
        this.holdPointerId = e.pointerId;
        this.startHold();
        this.recordHintUse();
      }
    } else {
      // Режим гироскопа или клавиатуры: любое касание = Hold
      if (this.holdPointerId === null) {
        this.holdPointerId = e.pointerId;
        this.startHold();
      }
    }
  }

  onPointerMove(e) {
    if (this.state.mode === 'drag' && e.pointerId === this.dragPointerId) {
      this.dragCurrentX = e.clientX;
    }
  }

  onPointerUp(e) {
    if (this.state.mode === 'drag' && e.pointerId === this.dragPointerId) {
      this.dragPointerId = null;
    }

    if (e.pointerId === this.holdPointerId) {
      this.holdPointerId = null;
      this.endHold();
    }
  }

  startHold() {
    this.state.hold = true;
    this.state.holdTime = 0;
    this.state.released = false;
  }

  endHold() {
    if (this.state.hold) {
      this.state.hold = false;
      this.state.released = true; // Ровно на один кадр
    }
  }

  // Забрать флаг отпускания
  consumeRelease() {
    const val = this.state.released;
    this.state.released = false;
    return val;
  }

  // --- Клавиатура ---

  onKeyDown(e) {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keyLeft = true;
        this.state.mode = 'keys';
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keyRight = true;
        this.state.mode = 'keys';
        break;
      case 'Space':
      case 'KeyW':
      case 'ArrowUp':
        e.preventDefault();
        this.keySpace = true;
        this.startHold();
        break;
    }
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keyLeft = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keyRight = false;
        break;
      case 'Space':
      case 'KeyW':
      case 'ArrowUp':
        this.keySpace = false;
        this.endHold();
        break;
    }
  }

  // --- Обновление каждый кадр ---

  update(dt) {
    const C = (CFG && CFG.surf) ? CFG.surf : {};
    const leanRange = C.leanRange || 25;
    const leanDeadzone = C.leanDeadzone || 1.5;
    const leanAlpha = C.leanAlpha || 0.45;
    const leanCurve = C.leanCurve || 1.3;

    // 1. Счётчик времени удержания (holdTime)
    if (this.state.hold) {
      this.state.holdTime += dt;
    }

    // 2. Вычисление lean по активному режиму
    if (this.state.mode === 'gyro') {
      let rel = (this.rawGamma || 0) - (this.neutralGamma || 0);

      // Мёртвая зона (1.5°)
      if (Math.abs(rel) < leanDeadzone) {
        rel = 0;
      } else {
        rel -= Math.sign(rel) * leanDeadzone;
      }

      // Low-pass фильтр
      this.filteredRelGamma = this.filteredRelGamma * (1 - leanAlpha) + rel * leanAlpha;

      // Нормализация в [-1, 1]
      // Наклон телефона влево (гамма < 0) -> lean < 0 (поворот влево)
      // Наклон телефона вправо (гамма > 0) -> lean > 0 (поворот вправо)
      let norm = Math.max(-1, Math.min(1, this.filteredRelGamma / leanRange));
      const sign = Math.sign(norm);
      this.state.lean = sign * Math.pow(Math.abs(norm), leanCurve);

    } else if (this.state.mode === 'drag') {
      if (this.dragPointerId !== null) {
        const dx = this.dragCurrentX - this.dragStartX;
        const norm = Math.max(-1, Math.min(1, dx / 80.0));
        const sign = Math.sign(norm);
        this.state.lean = sign * Math.pow(Math.abs(norm), leanCurve);
      } else {
        // Плавный пружинный возврат к 0 при отпускании пальца
        this.state.lean += (0 - this.state.lean) * Math.min(1, dt / 0.20);
        if (Math.abs(this.state.lean) < 0.001) this.state.lean = 0;
      }

    } else if (this.state.mode === 'keys') {
      // Клавиатура: плавный набор 0 -> 1 за 0.25 с (скорость 4.0/с)
      let targetLean = 0;
      if (this.keyLeft && !this.keyRight) targetLean = -1;
      else if (this.keyRight && !this.keyLeft) targetLean = 1;

      if (targetLean !== 0) {
        const dir = Math.sign(targetLean - this.keyLeanValue);
        this.keyLeanValue += dir * (dt / 0.25);
        if (dir > 0 && this.keyLeanValue > targetLean) this.keyLeanValue = targetLean;
        if (dir < 0 && this.keyLeanValue < targetLean) this.keyLeanValue = targetLean;
      } else {
        this.keyLeanValue += (0 - this.keyLeanValue) * Math.min(1, dt / 0.20);
        if (Math.abs(this.keyLeanValue) < 0.001) this.keyLeanValue = 0;
      }
      this.state.lean = this.keyLeanValue;
    }
  }
}

if (typeof window !== 'undefined') {
  window.ControlInput = ControlInput;
}
