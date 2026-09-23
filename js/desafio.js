// Desafio do Dia: as mesmas 16 perguntas para todo mundo em cada data, calendário,
// resultados salvos no aparelho e ranking online (Supabase).
const Desafio = (() => {
  const INICIO = '2026-09-01';          // primeiro dia disponível no calendário
  const FUSO = 'America/Sao_Paulo';     // o "dia" vira à meia-noite de Brasília
  const CHAVE = 'sdm_desafios';
  const TABELA = 'resultados_desafio';
  const cfg = window.SOLA_CONFIG || {};
  const $ = id => document.getElementById(id);

  // ===== Datas (sempre no formato AAAA-MM-DD) =====
  const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const paraData = dia => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
  const paraDia = data => data.toISOString().slice(0, 10);
  const somarDias = (dia, n) => { const d = paraData(dia); d.setUTCDate(d.getUTCDate() + n); return paraDia(d); };
  const dataCurta = dia => dia.split('-').reverse().slice(0, 2).join('/');
  const dataLonga = dia => paraData(dia).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

  // ===== Sorteio determinístico: a mesma data sempre gera as mesmas perguntas =====
  const hash = texto => {
    let h = 5381;
    for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
    return h;
  };
  // Gerador pseudoaleatório com semente (mulberry32).
  const gerador = semente => () => {
    semente = (semente + 0x6D2B79F5) >>> 0;
    let t = semente;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Para cada uma das 16 posições, 4 candidatas: a principal e reservas para os pulos.
  // Cada candidata já vem com a ordem das alternativas, igual para todos os jogadores.
  function sortearPerguntas(dia, banco, mistura) {
    const aleatorio = gerador(hash('sola-do-milhao-' + dia));
    const porNivel = { 1: [], 2: [], 3: [], 4: [] };
    banco.forEach(q => porNivel[q.n].push(q));
    Object.values(porNivel).forEach(lista => lista.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0)));
    const usadas = new Set();

    const sortearNivel = indice => {
      const { pesos } = mistura.find(m => indice <= m.ate);
      let r = aleatorio() * pesos.reduce((a, b) => a + b, 0);
      for (let n = 0; n < pesos.length; n++) {
        r -= pesos[n];
        if (r < 0) return n + 1;
      }
      return pesos.length;
    };
    const ordemAlternativas = () => {
      const o = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) {
        const j = Math.floor(aleatorio() * (i + 1));
        [o[i], o[j]] = [o[j], o[i]];
      }
      return o;
    };

    return Array.from({ length: 16 }, (_, indice) => {
      const candidatas = [];
      let tentativas = 0;
      while (candidatas.length < 4 && tentativas++ < 200) {
        const lista = porNivel[sortearNivel(indice)];
        const q = lista[Math.floor(aleatorio() * lista.length)];
        if (!q || usadas.has(q.p)) continue;
        usadas.add(q.p);
        candidatas.push({ q, ordem: ordemAlternativas() });
      }
      return candidatas;
    });
  }

  // ===== Resultados salvos no aparelho =====
  const todos = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch (e) { return {}; } };
  const ler = dia => todos()[dia] || null;
  function salvar(dia, dados) {
    const tudo = todos();
    tudo[dia] = { ...(tudo[dia] || {}), ...dados };
    try { localStorage.setItem(CHAVE, JSON.stringify(tudo)); } catch (e) { /* sem storage */ }
    return tudo[dia];
  }

  // Quem fechou o jogo no meio fica com o que já tinha garantido (evita jogar de novo sabendo as respostas).
  function finalizarAbandonados() {
    Object.entries(todos()).forEach(([dia, r]) => {
      if (r.status !== 'jogando') return;
      salvar(dia, { status: 'fim', motivo: 'abandonou', quadrados: [...(r.quadrados || []), '🚪'] });
    });
  }

  function estatisticas() {
    const tudo = todos();
    const jogados = Object.keys(tudo).filter(d => tudo[d].status === 'fim');
    let sequencia = 0;
    // A sequência conta dias seguidos até hoje (ou até ontem, se hoje ainda não jogou).
    let dia = tudo[hoje()]?.status === 'fim' ? hoje() : somarDias(hoje(), -1);
    while (tudo[dia]?.status === 'fim') { sequencia++; dia = somarDias(dia, -1); }
    const melhor = jogados.reduce((m, d) => Math.max(m, tudo[d].premio || 0), 0);
    return { jogados: jogados.length, sequencia, melhor };
  }

  // ===== Ranking online =====
  const configurado = () => Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  function jogadorId() {
    let id = null;
    try { id = localStorage.getItem('sdm_jogador_id'); } catch (e) { /* sem storage */ }
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID()
        : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
          (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
      try { localStorage.setItem('sdm_jogador_id', id); } catch (e) { /* sem storage */ }
    }
    return id;
  }
  // Aceita a chave antiga ("anon", um JWT que começa com eyJ) e a nova ("sb_publishable_...").
  // A nova vai só no cabeçalho apikey; mandá-la como Bearer faria o Supabase recusar.
  const cabecalhos = () => ({
    apikey: cfg.supabaseAnonKey,
    ...(cfg.supabaseAnonKey.startsWith('eyJ') ? { Authorization: `Bearer ${cfg.supabaseAnonKey}` } : {}),
    'Content-Type': 'application/json'
  });
  const urlTabela = () => `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/${TABELA}`;

  // Resolve com 'ok', 'duplicado' (já tinha enviado) ou 'erro'.
  async function enviar(dia, r, nome) {
    if (!configurado()) return 'erro';
    try {
      const resp = await fetch(urlTabela(), {
        method: 'POST',
        headers: { ...cabecalhos(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          dia, jogador_id: jogadorId(), nome: nome.slice(0, 24),
          premio: r.premio, acertos: r.acertos, segundos: Math.max(1, r.segundos)
        })
      });
      const status = resp.ok ? 'ok' : resp.status === 409 ? 'duplicado' : 'erro';
      if (status !== 'erro') salvar(dia, { enviado: true });
      return status;
    } catch (e) {
      return 'erro';
    }
  }

  async function buscarRanking(dia) {
    if (!configurado()) return null;
    const url = `${urlTabela()}?dia=eq.${dia}&select=jogador_id,nome,premio,segundos,acertos&order=premio.desc,segundos.asc,criado_em.asc&limit=500`;
    const resp = await fetch(url, { headers: cabecalhos() });
    if (!resp.ok) throw new Error('ranking ' + resp.status);
    return resp.json();
  }

  // Resultado de hoje que não chegou ao servidor (sem internet, por exemplo) é reenviado.
  function sincronizarPendentes(nome) {
    const r = ler(hoje());
    if (r && r.status === 'fim' && r.noRanking && !r.enviado) return enviar(hoje(), r, r.nome || nome);
    return Promise.resolve(null);
  }

  // ===== Compartilhar =====
  function textoCompartilhar(dia, r) {
    const linhas = [];
    for (let i = 0; i < r.quadrados.length; i += 8) linhas.push(r.quadrados.slice(i, i + 8).join(''));
    const endereco = /^https?:/.test(location.protocol) ? '\n' + location.origin + location.pathname : '';
    return `🟡 Sola do Milhão · Desafio de ${dataCurta(dia)}\n${linhas.join('\n')}\n💰 ${UI.dinheiro(r.premio)} · ⏱ ${UI.formatarTempo(r.segundos)}${endereco}`;
  }

  async function compartilhar(dia, r, botao) {
    const texto = textoCompartilhar(dia, r);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ text: texto });
        return;
      }
      await navigator.clipboard.writeText(texto);
      if (botao) {
        const original = botao.textContent;
        botao.textContent = '✅ Copiado!';
        setTimeout(() => { botao.textContent = original; }, 1800);
      }
    } catch (e) {
      // Sem permissão de área de transferência: mostra o texto para copiar à mão.
      UI.modal({
        titulo: 'Copie o resultado',
        conteudo: Object.assign(UI.el('pre', 'compartilhar-texto'), { textContent: texto }),
        botoes: [{ texto: 'Fechar', acao: () => UI.fecharModal() }]
      });
    }
  }

  // ===== Tela do calendário =====
  let mesVisivel = null;      // AAAA-MM-01
  let diaSelecionado = null;
  let aoJogar = () => {};

  const valorCompacto = v => (v >= 1000000 ? '1 mi' : v >= 1000 ? `${v / 1000} mil` : `R$ ${v}`);
  const MOTIVOS = {
    vitoria: '🏆 Ganhou o milhão!',
    erro: '🟥 Errou',
    parar: '✋ Parou',
    levou: '💰 Levou na aposta final',
    abandonou: '🚪 Saiu no meio'
  };

  function abrir(opcoes) {
    aoJogar = opcoes.aoJogar;
    finalizarAbandonados();
    sincronizarPendentes(opcoes.nome);
    const d = hoje();
    mesVisivel = d.slice(0, 8) + '01';
    diaSelecionado = d;
    renderizar();
    UI.mostrarTela('tela-desafio');
  }

  function renderizar() {
    renderEstatisticas();
    renderCalendario();
    renderPainel();
  }

  function renderEstatisticas() {
    const { jogados, sequencia, melhor } = estatisticas();
    const caixa = $('desafio-stats');
    caixa.innerHTML = '';
    [['🔥', sequencia, sequencia === 1 ? 'dia seguido' : 'dias seguidos'],
      ['📅', jogados, jogados === 1 ? 'desafio jogado' : 'desafios jogados'],
      ['💰', melhor ? valorCompacto(melhor) : '—', 'melhor prêmio']].forEach(([icone, valor, rotulo]) => {
      const item = UI.el('div', 'stat');
      item.append(UI.el('span', 'stat-valor', `${icone} ${valor}`), UI.el('span', 'stat-rotulo', rotulo));
      caixa.append(item);
    });
  }

  function renderCalendario() {
    const primeiro = paraData(mesVisivel);
    const nomeMes = primeiro.toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
    $('cal-mes').textContent = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
    $('cal-ant').disabled = mesVisivel <= INICIO.slice(0, 8) + '01';
    $('cal-prox').disabled = mesVisivel >= hoje().slice(0, 8) + '01';

    const grade = $('cal-dias');
    grade.innerHTML = '';
    // Semana começando na segunda-feira.
    const vazios = (primeiro.getUTCDay() + 6) % 7;
    for (let i = 0; i < vazios; i++) grade.append(UI.el('span', 'cal-vazio'));

    const tudo = todos();
    const hj = hoje();
    for (let dia = mesVisivel; dia.slice(0, 7) === mesVisivel.slice(0, 7); dia = somarDias(dia, 1)) {
      const r = tudo[dia];
      const b = UI.el('button', 'cal-dia');
      b.type = 'button';
      const indisponivel = dia < INICIO || dia > hj;
      b.disabled = indisponivel;
      if (dia === hj) b.classList.add('hoje');
      if (dia === diaSelecionado) b.classList.add('selecionado');
      if (r?.status === 'fim') b.classList.add('jogado', r.premio > 0 ? 'ganhou' : 'zerou');
      b.append(UI.el('span', 'cal-num', String(Number(dia.slice(8)))));
      if (r?.status === 'fim') b.append(UI.el('span', 'cal-premio', r.motivo === 'vitoria' ? '🏆' : valorCompacto(r.premio)));
      b.setAttribute('aria-label', dataLonga(dia) + (r?.status === 'fim' ? `, jogado, ${UI.dinheiro(r.premio)}` : ''));
      b.addEventListener('click', () => { diaSelecionado = dia; renderCalendario(); renderPainel(); });
      grade.append(b);
    }
  }

  function renderPainel() {
    const dia = diaSelecionado;
    const r = ler(dia);
    const ehHoje = dia === hoje();
    const painel = $('desafio-painel');
    painel.innerHTML = '';

    const titulo = UI.el('h3', 'painel-titulo', dataLonga(dia));
    if (ehHoje) titulo.append(UI.el('span', 'selo-hoje', 'Hoje'));
    painel.append(titulo);

    if (r?.status === 'fim') {
      const card = UI.el('div', 'resultado-dia');
      card.append(
        UI.el('p', 'resultado-motivo', MOTIVOS[r.motivo] || ''),
        UI.el('p', 'resultado-quadrados', r.quadrados.join('')),
        UI.el('p', 'resultado-premio', UI.dinheiro(r.premio)),
        UI.el('p', 'resultado-tempo', `⏱ ${UI.formatarTempo(r.segundos)} · ${r.acertos} ${r.acertos === 1 ? 'acerto' : 'acertos'}${r.noRanking ? '' : ' · fora do ranking'}`)
      );
      const btn = UI.el('button', 'btn btn-secundario', '📤 Compartilhar');
      btn.type = 'button';
      btn.addEventListener('click', () => compartilhar(dia, r, btn));
      card.append(btn);
      painel.append(card);
    } else {
      const jogar = UI.el('button', 'btn btn-principal btn-jogar-dia', ehHoje ? '▶ Jogar o desafio de hoje' : '▶ Jogar este desafio');
      jogar.type = 'button';
      jogar.addEventListener('click', () => aoJogar(dia));
      painel.append(jogar);
      painel.append(UI.el('p', 'painel-nota', ehHoje
        ? 'Você tem uma única tentativa. Se sair no meio, fica com o que já garantiu.'
        : 'Dia passado: dá para jogar, mas o resultado vale só para você (o ranking é só do próprio dia).'));
    }

    const secao = UI.el('div', 'ranking');
    secao.append(UI.el('h4', 'ranking-titulo', '🏆 Ranking do dia'));
    const corpo = UI.el('div', 'ranking-corpo');
    secao.append(corpo);
    painel.append(secao);
    carregarRanking(dia, corpo);
  }

  async function carregarRanking(dia, corpo) {
    if (!configurado()) {
      corpo.append(UI.el('p', 'painel-nota', 'Ranking online ainda não configurado.'));
      return;
    }
    corpo.append(UI.el('p', 'painel-nota', 'Carregando ranking...'));
    let linhas;
    try {
      linhas = await buscarRanking(dia);
    } catch (e) {
      corpo.innerHTML = '';
      corpo.append(UI.el('p', 'painel-nota', 'Não foi possível carregar o ranking agora. Verifique a internet.'));
      return;
    }
    if (dia !== diaSelecionado) return; // o usuário já clicou em outro dia
    corpo.innerHTML = '';
    if (!linhas.length) {
      corpo.append(UI.el('p', 'painel-nota', 'Ninguém jogou este dia ainda. Seja o primeiro!'));
      return;
    }
    const eu = jogadorId();
    const minhaPos = linhas.findIndex(l => l.jogador_id === eu);
    const lista = UI.el('ol', 'ranking-lista');
    const medalhas = ['🥇', '🥈', '🥉'];
    const mostrar = linhas.slice(0, 10);
    if (minhaPos >= 10) mostrar.push(linhas[minhaPos]);
    mostrar.forEach(l => {
      const pos = linhas.indexOf(l);
      const li = UI.el('li', 'ranking-item' + (l.jogador_id === eu ? ' eu' : ''));
      li.append(
        UI.el('span', 'ranking-pos', medalhas[pos] || `${pos + 1}º`),
        UI.el('span', 'ranking-nome', l.nome + (l.jogador_id === eu ? ' (você)' : '')),
        UI.el('span', 'ranking-tempo', UI.formatarTempo(l.segundos)),
        UI.el('span', 'ranking-premio', UI.dinheiro(l.premio))
      );
      lista.append(li);
    });
    corpo.append(lista);
    corpo.append(UI.el('p', 'painel-nota', minhaPos >= 0
      ? `Você está em ${minhaPos + 1}º de ${linhas.length} ${linhas.length === 1 ? 'jogador' : 'jogadores'}.`
      : `${linhas.length} ${linhas.length === 1 ? 'pessoa jogou' : 'pessoas jogaram'} este desafio.`));
  }

  function mudarMes(delta) {
    const d = paraData(mesVisivel);
    d.setUTCMonth(d.getUTCMonth() + delta);
    mesVisivel = paraDia(d);
    renderCalendario();
  }

  function ligarEventos() {
    $('cal-ant').addEventListener('click', () => mudarMes(-1));
    $('cal-prox').addEventListener('click', () => mudarMes(1));
  }
  document.addEventListener('DOMContentLoaded', ligarEventos);

  return {
    hoje, dataCurta, sortearPerguntas, ler, salvar, enviar, configurado,
    abrir, renderizar, compartilhar, textoCompartilhar, MOTIVOS
  };
})();
