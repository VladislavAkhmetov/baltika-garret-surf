/**
 * Tony's Garret — Surf Rush (Sandbox v3)
 * TuningPanel: Панель тюнинга параметров физики управления (§6 CONTROLS_SANDBOX_SPEC.md, HANDOFF v3)
 */

class TuningPanel {
  constructor(game) {
    this.game = game;
    this.isOpen = false;

    // Спецификация ползунков: [группа, ключ, label, min, max, step, def]
    this.schema = [
      // Наклон
      { group: 'Наклон', key: 'leanRange', label: 'Диапазон наклона (°)', min: 10, max: 40, step: 1, def: 25 },
      { group: 'Наклон', key: 'leanCurve', label: 'Кривая отклика (степень)', min: 1.0, max: 2.0, step: 0.05, def: 1.3 },
      { group: 'Наклон', key: 'leanAlpha', label: 'Фильтр сглаживания alpha', min: 0.15, max: 0.9, step: 0.05, def: 0.45 },
      { group: 'Наклон', key: 'maxHeading', label: 'Макс. угол курса (°)', min: 15, max: 60, step: 1, def: 38 },
      { group: 'Наклон', key: 'turnRate', label: 'Скорость доворота (turnRate)', min: 2, max: 12, step: 0.5, def: 6 },
      { group: 'Наклон', key: 'lateralScale', label: 'Масштаб поперечной скорости', min: 0.15, max: 0.6, step: 0.05, def: 0.35 },

      // Скорость
      { group: 'Скорость', key: 'pocketBoost', label: 'Ускорение в кармане', min: 0.0, max: 0.8, step: 0.05, def: 0.40 },
      { group: 'Скорость', key: 'carveDrag', label: 'Торможение в вираже', min: 0.0, max: 0.3, step: 0.02, def: 0.12 },
      { group: 'Скорость', key: 'pumpGain', label: 'Сила накачки (pumpGain)', min: 0.0, max: 20, step: 0.5, def: 8 },
      { group: 'Скорость', key: 'peelSpeed', label: 'Скорость ломки волны', min: 0.8, max: 1.2, step: 0.05, def: 1.0 },

      // Прыжок
      { group: 'Прыжок', key: 'jumpBase', label: 'Базовый прыжок (м/с)', min: 2, max: 9, step: 0.5, def: 5 },
      { group: 'Прыжок', key: 'jumpHold', label: 'Бонус удержания прыжка', min: 0, max: 14, step: 0.5, def: 8 },
      { group: 'Прыжок', key: 'gravity', label: 'Гравитация (м/с²)', min: 10, max: 30, step: 1, def: 18 },
      { group: 'Прыжок', key: 'spinRate', label: 'Скорость вращения (°/с)', min: 200, max: 900, step: 20, def: 540 },

      // Кружка
      { group: 'Кружка', key: 'sloshTau', label: 'Окно сглаживания sloshTau (с)', min: 0.1, max: 0.8, step: 0.05, def: 0.35 },
      { group: 'Кружка', key: 'jerkGain', label: 'Чувствительность рывка jerkGain', min: 0.3, max: 2.0, step: 0.1, def: 1.0 },
      { group: 'Кружка', key: 'chopPocket', label: 'Рябь на склоне chopPocket (°)', min: 0, max: 12, step: 1, def: 5 },
      { group: 'Кружка', key: 'assist', label: 'Ассист гашения возмущений', min: 0.0, max: 0.6, step: 0.05, def: 0.3 }
    ];

    this.initDOM();
  }

  initDOM() {
    // 1. Кнопка ⚙
    const btnToggle = document.getElementById('btn-tuning-toggle');
    if (btnToggle) {
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }

    // 2. Контейнер панели
    this.panelEl = document.getElementById('tuning-panel');
    if (!this.panelEl) return;

    this.renderSliders();
    this.bindButtons();
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.panelEl) {
      this.panelEl.classList.toggle('open', this.isOpen);
    }
    const btnToggle = document.getElementById('btn-tuning-toggle');
    if (btnToggle) {
      btnToggle.textContent = this.isOpen ? '✕' : '⚙';
    }
    // Ставим игру на паузу, пока открыта панель
    if (this.game) {
      this.game.isPaused = this.isOpen;
    }
  }

  renderSliders() {
    const listEl = document.getElementById('tuning-sliders-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    let currentGroup = '';

    this.schema.forEach((item) => {
      if (item.group !== currentGroup) {
        currentGroup = item.group;
        const groupHeader = document.createElement('div');
        groupHeader.className = 'tuning-group-title';
        groupHeader.textContent = currentGroup;
        listEl.appendChild(groupHeader);
      }

      const val = (CFG.surf && CFG.surf[item.key] !== undefined) ? CFG.surf[item.key] : item.def;

      const row = document.createElement('div');
      row.className = 'tuning-slider-row';

      const labelBox = document.createElement('div');
      labelBox.className = 'tuning-label-box';
      labelBox.innerHTML = `<span>${item.label}</span><b id="val-${item.key}">${val}</b>`;

      const input = document.createElement('input');
      input.type = 'range';
      input.min = item.min;
      input.max = item.max;
      input.step = item.step;
      input.value = val;
      input.className = 'tuning-range-input';

      input.addEventListener('input', (e) => {
        const num = parseFloat(e.target.value);
        if (CFG.surf) CFG.surf[item.key] = num;
        const valLabel = document.getElementById(`val-${item.key}`);
        if (valLabel) valLabel.textContent = num;
      });

      row.appendChild(labelBox);
      row.appendChild(input);
      listEl.appendChild(row);
    });
  }

  updateSliderUI() {
    this.schema.forEach((item) => {
      const val = (CFG.surf && CFG.surf[item.key] !== undefined) ? CFG.surf[item.key] : item.def;
      const input = this.panelEl.querySelector(`input[type="range"][min="${item.min}"][max="${item.max}"]`);
      const valLabel = document.getElementById(`val-${item.key}`);
      if (valLabel) valLabel.textContent = val;
      if (input) input.value = val;
    });
  }

  bindButtons() {
    // Телепорты по зонам цикла (§2)
    const zones = [
      { id: 'btn-zone-wave', z: 0 },
      { id: 'btn-zone-swell', z: 300 },
      { id: 'btn-zone-ramps', z: 550 },
      { id: 'btn-zone-rival', z: 700 }
    ];

    zones.forEach((z) => {
      const btn = document.getElementById(z.id);
      if (btn) {
        btn.addEventListener('click', () => {
          if (this.game && this.game.physics) {
            this.game.physics.reset(2.0, z.z);
            if (this.game.snapCamera) this.game.snapCamera();
            this.toggle(); // закрыть панель и продолжить игру
          }
        });
      }
    });

    // Сброс
    const btnReset = document.getElementById('btn-preset-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.schema.forEach((item) => {
          if (CFG.surf) CFG.surf[item.key] = item.def;
        });
        this.renderSliders();
      });
    }

    // Сохранить / Загрузить A, B, C
    ['A', 'B', 'C'].forEach((slot) => {
      const btnSave = document.getElementById(`btn-save-${slot.toLowerCase()}`);
      if (btnSave) {
        btnSave.addEventListener('click', () => this.savePreset(slot));
      }
      const btnLoad = document.getElementById(`btn-load-${slot.toLowerCase()}`);
      if (btnLoad) {
        btnLoad.addEventListener('click', () => this.loadPreset(slot));
      }
    });

    // Копировать JSON
    const btnCopy = document.getElementById('btn-copy-json');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => this.copyJsonToClipboard());
    }
  }

  getPresetJson() {
    const data = {};
    this.schema.forEach((item) => {
      data[item.key] = (CFG.surf && CFG.surf[item.key] !== undefined) ? CFG.surf[item.key] : item.def;
    });
    return JSON.stringify(data, null, 2);
  }

  savePreset(slot) {
    try {
      const presets = JSON.parse(localStorage.getItem('garret_sandbox_presets') || '{}');
      const data = {};
      this.schema.forEach((item) => {
        data[item.key] = CFG.surf[item.key];
      });
      presets[slot] = data;
      localStorage.setItem('garret_sandbox_presets', JSON.stringify(presets));
      alert(`Пресет ${slot} успешно сохранен!`);
    } catch (e) {
      console.warn('Save preset error:', e);
    }
  }

  loadPreset(slot) {
    try {
      const presets = JSON.parse(localStorage.getItem('garret_sandbox_presets') || '{}');
      if (presets[slot]) {
        Object.assign(CFG.surf, presets[slot]);
        this.renderSliders();
        alert(`Пресет ${slot} загружен!`);
      } else {
        alert(`Пресет ${slot} пуст.`);
      }
    } catch (e) {
      console.warn('Load preset error:', e);
    }
  }

  async copyJsonToClipboard() {
    const json = this.getPresetJson();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(json);
        alert('JSON пресета скопирован в буфер обмена!');
        return;
      }
    } catch (e) {}

    // Фолбэк через скрытый textarea
    const ta = document.createElement('textarea');
    ta.value = json;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('JSON пресета скопирован!');
  }
}

if (typeof window !== 'undefined') {
  window.TuningPanel = TuningPanel;
}
