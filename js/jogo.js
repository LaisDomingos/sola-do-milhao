// Fluxo do jogo: prêmios, sorteio de perguntas, respostas, ajudas, aposta final, modo festa e recorde.
(() => {
  const PREMIOS = [1000, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 40000, 50000,
    100000, 200000, 300000, 400000, 500000, 1000000];
  const MILHAO = PREMIOS.length - 1;
  const MIN_FESTA = 2;
  const MAX_FESTA = 6;
  const $ = id => document.getElementById(id);

  // Chance (em %) de cada nível [fácil, médio, difícil, milhão] por faixa de perguntas.
  // O começo não é só fácil: às vezes aparece uma difícil logo cedo.
  const MISTURA = [
    { ate: 2, pesos: [60, 30, 10, 0] },   // perguntas 1 a 3
    { ate: 4, pesos: [35, 45, 20, 0] },   // perguntas 4 e 5
    { ate: 9, pesos: [10, 50, 40, 0] },   // perguntas 6 a 10
    { ate: 14, pesos: [0, 15, 65, 20] },  // perguntas 11 a 15
    { ate: 15, pesos: [0, 0, 0, 100] }    // pergunta do milhão
  ];

  const BANCO = (window.PERGUNTAS || []).filter(q =>
    q && q.p && Array.isArray(q.o) && q.o.length === 4 && [1, 2, 3, 4].includes(q.n));

  // `estado` é sempre o jogador da vez. No modo festa, `festa` guarda todos os jogadores.
  let estado = null;
  let festa = null;
  let relogio = null;
  let provocacao = null;

  // ===== Utilidades =====
  const sortear = arr => arr[Math.floor(Math.random() * arr.length)];
  const fala = (tipo, extra = {}) => {
    const modelo = sortear(FALAS[tipo]);
    return modelo
      .replace(/\{nome\}/g, estado?.nome || 'amigo')
      .replace(/\{valor\}/g, extra.valor != null ? UI.dinheiro(extra.valor) : '');
  };
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const ehMilhao = () => estado.indice === MILHAO;

  const Recorde = {
    ler() {
      try { return JSON.parse(localStorage.getItem('sdm_recorde')) || null; } catch (e) { return null; }
    },
    salvar(valor, nome, segundos) {
      const atual = this.ler();
      if (atual && atual.valor >= valor) return false;
      try { localStorage.setItem('sdm_recorde', JSON.stringify({ valor, nome, segundos, data: new Date().toISOString() })); } catch (e) { /* sem storage */ }
      return valor > 0;
    }
  };

  // ===== Valores da pergunta atual =====
  const garantido = j => (j.indice === 0 ? 0 : PREMIOS[j.indice - 1]);
  const acumulado = () => garantido(estado);
  const valorAcertar = () => PREMIOS[estado.indice];
  const valorErrar = () => (ehMilhao() ? 0 : Math.floor(acumulado() / 2));
  const valorParar = () => acumulado();

  // ===== Histórico: perguntas que já saíram não voltam, nem em revanches ou partidas novas =====
  // Cada pergunta vira um código curto (hash do enunciado), salvo no navegador.
  const codigo = q => {
    let h = 5381;
    for (let i = 0; i < q.p.length; i++) h = ((h * 33) ^ q.p.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  const Historico = {
    usadas: (() => {
      try { return new Set(JSON.parse(localStorage.getItem('sdm_usadas')) || []); } catch (e) { return new Set(); }
    })(),
    salvar() {
      try { localStorage.setItem('sdm_usadas', JSON.stringify([...this.usadas])); } catch (e) { /* sem storage */ }
    },
    marcar(q) { this.usadas.add(codigo(q)); this.salvar(); },
    // Quando um nível está quase acabando, ele é liberado de novo.
    liberar(perguntas) { perguntas.forEach(q => this.usadas.delete(codigo(q))); this.salvar(); }
  };
  // Menos que isso de perguntas inéditas num nível, e o nível recomeça (o suficiente para uma festa cheia).
  const MINIMO_INEDITAS = 40;

  // ===== Banco / sorteio =====
  function montarPools() {
    const pools = { 1: [], 2: [], 3: [], 4: [] };
    const porNivel = { 1: [], 2: [], 3: [], 4: [] };
    BANCO.forEach(q => porNivel[q.n].push(q));
    for (const n of [1, 2, 3, 4]) {
      let ineditas = porNivel[n].filter(q => !Historico.usadas.has(codigo(q)));
      if (ineditas.length < MINIMO_INEDITAS) {
        Historico.liberar(porNivel[n]);
        ineditas = porNivel[n];
      }
      pools[n] = Ajudas.embaralhar(ineditas);
    }
    return pools;
  }

  function sortearNivel(indice) {
    const { pesos } = MISTURA.find(m => indice <= m.ate);
    let r = Math.random() * pesos.reduce((a, b) => a + b, 0);
    for (let n = 0; n < pesos.length; n++) {
      r -= pesos[n];
      if (r < 0) return n + 1;
    }
    return pesos.length;
  }

  function proximaPergunta(indice) {
    // No desafio do dia, as perguntas (e reservas para os pulos) já vêm sorteadas pela data.
    if (estado.desafio) {
      const candidata = estado.desafio.candidatas[indice][estado.desafio.usadas[indice]++];
      if (!candidata) return null;
      estado.ordemDoDia = candidata.ordem;
      Historico.marcar(candidata.q);
      return candidata.q;
    }
    // Se o nível sorteado acabar, busca no mais próximo (mais difícil primeiro).
    const nivel = sortearNivel(indice);
    const ordem = [nivel, nivel + 1, nivel - 1, nivel + 2, nivel - 2, nivel + 3, nivel - 3].filter(n => n >= 1 && n <= 4);
    for (const n of ordem) {
      if (estado.pools[n].length) {
        const q = estado.pools[n].pop();
        Historico.marcar(q);
        return q;
      }
    }
    return null;
  }

  // ===== Tempo de jogo (cada jogador tem o seu; só conta durante a própria vez) =====
  const segundosDe = j => Math.floor((j.acumulado + (j.turnoInicio ? Date.now() - j.turnoInicio : 0)) / 1000);
  function retomarRelogio() {
    pararRelogio();
    estado.turnoInicio = Date.now();
    UI.tempo(segundosDe(estado));
    relogio = setInterval(() => UI.tempo(segundosDe(estado)), 1000);
  }
  function pausarRelogio() {
    pararRelogio();
    if (estado.turnoInicio) {
      estado.acumulado += Date.now() - estado.turnoInicio;
      estado.turnoInicio = null;
    }
  }
  function pararRelogio() { clearInterval(relogio); relogio = null; }

  // ===== Jogadores =====
  // No modo festa, todos compartilham o mesmo `pools`, então ninguém recebe pergunta repetida.
  function novoJogador(nome, pools) {
    return {
      nome,
      indice: 0,
      pools,
      pergunta: null,
      opcoes: [],
      correta: -1,
      eliminadas: new Set(),
      selecionada: -1,
      pulos: 3,
      cartas: true,
      ia: true,
      placas: true,
      travado: false,
      arriscou: false,
      acumulado: 0,
      turnoInicio: null,
      terminado: false,
      resultado: null,
      desafio: null,
      quadrados: []  // 🟩 por acerto, para o compartilhamento do desafio
    };
  }

  // ===== Início =====
  function iniciar(nome) {
    Som.destravar();
    festa = null;
    estado = novoJogador(nome, montarPools());
    prepararTelaJogo();
    UI.falar(fala('inicio'));
    retomarRelogio();
    setTimeout(iniciarVez, 1200);
  }

  function iniciarFesta(nomes) {
    Som.destravar();
    const pools = montarPools();
    festa = { nomes, jogadores: nomes.map(n => novoJogador(n, pools)), atual: 0 };
    estado = festa.jogadores[0];
    mostrarVez();
  }

  function iniciarDesafio(nome, dia) {
    Som.destravar();
    festa = null;
    estado = novoJogador(nome, null);
    estado.desafio = {
      dia,
      candidatas: Desafio.sortearPerguntas(dia, BANCO, MISTURA),
      usadas: Array(PREMIOS.length).fill(0)
    };
    // Marca o desafio como começado já: se fechar no meio, fica com o que tiver garantido.
    Desafio.salvar(dia, {
      status: 'jogando', nome, premio: 0, acertos: 0, segundos: 0, quadrados: [],
      noRanking: dia === Desafio.hoje(), enviado: false
    });
    prepararTelaJogo();
    UI.falar(fala('desafio'));
    retomarRelogio();
    setTimeout(iniciarVez, 1400);
  }

  function abrirCalendario() {
    pararRelogio();
    clearTimeout(provocacao);
    UI.limparConfete();
    const nome = $('input-nome').value.trim();
    Desafio.abrir({ nome, aoJogar: dia => iniciarDesafio($('input-nome').value.trim() || nome, dia) });
  }

  function prepararTelaJogo() {
    $('nome-jogador').textContent = estado.nome;
    UI.montarEscada(PREMIOS);
    UI.atualizarEscada(estado.indice);
    renderPlacar($('placar'));
    $('placar').hidden = !festa;
    UI.mostrarTela('tela-jogo');
  }

  // Começa a vez do jogador: na pergunta do milhão, antes vem a aposta final.
  function iniciarVez() {
    if (ehMilhao() && !estado.arriscou) apostaFinal();
    else carregarPergunta();
  }

  // ===== Modo festa: troca de vez, placar e pódio =====
  function mostrarVez() {
    $('vez-nome').textContent = estado.nome;
    $('vez-info').textContent = ehMilhao()
      ? 'Chegou na pergunta do milhão! 😱'
      : `Pergunta ${estado.indice + 1} de ${PREMIOS.length}, valendo ${UI.dinheiro(valorAcertar())}`;
    renderPlacar($('vez-placar'));
    UI.mostrarTela('tela-vez');
    $('btn-vez').focus();
  }

  function comecarVez() {
    prepararTelaJogo();
    retomarRelogio();
    UI.falar(fala('vez'));
    setTimeout(iniciarVez, 900);
  }

  function proximaVez() {
    pausarRelogio();
    clearTimeout(provocacao);
    const total = festa.jogadores.length;
    for (let k = 1; k <= total; k++) {
      const i = (festa.atual + k) % total;
      if (festa.jogadores[i].terminado) continue;
      const mesmo = i === festa.atual;
      festa.atual = i;
      estado = festa.jogadores[i];
      // Se só sobrou quem já estava jogando, segue direto, sem tela de troca.
      if (mesmo) comecarVez();
      else mostrarVez();
      return;
    }
    mostrarPodio();
  }

  function renderPlacar(caixa) {
    caixa.innerHTML = '';
    if (!festa) return;
    festa.jogadores.forEach((j, i) => {
      const chip = UI.el('div', 'placar-item');
      if (i === festa.atual && !j.terminado) chip.classList.add('atual');
      if (j.terminado) chip.classList.add('terminado');
      const icone = j.terminado ? ({ vitoria: '🏆', erro: '❌', parar: '✋', levou: '💰' })[j.resultado.motivo] : (i === festa.atual ? '▶' : '');
      const valor = j.terminado ? j.resultado.premio : garantido(j);
      chip.append(
        UI.el('span', 'placar-nome', `${icone} ${j.nome}`.trim()),
        UI.el('span', 'placar-valor', UI.dinheiro(valor))
      );
      caixa.append(chip);
    });
  }

  function mostrarPodio() {
    const ranking = [...festa.jogadores].sort((a, b) =>
      b.resultado.premio - a.resultado.premio || a.resultado.segundos - b.resultado.segundos);
    const medalhas = ['🥇', '🥈', '🥉'];
    const lista = $('podio-lista');
    lista.innerHTML = '';
    ranking.forEach((j, i) => {
      const li = UI.el('li', 'podio-item' + (i < 3 ? ` podio-${i + 1}` : ''));
      const info = UI.el('div', 'podio-info');
      info.append(
        UI.el('span', 'podio-nome', j.nome),
        UI.el('span', 'podio-detalhe', `chegou à pergunta ${j.indice + 1} · ⏱ ${UI.formatarTempo(j.resultado.segundos)}`)
      );
      li.append(UI.el('span', 'podio-pos', medalhas[i] || `${i + 1}º`), info, UI.el('span', 'podio-premio', UI.dinheiro(j.resultado.premio)));
      lista.append(li);
    });
    const [primeiro, segundo] = ranking;
    const empate = segundo && primeiro.resultado.premio === segundo.resultado.premio && primeiro.resultado.segundos === segundo.resultado.segundos;
    $('podio-titulo').textContent = empate ? 'EMPATE NA FESTA!' : `${primeiro.nome.toUpperCase()} VENCEU!`;
    const desempatePorTempo = !empate && segundo && primeiro.resultado.premio === segundo.resultado.premio;
    $('podio-sub').textContent = empate
      ? 'Mesmo prêmio e mesmo tempo. Só uma revanche para decidir!'
      : desempatePorTempo
        ? `Empatou em ${UI.dinheiro(primeiro.resultado.premio)} com ${segundo.nome}, mas venceu no tempo!`
        : `Levou ${UI.dinheiro(primeiro.resultado.premio)} e é a sola mais brilhante da turma!`;
    UI.mostrarTela('tela-podio');
    UI.confete('confete-podio');
    Som.vitoria();
  }

  // ===== Perguntas =====
  // `abertura` é a fala do apresentador antes da pergunta; se vazia, usa a fala padrão.
  function carregarPergunta(abertura = null) {
    const q = proximaPergunta(estado.indice);
    if (!q) { alertaSemPerguntas(); return; }
    const ordem = estado.desafio ? estado.ordemDoDia : Ajudas.embaralhar([0, 1, 2, 3]);
    estado.pergunta = q;
    estado.opcoes = ordem.map(i => q.o[i]);
    estado.correta = ordem.indexOf(0);
    estado.eliminadas = new Set();
    estado.selecionada = -1;
    estado.travado = false;

    UI.renderPergunta({
      numero: estado.indice + 1,
      total: PREMIOS.length,
      texto: q.p,
      alternativas: estado.opcoes,
      milhao: ehMilhao(),
      aoEscolher: escolher
    });
    UI.atualizarEscada(estado.indice);
    UI.valores(valorErrar(), valorParar(), valorAcertar());
    atualizarAjudas();
    const linha = abertura || (ehMilhao() ? fala('milhao') : fala(estado.indice === 0 ? 'primeira' : 'pergunta', { valor: valorAcertar() }));
    Som.novaPergunta();

    // Às vezes o apresentador comenta a pergunta: difícil logo cedo, ou só para animar.
    let comentario = '';
    if (!ehMilhao() && q.n >= 3 && estado.indice < 10) comentario = fala('cascaGrossa');
    else if (!ehMilhao() && Math.random() < 0.35) comentario = fala('incentivo');
    UI.falar(comentario ? `${linha} ${comentario}` : linha);
    agendarProvocacao();
  }

  // Se o jogador demorar, o apresentador provoca (sem limite de tempo, é só zoeira).
  function agendarProvocacao(vezes = 0) {
    clearTimeout(provocacao);
    if (vezes >= 3) return;
    provocacao = setTimeout(() => {
      if (!estado.travado && !UI.modalAberto() && $('tela-jogo').classList.contains('ativa')) UI.falar(fala('espera'));
      agendarProvocacao(vezes + 1);
    }, vezes === 0 ? 30000 : 40000);
  }

  function alertaSemPerguntas() {
    UI.modal({
      titulo: 'Sem perguntas',
      conteudo: 'Não foi possível carregar o banco de perguntas. Verifique a pasta "perguntas".',
      botoes: [{ texto: 'OK', acao: () => { UI.fecharModal(); UI.mostrarTela('tela-inicio'); } }]
    });
  }

  function atualizarAjudas() {
    UI.ajudas({
      pular: estado.pulos,
      cartas: estado.cartas,
      ia: estado.ia,
      placas: estado.placas,
      bloqueadas: ehMilhao(),
      travado: estado.travado,
      semParar: estado.arriscou
    });
  }

  function disponiveis() {
    return [0, 1, 2, 3].filter(i => !estado.eliminadas.has(i));
  }

  // ===== Aposta final =====
  function apostaFinal() {
    estado.travado = true;
    clearTimeout(provocacao);
    UI.atualizarEscada(MILHAO);
    UI.valores(0, valorParar(), valorAcertar());
    atualizarAjudas();
    $('alternativas').innerHTML = '';
    $('pergunta-num').textContent = 'APOSTA FINAL';
    $('pergunta-texto').textContent = '???';
    UI.falar(fala('aposta'));
    Som.suspense(2.4);

    const corpo = UI.el('div', 'aposta');
    corpo.append(
      UI.el('p', 'aposta-garantido', `Você já garantiu ${UI.dinheiro(valorParar())}!`),
      UI.el('p', null, 'A próxima é a pergunta do milhão, e você decide ANTES de ver a pergunta.'),
      UI.el('p', 'aposta-regra', 'Arriscou? Não tem volta nem ajuda: acertou, leva R$ 1 milhão; errou, sai sem nada.')
    );
    UI.modal({
      titulo: 'Levar ou arriscar?',
      conteudo: corpo,
      fixo: true,
      botoes: [
        { texto: `💰 Levar R$ ${UI.curto(valorParar()).toLowerCase()}`, classe: 'btn-secundario', acao: () => { UI.fecharModal(); levarAposta(); } },
        { texto: '🔥 Arriscar tudo!', classe: 'btn-principal btn-arriscar', acao: () => { UI.fecharModal(); arriscarAposta(); } }
      ]
    });
  }

  function arriscarAposta() {
    estado.arriscou = true;
    Som.acerto();
    carregarPergunta(fala('arriscou'));
  }

  async function levarAposta() {
    // Sorteia a pergunta do milhão só para mostrar o que teria caído.
    estado.pergunta = proximaPergunta(MILHAO);
    Som.parar();
    UI.falar(fala('levou', { valor: valorParar() }));
    await esperar(1800);
    fim('levou', valorParar());
  }

  // ===== Resposta =====
  function escolher(i) {
    if (estado.travado || estado.eliminadas.has(i) || UI.modalAberto()) return;
    Som.clique();
    agendarProvocacao();
    if (estado.selecionada >= 0) UI.desmarcar(estado.selecionada, 'selecionada');
    estado.selecionada = i;
    UI.marcar(i, 'selecionada');
    const frase = fala('confirmar');
    UI.falar(frase);
    UI.modal({
      titulo: frase,
      conteudo: `Sua resposta: ${i + 1} — ${estado.opcoes[i]}`,
      botoes: [
        { texto: 'Estou certo', acao: () => { estado.travado = true; UI.fecharModal(); confirmar(i); } },
        { texto: 'Não', classe: 'btn-secundario', acao: () => UI.fecharModal() }
      ],
      aoFechar: () => {
        if (estado.travado) return;
        UI.desmarcar(i, 'selecionada');
        estado.selecionada = -1;
      }
    });
  }

  async function confirmar(i) {
    estado.travado = true;
    UI.travarAlternativas(true);
    atualizarAjudas();
    clearTimeout(provocacao);
    UI.falar('...');
    Som.suspense(1.6);
    await esperar(1700);
    UI.desmarcar(i, 'selecionada');

    if (i === estado.correta) {
      UI.marcar(i, 'correta');
      Som.acerto();
      const ganho = valorAcertar();
      if (ehMilhao()) {
        estado.quadrados.push('🟩');
        UI.falar('É UM MILHÃO DE REAIS!');
        await esperar(1500);
        fim('vitoria', ganho);
        return;
      }
      estado.quadrados.push('🟩');
      UI.falar(fala('acerto', { valor: ganho }));
      await esperar(1900);
      estado.indice++;
      if (estado.desafio) {
        Desafio.salvar(estado.desafio.dia, {
          premio: acumulado(), acertos: estado.quadrados.length,
          segundos: segundosDe(estado), quadrados: estado.quadrados
        });
      }
      if (festa) proximaVez();
      else iniciarVez();
    } else {
      UI.marcar(i, 'errada');
      UI.marcar(estado.correta, 'correta');
      Som.erro();
      UI.falar(fala('erro'));
      await esperar(2600);
      fim('erro', valorErrar());
    }
  }

  // ===== Parar =====
  function pedirParar() {
    if (estado.travado || estado.arriscou || UI.modalAberto()) return;
    UI.modal({
      titulo: 'Quer parar?',
      conteudo: `Se parar agora, você leva ${UI.dinheiro(valorParar())}.`,
      botoes: [
        { texto: 'Parar', acao: () => { estado.travado = true; UI.fecharModal(); parar(); } },
        { texto: 'Continuar', classe: 'btn-secundario', acao: () => UI.fecharModal() }
      ]
    });
  }

  async function parar() {
    estado.travado = true;
    UI.travarAlternativas(true);
    atualizarAjudas();
    UI.marcar(estado.correta, 'correta');
    Som.parar();
    clearTimeout(provocacao);
    UI.falar(fala('parar', { valor: valorParar() }) + ' A resposta certa está em verde.');
    await esperar(2600);
    fim('parar', valorParar());
  }

  // ===== Ajudas =====
  function usarAjuda(tipo) {
    if (estado.travado || UI.modalAberto() || ehMilhao()) return;
    agendarProvocacao();
    if (tipo === 'pular' && estado.pulos > 0) return pular();
    if (tipo === 'cartas' && estado.cartas) return cartas();
    if (tipo === 'ia' && estado.ia) return perguntarIA();
    if (tipo === 'placas' && estado.placas) return placas();
  }

  function pular() {
    estado.pulos--;
    Som.ajuda();
    carregarPergunta(fala('pular'));
  }

  function cartas() {
    estado.cartas = false;
    atualizarAjudas();
    UI.falar(fala('cartas'));
    Som.ajuda();

    const baralho = Ajudas.baralho();
    const grade = UI.el('div', 'cartas');
    let escolhida = false;
    const botoes = baralho.map((c, idx) => {
      const b = UI.el('button', 'carta');
      b.type = 'button';
      b.setAttribute('aria-label', `Carta ${idx + 1}`);
      const verso = UI.el('span', 'carta-face carta-verso', '?');
      const frente = UI.el('span', 'carta-face carta-frente', c.rotulo);
      frente.append(UI.el('small', null, c.elimina === 0 ? 'nenhuma' : `elimina ${c.elimina}`));
      b.append(verso, frente);
      b.addEventListener('click', () => {
        if (escolhida) return;
        escolhida = true;
        Som.carta();
        b.classList.add('virada', 'escolhida');
        setTimeout(() => botoes.forEach(o => o.classList.add('virada')), 700);
        const eliminar = Ajudas.eliminar(c.elimina, disponiveis(), estado.correta);
        eliminar.forEach(i => estado.eliminadas.add(i));
        setTimeout(() => {
          UI.eliminar(eliminar);
          const texto = c.elimina === 0
            ? `Você tirou o ${c.nome}! Nenhuma alternativa foi eliminada.`
            : `Você tirou o ${c.nome}! ${c.elimina === 1 ? 'Uma alternativa errada foi eliminada' : c.elimina + ' alternativas erradas foram eliminadas'}.`;
          UI.falar(texto);
          msg.textContent = texto;
          $('modal-botoes').append(ok);
          ok.focus();
        }, 1200);
      });
      grade.append(b);
      return b;
    });

    const corpo = UI.el('div');
    const msg = UI.el('p', null, 'Escolha uma das cartas. Rei: nenhuma; Ás: 1; 2: duas; 3: três alternativas erradas eliminadas.');
    corpo.append(msg, grade);
    const ok = UI.el('button', 'btn btn-principal', 'Continuar');
    ok.type = 'button';
    ok.addEventListener('click', () => UI.fecharModal());

    // A carta escolhida precisa ser vista: o modal não fecha com Esc.
    UI.modal({ titulo: 'Cartas', conteudo: corpo, fixo: true });
  }

  function perguntarIA() {
    estado.ia = false;
    atualizarAjudas();
    UI.falar(fala('ia'));
    Som.ajuda();

    const tela = UI.el('div', 'ia');
    const linha = UI.el('p', 'ia-texto');
    tela.append(UI.el('span', 'ia-avatar', '🤖'), linha);
    const resposta = `Analisando a pergunta... Cruzando bilhões de dados... Pronto! A resposta é a ${estado.correta + 1}: ${estado.opcoes[estado.correta]}.`;

    UI.modal({
      titulo: 'IA',
      conteudo: tela,
      botoes: [{ texto: 'Valeu, IA!', acao: () => { clearInterval(digitando); UI.fecharModal(); } }]
    });

    // Efeito de digitação, letra por letra.
    let i = 0;
    const digitando = setInterval(() => {
      linha.textContent = resposta.slice(0, ++i);
      if (i % 3 === 0) Som.tique();
      if (i >= resposta.length) clearInterval(digitando);
    }, 35);
  }

  function placas() {
    estado.placas = false;
    atualizarAjudas();
    UI.falar(fala('placas'));
    Som.ajuda();

    const { pct } = Ajudas.placas(estado.pergunta.n, disponiveis(), estado.correta);
    const maior = Math.max(...pct);
    const grafico = UI.el('div', 'placas');
    const barras = pct.map((v, i) => {
      const col = UI.el('div', 'placa' + (estado.eliminadas.has(i) ? ' nula' : '') + (v === maior ? ' favorita' : ''));
      const barra = UI.el('div', 'placa-barra');
      col.append(UI.el('span', 'placa-pct', v + '%'), barra, UI.el('span', 'placa-rotulo', String(i + 1)));
      grafico.append(col);
      return { barra, v };
    });
    const clima = maior >= 55 ? 'A plateia está bem confiante!'
      : maior >= 42 ? 'A plateia está meio dividida...'
        : 'A plateia está muito dividida!';
    const corpo = UI.el('div');
    corpo.append(UI.el('p', null, clima), grafico, UI.el('p', 'placas-aviso', 'Lembre-se: a plateia também erra!'));

    UI.modal({
      titulo: 'Placas',
      conteudo: corpo,
      botoes: [{ texto: 'Obrigado, plateia!', acao: () => UI.fecharModal() }]
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      barras.forEach(({ barra, v }) => { barra.style.height = Math.max(v, 1) * 1.3 + 'px'; });
    }));
  }

  // ===== Fim =====
  function textosFim(motivo) {
    const q = estado.pergunta;
    const certo = q ? q.o[0] : '';
    return {
      titulo: {
        vitoria: 'VOCÊ É MILIONÁRIO!',
        erro: 'QUE PENA!',
        parar: 'VOCÊ PAROU!',
        levou: 'GARANTIU O SEU!'
      }[motivo],
      mensagem: {
        vitoria: `Parabéns, ${estado.nome}! Você respondeu as 16 perguntas e ganhou o prêmio máximo!`,
        erro: `Você errou a pergunta ${estado.indice + 1}. A resposta certa era: ${certo}.`,
        parar: `Você parou na pergunta ${estado.indice + 1}. A resposta certa era: ${certo}.`,
        levou: q
          ? `Você preferiu não arriscar. A pergunta do milhão seria: “${q.p}” Resposta: ${certo}.`
          : 'Você preferiu não arriscar e levou o prêmio garantido.'
      }[motivo]
    };
  }

  function fim(motivo, premio) {
    pausarRelogio();
    clearTimeout(provocacao);
    const segundos = segundosDe(estado);
    estado.terminado = true;
    estado.resultado = { motivo, premio, segundos };
    const novo = Recorde.salvar(premio, estado.nome, segundos);
    const { titulo, mensagem } = textosFim(motivo);

    if (festa) {
      // No modo festa, o resultado aparece num aviso e a vez passa para o próximo.
      const corpo = UI.el('div', 'fim-festa');
      corpo.append(
        UI.el('p', null, mensagem),
        UI.el('p', 'fim-rotulo', 'Leva para casa'),
        UI.el('p', 'fim-festa-premio', UI.dinheiro(premio))
      );
      if (novo) corpo.append(UI.el('p', 'fim-recorde', '🏆 Novo recorde!'));
      UI.modal({
        titulo: `${estado.nome}: ${titulo}`,
        conteudo: corpo,
        fixo: true,
        botoes: [{ texto: 'Continuar', acao: () => { UI.fecharModal(); proximaVez(); } }]
      });
      if (motivo === 'vitoria') Som.vitoria();
      return;
    }

    const noDesafio = Boolean(estado.desafio);
    $('btn-novamente').hidden = noDesafio;
    $('btn-compartilhar').hidden = !noDesafio;
    $('btn-calendario').hidden = !noDesafio;
    $('btn-inicio').textContent = noDesafio ? 'Início' : 'Trocar jogador';
    $('fim-ranking').hidden = true;
    if (noDesafio) registrarDesafio(motivo, premio, segundos);

    $('fim-titulo').textContent = titulo;
    $('fim-msg').textContent = mensagem;
    $('fim-premio').textContent = UI.dinheiro(premio);
    $('fim-tempo').textContent = `⏱ Tempo de jogo: ${UI.formatarTempo(segundos)}`;
    const rec = $('fim-recorde');
    rec.hidden = !novo;
    rec.textContent = '🏆 Novo recorde!';

    UI.mostrarTela('tela-fim');
    if (motivo === 'vitoria') { UI.confete(); Som.vitoria(); } else UI.limparConfete();
  }

  // Guarda o resultado do desafio no aparelho e, se for o desafio de hoje, envia ao ranking.
  function registrarDesafio(motivo, premio, segundos) {
    const { dia } = estado.desafio;
    const final = { erro: '🟥', parar: '✋', levou: '💰' }[motivo];
    const r = Desafio.salvar(dia, {
      status: 'fim', motivo, premio, segundos,
      acertos: estado.quadrados.length,
      quadrados: final ? [...estado.quadrados, final] : estado.quadrados
    });
    const aviso = $('fim-ranking');
    if (!r.noRanking) {
      aviso.hidden = false;
      aviso.textContent = '📅 Desafio de dia passado: vale só para você, fora do ranking.';
      return;
    }
    if (!Desafio.configurado()) return;
    aviso.hidden = false;
    aviso.textContent = '⏳ Enviando para o ranking...';
    Desafio.enviar(dia, r, estado.nome).then(status => {
      aviso.textContent = status === 'erro'
        ? '⚠️ Não deu para enviar agora. Vamos tentar de novo quando você abrir o calendário.'
        : '✅ Resultado no ranking do dia! Veja sua posição no calendário.';
    });
  }

  function mostrarRecordeInicio() {
    const r = Recorde.ler();
    const p = $('recorde-inicio');
    if (r && r.valor > 0) {
      p.hidden = false;
      const tempo = r.segundos != null ? ` em ${UI.formatarTempo(r.segundos)}` : '';
      p.textContent = `🏆 Recorde: ${UI.dinheiro(r.valor)} — ${r.nome}${tempo}`;
    } else p.hidden = true;
  }

  function voltarInicio() {
    pararRelogio();
    clearTimeout(provocacao);
    UI.limparConfete();
    UI.limparConfete('confete-podio');
    mostrarRecordeInicio();
    UI.mostrarTela('tela-inicio');
  }

  // ===== Formulário do modo festa =====
  function nomesFestaSalvos() {
    try { return JSON.parse(localStorage.getItem('sdm_festa')) || []; } catch (e) { return []; }
  }

  function renderNomesFesta(nomes) {
    const caixa = $('festa-nomes');
    caixa.innerHTML = '';
    nomes.forEach((nome, i) => {
      const linha = UI.el('div', 'festa-linha');
      const input = UI.el('input');
      input.type = 'text';
      input.maxLength = 18;
      input.placeholder = `Jogador ${i + 1}`;
      input.value = nome;
      input.setAttribute('aria-label', `Nome do jogador ${i + 1}`);
      linha.append(input);
      if (nomes.length > MIN_FESTA) {
        const tirar = UI.el('button', 'festa-tirar', '×');
        tirar.type = 'button';
        tirar.setAttribute('aria-label', `Remover jogador ${i + 1}`);
        tirar.addEventListener('click', () => renderNomesFesta(lerNomesFesta().filter((_, k) => k !== i)));
        linha.append(tirar);
      }
      caixa.append(linha);
    });
    $('btn-add-jogador').hidden = nomes.length >= MAX_FESTA;
  }

  const lerNomesFesta = () => [...$('festa-nomes').querySelectorAll('input')].map(i => i.value.trim());

  function abrirFesta(abrir) {
    $('form-inicio').hidden = abrir;
    $('btn-abrir-festa').hidden = abrir;
    $('form-festa').hidden = !abrir;
    if (abrir) {
      const salvos = nomesFestaSalvos();
      renderNomesFesta(salvos.length >= MIN_FESTA ? salvos : ['', '']);
      $('festa-nomes').querySelector('input').focus();
    }
  }

  // ===== Eventos =====
  function ligarEventos() {
    $('total-perguntas').textContent = `${BANCO.length.toLocaleString('pt-BR')} perguntas no banco`;

    let nomeSalvo = '';
    try { nomeSalvo = localStorage.getItem('sdm_nome') || ''; } catch (e) { /* sem storage */ }
    $('input-nome').value = nomeSalvo;

    $('form-inicio').addEventListener('submit', e => {
      e.preventDefault();
      const nome = $('input-nome').value.trim();
      if (!nome) return;
      try { localStorage.setItem('sdm_nome', nome); } catch (err) { /* sem storage */ }
      iniciar(nome);
    });

    $('btn-desafio').addEventListener('click', () => {
      const nome = $('input-nome').value.trim();
      if (!nome) {
        $('input-nome').focus();
        $('form-inicio').reportValidity();
        return;
      }
      try { localStorage.setItem('sdm_nome', nome); } catch (err) { /* sem storage */ }
      abrirCalendario();
    });
    $('btn-desafio-voltar').addEventListener('click', voltarInicio);
    $('btn-calendario').addEventListener('click', abrirCalendario);
    $('btn-compartilhar').addEventListener('click', () => {
      const dia = estado.desafio?.dia;
      if (dia) Desafio.compartilhar(dia, Desafio.ler(dia), $('btn-compartilhar'));
    });
    $('btn-abrir-festa').addEventListener('click', () => abrirFesta(true));
    $('btn-voltar-solo').addEventListener('click', () => abrirFesta(false));
    $('btn-add-jogador').addEventListener('click', () => {
      const nomes = lerNomesFesta();
      if (nomes.length >= MAX_FESTA) return;
      renderNomesFesta([...nomes, '']);
      const inputs = $('festa-nomes').querySelectorAll('input');
      inputs[inputs.length - 1].focus();
    });
    $('form-festa').addEventListener('submit', e => {
      e.preventDefault();
      // Nomes vazios viram "Jogador N".
      const nomes = lerNomesFesta().map((n, i) => n || `Jogador ${i + 1}`);
      if (nomes.length < MIN_FESTA) return;
      try { localStorage.setItem('sdm_festa', JSON.stringify(nomes)); } catch (err) { /* sem storage */ }
      iniciarFesta(nomes);
    });

    $('btn-vez').addEventListener('click', comecarVez);

    document.querySelectorAll('[data-ajuda]').forEach(b =>
      b.addEventListener('click', () => usarAjuda(b.dataset.ajuda)));
    $('btn-parar').addEventListener('click', pedirParar);

    $('btn-novamente').addEventListener('click', () => { UI.limparConfete(); iniciar(estado.nome); });
    $('btn-inicio').addEventListener('click', () => { voltarInicio(); $('input-nome').focus(); });
    $('btn-revanche').addEventListener('click', () => { UI.limparConfete('confete-podio'); iniciarFesta(festa.nomes); });
    $('btn-podio-inicio').addEventListener('click', voltarInicio);

    const atualizarBotaoSom = () => { $('btn-som').textContent = Som.ligado ? '🔊' : '🔇'; };
    $('btn-som').addEventListener('click', () => { Som.alternar(); atualizarBotaoSom(); });
    atualizarBotaoSom();

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && UI.modalAberto()) {
        if (!UI.modalFixo()) UI.fecharModal();
        return;
      }
      if (!$('tela-jogo').classList.contains('ativa') || UI.modalAberto()) return;
      if (e.target.tagName === 'INPUT') return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) escolher(n - 1);
    });

    mostrarRecordeInicio();
  }

  ligarEventos();
})();
