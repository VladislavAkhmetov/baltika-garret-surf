/**
 * Tony's Garret — Surf Rush
 * LevelSpawner: Спавнер трассы, пулы объектов, коллизии (§4 LEVEL1_SPEC)
 * Спавн за 120 м вперед, удаление за 20 м позади, AABB коллизии, правила Subway
 */

class LevelSpawner {
  constructor(game, scene, entityFactory) {
    this.game = game;
    this.scene = scene;
    this.factory = entityFactory;

    // Чтение seed из URL (?seed=12345) или дефолтный
    const params = new URLSearchParams(window.location.search);
    const urlSeed = params.get('seed');
    this.seed = urlSeed ? parseInt(urlSeed, 10) : 12345;

    // Генерация массива строк уровня
    this.rows = LEVEL1.generateRows(this.seed);
    this.nextRowIndex = 0;

    // Активные сущности в мире
    this.activeEntities = [];

    // Состояние бонусов
    this.magnetActive = false;
    this.magnetTimer = 0;

    // Текущая активная секция
    this.currentSectionId = null;
  }

  reset(startZ = 0) {
    // Возвращаем все активные сущности в пул
    for (let i = 0; i < this.activeEntities.length; i++) {
      this.factory.recycle(this.activeEntities[i]);
    }
    this.activeEntities = [];

    // Находим стартовую строку для startZ
    this.nextRowIndex = 0;
    while (this.nextRowIndex < this.rows.length && this.rows[this.nextRowIndex].z < startZ) {
      this.nextRowIndex++;
    }

    this.magnetActive = false;
    this.magnetTimer = 0;
    this.currentSectionId = null;
  }

  update(dt, playerZ, ocean) {
    const spawnAheadDist = playerZ + CFG.level.spawnAhead; // +120 м
    const despawnBehindDist = playerZ - CFG.level.despawnBehind; // -20 м

    // 1. Спавн новых строк впереди игрока
    while (this.nextRowIndex < this.rows.length && this.rows[this.nextRowIndex].z <= spawnAheadDist) {
      const rowData = this.rows[this.nextRowIndex];
      this.spawnRow(rowData);
      this.nextRowIndex++;
    }

    // 2. Обновление таймера магнита
    if (this.magnetActive) {
      this.magnetTimer -= dt;
      if (this.magnetTimer <= 0) {
        this.magnetActive = false;
      }
    }

    // 3. Обновление активных объектов и коллизии
    const remaining = [];
    for (let i = 0; i < this.activeEntities.length; i++) {
      const e = this.activeEntities[i];

      // Удаление (деспавн) позади игрока
      if (e.z < despawnBehindDist || e.collected) {
        this.factory.recycle(e);
        continue;
      }

      // Притяжение магнитом (все крышки в радиусе 24 м)
      if (this.magnetActive && e.isCollectible && !e.collected) {
        const dx = this.game.player.x - e.x;
        const dz = this.game.player.z - e.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 24) {
          e.x += dx * Math.min(1, 14 * dt);
          e.z += dz * Math.min(1, 14 * dt);
          e.mesh.position.x = e.x;
          e.mesh.position.z = e.z;
        }
      }

      // Обновление положения по поверхности волны
      const surf = ocean.getSurfaceInfo(e.x, e.z);

      if (e.isCollectible) {
        // Вращение крышки и покачивание
        const capY = surf.height + (e.isHigh ? 3.8 : 0.65);
        e.y = capY + Math.sin(ocean.time * 4.5 + e.x) * 0.08;
        e.mesh.position.y = e.y;
        e.mesh.rotation.y += e.rotSpeed * dt;
      } else if (e.isRamp) {
        // Трамплин стоит основанием на поверхности
        e.y = surf.height;
        e.mesh.position.y = e.y;
      } else if (e.isBonus) {
        // Бонус парит над водой
        e.y = surf.height + 0.75 + Math.sin(ocean.time * 5.0) * 0.12;
        e.mesh.position.y = e.y;
        e.mesh.rotation.y += 3.5 * dt;
      } else {
        // Буи, скалы, пена, гидроцикл
        e.y = surf.height;
        e.mesh.position.y = e.y;
        if (e.type === 'buoy') {
          e.mesh.rotation.z = Math.sin(ocean.time * 3.2 + e.z) * 0.1;
        }
      }

      // Проверка столкновений с игроком
      this.checkPlayerCollision(e);

      if (!e.collected) {
        remaining.push(e);
      } else {
        this.factory.recycle(e);
      }
    }

    this.activeEntities = remaining;

    // 4. Проверка секций и подсказок
    this.updateSectionTracking(playerZ);
  }

  spawnRow(rowData) {
    const rowStr = rowData.row;
    const z = rowData.z;

    // 3 полосы: 0 = лево (+2.4), 1 = центр (0), 2 = право (-2.4)
    for (let laneIdx = 0; laneIdx < 3; laneIdx++) {
      const char = rowStr[laneIdx];
      if (char === '.' || !char) continue;

      const x = CFG.lanes.x[laneIdx];

      switch (char) {
        case 'c': {
          const e = this.factory.spawn('cap_fish', x, z, laneIdx);
          if (e) this.activeEntities.push(e);
          break;
        }
        case 'p': {
          const e = this.factory.spawn('cap_palm', x, z, laneIdx);
          if (e) this.activeEntities.push(e);
          break;
        }
        case 'G': {
          const e = this.factory.spawn('cap_gold', x, z, laneIdx, rowData.goldSlot);
          if (e) this.activeEntities.push(e);
          break;
        }
        case '^': {
          const e = this.factory.spawn('cap_high', x, z, laneIdx);
          if (e) this.activeEntities.push(e);
          break;
        }
        case 'R': {
          const e = this.factory.spawn('ramp', x, z, laneIdx);
          if (e) this.activeEntities.push(e);
          break;
        }
        case 'M': {
          // Мега-трамплин занимает всю ширину (ставится в центр полосы x=0)
          if (laneIdx === 1) {
            const e = this.factory.spawn('mega_ramp', 0, z, 1);
            if (e) this.activeEntities.push(e);
          }
          break;
        }
        case 'B': {
          const e = this.factory.spawn('buoy', x, z, laneIdx);
          if (e) this.activeEntities.push(e);
          break;
        }
        case 'K': {
          const e = this.factory.spawn('rock', x, z, laneIdx);
          if (e) this.activeEntities.push(e);
          break;
        }
        case 'F': {
          const e = this.factory.spawn('foam_wall', x, z, laneIdx);
          if (e) this.activeEntities.push(e);
          break;
        }
        case 'J': {
          const e = this.factory.spawn('jetski', x, z, laneIdx);
          if (e) this.activeEntities.push(e);
          break;
        }
        case 'I': {
          const e = this.factory.spawn('bonus_ice', x, z, laneIdx);
          if (e) this.activeEntities.push(e);
          break;
        }
        case 'N': {
          const e = this.factory.spawn('bonus_magnet', x, z, laneIdx);
          if (e) this.activeEntities.push(e);
          break;
        }
      }
    }
  }

  checkPlayerCollision(e) {
    const p = this.game.player;
    if (this.game.state !== 'playing') return;

    const dx = Math.abs(p.x - e.x);
    const dz = Math.abs(p.z - e.z);

    // Проверка попадания в горизонтальный хитбокс
    if (dx > e.hitRadiusX || dz > e.hitDepthZ) {
      return;
    }

    // 1. КОЛЛЕКЦИОННЫЕ КРЫШКИ
    if (e.isCollectible) {
      if (e.isHigh) {
        // Высокая крышка достается только в прыжке / с трамплина (airY > 2.0)
        if (p.airY >= 1.8) {
          e.collected = true;
          this.game.onCapCollected(e);
        }
      } else {
        // Обычные крышки берутся, если игрок не слишком высоко в воздухе
        if (p.airY <= 2.2) {
          e.collected = true;
          this.game.onCapCollected(e);
        }
      }
      return;
    }

    // 2. ТРАМПЛИНЫ
    if (e.isRamp) {
      if (p.airY <= 0.6) {
        // Въезд на трамплин запускает прыжок
        this.game.onRampLaunch(e);
      }
      return;
    }

    // 3. БОНУСЫ
    if (e.isBonus) {
      e.collected = true;
      if (e.bonusType === 'bonus_ice') {
        this.game.onBonusIce();
      } else if (e.bonusType === 'bonus_magnet') {
        this.activateMagnet();
        this.game.onBonusMagnet();
      }
      return;
    }

    // 4. ПРЕПЯТСТВИЯ
    if (e.isObstacle) {
      let isAvoided = false;

      // Буй: перепрыгивается при airY > 0.7
      if (e.canJumpOver && p.isJumping && p.airY >= e.jumpClearHeight) {
        isAvoided = true;
      }

      // Стена пены: подныривается (duck) или перепрыгивается высоко
      if (e.canDuckUnder && p.isDucking) {
        isAvoided = true;
      }

      if (!isAvoided) {
        e.collected = true; // предотвращаем повторный удар за кадр
        this.game.onObstacleHit(e);
      }
    }
  }

  activateMagnet() {
    this.magnetActive = true;
    this.magnetTimer = 8.0; // 8 секунд действия магнита
  }

  updateSectionTracking(playerZ) {
    const sec = LEVEL1.sections.find((s) => playerZ >= s.fromM && playerZ < s.toM);
    if (sec && sec.id !== this.currentSectionId) {
      this.currentSectionId = sec.id;
      this.game.onSectionEnter(sec);
    }
  }
}

if (typeof window !== 'undefined') {
  window.LevelSpawner = LevelSpawner;
}
