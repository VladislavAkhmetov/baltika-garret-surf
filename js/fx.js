/**
 * Tony's Garret — Surf Rush
 * FxDirector: Стоп-кадры, тайм-скейл, тряска камеры, типографика, хаптика
 * (§6 LEVEL1_SPEC.md, §7 VERTICAL_SLICE_SPEC.md)
 */

class FxDirector {
  constructor(game) {
    this.game = game;
    this.timeScale = 1.0;
    this.shakeAmount = 0.0;
    this.zoomFactor = 1.0;
    this.targetZoom = 1.0;

    // Таймеры заморозки (в реальном времени)
    this.isFrozen = false;
    this.freezeDuration = 0;   // всего мс
    this.freezeTimer = 0;      // оставшееся время удержания (мс)
    this.easingTimer = 0;      // время возврата timeScale (220 мс)
    this.cooldownTimer = 0;    // кулдаун между моментами prio <= 2 (6.0 с)
    this.queue = [];           // очередь моментов (максимум 1)
    this.activeMoment = null;

    // DOM-элементы
    this.appContainer = document.getElementById('app-container') || document.body;
    this.overlayEl = null;
    this.flashEl = null;
    this.halftoneEl = null;
    this.momentBox = null;
    this.mainPlate = null;
    this.subPlate = null;
    this.toastEl = null;
    this.toastTimer = 0;

    this.initDOM();
    this.checkUrlParams();
  }

  initDOM() {
    // 1. Контейнер оверлея
    let overlay = document.getElementById('fx-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fx-overlay';
      this.appContainer.appendChild(overlay);
    }
    this.overlayEl = overlay;

    // 2. Вспышка (белый экран)
    let flash = document.getElementById('fx-flash');
    if (!flash) {
      flash = document.createElement('div');
      flash.id = 'fx-flash';
      overlay.appendChild(flash);
    }
    this.flashEl = flash;

    // 3. Полутоновый растр точками
    let halftone = document.getElementById('fx-halftone');
    if (!halftone) {
      halftone = document.createElement('div');
      halftone.id = 'fx-halftone';
      overlay.appendChild(halftone);
    }
    this.halftoneEl = halftone;

    // 4. Блок бумажных плашек
    let box = document.getElementById('fx-moment-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'fx-moment-box';

      const main = document.createElement('div');
      main.className = 'fx-main-plate tone-yellow';
      main.textContent = 'ЧИСТО!';
      box.appendChild(main);

      const sub = document.createElement('div');
      sub.className = 'fx-sub-plate';
      sub.textContent = '+250';
      box.appendChild(sub);

      overlay.appendChild(box);
    }
    this.momentBox = box;
    this.mainPlate = box.querySelector('.fx-main-plate');
    this.subPlate = box.querySelector('.fx-sub-plate');

    // 5. Toast наклейка
    let toast = document.getElementById('fx-toast-sticker');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'fx-toast-sticker';
      toast.className = 'fx-toast-sticker';
      overlay.appendChild(toast);
    }
    this.toastEl = toast;
  }

  checkUrlParams() {
    if (typeof window !== 'undefined' && window.location) {
      const p = new URLSearchParams(window.location.search);
      const fxWord = p.get('fx');
      if (fxWord) {
        setTimeout(() => {
          this.moment({ word: fxWord, tone: 'yellow', freeze: 500, priority: 3 });
        }, 1200);
      }
    }
  }

  /**
   * Запуск ключевого момента со стоп-кадром (§6.1)
   */
  moment(params) {
    const opts = Object.assign({
      word: 'ЧИСТО!',
      sub: '',
      tone: 'yellow',      // yellow | white | red | gold | ocean | coral
      freeze: 320,         // мс
      zoom: 0.86,          // множитель FOV
      shake: 0.25,         // тряска 0..1
      haptic: [20, 30, 60],
      sound: 'slam',
      priority: 2          // 1, 2, 3
    }, params);

    // Правило кулдауна: для prio <= 2 кулдаун 6.0 с (§6.2)
    if (opts.priority <= 2 && this.cooldownTimer > 0) {
      const text = opts.sub ? `${opts.word} ${opts.sub}` : opts.word;
      this.toast(text);
      return;
    }

    // Если уже активен стоп-кадр
    if (this.isFrozen) {
      if (opts.priority >= 3) {
        // Высший приоритет перехватывает очередь
        this.queue = [opts];
      } else if (this.queue.length === 0) {
        this.queue.push(opts);
      } else {
        const text = opts.sub ? `${opts.word} ${opts.sub}` : opts.word;
        this.toast(text);
      }
      return;
    }

    this.executeMoment(opts);
  }

  executeMoment(opts) {
    this.isFrozen = true;
    this.activeMoment = opts;
    this.freezeDuration = opts.freeze;
    this.freezeTimer = opts.freeze;
    this.easingTimer = 0;
    this.cooldownTimer = opts.priority <= 2 ? 6.0 : 0.0;

    // Мгновенное замедление времени (§6.2)
    this.timeScale = 0.04;

    // Тряска и зум
    this.shake(opts.shake);
    this.targetZoom = opts.zoom;

    // Хаптика
    if (opts.haptic && typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(opts.haptic); } catch (e) {}
    }

    // Звук
    if (this.game && this.game.audio) {
      if (opts.sound === 'slam') {
        this.game.audio.playSlam ? this.game.audio.playSlam() : this.game.audio.playCarve(1.0);
      } else if (opts.sound === 'crowd') {
        this.game.audio.playCrowd ? this.game.audio.playCrowd() : this.game.audio.playCarve(0.8);
      } else if (opts.sound === 'cap') {
        this.game.audio.playCap ? this.game.audio.playCap() : null;
      }
    }

    // Скрываем подсказки обучения во время эпичных стоп-кадров
    const hint = document.getElementById('slice-tutorial-hint');
    if (hint) hint.classList.add('hide');

    // DOM-анимации
    if (this.appContainer) {
      this.appContainer.classList.add('fx-freeze');
    }

    // Вспышка (0 -> 0.35 -> 0 за 90 мс)
    if (this.flashEl) {
      this.flashEl.classList.add('active');
      setTimeout(() => {
        if (this.flashEl) this.flashEl.classList.remove('active');
      }, 90);
    }

    // Полутоновый растр
    if (this.halftoneEl) {
      this.halftoneEl.classList.add('active');
    }

    // Бумажные плашки
    if (this.momentBox && this.mainPlate && this.subPlate) {
      this.momentBox.style.display = '';
      // Сброс предыдущих тонов
      this.mainPlate.className = `fx-main-plate tone-${opts.tone}`;
      this.mainPlate.textContent = opts.word;

      if (opts.sub) {
        this.subPlate.textContent = opts.sub;
        this.subPlate.style.display = 'block';
      } else {
        this.subPlate.style.display = 'none';
      }

      this.momentBox.classList.remove('fx-moment-out');
      void this.momentBox.offsetWidth; // force reflow
      this.momentBox.classList.add('fx-moment-in');
    }
  }

  endMoment() {
    this.isFrozen = false;
    this.easingTimer = 0.22; // 220 мс возврат скорости

    // Убираем фильтр с canvas
    if (this.appContainer) {
      this.appContainer.classList.remove('fx-freeze');
    }

    if (this.halftoneEl) {
      this.halftoneEl.classList.remove('active');
    }

    // Улёт плашек вверх-вправо
    if (this.momentBox) {
      this.momentBox.classList.remove('fx-moment-in');
      this.momentBox.classList.add('fx-moment-out');
      setTimeout(() => {
        if (this.momentBox && !this.isFrozen) {
          this.momentBox.classList.remove('fx-moment-out');
          this.momentBox.style.opacity = '0';
        }
      }, 260);
    }

    this.targetZoom = 1.0;
    this.activeMoment = null;

    // Если есть отложенный момент в очереди
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      setTimeout(() => {
        this.moment(next);
      }, 80);
    }
  }

  /**
   * Всплывающее текстовое сообщение без стоп-кадра (§6.4)
   */
  toast(msg, tone = 'yellow') {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.className = `fx-toast-sticker show tone-${tone}`;
    this.toastTimer = 1.3;
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount || 0.25);
  }

  triggerShake(amount) {
    this.shake(amount);
  }

  /**
   * Обновление FxDirector в реальном времени (realDt в секундах)
   */
  update(realDt) {
    // 1. Затухание кулдауна
    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - realDt);
    }

    // 2. Логика заморозки
    if (this.isFrozen) {
      const ms = realDt * 1000.0;
      this.freezeTimer -= ms;

      // Лёгкий paper boil для плашки во время удержания
      if (this.momentBox) {
        const boilX = (Math.random() - 0.5) * 1.5;
        const boilY = (Math.random() - 0.5) * 1.5;
        const boilRot = (Math.random() - 0.5) * 0.8;
        this.momentBox.style.transform = `translate(calc(-50% + ${boilX}px), calc(-50% + ${boilY}px)) rotate(${boilRot - 4}deg)`;
      }

      if (this.freezeTimer <= 0) {
        this.endMoment();
      }
    } else if (this.easingTimer > 0) {
      // Плавный выход из замедления за 220 мс
      this.easingTimer -= realDt;
      const progress = Math.min(1.0, 1.0 - (this.easingTimer / 0.22));
      // Ease-out curve
      const ease = 1.0 - Math.pow(1.0 - progress, 2);
      this.timeScale = 0.04 + ease * 0.96;
      if (this.easingTimer <= 0) {
        this.timeScale = 1.0;
      }
    } else {
      this.timeScale = 1.0;
    }

    // 3. Зум камеры
    this.zoomFactor += (this.targetZoom - this.zoomFactor) * Math.min(1.0, realDt * 12.0);

    // 4. Тряска камеры
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - realDt * 3.5);
    }

    // 5. Затухание toast
    if (this.toastTimer > 0) {
      this.toastTimer -= realDt;
      if (this.toastTimer <= 0 && this.toastEl) {
        this.toastEl.classList.remove('show');
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.FxDirector = FxDirector;
}
