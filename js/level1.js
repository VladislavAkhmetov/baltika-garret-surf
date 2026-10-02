/**
 * Tony's Garret — Surf Rush
 * LEVEL1: Секции, паттерны и генерация Уровня 1 (§4 LEVEL1_SPEC)
 * Паттерн — массив строк по 3 символа (лево [0]/центр [1]/право [2]).
 * Одна строка = 6 м.
 */

function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVEL1 = {
  length: 2700,
  rowLength: 6, // 6 м на 1 строку паттерна

  // Справочник символов (§4.1)
  symbols: {
    '.': { type: 'empty', name: 'Пусто' },
    'c': { type: 'cap_fish', score: 10, name: 'Крышка-рыбка' },
    'p': { type: 'cap_palm', score: 25, name: 'Крышка-пальма' },
    'G': { type: 'cap_gold', score: 500, isGold: true, name: 'Золотая крышка' },
    'R': { type: 'ramp', isRamp: true, name: 'Трамплин-гребень' },
    'M': { type: 'mega_ramp', isRamp: true, isMega: true, name: 'Мега-трамплин' },
    'B': { type: 'buoy', isObstacle: true, canJump: true, canDuck: false, name: 'Буй' },
    'K': { type: 'rock', isObstacle: true, canJump: false, canDuck: false, name: 'Скала' },
    'F': { type: 'foam_wall', isObstacle: true, canJump: true, canDuck: true, name: 'Стена пены' },
    'J': { type: 'jetski', isObstacle: true, canJump: false, canDuck: false, name: 'Гидроцикл' },
    'I': { type: 'bonus_ice', isBonus: true, name: 'Ледяная кружка' },
    'N': { type: 'bonus_magnet', isBonus: true, name: 'Магнит' },
    '^': { type: 'cap_high', score: 50, isHigh: true, height: 3.8, name: 'Высокая крышка' }
  },

  // Секции (§4.2)
  sections: [
    {
      id: 'intro',
      fromM: 0,
      toM: 120,
      name: 'ЛОВИ ВОЛНУ',
      speedCap: 28,
      hint: 'ЛОВИ ВОЛНУ!',
      variants: [
        ['...', '...', '...', '...']
      ],
      events: []
    },
    {
      id: 'tutorial',
      fromM: 120,
      toM: 500,
      name: 'Обучение',
      speedCap: 30,
      hint: 'Наклони телефон ↘ или свайп →',
      variants: [
        // Вариант A
        ['c..', 'c..', '.c.', '.c.', '..c', '..c', '..c', '.c.', '.c.', 'c..', 'c..'],
        // Вариант B
        ['.c.', '.c.', '.c.', '..c', '..c', '..p', '...', 'p..', 'c..', 'c..', '.c.']
      ],
      events: [
        { atM: 300, type: 'swellZone', toM: 480 },
        { atM: 430, type: 'hint_balance', text: 'Волна кренит — наклоняй навстречу!' },
        { atM: 450, type: 'wave', dir: -1, size: 10 }
      ]
    },
    {
      id: 'ramp1',
      fromM: 500,
      toM: 800,
      name: 'Первый трамплин',
      speedCap: 32,
      hint: 'Рывок вверх! 🤙 или свайп ↑',
      variants: [
        // Вариант A
        ['.c.', '.c.', '.R.', '...', '.^.', '.^.', '...', 'c.c', 'c.c', 'B.B', '...', '.R.', '...', '.^.'],
        // Вариант B
        ['c..', 'c..', 'R..', '...', '^..', '^..', '...', '.B.', '..c', '..c', '..R', '...', '..^']
      ],
      events: [
        { atM: 700, type: 'wave', dir: +1, size: 12 }
      ]
    },
    {
      id: 'rivals',
      fromM: 800,
      toM: 1250,
      name: 'Соперники',
      speedCap: 33,
      hint: null,
      variants: [
        // Вариант A
        ['c.c', 'c.c', '...', 'B..', '..c', '..c', '.B.', 'c..', 'c..', '...', '..B', 'p..', 'p..'],
        // Вариант B
        ['.p.', '.p.', 'B.B', '...', 'c.c', 'c.c', '.R.', '...', '.^.', '..B', 'c..', 'c..']
      ],
      events: [
        { atM: 830, type: 'rival_pass' },
        { atM: 1100, type: 'wave', dir: -1, size: 12 }
      ]
    },
    {
      id: 'bay',
      fromM: 1250,
      toM: 1750,
      name: 'Бухта',
      speedCap: 34,
      hint: null,
      variants: [
        // Вариант A (Золотая крышка №1 за скалой)
        ['K..', 'K.c', '..c', '.B.', 'c..', 'c..', '..K', '..K', 'G..', '...', 'F..', '...', '.c.', '.c.'],
        // Вариант B
        ['..K', 'c.K', 'c..', '.B.', '..c', '..c', 'K..', 'K..', '..G', '...', '..F', '...', '.c.', '.c.'],
        // Вариант C
        ['.K.', '.K.', 'c.c', 'J..', '...', '..p', '..p', 'B.B', '...', '.G.', '.F.', '...', 'c.c']
      ],
      events: [
        { atM: 1300, type: 'wave', dir: -1, size: 12 },
        { atM: 1420, type: 'seagull' },
        { atM: 1480, type: 'wave', dir: +1, size: 14 },
        { atM: 1650, type: 'waveS', size: 12 }
      ]
    },
    {
      id: 'refill',
      fromM: 1750,
      toM: 1900,
      name: 'Лодка-долив',
      speedCap: 34,
      hint: 'Лодка с доливом! Бонус «Ледяная кружка»',
      variants: [
        ['...', '.c.', '.c.', '.I.', '.c.', '.c.', '...', 'c.c', 'c.c', '...'],
        ['...', 'c..', '..c', '.I.', '..c', 'c..', '...', '.p.', '.p.', '...']
      ],
      events: [{ atM: 1800, type: 'boat_refill' }]
    },
    {
      id: 'barrel',
      fromM: 1900,
      toM: 2250,
      name: 'Баррель',
      speedCap: 36,
      hint: 'Труба! Держи баланс',
      variants: [
        // Вариант A (Золотая крышка №2 внутри барреля)
        ['.c.', '.c.', '...', '..c', '..c', '.G.', '.c.', '.c.', '...', 'c..', 'c..', '...'],
        // Вариант B
        ['c..', 'c..', '...', 'G..', '...', '..c', '..c', '.c.', '.c.', '...']
      ],
      events: [
        { atM: 1910, type: 'barrel_enter' },
        { atM: 1910, type: 'barrelLean', size: 6 },
        { atM: 2200, type: 'wave', dir: +1, size: 12 },
        { atM: 2240, type: 'barrel_exit' }
      ]
    },
    {
      id: 'mega',
      fromM: 2250,
      toM: 2600,
      name: 'Мега-трамплин',
      speedCap: 36,
      hint: 'Мега-трамплин на 2480 м! Золотая крышка №3!',
      variants: [
        // Вариант A
        ['c.c', 'c.c', 'B.B', '...', '.p.', '.p.', 'K.K', '...', '.c.', '.c.', '.M.', '...', '...', '.G.'],
        // Вариант B
        ['.c.', '.c.', '..B', '..B', '.p.', '.p.', 'K..', '...', '.c.', '.c.', '.M.', '...', '...', '.G.']
      ],
      events: [
        { atM: 2420, type: 'wave', dir: +1, size: 16 },
        { atM: 2480, type: 'mega_ramp_approach' }
      ]
    },
    {
      id: 'finish',
      fromM: 2600,
      toM: 2700,
      name: 'Пляжный бар',
      speedCap: 20,
      hint: 'ФИНИШ! Пляжный бар',
      variants: [
        ['...', '...', '...', '...']
      ],
      events: [{ atM: 2620, type: 'finish_pier' }]
    }
  ],

  // Генерация всей трассы с привязкой Z к строкам для заданного seed
  generateRows(seed = 12345) {
    const rng = mulberry32(seed);
    const rows = []; // { z, row, sectionId, hint, goldSlot }
    let goldCapIndex = 1;

    for (let sIdx = 0; sIdx < this.sections.length; sIdx++) {
      const sec = this.sections[sIdx];
      const secDist = sec.toM - sec.fromM;
      const totalSecRows = Math.floor(secDist / this.rowLength);

      // Выбор варианта по seed
      const varIdx = Math.floor(rng() * sec.variants.length);
      const chosenPattern = sec.variants[varIdx];

      // Повторение паттерна с разрывом 2 пустые строки
      let patternPos = 0;
      let inGap = 0;

      for (let r = 0; r < totalSecRows; r++) {
        const rowZ = sec.fromM + r * this.rowLength;
        let rowStr = '...';

        if (chosenPattern.length === 0 || chosenPattern[0] === '...') {
          rowStr = '...';
        } else if (inGap > 0) {
          rowStr = '...';
          inGap--;
        } else {
          rowStr = chosenPattern[patternPos];
          patternPos++;
          if (patternPos >= chosenPattern.length) {
            patternPos = 0;
            inGap = 2; // 2 пустые строки между паттернами
          }
        }

        // Фиксация позиции золотых крышек для коллекции
        let goldSlot = null;
        if (rowStr.includes('G')) {
          goldSlot = goldCapIndex;
          goldCapIndex = Math.min(3, goldCapIndex + 1);
        }

        rows.push({
          z: rowZ,
          row: rowStr,
          sectionId: sec.id,
          sectionName: sec.name,
          hint: r === 0 ? sec.hint : null,
          goldSlot: goldSlot
        });
      }
    }

    return rows;
  }
};

if (typeof window !== 'undefined') {
  window.LEVEL1 = LEVEL1;
}
