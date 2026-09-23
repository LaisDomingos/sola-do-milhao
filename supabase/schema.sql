-- Ranking do Desafio do Dia do Sola do Milhão.
-- Rode este arquivo inteiro no Supabase: painel do projeto > SQL Editor > New query > colar > Run.

create table if not exists public.resultados_desafio (
  id bigint generated always as identity primary key,
  dia date not null,
  -- Identificador aleatório do aparelho: garante um resultado por pessoa por dia.
  jogador_id uuid not null,
  nome text not null check (char_length(btrim(nome)) between 1 and 24),
  -- Só valores que existem no jogo (prêmios, metades ao errar e zero).
  premio integer not null check (premio in (
    0, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 10000, 15000, 20000, 25000,
    30000, 40000, 50000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 1000000
  )),
  acertos smallint not null check (acertos between 0 and 16),
  segundos integer not null check (segundos between 1 and 86400),
  criado_em timestamptz not null default now(),
  unique (dia, jogador_id)
);

create index if not exists resultados_desafio_ranking
  on public.resultados_desafio (dia, premio desc, segundos asc);

-- Segurança: qualquer um pode LER o ranking e ENVIAR o próprio resultado,
-- mas ninguém consegue alterar ou apagar resultados pelo site.
alter table public.resultados_desafio enable row level security;

drop policy if exists "Qualquer um lê o ranking" on public.resultados_desafio;
create policy "Qualquer um lê o ranking"
  on public.resultados_desafio for select
  to anon, authenticated
  using (true);

-- Só aceita resultado do dia atual (com 1 dia de folga por causa de fuso horário).
drop policy if exists "Envia resultado do dia" on public.resultados_desafio;
create policy "Envia resultado do dia"
  on public.resultados_desafio for insert
  to anon, authenticated
  with check (dia between (current_date - 1) and (current_date + 1));

grant select, insert on public.resultados_desafio to anon, authenticated;
