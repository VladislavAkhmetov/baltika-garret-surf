/**
 * Tony's Garret — Surf Rush
 * SliceRivals: Менеджер соперников Тони и Кайтера для вертикального среза
 * (§6 VERTICAL_SLICE_SPEC.md, §7.1 LEVEL1_SPEC.md)
 */

class SliceRivals {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;

    this.rivals = [
      {
        id: 'tony',
        name: 'ТОНИ',
        flavor: 'cherry',
        baseMult: 1.02,
        x: 1.0,           // стартует в кармане
        z: 40.0,          // 40 м впереди игрока
        speed: 26.5,
        targetX: 1.0,
        mesh: null,
        overtaken: false,
        nameplateMesh: null,
        airY: 0.0,
        vy: 0.0,
        airborne: false,
        spin: 0.0
      },
      {
        id: 'kiter',
        name: 'КАЙТЕР',
        flavor: 'lemon',
        baseMult: 0.98,
        x: 6.0,           // стартует на плече
        z: -15.0,         // 15 м позади игрока
        speed: 25.5,
        targetX: 6.0,
        mesh: null,
        overtaken: true,  // игрок начинает впереди Кайтера
        nameplateMesh: null,
        airY: 0.0,
        vy: 0.0,
        airborne: false,
        spin: 0.0
      }
    ];

    this.initMeshes();
  }

  initMeshes() {
    this.rivals.forEach((r) => {
      // 1. Риг сёрфера с соответствующим цветом
      const rig = SurfModels.createPaperSurferRig(r.flavor);
      rig.name = `rivalRig_${r.id}`;

      // Тинт цвета для различимости
      if (r.id === 'tony') {
        const sprite = rig.getObjectByName('surferSprite');
        if (sprite && sprite.material) {
          sprite.material.color.setHex(0xFFE4E4); // легкий теплый красный оттенок
        }
      } else if (r.id === 'kiter') {
        const sprite = rig.getObjectByName('surferSprite');
        if (sprite && sprite.material) {
          sprite.material.color.setHex(0xDEFFD4); // неоново-зеленый оттенок
        }
      }

      // 2. Бумажная бирка с именем над головой (§7.1, п. 4 ревью)
      const nameplate = this.createNameplate(r.name, r.id === 'tony' ? '#D93829' : '#1F78B4');
      this.scene.add(nameplate);
      r.nameplateMesh = nameplate;

      this.scene.add(rig);
      r.mesh = rig;
    });
  }

  createNameplate(name, bgColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    // Бумажная плашка со скотчем
    ctx.fillStyle = bgColor;
    ctx.fillRect(4, 6, 120, 36);

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 6, 120, 36);

    ctx.strokeStyle = '#1C1A22';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(2, 4, 124, 40);

    ctx.font = '900 20px Montserrat, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 64, 25);

    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(1.2, 0.45);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide
    });
    return new THREE.Mesh(geo, mat);
  }

  reset(playerZ = 0) {
    const tony = this.rivals[0];
    tony.x = 1.0;
    tony.z = playerZ + 40.0;
    tony.speed = 26.5;
    tony.targetX = 1.0;
    tony.overtaken = false;
    tony.aheadDuration = 0.0;
    tony.overtakeCooldown = 0.0;
    tony.airY = 0;
    tony.airborne = false;

    const kiter = this.rivals[1];
    kiter.x = 6.0;
    kiter.z = playerZ - 15.0;
    kiter.speed = 25.5;
    kiter.targetX = 6.0;
    kiter.overtaken = true;
    kiter.aheadDuration = 0.0;
    kiter.overtakeCooldown = 0.0;
    kiter.airY = 0;
    kiter.airborne = false;
  }

  update(dt, player, currentBeat) {
    const wave = this.game.peelWave;

    this.rivals.forEach((r) => {
      // 1. Поведение ИИ по битам (§6)
      if (currentBeat) {
        if (currentBeat.id === 'pump' || currentBeat.id === 'rise') {
          r.targetX = r.id === 'tony' ? 1.0 : 5.5;
        } else if (currentBeat.id === 'pocket') {
          r.targetX = r.id === 'tony' ? 0.8 : 5.0;
        } else if (currentBeat.id === 'launch') {
          // Оба идут в карман к рампе
          r.targetX = 1.2;
          // Кайтер на 925 м прыгает раньше игрока (пример для глаз!)
          if (r.id === 'kiter' && r.z >= 925 && !r.airborne && r.z < 960) {
            r.airborne = true;
            r.vy = 8.5;
            r.spin = 360;
          }
        } else if (currentBeat.id === 'shoulder') {
          // Кайтер атакует на плече
          r.targetX = r.id === 'kiter' ? 5.5 : 2.0;
        } else if (currentBeat.id === 'finish') {
          r.targetX = r.id === 'tony' ? 1.5 : 4.5;
        }
      }

      // 2. Объезд ближайших буйков в пределах 15 м
      if (this.game.scriptObjects) {
        const nearbyBuoy = this.game.scriptObjects.find(
          obj => obj.type === 'buoy' && obj.z > r.z && obj.z < r.z + 15 && Math.abs(obj.x - r.x) < 1.4
        );
        if (nearbyBuoy) {
          // Уклоняемся в противоположную сторону
          r.targetX += (r.x < nearbyBuoy.x ? -1.8 : 1.8);
        }
      }

      // 3. Плавный подход к желаемому X
      const turnLerp = 1.0 - Math.exp(-6.0 * dt);
      r.x += (r.targetX - r.x) * turnLerp;

      // 4. Расчёт скорости с Rubber Band
      const surface = wave ? wave.getSurface(r.x, r.z) : { height: 0, slope: 0, inPocket: 0 };
      const pocketMult = 1.0 + (surface.inPocket || 0) * 0.25;

      // Rubber band: clamp((player.z - rival.z) * 0.015, -2.5, 3.0)
      const distDiff = player.z - r.z;
      const rubberBand = Math.max(-2.5, Math.min(3.0, distDiff * 0.015));

      const targetSpeed = player.speed * r.baseMult * pocketMult + rubberBand;
      r.speed += (targetSpeed - r.speed) * Math.min(1.0, dt * 2.5);
      r.z += r.speed * dt;

      // 5. Физика прыжка (для показательного прыжка Кайтера)
      if (r.airborne) {
        r.vy -= 18.0 * dt;
        r.airY += r.vy * dt;
        if (r.airY <= 0) {
          r.airY = 0;
          r.airborne = false;
          r.vy = 0;
        }
      }

      // 6. Позиционирование 3D меша и бирки с именем (п. 4 ревью)
      const worldX = SurfPhysics.toWorldX(r.x);
      const y = surface.height + r.airY;

      if (r.mesh) {
        r.mesh.position.set(worldX, y, r.z);
        r.mesh.rotation.set(0, 0, surface.slope);
      }

      if (r.nameplateMesh && this.game && this.game.camera) {
        r.nameplateMesh.position.set(worldX, y + 2.7, r.z);
        // Billboard строго лицом к камере, без отрицательного scale.x
        r.nameplateMesh.quaternion.copy(this.game.camera.quaternion);

        const camDist = this.game.camera.position.distanceTo(r.nameplateMesh.position);
        if (camDist < 6.0) {
          // Скрывать ближе 6 м
          r.nameplateMesh.visible = false;
        } else {
          r.nameplateMesh.visible = true;
          // Фиксированный экранный размер ~14px по высоте текста
          const s = camDist * 0.048 * (this.game.camera.fov / 58.0);
          r.nameplateMesh.scale.set(s, s, s);
        }
      }

      // 7. Обгон с гистерезисом (п. 3 ревью)
      // Кулдаун между обгонами для одного соперника — не чаще раза в 8 с
      r.overtakeCooldown = Math.max(0, (r.overtakeCooldown || 0) - dt);

      // Засчитывать, только если игрок впереди соперника на >= 3 м и держится так 0.5 с
      const distAhead = player.z - r.z;
      if (distAhead >= 3.0) {
        r.aheadDuration = (r.aheadDuration || 0) + dt;
      } else {
        r.aheadDuration = 0.0;
      }

      if (!r.overtaken && r.aheadDuration >= 0.5 && r.overtakeCooldown <= 0.0) {
        r.overtaken = true;
        r.overtakeCooldown = 8.0;
        if (this.game.fx) {
          if (r.id === 'tony') {
            this.game.fx.moment({
              word: 'ОБГОН!',
              sub: 'ТОНИ',
              tone: 'gold',
              freeze: 450,
              zoom: 0.88,
              priority: 3,
              sound: 'crowd'
            });
            this.game.addScore(500);
          } else {
            this.game.fx.moment({
              word: 'ОБГОН!',
              sub: 'КАЙТЕР',
              tone: 'white',
              freeze: 320,
              zoom: 0.88,
              priority: 2,
              sound: 'crowd'
            });
            this.game.addScore(250);
          }
        }
      } else if (r.overtaken && r.z > player.z) {
        // Обратный обгон (соперник обошёл игрока) — toast «ТОНИ ОБОШЁЛ», без стоп-кадра
        r.overtaken = false;
        r.aheadDuration = 0.0;
        if (this.game.fx) {
          const toastName = r.id === 'tony' ? 'ТОНИ ОБОШЁЛ' : 'КАЙТЕР ОБОШЁЛ';
          this.game.fx.toast(toastName, 'red');
        }
      }

      // 8. Взаимодействие с игроком
      const dz = player.z - r.z;
      const dx = Math.abs(player.x - r.x);

      // А. Кильватер (10 м позади бота)
      if (dz > -10.0 && dz < 0.0 && dx < 2.0) {
        player.wakeBonus = 2.0; // ускорение в кильватере
        if (this.game.balance) {
          this.game.balance.addWake(1, 0.4);
        }
      }

      // Б. Столкновение с соперником
      if (Math.abs(dz) < 1.4 && dx < 1.2) {
        this.game.physics.triggerStumble('Столкновение с ' + r.name);
        if (this.game.balance) {
          this.game.balance.onHit ? this.game.balance.onHit() : null;
        }
      }
    });
  }

  /**
   * Получение текущей позиции игрока в гонке (1, 2 или 3)
   */
  getPlayerRank(playerZ) {
    let rank = 1;
    this.rivals.forEach((r) => {
      if (r.z > playerZ) {
        rank++;
      }
    });
    return rank;
  }
}

if (typeof window !== 'undefined') {
  window.SliceRivals = SliceRivals;
}
