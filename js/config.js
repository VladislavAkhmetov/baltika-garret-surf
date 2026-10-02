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
    gyroRange: 22,       // градусов (полный ход до ±2.4 м)
    gyroDeadzone: 2,     // градусов
    gyroAlpha: 0.25,     // low-pass коэффициент
    magnetDist: 0.6,     // зона притяжения к полосе
    magnetLerp: 0.45,
    tiltFactor: 0.8,     // tilt = relRad * 0.8
    flickThreshold: 6.0, // м/с²
    flickWindow: 120,    // мс
    flickCooldown: 400,  // мс
    swipeThresholdPx: 28,
    swipeSpeedThreshold: 0.35, // px/мс
    swipeTransitionTime: 0.16  // 160 мс
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
