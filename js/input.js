/**
 * Tony's Garret — Surf Rush
 * InputManager (v2): Единый менеджер ввода (§3.4, §5.3 LEVEL1_SPEC)
 * 
 * Концепция «ДВЕ РУКИ — ДВА ДЕЛА»:
 * 1. МАРШРУТ (сёрфер по полосам):
 *    - Свайпы влево/вправо по экрану (всегда, у всех). Переход 160 мс (ease-out-cubic).
 *    - Свайп вверх: прыжок. Свайп вниз: нырок (duck, 0.6 с).
 *    - Клавиатура: стрелки / A/D (полосы), W/Space (прыжок), S (нырок).
 *    - Наэкранные кнопки — только при ?input=buttons.
 *    - ВНИМАНИЕ: рывок телефона (flick) удалён, гироскоп полосами НЕ управляет!
 * 
 * 2. БАЛАНС (кружка и пиво):
 *    - Основной (гироскоп): наклон телефона управляет ИСКЛЮЧИТЕЛЬНО углом кружки (playerTilt, ±35°).
 *    - Фолбэк без гироскопа (balanceMode: 'drag'): удержание и перетаскивание HUD-кружки (±30°),
 *      пружинный возврат к 0 за 0.25 с при отпускании.
 *    - Клавиатура: клавиши Q / E (наклон влево / вправо 120°/с, пружинный возврат к 0).
 * 
 * Единый выход:
 * input.state = {
 *   laneIndex,    // 0 = лево (+2.4), 1 = центр (0), 2 = право (-2.4)
 *   targetX,      // сглаженная X-координата смены полосы
 *   jumpPressed,  // флаг прыжка
 *   duckPressed,  // флаг нырка
 *   playerTilt,   // наклон кружки игроком в радианах (clamp ±35°)
 *   tiltRate,     // скорость изменения наклона (рад/с)
 *   balanceMode,  // 'gyro' | 'drag' | 'keys'
 *   mode          // 'swipe' | 'buttons'
 * }
 */

class InputManager {
  constructor() {
    this.state = {
      laneIndex: 1, // 0 = лево (+2.4), 1 = центр (0), 2 = право (-2.4)
      targetX: 0,
      jumpPressed: false,
      duckPressed: false,
      playerTilt: 0,       // радианы (наклон кружки игроком)
      tiltRate: 0,         // рад/с
      balanceMode: 'drag', // 'gyro' | 'drag' | 'keys'
      mode: 'swipe'        // 'swipe' | 'buttons'
    };

    this.prevTilt = 0;
    this.prevTime = performance.now();

    // 1. Состояние гироскопа
    this.hasGyro = false;
    this.gyroCalibrated = false;
    this.rawGamma = 0;
    this.rawBeta = 0;
    this.neutralGamma = 0;
    this.neutralBeta = 0;
    this.filteredRelGamma = 0;
    this.gyroTilt = 0;

    // 2. Состояние свайпов маршрута
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.isSwiping = false;
    this.swipePointerId = null;

    // 3. Состояние тач-драга баланса на HUD-кружке
    this.isDraggingMug = false;
    this.dragPointerId = null;
    this.dragStartX = 0;
    this.dragTilt = 0;

    // 4. Состояние клавиатуры Q/E для баланса
    this.keyTiltLeft = false;
    this.keyTiltRight = false;
    this.keyTilt = 0;

    // 5. Плавный переход полос (160 мс ease-out-cubic, §3.4)
    this.isTransitioningLane = false;
    this.laneTransitionStart = 0;
    this.laneStartX = 0;
    this.laneTargetX = 0;
    this.duckTimer = 0;

    // Чтение параметров URL
    const params = new URLSearchParams(window.location.search);
    const forcedInput = params.get('input');
    if (forcedInput === 'buttons') {
      this.forcedMode = 'buttons';
      this.state.mode = 'buttons';
    } else if (forcedInput === 'gyro') {
      this.forcedMode = 'gyro';
      this.state.balanceMode = 'gyro';
    } else if (forcedInput === 'swipe') {
      this.forcedMode = 'swipe';
      this.state.balanceMode = 'drag';
    } else {
      this.forcedMode = null;
    }

    this.initEventListeners();
  }

  initEventListeners() {
    // 1. Клавиатура (Маршрут + Q/E для баланса)
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // 2. Указатели / Тач (Свайпы по экрану и drag на HUD-кружке)
    const app = document.getElementById('app-container') || document.body;
    app.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    app.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    app.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    app.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });

    // 3. Наэкранные тач-кнопки (только при ?input=buttons)
    this.setupButtonListeners();

    // 4. Датчик ориентации (Гироскоп для баланса кружки)
    window.addEventListener('deviceorientation', (e) => this.onDeviceOrientation(e));
  }

  setupButtonListeners() {
    const btnLeft = document.getElementById('btn-touch-left');
    const btnRight = document.getElementById('btn-touch-right');
    const btnJump = document.getElementById('btn-touch-jump');

    if (btnLeft) {
      btnLeft.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.shiftLane(-1); // влево по экрану (+X, индекс 0)
      });
    }
    if (btnRight) {
      btnRight.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.shiftLane(1);  // вправо по экрану (-X, индекс 2)
      });
    }
    if (btnJump) {
      btnJump.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.triggerJump();
      });
    }

    this.updateButtonVisibility();
  }

  updateButtonVisibility() {
    const layer = document.getElementById('touch-controls-layer');
    if (!layer) return;
    if (this.state.mode === 'buttons' || this.forcedMode === 'buttons') {
      layer.style.display = 'flex';
    } else {
      layer.style.display = 'none';
    }
  }

  setMode(mode) {
    if (this.forcedMode) {
      this.state.mode = this.forcedMode;
    } else {
      this.state.mode = mode;
    }
    this.updateButtonVisibility();
  }

  // --- Калибровка гироскопа перед стартом (§3.4) ---
  async requestPermissionsAndCalibrate(onComplete) {
    if (this.forcedMode === 'swipe') {
      this.state.balanceMode = 'drag';
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
        console.log('Gyro unavailable, using drag balance fallback');
        this.state.balanceMode = 'drag';
        if (onComplete) onComplete(false);
      }
    }, 250);
  }

  startCalibration(onComplete) {
    // 1 секунда сбора нейтральных значений neutralGamma
    const samples = [];
    const startTime = performance.now();

    const sampler = () => {
      samples.push({ gamma: this.rawGamma, beta: this.rawBeta });
      if (performance.now() - startTime < 1000) {
        requestAnimationFrame(sampler);
      } else {
        let sumG = 0;
        let sumB = 0;
        for (const s of samples) {
          sumG += s.gamma;
          sumB += s.beta;
        }
        this.neutralGamma = sumG / samples.length;
        this.neutralBeta = sumB / samples.length;
        this.gyroCalibrated = true;
        this.state.balanceMode = 'gyro';
        console.log(`[InputManager] Gyro calibrated: neutralGamma=${this.neutralGamma.toFixed(1)}°`);
        if (onComplete) onComplete(true);
      }
    };
    requestAnimationFrame(sampler);
  }

  onDeviceOrientation(e) {
    if (e.gamma === null || e.beta === null) return;
    this.hasGyro = true;

    // Учёт ориентации экрана
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

  // --- Обработка указателей: Drag кружки и Свайпы маршрута ---

  isPointInMugZone(clientX, clientY) {
    const mugEl = document.getElementById('hud-mug-container') || document.getElementById('mug-canvas');
    if (!mugEl) return false;
    const rect = mugEl.getBoundingClientRect();
    const pad = CFG.input.dragZonePadding || 40;
    return (
      clientX >= rect.left - pad &&
      clientX <= rect.right + pad &&
      clientY >= rect.top - pad &&
      clientY <= rect.bottom + pad
    );
  }

  onPointerDown(e) {
    // Игнорируем клики по кнопкам интерфейса и плашкам меню
    if (e.target.closest('button, .clickable, .flavor-card')) return;

    // 1. Проверяем зону drag-баланса кружки (HUD-кружка + 40px вокруг, §3.4)
    if (this.isPointInMugZone(e.clientX, e.clientY)) {
      this.dragPointerId = e.pointerId;
      this.dragStartX = e.clientX;
      this.isDraggingMug = true;
      this.state.balanceMode = 'drag';
      return;
    }

    // 2. Иначе это начало маршрутного свайпа
    this.swipePointerId = e.pointerId;
    this.touchStartX = e.clientX;
    this.touchStartY = e.clientY;
    this.touchStartTime = performance.now();
    this.isSwiping = true;
  }

  onPointerMove(e) {
    // Drag на кружке
    if (this.isDraggingMug && e.pointerId === this.dragPointerId) {
      const dx = e.clientX - this.dragStartX;
      // Тянем влево (dx < 0) -> крен влево (+X, положительный угол в радианах)
      // Тянем вправо (dx > 0) -> крен вправо (-X, отрицательный угол)
      const norm = Math.max(-1, Math.min(1, -dx / (CFG.input.dragSensitivityPx || 70)));
      const maxRad = ((CFG.input.dragMaxTiltDeg || 30) * Math.PI) / 180;
      this.dragTilt = norm * maxRad;
      this.state.balanceMode = 'drag';
    }
  }

  onPointerUp(e) {
    // Завершение drag на кружке
    if (this.isDraggingMug && e.pointerId === this.dragPointerId) {
      this.isDraggingMug = false;
      this.dragPointerId = null;
    }

    // Завершение свайпа маршрута
    if (this.isSwiping && e.pointerId === this.swipePointerId) {
      this.isSwiping = false;
      this.swipePointerId = null;

      const dx = e.clientX - this.touchStartX;
      const dy = e.clientY - this.touchStartY;
      const dt = performance.now() - this.touchStartTime;
      const dist = Math.hypot(dx, dy);

      // Короткий тап без движения — прыжок
      if (dist < 10 && dt < 250) {
        this.triggerJump();
        return;
      }

      const speed = dist / Math.max(1, dt);
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absX > absY) {
        // Горизонтальный свайп смены полосы
        if (absX >= CFG.input.swipeThresholdPx || speed >= CFG.input.swipeSpeedThreshold) {
          if (dx < 0) {
            this.shiftLane(-1); // свайп влево экрана (+X, полоса 0)
          } else {
            this.shiftLane(1);  // свайп вправо экрана (-X, полоса 2)
          }
        }
      } else {
        // Вертикальный свайп: прыжок или нырок
        if (absY >= CFG.input.swipeThresholdPx || speed >= CFG.input.swipeSpeedThreshold) {
          if (dy < 0) {
            this.triggerJump(); // свайп вверх
          } else {
            this.triggerDuck(); // свайп вниз — нырок
          }
        }
      }
    }
  }

  onKeyDown(e) {
    switch (e.code) {
      // Полосы: A / D / стрелки
      case 'ArrowLeft':
      case 'KeyA':
        this.shiftLane(-1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.shiftLane(1);
        break;

      // Прыжок: W / стрелка вверх / Space
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        e.preventDefault();
        this.triggerJump();
        break;

      // Нырок: S / стрелка вниз
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        this.triggerDuck();
        break;

      // Наклон кружки на клавиатуре: Q / E (§3.4)
      case 'KeyQ':
        this.keyTiltLeft = true;
        this.state.balanceMode = 'keys';
        break;
      case 'KeyE':
        this.keyTiltRight = true;
        this.state.balanceMode = 'keys';
        break;
    }
  }

  onKeyUp(e) {
    if (e.code === 'KeyQ') {
      this.keyTiltLeft = false;
    } else if (e.code === 'KeyE') {
      this.keyTiltRight = false;
    }
  }

  // --- Переключение полос сёрфера ---

  shiftLane(dir) {
    const newLane = Math.max(0, Math.min(2, this.state.laneIndex + dir));
    if (newLane !== this.state.laneIndex) {
      this.setTargetLane(newLane);
    }
  }

  setTargetLane(laneIndex) {
    this.state.laneIndex = laneIndex;
    this.laneStartX = this.state.targetX;
    this.laneTargetX = CFG.lanes.x[laneIndex];
    this.laneTransitionStart = performance.now();
    this.isTransitioningLane = true;
  }

  triggerJump() {
    this.state.jumpPressed = true;
  }

  triggerDuck() {
    this.state.duckPressed = true;
    this.duckTimer = CFG.player.duckDuration;
  }

  // --- Игровой цикл обновления каждый кадр ---

  update(dt) {
    const now = performance.now();

    // 1. Таймер нырка
    if (this.duckTimer > 0) {
      this.duckTimer -= dt;
      if (this.duckTimer <= 0) {
        this.state.duckPressed = false;
      }
    }

    // 2. Плавный переход полосы (160 мс ease-out-cubic, §3.4)
    if (this.isTransitioningLane) {
      const elapsed = (now - this.laneTransitionStart) / 1000;
      const dur = CFG.input.swipeTransitionTime; // 0.16 с
      const progress = Math.min(1, elapsed / dur);

      // Ease-out cubic: 1 - (1 - p)^3
      const ease = 1 - Math.pow(1 - progress, 3);
      this.state.targetX = this.laneStartX + (this.laneTargetX - this.laneStartX) * ease;

      if (progress >= 1) {
        this.state.targetX = this.laneTargetX;
        this.isTransitioningLane = false;
      }
    } else {
      this.state.targetX = CFG.lanes.x[this.state.laneIndex];
    }

    // 3. Вычисление наклона кружки игроком (playerTilt)
    this.updateTilt(dt);

    // 4. Скорость изменения наклона tiltRate
    this.state.tiltRate = dt > 0 ? (this.state.playerTilt - this.prevTilt) / dt : 0;
    this.prevTilt = this.state.playerTilt;
  }

  updateTilt(dt) {
    const maxTiltRad = (CFG.input.gyroRange * Math.PI) / 180; // 35°
    const springFactor = Math.min(1, dt / (CFG.input.tiltSpringTime || 0.25));

    // А) Клавиатура Q / E
    if (this.keyTiltLeft) {
      const rateRad = ((CFG.input.tiltKeyRate || 120) * Math.PI) / 180;
      this.keyTilt = Math.min(maxTiltRad, this.keyTilt + rateRad * dt);
      this.state.balanceMode = 'keys';
    } else if (this.keyTiltRight) {
      const rateRad = ((CFG.input.tiltKeyRate || 120) * Math.PI) / 180;
      this.keyTilt = Math.max(-maxTiltRad, this.keyTilt - rateRad * dt);
      this.state.balanceMode = 'keys';
    } else if (this.state.balanceMode === 'keys') {
      // Пружинный возврат к 0 при отпускании клавиш за 0.25 с (§3.4)
      this.keyTilt += (0 - this.keyTilt) * springFactor;
      if (Math.abs(this.keyTilt) < 0.001) this.keyTilt = 0;
    }

    // Б) Тач-drag на кружке
    if (!this.isDraggingMug && this.state.balanceMode === 'drag') {
      // Пружинный возврат к 0 при отпускании пальца за 0.25 с (§3.4)
      this.dragTilt += (0 - this.dragTilt) * springFactor;
      if (Math.abs(this.dragTilt) < 0.001) this.dragTilt = 0;
    }

    // В) Гироскоп
    if (this.hasGyro && this.gyroCalibrated) {
      let rel = this.rawGamma - this.neutralGamma;

      // Мёртвая зона 1° (§3.4)
      if (Math.abs(rel) < CFG.input.gyroDeadzone) {
        rel = 0;
      } else {
        rel -= Math.sign(rel) * CFG.input.gyroDeadzone;
      }

      // Low-pass фильтр α = 0.5 (задержка <= 50 мс, §3.4)
      const alpha = CFG.input.gyroAlpha || 0.5;
      this.filteredRelGamma = this.filteredRelGamma * (1 - alpha) + rel * alpha;

      // Наклон вправо (rel > 0) -> кружка кренится вправо (-X, отрицательный угол)
      const clampedDeg = Math.max(-35, Math.min(35, this.filteredRelGamma));
      this.gyroTilt = -(clampedDeg * Math.PI) / 180;
    }

    // Г) Итоговый playerTilt по активному режиму баланса
    if (this.state.balanceMode === 'gyro' && this.hasGyro && this.gyroCalibrated) {
      this.state.playerTilt = this.gyroTilt;
    } else if (this.isDraggingMug || this.state.balanceMode === 'drag') {
      this.state.playerTilt = this.dragTilt;
    } else if (this.state.balanceMode === 'keys') {
      this.state.playerTilt = this.keyTilt;
    } else {
      this.state.playerTilt = 0;
    }
  }

  // Очистка однократного флага прыжка после обработки в кадре
  consumeJump() {
    const val = this.state.jumpPressed;
    this.state.jumpPressed = false;
    return val;
  }
}

if (typeof window !== 'undefined') {
  window.InputManager = InputManager;
}
