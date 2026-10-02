/**
 * Tony's Garret — Surf Rush (Vertical Slice 45s)
 * SliceGame: Главный оркестратор вертикального среза (§1, §2, §4 VERTICAL_SLICE_SPEC.md)
 */

class SliceGame extends SandboxGame {
  constructor() {
    super();
    console.log('[SliceGame] Initialized Vertical Slice 45s');

    // Название в шапке старта
    const titleEl = document.querySelector('.sandbox-poster-card h1');
    if (titleEl) {
      titleEl.textContent = 'GARRET: НИ КАПЛИ (СРЕЗ 45с)';
    }

    // Золотистый лагер / Hard Drink по главному арт-референсу (media_1790951632188)
    if (this.mugRenderer) {
      this.mugRenderer.setColor('lemon');
    }
  }
}

if (typeof window !== 'undefined') {
  window.SliceGame = SliceGame;
}
