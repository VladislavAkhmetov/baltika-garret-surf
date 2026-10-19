const puppeteer = require('puppeteer-core');
const { createServer } = require('./serve');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function analyze() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });

    const page = await browser.newPage();
    const dpr = 2.0; // standard 2x mobile retina (e.g. 390x844 with 2x scale = 780x1688 physical pixels)
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: dpr });

    const requests = [];
    page.on('response', async resp => {
      try {
        const url = resp.url();
        const headers = resp.headers();
        const status = resp.status();
        let size = Number(headers['content-length'] || 0);
        if (!size) {
          try {
            const buf = await resp.buffer();
            size = buf.length;
          } catch (_) {}
        }
        requests.push({ url, status, size, type: headers['content-type'] || '' });
      } catch (_) {}
    });

    console.log('Navigating to game...');
    await page.goto(base + '/', { waitUntil: 'networkidle0' });

    async function collectDOMImages(screenName) {
      return await page.evaluate((screen, dpr) => {
        const results = [];
        const imgs = Array.from(document.querySelectorAll('img, picture img'));
        for (const img of imgs) {
          const rect = img.getBoundingClientRect();
          const visible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(img).display !== 'none' && window.getComputedStyle(img).visibility !== 'hidden';
          const src = img.currentSrc || img.src;
          results.push({
            screen,
            type: 'DOM img',
            src: src.split('/').slice(-3).join('/'),
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            cssW: Math.round(rect.width),
            cssH: Math.round(rect.height),
            deviceW: Math.round(rect.width * dpr),
            deviceH: Math.round(rect.height * dpr),
            visible
          });
        }
        return results;
      }, screenName, dpr);
    }

    const measurements = [];
    await page.waitForSelector('#start-button');
    measurements.push(...await collectDOMImages('Start Screen'));

    // Move to setup screen
    await page.tap('#start-button');
    await page.waitForSelector('#setup-next', { visible: true });
    await sleep(400);
    measurements.push(...await collectDOMImages('Setup Screen'));

    // Move to comic screen page 0
    await page.tap('#setup-next');
    await page.waitForSelector('#story-next', { visible: true });
    await sleep(600);
    measurements.push(...await collectDOMImages('Comic Page 1'));

    // Move to comic screen page 1
    await page.tap('#story-next');
    await sleep(600);
    measurements.push(...await collectDOMImages('Comic Page 2'));

    // Now launch into game
    await page.tap('#story-next');
    await page.waitForFunction(() => window.game && window.game.state === 'playing', { timeout: 15000 });
    console.log('Game playing!');
    await sleep(1000);

    // Measure 3D textures and their on-screen projections
    const threeMetrics = await page.evaluate((dpr) => {
      const g = window.game;
      const camera = g.camera;
      const renderer = g.renderer;
      const canvas = renderer.domElement;
      const canvasW = canvas.clientWidth;
      const canvasH = canvas.clientHeight;
      const pixelRatio = renderer.getPixelRatio();
      const internalW = Math.round(canvasW * pixelRatio);
      const internalH = Math.round(canvasH * pixelRatio);

      function projectMeshSize(mesh, wWorld, hWorld) {
        if (!mesh) return { projW: 0, projH: 0, dist: '0' };
        const wp = new THREE.Vector3();
        mesh.getWorldPosition(wp);
        const cp = new THREE.Vector3();
        camera.getWorldPosition(cp);
        const dist = wp.distanceTo(cp);
        if (dist <= 0.01) return { projW: 0, projH: 0, dist: '0' };
        const fovRad = (camera.fov * Math.PI) / 180;
        const visibleHeightAtDist = 2 * Math.tan(fovRad / 2) * dist;
        const visibleWidthAtDist = visibleHeightAtDist * camera.aspect;
        const projH = (hWorld / visibleHeightAtDist) * internalH;
        const projW = (wWorld / visibleWidthAtDist) * internalW;
        return { projW: Math.round(projW), projH: Math.round(projH), dist: dist.toFixed(1) };
      }

      const results = [];
      // 1. Hero
      if (g.heroAnimator) {
        for (const [key, t] of Object.entries(g.heroAnimator.atlases || {})) {
          const img = t.image;
          const p = projectMeshSize(g.player.card, g.heroAnimator.width, g.heroAnimator.height);
          results.push({
            name: 'Hero Atlas (' + key + ')',
            type: 'Canvas Atlas',
            texW: img.width,
            texH: img.height,
            projW: p.projW,
            projH: p.projH,
            dist: p.dist,
            notes: 'Generated 7x 1536x1024 on CPU via mesh warp'
          });
          break;
        }
      }
      // 2. Surfboard
      if (g.surfboardTexture && g.surfboardTexture.image) {
        const img = g.surfboardTexture.image;
        const p = projectMeshSize(g.player.board, 1.52, 4.8);
        results.push({
          name: 'Surfboard (surfboard-paper-v1.webp)',
          type: '3D Texture',
          texW: img.width,
          texH: img.height,
          projW: p.projW,
          projH: p.projH,
          dist: p.dist,
          notes: 'Rendered foreshortened on water'
        });
      }
      // 3. Hand Beer
      if (g.handBeer && g.handBeer.canvas) {
        const p = projectMeshSize(g.handBeer.mesh, 1.12, 1.4);
        results.push({
          name: 'Hand Beer Mug (mug-paper-frame.png)',
          type: 'Canvas Texture',
          texW: g.handBeer.canvas.width,
          texH: g.handBeer.canvas.height,
          srcW: g.handBeer.frame ? g.handBeer.frame.naturalWidth : '?',
          srcH: g.handBeer.frame ? g.handBeer.frame.naturalHeight : '?',
          projW: p.projW,
          projH: p.projH,
          dist: p.dist,
          notes: 'Source PNG is 2200x2200 downscaled to 384x480 canvas'
        });
      }
      // 4. Coast / Town
      if (g.textures.bg_town_transparent && g.textures.bg_town_transparent.image) {
        const img = g.textures.bg_town_transparent.image;
        results.push({
          name: 'Coast / Town (coast-cape-v5.webp)',
          type: '3D Backdrop',
          texW: img.width,
          texH: img.height,
          projW: internalW,
          projH: Math.round(internalH * 0.35),
          notes: 'Backdrop strip in distance'
        });
      }
      // 5. Water Surface
      if (g.wave && g.wave.waterMaterial && g.wave.waterMaterial.map) {
        const img = g.wave.waterMaterial.map.image;
        results.push({
          name: 'Water Surface (water-surface-v5.png)',
          type: '3D Wave Surface',
          texW: img ? img.width : '?',
          texH: img ? img.height : '?',
          projW: internalW,
          projH: Math.round(internalH * 0.6),
          notes: 'Tiled water texture on 3D plane'
        });
      }
      // 6. Boris Jetski
      if (g.world && g.world.jetskiTexture && g.world.jetskiTexture.image) {
        const img = g.world.jetskiTexture.image;
        results.push({
          name: 'Boris Jetski (jetski-boris-v2.webp)',
          type: '3D Sprite/Prop',
          texW: img.width,
          texH: img.height,
          projW: Math.round(internalW * 0.28),
          projH: Math.round(internalH * 0.14),
          notes: 'Mid-range rival jetski'
        });
      }
      // 7. Crab Kleshnya
      if (g.companion && g.companion.image) {
        const img = g.companion.image;
        const p = projectMeshSize(g.companion.card, 0.92, 0.4);
        results.push({
          name: 'Crab Companion (crab-kleshnya-sheet-v1.webp)',
          type: '3D Sprite on board',
          texW: img.width,
          texH: img.height,
          projW: p.projW,
          projH: p.projH,
          dist: p.dist,
          notes: 'Small companion riding on tail'
        });
      }
      // 8. Seaplane / Banner
      const plane = g.scene.getObjectByName('amphibious-plane');
      if (plane && plane.material && plane.material.map && plane.material.map.image) {
        const img = plane.material.map.image;
        results.push({
          name: 'Seaplane (seaplane-lime-v3.png)',
          type: 'Distant 3D Prop',
          texW: img.width,
          texH: img.height,
          projW: 90,
          projH: 40,
          notes: 'Distant plane flying in sky'
        });
      }
      // 9. Sea stack
      if (g.surfRush && g.surfRush.seaStackTexture && g.surfRush.seaStackTexture.image) {
        const img = g.surfRush.seaStackTexture.image;
        results.push({
          name: 'Sea Stack (sea-stack-v10.webp)',
          type: '3D Rock Obstacle',
          texW: img.width,
          texH: img.height,
          projW: 140,
          projH: 180,
          notes: 'Rock obstacles'
        });
      }
      // 10. Rivals
      if (g.race && g.race.cast && g.race.cast.profiles) {
        for (const prof of g.race.cast.profiles) {
          const img = prof.texture?.image;
          if (img) {
            results.push({
              name: 'Rival: ' + prof.name + ' (' + (prof.file || prof.id) + ')',
              type: '3D Rival Sprite',
              texW: img.width,
              texH: img.height,
              projW: Math.round(internalW * 0.22),
              projH: Math.round(internalH * 0.22),
              notes: 'Full uncompressed PNG sprite'
            });
          }
        }
      }

      // Memory estimation in VRAM
      let totalVramBytes = 0;
      function estimateTexVram(w, h, mipmaps = true) {
        const base = w * h * 4;
        return mipmaps ? Math.round(base * 1.33) : base;
      }

      return {
        canvasW, canvasH, pixelRatio, internalW, internalH,
        threeMetrics: results
      };
    }, dpr);

    // Pause screen inspection
    await page.evaluate(() => window.game.pause());
    await sleep(300);
    measurements.push(...await collectDOMImages('Pause Screen'));

    console.log('=== DOM IMAGE MEASUREMENTS ===');
    console.table(measurements.filter(m => m.visible).map(m => ({
      screen: m.screen,
      src: m.src,
      sourceRes: m.naturalW + 'x' + m.naturalH,
      cssDisplay: m.cssW + 'x' + m.cssH,
      devicePixels: m.deviceW + 'x' + m.deviceH,
      excessW: (m.naturalW / Math.max(1, m.deviceW)).toFixed(2) + 'x',
      excessH: (m.naturalH / Math.max(1, m.deviceH)).toFixed(2) + 'x'
    })));

    console.log('=== THREE.JS 3D TEXTURES & ON-SCREEN PROJECTION ===');
    console.log('WebGL Canvas Buffer:', threeMetrics.internalW + 'x' + threeMetrics.internalH, '(pixelRatio=' + threeMetrics.pixelRatio + ', css=' + threeMetrics.canvasW + 'x' + threeMetrics.canvasH + ')');
    console.table(threeMetrics.threeMetrics.map(t => ({
      name: t.name,
      texRes: t.texW + 'x' + t.texH,
      screenRes: t.projW + 'x' + t.projH,
      excessRatio: (typeof t.texW === 'number' && t.projW > 0 ? (t.texW / t.projW).toFixed(1) + 'x' : 'N/A'),
      notes: t.notes || ''
    })));

    console.log('=== NETWORK ASSET REQUESTS ===');
    const assetReqs = requests.filter(r => r.url.includes('/assets/'));
    const categorized = {
      images: { count: 0, bytes: 0, files: [] },
      audio: { count: 0, bytes: 0, files: [] },
      fonts: { count: 0, bytes: 0, files: [] },
      other: { count: 0, bytes: 0, files: [] }
    };
    for (const r of assetReqs) {
      const u = r.url;
      const name = u.split('/').slice(-2).join('/');
      if (u.includes('/audio/')) {
        categorized.audio.count++;
        categorized.audio.bytes += r.size;
        categorized.audio.files.push({ name, sizeKB: (r.size/1024).toFixed(1) });
      } else if (u.includes('/fonts/')) {
        categorized.fonts.count++;
        categorized.fonts.bytes += r.size;
        categorized.fonts.files.push({ name, sizeKB: (r.size/1024).toFixed(1) });
      } else if (u.includes('/comics/') || u.includes('/sprites/')) {
        categorized.images.count++;
        categorized.images.bytes += r.size;
        categorized.images.files.push({ name, sizeKB: (r.size/1024).toFixed(1) });
      } else {
        categorized.other.count++;
        categorized.other.bytes += r.size;
      }
    }

    console.log('Images loaded:', categorized.images.count, 'Total MB:', (categorized.images.bytes/1024/1024).toFixed(2));
    console.log('Audio loaded:', categorized.audio.count, 'Total MB:', (categorized.audio.bytes/1024/1024).toFixed(2));
    console.log('Fonts loaded:', categorized.fonts.count, 'Total MB:', (categorized.fonts.bytes/1024/1024).toFixed(2));
    const grandTotal = (categorized.images.bytes + categorized.audio.bytes + categorized.fonts.bytes + categorized.other.bytes) / 1024 / 1024;
    console.log('GRAND TOTAL ASSETS TRANSFERRED:', grandTotal.toFixed(2), 'MB');

  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

analyze().catch(err => { console.error(err); process.exit(1); });
