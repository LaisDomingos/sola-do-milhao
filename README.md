# 🟡 Sola do Milhão

Jogo de perguntas e respostas inspirado no Show do Milhão, em amarelo e preto. São mais de 2.400 perguntas de conhecimentos gerais em quatro níveis de dificuldade, as ajudas clássicas, aposta final, modo festa e desafio do dia com ranking online.

Feito em HTML, CSS e JavaScript puro, sem framework e sem etapa de build obrigatória.

## Como jogar

- **16 perguntas**, de R$ 1 mil a R$ 1 milhão. Acertar leva ao próximo prêmio, parar garante o que já ganhou, e errar leva só metade.
- **Ajudas:**
  - Pular (3 vezes)
  - Cartas (eliminam de 0 a 3 alternativas erradas)
  - IA (diz a resposta)
  - Placas (a plateia vota em porcentagens e às vezes erra)
- **Aposta final:** antes de ver a pergunta do milhão, você escolhe levar R$ 500 mil ou arriscar tudo.
- **Modo festa:** de 2 a 6 jogadores se revezam no mesmo aparelho, uma pergunta por vez, com pódio no fim.
- **Desafio do dia:**
  - As mesmas 16 perguntas para todo mundo, com uma tentativa por dia.
  - Calendário, sequência de dias seguidos e ranking online.
  - Compartilhamento do resultado com quadradinhos 🟩🟥.
- As perguntas não se repetem entre partidas; o jogo guarda no aparelho quais já saíram.

## Rodando localmente

Abra o `index.html` no navegador. Para jogar sem ranking online, não precisa de mais nada.

Para ter o desafio do dia com ranking, é preciso um projeto no [Supabase](https://supabase.com):

1. No Supabase, abra **SQL Editor**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
2. Copie `.env.example` para `.env` e preencha:
   ```
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_ANON_KEY=sua-chave-publica
   ```
   Use a chave pública (`anon` ou `sb_publishable_...`), nunca a `service_role` ou a `secret`.
3. Gere a configuração com:
   ```
   npm run config
   ```
   O comando cria o `js/config.js` a partir do `.env`. O `.env` e o `js/config.js` ficam fora do Git.

## Publicando

Em qualquer hospedagem de site estático (Netlify, Render, Vercel etc.):

- **Build command:** `npm run build`
- **Pasta publicada:** a raiz do projeto
- **Variáveis de ambiente:** `SUPABASE_URL` e `SUPABASE_ANON_KEY`

## Estrutura

```
index.html                   telas do jogo
css/style.css                visual (tokens de cor em :root)
js/jogo.js                   fluxo do jogo, modo festa e aposta final
js/desafio.js                desafio do dia, calendário e ranking
js/ajudas.js                 cartas e placas
js/ui.js                     interface e falas do apresentador
js/audio.js                  efeitos sonoros (Web Audio, sem arquivos de áudio)
perguntas/*.js               bancos de perguntas, um arquivo por categoria
supabase/schema.sql          tabela e regras de segurança do ranking
ferramentas/                 validar perguntas e gerar a configuração
```

## Perguntas

Cada pergunta segue o formato `{ p: "enunciado", o: ["CORRETA", "errada", "errada", "errada"], n: 1, c: "Categoria" }`. A primeira alternativa é sempre a correta, e o jogo embaralha na hora de exibir. O campo `n` é o nível: 1 fácil, 2 médio, 3 difícil, 4 milhão.

Depois de editar, confira o banco com:

```
npm run validar
```

O comando aponta erros de formato, alternativas repetidas e perguntas duplicadas.

---

Projeto de fã, sem vínculo com o SBT, com o programa Show do Milhão ou com o canal Cortes do De Sola.
