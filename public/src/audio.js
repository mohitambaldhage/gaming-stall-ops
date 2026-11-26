const MUTE_KEY = 'stall_sound_muted_v1';

export class ChimeController {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.alertedKeys = new Set();
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  unlock() {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  isMuted() {
    return this.muted;
  }

  setMuted(next) {
    this.muted = Boolean(next);
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Ignore storage failures
    }
    return this.muted;
  }

  playOvertimeChime({ force = false } = {}) {
    if (this.muted && !force) return false;
    if (typeof window === 'undefined') return false;
    this.unlock();
    if (!this.ctx) return false;

    const scheduleNotes = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const freqs = [880, 1174.66, 1567.98];
      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);
        gain.gain.setValueAtTime(0.001, now + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.34);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.36);
      });
    };

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(scheduleNotes).catch(() => {});
    } else {
      scheduleNotes();
    }

    if (!force && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([180, 90, 180]);
      } catch {
        // Ignore blocked vibrate
      }
    }
    return true;
  }

  seedInitialOvertime(sessions, nowMs) {
    for (const s of sessions) {
      if (s.status === 'active' && s.endsAt <= nowMs) {
        this.alertedKeys.add(`${s.id}:${s.blocksCount}`);
      }
    }
  }

  checkSessions(sessions, nowMs, onAlert) {
    for (const s of sessions) {
      if (s.status !== 'active') continue;
      const key = `${s.id}:${s.blocksCount}`;
      if (s.endsAt <= nowMs && !this.alertedKeys.has(key)) {
        this.alertedKeys.add(key);
        this.playOvertimeChime();
        if (onAlert) onAlert(s);
      }
    }
  }
}
