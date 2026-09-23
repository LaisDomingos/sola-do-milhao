// Lógica das ajudas: cartas e placas da plateia.
// Trabalha com índices de posição na tela (0 a 3).
const Ajudas = (() => {
  const embaralhar = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const sortear = arr => arr[Math.floor(Math.random() * arr.length)];

  // Chance de a plateia errar (a favorita ser uma alternativa errada), por nível.
  const ERRO_PLACAS = { 1: 0.10, 2: 0.20, 3: 0.30, 4: 0.35 };
  // Faixa de votos na favorita, por nível. Nunca passa de 65%; o resto se divide entre as outras.
  const FAIXA_PLACAS = { 1: [50, 65], 2: [42, 58], 3: [35, 50], 4: [32, 45] };

  return {
    embaralhar,

    // Rei = 0, Ás = 1, 2 = 2, 3 = 3 alternativas erradas eliminadas.
    baralho() {
      return embaralhar([
        { rotulo: 'K', nome: 'Rei', elimina: 0 },
        { rotulo: 'A', nome: 'Ás', elimina: 1 },
        { rotulo: '2', nome: 'Dois', elimina: 2 },
        { rotulo: '3', nome: 'Três', elimina: 3 }
      ]);
    },

    eliminar(qtd, disponiveis, correta) {
      const erradas = embaralhar(disponiveis.filter(i => i !== correta));
      return erradas.slice(0, Math.min(qtd, erradas.length));
    },

    // Porcentagens por posição (0 para eliminadas), somando 100.
    placas(nivel, disponiveis, correta) {
      const pct = [0, 0, 0, 0];
      const erradas = disponiveis.filter(i => i !== correta);
      if (erradas.length === 0) { pct[correta] = 100; return { pct }; }

      const erra = Math.random() < (ERRO_PLACAS[nivel] ?? 0.3);
      const favorita = erra ? sortear(erradas) : correta;
      // Quando erra, a plateia fica mais dividida: usa só a metade de baixo da faixa.
      const [min, max] = FAIXA_PLACAS[nivel] ?? [35, 50];
      const teto = erra ? (min + max) / 2 : max;
      // Com poucas alternativas sobrando, a favorita precisa ficar acima da divisão igual.
      const piso = Math.ceil(100 / disponiveis.length) + 5;
      const topo = Math.max(piso, Math.round(min + Math.random() * (teto - min)));
      pct[favorita] = topo;

      const outras = embaralhar(disponiveis.filter(i => i !== favorita));
      const pesos = outras.map(() => 0.5 + Math.random());
      const soma = pesos.reduce((x, y) => x + y, 0);
      let resto = 100 - topo;
      outras.forEach((idx, k) => {
        const v = k === outras.length - 1 ? resto : Math.round((100 - topo) * pesos[k] / soma);
        pct[idx] = v;
        resto -= v;
      });
      // Garante que nenhuma outra alternativa empate ou passe a favorita.
      const maiorOutra = () => outras.reduce((m, i) => (pct[i] > pct[m] ? i : m), outras[0]);
      const menorOutra = () => outras.reduce((m, i) => (pct[i] < pct[m] ? i : m), outras[0]);
      for (let m = maiorOutra(); pct[m] >= topo; m = maiorOutra()) {
        const excesso = pct[m] - (topo - 1);
        pct[m] -= excesso;
        pct[menorOutra()] += excesso;
      }
      return { pct };
    }
  };
})();
