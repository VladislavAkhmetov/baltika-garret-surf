/**
 * Tony's Garret — Surf Rush
 * RivalSurfer + RivalManager: Соперники и гонка (Тони, Бабуля Зина, Кайтер Стас)
 * (Фаза 5)
 */

class RivalManager {
  constructor(scene) {
    this.scene = scene;
    this.rivals = [];
  }

  update(dt, playerZ) {
    // Обновление соперников (Фаза 5)
  }
}

if (typeof window !== 'undefined') {
  window.RivalManager = RivalManager;
}
