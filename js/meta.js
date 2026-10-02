/**
 * Tony's Garret — Surf Rush
 * MetaManager: миссии, звёзды, сохранения, вайб дня, вкусы
 * (Фаза 7)
 */

class MetaManager {
  constructor() {
    this.saveKey = 'garret_save_v1';
    this.load();
  }

  load() {
    try {
      const data = localStorage.getItem(this.saveKey);
      this.save = data ? JSON.parse(data) : this.getDefaultSave();
    } catch (e) {
      this.save = this.getDefaultSave();
    }
  }

  saveData() {
    try {
      localStorage.setItem(this.saveKey, JSON.stringify(this.save));
    } catch (e) {}
  }

  getDefaultSave() {
    return {
      highScore: 0,
      bestDistance: 0,
      unlockedSkins: ['default'],
      activeMissions: [],
      ageVerified: false
    };
  }
}

if (typeof window !== 'undefined') {
  window.MetaManager = MetaManager;
}
