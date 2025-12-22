const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Telegraf, Markup } = require("telegraf");
const input = require("input");
const notifier = require("node-notifier");
const { exec } = require("child_process");

// --- CONFIGURAÇÕES ---
const apiId = 35475841;
const apiHash = "08e60bdbcf8d460c340cf13908cd1b08";
const botToken = "8417921167:AAF9uyM4hnEZNsmB01CeK0143c14n_0frKc";
const seuChatId = "2006921785";

const listaCanais = [
    "-1003608213039", 
    "-1003408795462", 
    "-1003093068325",
    
];

// 1. Defina o valor da sessão (Cole aqui o texto longo após o primeiro login)
const sessionStringValue = "1AQAOMTQ5LjE1NC4xNzUuNTUBu3cdHaFlUd7Muv+7NYu6HZT8wEmAsHoetX9rQ3TsttlsZrAQEaqg7AcsfSn6IKSRYUxidTXphLGLwmODirsKy02eUeK7bRuI65v+u14YRUZ+pCwvrRZS9u5m6xpTBh8SGD6qx33r2RAyP6xbbAniAz9B1OL7dK9EpU6BnyHu6DKYv65Nvmf9tw9g2DIKykS8cuTLhZKbbDGP0CrKqlbk1a+Rlnaof44cCxUf5RiGmPIZ97L2quUYHNwbaBHa3I/0eri6aQ5g596DfP6Y7EYL1DWBJCWv4vHCYdD74fq+qj5YQW5UuLdqDovgN7f95NIlKFORdh4Y65M7l3vAaEoAG5k="; 
const session = new StringSession(sessionStringValue);

// 2. Inicialize o Bot
const bot = new Telegraf(botToken);
let lastLink = ""; 

(async () => {
    // 3. Inicialize o Cliente passando a sessão já criada
    const client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text("Telefone (+55...): "),
        password: async () => await input.text("Senha 2FA: "),
        phoneCode: async () => await input.text("Código Telegram: "),
    });

    console.log("✅ Conectado! Sessão ativa.");
    
    // IMPORTANTE: Salve esse código abaixo para não precisar logar de novo
    if (!sessionStringValue) {
        console.log("NOVA SESSÃO GERADA (COPIE E COLE NO CODIGO):");
        console.log(client.session.save());
    }

    client.addEventHandler(async (event) => {
        const message = event.message;
        if (!message) return;

        // --- CORREÇÃO DO ID (RESOLVE O [object Object]) ---
        // Pega o ID numérico bruto (BigInt) e converte para texto
        let rawId = message.chatId ? message.chatId.toString() : "";
        
        // O Telegram tem variações de ID (com -100, com -, ou puro)
        // Vamos criar as variações possíveis para testar
        const idsPossiveis = [
            rawId,                  // Ex: 123456
            "-" + rawId,            // Ex: -123456
            "-100" + rawId,         // Ex: -100123456
            rawId.replace("-100", "") // Caso já venha com prefixo
        ];

        // Tenta achar ALGUMA das variações na sua lista
        // (O 'find' procura qual dos IDs possíveis está na sua listaCanais)
        const idEncontrado = idsPossiveis.find(id => listaCanais.includes(id));

        console.log(`🔎 ID detectado: ${rawId}`); 
        
        // Se encontrou um match na lista OU se é um teste manual
        if (idEncontrado) {
            console.log(`✅ Match confirmado com o canal: ${idEncontrado}`);
            
            const texto = message.message || message.caption || "";

            if (texto.includes("bet365.bet.br")) {
                const urlRegex = /(https?:\/\/www\.bet365\.bet\.br[^\s]+)/g;
                const matches = texto.match(urlRegex);

                if (matches && matches[0] !== lastLink) {
                    const linkBet365 = matches[0];
                    lastLink = linkBet365;

                    console.log("🔥 SINAL ENCONTRADO! Disparando alertas...");

                    notifier.notify({
                        title: '🔥 NOVO SINAL DETECTADO!',
                        message: 'Clique para abrir o cupom',
                        sound: true,
                        wait: true
                    });

                    notifier.removeAllListeners('click');
                    notifier.on('click', () => {
                        exec(`start ${linkBet365}`);
                    });

                    await bot.telegram.sendMessage(
                        seuChatId,
                        `✅ **CUPOM DETECTADO**\n\nLink: ${linkBet365}`,
                        {
                            parse_mode: "Markdown",
                            ...Markup.inlineKeyboard([
                                Markup.button.url("📲 ABRIR NA BET365", linkBet365)
                            ]),
                        }
                    );
                }
            }
        } else {
            // Log para te ajudar a descobrir IDs novos
            console.log(`⚠️ ID "${rawId}" (ou variações) não está na lista. Adicione se quiser monitorar.`);
        }
    });
})();