#!/usr/bin/env node
// Valida os bancos em perguntas/*.js: formato, alternativas, duplicatas e contagens.
// Uso: node ferramentas/validar-perguntas.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pasta = path.join(__dirname, '..', 'perguntas');
const arquivos = fs.readdirSync(pasta).filter(f => f.endsWith('.js')).sort();

const normalizar = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

let problemas = 0;
const vistos = new Map();
const porNivel = { 1: 0, 2: 0, 3: 0, 4: 0 };
const linhas = [];
let total = 0;

for (const arq of arquivos) {
  const ctx = { window: {} };
  try {
    vm.runInNewContext(fs.readFileSync(path.join(pasta, arq), 'utf8'), ctx, { filename: arq });
  } catch (e) {
    console.log(`ERRO DE SINTAXE em ${arq}: ${e.message}`);
    problemas++;
    continue;
  }
  const lista = ctx.window.PERGUNTAS || [];
  const niveis = { 1: 0, 2: 0, 3: 0, 4: 0 };
  lista.forEach((q, i) => {
    const onde = `${arq} #${i + 1}`;
    const erros = [];
    if (!q || typeof q.p !== 'string' || !q.p.trim()) erros.push('enunciado vazio');
    if (!Array.isArray(q.o) || q.o.length !== 4) erros.push('precisa de 4 alternativas');
    else {
      if (q.o.some(v => typeof v !== 'string' || !v.trim())) erros.push('alternativa vazia');
      if (new Set(q.o.map(v => v.trim().toLowerCase())).size !== 4) erros.push('alternativas repetidas');
    }
    if (![1, 2, 3, 4].includes(q.n)) erros.push(`nível inválido (${q.n})`);
    if (typeof q.c !== 'string' || !q.c.trim()) erros.push('categoria vazia');
    if (erros.length) { console.log(`${onde}: ${erros.join(', ')} — ${q && q.p}`); problemas++; return; }

    const chave = normalizar(q.p);
    if (vistos.has(chave)) { console.log(`DUPLICADA: ${onde} = ${vistos.get(chave)} — ${q.p}`); problemas++; }
    else vistos.set(chave, onde);
    niveis[q.n]++;
    porNivel[q.n]++;
  });
  total += lista.length;
  linhas.push(`${arq.padEnd(24)} ${String(lista.length).padStart(4)}   fácil ${niveis[1]}  médio ${niveis[2]}  difícil ${niveis[3]}  milhão ${niveis[4]}`);
}

console.log('\n' + linhas.join('\n'));
console.log(`\nTOTAL ${total}  —  fácil ${porNivel[1]}  médio ${porNivel[2]}  difícil ${porNivel[3]}  milhão ${porNivel[4]}`);
console.log(`Problemas: ${problemas}`);
if (total < 2000) console.log('ATENÇÃO: menos de 2000 perguntas.');
process.exit(problemas || total < 2000 ? 1 : 0);
