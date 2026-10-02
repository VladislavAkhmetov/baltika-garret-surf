/**
 * Tony's Garret — Surf Rush
 * Procedural Web Audio Engine & Synthesizer
 */

class SurfAudio {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.bgmPlaying = false;
    this.masterGain = null;
    this.sfxGain = null;
    this.bgmGain = null;
    
    // Ambient wave noise nodes
    this.waveNoiseNode = null;
    this.waveFilter = null;
    this.waveGain = null;
    
    // BGM sequencer timer
    this.bgmTimer = null;
    this.step = 0;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
      
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);
      
      this.initAmbientWave();
    } catch (e) {
      console.warn('Web Audio not supported:', e);
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
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.8, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  // Generate pink/white noise buffer for ocean surf
  createNoiseBuffer(seconds = 3) {
    if (!this.ctx) return null;
    const rate = this.ctx.sampleRate;
    const length = rate * seconds;
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2) * 0.2;
    }
    return buffer;
  }

  initAmbientWave() {
    if (!this.ctx) return;
    const buf = this.createNoiseBuffer(4);
    if (!buf) return;
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    
    this.waveFilter = this.ctx.createBiquadFilter();
    this.waveFilter.type = 'lowpass';
    this.waveFilter.frequency.setValueAtTime(350, this.ctx.currentTime);
    this.waveFilter.Q.setValueAtTime(2.5, this.ctx.currentTime);
    
    this.waveGain = this.ctx.createGain();
    this.waveGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    
    noise.connect(this.waveFilter);
    this.waveFilter.connect(this.waveGain);
    this.waveGain.connect(this.sfxGain);
    
    noise.start();
    this.waveNoiseNode = noise;
  }

  updateWave(speed = 1, isInsideBarrel = false) {
    if (!this.waveFilter || !this.waveGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    const targetFreq = isInsideBarrel ? 1100 : (300 + speed * 250);
    const targetGain = isInsideBarrel ? 0.45 : (0.15 + speed * 0.12);
    
    this.waveFilter.frequency.setTargetAtTime(targetFreq, t, 0.1);
    this.waveGain.gain.setTargetAtTime(targetGain, t, 0.1);
  }

  // SFX: Carving turn whoosh
  playCarve(strength = 1) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120 + strength * 80, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
    
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400 + strength * 200, t);
    filter.Q.setValueAtTime(3, t);
    
    gain.gain.setValueAtTime(0.2 * Math.min(1, strength), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.25);
  }

  // SFX: Collect juicy fruit
  playFruit() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.04);
      
      gain.gain.setValueAtTime(0, t + idx * 0.04);
      gain.gain.linearRampToValueAtTime(0.18, t + idx * 0.04 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.04 + 0.22);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      
      osc.start(t + idx * 0.04);
      osc.stop(t + idx * 0.04 + 0.25);
    });
  }

  // SFX: Collect ice cube (crystalline ring)
  playIce() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, t); // A6
    osc.frequency.setValueAtTime(2349, t + 0.06); // D7
    
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.35);
  }

  // SFX: Enter Barrel / Garret Rush
  playRush() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.4);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(3200, t + 0.4);
    
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.6);
  }

  // SFX: Wipeout / Collision
  playWipeout() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    
    // Sub drop
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.5);
    
    // Noise splash
    const buf = this.createNoiseBuffer(0.5);
    if (buf) {
      const src = this.ctx.createBufferSource();
      const nGain = this.ctx.createGain();
      const flt = this.ctx.createBiquadFilter();
      src.buffer = buf;
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(800, t);
      nGain.gain.setValueAtTime(0.5, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      src.connect(flt);
      flt.connect(nGain);
      nGain.connect(this.sfxGain);
      src.start(t);
    }
  }

  // BGM: Chill Summer Surf Synth Loop
  startBGM() {
    if (this.bgmPlaying || !this.ctx) return;
    this.bgmPlaying = true;
    this.step = 0;
    
    // Bass chord progression: F -> G -> Em -> Am
    const bassline = [
      87.31, 87.31, 0, 87.31,      // F2
      98.00, 98.00, 0, 98.00,      // G2
      82.41, 82.41, 0, 82.41,      // E2
      110.00, 110.00, 123.47, 110.0 // A2, B2
    ];
    
    const chords = [
      [349.23, 440.0, 523.25], // F major
      [392.00, 493.88, 587.33], // G major
      [329.63, 392.00, 493.88], // E minor
      [440.00, 523.25, 659.25]  // A minor
    ];
    
    const interval = 220; // ~136 BPM sixteenths
    
    this.bgmTimer = setInterval(() => {
      if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      const beat = this.step % 16;
      const chordIdx = Math.floor(beat / 4);
      
      // Play bass note
      const bassFreq = bassline[beat];
      if (bassFreq > 0) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const f = this.ctx.createBiquadFilter();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(bassFreq, t);
        f.type = 'lowpass';
        f.frequency.setValueAtTime(260, t);
        
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        
        osc.connect(f);
        f.connect(g);
        g.connect(this.bgmGain);
        
        osc.start(t);
        osc.stop(t + 0.2);
      }
      
      // Play chords on beats 1 and 3 of each bar
      if (beat % 2 === 0) {
        const currentChord = chords[chordIdx];
        currentChord.forEach(freq => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          g.gain.setValueAtTime(0.06, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.connect(g);
          g.connect(this.bgmGain);
          osc.start(t);
          osc.stop(t + 0.3);
        });
      }
      
      this.step++;
    }, interval);
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

window.SurfAudio = SurfAudio;
