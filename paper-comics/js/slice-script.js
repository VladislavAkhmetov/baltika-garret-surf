/**
 * Tony's Garret — Surf Rush
 * SliceScript: Данные 45-секундного сценария среза (~1300 м)
 * (§3 VERTICAL_SLICE_SPEC.md)
 */

const SLICE_SCRIPT = {
  totalDistance: 1350.0,

  beats: [
    {
      id: 'intro',
      fromM: -60.0,
      toM: 0.0,
      title: 'Интро',
      duration: 3.0,
      description: 'Камера облетает гребень волны и заходит за спину; управление выключено'
    },
    {
      id: 'pump',
      fromM: 0.0,
      toM: 260.0,
      title: 'Зыбь и накачка',
      hint: 'ДЕРЖИ НА СПУСКЕ — РАЗГОН ⬇',
      description: '4 гребня зыби. Крышки на спусках — собираешь, если в ритме приседаешь.'
    },
    {
      id: 'rise',
      fromM: 260.0,
      toM: 350.0,
      title: 'Подъём волны',
      hint: 'ПРИЖМИСЬ К ГРЕБНЮ — БЫСТРЕЕ ⬅',
      description: 'Слева поднимается стена волны со звуком гула'
    },
    {
      id: 'pocket',
      fromM: 350.0,
      toM: 940.0,
      title: 'Карман волны',
      hint: null,
      description: 'Гонка в кармане: линия крышек x = 0.5..2. Тони впереди, Кайтер сзади. 2 выброса губы. Золото на 665м.'
    },
    {
      id: 'launch',
      fromM: 940.0,
      toM: 1040.0,
      title: 'Вылет с рампы',
      hint: 'ОТПУСТИ У ГРЕБНЯ — ВЫЛЕТ ⬆',
      description: 'Волна закрывается, гребень поднимается в рампу. Вылет x1.8, 2+ с полёта.'
    },
    {
      id: 'shoulder',
      fromM: 1040.0,
      toM: 1290.0,
      title: 'Плечо и слалом',
      hint: null,
      description: 'Волна опадает, слалом из 6 буйков на плече, Кайтер пытается обойти.'
    },
    {
      id: 'finish',
      fromM: 1290.0,
      toM: 1350.0,
      title: 'Финишная прямая',
      hint: null,
      description: 'Линия буйков с флагами, плавное замедление, стоп-кадр «ДОВЁЗ! / N%»'
    }
  ],

  // Все статические объекты сценария (свободный x 0..16, как в v3)
  objects: [
    // 1. Бит 'pump' (0–260м): крышки стоят на спусках зыби
    { type: 'cap_fish', x: 1.0, z: 48.0 },
    { type: 'cap_fish', x: 1.5, z: 54.0 },
    { type: 'cap_palm', x: 2.0, z: 60.0 },

    { type: 'cap_fish', x: 2.2, z: 114.0 },
    { type: 'cap_fish', x: 1.8, z: 120.0 },
    { type: 'cap_palm', x: 1.4, z: 126.0 },

    { type: 'cap_fish', x: 1.2, z: 180.0 },
    { type: 'cap_fish', x: 1.6, z: 186.0 },
    { type: 'cap_palm', x: 2.0, z: 192.0 },

    { type: 'cap_fish', x: 1.8, z: 245.0 },
    { type: 'cap_fish', x: 1.2, z: 251.0 },
    { type: 'cap_palm', x: 0.8, z: 257.0 },

    // 2. Бит 'rise' (260–350м): ориентиры уводят в сторону кармана
    { type: 'cap_fish', x: 3.5, z: 278.0 },
    { type: 'cap_fish', x: 2.6, z: 295.0 },
    { type: 'cap_palm', x: 1.8, z: 312.0 },
    { type: 'cap_palm', x: 1.0, z: 330.0 },

    // 3. Бит 'pocket' (350–940м): крышки в кармане волны + Золотая крышка на 665м
    { type: 'cap_fish', x: 0.8, z: 360.0 },
    { type: 'cap_fish', x: 1.2, z: 380.0 },
    { type: 'cap_palm', x: 0.6, z: 405.0 },
    { type: 'cap_fish', x: 1.0, z: 430.0 },
    { type: 'cap_fish', x: 1.4, z: 456.0 },
    { type: 'cap_palm', x: 0.8, z: 485.0 },
    { type: 'cap_fish', x: 1.2, z: 515.0 },

    // Выброс губы #1 на 540м
    { type: 'lip_throw', x: 0.0, z: 540.0 },

    { type: 'cap_fish', x: 1.5, z: 566.0 },
    { type: 'cap_palm', x: 0.8, z: 598.0 },
    { type: 'cap_fish', x: 1.2, z: 628.0 },

    // ЗОЛОТАЯ КРЫШКА на 665м у самой губы x = -3.5 (рискованная траектория!)
    { type: 'cap_gold', x: -3.5, z: 665.0 },

    { type: 'cap_fish', x: 1.0, z: 696.0 },
    { type: 'cap_palm', x: 0.6, z: 727.0 },
    { type: 'cap_fish', x: 1.4, z: 758.0 },

    // Выброс губы #2 на 790м
    { type: 'lip_throw', x: 0.0, z: 790.0 },

    { type: 'cap_fish', x: 1.2, z: 820.0 },
    { type: 'cap_palm', x: 0.8, z: 852.0 },
    { type: 'cap_fish', x: 1.0, z: 888.0 },
    { type: 'cap_fish', x: 1.4, z: 920.0 },

    // 4. Бит 'launch' (940–1040м): мега-трамплин закрывающейся волны на 955м
    { type: 'ramp_wave', x: 1.2, z: 955.0, isMega: true },
    { type: 'cap_high', x: 1.0, z: 985.0 },
    { type: 'cap_high', x: 1.4, z: 1005.0 },

    // 5. Бит 'shoulder' (1040–1290м): слалом из 6 буйков на плече
    { type: 'buoy', x: 4.5, z: 1075.0 },
    { type: 'cap_palm', x: 6.5, z: 1092.0 },
    { type: 'buoy', x: 8.5, z: 1115.0 },
    { type: 'cap_fish', x: 5.5, z: 1130.0 },
    { type: 'buoy', x: 5.0, z: 1150.0 },
    { type: 'cap_palm', x: 7.5, z: 1168.0 },
    { type: 'buoy', x: 9.0, z: 1188.0 },
    { type: 'cap_fish', x: 6.0, z: 1205.0 },
    { type: 'buoy', x: 5.5, z: 1225.0 },
    { type: 'cap_palm', x: 8.0, z: 1242.0 },
    { type: 'buoy', x: 9.5, z: 1260.0 },
    { type: 'cap_fish', x: 7.0, z: 1280.0 },

    // 6. Бит 'finish' (1290–1350м): финишные буйки с флагами
    { type: 'finish_buoy', x: 0.0, z: 1320.0 },
    { type: 'finish_buoy', x: 3.0, z: 1320.0 },
    { type: 'finish_buoy', x: 6.0, z: 1320.0 },
    { type: 'finish_buoy', x: 9.0, z: 1320.0 }
  ],

  getBeatAt(z) {
    for (let i = 0; i < this.beats.length; i++) {
      const b = this.beats[i];
      if (z >= b.fromM && z < b.toM) {
        return b;
      }
    }
    return this.beats[this.beats.length - 1];
  },

  getBeatById(id) {
    return this.beats.find(b => b.id === id) || this.beats[0];
  }
};

if (typeof window !== 'undefined') {
  window.SLICE_SCRIPT = SLICE_SCRIPT;
}
