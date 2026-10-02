/**
 * Tony's Garret — Surf Rush
 * Papercraft 2.5D Procedural Models & Sprite Rig System
 * Aesthetic: Paper Collage, Torn Paper Stickers, Halftone Print, 2D+3D Hybrid
 */

class SurfModels {
  // 1. PAPERCRAFT 2.5D SURFER SPRITE RIG WITH 3D CHERRY BEER STEIN
  static createPaperSurferRig(flavor) {
    const group = new THREE.Group();
    group.name = 'paperSurferRig';

    const loader = new THREE.TextureLoader();
    
    // Load the 3 authentic concept sprite poses
    const texNorma = loader.load(window.SPRITE_ASSETS.surfer_norma);
    const texTurn = loader.load(window.SPRITE_ASSETS.surfer_turn);
    const texJump = loader.load(window.SPRITE_ASSETS.surfer_jump);

    [texNorma, texTurn, texJump].forEach(t => {
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
    });

    // Main 2.5D Surfer Billboard Card (рост ~28% высоты экрана)
    const cardWidth = 1.95;
    const cardHeight = 2.45;
    const cardGeo = new THREE.PlaneGeometry(cardWidth, cardHeight);
    
    // Paper cut-out material: alphaTest cleanly clips sticker boundary
    const cardMat = new THREE.MeshBasicMaterial({
      map: texNorma,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide
    });

    const cardMesh = new THREE.Mesh(cardGeo, cardMat);
    cardMesh.position.set(0, cardHeight * 0.5, 0);
    cardMesh.name = 'surferSprite';
    group.add(cardMesh);

    // 1.1 3D-кружка скрыта до Фазы 3, заменена на аккуратный 2.5D бумажный спрайт кружки 0.45м
    const beerMug = SurfModels.createCherryBeerMug();
    beerMug.visible = false; // скрыта до Фазы 3 по ревью
    group.add(beerMug);

    const cupTex = loader.load(window.SPRITE_ASSETS.cherry_beer_cup || window.SPRITE_ASSETS.beer_cup);
    cupTex.generateMipmaps = true;
    const cupGeo = new THREE.PlaneGeometry(0.45, 0.45);
    const cupMat = new THREE.MeshBasicMaterial({
      map: cupTex,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true
    });
    const cupSprite = new THREE.Mesh(cupGeo, cupMat);
    cupSprite.name = 'paperBeerCupSprite';
    // Скрыто до Фазы 3, чтобы наклейка не перекрывала пальцы и кисть сёрфера на спрайте
    cupSprite.visible = false;
    cupSprite.position.set(0.54, 1.38, -0.04);
    group.add(cupSprite);

    // Тень-эллипс #1C1A22 под доску (opacity 0.35)
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    const grad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 58);
    grad.addColorStop(0, 'rgba(28, 26, 34, 0.85)');
    grad.addColorStop(0.65, 'rgba(28, 26, 34, 0.45)');
    grad.addColorStop(1, 'rgba(28, 26, 34, 0)');
    sCtx.fillStyle = grad;
    sCtx.beginPath();
    sCtx.ellipse(64, 64, 56, 30, 0, 0, Math.PI * 2);
    sCtx.fill();

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeo = new THREE.PlaneGeometry(1.8, 3.2);
    shadowGeo.rotateX(-Math.PI * 0.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(0, 0.04, 0);
    shadowMesh.name = 'waterShadow';
    group.add(shadowMesh);

    // Контроллер смены поз с точным позиционированием кружки в руке
    group.userData = {
      beerMug: beerMug,
      cupSprite: cupSprite,
      textures: { norma: texNorma, turn: texTurn, jump: texJump },
      currentPose: 'norma',
      setPose: (poseName, steerStrength = 0) => {
        if (group.userData.textures[poseName] && group.userData.currentPose !== poseName) {
          cardMesh.material.map = group.userData.textures[poseName];
          cardMesh.material.needsUpdate = true;
          group.userData.currentPose = poseName;
        }

        if (poseName === 'turn') {
          // steerStrength > 0 означает движение влево по экрану (+X)
          const isLeft = steerStrength > 0;
          cardMesh.scale.x = isLeft ? 1 : -1;
          cupSprite.position.set(isLeft ? 0.75 : -0.75, 1.40, -0.04);
          cupSprite.scale.x = isLeft ? 1 : -1;
        } else if (poseName === 'jump') {
          cardMesh.scale.x = 1;
          cupSprite.scale.x = 1;
          // В позе jump рука поднята вверх: x = +0.35, y = 1.90, z = -0.04
          cupSprite.position.set(0.35, 1.90, -0.04);
        } else {
          cardMesh.scale.x = 1;
          cupSprite.scale.x = 1;
          // В позе norma рука слева на экране (+X): x = +0.54, y = 1.38, z = -0.04
          cupSprite.position.set(0.54, 1.38, -0.04);
        }
      }
    };

    return group;
  }

  // 1.2 BIG FACETED GLASS MUG OF CHERRY CRAFT BEER (Вишневое пиво с крутой физикой жидкости)
  static createCherryBeerMug() {
    const mugGroup = new THREE.Group();
    mugGroup.name = 'cherryBeerMug';

    // Sized prominently in surfer's hand
    const mugRadius = 0.17;
    const mugHeight = 0.48;

    // A. Outer Glass Stein Body (Thick faceted transparent glass)
    const glassGeo = new THREE.CylinderGeometry(mugRadius * 1.05, mugRadius * 0.94, mugHeight, 14, 1, true);
    const glassMat = new THREE.MeshPhongMaterial({
      color: 0xebf7ff,
      specular: 0xffffff,
      shininess: 95,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    mugGroup.add(glassMesh);

    // Thick glass base
    const baseGeo = new THREE.CylinderGeometry(mugRadius * 0.96, mugRadius * 0.96, 0.07, 14);
    const baseMat = new THREE.MeshPhongMaterial({
      color: 0xd4ecff,
      specular: 0xffffff,
      shininess: 90,
      transparent: true,
      opacity: 0.75
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -mugHeight * 0.5 + 0.035;
    mugGroup.add(baseMesh);

    // Thick glass handle on the side
    const handleGeo = new THREE.TorusGeometry(0.13, 0.035, 8, 16, Math.PI * 1.15);
    const handleMat = new THREE.MeshPhongMaterial({
      color: 0xe0f0ff,
      specular: 0xffffff,
      shininess: 90,
      transparent: true,
      opacity: 0.65
    });
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.position.set(mugRadius + 0.05, -0.01, 0);
    handleMesh.rotation.z = -Math.PI * 0.55;
    mugGroup.add(handleMesh);

    // B. Ruby Cherry Beer Liquid Column
    // Deep ruby cherry red: 0x99002a / 0xb80036
    const liquidTotalHeight = mugHeight * 0.84;
    const liquidGeo = new THREE.CylinderGeometry(mugRadius * 0.94, mugRadius * 0.86, liquidTotalHeight, 14);
    liquidGeo.translate(0, liquidTotalHeight * 0.5, 0); // Anchor pivot at base of liquid

    const liquidMat = new THREE.MeshPhongMaterial({
      color: 0x9e0832,      // Rich deep cherry crimson
      emissive: 0x3d0010,   // Internal ruby radiance
      specular: 0xff4d79,   // Sparkling cherry glint
      shininess: 70,
      transparent: true,
      opacity: 0.92
    });
    const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
    const liquidBaseY = -mugHeight * 0.5 + 0.07;
    liquidMesh.position.y = liquidBaseY;
    mugGroup.add(liquidMesh);

    // C. Dynamic Slosh Pivot Group (Meniscus + Velvety Craft Foam Head)
    const sloshGroup = new THREE.Group();
    sloshGroup.position.y = liquidBaseY + liquidTotalHeight; // liquid top level
    mugGroup.add(sloshGroup);

    // Meniscus surface plane (Ruby surface disc)
    const meniscusGeo = new THREE.CircleGeometry(mugRadius * 0.95, 16);
    meniscusGeo.rotateX(-Math.PI * 0.5);
    const meniscusMat = new THREE.MeshBasicMaterial({
      color: 0xd60e48,
      side: THREE.DoubleSide
    });
    const meniscusMesh = new THREE.Mesh(meniscusGeo, meniscusMat);
    sloshGroup.add(meniscusMesh);

    // Velvety Craft Foam Head (Pinkish-white fluffy beer head)
    const foamGeo = new THREE.CylinderGeometry(mugRadius * 0.98, mugRadius * 0.93, 0.08, 14);
    const foamMat = new THREE.MeshPhongMaterial({
      color: 0xfff0f4,     // Craft cherry foam (soft cream with rose blush)
      specular: 0xffffff,
      shininess: 35,
      flatShading: true
    });
    const foamMesh = new THREE.Mesh(foamGeo, foamMat);
    foamMesh.position.y = 0.04;
    sloshGroup.add(foamMesh);

    // Two juicy red cherries garnish on mug rim!
    const cherry1Geo = new THREE.SphereGeometry(0.045, 8, 8);
    const cherryMat = new THREE.MeshPhongMaterial({
      color: 0x730018,
      specular: 0xff5577,
      shininess: 85
    });
    const cherry1 = new THREE.Mesh(cherry1Geo, cherryMat);
    cherry1.position.set(-mugRadius * 0.85, mugHeight * 0.5 - 0.02, 0.05);
    mugGroup.add(cherry1);

    const cherry2 = new THREE.Mesh(cherry1Geo, cherryMat);
    cherry2.position.set(-mugRadius * 0.72, mugHeight * 0.5 - 0.06, -0.06);
    cherry2.scale.setScalar(0.85);
    mugGroup.add(cherry2);

    // Methods to drive liquid physics
    mugGroup.userData = {
      baseLiquidHeight: liquidTotalHeight,
      baseY: liquidBaseY,
      sloshGroup: sloshGroup,
      updateSlosh: (sloshAngle, sloshPitch, beerPct) => {
        const fill = Math.max(0.05, Math.min(1.0, beerPct / 100));
        
        // Scale liquid volume
        liquidMesh.scale.y = fill;
        
        // Position slosh top plane
        const currentTopY = mugGroup.userData.baseY + mugGroup.userData.baseLiquidHeight * fill;
        sloshGroup.position.y = currentTopY;
        
        // Tilt surface according to fluid inertia
        sloshGroup.rotation.z = sloshAngle;
        sloshGroup.rotation.x = sloshPitch;
      }
    };

    return mugGroup;
  }

  // 2. PAPERCRAFT BOTTLE CROWN CAPS (Collectibles: Fish & Palm)
  static createPaperCap(type = 'fish') {
    const group = new THREE.Group();
    const loader = new THREE.TextureLoader();

    const isPalm = type === 'palm';
    const texUri = isPalm ? window.SPRITE_ASSETS.cap_palm : window.SPRITE_ASSETS.cap_fish;
    const capTex = loader.load(texUri);

    const radius = 0.65;

    // Front Cap Face (Circular Die-Cut Paper Disc)
    const capGeo = new THREE.CircleGeometry(radius, 24);
    const capMat = new THREE.MeshBasicMaterial({
      map: capTex,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.FrontSide
    });
    const frontMesh = new THREE.Mesh(capGeo, capMat);
    group.add(frontMesh);

    // Back of the Cap (Golden tinplate backing)
    const backGeo = new THREE.CircleGeometry(radius * 0.96, 24);
    const backMat = new THREE.MeshBasicMaterial({
      color: isPalm ? 0xb53018 : 0xd4a012,
      side: THREE.BackSide
    });
    const backMesh = new THREE.Mesh(backGeo, backMat);
    backMesh.position.z = -0.03;
    group.add(backMesh);

    // Crimped Metal Ring Rim
    const rimGeo = new THREE.CylinderGeometry(radius, radius, 0.06, 24, 1, true);
    rimGeo.rotateX(Math.PI * 0.5);
    const rimMat = new THREE.MeshBasicMaterial({
      color: isPalm ? 0x902010 : 0xb5880c,
      side: THREE.DoubleSide
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.z = -0.015;
    group.add(rim);

    // Floating Paper Drop Shadow
    const shadowGeo = new THREE.PlaneGeometry(1.2, 1.2);
    shadowGeo.rotateX(-Math.PI * 0.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x050a1c,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(0, -0.65, 0);
    shadowMesh.name = 'capShadow';
    group.add(shadowMesh);

    group.userData = {
      type: type,
      baseY: 0,
      rotSpeed: 2.2 + Math.random() * 0.8,
      wobbleSpeed: 3.5 + Math.random() * 1.0,
      wobbleOffset: Math.random() * Math.PI * 2
    };

    return group;
  }

  // 3. CARDBOARD JUMP RAMP WITH CHEVRON ARROW SIGN (>> )
  static createPaperChevronRamp() {
    const group = new THREE.Group();
    const loader = new THREE.TextureLoader();

    // Curved Cardboard Ramp Deck
    const rampCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0.1, -4.5),
      new THREE.Vector3(0, 0.2, -1.0),
      new THREE.Vector3(0, 1.0, 2.0),
      new THREE.Vector3(0, 2.6, 4.5)
    );

    const width = 3.4;
    const segments = 16;
    const pts = rampCurve.getPoints(segments);
    
    const rampGeo = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const p = pts[i];
      const v = i / segments;
      positions.push(p.x - width * 0.5, p.y, p.z);
      uvs.push(0, v);
      positions.push(p.x + width * 0.5, p.y, p.z);
      uvs.push(1, v);
    }

    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = (i + 1) * 2;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }

    rampGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    rampGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    rampGeo.setIndex(indices);
    rampGeo.computeVertexNormals();

    const waveTex = loader.load(window.SPRITE_ASSETS.wave_paper_texture);
    waveTex.wrapS = THREE.RepeatWrapping;
    waveTex.wrapT = THREE.RepeatWrapping;
    waveTex.repeat.set(1, 2);

    const rampMat = new THREE.MeshBasicMaterial({
      map: waveTex,
      side: THREE.DoubleSide
    });
    const rampMesh = new THREE.Mesh(rampGeo, rampMat);
    group.add(rampMesh);

    // Cardboard sides
    const sideShape = new THREE.Shape();
    sideShape.moveTo(-4.5, 0);
    pts.forEach(p => sideShape.lineTo(p.z, p.y));
    sideShape.lineTo(4.5, 0);
    sideShape.closePath();

    const sideGeo = new THREE.ShapeGeometry(sideShape);
    sideGeo.rotateY(Math.PI * 0.5);
    const sideMat = new THREE.MeshBasicMaterial({
      color: 0xcca06a, // Warm kraft cardboard
      side: THREE.DoubleSide
    });

    const leftWall = new THREE.Mesh(sideGeo, sideMat);
    leftWall.position.x = -width * 0.5;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(sideGeo, sideMat);
    rightWall.position.x = width * 0.5;
    group.add(rightWall);

    // Cardboard Chevron Arrow Sign (>> ) on Easel Stand
    const signTex = loader.load(window.SPRITE_ASSETS.chevron_sign);
    const signGeo = new THREE.PlaneGeometry(2.4, 1.8);
    const signMat = new THREE.MeshBasicMaterial({
      map: signTex,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide
    });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(width * 0.5 + 1.1, 1.7, 1.4);
    signMesh.rotation.y = -0.25;
    group.add(signMesh);

    group.userData = {
      isRamp: true,
      width: width,
      length: 9.0,
      kickerY: 2.6
    };

    return group;
  }

  // 4. SCENIC PAPERCRAFT COLLAGE DIORAMA (Panoramic Sunset Sky, Golden Sun Disc, Soaring Seagulls)
  static createPaperDiorama(scene) {
    const dioramaGroup = new THREE.Group();
    dioramaGroup.name = 'paperDiorama';
    const loader = new THREE.TextureLoader();

    // 1. Panoramic Sunset Sky Plane with Halftone Horizon
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 512;
    const sCtx = skyCanvas.getContext('2d');
    const skyGrad = sCtx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0, '#100525');    // Deep starry zenith
    skyGrad.addColorStop(0.35, '#2b0f4a'); // Twilight purple
    skyGrad.addColorStop(0.60, '#781c5f'); // Sunset magenta
    skyGrad.addColorStop(0.78, '#db4834'); // Warm glowing coral
    skyGrad.addColorStop(0.92, '#ffa63f'); // Golden amber
    skyGrad.addColorStop(1, '#ffdf7e');    // Horizon gold
    sCtx.fillStyle = skyGrad;
    sCtx.fillRect(0, 0, 512, 512);

    // Subtle paper halftone print pattern on sky
    sCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    for (let py = 0; py < 512; py += 8) {
      for (let px = 0; px < 512; px += 8) {
        sCtx.fillRect(px, py, 1.4, 1.4);
      }
    }

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const skyGeo = new THREE.PlaneGeometry(360, 160);
    skyGeo.rotateY(Math.PI);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.position.set(0, 45, 165);
    dioramaGroup.add(skyMesh);

    // 2. Giant Warm Golden Paper Sun Disc
    const sunCanvas = document.createElement('canvas');
    sunCanvas.width = 256;
    sunCanvas.height = 256;
    const sunCtx = sunCanvas.getContext('2d');
    const sunGrad = sunCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.3, '#fff494');
    sunGrad.addColorStop(0.65, '#ffb032');
    sunGrad.addColorStop(0.90, '#ff477e');
    sunGrad.addColorStop(1, 'rgba(255, 71, 126, 0)');
    sunCtx.fillStyle = sunGrad;
    sunCtx.fillRect(0, 0, 256, 256);

    const sunTex = new THREE.CanvasTexture(sunCanvas);
    const sunGeo = new THREE.CircleGeometry(26, 36);
    sunGeo.rotateY(Math.PI);
    const sunMat = new THREE.MeshBasicMaterial({
      map: sunTex,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(3, 18, 155);
    dioramaGroup.add(sunMesh);

    // Warm Solar Corona Halo
    const haloGeo = new THREE.CircleGeometry(44, 36);
    haloGeo.rotateY(Math.PI);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff8833,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(3, 18, 154);
    dioramaGroup.add(halo);

    // 3. Italian Cliff Town on Left (from reference image)
    const townTex = loader.load(window.SPRITE_ASSETS.bg_town);
    const townGeo = new THREE.PlaneGeometry(54, 75);
    townGeo.rotateY(Math.PI);
    const townMat = new THREE.MeshBasicMaterial({
      map: townTex,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const townMesh = new THREE.Mesh(townGeo, townMat);
    townMesh.position.set(38, 28, 142); // Screen LEFT
    dioramaGroup.add(townMesh);

    // 4. Faraglioni Sea Stack Rocks on Right (from reference image)
    const rocksTex = loader.load(window.SPRITE_ASSETS.bg_rocks);
    const rocksGeo = new THREE.PlaneGeometry(48, 38);
    rocksGeo.rotateY(Math.PI);
    const rocksMat = new THREE.MeshBasicMaterial({
      map: rocksTex,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const rocksMesh = new THREE.Mesh(rocksGeo, rocksMat);
    rocksMesh.position.set(-38, 16, 142); // Screen RIGHT
    dioramaGroup.add(rocksMesh);

    // 5. Stylized Fluffy Paper Clouds Flanking the Sun
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 256;
    cloudCanvas.height = 96;
    const cCtx = cloudCanvas.getContext('2d');
    cCtx.fillStyle = '#ffffff';
    // Puffy paper cloud shape
    for (const [cx, cy, cr] of [[50, 50, 36], [95, 40, 44], [150, 42, 42], [200, 52, 34], [120, 60, 35]]) {
      cCtx.beginPath();
      cCtx.arc(cx, cy, cr, 0, Math.PI * 2);
      cCtx.fill();
    }
    const cloudTex = new THREE.CanvasTexture(cloudCanvas);
    const cloudGeo = new THREE.PlaneGeometry(55, 20);
    cloudGeo.rotateY(Math.PI);
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    const cloudLeft = new THREE.Mesh(cloudGeo, cloudMat);
    cloudLeft.position.set(22, 28, 146);
    dioramaGroup.add(cloudLeft);

    const cloudRight = new THREE.Mesh(cloudGeo, cloudMat);
    cloudRight.position.set(-26, 32, 146);
    cloudRight.scale.set(0.85, 0.85, 1);
    dioramaGroup.add(cloudRight);

    // 6. Soaring Paper Seagulls
    const gull1Tex = loader.load(window.SPRITE_ASSETS.seagull_1);
    const gullGeo = new THREE.PlaneGeometry(12, 10);
    gullGeo.rotateY(Math.PI);
    const gullMat = new THREE.MeshBasicMaterial({
      map: gull1Tex,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const gull1 = new THREE.Mesh(gullGeo, gullMat);
    gull1.position.set(18, 38, 138);
    dioramaGroup.add(gull1);

    const gull2Tex = loader.load(window.SPRITE_ASSETS.seagull_2);
    const gull2Mat = new THREE.MeshBasicMaterial({
      map: gull2Tex,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const gull2 = new THREE.Mesh(gullGeo, gull2Mat);
    gull2.position.set(-24, 42, 138);
    gull2.scale.set(0.8, 0.8, 1);
    dioramaGroup.add(gull2);

    dioramaGroup.userData = {
      update: (dt, time) => {
        // Idle ambient subtle sun pulse
        if (sunMesh) {
          sunMesh.scale.setScalar(1.0 + Math.sin(time * 1.5) * 0.02);
        }
        // Seagulls soaring gentle bob
        if (gull1) {
          gull1.position.y = 38 + Math.sin(time * 2.0) * 0.8;
          gull1.position.x = 18 + Math.cos(time * 0.8) * 1.5;
        }
        if (gull2) {
          gull2.position.y = 42 + Math.cos(time * 1.7) * 0.7;
          gull2.position.x = -24 + Math.sin(time * 0.9) * 1.2;
        }
      }
    };

    scene.add(dioramaGroup);
    return dioramaGroup;
  }
}

window.SurfModels = SurfModels;
