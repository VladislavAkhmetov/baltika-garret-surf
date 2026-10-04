/**
 * Tony's Garret — Surf Rush
 * High-Fidelity Thematic Audio Engine
 * Uses authentic recorded acoustic assets: surf rock BGM, ocean surf ambience,
 * natural seagull cries, real personal watercraft (jetski) engine, crowd cheering & gasps,
 * authentic water spray carving, board landings, wipeouts, and bottle-cap pickups.
 */

class SurfAudio {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.bgmPlaying = false;
    this.masterGain = null;
    this.sfxGain = null;
    this.ambientGain = null;
    this.bgmGain = null;
    
    // HTML5 BGM Audio element
    this.bgmAudio = null;
    this.bgmMediaNode = null;
    
    // Base asset path (works in both root and paper-comics/)
    this.basePath = 'assets/audio/';
    
    // AudioBuffers cache
    this.buffers = {};
    this.loadingPromises = {};
    this.isPreloaded = false;
    
    // Ambient wave nodes
    this.waveNoiseNode = null;
    this.waveFilter = null;
    this.waveGain = null;
    
    // Ambient seagulls timing
    this.seagullTimer = 0;
    this.nextSeagullTime = 6 + Math.random() * 8;
    
    // Jetski engine node
    this.jetskiSource = null;
    this.jetskiGainNode = null;
    this.jetskiPanner = null;
    
    // Sound asset manifest
    this.manifest = {
      ocean_ambient: 'ocean_ambient.wav',
      seagull_1: 'seagull_1.wav',
      seagull_2: 'seagull_2.wav',
      seagull_distant: 'seagull_distant.wav',
      crowd_cheer: 'crowd_cheer.wav',
      crowd_cheer_huge: 'crowd_cheer_huge.wav',
      crowd_applause: 'crowd_applause.wav',
      crowd_awe: 'crowd_awe.wav',
      jetski_loop: 'jetski_loop.wav',
      surf_wipeout: 'surf_wipeout.wav',
      landing_clean: 'landing_clean.wav',
      landing_hard: 'landing_hard.wav',
      surf_carve: 'surf_carve.wav',
      surf_carve_deep: 'surf_carve_deep.wav',
      surf_jump: 'surf_jump.wav',
      cap_pickup: 'cap_pickup.wav',
      cap_catch: 'cap_catch.wav',
      spill_scratch: 'spill_scratch.wav',
      trick_triumph: 'trick_triumph.wav',
      fanfare_win: 'fanfare_win.wav'
    };
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
      
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.65, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);
      
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0.45, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);
      
      this.preloadAll();
      this.initAmbientWave();
    } catch (e) {
      console.warn('[SurfAudio] Web Audio initialization notice:', e);
    }
  }

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);
    }
    if (this.bgmAudio) {
      this.bgmAudio.muted = this.isMuted;
    }
    return this.isMuted;
  }

  async loadBuffer(name) {
    if (this.buffers[name]) return this.buffers[name];
    if (this.loadingPromises[name]) return this.loadingPromises[name];
    
    const filename = this.manifest[name];
    if (!filename) return null;
    
    const url = this.basePath + filename;
    this.loadingPromises[name] = fetch(url)
      .then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
        return resp.arrayBuffer();
      })
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buffer => {
        this.buffers[name] = buffer;
        return buffer;
      })
      .catch(err => {
        console.warn(`[SurfAudio] Could not load audio asset ${name} (${url}):`, err.message);
        return null;
      });
      
    return this.loadingPromises[name];
  }

  preloadAll() {
    if (this.isPreloaded || !this.ctx) return;
    this.isPreloaded = true;
    for (const name of Object.keys(this.manifest)) {
      this.loadBuffer(name);
    }
  }

  playSound(name, {
    volume = 1.0,
    rate = 1.0,
    detune = 0,
    loop = false,
    pan = 0,
    filterFreq = null
  } = {}) {
    if (!this.ctx || this.isMuted) return null;
    const buf = this.buffers[name];
    if (!buf) {
      // If not yet decoded, trigger lazy load
      this.loadBuffer(name);
      return null;
    }
    
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      src.playbackRate.setValueAtTime(rate, this.ctx.currentTime);
      if (detune && src.detune) {
        src.detune.setValueAtTime(detune, this.ctx.currentTime);
      }
      
      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
      
      let lastNode = src;
      if (filterFreq !== null) {
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
        lastNode.connect(flt);
        lastNode = flt;
      }
      
      lastNode.connect(gainNode);
      
      if (pan !== 0 && this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-0.95, Math.min(0.95, pan)), this.ctx.currentTime);
        gainNode.connect(panner);
        panner.connect(this.sfxGain);
      } else {
        gainNode.connect(this.sfxGain);
      }
      
      src.start(this.ctx.currentTime);
      return { source: src, gain: gainNode };
    } catch (e) {
      console.warn(`[SurfAudio] playSound error (${name}):`, e);
      return null;
    }
  }

  // --- Dynamic Background Music ---

  startBgm() {
    this.startBGM();
  }

  stopBgm() {
    this.stopBGM();
  }

  startBGM() {
    this.bgmPlaying = true;
    if (this.isMuted) return;
    
    if (!this.bgmAudio) {
      this.bgmAudio = new Audio(this.basePath + 'bgm_surf_rock.mp3');
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = 0.45;
      
      // Connect to Web Audio graph if possible
      try {
        if (this.ctx && !this.bgmMediaNode) {
          this.bgmMediaNode = this.ctx.createMediaElementSource(this.bgmAudio);
          this.bgmMediaNode.connect(this.bgmGain);
          this.bgmAudio.volume = 1.0;
        }
      } catch (e) {
        this.bgmAudio.volume = 0.45;
      }
    }
    
    const playPromise = this.bgmAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(e => {
        // Autoplay policy waiting for user interaction
      });
    }
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmAudio) {
      this.bgmAudio.pause();
    }
  }

  // --- Ocean Surf Ambience ---

  initAmbientWave() {
    if (!this.ctx) return;
    
    this.waveFilter = this.ctx.createBiquadFilter();
    this.waveFilter.type = 'lowpass';
    this.waveFilter.frequency.setValueAtTime(500, this.ctx.currentTime);
    this.waveFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);
    
    this.waveGain = this.ctx.createGain();
    this.waveGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    
    this.waveFilter.connect(this.waveGain);
    this.waveGain.connect(this.ambientGain);
    
    this.loadBuffer('ocean_ambient').then(buf => {
      if (!buf || !this.ctx || this.waveNoiseNode) return;
      try {
        const noise = this.ctx.createBufferSource();
        noise.buffer = buf;
        noise.loop = true;
        noise.connect(this.waveFilter);
        noise.start(0);
        this.waveNoiseNode = noise;
      } catch (e) {}
    });
  }

  updateWave(speed = 1, isInsideBarrel = false) {
    if (!this.waveFilter || !this.waveGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    const targetFreq = isInsideBarrel ? 1350 : (380 + speed * 300);
    const targetGain = isInsideBarrel ? 0.55 : (0.22 + speed * 0.16);
    
    this.waveFilter.frequency.setTargetAtTime(targetFreq, t, 0.12);
    this.waveGain.gain.setTargetAtTime(targetGain, t, 0.12);
  }

  // Periodic ambient natural elements (seagulls calling in sea breeze)
  updateAmbient(dt = 0.016) {
    if (!this.ctx || this.isMuted) return;
    this.seagullTimer += dt;
    if (this.seagullTimer >= this.nextSeagullTime) {
      this.seagullTimer = 0;
      this.nextSeagullTime = 7 + Math.random() * 10;
      this.playSeagull();
    }
  }

  playSeagull(variant = null) {
    if (!this.ctx || this.isMuted) return;
    const gulls = ['seagull_1', 'seagull_2', 'seagull_distant'];
    const pick = variant !== null ? gulls[variant % gulls.length] : gulls[Math.floor(Math.random() * gulls.length)];
    const pan = (Math.random() - 0.5) * 1.3;
    const vol = pick === 'seagull_distant' ? 0.22 : 0.32;
    this.playSound(pick, { volume: vol, pan, rate: 0.95 + Math.random() * 0.1 });
  }

  // --- Dynamic Jetski Motor Engine ---

  updateJetski(distance, wakeQuality = 0, lateralOffset = 0) {
    if (!this.ctx || this.isMuted) return;
    
    if (distance < 45) {
      if (!this.jetskiSource && this.buffers['jetski_loop']) {
        try {
          const src = this.ctx.createBufferSource();
          src.buffer = this.buffers['jetski_loop'];
          src.loop = true;
          
          this.jetskiGainNode = this.ctx.createGain();
          this.jetskiGainNode.gain.setValueAtTime(0.001, this.ctx.currentTime);
          
          let target = this.jetskiGainNode;
          if (this.ctx.createStereoPanner) {
            this.jetskiPanner = this.ctx.createStereoPanner();
            this.jetskiGainNode.connect(this.jetskiPanner);
            target = this.jetskiPanner;
          }
          target.connect(this.sfxGain);
          
          src.connect(this.jetskiGainNode);
          src.start(0);
          this.jetskiSource = src;
        } catch (e) {}
      }
      
      if (this.jetskiSource && this.jetskiGainNode) {
        const proximity = Math.max(0, 1 - distance / 45);
        const targetVol = Math.min(0.75, proximity * 0.50 + wakeQuality * 0.35);
        const targetRate = 1.0 + proximity * 0.15 + wakeQuality * 0.28;
        
        const t = this.ctx.currentTime;
        this.jetskiGainNode.gain.setTargetAtTime(targetVol, t, 0.08);
        this.jetskiSource.playbackRate.setTargetAtTime(targetRate, t, 0.08);
        if (this.jetskiPanner) {
          this.jetskiPanner.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, lateralOffset)), t, 0.1);
        }
      }
    } else {
      if (this.jetskiGainNode) {
        this.jetskiGainNode.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
      }
    }
  }

  stopJetski() {
    if (this.jetskiSource) {
      try { this.jetskiSource.stop(); } catch (e) {}
      this.jetskiSource = null;
      this.jetskiGainNode = null;
    }
  }

  // --- Peak Moments: Crowd Reactions (Awe, Cheer, Applause) & Triumphs ---

  playCrowdAwe() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('crowd_awe', { volume: 0.85, rate: 1.0 });
  }

  playCrowdCheer(huge = false) {
    if (!this.ctx || this.isMuted) return;
    const name = huge ? 'crowd_cheer_huge' : 'crowd_cheer';
    this.playSound(name, { volume: huge ? 0.95 : 0.85, rate: 0.98 + Math.random() * 0.04 });
  }

  playCrowd() {
    this.playCrowdCheer(false);
  }

  playCrowdApplause() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('crowd_applause', { volume: 0.80, rate: 1.0 });
  }

  playTrickTriumph(volume = 0.85) {
    if (!this.ctx || this.isMuted) return;
    this.playSound('trick_triumph', { volume, rate: 1.0 });
  }

  playFanfareWin() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('fanfare_win', { volume: 0.95, rate: 1.0 });
  }

  // --- Gameplay SFX ---

  playCarve(strength = 1.0) {
    if (!this.ctx || this.isMuted) return;
    const sound = strength > 0.75 ? 'surf_carve_deep' : 'surf_carve';
    this.playSound(sound, {
      volume: 0.65 * Math.min(1.2, Math.max(0.4, strength)),
      rate: 0.92 + Math.min(0.25, strength * 0.2)
    });
  }

  playJump() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('surf_jump', { volume: 0.82, rate: 1.0 + Math.random() * 0.08 });
  }

  playLanding(clean = true) {
    if (!this.ctx || this.isMuted) return;
    const sound = clean ? 'landing_clean' : 'landing_hard';
    this.playSound(sound, { volume: clean ? 0.75 : 0.88, rate: 0.95 + Math.random() * 0.1 });
  }

  playWipeout(strength = 1.0) {
    if (!this.ctx || this.isMuted) return;
    this.playSound('surf_wipeout', { volume: 0.92 * Math.min(1.2, strength), rate: 0.95 + Math.random() * 0.1 });
  }

  playFruit() {
    this.playCapPickup();
  }

  playIce() {
    this.playCapCatch();
  }

  playCapPickup() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('cap_pickup', { volume: 0.80, rate: 0.98 + Math.random() * 0.06 });
  }

  playCapCatch() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('cap_catch', { volume: 0.85, rate: 1.0 });
  }

  playCap() {
    this.playCapCatch();
  }

  playScratch() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('spill_scratch', { volume: 0.85, rate: 1.0 });
  }

  playSlam() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('landing_hard', { volume: 0.85, rate: 0.9 });
  }

  playRush() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('surf_carve_deep', { volume: 0.9, rate: 1.15 });
  }
}

window.SurfAudio = SurfAudio;
