export const AUDIO_EFFECTS = [
  "None",
  "Chorus",
  "Distortion",
  "Vibrato",
];

export function applyAudioEffectNode(audioContext, sourceNode, effectName) {
  // Lightweight stub implementations:
  // - Chorus: simple delay + LFO modulating a DelayNode's delayTime
  // - Distortion: waveshaper
  // - Vibrato: very small delay modulation
  // Returns an object with { outNode, teardown } so callers can connect outNode -> destination
  if (!audioContext || !sourceNode) return { outNode: sourceNode, teardown: () => {} };

  let out = sourceNode;
  let teardown = () => {};

  if (effectName === "Chorus") {
    const delay = audioContext.createDelay();
    delay.delayTime.value = 0.03;
    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();
    lfo.frequency.value = 0.8;
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    sourceNode.connect(delay);
    const mix = audioContext.createGain();
    mix.gain.value = 0.5;
    sourceNode.connect(mix);
    delay.connect(mix);
    out = mix;
    lfo.start();
    teardown = () => { try { lfo.stop(); } catch {} };
  } else if (effectName === "Distortion") {
    const wave = audioContext.createWaveShaper();
    const k = 350;
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; ++i) {
      const x = (i * 2) / n - 1;
      curve[i] = ((k + 1) * x) / (1 + k * Math.abs(x));
    }
    wave.curve = curve;
    wave.oversample = "4x";
    sourceNode.connect(wave);
    out = wave;
    teardown = () => {};
  } else if (effectName === "Vibrato") {
    const delay = audioContext.createDelay();
    delay.delayTime.value = 0.005;
    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();
    lfo.frequency.value = 5;
    lfoGain.gain.value = 0.003;
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    sourceNode.connect(delay);
    const mix = audioContext.createGain();
    mix.gain.value = 1.0;
    delay.connect(mix);
    out = mix;
    lfo.start();
    teardown = () => { try { lfo.stop(); } catch {} };
  }

  return { outNode: out, teardown };
}

export function clearAppliedAudioEffect(effectHandle) {
  // effectHandle is expected to contain teardown function; call it if present
  try {
    if (effectHandle && typeof effectHandle.teardown === "function") effectHandle.teardown();
  } catch (e) {}
}