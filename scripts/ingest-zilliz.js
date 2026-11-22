// Script de ingestão para Zilliz Cloud - Clínica Essência da Pele
// Uso: node scripts/ingest-zilliz.js

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Carregar .env
function loadEnv() {
  const envPath = path.resolve("D:\\N8N_CHATS_PERSONALIZADOS\\my-belleza-journey-main\\.env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const idx = trimmed.indexOf("=");
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          let value = trimmed.slice(idx + 1).trim();
          // Remover aspas se houver
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      }
    }
  }
}
loadEnv();

// ---------- Configuração ----------
const CONFIG = {
  // Zilliz (preencha com seus dados)
  zillizUri: "https://in03-42eef7a3a5c9c83.serverless.gcp-us-west1.cloud.zilliz.com",
  zillizToken: process.env.ZILLIZ_TOKEN || "", // defina na env ou aqui
  collectionName: "clinica_rag",

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || "", // defina na env ou aqui
  embedModel: "text-embedding-3-small",
  dimensions: 768,

  // Arquivo de origem
  inputFile: "D:\\N8N_CHATS_PERSONALIZADOS\\my-belleza-journey-main\\base_de_conhecimento.md",

  // Batch
  batchSize: 50,
};

// ---------- Utilitários ----------
function env(nome) {
  return (process.env[nome] || "").replace(/[\uFEFF\u200B]/g, "").trim().replace(/^["']|["']$/g, "").trim();
}

const ZILLIZ_URI = env("ZILLIZ_URI") || CONFIG.zillizUri;
const ZILLIZ_TOKEN = env("ZILLIZ_TOKEN") || CONFIG.zillizToken;
const OPENAI_API_KEY = env("OPENAI_API_KEY") || CONFIG.openaiApiKey;

if (!ZILLIZ_TOKEN) throw new Error("ZILLIZ_TOKEN não definido (env ZILLIZ_TOKEN)");
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não definido (env OPENAI_API_KEY)");

async function openaiEmbed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: CONFIG.embedModel, input: text, dimensions: CONFIG.dimensions }),
  });
  if (!res.ok) throw new Error(`OpenAI embed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

async function zillizCreateCollection() {
  const res = await fetch(`${ZILLIZ_URI.replace(/\/$/, "")}/v2/vectordb/collections/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ZILLIZ_TOKEN}` },
    body: JSON.stringify({
      collectionName: CONFIG.collectionName,
      dimension: CONFIG.dimensions,
      metricType: "COSINE",
      consistencyLevel: "Strong",
      fields: [
        { name: "id", dataType: "Int64", isPrimaryKey: true, autoId: true },
        { name: "nome", dataType: "VarChar", maxLength: 200 },
        { name: "categoria", dataType: "VarChar", maxLength: 100 },
        { name: "tipo", dataType: "VarChar", maxLength: 100 },
        { name: "texto", dataType: "VarChar", maxLength: 65535 },
        { name: "vector", dataType: "FloatVector", dim: CONFIG.dimensions },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Zilliz create collection ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.code !== 0 && data.code !== 200) throw new Error(`Zilliz code ${data.code}: ${data.message}`);
  console.log("✅ Coleção criada:", CONFIG.collectionName);

  // Criar índice
  await fetch(`${ZILLIZ_URI.replace(/\/$/, "")}/v2/vectordb/indexes/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ZILLIZ_TOKEN}` },
    body: JSON.stringify({
      collectionName: CONFIG.collectionName,
      fieldName: "vector",
      indexName: "vector_idx",
      indexType: "AUTOINDEX",
      metricType: "COSINE",
    }),
  });
  console.log("✅ Índice criado");
}

async function zillizUpsert(rows) {
  const res = await fetch(`${ZILLIZ_URI.replace(/\/$/, "")}/v2/vectordb/entities/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ZILLIZ_TOKEN}` },
    body: JSON.stringify({
      collectionName: CONFIG.collectionName,
      data: rows,
    }),
  });
  if (!res.ok) throw new Error(`Zilliz upsert ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.code !== 0 && data.code !== 200) throw new Error(`Zilliz code ${data.code}: ${data.message}`);
  return data;
}

function gerarId(nome) {
  return crypto.createHash("md5").update(nome).digest("hex").slice(0, 24);
}

// Não usado (autoId: true no Zilliz)
// function gerarId(nome) { ... }

// ---------- Parser do Markdown ----------
function parseMarkdown(content) {
  const procedimentos = [];
  const linhas = content.split("\n");

  let atual = null;
  let secaoAtual = "";
  let buffer = [];

  function flushBuffer() {
    if (atual && buffer.length) {
      atual.texto += "\n" + buffer.join("\n").trim();
      buffer = [];
    }
  }

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const trimmed = linha.trim();

    // Detectar início de procedimento: "### Procedimento: Nome"
    const matchProc = trimmed.match(/^###\s+Procedimento:\s+(.+)$/);
    if (matchProc) {
      flushBuffer();
      atual = {
        nome: matchProc[1].trim(),
        categoria: "",
        tipo: "",
        valor: "",
        descricao: "",
        indicacoes: "",
        contraindicacoes: "",
        duracao: "",
        texto: "",
      };
      procedimentos.push(atual);
      continue;
    }

    if (!atual) continue;

    // Campos do procedimento
    if (trimmed.startsWith("* **Categoria:**")) {
      atual.categoria = trimmed.replace("* **Categoria:**", "").trim();
    } else if (trimmed.startsWith("* **Tipo:**")) {
      atual.tipo = trimmed.replace("* **Tipo:**", "").trim();
    } else if (trimmed.startsWith("* **Valor de Referência:**") || trimmed.startsWith("* **Valor:**")) {
      atual.valor = trimmed.replace("* **Valor de Referência:**", "").replace("* **Valor:**", "").trim();
    } else if (trimmed.startsWith("* **Descrição:**")) {
      atual.descricao = trimmed.replace("* **Descrição:**", "").trim();
    } else if (trimmed.startsWith("* **Principais Indicações:**")) {
      atual.indicacoes = trimmed.replace("* **Principais Indicações:**", "").trim();
    } else if (trimmed.startsWith("* **Contraindicações:**")) {
      atual.contraindicacoes = trimmed.replace("* **Contraindicações:**", "").trim();
    } else if (trimmed.startsWith("* **Duração") || trimmed.startsWith("* **Duração Média:**")) {
      atual.duracao = trimmed.replace("* **Duração Média:**", "").replace("* **Duração", "").replace(":**", "").trim();
    }
    // Linhas de continuação (indented)
    else if (trimmed && (linha.startsWith("  ") || linha.startsWith("\t"))) {
      buffer.push(trimmed);
    }
    // Linha vazia ou nova seção - flush buffer
    else if (!trimmed || trimmed.startsWith("#")) {
      flushBuffer();
    }
  }
  flushBuffer();

  // Montar texto completo para embedding
  for (const p of procedimentos) {
    const partes = [];
    partes.push(`Procedimento: ${p.nome}`);
    if (p.categoria) partes.push(`Categoria: ${p.categoria}`);
    if (p.tipo) partes.push(`Tipo: ${p.tipo}`);
    if (p.valor) partes.push(`Valor: ${p.valor}`);
    if (p.descricao) partes.push(`Descrição: ${p.descricao}`);
    if (p.indicacoes) partes.push(`Indicações: ${p.indicacoes}`);
    if (p.contraindicacoes) partes.push(`Contraindicações: ${p.contraindicacoes}`);
    if (p.duracao) partes.push(`Duração: ${p.duracao}`);
    p.texto = partes.join("\n");
  }

  return procedimentos;
}

// ---------- Main ----------
async function main() {
  console.log("📖 Lendo arquivo:", CONFIG.inputFile);
  const content = fs.readFileSync(CONFIG.inputFile, "utf-8");

  console.log("🔍 Parseando Markdown...");
  const procedimentos = parseMarkdown(content);
  console.log(`✅ ${procedimentos.length} procedimentos encontrados`);

  for (const p of procedimentos) {
    console.log(`  - ${p.nome} (${p.categoria})`);
  }

  console.log("\n🏗️  Criando coleção no Zilliz (se não existir)...");
  await zillizCreateCollection();

  console.log("\n🔄 Gerando embeddings e subindo para Zilliz...");

  const rows = [];
  let contadorId = 1;
  for (let i = 0; i < procedimentos.length; i++) {
    const p = procedimentos[i];
    console.log(`  [${i + 1}/${procedimentos.length}] ${p.nome}...`);

    const vetor = await openaiEmbed(p.texto);

    rows.push({
      id: contadorId++,
      nome: p.nome,
      categoria: p.categoria,
      tipo: p.tipo,
      texto: p.texto,
      vector: vetor,
    });

    // Batch upsert
    if (rows.length >= CONFIG.batchSize || i === procedimentos.length - 1) {
      console.log(`  📤 Enviando batch de ${rows.length}...`);
      await zillizUpsert(rows);
      rows.length = 0;
    }
  }

  console.log("\n✅ Ingestão concluída com sucesso!");
}

main().catch((e) => {
  console.error("❌ Erro:", e.message);
  process.exit(1);
});