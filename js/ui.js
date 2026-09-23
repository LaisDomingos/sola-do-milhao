// Renderização da interface: telas, pergunta, escada, ajudas, modais e falas.
const UI = (() => {
  const $ = id => document.getElementById(id);
  const LETRAS = ['1', '2', '3', '4'];

  const el = (tag, classe, texto) => {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  };

  const dinheiro = v => 'R$ ' + v.toLocaleString('pt-BR');
  const curto = v => {
    if (v >= 1000000) return v / 1000000 + ' MILHÃO';
    if (v >= 1000) return v / 1000 + ' MIL';
    return String(v);
  };

  let aoFecharModal = null;

  return {
    el,
    dinheiro,
    curto,

    mostrarTela(id) {
      document.querySelectorAll('.tela').forEach(t => t.classList.toggle('ativa', t.id === id));
      window.scrollTo(0, 0);
    },

    montarEscada(premios) {
      const ol = $('escada');
      ol.innerHTML = '';
      premios.forEach((v, i) => {
        const li = el('li', 'degrau');
        if (i === 4 || i === 9 || i === 14) li.classList.add('marco');
        if (i === premios.length - 1) li.classList.add('milhao');
        li.append(el('span', 'degrau-num', String(i + 1)), el('span', 'degrau-valor', curto(v)));
        ol.append(li);
      });
    },

    atualizarEscada(atual) {
      const itens = $('escada').children;
      [...itens].forEach((li, i) => {
        li.classList.toggle('atual', i === atual);
        li.classList.toggle('passado', i < atual);
      });
      const li = itens[atual];
      if (li && getComputedStyle($('escada')).flexDirection === 'row') {
        const caixa = $('escada').parentElement;
        caixa.scrollTo({ left: li.offsetLeft - caixa.clientWidth / 2 + li.clientWidth / 2, behavior: 'smooth' });
      }
    },

    renderPergunta({ numero, total, texto, alternativas, milhao, aoEscolher }) {
      $('pergunta-num').textContent = milhao ? 'PERGUNTA DO MILHÃO' : `Pergunta ${numero} de ${total}`;
      $('pergunta-texto').textContent = texto;
      document.querySelector('.pergunta-painel').classList.toggle('milhao', !!milhao);

      const caixa = $('alternativas');
      caixa.innerHTML = '';
      alternativas.forEach((txt, i) => {
        const b = el('button', 'alt');
        b.type = 'button';
        b.dataset.idx = i;
        b.append(el('span', 'alt-num', LETRAS[i]), el('span', 'alt-texto', txt));
        b.addEventListener('click', () => aoEscolher(i));
        caixa.append(b);
      });
    },

    botaoAlt: i => $('alternativas').children[i],

    marcar(i, classe) { this.botaoAlt(i)?.classList.add(classe); },
    desmarcar(i, classe) { this.botaoAlt(i)?.classList.remove(classe); },

    travarAlternativas(travar) {
      [...$('alternativas').children].forEach(b => {
        b.disabled = travar || b.classList.contains('eliminada');
      });
    },

    eliminar(indices) {
      indices.forEach(i => {
        const b = this.botaoAlt(i);
        if (!b) return;
        b.classList.add('eliminada');
        b.disabled = true;
      });
    },

    valores(errar, parar, acertar) {
      $('v-errar').textContent = dinheiro(errar);
      $('v-parar').textContent = dinheiro(parar);
      $('v-acertar').textContent = dinheiro(acertar);
    },

    falar(texto) { $('fala').textContent = texto; },

    formatarTempo(segundos) {
      const h = Math.floor(segundos / 3600);
      const m = String(Math.floor(segundos / 60) % 60).padStart(2, '0');
      const s = String(segundos % 60).padStart(2, '0');
      return h ? `${h}:${m}:${s}` : `${m}:${s}`;
    },

    tempo(segundos) { $('tempo-jogo').textContent = this.formatarTempo(segundos); },

    // estado: { pular, cartas, ia, placas, bloqueadas, travado, semParar }
    ajudas(estado) {
      const { bloqueadas, travado } = estado;
      $('cont-pular').textContent = estado.pular;
      const set = (id, disponivel) => {
        const b = $(id);
        b.disabled = bloqueadas || travado || !disponivel;
        b.classList.toggle('usada', !disponivel);
        b.title = bloqueadas ? 'Na pergunta do milhão não há ajudas' : (disponivel ? '' : 'Ajuda já utilizada');
      };
      set('aj-pular', estado.pular > 0);
      set('aj-cartas', estado.cartas);
      set('aj-ia', estado.ia);
      set('aj-placas', estado.placas);
      $('btn-parar').disabled = !!travado || !!estado.semParar;
      $('btn-parar').title = estado.semParar ? 'Você arriscou tudo: não dá mais para parar!' : '';
    },

    // botoes: [{ texto, classe, acao }]; conteudo: Node ou string; fixo: não fecha com Esc
    modal({ titulo, conteudo, botoes = [], aoFechar = null, fixo = false }) {
      $('modal').dataset.fixo = fixo ? '1' : '';
      $('modal-titulo').textContent = titulo;
      const corpo = $('modal-corpo');
      corpo.innerHTML = '';
      if (typeof conteudo === 'string') corpo.append(el('p', null, conteudo));
      else if (conteudo) corpo.append(conteudo);

      const rodape = $('modal-botoes');
      rodape.innerHTML = '';
      botoes.forEach(({ texto, classe = 'btn-principal', acao }) => {
        const b = el('button', 'btn ' + classe, texto);
        b.type = 'button';
        b.addEventListener('click', () => acao && acao());
        rodape.append(b);
      });
      aoFecharModal = aoFechar;
      $('modal').hidden = false;
      const primeiro = rodape.querySelector('button') || corpo.querySelector('button');
      if (primeiro) primeiro.focus();
    },

    fecharModal() {
      $('modal').hidden = true;
      const cb = aoFecharModal;
      aoFecharModal = null;
      if (cb) cb();
    },

    modalAberto: () => !$('modal').hidden,
    modalFixo: () => $('modal').dataset.fixo === '1',

    confete(id = 'confete') {
      const caixa = $(id);
      caixa.innerHTML = '';
      const cores = ['#FFD000', '#FFFFFF', '#FFE45C', '#C9A000', '#22C55E'];
      for (let i = 0; i < 120; i++) {
        const c = el('i');
        c.style.left = Math.random() * 100 + '%';
        c.style.background = cores[i % cores.length];
        c.style.animationDuration = 2.5 + Math.random() * 3 + 's';
        c.style.animationDelay = Math.random() * 2 + 's';
        c.style.transform = `rotate(${Math.random() * 360}deg)`;
        caixa.append(c);
      }
    },

    limparConfete(id = 'confete') { $(id).innerHTML = ''; }
  };
})();

// Falas do apresentador. {nome} e {valor} são substituídos.
const FALAS = {
  inicio: ['Olá, {nome}! Seja bem-vindo ao Sola do Milhão!', 'Vamos lá, {nome}! Preparado para ganhar um milhão de reais no Sola do Milhão?', 'Aperta o cadarço, {nome}, que o Sola do Milhão vai começar!'],
  primeira: ['Primeira pergunta, {nome}, valendo {valor}!', 'Vamos começar! Primeira pergunta valendo {valor}.'],
  pergunta: ['Pergunta valendo {valor}!', 'Atenção, {nome}: valendo {valor}!', 'Vamos para a próxima, valendo {valor}.', 'Olha a pergunta, {nome}, valendo {valor}!'],
  milhao: ['Atenção, {nome}! Esta é a pergunta que vale UM MILHÃO DE REAIS! Não há ajudas agora.'],
  confirmar: ['Está certo disso, {nome}?', 'Posso perguntar? Está certo disso?', 'Vai nessa mesmo, {nome}?', 'Tem certeza absoluta?'],
  acerto: ['Certa resposta!', 'Certa resposta, {nome}! Muito bem!', 'Acertou! Você está com {valor}!', 'É isso aí! Certa resposta!', 'Aí sim, {nome}! Você é fera demais!', 'Uhuul! Certa resposta! A plateia foi à loucura!', 'Olha só, temos um gênio aqui! Certa resposta!'],
  erro: ['Que pena, {nome}... resposta errada!', 'Ih, errou! Não foi dessa vez.', 'Resposta errada, {nome}!', 'Eita! Pisou na bola, {nome}!', 'Poxa vida... essa escorregou!'],
  incentivo: ['Bora, {nome}, essa você tira de letra!', 'Respira fundo e confia no seu taco!', 'A plateia inteira está torcendo por você, {nome}!', 'Vai com calma, que o milhão está chegando!', 'Presta atenção, que essa vale ouro!', 'Tô sentindo que você manda bem nessa, {nome}!'],
  cascaGrossa: ['Eita! Essa aqui é casca grossa, hein, {nome}!', 'Opa, caiu uma das difíceis! Mostra do que você é capaz!', 'Segura essa, {nome}! Pergunta cabeluda chegando!'],
  espera: ['E aí, {nome}? Vai responder ou vai ficar me olhando?', 'Não tem tempo contando, mas a plateia já está bocejando!', 'Pensa com carinho, {nome}... mas pensa um pouquinho mais rápido!', 'Se não souber, usa uma ajuda! É pra isso que elas estão aí!', 'Tô vendo essa cara de dúvida, {nome}! Vai no instinto!', 'O milhão não vai se ganhar sozinho, hein!'],
  desafio: ['Bem-vindo ao Desafio do Dia, {nome}! São as mesmas perguntas para todo mundo hoje. Mostra quem manda!', 'Desafio do Dia valendo, {nome}! Uma tentativa só, então capricha!'],
  vez: ['Sua vez, {nome}! Mostra pra turma como se faz!', 'Chegou a hora, {nome}! A galera está de olho!', 'Vai, {nome}! Não deixa a turma te passar!', 'Bora, {nome}! Hora de fazer bonito!'],
  aposta: ['Chegou a hora da verdade, {nome}! Leva o que já ganhou ou arrisca tudo pelo milhão?', 'Momento decisivo, {nome}! Vai de garantido ou vai com tudo?'],
  arriscou: ['Corajoso demais! Valendo UM MILHÃO DE REAIS, sem ajudas e sem volta!', 'Arriscou tudo! Agora é você e a pergunta do milhão, {nome}!'],
  levou: ['Decisão segura! {nome} leva {valor} pra casa!', 'Juízo! {nome} garantiu {valor}!'],
  pular: ['Pulou! Vamos para outra pergunta.', 'Tudo bem, {nome}, vamos trocar de pergunta.'],
  cartas: ['Escolha uma carta, {nome}!'],
  ia: ['Vamos perguntar para a inteligência artificial!', 'Chama a IA, {nome}! Ela vai te dar a resposta.'],
  placas: ['Plateia, levantem as placas!', 'Vamos ver o que a plateia acha, {nome}!'],
  parar: ['{nome} resolveu parar e leva {valor}!']
};
