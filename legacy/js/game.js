/**
 * Tony's Garret — Surf Rush (Papercraft 2.5D Edition)
 * Main Game Controller, Physics, Paper Sprites, Collectibles & Authentic Concept HUD
 */

const FLAVORS = {
  cherry: {
    id: 'cherry',
    name: 'Craft Cherry',
    icon: '🍒',
    tag: 'Вишня & Физика',
    boardColor: 0x9e0832,
    speed: 30,
    capType: 'fish'
  },
  peach: {
    id: 'peach',
    name: 'Hard Peach',
    icon: '🍑',
    tag: 'Баланс & Чилл',
    boardColor: 0xff5e36,
    speed: 28,
    capType: 'fish'
  },
  lemon: {
    id: 'lemon',
    name: 'Hard Lemon',
    icon: '🍋',
    tag: 'Драйв & Скорость',
    boardColor: 0xffe600,
    speed: 34,
    capType: 'palm'
  },
  berry: {
    id: 'berry',
    name: 'Wild Berry',
    icon: '🍇',
    tag: 'Труба & Адреналин',
    boardColor: 0xd91680,
    speed: 30,
    capType: 'palm'
  }
};

class GarretSurfGame {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.currentFlavor = FLAVORS.cherry;
    this.state = 'start'; // 'start', 'playing', 'gameover'
    
    // Core Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    // Game Entities
    this.wave = null;
    this.surferRig = null;
    this.diorama = null;
    this.audio = new SurfAudio();
    
    // Player Motion & Kinematics
    this.player = {
      x: 0.5,       // natural sweet spot on wave face
      targetX: 0.5,
      y: 2.2,
      z: 0.0,
      speed: 28,
      baseSpeed: 28,
      roll: 0,
      pitch: 0,
      airY: 0,
      airVy: 0,
      isJumping: false,
      turnStrength: 0
    };
    
    // Controls State
    this.gyro = {
      active: false,
      gamma: 0,
      beta: 0
    };
    this.touch = {
      isDown: false,
      startX: 0,
      currentX: 0
    };
    this.keys = {};
    this.isSteeringLeft = false;
    this.isSteeringRight = false;
    
    // Liquid Slosh Physics State (2nd-order spring-damper)
    this.slosh = {
      angle: 0,
      velocity: 0,
      pitch: 0,
      pitchVelocity: 0,
      spring: 42.0,
      damping: 6.8
    };
    
    // Gameplay Stats
    this.stats = {
      score: 0,
      distance: 0,
      multiplier: 1,
      beerLevel: 100,
      isRush: false,
      rushTime: 0,
      capsCount: 0,
      hasSippedInBarrel: false
    };
    
    // Entity pools
    this.items = [];      // bottle caps
    this.ramps = [];      // cardboard chevron jump ramps
    this.particles = [];  // paper spray droplets
    
    this.clock = new THREE.Clock();
    
    this.initThree();
    this.initControls();
    this.initUI();
    
    // Start animation loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x280e3b, 0.0035);

    const container = document.getElementById('app-container') || document.body;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const aspect = w / h;
    
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 400);
    this.camera.position.set(-0.5, 3.6, -5.6);
    this.camera.lookAt(0.5, 2.2, 8.0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xfffaea, 1.2);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffb74d, 1.35);
    sunLight.position.set(6, 28, 40);
    this.scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x2fe0ff, 0.75);
    rimLight.position.set(-18, 14, -10);
    this.scene.add(rimLight);

    // 1. Scenic Paper Diorama (Warm Sun, Cliffs, Seagulls)
    this.diorama = SurfModels.createPaperDiorama(this.scene);

    // 2. Papercraft Ocean Wave
    this.wave = new OceanWave(this.scene, this.currentFlavor);

    // 3. 2.5D Paper Surfer Rig (Norma, Turn, Jump)
    this.surferRig = SurfModels.createPaperSurferRig(this.currentFlavor);
    this.scene.add(this.surferRig);

    // 4. Stylized Paper Particles
    this.initParticles();

    window.addEventListener('resize', () => this.onResize());
  }

  initParticles() {
    this.maxParticles = 160;
    const pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.maxParticles * 3);
    const col = new Float32Array(this.maxParticles * 3);

    for (let i = 0; i < this.maxParticles; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = -100;
      pos[i * 3 + 2] = 0;
      col[i * 3] = 1;
      col[i * 3 + 1] = 1;
      col[i * 3 + 2] = 1;
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    // Smooth circular paper drop texture
    const dropCanvas = document.createElement('canvas');
    dropCanvas.width = 32;
    dropCanvas.height = 32;
    const dCtx = dropCanvas.getContext('2d');
    dCtx.beginPath();
    dCtx.arc(16, 16, 13, 0, Math.PI * 2);
    dCtx.fillStyle = '#ffffff';
    dCtx.fill();
    const dropTex = new THREE.CanvasTexture(dropCanvas);

    const pMat = new THREE.PointsMaterial({
      size: 0.38,
      map: dropTex,
      transparent: true,
      opacity: 0.95,
      vertexColors: true,
      depthWrite: false
    });

    this.particleMesh = new THREE.Points(pGeo, pMat);
    this.scene.add(this.particleMesh);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 0.5
      });
    }
  }

  emitSpray(count = 3, isHardTurn = false) {
    let emitted = 0;
    const side = Math.sign(this.player.turnStrength) || 1;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = this.player.x - side * 0.4 + (Math.random() - 0.5) * 0.2;
        p.y = this.player.y + 0.1;
        p.z = this.player.z - 0.8;
        
        const speed = isHardTurn ? 8 : 4;
        p.vx = -side * (1.5 + Math.random() * speed);
        p.vy = 2.0 + Math.random() * (isHardTurn ? 5.5 : 2.8);
        p.vz = -this.player.speed * 0.4 - Math.random() * 3;
        p.life = 0;
        p.maxLife = 0.35 + Math.random() * 0.25;

        const col = this.particleMesh.geometry.attributes.color.array;
        col[i * 3] = Math.random() < 0.6 ? 1.0 : 0.65;
        col[i * 3 + 1] = Math.random() < 0.6 ? 1.0 : 0.92;
        col[i * 3 + 2] = 1.0;

        emitted++;
        if (emitted >= count) break;
      }
    }
    this.particleMesh.geometry.attributes.color.needsUpdate = true;
  }

  emitCherrySpill(count = 3, spillDir = 1) {
    const pos = this.particleMesh.geometry.attributes.position.array;
    const col = this.particleMesh.geometry.attributes.color.array;

    let emitted = 0;
    for (let j = 0; j < this.maxParticles; j++) {
      const p = this.particles[j];
      if (!p.active) {
        p.active = true;
        // Spawns from the beer mug held in the surfer's hand!
        p.x = this.player.x + 0.12 + (Math.random() - 0.5) * 0.10;
        p.y = this.player.y + 1.45;
        p.z = this.player.z + 0.08;

        // Splashes in the direction of the slosh centrifugal force
        p.vx = spillDir * (1.8 + Math.random() * 2.5);
        p.vy = 2.2 + Math.random() * 2.4;
        p.vz = -this.player.speed * 0.45;
        p.life = 0;
        p.maxLife = 0.45;

        pos[j * 3] = p.x;
        pos[j * 3 + 1] = p.y;
        pos[j * 3 + 2] = p.z;

        // Deep crimson ruby cherry beer droplet color!
        const isPinkFoam = Math.random() < 0.25;
        if (isPinkFoam) {
          col[j * 3] = 1.0;
          col[j * 3 + 1] = 0.85;
          col[j * 3 + 2] = 0.90;
        } else {
          col[j * 3] = 0.85 + Math.random() * 0.15; // deep red
          col[j * 3 + 1] = 0.04 + Math.random() * 0.08;
          col[j * 3 + 2] = 0.18 + Math.random() * 0.12; // ruby
        }

        emitted++;
        if (emitted >= count) break;
      }
    }
    this.particleMesh.geometry.attributes.position.needsUpdate = true;
    this.particleMesh.geometry.attributes.color.needsUpdate = true;
  }

  updateParticles(dt) {
    const pos = this.particleMesh.geometry.attributes.position.array;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          pos[i * 3 + 1] = -100;
          continue;
        }

        p.vy -= 15 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;

        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
      }
    }
    this.particleMesh.geometry.attributes.position.needsUpdate = true;
  }

  initControls() {
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma != null) {
        this.gyro.active = true;
        this.gyro.gamma = e.gamma;
        this.gyro.beta = e.beta;
        const lbl = document.getElementById('gyro-status-label');
        if (lbl) lbl.textContent = 'Гироскоп активен ✓';
      }
    });

    // On-screen Kraft Touch Buttons
    const btnLeft = document.getElementById('btn-touch-left');
    const btnRight = document.getElementById('btn-touch-right');
    const btnJump = document.getElementById('btn-touch-jump');

    if (btnLeft) {
      const startLeft = (e) => {
        e.stopPropagation();
        this.isSteeringLeft = true;
        btnLeft.classList.add('btn-pressed');
        this.audio.unlock();
      };
      const endLeft = (e) => {
        e.stopPropagation();
        this.isSteeringLeft = false;
        btnLeft.classList.remove('btn-pressed');
      };
      btnLeft.addEventListener('pointerdown', startLeft);
      btnLeft.addEventListener('pointerup', endLeft);
      btnLeft.addEventListener('pointerleave', endLeft);
      btnLeft.addEventListener('pointercancel', endLeft);
    }

    if (btnRight) {
      const startRight = (e) => {
        e.stopPropagation();
        this.isSteeringRight = true;
        btnRight.classList.add('btn-pressed');
        this.audio.unlock();
      };
      const endRight = (e) => {
        e.stopPropagation();
        this.isSteeringRight = false;
        btnRight.classList.remove('btn-pressed');
      };
      btnRight.addEventListener('pointerdown', startRight);
      btnRight.addEventListener('pointerup', endRight);
      btnRight.addEventListener('pointerleave', endRight);
      btnRight.addEventListener('pointercancel', endRight);
    }

    if (btnJump) {
      const doJump = (e) => {
        e.stopPropagation();
        this.jump();
        btnJump.classList.add('btn-pressed');
        this.audio.unlock();
      };
      const endJump = (e) => {
        e.stopPropagation();
        btnJump.classList.remove('btn-pressed');
      };
      btnJump.addEventListener('pointerdown', doJump);
      btnJump.addEventListener('pointerup', endJump);
      btnJump.addEventListener('pointerleave', endJump);
      btnJump.addEventListener('pointercancel', endJump);
    }

    window.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#touch-controls-layer')) return;
      this.touch.isDown = true;
      this.touch.startX = e.clientX;
      this.touch.currentX = e.clientX;
      this.audio.unlock();
    });

    window.addEventListener('pointermove', (e) => {
      if (this.touch.isDown) {
        this.touch.currentX = e.clientX;
        const delta = (this.touch.currentX - this.touch.startX) / window.innerWidth;
        this.player.targetX += delta * 14;
        this.player.targetX = THREE.MathUtils.clamp(this.player.targetX, -5.0, 3.2);
        this.touch.startX = this.touch.currentX;
      }
    });

    window.addEventListener('pointerup', () => {
      this.touch.isDown = false;
    });

    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        this.jump();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });
  }

  jump() {
    if (!this.player.isJumping) {
      this.player.isJumping = true;
      this.player.airVy = 8.5;
      this.audio.playCarve(1.5);
      this.vibrate(25);
      this.showTrick('+100', 'ПРЫЖОК!');
    }
  }

  vibrate(ms) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  }

  spawnAhead() {
    const spawnZ = this.player.z + 90 + Math.random() * 20;

    // 1. Spawning Bottle Caps
    if (Math.random() < 0.45 && this.items.length < 8) {
      const type = Math.random() < 0.5 ? 'fish' : 'palm';
      const capMesh = SurfModels.createPaperCap(type);

      const x = -4.0 + Math.random() * 6.5;
      const surfInfo = this.wave.getSurfaceInfo(x, spawnZ);
      capMesh.position.set(x, surfInfo.height + 0.55, spawnZ);
      capMesh.userData.baseY = capMesh.position.y;
      capMesh.userData.z = spawnZ;
      capMesh.userData.x = x;

      this.scene.add(capMesh);
      this.items.push(capMesh);
    }

    // 2. Spawning Cardboard Jump Ramps with High Arc Caps
    if (Math.random() < 0.20 && this.ramps.length < 2) {
      const rampMesh = SurfModels.createPaperChevronRamp();
      const x = -1.5 + Math.random() * 3.5;
      const surfInfo = this.wave.getSurfaceInfo(x, spawnZ);
      rampMesh.position.set(x, surfInfo.height, spawnZ);
      rampMesh.userData.z = spawnZ;
      rampMesh.userData.x = x;

      this.scene.add(rampMesh);
      this.ramps.push(rampMesh);

      // High Arc Bottle Cap
      const highCap = SurfModels.createPaperCap('palm');
      highCap.position.set(x, surfInfo.height + 3.8, spawnZ + 6.0);
      highCap.userData.baseY = highCap.position.y;
      highCap.userData.z = spawnZ + 6.0;
      highCap.userData.x = x;
      highCap.userData.isHighCap = true;

      this.scene.add(highCap);
      this.items.push(highCap);
    }

    // 3. Spawning Left Stepped Wave Fish Cap Trail (curving down the steps like reference image)
    if (Math.random() < 0.28 && this.items.length < 8) {
      const stepRunZ = spawnZ + 15;
      for (let s = 0; s < 3; s++) {
        const cap = SurfModels.createPaperCap('fish');
        const cx = -5.8 + s * 0.95;
        const cz = stepRunZ + s * 4.2;
        const surf = this.wave.getSurfaceInfo(cx, cz);
        cap.position.set(cx, surf.height + 0.55, cz);
        cap.userData.baseY = cap.position.y;
        cap.userData.z = cz;
        cap.userData.x = cx;
        this.scene.add(cap);
        this.items.push(cap);
      }
    }
  }

  updateEntities(dt) {
    const time = this.clock.getElapsedTime();

    // 1. Bottle Caps Update & Collection
    for (let i = this.items.length - 1; i >= 0; i--) {
      const cap = this.items[i];
      cap.rotation.y += cap.userData.rotSpeed * dt;
      cap.position.y = cap.userData.baseY + Math.sin(time * cap.userData.wobbleSpeed + cap.userData.wobbleOffset) * 0.12;

      const dx = cap.position.x - this.player.x;
      const dz = cap.position.z - this.player.z;
      const dy = cap.position.y - this.player.y;
      const distXZ = Math.sqrt(dx * dx + dz * dz);

      if (distXZ < 1.6 && Math.abs(dy) < 1.8) {
        const type = cap.userData.type;
        const pts = type === 'palm' ? 250 : 150;
        this.stats.score += pts * this.stats.multiplier;
        
        this.stats.beerLevel = Math.min(100, this.stats.beerLevel + 10);
        this.updateBeerHUD();

        this.collectCap(type);
        this.showTrick('+' + pts, type === 'palm' ? 'ПАЛЬМА!' : 'РЫБКА!');
        this.audio.playFruit();
        this.vibrate(25);

        this.scene.remove(cap);
        this.items.splice(i, 1);
        continue;
      }

      if (cap.position.z < this.player.z - 20) {
        this.scene.remove(cap);
        this.items.splice(i, 1);
      }
    }

    // 2. Cardboard Jump Ramps Update & Launch
    for (let i = this.ramps.length - 1; i >= 0; i--) {
      const ramp = this.ramps[i];
      const dx = ramp.position.x - this.player.x;
      const dz = ramp.position.z - this.player.z;

      if (Math.abs(dx) < 1.8 && Math.abs(dz) < 3.0 && !this.player.isJumping) {
        this.player.isJumping = true;
        this.player.airVy = 11.2;
        this.audio.playCarve(1.8);
        this.showTrick('+250', 'ТРАМПЛИН 🤙');
        this.vibrate([30, 40, 30]);
      }

      if (ramp.position.z < this.player.z - 25) {
        this.scene.remove(ramp);
        this.ramps.splice(i, 1);
      }
    }
  }

  collectCap(type) {
    this.stats.capsCount++;
    const slotIdx = Math.min(3, this.stats.capsCount);
    
    const imgEl = document.getElementById('cap-icon-' + slotIdx);
    if (imgEl) {
      imgEl.src = type === 'palm' ? window.SPRITE_ASSETS.cap_palm : window.SPRITE_ASSETS.cap_fish;
      imgEl.classList.remove('empty');
      imgEl.classList.add('collected');
    }

    if (this.stats.capsCount === 3) {
      this.triggerGarretRush();
    }
  }

  triggerGarretRush() {
    this.stats.isRush = true;
    this.stats.rushTime = 6.5;
    this.stats.multiplier = 3;
    this.audio.playRush();
    this.vibrate([50, 70, 50]);
    this.showTrick('+1000', 'КОЛЛЕКЦИЯ СОБРАНА! 🌟');
    
    const multPill = document.getElementById('multiplier-pill');
    if (multPill) {
      multPill.classList.add('barrel');
      document.getElementById('multiplier-text').textContent = 'x3 GARRET RUSH';
    }
    const speedLines = document.getElementById('speed-lines');
    if (speedLines) speedLines.classList.add('barrel-active-lines');
  }

  showTrick(valText, tagText = 'ТРЮК') {
    const popup = document.getElementById('trick-sticker');
    if (popup) {
      document.getElementById('trick-val').textContent = valText;
      document.getElementById('trick-tag').textContent = tagText;
      popup.classList.remove('hide');
      popup.style.animation = 'none';
      popup.offsetHeight;
      popup.style.animation = null;
      clearTimeout(this._trickTimer);
      this._trickTimer = setTimeout(() => {
        popup.classList.add('hide');
      }, 1200);
    }
  }

  showBanner(text) {
    const b = document.getElementById('banner-popup');
    if (b) {
      b.textContent = text;
      b.classList.remove('banner-active');
      b.offsetWidth;
      b.classList.add('banner-active');
      clearTimeout(this._bannerTimer);
      this._bannerTimer = setTimeout(() => {
        b.classList.remove('banner-active');
      }, 1300);
    }
  }

  updateBeerHUD() {
    const valEl = document.getElementById('beer-level-val');
    const barEl = document.getElementById('beer-bar-inner');
    const pct = Math.max(0, Math.min(100, Math.round(this.stats.beerLevel)));
    if (valEl) valEl.textContent = pct;
    if (barEl) barEl.style.width = pct + '%';
  }

  onWipeout(reason) {
    this.audio.playWipeout();
    this.vibrate([100, 60, 100]);
    this.endGame(reason);
  }

  updatePhysics(dt) {
    let steer = 0;

    if (this.gyro.active) {
      steer += THREE.MathUtils.clamp(this.gyro.gamma / 26, -1.2, 1.2);
    }

    if (this.isSteeringLeft || this.keys['ArrowLeft'] || this.keys['a']) steer -= 1;
    if (this.isSteeringRight || this.keys['ArrowRight'] || this.keys['d']) steer += 1;
    if (steer !== 0) {
      this.player.targetX += steer * 16 * dt;
    }

    this.player.targetX = THREE.MathUtils.clamp(this.player.targetX, -5.0, 3.2);

    const prevX = this.player.x;
    this.player.x += (this.player.targetX - this.player.x) * Math.min(1, dt * 10);
    this.player.turnStrength = (this.player.x - prevX) / dt;

    const currentSpeed = this.stats.isRush ? this.player.speed * 1.35 : this.player.speed;
    this.player.z += currentSpeed * dt;
    this.stats.distance = Math.floor(this.player.z);

    const surfInfo = this.wave.getSurfaceInfo(this.player.x, this.player.z);
    
    // Jump / Air physics
    if (this.player.isJumping) {
      this.player.airY += this.player.airVy * dt;
      this.player.airVy -= 18 * dt;
      if (this.player.airY <= 0) {
        this.player.airY = 0;
        this.player.airVy = 0;
        this.player.isJumping = false;
        this.emitSpray(12, true);
        this.audio.playCarve(0.8);
      }
    }

    this.player.y = surfInfo.height + this.player.airY + 0.08;

    // Rig transform & Banking
    this.surferRig.position.set(this.player.x, this.player.y, this.player.z);

    const targetRoll = -this.player.turnStrength * 0.045;
    this.player.roll += (targetRoll - this.player.roll) * Math.min(1, dt * 12);
    this.surferRig.rotation.z = this.player.roll * 0.6;

    // DYNAMIC SPRITE POSE SWITCHING (Norma, Turn, Jump)
    if (this.surferRig && this.surferRig.userData.setPose) {
      if (this.player.isJumping) {
        this.surferRig.userData.setPose('jump', this.player.turnStrength);
      } else if (Math.abs(this.player.turnStrength) > 1.8) {
        this.surferRig.userData.setPose('turn', this.player.turnStrength);
      } else {
        this.surferRig.userData.setPose('norma', 0);
      }
    }

    // Emit spray when carving
    if (Math.abs(this.player.turnStrength) > 2.2 && !this.player.isJumping) {
      this.emitSpray(3, Math.abs(this.player.turnStrength) > 5);
      if (Math.random() < 0.25) {
        this.audio.playCarve(Math.min(1.5, Math.abs(this.player.turnStrength) / 5));
      }
    }

    // 🍒 REAL CHERRY BEER LIQUID SLOSH & SPILL PHYSICS (Вишневое пиво с крутой физикой)
    let gyroBalance = 0;
    if (this.gyro.active) {
      gyroBalance = this.gyro.gamma * 0.012;
    }
    const targetSloshAngle = -this.player.turnStrength * 0.082 + gyroBalance - this.player.roll * 0.40;
    const targetSloshPitch = (this.player.isJumping ? this.player.airVy * 0.05 : 0);

    // 2nd-order spring-damper fluid integration
    const diffAngle = targetSloshAngle - this.slosh.angle;
    this.slosh.velocity += (diffAngle * this.slosh.spring - this.slosh.velocity * this.slosh.damping) * dt;
    this.slosh.angle += this.slosh.velocity * dt;

    const diffPitch = targetSloshPitch - this.slosh.pitch;
    this.slosh.pitchVelocity += (diffPitch * this.slosh.spring - this.slosh.pitchVelocity * this.slosh.damping) * dt;
    this.slosh.pitch += this.slosh.pitchVelocity * dt;

    // Update 3D beer stein meniscus & foam in surfer's hand!
    if (this.surferRig && this.surferRig.userData.beerMug) {
      this.surferRig.userData.beerMug.userData.updateSlosh(this.slosh.angle, this.slosh.pitch, this.stats.beerLevel);
    }

    // Spill threshold & ruby droplets splash
    const maxRimCapacity = 0.44; // rad (~25 degrees tilt)
    const excessSlosh = Math.abs(this.slosh.angle) - maxRimCapacity;
    if (excessSlosh > 0.03 && !this.player.isJumping) {
      const spillRate = excessSlosh * 14.0 * dt;
      this.stats.beerLevel = Math.max(0, this.stats.beerLevel - spillRate);
      this.updateBeerHUD();
      
      const spillDir = Math.sign(this.slosh.angle);
      this.emitCherrySpill(3, spillDir);

      if (Math.random() < 0.22) {
        this.audio.playCarve(0.4);
        this.vibrate(20);
        this.showTrick('−' + Math.ceil(spillRate * 2.5) + '%', 'ПЛЕСНУЛО! 🍒');
      }

      if (this.stats.beerLevel <= 0) {
        this.onWipeout('ВСЁ ВИШНЕВОЕ ПИВО РАСПЛЕСКАЛ! Донеси хотя бы глоток Garret!');
        return;
      }
    }

    // BARREL TUBE CHECK
    const insideBarrel = surfInfo.isInsideBarrel;
    const multPill = document.getElementById('multiplier-pill');
    const multText = document.getElementById('multiplier-text');
    const speedLines = document.getElementById('speed-lines');

    if (insideBarrel || this.stats.isRush) {
      this.stats.multiplier = 3;
      this.stats.score += Math.floor(18 * dt * 60);
      if (multPill) multPill.classList.add('barrel');
      if (multText) multText.textContent = 'x3 BARREL';
      if (speedLines) speedLines.classList.add('barrel-active-lines');

      if (!this.stats.hasSippedInBarrel) {
        this.stats.hasSippedInBarrel = true;
        this.stats.score += 400;
        this.stats.beerLevel = Math.min(100, this.stats.beerLevel + 12);
        this.updateBeerHUD();
        this.showTrick('+400', 'ГЛОТОК В ТРУБЕ! 🍺');
        this.audio.playRush();
        this.vibrate([30, 40, 30]);
      }
    } else {
      if (!this.stats.isRush) {
        this.stats.multiplier = 1;
        if (multPill) multPill.classList.remove('barrel');
        if (multText) multText.textContent = 'x1 ВОЛНА';
        if (speedLines) speedLines.classList.remove('barrel-active-lines');
      }
      this.stats.hasSippedInBarrel = false;
    }

    if (this.stats.isRush) {
      this.stats.rushTime -= dt;
      if (this.stats.rushTime <= 0) {
        this.stats.isRush = false;
        this.stats.multiplier = 1;
        if (multPill) multPill.classList.remove('barrel');
        if (multText) multText.textContent = 'x1 ВОЛНА';
        if (speedLines) speedLines.classList.remove('barrel-active-lines');
      }
    }

    this.audio.updateWave(currentSpeed / this.player.baseSpeed, insideBarrel);

    // Tilt Marker
    const tiltPercent = (this.player.x + 5.0) / 8.2;
    const marker = document.getElementById('balance-marker');
    if (marker) {
      marker.style.left = Math.min(95, Math.max(5, tiltPercent * 100)) + '%';
    }

    // Camera follow rig framed on wave face
    const targetCamX = this.player.x * 0.65 - 0.5;
    const targetCamY = Math.max(2.6, this.player.y + 1.8);
    const targetCamZ = this.player.z - 5.8;

    this.camera.position.x += (targetCamX - this.camera.position.x) * Math.min(1, dt * 8);
    this.camera.position.y += (targetCamY - this.camera.position.y) * Math.min(1, dt * 8);
    this.camera.position.z += (targetCamZ - this.camera.position.z) * Math.min(1, dt * 12);
    this.camera.lookAt(this.player.x * 0.35 + 0.2, this.player.y + 0.9, this.player.z + 10);

    // Diorama moves along with player
    if (this.diorama) {
      this.diorama.position.z = this.player.z;
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.getElapsedTime();

    if (this.diorama && this.diorama.userData.update) {
      this.diorama.userData.update(dt, t);
    }

    if (this.state === 'playing') {
      const currentSpeed = this.stats.isRush ? this.player.speed * 1.35 : this.player.speed;
      this.updatePhysics(dt);
      this.updateParticles(dt);
      this.updateEntities(dt);
      this.spawnAhead();
      this.wave.update(dt, this.player.z, currentSpeed);

      this.stats.score += Math.floor(dt * 15 * this.stats.multiplier);
      const scoreOdometer = String(this.stats.score).padStart(6, '0');
      const odoEl = document.getElementById('score-odometer-text');
      if (odoEl) odoEl.textContent = scoreOdometer;

      const distEl = document.getElementById('distance-text');
      if (distEl) distEl.textContent = this.stats.distance + ' м';
    } else {
      // Menu idle
      this.wave.update(dt, 0, 16);
      if (this.diorama) {
        this.diorama.position.z = 0;
      }
      if (this.surferRig) {
        this.surferRig.position.set(0.5, 2.3 + Math.sin(t * 2) * 0.1, 0);
        this.surferRig.rotation.z = Math.sin(t * 1.5) * 0.06;
      }

      this.camera.position.set(-0.2, 3.4, -5.2);
      this.camera.lookAt(0.5, 2.1, 4.0);
    }

    this.renderer.render(this.scene, this.camera);
  }

  initUI() {
    document.querySelectorAll('.flavor-card').forEach(card => {
      card.addEventListener('click', () => {
        const flavorKey = card.getAttribute('data-flavor');
        this.selectFlavor(FLAVORS[flavorKey]);
      });
    });

    document.getElementById('btn-start').addEventListener('click', async () => {
      this.audio.unlock();
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') this.gyro.active = true;
        } catch (e) {}
      }
      this.startGame();
    });

    document.getElementById('btn-replay').addEventListener('click', () => {
      this.startGame();
    });

    document.getElementById('btn-share').addEventListener('click', () => {
      const text = `🏄‍♂️ Я собрал коллекцию волн Garret (${this.currentFlavor.name}), проехал ${this.stats.distance}м и набрал ${this.stats.score} очков! Попробуй сам!`;
      if (navigator.share) {
        navigator.share({ title: "Tony's Garret — Surf Rush", text, url: window.location.href }).catch(() => {});
      } else {
        navigator.clipboard.writeText(text).then(() => alert('Результат скопирован!'));
      }
    });

    document.getElementById('btn-sound-toggle').addEventListener('click', () => {
      const isMuted = this.audio.toggleMute();
      document.getElementById('btn-sound-toggle').textContent = isMuted ? '🔇' : '🔊';
    });
  }

  selectFlavor(flavor) {
    this.currentFlavor = flavor;
    document.querySelectorAll('.flavor-card').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-flavor') === flavor.id);
    });

    this.wave.setFlavor(flavor);
    this.player.baseSpeed = flavor.speed;
    this.player.speed = flavor.speed;
  }

  startGame() {
    this.state = 'playing';
    this.stats = {
      score: 0,
      distance: 0,
      multiplier: 1,
      beerLevel: 100,
      isRush: false,
      rushTime: 0,
      capsCount: 0,
      hasSippedInBarrel: false
    };

    this.player.x = 0.5;
    this.player.targetX = 0.5;
    this.player.z = 0;
    this.player.speed = this.currentFlavor.speed;
    this.player.isJumping = false;
    this.slosh = { angle: 0, velocity: 0, pitch: 0, pitchVelocity: 0, spring: 42.0, damping: 6.8 };

    this.items.forEach(it => this.scene.remove(it));
    this.items = [];
    this.ramps.forEach(r => this.scene.remove(r));
    this.ramps = [];

    for (let s = 1; s <= 3; s++) {
      const img = document.getElementById('cap-icon-' + s);
      if (img) {
        img.src = 'assets/sprites/cap_empty.png';
        img.className = 'slot-cap-img empty';
      }
    }

    document.getElementById('start-screen').classList.add('hide');
    document.getElementById('result-screen').classList.add('hide');
    document.getElementById('hud').style.opacity = '1';
    this.updateBeerHUD();

    this.audio.startBGM();
    this.showBanner('ВЫХОДИ НА ВОЛНУ! 🏄‍♂️');
  }

  endGame(reason) {
    this.state = 'gameover';
    this.audio.stopBGM();

    document.getElementById('hud').style.opacity = '0';
    document.getElementById('result-screen').classList.remove('hide');

    document.getElementById('pass-score').textContent = String(this.stats.score).padStart(6, '0');
    document.getElementById('pass-distance').textContent = this.stats.distance + 'м';
    const beerEl = document.getElementById('pass-beer');
    if (beerEl) beerEl.textContent = Math.round(this.stats.beerLevel) + '%';

    for (let s = 1; s <= 3; s++) {
      const passCap = document.getElementById('pass-cap-' + s);
      if (passCap) {
        if (s <= this.stats.capsCount) {
          passCap.src = s % 2 === 1 ? 'assets/sprites/cap_fish.png' : 'assets/sprites/cap_palm.png';
          passCap.style.opacity = '1';
          passCap.style.filter = 'none';
        } else {
          passCap.src = 'assets/sprites/cap_empty.png';
          passCap.style.opacity = '0.35';
          passCap.style.filter = 'grayscale(1)';
        }
      }
    }

    let rank = 'Пляжный Новичок';
    if (this.stats.capsCount >= 3 && this.stats.beerLevel > 60) rank = 'Легенда Океана 👑';
    else if (this.stats.capsCount >= 2) rank = 'Король Барреля 🏄‍♂️';
    else if (this.stats.distance > 200) rank = 'Мастер Волны ⚡';
    document.getElementById('pass-rank').textContent = rank;

    const quoteEl = document.getElementById('pass-quote');
    if (quoteEl) {
      if (reason) {
        quoteEl.textContent = reason;
      } else if (this.stats.beerLevel > 80) {
        quoteEl.textContent = '«Идеальный баланс! Garret в целости, крышки собраны, клиент на берегу в восторге!»';
      } else if (this.stats.beerLevel > 40) {
        quoteEl.textContent = '«Хороший заезд, но часть Garret расплескалась на волнах. Держи телефон ровнее!»';
      } else {
        quoteEl.textContent = '«Почти всё выплеснулось! Плавнее закладывай виражи на доске.»';
      }
    }
  }

  onResize() {
    const container = document.getElementById('app-container') || document.body;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new GarretSurfGame();
});
