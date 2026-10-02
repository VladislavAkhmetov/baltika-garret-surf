/**
 * Tony's Garret — Surf Rush
 * SliceScript: Данные 45-секундного сценария среза (~1300 м)
 * (§3 VERTICAL_SLICE_SPEC.md)
 */

const SLICE_SCRIPT = {
  totalDistance: 1300.0,

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
      toM: 250.0,
      title: 'Зыбь и накачка',
      hint: 'ДЕРЖИ НА СПУСКЕ — РАЗГОН ⬇',
      description: '4 гребня зыби. Крышки на спусках — собираешь, если в ритме приседаешь.'
    },
    {
      id: 'rise',
      fromM: 250.0,
      toM: 330.0,
      title: 'Подъём волны',
      hint: 'ПРИЖМИСЬ К ГРЕБНЮ — БЫСТРЕЕ ⬅',
      description: 'Слева поднимается стена волны со звуком гула'
    },
    {
      id: 'pocket',
      fromM: 330.0,
      toM: 900.0,
      title: 'Карман волны',
      hint: null,
      description: 'Гонка в кармане: линия крышек x = 0.5..2. Тони впереди, Кайтер сзади. 2 выброса губы. Золото на 640м.'
    },
    {
      id: 'launch',
      fromM: 900.0,
      toM: 1000.0,
      title: 'Вылет с рампы',
      hint: 'ОТПУСТИ У ГРЕБНЯ — ВЫЛЕТ ⬆',
      description: 'Волна закрывается, гребень поднимается в рампу. Вылет x1.8, 2+ с полёта.'
    },
    {
      id: 'shoulder',
      fromM: 1000.0,
      toM: 1250.0,
      title: 'Плечо и слалом',
      hint: null,
      description: 'Волна опадает, слалом из 6 буйков на плече, Кайтер пытается обойти.'
    },
    {
      id: 'finish',
      fromM: 1250.0,
      toM: 1300.0,
      title: 'Финишная прямая',
      hint: null,
      description: 'Линия буйков с флагами, плавное замедление, стоп-кадр «ДОВЁЗ! / N%»'
    }
  ],

  // Все статические объекты сценария (свободный x 0..16, как в v3)
  objects: [
    // 1. Бит 'pump' (0–250м): крышки стоят на спусках зыби
    { type: 'cap_fish', x: 1.0, z: 46.0 },
    { type: 'cap_fish', x: 1.5, z: 52.0 },
    { type: 'cap_palm', x: 2.0, z: 58.0 },

    { type: 'cap_fish', x: 2.2, z: 110.0 },
    { type: 'cap_fish', x: 1.8, z: 116.0 },
    { type: 'cap_palm', x: 1.4, z: 122.0 },

    { type: 'cap_fish', x: 1.2, z: 174.0 },
    { type: 'cap_fish', x: 1.6, z: 180.0 },
    { type: 'cap_palm', x: 2.0, z: 186.0 },

    { type: 'cap_fish', x: 1.8, z: 236.0 },
    { type: 'cap_fish', x: 1.2, z: 242.0 },
    { type: 'cap_palm', x: 0.8, z: 248.0 },

    // 2. Бит 'rise' (250–330м): ориентиры уводят в сторону кармана
    { type: 'cap_fish', x: 3.5, z: 268.0 },
    { type: 'cap_fish', x: 2.6, z: 284.0 },
    { type: 'cap_palm', x: 1.8, z: 300.0 },
    { type: 'cap_palm', x: 1.0, z: 318.0 },

    // 3. Бит 'pocket' (330–900м): крышки в кармане волны + Золотая крышка на 640м
    { type: 'cap_fish', x: 0.8, z: 345.0 },
    { type: 'cap_fish', x: 1.2, z: 365.0 },
    { type: 'cap_palm', x: 0.6, z: 388.0 },
    { type: 'cap_fish', x: 1.0, z: 412.0 },
    { type: 'cap_fish', x: 1.4, z: 438.0 },
    { type: 'cap_palm', x: 0.8, z: 465.0 },
    { type: 'cap_fish', x: 1.2, z: 495.0 },

    // Выброс губы #1 на 520м
    { type: 'lip_throw', x: 0.0, z: 520.0 },

    { type: 'cap_fish', x: 1.5, z: 545.0 },
    { type: 'cap_palm', x: 0.8, z: 575.0 },
    { type: 'cap_fish', x: 1.2, z: 605.0 },

    // ЗОЛОТАЯ КРЫШКА на 640м у самой губы x = -3.5 (рискованная траектория!)
    { type: 'cap_gold', x: -3.5, z: 640.0 },

    { type: 'cap_fish', x: 1.0, z: 670.0 },
    { type: 'cap_palm', x: 0.6, z: 700.0 },
    { type: 'cap_fish', x: 1.4, z: 730.0 },

    // Выброс губы #2 на 760м
    { type: 'lip_throw', x: 0.0, z: 760.0 },

    { type: 'cap_fish', x: 1.2, z: 790.0 },
    { type: 'cap_palm', x: 0.8, z: 820.0 },
    { type: 'cap_fish', x: 1.0, z: 855.0 },
    { type: 'cap_fish', x: 1.4, z: 885.0 },

    // 4. Бит 'launch' (900–1000м): мега-трамплин закрывающейся волны на 920м
    { type: 'ramp_wave', x: 1.2, z: 920.0, isMega: true },
    { type: 'cap_high', x: 1.0, z: 948.0 },
    { type: 'cap_high', x: 1.4, z: 968.0 },

    // 5. Бит 'shoulder' (1000–1250м): слалом из 6 буйков на плече
    { type: 'buoy', x: 4.5, z: 1040.0 },
    { type: 'cap_palm', x: 6.5, z: 1055.0 },
    { type: 'buoy', x: 8.5, z: 1075.0 },
    { type: 'cap_fish', x: 5.5, z: 1090.0 },
    { type: 'buoy', x: 5.0, z: 1110.0 },
    { type: 'cap_palm', x: 7.5, z: 1128.0 },
    { type: 'buoy', x: 9.0, z: 1145.0 },
    { type: 'cap_fish', x: 6.0, z: 1162.0 },
    { type: 'buoy', x: 5.5, z: 1180.0 },
    { type: 'cap_palm', x: 8.0, z: 1198.0 },
    { type: 'buoy', x: 9.5, z: 1215.0 },
    { type: 'cap_fish', x: 7.0, z: 1235.0 },

    // 6. Бит 'finish' (1250–1300м): финишные буйки с флагами
    { type: 'finish_buoy', x: 0.0, z: 1275.0 },
    { type: 'finish_buoy', x: 3.0, z: 1275.0 },
    { type: 'finish_buoy', x: 6.0, z: 1275.0 },
    { type: 'finish_buoy', x: 9.0, z: 1275.0 }
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
