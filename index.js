const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Telegraf, Markup } = require("telegraf");
const input = require("input");
const notifier = require("node-notifier");
const { exec } = require("child_process");
const fs = require("fs");

// --- CONFIGURAÇÕES ---
const apiId = 35475841;
const apiHash = "08e60bdbcf8d460c340cf13908cd1b08";
const botToken = "8417921167:AAF9uyM4hnEZNsmB01CeK0143c14n_0frKc";
const seuChatId = "2006921785";
const nomeArquivo = "historico_apostas.txt";

const listaCanais = [
    "-1003608213039", 
    "-1003408795462", 
    "-1003093068325",
    "2006921785"
];

// SUA SESSÃO (Cole aqui)
const sessionStringValue = "1AQAOMTQ5LjE1NC4xNzUuNTUBu3cdHaFlUd7Muv+7NYu6HZT8wEmAsHoetX9rQ3TsttlsZrAQEaqg7AcsfSn6IKSRYUxidTXphLGLwmODirsKy02eUeK7bRuI65v+u14YRUZ+pCwvrRZS9u5m6xpTBh8SGD6qx33r2RAyP6xbbAniAz9B1OL7dK9EpU6BnyHu6DKYv65Nvmf9tw9g2DIKykS8cuTLhZKbbDGP0CrKqlbk1a+Rlnaof44cCxUf5RiGmPIZ97L2quUYHNwbaBHa3I/0eri6aQ5g596DfP6Y7EYL1DWBJCWv4vHCYdD74fq+qj5YQW5UuLdqDovgN7f95NIlKFORdh4Y65M7l3vAaEoAG5k="; 
const session = new StringSession(sessionStringValue);

const bot = new Telegraf(botToken);
let lastLink = ""; 

// Função auxiliar para salvar no arquivo evitando duplicatas
function salvarNoArquivo(linha, linkUnico) {
    // Lê o arquivo atual para ver se o link já existe
    let conteudoAtual = "";
    if (fs.existsSync(nomeArquivo)) {
        conteudoAtual = fs.readFileSync(nomeArquivo, 'utf8');
    }

    if (!conteudoAtual.includes(linkUnico)) {
        fs.appendFile(nomeArquivo, linha, (err) => {
            if (err) console.log("❌ Erro ao salvar:", err);
            else console.log("💾 Salvo no histórico.");
        });
        return true; // Retorna verdadeiro se salvou
    } else {
        return false; // Retorna falso se já existia
    }
}

(async () => {
    const client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text("Telefone (+55...): "),
        password: async () => await input.text("Senha 2FA: "),
        phoneCode: async () => await input.text("Código Telegram: "),
    });

    console.log("✅ Conectado!");
    
    // --- 1. A MÁQUINA DO TEMPO (BUSCA O PASSADO) ---
    console.log("⏳ Buscando sinais anteriores de hoje...");
    
    // Define a meia-noite de hoje (Timestamp)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const timestampMeiaNoite = Math.floor(hoje.getTime() / 1000);

    for (const canalId of listaCanais) {
        try {
            // Pega as últimas 50 mensagens de cada canal
            const historico = await client.getMessages(canalId, { limit: 50 });
            
            for (const msg of historico) {
                // Verifica se a mensagem é de hoje e tem o link
                if (msg.date >= timestampMeiaNoite) {
                    const texto = msg.message || "";
                    if (texto.includes("bet365.bet.br")) {
                        const urlRegex = /(https?:\/\/www\.bet365\.bet\.br[^\s]+)/g;
                        const matches = texto.match(urlRegex);

                        if (matches) {
                            const linkPassado = matches[0];
                            
                            // Tenta pegar o nome do canal
                            let nomeCanal = canalId;
                            try {
                                const entity = await client.getEntity(canalId);
                                nomeCanal = entity.title || entity.firstName || canalId;
                            } catch (e) {}

                            const dataMsg = new Date(msg.date * 1000).toLocaleString("pt-BR");
                            const linhaLog = `[${dataMsg}] CANAL: ${nomeCanal} | LINK: ${linkPassado}\n`;

                            // Só avisa se for novidade (função lá de cima)
                            if (salvarNoArquivo(linhaLog, linkPassado)) {
                                console.log(`🔄 Recuperado do histórico: ${linkPassado}`);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.log(`⚠️ Não consegui ler histórico do canal ${canalId} (pode ser privado/inacessível)`);
        }
    }
    console.log("🏁 Histórico processado! Iniciando monitoramento em tempo real...\n");
    // ------------------------------------------------

    // --- 2. O MONITOR EM TEMPO REAL (O FUTURO) ---
    client.addEventHandler(async (event) => {
        const message = event.message;
        if (!message) return;

        let rawId = message.chatId ? message.chatId.toString() : "";
        const idsPossiveis = [rawId, "-" + rawId, "-100" + rawId, rawId.replace("-100", "")];
        const idEncontrado = idsPossiveis.find(id => listaCanais.includes(id));

        if (idEncontrado) {
            const texto = message.message || message.caption || "";

            if (texto.includes("bet365.bet.br")) {
                const urlRegex = /(https?:\/\/www\.bet365\.bet\.br[^\s]+)/g;
                const matches = texto.match(urlRegex);

                if (matches && matches[0] !== lastLink) {
                    const linkBet365 = matches[0];
                    lastLink = linkBet365;
                    
                    let nomeCanal = idEncontrado;
                    try {
                        const entity = await client.getEntity(idEncontrado);
                        nomeCanal = entity.title || entity.firstName || idEncontrado;
                    } catch (e) {}

                    const dataHora = new Date().toLocaleString("pt-BR");
                    const linhaLog = `[${dataHora}] CANAL: ${nomeCanal} | LINK: ${linkBet365}\n`;
                    
                    // Salva no arquivo
                    salvarNoArquivo(linhaLog, linkBet365);

                    // Notificações (apenas para NOVOS sinais agora)
                    notifier.notify({
                        title: '🔥 SINAL NOVO!',
                        message: `Canal: ${nomeCanal}`,
                        sound: true,
                        wait: true
                    });

                    notifier.removeAllListeners('click');
                    notifier.on('click', () => {
                        exec(`start ${linkBet365}`);
                    });

                    await bot.telegram.sendMessage(
                        seuChatId,
                        `✅ **LINK AO VIVO**\n🏢 **Canal:** ${nomeCanal}\n🔗 ${linkBet365}`,
                        {
                            parse_mode: "Markdown",
                            ...Markup.inlineKeyboard([
                                Markup.button.url("📲 ABRIR AGORA", linkBet365)
                            ]),
                        }
                    );
                }
            }
        }
    });
})();