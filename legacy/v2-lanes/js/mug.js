/**
 * Tony's Garret — Surf Rush
 * MugLiquid (1D физика жидкости) + MugRenderer (2D canvas HUD)
 * (§5 LEVEL1_SPEC)
 */

class MugLiquid {
  constructor() {
    const C = CFG.mug;
    this.n = C.n; // 28 точек
    this.h = new Float32Array(this.n); // отклонение поверхности (доли высоты)
    this.v = new Float32Array(this.n); // скорость точек

    this.level = 1.0; // 0.0 ... 1.0
    this.foam = C.foamMax; // 0.0 ... 1.0 (пена-щит)
    this.calmTime = 0.0;
    this.accumulator = 0.0;

    this.multiplier = 3; // >=90% -> x3, >=60% -> x2, else x1
    this.spillListeners = [];
    this.isSpilling = false;
    this.lastSpillTime = 0;
    this.totalSpilled = 0;
  }

  reset() {
    this.h.fill(0);
    this.v.fill(0);
    this.level = 1.0;
    this.foam = CFG.mug.foamMax;
    this.calmTime = 0.0;
    this.accumulator = 0.0;
    this.multiplier = 3;
    this.isSpilling = false;
  }

  onSpill(side, amount) {
    this.isSpilling = true;
    this.lastSpillTime = performance.now();
    this.totalSpilled += amount;

    for (let i = 0; i < this.spillListeners.length; i++) {
      this.spillListeners[i](side, amount);
    }
  }

  addSpillListener(fn) {
    this.spillListeners.push(fn);
  }

  // Фиксированный шаг 1/120 с (§5.1 спецификации)
  step(dt, ax, ay, tilt) {
    const C = CFG.mug;
    const n = this.n;
    const k = C.c2 * dt;
    const drive = (ax + Math.sin(tilt)) * C.forceK;

    for (let i = 0; i < n; i++) {
      const l = this.h[i > 0 ? i - 1 : 0];
      const r = this.h[i < n - 1 ? i + 1 : n - 1];
      const x = i / (n - 1) - 0.5;

      this.v[i] += (k * (l + r - 2 * this.h[i]) / (n * 0.5)
                   - C.damping * this.v[i] * dt
                   - drive * x * dt
                   - ay * this.h[i] * C.vertK * dt);
    }

    let mean = 0;
    for (let i = 0; i < n; i++) {
      this.h[i] += this.v[i] * dt;
      mean += this.h[i];
    }
    mean /= n;

    // Сохранение объема жидкости
    for (let i = 0; i < n; i++) {
      this.h[i] -= mean;
    }

    this.handleSpill(dt);
  }

  handleSpill(dt) {
    const C = CFG.mug;
    const base = this.level * C.fillAt100; // уровень жидкости 0..0.92
    const freeboard = C.rim - base; // запас до края кружки

    for (const i of [0, C.n - 1]) {
      const over = this.h[i] - freeboard;
      if (over > 0) {
        const amount = over * C.spillRate * dt;
        if (this.foam > 0) {
          // Пена действует как защитный буфер
          this.foam = Math.max(0, this.foam - amount * C.foamAbsorb);
        } else {
          this.level = Math.max(0, this.level - amount);
        }
        this.h[i] = freeboard;
        this.v[i] *= 0.3;
        this.onSpill(i === 0 ? -1 : 1, amount);
      }
    }
  }

  // Обновление с накопителем фиксированного шага 1/120 с
  update(dt, ax, ay, tilt) {
    const fixedDt = 1 / 120;
    this.accumulator += Math.min(dt, 0.1);

    while (this.accumulator >= fixedDt) {
      this.step(fixedDt, ax, ay, tilt);
      this.accumulator -= fixedDt;
    }

    // Восстановление пены: foamRegen/с, если |h|max < 0.05 1.5 с подряд
    let maxH = 0;
    for (let i = 0; i < this.n; i++) {
      const absH = Math.abs(this.h[i]);
      if (absH > maxH) maxH = absH;
    }

    if (maxH < 0.05) {
      this.calmTime += dt;
      if (this.calmTime >= 1.5) {
        this.foam = Math.min(CFG.mug.foamMax, this.foam + CFG.mug.foamRegen * dt);
      }
    } else {
      this.calmTime = 0;
    }

    // Множитель очков: >= 90% -> x3, >= 60% -> x2, иначе x1
    const pct = this.level * 100;
    let newMult = 1;
    if (pct >= 90) newMult = 3;
    else if (pct >= 60) newMult = 2;

    this.multiplier = newMult;
  }

  // Импульс при посадке (s = landImpulse * (1 - clean))
  applyLandingImpulse(clean = 0) {
    const C = CFG.mug;
    const s = C.landImpulse * (1 - Math.max(0, Math.min(1, clean)));
    const mid = Math.floor(this.n / 2);

    this.v[0] += s;
    this.v[this.n - 1] += s;
    this.v[mid] -= s;
  }

  // Прямой импульс при спотыкании/ударе
  applyStumbleImpulse(spillLoss = 0.14) {
    // Всплеск в стороны
    const s = 3.6;
    this.v[0] += s;
    this.v[this.n - 1] += s;
    this.v[Math.floor(this.n / 2)] -= s * 1.5;

    // Прямая потеря пива от удара
    if (this.foam > 0) {
      this.foam = Math.max(0, this.foam - spillLoss * CFG.mug.foamAbsorb);
    } else {
      this.level = Math.max(0, this.level - spillLoss);
    }
    this.onSpill(0, spillLoss);
  }
}

// -------------------------------------------------------------
// MugRenderer: 2D Canvas HUD рендер кружки с жидкостью и пеной
// -------------------------------------------------------------

class MugRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;

    // Пузырьки в кружке (12 штук)
    this.bubbles = [];
    for (let i = 0; i < 12; i++) {
      this.bubbles.push({
        xRel: Math.random(),
        yRel: Math.random(),
        r: 1.5 + Math.random() * 2.2,
        speed: 0.15 + Math.random() * 0.25,
        wobble: Math.random() * Math.PI * 2
      });
    }

    // Капли выплеска (2D частицы-наклейки)
    this.droplets = [];

    // Цвета пива по умолчанию (вишневый крафт)
    this.beerColorTop = '#9E0832';
    this.beerColorBottom = '#4D0014';
    this.foamColor = '#F6F1E4';
    this.inkColor = '#1C1A22';

    this.labelEl = document.getElementById('mug-pct-label');
    this.multEl = document.getElementById('mug-multiplier-badge');

    // Кэш размеров
    this.cssWidth = 120;
    this.cssHeight = 154; // 0.78:1
    this.dpr = 1;
    this.updateSize();
  }

  setColor(flavorKey) {
    const f = CFG.flavors[flavorKey] || CFG.flavors.cherry;
    this.beerColorTop = f.beerHex || '#9E0832';
    // Дно темнее на 25%
    if (flavorKey === 'cherry') {
      this.beerColorTop = '#B50E3E';
      this.beerColorBottom = '#5A0017';
    } else if (flavorKey === 'peach') {
      this.beerColorTop = '#FF8A3D';
      this.beerColorBottom = '#A84400';
    } else if (flavorKey === 'lemon') {
      this.beerColorTop = '#F8D038';
      this.beerColorBottom = '#A47E00';
    }
  }

  updateSize() {
    if (!this.canvas) return;

    const w = Math.min(window.innerWidth * 0.30, 132);
    const h = w / 0.78;
    this.cssWidth = w;
    this.cssHeight = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  emitSpillParticles(side) {
    const dir = side === -1 ? -1 : (side === 1 ? 1 : (Math.random() > 0.5 ? 1 : -1));
    const startX = dir < 0 ? this.cssWidth * 0.22 : this.cssWidth * 0.76;
    const startY = this.cssHeight * 0.28;

    for (let i = 0; i < 4; i++) {
      this.droplets.push({
        x: startX,
        y: startY + (Math.random() - 0.5) * 8,
        vx: dir * (40 + Math.random() * 90),
        vy: -(50 + Math.random() * 80),
        r: 3 + Math.random() * 3.5,
        alpha: 1.0
      });
    }

    // Вспышка процента красным при выплеске
    if (this.labelEl) {
      this.labelEl.classList.remove('spill-flash');
      void this.labelEl.offsetWidth; // reflow
      this.labelEl.classList.add('spill-flash');
    }
  }

  render(mugLiquid, dt = 0.016, mugTilt = 0) {
    if (!this.ctx || !mugLiquid) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const scale = (W / this.cssWidth);

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.scale(scale, scale);

    const w = this.cssWidth;
    const h = this.cssHeight;

    // Геометрия кружки
    const glassLeft = w * 0.16;
    const glassRight = w * 0.78;
    const glassWidth = glassRight - glassLeft;
    const rimY = h * 0.22;
    const baseY = h * 0.88;
    const totalHeight = baseY - rimY;

    // Поворот стекла кружки на mugTilt (§5.3)
    if (mugTilt) {
      const pivotX = (glassLeft + glassRight) * 0.5;
      const pivotY = (rimY + baseY) * 0.5;
      ctx.translate(pivotX, pivotY);
      ctx.rotate(mugTilt);
      ctx.translate(-pivotX, -pivotY);
    }

    // 1. Стеклянное тело (задняя стенка и ручка)
    this.drawGlassBack(ctx, glassLeft, glassRight, rimY, baseY, w, h);

    // 2. Жидкость пива
    this.drawLiquid(ctx, mugLiquid, glassLeft, glassRight, rimY, baseY, totalHeight, dt);

    // 3. Стеклянная передняя грань (ручка, блики, контур)
    this.drawGlassFront(ctx, glassLeft, glassRight, rimY, baseY, w, h);

    // 4. Капли выплеска (2D стикеры)
    this.drawDroplets(ctx, dt);

    ctx.restore();

    // 5. Обновление текстового бейджа процентов и множителя
    this.updateHUDLabels(mugLiquid);
  }

  drawGlassBack(ctx, left, right, rimY, baseY, w, h) {
    // Массивная ручка сбоку справа
    ctx.strokeStyle = 'rgba(215, 238, 255, 0.75)';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(right - 2, h * 0.35);
    ctx.bezierCurveTo(w * 0.98, h * 0.38, w * 0.98, h * 0.70, right - 2, h * 0.74);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(28, 26, 34, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Заднее прозрачное стекло
    ctx.fillStyle = 'rgba(235, 247, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(left, rimY);
    ctx.lineTo(right, rimY);
    ctx.lineTo(right - 4, baseY);
    ctx.lineTo(left + 4, baseY);
    ctx.closePath();
    ctx.fill();
  }

  drawLiquid(ctx, mugLiquid, left, right, rimY, baseY, totalHeight, dt) {
    const n = mugLiquid.n;
    const fillAt100 = CFG.mug.fillAt100;
    const baseLiquidY = baseY - mugLiquid.level * fillAt100 * totalHeight;

    // Вычисление точек поверхности
    const pts = [];
    const width = right - left;
    for (let i = 0; i < n; i++) {
      const x = left + (i / (n - 1)) * width;
      const y = baseLiquidY - mugLiquid.h[i] * totalHeight;
      pts.push({ x, y });
    }

    // А. Полигон пива с Catmull-Rom сглаживанием
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(left + 4, baseY);
    ctx.lineTo(pts[0].x, pts[0].y);

    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const midX = (p0.x + p1.x) * 0.5;
      const midY = (p0.y + p1.y) * 0.5;
      ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
    }
    ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
    ctx.lineTo(right - 4, baseY);
    ctx.closePath();

    // Вертикальный градиент пива: сверху цвет вкуса, ко дну темнее на 25%
    const grad = ctx.createLinearGradient(0, rimY, 0, baseY);
    grad.addColorStop(0, this.beerColorTop);
    grad.addColorStop(1, this.beerColorBottom);
    ctx.fillStyle = grad;
    ctx.fill();

    // Б. Пузырьки внутри пива (12 штук)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let b of this.bubbles) {
      b.yRel -= b.speed * dt;
      b.wobble += dt * 4.0;
      if (b.yRel <= 0) {
        b.yRel = 0.95;
        b.xRel = 0.1 + Math.random() * 0.8;
      }

      const bx = left + b.xRel * width + Math.sin(b.wobble) * 2;
      const by = baseY - b.yRel * (baseY - baseLiquidY);

      if (by >= baseLiquidY && by <= baseY) {
        ctx.beginPath();
        ctx.arc(bx, by, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // В. Пена на поверхности (кремовая полоса + ряд бумажных кружков)
    if (mugLiquid.foam > 0.05) {
      const foamThickness = mugLiquid.foam * 14;

      ctx.save();
      ctx.fillStyle = this.foamColor;
      ctx.strokeStyle = this.inkColor;
      ctx.lineWidth = 1.2;

      // Тело пены
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y + foamThickness);
      for (let i = 0; i < n; i++) {
        ctx.lineTo(pts[i].x, pts[i].y - 2);
      }
      ctx.lineTo(pts[n - 1].x, pts[n - 1].y + foamThickness);
      ctx.closePath();
      ctx.fill();

      // Ряд бумажных кругов по верхушке пены (3-6px)
      const numFoamCircles = 11;
      for (let i = 0; i <= numFoamCircles; i++) {
        const idx = Math.min(n - 1, Math.floor((i / numFoamCircles) * (n - 1)));
        const cx = pts[idx].x;
        const cy = pts[idx].y - 1;
        const r = 3.5 + (i % 3) * 1.2;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawGlassFront(ctx, left, right, rimY, baseY, w, h) {
    // Толстое дно бокала
    ctx.fillStyle = 'rgba(215, 238, 255, 0.65)';
    ctx.fillRect(left + 3, baseY - 4, (right - left) - 6, 8);

    // Вертикальные граненые блики на стекле
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(left + 10, rimY + 6, 6, baseY - rimY - 14);
    ctx.fillRect(left + 22, rimY + 8, 3, baseY - rimY - 18);
    ctx.fillRect(right - 14, rimY + 6, 4, baseY - rimY - 14);

    // Внешний бумажный контур бокала тушью (--ink)
    ctx.strokeStyle = this.inkColor;
    ctx.lineWidth = 2.0;
    ctx.strokeRect(left, rimY, right - left, baseY - rimY);

    // Ободок кружки
    ctx.strokeRect(left - 2, rimY - 3, right - left + 4, 6);

    // Тонкая риска-горизонт тушью на стекле (--ink, 1px, opacity 0.5, LEVEL1_SPEC §5.3)
    const midGlassY = (rimY + baseY) * 0.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(28, 26, 34, 0.50)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(left + 2, midGlassY);
    ctx.lineTo(right - 2, midGlassY);
    ctx.stroke();
    ctx.restore();
  }

  drawDroplets(ctx, dt) {
    const remaining = [];
    for (let d of this.droplets) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 220 * dt; // гравитация
      d.alpha -= dt * 1.6;

      if (d.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle = this.beerColorTop;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        remaining.push(d);
      }
    }
    this.droplets = remaining;
  }

  updateHUDLabels(mugLiquid) {
    const pct = Math.max(0, Math.round(mugLiquid.level * 100));

    if (this.labelEl) {
      this.labelEl.textContent = pct + '%';
    }

    if (this.multEl) {
      this.multEl.textContent = '×' + mugLiquid.multiplier;
      this.multEl.className = 'multiplier-badge mult-x' + mugLiquid.multiplier;
    }
  }
}

if (typeof window !== 'undefined') {
  window.MugLiquid = MugLiquid;
  window.MugRenderer = MugRenderer;
}
