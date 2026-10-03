/**
 * Tony's Garret — Surf Rush (Sandbox v3)
 * SurfPhysics: Свободная физика сёрфера (§4, §5 CONTROLS_SANDBOX_SPEC.md, HANDOFF v3)
 * Шаг симуляции: 1/120 с (с накопителем времени)
 */

class SurfPhysics {
  constructor() {
    this.fixedDt = 1 / 120;
    this.accumulator = 0;

    // Состояние сёрфера
    this.state = {
      x: 2.0,            // экранный X (0 = карман, 16 = плечо)
      z: 0.0,            // расстояние вперед по Z
      worldX: -2.0,      // strictly: worldX = -x
      y: 0.0,            // итоговая 3D-высота (surface.height + airY)
      heading: 0.0,      // угол курса в радианах (0 = прямо, <0 влево, >0 вправо)
      speed: 26.0,       // текущая скорость м/с
      vy: 0.0,           // вертикальная скорость при прыжке
      airY: 0.0,         // высота над водой в воздухе
      airborne: false,   // в воздухе
      spin: 0.0,         // вращение доски вокруг Y в градусах (трюки)
      crouch: 0.0,       // степень приседания (0..1)
      roll: 0.0,         // визуальный крен доски и тела сёрфера в радианах
      pose: 'norma'      // 'norma' | 'turn' | 'crouch' | 'jump' | 'grab'
    };

    // Выходы для кружки (§5)
    this.mugOutputs = {
      jerkTilt: 0.0,
      ax: 0.0,
      ay: 0.0,
      mugTilt: 0.0
    };

    // Внутреннее состояние физики
    this.leanSmooth = 0.0;
    this.prevHeading = 0.0;
    this.pumpBonus = 0.0;
    this.wakeBonus = 0.0;
    this.onRamp = false;
    this.stumbleTimer = 0.0;
    this.lastStumbleTime = -999.0;
    this.fallCount = 0;

    // Колбэки событий
    this.onJump = null;     // (mult)
    this.onLand = null;     // (clean, spinDeg)
    this.onStumble = null;  // (reason)
    this.onWipe = null;     // (reason)
    this.onPumpGood = null; // ()
    this.onPumpBad = null;  // ()
  }

  // Строгий перевод экранного X в координаты 3D-мира Three.js (HANDOFF v3 §0.3)
  static toWorldX(x) {
    return -x;
  }

  reset(x = 2.0, z = 0.0) {
    this.state.x = x;
    this.state.z = z;
    this.state.worldX = SurfPhysics.toWorldX(x);
    this.state.y = 0.0;
    this.state.heading = 0.0;
    this.state.speed = (CFG && CFG.surf && CFG.surf.baseSpeedStart) || 26.0;
    this.state.vy = 0.0;
    this.state.airY = 0.0;
    this.state.airborne = false;
    this.state.spin = 0.0;
    this.state.crouch = 0.0;
    this.state.roll = 0.0;
    this.state.pose = 'norma';

    this.leanSmooth = 0.0;
    this.prevHeading = 0.0;
    this.pumpBonus = 0.0;
    this.wakeBonus = 0.0;
    this.onRamp = false;
    this.stumbleTimer = 0.0;
  }

  // Обновление физики с накопителем фиксированного шага 1/120 с
  update(dt, input, surface, disturbances = { roll: 0, ax: 0, ay: 0 }) {
    this.accumulator += Math.min(dt, 0.1);

    while (this.accumulator >= this.fixedDt) {
      this.step(this.fixedDt, input, surface, disturbances);
      this.accumulator -= this.fixedDt;
    }

    // Синхронизация worldX и высоты y
    this.state.worldX = SurfPhysics.toWorldX(this.state.x);
    this.state.y = surface.height + this.state.airY;

    // Вычисление входов кружки (§5)
    this.updateMugPhysics(dt, input, disturbances);

    // Определение позы сёрфера
    this.updateSurferPose(input);

    return this.state;
  }

  // Фиксированный шаг симуляции 1/120 с
  step(dt, input, surface, disturbances) {
    const C = (CFG && CFG.surf) ? CFG.surf : {};
    const maxHeadingRad = ((C.maxHeading || 38) * Math.PI) / 180;
    const turnRate = C.turnRate || 6;
    const lateralScale = C.lateralScale || 0.35;
    const pocketBoost = C.pocketBoost || 0.40;
    const carveDrag = C.carveDrag || 0.12;
    const pumpGain = C.pumpGain || 8;
    const speedResponse = C.speedResponse || 1.5;
    const pumpDecay = C.pumpDecay || 0.6;
    const pumpMax = C.pumpMax || 8;
    const jumpBase = C.jumpBase || 5;
    const jumpHold = C.jumpHold || 8;
    const gravity = C.gravity || 18;
    const spinRate = C.spinRate || 540;
    const minHoldForJump = C.minHoldForJump || 0.12;
    const rampJumpMult = C.rampJumpMult || 1.6;
    const lipJumpMult = C.lipJumpMult || 1.4;
    const trackMinX = C.trackMinX !== undefined ? C.trackMinX : -5;
    const trackMaxX = C.trackMaxX !== undefined ? C.trackMaxX : 16;

    // 1. Извлечение входов (поддержка как экземпляра ControlInput, так и объекта state)
    const lean = input.state ? input.state.lean : (input.lean !== undefined ? input.lean : 0);
    const hold = input.state ? input.state.hold : (input.hold !== undefined ? input.hold : false);
    const holdTime = input.state ? input.state.holdTime : (input.holdTime !== undefined ? input.holdTime : 0);
    const released = (typeof input.consumeRelease === 'function') ? input.consumeRelease() : (input.released !== undefined ? input.released : false);

    // Спотыкание таймер
    if (this.stumbleTimer > 0) {
      this.stumbleTimer -= dt;
    }
    const stumbleFactor = this.stumbleTimer > 0 ? 0.70 : 1.0;

    // 2. Курс и поворот (§4.1)
    // lean ∈ [-1..1]: lean < 0 поворот влево (в карман), lean > 0 поворот вправо
    const headingTarget = lean * maxHeadingRad;
    const headingLerp = 1.0 - Math.exp(-turnRate * dt);
    this.state.heading += (headingTarget - this.state.heading) * headingLerp;

    // 3. Скорость (§4.2)
    // Прогрессия базовой скорости 26 -> 34 м/с
    const cycleZ = ((this.state.z % 900) + 900) % 900;
    const baseSpeed = (C.baseSpeedStart || 26) + ((C.baseSpeedMax || 34) - (C.baseSpeedStart || 26)) * (cycleZ / 900.0);

    const pocketMult = 1.0 + pocketBoost * (surface.inPocket || 0.0);
    const headingFraction = Math.min(1.0, Math.abs(this.state.heading) / Math.max(0.001, maxHeadingRad));
    const dragMult = 1.0 - carveDrag * headingFraction;

    const targetSpeed = (baseSpeed * pocketMult * dragMult + this.pumpBonus + this.wakeBonus) * stumbleFactor;
    this.state.speed += (targetSpeed - this.state.speed) * (1.0 - Math.exp(-speedResponse * dt));

    // 4. Движение сёрфера в экранных координатах
    this.state.x += Math.sin(this.state.heading) * this.state.speed * lateralScale * dt;
    this.state.z += Math.cos(this.state.heading) * this.state.speed * dt;

    // Мягкие стены на границах трассы
    if (this.state.x < trackMinX) {
      this.state.x = trackMinX;
      // Мягкий отскок от гребня волны
      if (this.state.heading < 0) this.state.heading *= -0.3;
    } else if (this.state.x > trackMaxX) {
      this.state.x = trackMaxX;
      if (this.state.heading > 0) this.state.heading *= -0.3;
    }

    // 5. Визуальный крен сёрфера
    this.state.roll = lean * (28 * Math.PI / 180) + (surface.slope || 0.0);

    // 6. Накачка на зыби (§4.3)
    if (!this.state.airborne) {
      if (hold) {
        this.state.crouch = Math.min(1.0, this.state.crouch + dt * 6.0);

        // На склоне зыби: surface.dhdz < 0 означает движение вниз со склона
        if (surface.dhdz < -0.01) {
          this.pumpBonus += pumpGain * Math.abs(surface.dhdz) * dt;
          if (this.onPumpGood) this.onPumpGood();
        } else if (surface.dhdz > 0.01) {
          this.pumpBonus -= pumpGain * 0.5 * Math.abs(surface.dhdz) * dt;
          if (this.onPumpBad) this.onPumpBad();
        }
      } else {
        this.state.crouch = Math.max(0.0, this.state.crouch - dt * 6.0);
      }

      // Затухание бонуса накачки
      this.pumpBonus -= this.pumpBonus * pumpDecay * dt;
      this.pumpBonus = Math.max(0, Math.min(pumpMax, this.pumpBonus));
    }

    // 7. Прыжок по отпусканию пальца (§4.4)
    if (!this.state.airborne && released) {
      if (holdTime >= minHoldForJump) {
        this.state.airborne = true;
        this.state.spin = 0.0;

        const holdFactor = Math.min(holdTime, 0.6);
        let vy = jumpBase + jumpHold * holdFactor;

        let mult = 1.0;
        let jumpType = 'flat';

        if (this.onRamp) {
          mult *= rampJumpMult;
          jumpType = 'ramp';
          this.onRamp = false;
        } else if ((surface.inPocket > 0.5 || this.state.x < 0) && this.state.heading > (10 * Math.PI / 180)) {
          // Вылет с губы волны: только если в кармане (inPocket > 0.5) и движение вправо
          mult *= lipJumpMult;
          jumpType = 'lip';
        }

        this.state.vy = vy * mult;
        if (this.onJump) this.onJump(jumpType, mult);
      }
    }

    // 8. Полет в воздухе и трюки (§4.5, §4.6)
    if (this.state.airborne) {
      this.state.airY += this.state.vy * dt;
      this.state.vy -= gravity * dt;

      // Вращение доски вокруг оси Y от наклона
      this.state.spin += lean * spinRate * dt;

      // Касание поверхности воды (посадка)
      if (this.state.airY <= 0.0) {
        this.state.airY = 0.0;
        this.state.airborne = false;
        this.state.vy = 0.0;

        // Расчет чистоты посадки (§4.6)
        let spinMod = Math.abs(this.state.spin % 180);
        if (spinMod > 90) spinMod = 180 - spinMod;
        const spinErr = spinMod;

        let clean = 1.0 - Math.max(0, Math.min(1.0, (spinErr - 20.0) / 50.0));
        const hold = input.state ? input.state.hold : (input.hold !== undefined ? input.hold : false);
        if (hold) clean *= 0.5; // штраф за незавершенный грэб

        if (this.onLand) this.onLand(clean, this.state.spin);

        if (clean < 0.40) {
          this.triggerStumble('Плохая посадка');
        }
      }
    }
  }

  // Обновление входных данных для физики кружки (§5)
  updateMugPhysics(dt, input, disturbances) {
    const C = (CFG && CFG.surf) ? CFG.surf : {};
    const sloshTau = C.sloshTau || 0.35;
    const jerkGain = C.jerkGain || 1.0;
    const assist = C.assist !== undefined ? C.assist : 0.3;
    const headingAx = C.headingAx || 0.15;

    // 1. Резкость наклона jerkTilt
    const lean = input.state ? input.state.lean : (input.lean !== undefined ? input.lean : 0);
    const leanAngle = lean * (28 * Math.PI / 180);
    const alpha = 1.0 - Math.exp(-dt / sloshTau);
    this.leanSmooth += (leanAngle - this.leanSmooth) * alpha;

    const jerkTilt = (leanAngle - this.leanSmooth) * jerkGain;
    const mugTilt = jerkTilt + (disturbances.roll || 0.0) * (1.0 - assist);

    // 2. Боковое ускорение ax от виража
    const deltaHeading = (this.state.heading - this.prevHeading) / Math.max(0.001, dt);
    this.prevHeading = this.state.heading;
    const ax = (disturbances.ax || 0.0) + deltaHeading * headingAx;

    // 3. Вертикальное ускорение ay
    const ay = (this.state.vy / (CFG.mug ? CFG.mug.ayDiv : 30)) + (disturbances.ay || 0.0);

    this.mugOutputs.jerkTilt = jerkTilt;
    this.mugOutputs.mugTilt = mugTilt;
    this.mugOutputs.ax = ax;
    this.mugOutputs.ay = ay;
  }

  // Определение визуальной позы сёрфера (§8)
  updateSurferPose(input) {
    const lean = input.state ? input.state.lean : (input.lean !== undefined ? input.lean : 0);
    const hold = input.state ? input.state.hold : (input.hold !== undefined ? input.hold : false);
    if (this.state.airborne) {
      if (hold) {
        this.state.pose = 'grab'; // грэб в воздухе
      } else {
        this.state.pose = 'jump';
      }
    } else {
      if (this.state.crouch > 0.4) {
        this.state.pose = 'crouch'; // присед для накачки на воде
      } else if (Math.abs(lean) > 0.25 || Math.abs(this.state.heading) > 0.15) {
        this.state.pose = 'turn';
      } else {
        this.state.pose = 'norma';
      }
    }
  }

  // Спотыкание / Накрыло волной (§4.7)
  triggerStumble(reason = 'Спотыкание') {
    const now = performance.now();
    this.stumbleTimer = 1.2;

    // Проверка второго спотыкания за 5 секунд -> падение
    if (now - this.lastStumbleTime < 5000) {
      this.fallCount++;
      if (this.onWipe) this.onWipe(`Падение: ${reason}`);
    } else {
      if (this.onStumble) this.onStumble(reason);
    }
    this.lastStumbleTime = now;
  }
}

if (typeof window !== 'undefined') {
  window.SurfPhysics = SurfPhysics;
}
