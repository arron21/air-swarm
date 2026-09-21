class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.masterFilter = null;
    this.isMuted = true; // Start muted to comply with autoplay policies and let users toggle it
    this.isPlaying = false;
    this.state = 'menu'; // 'menu' | 'explore' | 'combat' | 'ending'
    this.bpm = 100;
    this.isLowpass = false;

    // Sequencer timing
    this.schedulerInterval = null;
    this.nextNoteTime = 0.0;
    this.step = 0;
    this.totalSteps = 0;
    this.lookahead = 25.0; // ms
    this.scheduleAheadTime = 0.1; // seconds

    this.noiseBuffer = null;
    this.toggleBtn = null;
    this.distortionNode = null;
    this.delayNode = null;
    this.delayFeedback = null;
  }

  init() {
    // We bind DOM setup once page is loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupDOM());
    } else {
      this.setupDOM();
    }
  }

  setupDOM() {
    this.toggleBtn = document.getElementById('sound-toggle');
    if (!this.toggleBtn) {
      this.toggleBtn = document.createElement('div');
      this.toggleBtn.id = 'sound-toggle';
      this.toggleBtn.className = 'sound-toggle muted';
      this.toggleBtn.innerHTML = '<span class="icon">🔇</span> <span class="text">SOUND MUTED</span>';
      document.body.appendChild(this.toggleBtn);
    }

    this.toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMute();
    });

    // Auto-resume context on any first real user gesture
    const startAudio = () => {
      if (!this.ctx) {
        this.initContext();
      } else if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      // If user interacted but button is still "muted" state,
      // we keep it muted until they click the button, or unmute on first gesture.
      // Actually, unmuting on first gesture makes the game start playing audio instantly,
      // which is standard for gaming. Let's unmute on first user click of level or button.
      if (this.isMuted) {
        this.toggleMute();
      }
      cleanupListeners();
    };

    const cleanupListeners = () => {
      window.removeEventListener('click', startAudio);
      window.removeEventListener('keydown', startAudio);
      window.removeEventListener('touchstart', startAudio);
    };

    window.addEventListener('click', startAudio);
    window.addEventListener('keydown', startAudio);
    window.addEventListener('touchstart', startAudio);
  }

  initContext() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    } catch (e) {
      console.warn('Web Audio API not supported', e);
      return;
    }

    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.001, this.ctx.currentTime); // start silent, sweep in

    // Master Filter (for downed lowpass effect)
    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.setValueAtTime(20000, this.ctx.currentTime);

    // Sub Gains
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.35, this.ctx.currentTime); // Music background level

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.55, this.ctx.currentTime); // SFX presence

    // Mix Glue Compressor
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
    compressor.knee.setValueAtTime(25, this.ctx.currentTime);
    compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
    compressor.release.setValueAtTime(0.1, this.ctx.currentTime);

    // Connections
    this.musicGain.connect(this.masterFilter);
    this.sfxGain.connect(this.masterFilter);
    this.masterFilter.connect(compressor);
    compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Gritty Cyberpunk Bass Saturation
    this.distortionNode = this.ctx.createWaveShaper();
    this.distortionNode.curve = this.makeDistortionCurve(100);
    this.distortionNode.oversample = '4x';
    this.distortionNode.connect(this.musicGain);

    // Spatial Synth Echo Delay (perfect for arpeggiator cascades)
    this.delayNode = this.ctx.createDelay(1.0);
    this.delayNode.delayTime.setValueAtTime(0.24, this.ctx.currentTime);
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.setValueAtTime(0.42, this.ctx.currentTime);

    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.musicGain);

    // Pre-create White Noise Buffer
    this.noiseBuffer = this.createNoiseBuffer();

    // Start Clock
    this.startSequencer();
  }

  createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  playSweepSFX(startTime) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2000, startTime);
    osc.frequency.exponentialRampToValueAtTime(150, startTime + 1.4);

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(7, startTime);
    filter.frequency.setValueAtTime(4500, startTime);
    filter.frequency.exponentialRampToValueAtTime(250, startTime + 1.4);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.045, startTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(startTime);
    osc.stop(startTime + 1.5);
  }

  toggleMute() {
    if (!this.ctx) {
      this.initContext();
    }
    if (!this.ctx) return;

    this.isMuted = !this.isMuted;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.masterGain) {
      const targetVolume = this.isMuted ? 0.001 : 0.8;
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
      this.masterGain.gain.exponentialRampToValueAtTime(targetVolume, this.ctx.currentTime + 0.15);
    }

    this.updateMuteVisual();
  }

  updateMuteVisual() {
    if (!this.toggleBtn) return;
    const icon = this.isMuted ? '🔇' : '🔊';
    const text = this.isMuted ? 'SOUND MUTED' : 'SOUND ON';
    this.toggleBtn.innerHTML = `<span class="icon">${icon}</span> <span class="text">${text}</span>`;
    this.toggleBtn.className = `sound-toggle ${this.isMuted ? 'muted' : ''}`;
  }

  setMusicState(state) {
    if (this.state === state) return;
    this.state = state;

    if (state === 'menu') {
      this.bpm = 106;
      this.setLowpass(false);
    } else if (state === 'explore') {
      this.bpm = 122;
    } else if (state === 'combat') {
      this.bpm = 136;
    } else if (state === 'ending') {
      this.bpm = 106;
    }

    if (this.ctx && this.delayNode) {
      const beatDuration = 60.0 / this.bpm;
      const dottedEighth = beatDuration * 0.75;
      this.delayNode.delayTime.setValueAtTime(dottedEighth, this.ctx.currentTime);
    }
  }

  setLowpass(isLowpass) {
    if (this.isLowpass === isLowpass) return;
    this.isLowpass = isLowpass;
    if (!this.ctx || !this.masterFilter) return;

    const time = this.ctx.currentTime;
    this.masterFilter.frequency.setValueAtTime(this.masterFilter.frequency.value, time);

    if (isLowpass) {
      // Downed: muffled sound
      this.masterFilter.frequency.exponentialRampToValueAtTime(320, time + 0.6);
      this.playPlayerHit(); // Trigger feedback beep
    } else {
      // Revived: full clear sweep
      this.masterFilter.frequency.exponentialRampToValueAtTime(20000, time + 0.6);
    }
  }

  startSequencer() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.nextNoteTime = this.ctx.currentTime;
    this.step = 0;
    this.totalSteps = 0;

    const scheduler = () => {
      if (!this.isPlaying) return;
      while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
        this.scheduleNote(this.step, this.nextNoteTime);
        this.advanceStep();
      }
      this.schedulerInterval = setTimeout(scheduler, this.lookahead);
    };
    scheduler();
  }

  stopSequencer() {
    this.isPlaying = false;
    if (this.schedulerInterval) {
      clearTimeout(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  advanceStep() {
    const secondsPerBeat = 60.0 / this.bpm;
    const secondsPerStep = secondsPerBeat / 4; // sixteenth note steps
    this.nextNoteTime += secondsPerStep;
    this.step = (this.step + 1) % 16;
  }

  scheduleNote(step, time) {
    if (this.isMuted || this.state === 'ending') return;

    this.totalSteps++;
    const chordIdx = Math.floor(this.totalSteps / 32) % 4;

    // D minor progressions: Dm -> Bb -> C -> Gm
    const chordFrequencies = [
      [146.83, 174.61, 220.00, 293.66], // Dm (D3, F3, A3, D4)
      [116.54, 146.83, 174.61, 233.08], // Bb (Bb2, D3, F3, Bb3)
      [130.81, 164.81, 196.00, 261.63], // C  (C3, E3, G3, C4)
      [98.00, 116.54, 146.83, 196.00],  // Gm (G2, Bb2, D3, G3)
    ][chordIdx];

    const rootFreq = chordFrequencies[0];

    if (this.state === 'menu') {
      // Menu Ambient Mode
      if (step === 0) {
        this.playPadChords(chordFrequencies, time, 4.0);
      }
      if (step === 0 || step === 8) {
        this.playBassNote(rootFreq / 4, time, 1.5, 'triangle', 0.15); // very low triangle drone
      }
    } else if (this.state === 'explore') {
      // Standard Exploration Mode
      if (step === 0) {
        this.playPadChords(chordFrequencies, time, 2.5);
      }

      // 1 & 3 Kick
      if (step === 0 || step === 8) {
        this.playKick(time);
      }

      // 2 & 4 Snare
      if (step === 4 || step === 12) {
        this.playSnare(time);
      }

      // Offbeat hi-hat
      if (step % 4 === 2) {
        this.playHihat(time, false);
      }

      // Cyberpunk gallop bass pattern: steps 0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15
      const isBassStep = [true, false, true, true, true, false, true, true, true, false, true, true, true, false, true, true][step];
      if (isBassStep) {
        const bassFreq = (step % 4 === 2 || step % 4 === 3) ? rootFreq : rootFreq / 2;
        this.playBassNote(bassFreq, time, 0.14, 'sawtooth', 0.08);
      }
    } else if (this.state === 'combat') {
      // Intense Combat Mode
      if (step === 0) {
        this.playPadChords(chordFrequencies, time, 2.5);
      }

      // Trigger industrial transitional sweep every 2 bars
      if (step === 0 && (Math.floor(this.totalSteps / 16) % 2 === 0)) {
        this.playSweepSFX(time);
      }

      // Four-on-the-floor driving kick
      if (step % 4 === 0) {
        this.playKick(time);
      }

      // Strong snare on 2 & 4 + ghost note syncopation
      if (step === 4 || step === 12) {
        this.playSnare(time);
      } else if (step === 10 || step === 14) {
        if (Math.random() > 0.45) this.playSnare(time);
      }

      // Hi-hat groove (sixteenth note offbeats + open accent)
      if (step % 2 === 1) {
        this.playHihat(time, false);
      } else if (step === 14) {
        this.playHihat(time, true);
      }

      // Sixteenth-note aggressive octave-jumping rolling bass
      let bassFreq;
      const octAlt = [0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1][step];
      if (octAlt === 1) {
        bassFreq = rootFreq; // High octave
      } else {
        bassFreq = rootFreq / 2; // Low octave
      }
      if (step === 7) bassFreq = chordFrequencies[1];
      if (step === 15) bassFreq = chordFrequencies[2];

      this.playBassNote(bassFreq, time, 0.08, 'sawtooth', 0.12);

      // Cyberpunk lead arpeggiator (synthesised sixteenth notes connected to delay feed)
      const arpNotes = [
        chordFrequencies[0] * 2,
        chordFrequencies[1] * 2,
        chordFrequencies[2] * 2,
        chordFrequencies[3] * 2,
      ];
      const pattern = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3];
      const arpFreq = arpNotes[pattern[step % pattern.length] % arpNotes.length];
      this.playArpNote(arpFreq, time, 0.085);
    }
  }

  // --- SYNTH INSTRUMENTS ---

  playBassNote(freq, startTime, duration, type = 'sawtooth', volume = 0.1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(3.5, startTime);
    filter.frequency.setValueAtTime(freq * 1.5, startTime);
    filter.frequency.exponentialRampToValueAtTime(freq * 4.2, startTime + 0.02);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.1, startTime + duration * 0.75);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);

    // Route through bass overdrive saturation node if active
    if (this.distortionNode) {
      gain.connect(this.distortionNode);
    } else {
      gain.connect(this.musicGain);
    }

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  playArpNote(freq, startTime, duration) {
    if (!this.ctx) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(freq, startTime);
    osc2.frequency.setValueAtTime(freq * 1.005, startTime); // detuned double oscillator

    filter.type = 'bandpass';
    filter.Q.setValueAtTime(5, startTime);
    filter.frequency.setValueAtTime(freq * 2.8, startTime);
    filter.frequency.exponentialRampToValueAtTime(freq * 6.5, startTime + 0.015);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.5, startTime + duration);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.045, startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);

    // Route clean output
    gain.connect(this.musicGain);

    // Route to spatial echo feedback loop delay node
    if (this.delayNode) {
      gain.connect(this.delayNode);
    }

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration + 0.05);
    osc2.stop(startTime + duration + 0.05);
  }

  playPadChords(freqs, startTime, duration) {
    if (!this.ctx) return;

    freqs.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.detune.setValueAtTime((Math.random() - 0.5) * 18, startTime);

      filter.type = 'lowpass';
      filter.Q.setValueAtTime(0.8, startTime);
      filter.frequency.setValueAtTime(freq * 1.3, startTime);
      filter.frequency.linearRampToValueAtTime(freq * 2.2, startTime + duration * 0.4);
      filter.frequency.linearRampToValueAtTime(freq * 1.3, startTime + duration);

      // Long sweep attack envelope
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.03, startTime + 1.2);
      gain.gain.setValueAtTime(0.03, startTime + duration - 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      // Cyberpunk Sidechain Ducking effect (duck volume on beats 1, 2, 3, 4)
      const beatLen = 60.0 / this.bpm;
      const numBeats = Math.floor(duration / beatLen);
      for (let i = 0; i <= numBeats; i++) {
        const beatTime = startTime + i * beatLen;
        if (beatTime < startTime + duration - 0.2) {
          gain.gain.setValueAtTime(0.03, beatTime);
          gain.gain.linearRampToValueAtTime(0.005, beatTime + 0.04); // duck volume
          gain.gain.exponentialRampToValueAtTime(0.03, beatTime + 0.16); // sweep back up
        }
      }

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });
  }

  playKick(startTime) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, startTime);
    osc.frequency.exponentialRampToValueAtTime(42, startTime + 0.08);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.45, startTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(startTime);
    osc.stop(startTime + 0.18);
  }

  playSnare(startTime) {
    if (!this.ctx || !this.noiseBuffer) return;

    // Noise component
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1200, startTime);
    noiseFilter.Q.setValueAtTime(1.8, startTime);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, startTime);
    noiseGain.gain.linearRampToValueAtTime(0.12, startTime + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);

    // Fundamental drum body hit
    const bodyOsc = this.ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(180, startTime);
    bodyOsc.frequency.exponentialRampToValueAtTime(90, startTime + 0.06);

    const bodyGain = this.ctx.createGain();
    bodyGain.gain.setValueAtTime(0, startTime);
    bodyGain.gain.linearRampToValueAtTime(0.14, startTime + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.musicGain);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.musicGain);

    noise.start(startTime);
    bodyOsc.start(startTime);

    noise.stop(startTime + 0.22);
    bodyOsc.stop(startTime + 0.22);
  }

  playHihat(startTime, isOpen = false) {
    if (!this.ctx || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, startTime);

    const gain = this.ctx.createGain();
    const decay = isOpen ? 0.11 : 0.035;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.045, startTime + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + decay);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    noise.start(startTime);
    noise.stop(startTime + decay + 0.02);
  }

  // --- SOUND EFFECTS (SFX) SYNTHESIS ---

  playSFX(type, option) {
    if (!this.ctx || this.isMuted) return;

    if (type === 'shoot') {
      this.playShoot(option);
    } else if (type === 'enemyShot') {
      this.playEnemyShot();
    } else if (type === 'enemySpawn') {
      this.playEnemySpawn();
    } else if (type === 'enemyHit') {
      this.playEnemyHit();
    } else if (type === 'enemyDeath') {
      this.playEnemyDeath();
    } else if (type === 'playerHit') {
      this.playPlayerHit();
    } else if (type === 'doorHit') {
      this.playDoorHit();
    } else if (type === 'doorUnlocked') {
      this.playDoorUnlocked();
    } else if (type === 'explosion') {
      this.playExplosion();
    } else if (type === 'ability') {
      this.playAbility(option);
    }
  }

  playShoot(cls) {
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    const noise = this.ctx.createBufferSource();
    const noiseFilter = this.ctx.createBiquadFilter();
    const noiseGain = this.ctx.createGain();

    noise.buffer = this.noiseBuffer;
    noiseFilter.type = 'bandpass';

    let duration = 0.08;
    let oscVol = 0.14;
    let noiseVol = 0.08;
    let oscType = 'triangle';
    let startFreq = 420;
    let endFreq = 70;

    if (cls === 'engineer') {
      // Volt Carbine: electrical buzz laser
      oscType = 'sawtooth';
      startFreq = 880;
      endFreq = 220;
      duration = 0.06;
      oscVol = 0.09;
      noiseVol = 0.04;
      noiseFilter.frequency.setValueAtTime(2800, this.ctx.currentTime);
    } else if (cls === 'heavy') {
      // Heavy Repeater: deep impact thud
      oscType = 'sawtooth';
      startFreq = 220;
      endFreq = 48;
      duration = 0.12;
      oscVol = 0.18;
      noiseVol = 0.16;
      noiseFilter.frequency.setValueAtTime(550, this.ctx.currentTime);
    } else if (cls === 'medic') {
      // Needler Carbine: sharp click laser
      oscType = 'sine';
      startFreq = 1500;
      endFreq = 620;
      duration = 0.04;
      oscVol = 0.07;
      noiseVol = 0.02;
      noiseFilter.frequency.setValueAtTime(5500, this.ctx.currentTime);
    } else {
      // Marine Assault Rifle
      noiseFilter.frequency.setValueAtTime(1100, this.ctx.currentTime);
    }

    // Oscillator
    osc.type = oscType;
    osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);

    oscGain.gain.setValueAtTime(0, this.ctx.currentTime);
    oscGain.gain.linearRampToValueAtTime(oscVol, this.ctx.currentTime + 0.002);
    oscGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    // Noise
    noiseGain.gain.setValueAtTime(0, this.ctx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(noiseVol, this.ctx.currentTime + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    osc.start();
    noise.start();

    osc.stop(this.ctx.currentTime + duration + 0.02);
    noise.stop(this.ctx.currentTime + duration + 0.02);
  }

  playEnemyShot() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.1);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(550, this.ctx.currentTime);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playEnemySpawn() {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(75, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(280, this.ctx.currentTime + 0.28);

    filter.type = 'peaking';
    filter.Q.setValueAtTime(6, this.ctx.currentTime);
    filter.frequency.setValueAtTime(75, this.ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(280, this.ctx.currentTime + 0.28);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.07, this.ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.32);
  }

  playEnemyHit() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(750, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.035);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start();
    noise.stop(this.ctx.currentTime + 0.04);
  }

  playEnemyDeath() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start();
    noise.stop(this.ctx.currentTime + 0.2);
  }

  playPlayerHit() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.setValueAtTime(90, this.ctx.currentTime + 0.04);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, this.ctx.currentTime);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playDoorHit() {
    const freqs = [350, 520, 890, 1150];
    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(idx === 0 ? 0.12 : 0.04, this.ctx.currentTime + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (idx === 0 ? 0.25 : 0.12));

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    });
  }

  playDoorUnlocked() {
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 major chord arpeggio
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const time = this.ctx.currentTime + idx * 0.08;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.06, time + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(time);
      osc.stop(time + 0.22);
    });
  }

  playExplosion() {
    // Sub-bass thump
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();

    sub.type = 'sine';
    sub.frequency.setValueAtTime(100, this.ctx.currentTime);
    sub.frequency.exponentialRampToValueAtTime(28, this.ctx.currentTime + 0.22);

    subGain.gain.setValueAtTime(0, this.ctx.currentTime);
    subGain.gain.linearRampToValueAtTime(0.45, this.ctx.currentTime + 0.008);
    subGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.26);

    // Rumble Noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(45, this.ctx.currentTime + 0.95);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, this.ctx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0.35, this.ctx.currentTime + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.1);

    sub.connect(subGain);
    subGain.connect(this.sfxGain);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    sub.start();
    noise.start();

    sub.stop(this.ctx.currentTime + 0.3);
    noise.stop(this.ctx.currentTime + 1.2);
  }

  playAbility(kind) {
    if (kind === 'shotgunBlast') {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      const noise = this.ctx.createBufferSource();
      const noiseGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, this.ctx.currentTime + 0.18);

      oscGain.gain.setValueAtTime(0, this.ctx.currentTime);
      oscGain.gain.linearRampToValueAtTime(0.28, this.ctx.currentTime + 0.004);
      oscGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

      noise.buffer = this.noiseBuffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, this.ctx.currentTime);

      noiseGain.gain.setValueAtTime(0, this.ctx.currentTime);
      noiseGain.gain.linearRampToValueAtTime(0.32, this.ctx.currentTime + 0.004);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);

      osc.start();
      noise.start();

      osc.stop(this.ctx.currentTime + 0.25);
      noise.stop(this.ctx.currentTime + 0.25);
    } else {
      // Ascending tech chime arpeggio
      const baseFreq = 587.33; // D5
      const freqs = [baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2.0];
      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const time = this.ctx.currentTime + idx * 0.055;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.08, time + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(time);
        osc.stop(time + 0.15);
      });
    }
  }

  // --- STINGER THEMES ---

  playDefeatTheme() {
    this.setMusicState('ending');
    if (!this.ctx || this.isMuted) return;

    const freqs = [73.42, 110.00, 146.83, 174.61]; // D2, A2, D3, F3
    const startTime = this.ctx.currentTime;

    freqs.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.linearRampToValueAtTime(freq * 0.72, startTime + 2.2);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 1.8, startTime);
      filter.frequency.exponentialRampToValueAtTime(25, startTime + 2.2);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 2.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(startTime);
      osc.stop(startTime + 2.8);
    });
  }

  playVictoryTheme() {
    this.setMusicState('ending');
    if (!this.ctx || this.isMuted) return;

    const startTime = this.ctx.currentTime;
    // Triumphant progression in D major: D major -> G major -> A major
    const chords = [
      [146.83, 185.00, 220.00, 293.66], // D major (D3, F#3, A3, D4)
      [196.00, 246.94, 293.66, 392.00], // G major (G3, B3, D4, G4)
      [220.00, 277.18, 329.63, 440.00], // A major (A3, C#4, E4, A4)
    ];

    chords.forEach((freqs, chordIdx) => {
      const chordTime = startTime + chordIdx * 0.55;
      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const noteTime = chordTime + idx * 0.045; // slight arpeggiation sweep

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, noteTime);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 3.5, noteTime);

        gain.gain.setValueAtTime(0, noteTime);
        gain.gain.linearRampToValueAtTime(0.08, noteTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.48);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(noteTime);
        osc.stop(noteTime + 0.55);
      });
    });
  }
}

export const audio = new AudioManager();
