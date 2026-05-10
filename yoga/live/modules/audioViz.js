/**
 * modules/audioViz.js — Microphone audio level visualizer.
 *
 * Uses getUserMedia + AudioContext analyser to animate the 5 LED-blue bars
 * in the center panel. Purely visual — does not record or process audio content.
 */

/**
 * Create a new visualizer instance bound to the given bar elements.
 *
 * @param {NodeList|HTMLElement[]} barEls  The .audio-bar DOM elements
 * @returns {{ start: Function, stop: Function }}
 */
export function createAudioViz(barEls) {
  let audioContext  = null;
  let analyser      = null;
  let microphone    = null;
  let dataArray     = null;
  let animationId   = null;
  let running       = false;

  function animate() {
    if (!running) return;
    animationId = requestAnimationFrame(animate);
    analyser.getByteFrequencyData(dataArray);

    // Sample 5 evenly-spaced points in the lower frequency range
    const step = Math.floor(dataArray.length / 10);
    barEls.forEach((bar, i) => {
      const val    = dataArray[i * step] ?? 0;
      // Scale 0–255 → 10–80px height
      const height = 10 + (val / 255) * 70;
      bar.style.height = `${height}px`;
    });
  }

  return {
    /**
     * Request mic access and start the animation loop.
     * Resolves once the AudioContext is ready.
     */
    async start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext  = new (window.AudioContext || window.webkitAudioContext)();
        analyser      = audioContext.createAnalyser();
        analyser.fftSize = 256;
        dataArray     = new Uint8Array(analyser.frequencyBinCount);
        microphone    = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        running       = true;
        animate();
      } catch (err) {
        console.warn('[AudioViz] Mic access denied:', err.message);
        // Session can still run without visualization — soft failure
      }
    },

    /** Stop the animation loop and release the mic + AudioContext. */
    stop() {
      running = false;
      if (animationId) cancelAnimationFrame(animationId);
      if (microphone)  microphone.disconnect();
      if (audioContext) audioContext.close();
      // Reset bars to minimum height
      barEls.forEach(bar => { bar.style.height = '10px'; });
    }
  };
}
