-- Base de dados do projeto (ADR-005). Horários, entidades, histórico, contactos e relatos.
-- Os locais e as entidades guardam-se como documento JSON no esquema de dados/schema/.

CREATE TABLE entidades (
  id TEXT PRIMARY KEY,
  dados TEXT NOT NULL,
  versao INTEGER NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE locais (
  id TEXT PRIMARY KEY,
  entidade_id TEXT NOT NULL,
  dados TEXT NOT NULL,
  versao INTEGER NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX locais_entidade ON locais (entidade_id);

-- Histórico: uma gravação por alteração (o equivalente a um commit) e o estado de cada
-- registo depois dela. Só cresce: os triggers recusam UPDATE e DELETE.
CREATE TABLE gravacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade_id TEXT NOT NULL,
  acao TEXT NOT NULL CHECK (acao IN ('importacao', 'confirmacao', 'alteracao', 'novo-local', 'restauro')),
  contacto_id TEXT,
  canal TEXT,
  resumo TEXT NOT NULL DEFAULT '[]',
  alertas TEXT NOT NULL DEFAULT '[]',
  restaura INTEGER,
  criado_em TEXT NOT NULL
);
CREATE INDEX gravacoes_entidade ON gravacoes (entidade_id, id);

CREATE TABLE versoes (
  gravacao_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entidade', 'local')),
  registo_id TEXT NOT NULL,
  versao INTEGER NOT NULL,
  dados TEXT NOT NULL,
  PRIMARY KEY (tipo, registo_id, versao)
);
CREATE INDEX versoes_gravacao ON versoes (gravacao_id);

CREATE TRIGGER gravacoes_imutaveis_u BEFORE UPDATE ON gravacoes
BEGIN SELECT RAISE(ABORT, 'o histórico não se altera'); END;
CREATE TRIGGER gravacoes_imutaveis_d BEFORE DELETE ON gravacoes
BEGIN SELECT RAISE(ABORT, 'o histórico não se apaga'); END;
CREATE TRIGGER versoes_imutaveis_u BEFORE UPDATE ON versoes
BEGIN SELECT RAISE(ABORT, 'o histórico não se altera'); END;
CREATE TRIGGER versoes_imutaveis_d BEFORE DELETE ON versoes
BEGIN SELECT RAISE(ABORT, 'o histórico não se apaga'); END;

-- Contactos do painel (dados pessoais: nunca no repositório).
CREATE TABLE contactos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  funcao TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'entidade')),
  estado TEXT NOT NULL,
  consentimento TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE contacto_entidades (
  contacto_id TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  PRIMARY KEY (contacto_id, entidade_id)
);

-- Sessões: só o hash SHA-256 do cookie.
CREATE TABLE sessoes (
  id TEXT PRIMARY KEY,
  contacto_id TEXT NOT NULL,
  criada_em TEXT NOT NULL,
  expira_em TEXT NOT NULL
);
CREATE INDEX sessoes_contacto ON sessoes (contacto_id);

-- Logins em curso (10 minutos): estado OAuth, verificador PKCE, nonce e página de regresso.
CREATE TABLE entradas (
  estado TEXT PRIMARY KEY,
  verificador TEXT NOT NULL,
  nonce TEXT NOT NULL,
  voltar TEXT NOT NULL,
  expira_em TEXT NOT NULL
);

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contacto_id TEXT NOT NULL,
  acao TEXT NOT NULL,
  detalhe TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

-- Relatos do público (§6.7), sem IP nem dados de quem envia.
CREATE TABLE relatos (
  id TEXT PRIMARY KEY,
  local_id TEXT,
  mensagem TEXT NOT NULL,
  idioma TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'aberto',
  criado_em TEXT NOT NULL
);

-- Guarda dos conflitos: nunca recebe linhas. Uma gravação começa por tentar inserir 1 aqui
-- quando a versão de um registo já não é a esperada; o CHECK falha e o batch inteiro é anulado.
CREATE TABLE guarda_versoes (
  conflito INTEGER CHECK (conflito = 0)
);

CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
INSERT INTO config (chave, valor) VALUES ('versao_dados', '1');
