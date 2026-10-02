/**
 * Tony's Garret — Surf Rush
 * CFG — Все тюнинг-константы игры (LEVEL1_SPEC)
 * Без магических чисел в логике!
 */

const CFG = {
  // Цветовая палитра арт-дирекшна (HEX / Three.js hex)
  colors: {
    skyTop: '#3FA7D6',
    skyLow: '#FFD7A8',
    sun: '#FFC93C',
    coral: '#FF6B4A',
    oceanDeep: '#0E3B6E',
    oceanMid: '#1F78B4',
    oceanLight: '#5CC8E8',
    foam: '#F6F1E4',
    kraft: '#E9D8B4',
    paperCream: '#F4ECDC',
    capRed: '#D93829',
    tapeYellow: '#F8C83A',
    ink: '#1C1A22',
    beerCherry: '#9E0832',
    beerPeach: '#FF8A3D',
    beerLemon: '#F2C230'
  },

  threeColors: {
    fog: 0xEAD9C2,
    oceanDeep: 0x0E3B6E,
    oceanMid: 0x1F78B4,
    oceanLight: 0x5CC8E8,
    foam: 0xF6F1E4,
    sun: 0xFFC93C,
    ink: 0x1C1A22
  },

  fog: {
    color: 0xEAD9C2, // персиковый у горизонта
    density: 0.0045
  },

  lanes: {
    // «Лево» в ТЗ = лево экрана = +X!
    // Индекс 0 = левая на экране (+2.4), 1 = центр (0), 2 = правая на экране (-2.4)
    x: [2.4, 0, -2.4],
    dividerX: [1.2, -1.2],
    dividerWidth: 0.45,
    hitboxWidth: 1.6
  },

  speed: {
    start: 26,        // м/с
    accel: 0.08,      // м/с²
    max: 36,          // м/с
    stumblePenalty: 0.30, // -30% при спотыкании
    stumbleDuration: 1.2, // с
    stumbleWindowForCrash: 5.0, // с (второй удар за 5с = падение)
    finishDecelDist: 80   // м до полной остановки на финише
  },

  level: {
    length: 2700,     // метров
    rowLength: 6,     // метров на 1 строку паттерна
    spawnAhead: 120,  // спавн за 120 м
    despawnBehind: 20 // удаление за 20 м
  },

  ocean: {
    showLaneDividers: true,
    showLeftSteps: true,
    waterCenterX: 0,
    width: 14,
    length: 220,
    segX: 28,
    segZ: 140,
    offsetZ: 90,
    textureRepeatZ: 24,
    waveA: 0.12,      // мягкая зыбь вместо хребтов
    lambda1: 18,
    waveB: 0.05,
    lambda2: 7,
    waveV: 6,
    dividerAmp: 0.05,
    sideStepsX: [7, 9, 12],   // слева на экране (+X)
    sideStepsParallax: [0.85, 0.70, 0.55],
    rocksXMin: -14,           // справа на экране (-X)
    rocksXMax: -30,
    sunX: -10,                // по центру-справа над водой
    sunY: 14,
    sunSize: 30,
    sunZOffset: 180
  },

  camera: {
    offsetY: 3.0,
    offsetZ: -5.4,
    camXFactor: 0.8,
    targetOffsetY: 0.5,
    targetOffsetZ: 14.0,
    targetXFactor: -0.1,
    baseFov: 58,
    fovSpeedFactor: 0.7,
    lerpPosRate: 10,  // 1 - exp(-10 * dt)
    bobRate: 1.3,
    bobAmp: 0.006,
    boardScreenY: 0.72,
    surferHeightScreen: 0.28
  },

  player: {
    jumpHeight: 2.8,
    jumpDuration: 0.72,
    duckDuration: 0.60,
    cardWidth: 1.95,
    cardHeight: 2.45,
    stopMotionFps: 12,
    stopMotionInterval: 1 / 12 // ~83 мс
  },

  input: {
    gyroRange: 35,             // макс. диапазон наклона ±35° (v2 spec §3.4)
    gyroDeadzone: 1.0,         // градусов мертвая зона (spec: 1°)
    gyroAlpha: 0.5,            // low-pass α = 0.5 (spec: 0.5, задержка <= 50 мс)
    tiltKeyRate: 120,          // град/с для Q/E на клавиатуре (spec: 120°/с)
    tiltSpringTime: 0.25,      // возврат пружиной к 0 за 0.25 с (spec: 0.25 с)
    dragZonePadding: 40,       // зона: кружка + 40px вокруг (spec: 40px)
    dragSensitivityPx: 70,     // чувствительность: clamp(dx / 70px, -1, 1) * 30°
    dragMaxTiltDeg: 30,        // 30° для drag-режима
    swipeThresholdPx: 28,      // 28px порог свайпа (spec: 28px)
    swipeSpeedThreshold: 0.35, // 0.35 px/мс (spec: > 0.35 px/мс)
    swipeTransitionTime: 0.16  // 160 мс (spec: 160 мс, ease-out-cubic)
  },

  mug: {
    n: 28,
    c2: 900,
    damping: 3.2,
    forceK: 9,
    vertK: 0.6,
    fillAt100: 0.92,
    rim: 1.0,
    spillRate: 2.4,
    foamMax: 1.0,
    foamRegen: 0.05,
    foamAbsorb: 1.6,
    edgeClamp: true,
    landImpulse: 2.2,
    cleanGyroThreshold: 6, // градусов (|rel| < 6°)
    cleanTapWindow: 0.15,  // ±150 мс
    axDiv: 40,
    ayDiv: 30
  },

  balance: {
    model: 'tilt', // 'jerk' (песочница) | 'tilt' (старое v2)
    poolSize: 16,
    defaultAssist: 0.4,
    cherryAssistPenalty: -0.1,
    balanceZoneDeg: 4,         // |mugTilt| < 4°
    foamBonusRate: 0.08,       // +0.08/с пена растет в зоне баланса
    balanceHoldTime: 5.0,      // 5 с подряд -> комбо + toast «РОВНО ДЕРЖИШЬ»
    waiterThreshold: 0.60,     // игрок наклонен >= 60% от требуемого
    waiterDamp: 0.70,          // гашение источника на 70%
    cameraTiltFactor: 0.25,    // camera.rotation.z += worldRoll * 0.25
    maxCameraTiltDeg: 4.0,     // максимум 4°
    types: {
      swell: { rollDeg: 3, freq: 0.6 },
      wave: { rampUp: 0.8, hold: 0.6, rampDown: 0.6, dur: 2.0, telegraphLead: 1.5 },
      waveS: { rollDeg: 12, dur: 3.6, pause: 0.3 },
      wake: { rollDeg: 4, freq: 6.0 },
      laneChange: { rollDeg: 7, dur: 0.25 },
      hit: { rollDeg: 18, ax: 1.0, dur: 0.6 },
      seagull: { rollDeg: 10, dur: 0.3 },
      barrelLean: { rollDeg: 6 }
    }
  },

  fx: {
    freezeCooldown: 6000,   // мс кулдаун между стоп-кадрами priority <= 2
    paperBoilInterval: 125, // мс
    paperBoilPos: 0.6,      // px
    paperBoilRot: 0.4,      // deg
    paperBoilRot3d: 0.01    // rad
  },

  flavors: {
    cherry: {
      id: 'cherry',
      name: 'Craft Cherry',
      color: '#9E0832',
      beerHex: 0x9E0832,
      dampingMult: 1.3,
      speedMult: 1.0,
      foamRegenMult: 1.0,
      foamMaxMult: 1.0
    },
    peach: {
      id: 'peach',
      name: 'Hard Peach',
      color: '#FF8A3D',
      beerHex: 0xFF8A3D,
      dampingMult: 1.0,
      speedMult: 1.0,
      foamRegenMult: 1.6,
      foamMaxMult: 1.3
    },
    lemon: {
      id: 'lemon',
      name: 'Hard Lemon',
      color: '#F2C230',
      beerHex: 0xF2C230,
      dampingMult: 0.85,
      speedMult: 1.1,
      foamRegenMult: 1.0,
      foamMaxMult: 1.0
    }
  },

  surf: {
    // Наклон
    leanRange: 25,         // градусов (min 10, max 40)
    leanCurve: 1.3,        // (min 1.0, max 2.0)
    leanAlpha: 0.45,       // (min 0.15, max 0.9)
    leanDeadzone: 1.5,     // градусов
    maxHeading: 38,        // градусов (min 15, max 60)
    turnRate: 6,           // (min 2, max 12)
    lateralScale: 0.35,    // (min 0.15, max 0.6)
    // Скорость
    pocketBoost: 0.40,     // (min 0, max 0.8)
    carveDrag: 0.12,       // (min 0, max 0.3)
    pumpGain: 8,           // (min 0, max 20)
    peelSpeed: 1.0,        // (min 0.8, max 1.2)
    baseSpeedStart: 26,
    baseSpeedMax: 34,
    speedResponse: 1.5,
    pumpDecay: 0.6,
    pumpMax: 8,
    headingAx: 0.15,
    // Прыжок
    jumpBase: 5,           // (min 2, max 9)
    jumpHold: 8,           // (min 0, max 14)
    gravity: 18,           // (min 10, max 30)
    spinRate: 540,         // °/с (min 200, max 900)
    minHoldForJump: 0.12,  // с
    rampJumpMult: 1.6,
    lipJumpMult: 1.4,
    // Границы и карман
    trackMinX: -5,
    trackMaxX: 16,
    pocketWidth: 4,
    // Кружка
    sloshTau: 0.35,        // с (min 0.1, max 0.8)
    jerkGain: 1.0,         // (min 0.3, max 2.0)
    chopPocket: 5,         // градусов (min 0, max 12)
    assist: 0.3            // (min 0, max 0.6)
  },

  peel: {
    H: 3.2,
    faceFromX: -6,
    faceToX: 4,
    lipX: -5,
    lipThrowEvery: [6, 10],
    lipThrowLen: 12,
    lipThrowWarn: 1.2,
    lipThrowZoneX: 1
  },

  rivals: {
    tony: { id: 'tony', name: 'Тони', speedFactor: 1.02, laneShiftFreq: 0.15, collectCaps: true },
    granny: { id: 'granny', name: 'Бабуля Зина', speedFactor: 0.93, laneShiftFreq: 0.05, neverStumbles: true },
    kiter: { id: 'kiter', name: 'Кайтер Стас', speedFactor: 0.98, laneShiftFreq: 0.40, stumblesFreq: 0.25 },
    rubberBandMin: -2.5,
    rubberBandMax: 3.0,
    rubberBandTonyMax: 3.5,
    wakeDist: 9.0,
    wakeSpeedBoost: 0.08
  }
};

if (typeof window !== 'undefined') {
  window.CFG = CFG;
}
