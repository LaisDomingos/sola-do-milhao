#!/usr/bin/env node
// Gera js/config.js a partir do .env (ou de variáveis de ambiente, útil no deploy).
// Uso: node ferramentas/gerar-config.js
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const arquivoEnv = path.join(raiz, '.env');
const destino = path.join(raiz, 'js', 'config.js');

// Lê o .env: linhas CHAVE=valor, ignorando comentários e aspas em volta do valor.
function lerEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return {};
  return Object.fromEntries(fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')];
    }));
}

// Variáveis de ambiente do sistema (ex.: painel da hospedagem) têm prioridade sobre o .env.
const env = { ...lerEnv(arquivoEnv), ...process.env };
// Aceita a URL copiada com o caminho da API (…supabase.co/rest/v1/) e guarda só a base.
const url = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const chave = (env.SUPABASE_ANON_KEY || '').trim();

function erro(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

// Descobre o "role" de uma chave JWT (anon, service_role...) sem validar a assinatura.
function roleDoJwt(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role;
  } catch (e) {
    return null;
  }
}

if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) {
  erro(`SUPABASE_URL parece errada: "${url}". O formato esperado é https://xxxx.supabase.co`);
}
if (chave.startsWith('sb_secret_') || roleDoJwt(chave) === 'service_role') {
  erro('Essa é a chave SECRETA (service_role/secret). Use a chave pública "anon" ou "publishable".');
}
if (chave && !chave.startsWith('sb_publishable_') && roleDoJwt(chave) !== 'anon') {
  erro('SUPABASE_ANON_KEY não parece ser a chave pública do Supabase (anon eyJ... ou sb_publishable_...).');
}
if (Boolean(url) !== Boolean(chave)) {
  erro('Preencha as duas: SUPABASE_URL e SUPABASE_ANON_KEY (ou deixe as duas vazias para jogar sem ranking).');
}

const conteudo = `// ARQUIVO GERADO por ferramentas/gerar-config.js a partir do .env. Não edite à mão.
// A chave aqui é a pública (anon/publishable): quem protege o banco são as regras de supabase/schema.sql.
window.SOLA_CONFIG = {
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(chave)}
};
`;
fs.writeFileSync(destino, conteudo);
console.log(url
  ? `✔ js/config.js gerado com o projeto ${url}. Ranking online ativado.`
  : '✔ js/config.js gerado sem Supabase (ranking online desativado). Preencha o .env para ativar.');
