/**
 * Tony's Garret — Surf Rush
 * FxDirector: стоп-кадры, тайм-скейл, тряска камеры, типографика, хаптика
 * (Фаза 4)
 */

class FxDirector {
  constructor() {
    this.timeScale = 1.0;
    this.shakeAmount = 0;
  }

  moment(params) {
    // Стоп-кадр
  }

  toast(msg) {
    // Всплывающее сообщение
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  triggerShake(amount) {
    this.shake(amount);
  }

  update(realDt) {
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - realDt * 2.5);
    }
  }
}

if (typeof window !== 'undefined') {
  window.FxDirector = FxDirector;
}
