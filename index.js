const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore } = require("baileys");
const axios = require("axios");
const express = require("express");
const fs = require("fs");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// Inicializa o bot
const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    console.log(`📩 Nova mensagem de ${sender}: ${text}`);

    try {
      await axios.post(N8N_WEBHOOK_URL, {
        sender,
        text,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error("Erro ao enviar pro n8n:", err.message);
    }
  });
};

startBot();

app.get("/", (_, res) => res.send("Bot WhatsApp rodando..."));

app.listen(PORT, () => {
  console.log(`Servidor Express escutando na porta ${PORT}`);
});
