// Efeitos sonoros sintetizados com Web Audio API (sem arquivos de áudio).
const Som = (() => {
  let ctx = null;
  let ligado = true;
  try { ligado = localStorage.getItem('sdm_som') !== 'off'; } catch (e) { /* sem storage */ }

  function contexto() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Toca uma nota simples com envelope.
  function nota(freq, inicio, duracao, { tipo = 'sine', volume = 0.18, freqFinal = null } = {}) {
    const c = contexto();
    if (!c || !ligado) return;
    const t0 = c.currentTime + inicio;
    const osc = c.createOscillator();
    const ganho = c.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqFinal) osc.frequency.exponentialRampToValueAtTime(freqFinal, t0 + duracao);
    ganho.gain.setValueAtTime(0.0001, t0);
    ganho.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);
    osc.connect(ganho).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duracao + 0.05);
  }

  return {
    get ligado() { return ligado; },
    alternar() {
      ligado = !ligado;
      try { localStorage.setItem('sdm_som', ligado ? 'on' : 'off'); } catch (e) { /* sem storage */ }
      return ligado;
    },
    destravar() { contexto(); },

    clique() { nota(660, 0, 0.08, { tipo: 'square', volume: 0.06 }); },
    tique() { nota(1200, 0, 0.05, { tipo: 'square', volume: 0.05 }); },

    novaPergunta() {
      [523, 659, 784].forEach((f, i) => nota(f, i * 0.09, 0.22, { tipo: 'triangle', volume: 0.12 }));
    },
    suspense(duracao = 1.6) {
      nota(110, 0, duracao, { tipo: 'sawtooth', volume: 0.07, freqFinal: 220 });
      nota(220, 0, duracao, { tipo: 'sine', volume: 0.08, freqFinal: 440 });
    },
    acerto() {
      [523, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.1, 0.35, { tipo: 'triangle', volume: 0.16 }));
    },
    erro() {
      nota(330, 0, 0.35, { tipo: 'sawtooth', volume: 0.12, freqFinal: 220 });
      nota(220, 0.3, 0.7, { tipo: 'sawtooth', volume: 0.12, freqFinal: 110 });
    },
    carta() { nota(880, 0, 0.12, { tipo: 'triangle', volume: 0.1, freqFinal: 1320 }); },
    ajuda() { [392, 523].forEach((f, i) => nota(f, i * 0.08, 0.2, { tipo: 'triangle', volume: 0.1 })); },
    vitoria() {
      const melodia = [523, 523, 523, 659, 784, 659, 784, 1047];
      const tempos = [0, 0.15, 0.3, 0.45, 0.75, 0.95, 1.1, 1.3];
      melodia.forEach((f, i) => nota(f, tempos[i], i === melodia.length - 1 ? 1.2 : 0.25, { tipo: 'triangle', volume: 0.16 }));
      [262, 330, 392].forEach(f => nota(f, 1.3, 1.2, { tipo: 'sine', volume: 0.08 }));
    },
    parar() { [659, 523, 392].forEach((f, i) => nota(f, i * 0.12, 0.3, { tipo: 'triangle', volume: 0.12 })); }
  };
})();
