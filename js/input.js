/**
 * Tony's Garret — Surf Rush
 * InputManager: Единый менеджер ввода (Гироскоп, Свайпы, Кнопки, Клавиатура)
 * Выход: input.state = { targetX, laneIndex, jumpPressed, duckPressed, tilt, tiltRate, mode }
 */

class InputManager {
  constructor() {
    this.state = {
      targetX: 0,
      laneIndex: 1, // 0 = лево (-2.4), 1 = центр (0), 2 = право (2.4)
      jumpPressed: false,
      duckPressed: false,
      tilt: 0,       // радианы (наклон кружки)
      tiltRate: 0,   // рад/с
      mode: 'swipe'  // 'gyro' | 'swipe' | 'buttons'
    };

    this.prevTilt = 0;
    this.prevTime = performance.now();

    // Гироскоп состояние
    this.hasGyro = false;
    this.gyroCalibrated = false;
    this.rawGamma = 0;
    this.rawBeta = 0;
    this.neutralGamma = 0;
    this.neutralBeta = 0;
    this.filteredRelGamma = 0;
    this.recentAccelerations = []; // { time, y }
    this.lastFlickTime = 0;

    // Свайпы состояние
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.isSwiping = false;

    // Плавный переход полос при свайпах/клавиатуре
    this.isTransitioningLane = false;
    this.laneTransitionStart = 0;
    this.laneStartX = 0;
    this.laneTargetX = 0;
    this.duckTimer = 0;

    // Чтение URL параметров
    const params = new URLSearchParams(window.location.search);
    const forcedInput = params.get('input');
    if (forcedInput === 'gyro' || forcedInput === 'swipe' || forcedInput === 'buttons') {
      this.forcedMode = forcedInput;
      this.state.mode = forcedInput;
    } else {
      this.forcedMode = null;
    }

    this.initEventListeners();
  }

  initEventListeners() {
    // 1. Клавиатура
    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    // 2. Указатели / Тач (Свайпы и прыжок по тапу)
    const app = document.getElementById('app-container') || document.body;
    app.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    app.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    app.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    app.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });

    // 3. Тач-кнопки (если активны)
    this.setupButtonListeners();

    // 4. Слушатели сенсоров движения
    window.addEventListener('deviceorientation', (e) => this.onDeviceOrientation(e));
    window.addEventListener('devicemotion', (e) => this.onDeviceMotion(e));
  }

  setupButtonListeners() {
    const btnLeft = document.getElementById('btn-touch-left');
    const btnRight = document.getElementById('btn-touch-right');
    const btnJump = document.getElementById('btn-touch-jump');

    if (btnLeft) {
      btnLeft.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.shiftLane(-1);
      });
    }
    if (btnRight) {
      btnRight.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.shiftLane(1);
      });
    }
    if (btnJump) {
      btnJump.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.triggerJump();
      });
    }

    // Показывать/скрывать кнопки в зависимости от режима
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

  // --- Запрос разрешений iOS и калибровка ---
  async requestPermissionsAndCalibrate(onComplete) {
    if (this.forcedMode === 'swipe' || this.forcedMode === 'buttons') {
      this.setMode(this.forcedMode);
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

      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        await DeviceMotionEvent.requestPermission();
      }
    } catch (err) {
      console.warn('Gyro permission request error:', err);
    }

    // Проверяем, приходят ли реальные данные гироскопа
    setTimeout(() => {
      if (this.hasGyro && permissionGranted) {
        this.startCalibration(onComplete);
      } else {
        console.log('Gyro not available or denied, falling back to swipe');
        this.setMode('swipe');
        if (onComplete) onComplete(false);
      }
    }, 250);
  }

  startCalibration(onComplete) {
    // 1 секунда сбора нейтральных значений
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
        this.setMode('gyro');
        console.log(`Gyro calibrated: neutralGamma=${this.neutralGamma.toFixed(1)}, neutralBeta=${this.neutralBeta.toFixed(1)}`);
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

  onDeviceMotion(e) {
    if (!e.accelerationIncludingGravity) return;
    const ay = e.accelerationIncludingGravity.y || 0;
    const now = performance.now();

    this.recentAccelerations.push({ time: now, y: ay });
    // Хранить только окно flickWindow (120 мс)
    while (this.recentAccelerations.length > 0 && now - this.recentAccelerations[0].time > CFG.input.flickWindow) {
      this.recentAccelerations.shift();
    }

    // Проверка рывка вверх (пик > flickThreshold)
    if (now - this.lastFlickTime > CFG.input.flickCooldown) {
      let maxDelta = 0;
      for (const a of this.recentAccelerations) {
        const diff = Math.abs(a.y - ay);
        if (diff > maxDelta) maxDelta = diff;
      }
      if (maxDelta >= CFG.input.flickThreshold) {
        this.triggerJump();
        this.lastFlickTime = now;
      }
    }
  }

  // --- Свайпы ---
  onPointerDown(e) {
    // Игнорируем нажатия на интерактивные кнопки интерфейса
    if (e.target.closest('button, .clickable, .flavor-card')) return;

    this.touchStartX = e.clientX;
    this.touchStartY = e.clientY;
    this.touchStartTime = performance.now();
    this.isSwiping = true;
  }

  onPointerMove(e) {
    if (!this.isSwiping) return;
    // Опционально: отслеживание драга
  }

  onPointerUp(e) {
    if (!this.isSwiping) return;
    this.isSwiping = false;

    const dx = e.clientX - this.touchStartX;
    const dy = e.clientY - this.touchStartY;
    const dt = performance.now() - this.touchStartTime;
    const dist = Math.hypot(dx, dy);

    // Если короткий тап без движения — это прыжок
    if (dist < 10 && dt < 250) {
      this.triggerJump();
      return;
    }

    const speed = dist / Math.max(1, dt);
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX > absY) {
      // Горизонтальный свайп
      if (absX >= CFG.input.swipeThresholdPx || speed >= CFG.input.swipeSpeedThreshold) {
        if (dx < 0) {
          this.shiftLane(-1);
        } else {
          this.shiftLane(1);
        }
      }
    } else {
      // Вертикальный свайп
      if (absY >= CFG.input.swipeThresholdPx || speed >= CFG.input.swipeSpeedThreshold) {
        if (dy < 0) {
          this.triggerJump();
        } else {
          this.triggerDuck();
        }
      }
    }
  }

  onKeyDown(e) {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.shiftLane(-1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.shiftLane(1);
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        e.preventDefault();
        this.triggerJump();
        break;
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        this.triggerDuck();
        break;
    }
  }

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

  // --- Обновление каждый кадр ---
  update(dt) {
    const now = performance.now();

    // 1. Таймер нырка
    if (this.duckTimer > 0) {
      this.duckTimer -= dt;
      if (this.duckTimer <= 0) {
        this.state.duckPressed = false;
      }
    }

    // 2. Режим управления
    if (this.state.mode === 'gyro' && this.gyroCalibrated) {
      this.updateGyro(dt);
    } else {
      this.updateSwipeOrButtons(dt, now);
    }

    // 3. Вычисление tiltRate
    this.state.tiltRate = dt > 0 ? (this.state.tilt - this.prevTilt) / dt : 0;
    this.prevTilt = this.state.tilt;
  }

  updateGyro(dt) {
    let rel = this.rawGamma - this.neutralGamma;

    // Мёртвая зона 2°
    if (Math.abs(rel) < CFG.input.gyroDeadzone) {
      rel = 0;
    } else {
      rel -= Math.sign(rel) * CFG.input.gyroDeadzone;
    }

    // Low-pass фильтр
    const alpha = CFG.input.gyroAlpha;
    this.filteredRelGamma = this.filteredRelGamma * (1 - alpha) + rel * alpha;

    // Позиционное управление: наклон вправо (rel > 0) -> вправо по экрану (-X)
    let normTilt = -(this.filteredRelGamma / CFG.input.gyroRange);
    let tx = Math.max(-1, Math.min(1, normTilt)) * 2.4;

    // Магнит полос: притяжение к ближайшей полосе, если расстояние < 0.6
    let nearestLane = 0;
    let nearestDist = 999;
    for (let i = 0; i < CFG.lanes.x.length; i++) {
      const d = Math.abs(tx - CFG.lanes.x[i]);
      if (d < nearestDist) {
        nearestDist = d;
        nearestLane = i;
      }
    }

    this.state.laneIndex = nearestLane;
    if (nearestDist < CFG.input.magnetDist) {
      tx = tx + (CFG.lanes.x[nearestLane] - tx) * CFG.input.magnetLerp;
    }

    this.state.targetX = tx;

    // tilt (наклон кружки)
    const relRad = (this.filteredRelGamma * Math.PI) / 180;
    this.state.tilt = relRad * CFG.input.tiltFactor;
  }

  updateSwipeOrButtons(dt, now) {
    // Переход между полосами по кривой ease-out-cubic
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
    }

    // В свайп-режиме tilt соответствует крену сёрфера при смене полосы
    const currentLaneX = CFG.lanes.x[this.state.laneIndex];
    const diff = this.state.targetX - currentLaneX;
    // Крен: до ±0.35 рад при движении
    this.state.tilt = -diff * 0.25;
  }

  // Очистка однократных флагов нажатия после тика логики
  consumeJump() {
    const val = this.state.jumpPressed;
    this.state.jumpPressed = false;
    return val;
  }
}

if (typeof window !== 'undefined') {
  window.InputManager = InputManager;
}
