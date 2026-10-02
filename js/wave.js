/**
 * Tony's Garret — Surf Rush
 * Modular Papercraft Ocean Wave & Moving Water System (Three.js)
 * Features:
 * - "Плоские - вода": Flat moving paper water conveyor sheets with rapid halftone wave raster
 * - "Круглые - волны": Distinct rounded curved wave swell ribbons travelling backwards along Z
 * - "Ступени волн слева": Descending tiered paper wave steps matching the reference concept
 * - Surface foam sprites, wake ribbons and paper spray flying past at high speed
 */

class OceanWave {
  constructor(scene, flavorConfig) {
    this.scene = scene;
    this.flavor = flavorConfig || {
      id: 'peach',
      waterDeep: 0x051838,
      waterFace: 0x07adb5,
      waterCrest: 0xff9b44,
      waterFoam: 0xffffff
    };

    this.mesh = null;
    this.floorMesh = null;
    this.sprayMesh = null;
    this.tubeZone = { minX: -0.5, maxX: 2.8, minY: 1.0, maxY: 6.2 };
    
    // Wave grid resolution
    this.gridU = 80;    // across wave profile
    this.gridV = 110;   // along wave (Z)
    this.lengthZ = 180; // visible distance along Z
    this.speedZ = 28;   // base wave travel speed
    
    this.time = 0;

    // Load authentic paper textures
    const loader = new THREE.TextureLoader();
    this.waveTexture = loader.load(window.SPRITE_ASSETS.wave_paper_texture);
    this.waveTexture.wrapS = THREE.RepeatWrapping;
    this.waveTexture.wrapT = THREE.RepeatWrapping;
    this.waveTexture.repeat.set(2, 6);

    this.flatWaterTexture = loader.load(window.SPRITE_ASSETS.ref_flat_water || window.SPRITE_ASSETS.wave_paper_texture);
    this.flatWaterTexture.wrapS = THREE.RepeatWrapping;
    this.flatWaterTexture.wrapT = THREE.RepeatWrapping;
    this.flatWaterTexture.repeat.set(3, 8);

    this.foamCrestTexture = loader.load(window.SPRITE_ASSETS.ref_foam_crest || window.SPRITE_ASSETS.paper_texture);
    this.leftStepsTexture = loader.load(window.SPRITE_ASSETS.ref_left_steps || window.SPRITE_ASSETS.wave_paper_texture);

    // Modular components
    this.rollingRidges = [];
    this.flatSheets = [];
    this.foamFlecks = null;

    this.initWave();
    this.initModularPaperWater();
  }

  // 1. MATHEMATICAL CROSS-SECTION OF THE PAPER BARREL TUBE
  getCrossSection(u) {
    let x, y;
    if (u < 0.35) {
      // Zone 1: Open Ocean Flats (-20 to -2.0)
      const t = u / 0.35;
      x = -20.0 + t * 18.0;
      y = 0.15 + Math.sin(t * Math.PI) * 0.18;
    } else if (u < 0.72) {
      // Zone 2: The Stepped Paper Wave Face (-2.0 to 3.8)
      const t = (u - 0.35) / (0.72 - 0.35);
      const ease = t * t * (3 - 2 * t);
      x = -2.0 + ease * 5.8;
      y = 0.35 + ease * 5.85;
    } else if (u < 0.94) {
      // Zone 3: The Curling Lip & Tube Barrel Arch! (3.8 to -0.8)
      const t = (u - 0.72) / (0.94 - 0.72);
      const angle = t * Math.PI * 1.08;
      x = 3.8 - (1 - Math.cos(angle)) * 2.3 + Math.sin(angle) * 0.3;
      y = 6.20 + Math.sin(angle * 0.85) * 0.75 - (t * t) * 6.75;
      if (y < 0.2) y = 0.2;
    } else {
      // Zone 4: Whitewater Seam (-0.8 to -1.6)
      const t = (u - 0.94) / (1.0 - 0.94);
      x = -0.8 - t * 0.8;
      y = 0.22 + Math.sin(t * Math.PI * 2) * 0.12;
    }
    return { x, y };
  }

  // 2. 3D WAVE POSITION EVALUATOR
  evaluateWave(u, v, t) {
    const section = this.getCrossSection(u);
    const z = (v - 0.5) * this.lengthZ;
    
    // Smooth oceanic swell harmonics
    const swell1 = Math.sin(z * 0.08 - t * 4.2 + u * 1.6) * 0.28;
    const swell2 = Math.cos(z * 0.18 - t * 5.6 + u * 2.8) * 0.12;
    
    const y = section.y + swell1 + swell2;
    const x = section.x + Math.sin(z * 0.07 - t * 2.5) * 0.22;
    
    return { x, y, z };
  }

  // 3. COLOR EVALUATOR (Mediterranean Halftone Blue & Sunset Amber Crest)
  evaluateColor(u) {
    const cDeep = new THREE.Color(0x0a264a);
    const cFace = new THREE.Color(0x137e96);
    const cCrest = new THREE.Color(0xffaa50);
    const cFoam = new THREE.Color(0xf6f0e4); // Kraft paper white

    const col = new THREE.Color();
    if (u < 0.35) {
      col.lerpColors(cDeep, cFace, (u / 0.35) * 0.85);
    } else if (u < 0.65) {
      col.lerpColors(cFace, cFace, 1.0);
    } else if (u < 0.78) {
      col.lerpColors(cFace, cCrest, (u - 0.65) / 0.13);
    } else if (u < 0.92) {
      col.lerpColors(cCrest, cFoam, (u - 0.78) / 0.14);
    } else {
      col.copy(cFoam);
    }
    return col;
  }

  initWave() {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const uvs = [];
    const indices = [];

    for (let j = 0; j <= this.gridV; j++) {
      const v = j / this.gridV;
      for (let i = 0; i <= this.gridU; i++) {
        const u = i / this.gridU;
        const pt = this.evaluateWave(u, v, 0);
        positions.push(pt.x, pt.y, pt.z);

        const col = this.evaluateColor(u);
        colors.push(col.r, col.g, col.b);

        uvs.push(u * 2, v * 8);
      }
    }

    for (let j = 0; j < this.gridV; j++) {
      for (let i = 0; i < this.gridU; i++) {
        const a = j * (this.gridU + 1) + i;
        const b = a + 1;
        const c = (j + 1) * (this.gridU + 1) + i;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      map: this.waveTexture,
      vertexColors: true,
      shininess: 25,
      specular: 0x224466,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    // Deep Ocean Water Base Floor Plane
    const floorGeo = new THREE.PlaneGeometry(320, 420, 16, 24);
    floorGeo.rotateX(-Math.PI * 0.5);
    const floorMat = new THREE.MeshPhongMaterial({
      color: 0x061836,
      shininess: 30,
      specular: 0x113355,
      transparent: true,
      opacity: 0.96
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.frustumCulled = false;
    this.floorMesh.position.set(-25, -0.4, 0);
    this.scene.add(this.floorMesh);

    // Paper Drop Shadow Strip inside the curling barrel
    this.initBarrelShadowRibbon();

    // Paper spray particles
    this.initPaperSpray();
  }

  // 4. MODULAR MOVING PAPER WATER (Плоские - вода, Круглые - волны, Ступени слева)
  initModularPaperWater() {
    // A. "ПЛОСКИЕ - ВОДА": Fast-moving flat water conveyor sheets
    const sheetCount = 5;
    const sheetLength = 36;
    const sheetWidth = 22;

    for (let i = 0; i < sheetCount; i++) {
      const sGeo = new THREE.PlaneGeometry(sheetWidth, sheetLength);
      sGeo.rotateX(-Math.PI * 0.5);

      const sMat = new THREE.MeshBasicMaterial({
        map: this.flatWaterTexture,
        transparent: true,
        opacity: 0.90,
        side: THREE.DoubleSide
      });

      const sMesh = new THREE.Mesh(sGeo, sMat);
      sMesh.position.set(-9.0, 0.12, (i - 1) * sheetLength);
      sMesh.name = 'flatWaterSheet_' + i;
      this.scene.add(sMesh);

      this.flatSheets.push({
        mesh: sMesh,
        relZ: (i - 1) * sheetLength,
        length: sheetLength
      });
    }

    // B. "КРУГЛЫЕ - ВОЛНЫ": Distinct rounded wave swell ribbons physically travelling along Z
    const ridgeCount = 4;
    const ridgeSpacing = 42;

    for (let i = 0; i < ridgeCount; i++) {
      const ridgeGroup = new THREE.Group();

      // Rounded paper wave swell arch (Cylinder segment)
      const swellRadius = 2.4;
      const swellWidth = 14;
      const arcSegments = 16;
      
      const rGeo = new THREE.CylinderGeometry(swellRadius, swellRadius, swellWidth, arcSegments, 1, true, 0, Math.PI * 0.85);
      rGeo.rotateZ(Math.PI * 0.5);
      rGeo.rotateY(-Math.PI * 0.15);

      const rMat = new THREE.MeshPhongMaterial({
        map: this.waveTexture,
        color: 0x0fa8b8,
        specular: 0x33ffff,
        shininess: 40,
        side: THREE.DoubleSide
      });

      const swellMesh = new THREE.Mesh(rGeo, rMat);
      ridgeGroup.add(swellMesh);

      // Torn white paper foam crest ribbon on top of the round wave ridge
      const foamGeo = new THREE.PlaneGeometry(swellWidth * 1.02, 1.4);
      foamGeo.rotateX(-Math.PI * 0.4);
      const foamMat = new THREE.MeshBasicMaterial({
        map: this.foamCrestTexture,
        transparent: true,
        alphaTest: 0.2,
        side: THREE.DoubleSide
      });
      const foamMesh = new THREE.Mesh(foamGeo, foamMat);
      foamMesh.position.set(0, swellRadius * 0.92, 0.4);
      ridgeGroup.add(foamMesh);

      ridgeGroup.position.set(-2.5, 0.6, i * ridgeSpacing);
      this.scene.add(ridgeGroup);

      this.rollingRidges.push({
        group: ridgeGroup,
        relZ: i * ridgeSpacing,
        spacing: ridgeSpacing,
        baseY: 0.6
      });
    }

    // C. "СТУПЕНИ ВОЛН СЛЕВА": Descending tiered paper shelves matching reference
    const stepCount = 5;
    this.stepShelves = [];
    for (let s = 0; s < stepCount; s++) {
      const stepGeo = new THREE.PlaneGeometry(2.8, 140);
      stepGeo.rotateX(-Math.PI * 0.5);
      
      const stepMat = new THREE.MeshBasicMaterial({
        map: this.leftStepsTexture,
        color: 0x108098,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide
      });

      const stepMesh = new THREE.Mesh(stepGeo, stepMat);
      // Descending steps from x: -7.5 to -3.0, y: 3.5 to 0.4
      const stepX = -7.2 + s * 0.95;
      const stepY = 3.6 - s * 0.70;
      stepMesh.position.set(stepX, stepY, 0);
      this.scene.add(stepMesh);
      this.stepShelves.push(stepMesh);
    }

    // D. HIGH-SPEED SURFACE FOAM FLECKS & WAKE (Streaming backwards past camera)
    const fleckCount = 75;
    const fGeo = new THREE.BufferGeometry();
    const fPos = new Float32Array(fleckCount * 3);
    this.fleckData = [];

    for (let i = 0; i < fleckCount; i++) {
      const fx = -7.0 + Math.random() * 11.0;
      const fz = (Math.random() - 0.5) * 120;
      fPos[i * 3] = fx;
      fPos[i * 3 + 1] = 0.35;
      fPos[i * 3 + 2] = fz;

      this.fleckData.push({
        x: fx,
        relZ: fz,
        speedFactor: 0.9 + Math.random() * 0.35,
        driftX: (Math.random() - 0.5) * 0.8
      });
    }

    fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));

    // Crisp white torn paper fleck texture
    const fCanvas = document.createElement('canvas');
    fCanvas.width = 32;
    fCanvas.height = 32;
    const fCtx = fCanvas.getContext('2d');
    fCtx.fillStyle = '#ffffff';
    fCtx.beginPath();
    fCtx.arc(16, 16, 12, 0, Math.PI * 2);
    fCtx.fill();
    const fTex = new THREE.CanvasTexture(fCanvas);

    const fMat = new THREE.PointsMaterial({
      size: 0.55,
      map: fTex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });

    this.foamFlecks = new THREE.Points(fGeo, fMat);
    this.foamFlecks.frustumCulled = false;
    this.scene.add(this.foamFlecks);
  }

  initBarrelShadowRibbon() {
    const shadowGeo = new THREE.BufferGeometry();
    const pos = [];
    const segs = 40;
    for (let i = 0; i <= segs; i++) {
      const v = i / segs;
      const z = (v - 0.5) * this.lengthZ;
      const pt = this.evaluateWave(0.82, v, 0);
      pos.push(pt.x - 0.2, pt.y - 0.15, z);
      pos.push(pt.x + 0.3, pt.y - 0.45, z);
    }
    const idx = [];
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2);
      idx.push(a + 1, a + 3, a + 2);
    }
    shadowGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    shadowGeo.setIndex(idx);

    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x050818,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.lipShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.lipShadowMesh.frustumCulled = false;
    this.scene.add(this.lipShadowMesh);
  }

  initPaperSpray() {
    const sprayGeo = new THREE.BufferGeometry();
    this.sprayCount = 180;
    const pos = [];
    const col = [];
    this.sprayVelocities = [];

    for (let i = 0; i < this.sprayCount; i++) {
      const u = 0.74 + Math.random() * 0.14;
      const v = Math.random();
      const pt = this.evaluateWave(u, v, 0);

      pos.push(pt.x + (Math.random() - 0.5) * 0.6, pt.y + Math.random() * 0.4, pt.z);
      col.push(0.96, 0.94, 0.90);

      this.sprayVelocities.push({
        vx: -1.6 - Math.random() * 1.8,
        vy: 0.5 + Math.random() * 1.2,
        vz: -this.speedZ * 0.35,
        life: Math.random(),
        maxLife: 1.0 + Math.random() * 0.7
      });
    }

    sprayGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sprayGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

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
      size: 0.32,
      map: dropTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });

    this.sprayMesh = new THREE.Points(sprayGeo, pMat);
    this.sprayMesh.frustumCulled = false;
    this.scene.add(this.sprayMesh);
  }

  update(dt, playerZ = 0, playerSpeed = 28) {
    this.time += dt;

    // HIGH-SPEED UV SCROLLING for intense sensation of forward motion!
    const effectiveSpeed = playerSpeed || 28;
    if (this.waveTexture) {
      this.waveTexture.offset.y -= dt * (effectiveSpeed * 0.045);
      this.waveTexture.offset.x += dt * 0.04;
    }
    if (this.flatWaterTexture) {
      this.flatWaterTexture.offset.y -= dt * (effectiveSpeed * 0.065);
    }

    // 1. Update primary barrel wave mesh
    const pos = this.mesh.geometry.attributes.position.array;
    let idx = 0;

    for (let j = 0; j <= this.gridV; j++) {
      const v = j / this.gridV;
      for (let i = 0; i <= this.gridU; i++) {
        const u = i / this.gridU;
        const pt = this.evaluateWave(u, v, this.time);
        
        pos[idx] = pt.x;
        pos[idx + 1] = pt.y;
        pos[idx + 2] = pt.z + playerZ;
        idx += 3;
      }
    }

    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();

    // 2. "ПЛОСКИЕ - ВОДА": Update flat conveyor sheets
    const totalSheetDistance = this.flatSheets.length * 36;
    for (let i = 0; i < this.flatSheets.length; i++) {
      const sheet = this.flatSheets[i];
      // Keep positioned around playerZ with wrapping
      let rel = (sheet.relZ - playerZ) % totalSheetDistance;
      if (rel < -36) rel += totalSheetDistance;
      sheet.mesh.position.z = playerZ + rel;
    }

    // 3. "КРУГЛЫЕ - ВОЛНЫ": Update rolling wave swell ridges travelling towards camera
    const totalRidgeDistance = this.rollingRidges.length * 42;
    for (let i = 0; i < this.rollingRidges.length; i++) {
      const ridge = this.rollingRidges[i];
      // Wave ridges move towards player at relative speed
      ridge.relZ -= dt * 6.0;
      let rel = (ridge.relZ - playerZ) % totalRidgeDistance;
      if (rel < -25) rel += totalRidgeDistance;
      ridge.group.position.z = playerZ + rel;
      
      // Gentle breathing scale of the rolling ridge
      const pulse = 1.0 + Math.sin(this.time * 3.0 + i) * 0.08;
      ridge.group.scale.y = pulse;
    }

    // 4. Update left stepped wave shelf position
    if (this.stepShelves) {
      for (let s = 0; s < this.stepShelves.length; s++) {
        this.stepShelves[s].position.z = playerZ;
      }
    }

    // 5. Update surface foam flecks skimming backwards
    if (this.foamFlecks) {
      const fPos = this.foamFlecks.geometry.attributes.position.array;
      for (let i = 0; i < this.fleckData.length; i++) {
        const f = this.fleckData[i];
        f.relZ -= dt * effectiveSpeed * f.speedFactor;
        
        // Wrap flecks around player
        if (f.relZ < playerZ - 30) {
          f.relZ = playerZ + 80 + Math.random() * 30;
          f.x = -7.0 + Math.random() * 11.0;
        }

        fPos[i * 3] = f.x + Math.sin(this.time * 2.0 + i) * 0.2;
        // Float on surface
        const surf = this.getSurfaceInfo(f.x, f.relZ);
        fPos[i * 3 + 1] = surf.height + 0.04;
        fPos[i * 3 + 2] = f.relZ;
      }
      this.foamFlecks.geometry.attributes.position.needsUpdate = true;
    }

    // 6. Paper spray particles
    if (this.sprayMesh) {
      const sPos = this.sprayMesh.geometry.attributes.position.array;
      for (let i = 0; i < this.sprayCount; i++) {
        const v = this.sprayVelocities[i];
        v.life += dt;

        const baseIdx = i * 3;
        sPos[baseIdx] += v.vx * dt;
        sPos[baseIdx + 1] += v.vy * dt;
        sPos[baseIdx + 2] += v.vz * dt;
        v.vy -= 1.8 * dt;

        if (v.life >= v.maxLife || sPos[baseIdx + 2] < playerZ - this.lengthZ * 0.5) {
          const randU = 0.74 + Math.random() * 0.14;
          const randV = Math.random();
          const pt = this.evaluateWave(randU, randV, this.time);

          sPos[baseIdx] = pt.x + (Math.random() - 0.5) * 0.6;
          sPos[baseIdx + 1] = pt.y + Math.random() * 0.4;
          sPos[baseIdx + 2] = playerZ + (Math.random() - 0.2) * this.lengthZ * 0.5;

          v.vx = -1.6 - Math.random() * 1.8;
          v.vy = 0.5 + Math.random() * 1.2;
          v.life = 0;
        }
      }
      this.sprayMesh.geometry.attributes.position.needsUpdate = true;
    }

    if (this.floorMesh) {
      this.floorMesh.position.z = playerZ + 50;
    }

    if (this.lipShadowMesh) {
      this.lipShadowMesh.position.z = playerZ;
    }
  }

  getSurfaceInfo(playerX, playerZ) {
    let bestU = 0.45;
    let minDiff = 999;
    for (let u = 0; u <= 0.72; u += 0.015) {
      const sx = this.getCrossSection(u).x;
      const diff = Math.abs(sx - playerX);
      if (diff < minDiff) {
        minDiff = diff;
        bestU = u;
      }
    }

    const pt = this.evaluateWave(bestU, 0.5, this.time);
    const ptU = this.evaluateWave(Math.min(0.72, bestU + 0.02), 0.5, this.time);
    const ptZ = this.evaluateWave(bestU, 0.5 + 0.02, this.time);

    const vU = new THREE.Vector3(ptU.x - pt.x, ptU.y - pt.y, ptU.z - pt.z);
    const vZ = new THREE.Vector3(ptZ.x - pt.x, ptZ.y - pt.y, ptZ.z - pt.z);
    const normal = new THREE.Vector3().crossVectors(vZ, vU).normalize();

    const isInsideBarrel = (playerX >= this.tubeZone.minX && playerX <= this.tubeZone.maxX && pt.y >= this.tubeZone.minY);

    // Add extra swell height if riding over a rolling wave ridge!
    let extraSwell = 0;
    for (let i = 0; i < this.rollingRidges.length; i++) {
      const r = this.rollingRidges[i];
      const dz = Math.abs(playerZ - r.group.position.z);
      if (dz < 8.0) {
        extraSwell += Math.cos((dz / 8.0) * (Math.PI * 0.5)) * 0.45;
      }
    }

    return {
      height: pt.y + extraSwell,
      normal: normal,
      u: bestU,
      isInsideBarrel: isInsideBarrel
    };
  }

  setFlavor(flavor) {
    this.flavor = flavor;
  }
}

window.OceanWave = OceanWave;
