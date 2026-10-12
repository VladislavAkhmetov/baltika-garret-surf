/**
 * Tony's Garret — Surf Rush
 * Recorded ocean and splashes, with continuous board wash and flight wind.
 * Short crowd reactions belong to tricks; water stays in front of the music.
 */

class SurfAudio {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    try { this.isMuted = localStorage.getItem('garret-paper-muted') === 'true'; } catch (_) {}
    this.bgmPlaying = false;
    this.masterGain = null;
    this.sfxGain = null;
    this.ambientGain = null;
    this.bgmGain = null;
    this.crowdGain = null;
    this.rideActive = false;
    this.oneShots = new Set();
    this.soundTimes = new Map();
    this.crowdVoice = null;
    this.crowdTimes = new Map();
    this.musicDuckUntil = 0;
    this.ready = Promise.resolve();
    
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
    this.boardGain = null;
    this.boardFilter = null;
    this.windGain = null;
    
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
      this.sfxGain.gain.setValueAtTime(0.94, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
      
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);
      
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);

      this.crowdGain = this.ctx.createGain();
      this.crowdGain.gain.setValueAtTime(0.55, this.ctx.currentTime);
      this.crowdGain.connect(this.masterGain);
      
      this.ready = this.preloadAll();
      this.initAmbientWave();
      this.initWaterMotion();
      this.initGestureResume();
    } catch (e) {
      console.warn('[SurfAudio] Web Audio initialization notice:', e);
    }
  }

  initGestureResume() {
    if (this._gestureBound || typeof window === 'undefined') return;
    this._gestureBound = true;
    const resume = () => {
      if (this.ctx && this.ctx.state === 'suspended' && !this.isMuted) {
        this.ctx.resume().catch(() => {});
      }
      if (this.bgmPlaying && this.bgmAudio && this.bgmAudio.paused && !this.isMuted) {
        this.bgmAudio.play().catch(() => {});
      }
    };
    ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => {
      window.addEventListener(evt, resume, {passive: true});
    });
  }

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.isMuted && this.bgmPlaying && this.bgmAudio && this.bgmAudio.paused) {
      this.bgmAudio.play().catch(() => {});
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    try { localStorage.setItem('garret-paper-muted', String(this.isMuted)); } catch (_) {}
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);
    }
    if (this.bgmAudio) {
      this.bgmAudio.muted = this.isMuted;
    }
    if (this.isMuted) this.stopOneShots();
    // A race can start muted before the music element has ever been created.
    if (!this.isMuted && this.bgmPlaying) this.startBGM();
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
    if (this.isPreloaded || !this.ctx) return this.ready;
    this.isPreloaded = true;
    return Promise.all(Object.keys(this.manifest).map(name => this.loadBuffer(name)));
  }

  playSound(name, {
    volume = 1.0,
    rate = 1.0,
    detune = 0,
    loop = false,
    pan = 0,
    filterFreq = null,
    output = this.sfxGain,
    duration = null,
    fadeIn = 0.005,
    fadeOut = 0.05,
    cooldown = 0
  } = {}) {
    if (!this.ctx || this.isMuted) return null;
    const t = this.ctx.currentTime;
    if (t - (this.soundTimes.get(name) ?? -Infinity) < cooldown) return null;
    const buf = this.buffers[name];
    if (!buf) {
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
      const length = Math.min(duration ?? Infinity, buf.duration / rate);
      gainNode.gain.setValueAtTime(loop ? volume : 0, t);
      if (!loop) {
        gainNode.gain.linearRampToValueAtTime(volume, t + Math.min(fadeIn, length / 3));
        gainNode.gain.setValueAtTime(volume, t + Math.max(length / 3, length - fadeOut));
        gainNode.gain.linearRampToValueAtTime(0, t + length);
      }
      
      let lastNode = src;
      const nodes = [src, gainNode];
      let filter = null;
      if (filterFreq !== null) {
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
        lastNode.connect(flt);
        lastNode = flt;
        filter = flt;
        nodes.push(flt);
      }
      
      lastNode.connect(gainNode);
      
      if (pan !== 0 && this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-0.95, Math.min(0.95, pan)), this.ctx.currentTime);
        gainNode.connect(panner);
        panner.connect(output);
        nodes.push(panner);
      } else {
        gainNode.connect(output);
      }
      
      src.start(this.ctx.currentTime);
      if (!loop) src.stop(t + length);
      this.soundTimes.set(name, t);
      return this.trackSource(src, nodes, {gain: gainNode, filter, endsAt: t + length});
    } catch (e) {
      console.warn(`[SurfAudio] playSound error (${name}):`, e);
      return null;
    }
  }

  trackSource(source, nodes, properties = {}) {
    const voice = {source, ...properties};
    this.oneShots.add(voice);
    source.onended = () => {
      nodes.forEach(node => node.disconnect());
      this.oneShots.delete(voice);
      if (this.crowdVoice === voice) this.crowdVoice = null;
    };
    return voice;
  }

  stopOneShots() {
    for (const voice of this.oneShots) {
      try { voice.source.stop(); } catch (_) {}
    }
    this.oneShots.clear();
    this.crowdVoice = null;
  }

  resetRide() {
    this.stopOneShots();
    this.stopJetski();
    this.stopRivalMusic();
    this.soundTimes.clear();
    this.crowdTimes.clear();
    this.musicDuckUntil = this.seagullTimer = 0;
    this.nextSeagullTime = 6 + Math.random() * 8;
    if (this.ctx && this.bgmGain) {
      this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.bgmGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.boardGain?.gain.setValueAtTime(0, this.ctx.currentTime);
      this.windGain?.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  duckMusic(seconds = 0.45) {
    if (!this.ctx || !this.bgmGain) return;
    this.musicDuckUntil = Math.max(this.musicDuckUntil, this.ctx.currentTime + seconds);
    this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bgmGain.gain.setTargetAtTime(0.20, this.ctx.currentTime, 0.025);
    this.bgmGain.gain.setTargetAtTime(0.35, this.musicDuckUntil, 0.18);
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
    this.rideActive = true;
    if (this.ambientGain) this.ambientGain.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.12);
    if (this.isMuted) return;
    
    if (!this.bgmAudio) {
      this.bgmAudio = new Audio(this.basePath + 'bgm_surf_rock.mp3');
      this.bgmAudio.loop = true;
      this.bgmAudio.muted = this.isMuted;
      this.bgmAudio.volume = 0.35;
      
      try {
        if (this.ctx && !this.bgmMediaNode) {
          this.bgmMediaNode = this.ctx.createMediaElementSource(this.bgmAudio);
          this.bgmMediaNode.connect(this.bgmGain);
          this.bgmAudio.volume = 1.0;
        }
      } catch (e) {
        this.bgmAudio.volume = 0.35;
      }
    }
    
    if (this.bgmAudio) {
      this.bgmAudio.muted = this.isMuted;
      const playPromise = this.bgmAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          // Autoplay policy waiting for user interaction
        });
      }
    }
  }

  stopBGM() {
    this.bgmPlaying = false;
    this.rideActive = false;
    this.stopOneShots();
    this.stopJetski();
    if (this.ambientGain) this.ambientGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    this.stopRivalMusic();
    if (this.bgmAudio) {
      this.bgmAudio.pause();
    }
  }

  // --- Ocean Surf Ambience ---

  initAmbientWave() {
    if (!this.ctx) return;
    
    this.waveFilter = this.ctx.createBiquadFilter();
    this.waveFilter.type = 'lowpass';
    this.waveFilter.frequency.setValueAtTime(3200, this.ctx.currentTime);
    this.waveFilter.Q.setValueAtTime(0.4, this.ctx.currentTime);
    
    this.waveGain = this.ctx.createGain();
    this.waveGain.gain.setValueAtTime(0.62, this.ctx.currentTime);
    
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

  initWaterMotion() {
    const ctx = this.ctx;
    if (!ctx) return;
    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * 0.65;
    this.buffers.water_motion = noise;
    const source = ctx.createBufferSource();
    source.buffer = noise;source.loop = true;
    const highpass = ctx.createBiquadFilter();highpass.type = 'highpass';highpass.frequency.value = 240;
    this.boardFilter = ctx.createBiquadFilter();this.boardFilter.type = 'lowpass';this.boardFilter.frequency.value = 2600;this.boardFilter.Q.value = 0.45;
    this.boardGain = ctx.createGain();this.boardGain.gain.value = 0;
    source.connect(highpass);highpass.connect(this.boardFilter);this.boardFilter.connect(this.boardGain);this.boardGain.connect(this.ambientGain);
    const wind = ctx.createBiquadFilter();wind.type = 'bandpass';wind.frequency.value = 950;wind.Q.value = 0.5;
    this.windGain = ctx.createGain();this.windGain.gain.value = 0;
    source.connect(wind);wind.connect(this.windGain);this.windGain.connect(this.ambientGain);
    source.start();
    this.waterMotionSource = source;
  }

  updateWave(speed = 1, isInsideBarrel = false, foamPressure = 0, energy = 0) {
    if (!this.waveFilter || !this.waveGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    const pressure = Math.max(0, Math.min(1, foamPressure));
    const swell = Math.max(0, Math.min(1, energy));
    const targetFreq = isInsideBarrel ? 1500 : (2600 + Math.min(1.5, speed) * 900 + swell * 1200 - pressure * 700);
    const targetGain = isInsideBarrel ? 0.88 : (0.56 + swell * 0.22 + pressure * 0.18);
    
    this.waveFilter.frequency.setTargetAtTime(targetFreq, t, 0.12);
    this.waveGain.gain.setTargetAtTime(targetGain, t, 0.12);
  }

  updateRide({speed = 0, lean = 0, energy = 0, airborne = false, fallen = false, foamPressure = 0} = {}) {
    if (!this.ctx || !this.rideActive) return;
    const t = this.ctx.currentTime, pace = Math.max(0, Math.min(1.5, speed / 32));
    const turn = Math.min(1, Math.abs(lean)), swell = Math.max(0, Math.min(1, energy));
    this.updateWave(pace, fallen, foamPressure, swell);
    // Board wash drops away at takeoff; the distant sea remains audible in flight.
    const ripple = 0.92 + Math.sin(t * 2.4) * 0.05 + Math.sin(t * 5.7) * 0.03;
    this.boardGain.gain.setTargetAtTime(airborne || fallen ? 0 : (0.07 + pace * 0.10 + turn * 0.16 + swell * 0.07) * ripple, t, 0.055);
    this.boardFilter.frequency.setTargetAtTime(1700 + pace * 1600 + turn * 1800, t, 0.10);
    this.windGain.gain.setTargetAtTime(airborne ? 0.08 + pace * 0.06 : 0, t, 0.10);
  }

  // Periodic ambient natural elements (seagulls calling in sea breeze)
  updateAmbient(dt = 0.016) {
    if (!this.ctx || this.isMuted || !this.rideActive) return;
    this.seagullTimer += dt;
    if (this.seagullTimer >= this.nextSeagullTime) {
      this.seagullTimer = 0;
      this.nextSeagullTime = 7 + Math.random() * 10;
      this.playSeagull();
    }
  }

  updateRivalMusic(dt,distance,pan){
    if(!this.ctx||this.isMuted||!this.bgmPlaying||distance>=42){this.stopRivalMusic();return;}
    if(!this.rivalMusicGain){
      this.rivalMusicGain=this.ctx.createGain();this.rivalMusicGain.gain.value=0;
      this.rivalMusicPan=this.ctx.createStereoPanner();this.rivalMusicGain.connect(this.rivalMusicPan);this.rivalMusicPan.connect(this.masterGain);
    }
    const t=this.ctx.currentTime,volume=.17*(1-distance/42)**2;
    this.rivalMusicGain.gain.setTargetAtTime(volume,t,.08);this.rivalMusicPan.pan.setTargetAtTime(Math.max(-1,Math.min(1,pan)),t,.08);
    this.rivalMusicClock=(this.rivalMusicClock||0)-dt;
    if(this.rivalMusicClock>0)return;
    this.rivalMusicClock=.24;this.rivalMusicBeat=(this.rivalMusicBeat||0)+1;
    // Original short syncopated beach riff, heard only near Diego's speaker.
    const notes=[220,0,261.63,329.63,293.66,0,261.63,196],frequency=notes[this.rivalMusicBeat%notes.length];
    if(!frequency)return;
    const osc=this.ctx.createOscillator(),envelope=this.ctx.createGain();osc.type='triangle';osc.frequency.value=frequency;
    envelope.gain.setValueAtTime(.001,t);envelope.gain.exponentialRampToValueAtTime(.8,t+.012);envelope.gain.exponentialRampToValueAtTime(.001,t+.18);
    osc.connect(envelope);envelope.connect(this.rivalMusicGain);osc.start(t);osc.stop(t+.19);
    osc.onended=()=>{osc.disconnect();envelope.disconnect();};
  }
  stopRivalMusic(){
    if(this.rivalMusicGain&&this.ctx){this.rivalMusicGain.gain.cancelScheduledValues(this.ctx.currentTime);this.rivalMusicGain.gain.setValueAtTime(0,this.ctx.currentTime);}
    this.rivalMusicClock=0;
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
          const nodes = [src, this.jetskiGainNode, this.jetskiPanner].filter(Boolean);
          src.onended = () => nodes.forEach(node => node.disconnect());
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
      this.jetskiPanner = null;
    }
  }

  // --- A single short crowd voice per reaction; applause can follow a gasp. ---

  playCrowdReaction(name, {volume, duration, cooldown}) {
    if (!this.ctx || this.isMuted) return null;
    const t = this.ctx.currentTime;
    if (t - (this.crowdTimes.get(name) ?? -Infinity) < cooldown) return null;
    // A landing replaces the flight gasp, so spectators never stack over the splash.
    if (this.crowdVoice && this.crowdVoice.endsAt > t) {
      if (name === 'crowd_awe') return null;
      const previous = this.crowdVoice;
      previous.gain.gain.cancelScheduledValues(t);
      previous.gain.gain.setTargetAtTime(0, t, 0.025);
      previous.source.stop(t + 0.10);
    }
    const voice = this.playSound(name, {volume, duration, output:this.crowdGain, fadeIn:0.035, fadeOut:0.35, filterFreq:5200});
    if (voice) {
      this.crowdVoice = voice;
      this.crowdTimes.set(name, t);
    }
    return voice;
  }

  playCrowdAwe() {
    return this.playCrowdReaction('crowd_awe', {volume:0.42, duration:1.35, cooldown:3.5});
  }

  playCrowdCheer(huge = false) {
    return this.playCrowdApplause(huge);
  }

  playCrowd() {
    this.playCrowdCheer(false);
  }

  playCrowdApplause(special = false) {
    return this.playCrowdReaction('crowd_applause', {volume:special ? 0.50 : 0.38, duration:special ? 2.1 : 1.6, cooldown:3.5});
  }

  playTrickTriumph(volume = 0.85) {
    if (!this.ctx || this.isMuted) return;
    this.playSound('trick_triumph', { volume, rate: 1.0 });
  }

  playFanfareWin() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('fanfare_win', { volume: 0.55, rate: 1.0 });
  }

  // --- Gameplay SFX ---

  playCarve(strength = 1.0) {
    if (!this.ctx || this.isMuted) return;
    const sound = strength > 0.75 ? 'surf_carve_deep' : 'surf_carve';
    this.playSound(sound, {
      volume: 0.80 * Math.min(1.1, Math.max(0.4, strength)),
      rate: 0.92 + Math.min(0.25, strength * 0.2),
      cooldown:0.4
    });
  }

  playJump(strength = .5) {
    if (!this.ctx || this.isMuted) return;
    strength = Math.max(0, Math.min(1, strength));
    this.duckMusic(0.35);
    this.playSound('surf_jump', { volume: 0.95+strength*0.18, rate: 1.05-strength*0.16, cooldown:0.15 });
    this.playSound('water_motion', {volume:0.12+strength*0.08, duration:0.24, filterFreq:3200, fadeOut:0.20});
  }

  playSpin(direction = 1) {
    const voice = this.playSound('water_motion', {volume:0.22, duration:0.32, filterFreq:4200, fadeIn:0.035, fadeOut:0.24, pan:direction*0.3});
    if (voice?.filter) voice.filter.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime+0.30);
  }

  playLanding(clean = true, strength = .5) {
    if (!this.ctx || this.isMuted) return;
    strength = Math.max(0, Math.min(1, strength));
    const sound = clean ? 'landing_clean' : 'landing_hard';
    this.duckMusic(0.55);
    this.playSound(sound, { volume: 0.88+strength*0.28, rate: 1.02-strength*0.20, cooldown:0.15 });
    this.playWaterPlop(strength, clean);
  }

  playWaterPlop(strength, clean) {
    const t = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(clean ? 190 : 145, t);
    osc.frequency.exponentialRampToValueAtTime(48, t+0.18);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.20+strength*0.20, t+0.009);
    gain.gain.exponentialRampToValueAtTime(0.001, t+0.22);
    osc.connect(gain);gain.connect(this.sfxGain);osc.start(t);osc.stop(t+0.23);
    this.trackSource(osc, [osc, gain]);
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
    this.playSound('spill_scratch', { volume: 0.32, rate: 1.0, cooldown:0.65 });
  }

  playSlam() {
    if (!this.ctx || this.isMuted) return;
    this.playLanding(false, 0.7);
  }

  playRush() {
    if (!this.ctx || this.isMuted) return;
    this.playSound('surf_carve_deep', { volume: 0.9, rate: 1.15 });
  }
}

window.SurfAudio = SurfAudio;
