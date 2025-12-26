require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const { Telegraf, Markup } = require("telegraf");
const { Client } = require("@notionhq/client");
const cron = require('node-cron');

const apiId = parseInt(process.env.API_ID || "35475841");
const apiHash = process.env.HASH_API;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const seuChatId = process.env.CHAT_ID;
const notionKey = process.env.NOTION_KEY;
const sessionStringValue = process.env.SESSION_STRING;

const CONFIG_CANAIS = {
  "-1003408795462": process.env.NOTION_DB_PEREZ,
  "-1003608213039": process.env.NOTION_DB_RARO,
  "-1003093068325": process.env.NOTION_DB_PAGNELLE,
};

const DB_PADRAO = process.env.NOTION_DB_GERAL || process.env.NOTION_DB_PEREZ;

const listaCanais = Object.keys(CONFIG_CANAIS);

const notionClient = new Client({ auth: notionKey });
const session = new StringSession(sessionStringValue);
const bot = new Telegraf(botToken);

async function linkJaSalvo(linkUrl, dbAlvo) {
  const linkLimpo = linkUrl.trim();

  try {
    const url = `https://api.notion.com/v1/databases/${dbAlvo}/query`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          property: "Link",
          url: { equals: linkLimpo },
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 400) {
        const responseText = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${notionKey}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filter: { property: "Link", rich_text: { equals: linkLimpo } },
          }),
        });
        const dataText = await responseText.json();
        if (dataText.results && dataText.results.length > 0) return true;
      }
      return false;
    }

    const data = await response.json();
    return data.results && data.results.length > 0;
  } catch (error) {
    console.error("❌ Erro ao checar duplicidade:", error.message);
  }
  return false;
}

async function processarSinal(client, texto, idCanal, linkEncontrado, dataMsg) {
  const nomeCasa = linkEncontrado.includes("betano") ? "🟠 BETANO" : "🟢 BET365";

  const dbDestino = CONFIG_CANAIS[idCanal] || DB_PADRAO;

  let nomeTipster = "Desconhecido";
  if (dbDestino === process.env.NOTION_DB_PEREZ) nomeTipster = "PEREZ";
  else if (dbDestino === process.env.NOTION_DB_RARO) nomeTipster = "RARO";
  else if (dbDestino === process.env.NOTION_DB_PAGNELLE) nomeTipster = "PAGNELLE";

  const jaExiste = await linkJaSalvo(linkEncontrado, dbDestino);
  if (jaExiste) {
    return;
  }

  let nomeCanalTelegram = idCanal;
  try {
    const entity = await client.getEntity(idCanal);
    nomeCanalTelegram = entity.title || entity.firstName || idCanal;
  } catch (e) {}

  console.log(`📤 Novo Sinal [${nomeTipster}]: ${linkEncontrado}`);

  try {
    await notionClient.pages.create({
      parent: { database_id: dbDestino },
      properties: {
        Nome: { title: [{ text: { content: `${nomeCasa} - ${nomeCanalTelegram}` } }] },
        Link: { url: linkEncontrado },
        Usado: { checkbox: false },
      },
    });
    console.log(`✅ Salvo na tabela ${nomeTipster}!`);

    await bot.telegram.sendMessage(
      seuChatId,
      `⏰ **SINAL ${nomeTipster}**\n📅 ${dataMsg}\n🏠 ${nomeCasa}\n🔗 ${linkEncontrado}`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([Markup.button.url("📲 ABRIR", linkEncontrado)]),
      },
    );
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      console.error("🚨 ERRO TELEGRAM: Dê /start no seu bot!");
    } else {
      console.error("❌ Erro ao salvar/enviar:", error.message);
    }
  }
}

async function buscarHistorico(client) {
  console.log("⏳ Lendo histórico (Perez, Raro, Pagnelle)...");
  const hoje8h = new Date();
  hoje8h.setHours(8, 0, 0, 0);
  const timestamp8h = Math.floor(hoje8h.getTime() / 1000);

  for (const canalId of listaCanais) {
    try {
      const msgs = await client.getMessages(canalId, { limit: 50 });
      for (const msg of msgs.reverse()) {
        if (msg.date >= timestamp8h) {
          const texto = msg.message || "";
          if (texto.match(/bet365|betano/i)) {
            const matches = texto.match(/(https?:\/\/[^\s]*(?:bet365|betano)[^\s]*)/gi);
            if (matches) {
              const dataFormatada = new Date(msg.date * 1000).toLocaleString("pt-BR");
              await processarSinal(client, texto, canalId, matches[0], dataFormatada);
            }
          }
        }
      }
    } catch (e) {
      console.log(`Erro ao ler histórico (${canalId}): ${e.message}`);
    }
  }
  console.log("🏁 Monitoramento Ao Vivo Iniciado...\n");
}

(async () => {
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
  await client.connect();
  console.log("🤖 Sistema Multi-Tabelas Iniciado!");

  await buscarHistorico(client);

  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message) return;

    let rawId = message.chatId ? message.chatId.toString() : "";
    const idsPossiveis = [rawId, "-" + rawId, "-100" + rawId, rawId.replace("-100", "")];

    const idEncontrado = idsPossiveis.find((id) => listaCanais.includes(id));

    if (idEncontrado) {
      const texto = message.message || message.caption || "";
      if (texto.match(/bet365|betano/i)) {
        const matches = texto.match(/(https?:\/\/[^\s]*(?:bet365|betano)[^\s]*)/gi);
        if (matches) {
          const dataAgora = new Date().toLocaleString("pt-BR");
          await processarSinal(client, texto, idEncontrado, matches[0], dataAgora);
        }
      }
    }
  }, new NewMessage({}));
})();


// Função para limpar uma tabela específica
async function limparTabela(databaseId, nomeTabela) {
    console.log(`🧹 Iniciando limpeza da tabela: ${nomeTabela}...`);
    try {
        // 1. Busca todos os itens da tabela
        const response = await notionClient.databases.query({
            database_id: databaseId,
        });

        // 2. Arquiva cada item encontrado
        for (const page of response.results) {
            await notionClient.pages.update({
                page_id: page.id,
                archived: true, // Isso "deleta" a linha da visualização
            });
        }
        console.log(`✅ Tabela ${nomeTabela} limpa com sucesso!`);
    } catch (error) {
        console.error(`❌ Erro ao limpar tabela ${nomeTabela}:`, error.message);
    }
}

// Agendamento: Roda todos os dias às 04:00 da manhã
// Formato: (Minuto Hora Dia Mês Dia_da_Semana)
cron.schedule('0 4 * * *', async () => {
    console.log("⏰ Horário de limpeza atingido (04:00). Processando...");
    
    await limparTabela(process.env.NOTION_DB_PEREZ, "PEREZ");
    await limparTabela(process.env.NOTION_DB_RARO, "RARO");
    await limparTabela(process.env.NOTION_DB_PAGNELLE, "PAGNELLE");
    
    console.log("🏁 Faxina diária concluída!");
}, {
    scheduled: true,
    timezone: "America/Sao_Paulo" // Garante que rode no horário de Brasília
});