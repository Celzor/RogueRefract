/** Opt-in local microphone loudness meter. Audio never reaches speakers or a recorder. */
export class VoiceMeter {
  constructor({ onLevel = () => {}, onError = () => {} } = {}) {
    this.onLevel = onLevel;
    this.onError = onError;
    this._level = 0;
    this._enabled = false;
    this._destroyed = false;
    this._generation = 0;
    this._pending = null;
    this._context = null;
    this._stream = null;
    this._source = null;
    this._analyser = null;
    this._timer = null;
  }

  get level() { return this._level; }
  get enabled() { return this._enabled; }

  /** Call from an explicit microphone button. Returns false if unavailable or denied. */
  start() {
    if (this._destroyed) return Promise.resolve(false);
    if (this._enabled) return Promise.resolve(true);
    if (this._pending) return this._pending;
    const generation = ++this._generation;
    const pending = this._start(generation);
    this._pending = pending;
    pending.finally(() => {
      if (this._pending === pending) this._pending = null;
    });
    return pending;
  }

  async _start(generation) {
    const media = globalThis.navigator?.mediaDevices;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (globalThis.isSecureContext === false) {
      return this._fail('Microphone access needs HTTPS or localhost. You can still play without it.');
    }
    if (!media?.getUserMedia || !Context) {
      return this._fail('This browser does not support microphone metering. You can still play without it.');
    }
    const policy = globalThis.document?.permissionsPolicy || globalThis.document?.featurePolicy;
    if (policy?.allowsFeature && !policy.allowsFeature('microphone')) {
      return this._fail('Microphone access is blocked by this activity frame. Open the game in a browser tab or enable microphone access for activities.');
    }
    let context;
    let stream;
    try {
      // Create/resume in the click's activation before waiting for the permission prompt.
      context = new Context();
      this._context = context;
      const resumed = context.state === 'suspended' ? context.resume().catch(() => {}) : Promise.resolve();
      stream = await media.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (generation !== this._generation || this._destroyed) {
        stream.getTracks().forEach((track) => track.stop());
        if (context.state !== 'closed') context.close().catch(() => {});
        return false;
      }
      this._stream = stream;
      await resumed;
      if (generation !== this._generation || this._destroyed) return false;
      if (context.state !== 'running') throw new Error('audio-suspended');
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      // Deliberately no connection to destination: no feedback or microphone playback.
      this._source = source;
      this._analyser = analyser;
      this._enabled = true;
      this._level = 0;
      this.onLevel(0);
      const samples = new Float32Array(analyser.fftSize);
      this._timer = globalThis.setInterval(() => {
        if (!this._enabled || generation !== this._generation) return;
        analyser.getFloatTimeDomainData(samples);
        let squareSum = 0;
        for (let i = 0; i < samples.length; i++) squareSum += samples[i] * samples[i];
        const rms = Math.sqrt(squareSum / samples.length);
        const target = Math.pow(Math.max(0, Math.min(1, (rms - 0.006) / 0.075)), 0.7);
        const smoothing = target > this._level ? 0.6 : 0.3;
        this._level += (target - this._level) * smoothing;
        if (this._level < 0.003) this._level = 0;
        this.onLevel(this._level);
      }, 100);
      for (const track of stream.getAudioTracks()) {
        track.addEventListener?.('ended', () => {
          if (generation === this._generation && this._enabled) {
            this.stop();
            this.onError('The microphone disconnected. Enable it again to reconnect.');
          }
        }, { once: true });
      }
      return true;
    } catch (error) {
      if (generation !== this._generation || this._destroyed) {
        stream?.getTracks().forEach((track) => track.stop());
        if (context?.state !== 'closed') context?.close().catch(() => {});
        return false;
      }
      this.stop();
      const name = error?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        return this._fail('Microphone access was not allowed. Check your browser or activity microphone permissions and try again.');
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return this._fail('No microphone was found. Connect one and try again.');
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        return this._fail('The microphone is unavailable or being used by another app. Try enabling it again.');
      }
      return this._fail('The microphone could not start. Try enabling it again, or continue playing without it.');
    }
  }

  _fail(message) {
    this.onError(message);
    return false;
  }

  /** Also invalidates a permission request that is still pending. */
  stop() {
    ++this._generation;
    this._pending = null;
    this._enabled = false;
    this._level = 0;
    if (this._timer !== null) globalThis.clearInterval(this._timer);
    this._timer = null;
    this._source?.disconnect();
    this._analyser?.disconnect();
    this._stream?.getTracks().forEach((track) => track.stop());
    if (this._context && this._context.state !== 'closed') this._context.close().catch(() => {});
    this._stream = null;
    this._source = null;
    this._analyser = null;
    this._context = null;
    this.onLevel(0);
  }

  destroy() {
    this.stop();
    this._destroyed = true;
  }
}
