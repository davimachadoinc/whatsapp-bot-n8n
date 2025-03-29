const crypto = require("crypto");
global.crypto = crypto;

const express = require("express");
const axios = require("axios");
const qrcode = require("qrcode-terminal");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("baileys");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, // desativa QR automático
  });

  sock.ev.on("creds.update", saveCreds);

  // Mostra o QR code no terminal
  sock.ev.on("connection.update", ({ qr, connection, lastDisconnect }) => {
    if (qr) {
      qrcode.generate(qr, { small: true });
      console.log("📱 Escaneie o QR code acima com seu WhatsApp.");
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("🔌 Conexão encerrada:", reason);
      // Tenta reconectar
      startBot();
    } else if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!");
    }
  });

  // Escuta novas mensagens
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    console.log(`📩 Mensagem de ${sender}: ${text}`);

    // Envia pro webhook do n8n
    try {
      await axios.post(N8N_WEBHOOK_URL, {
        sender,
        text,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error("❌ Erro ao enviar pro n8n:", err.message);
    }
  });
};

startBot();

app.get("/", (_, res) => {
  res.send("🤖 Bot WhatsApp rodando no Render!");
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor Express escutando na porta ${PORT}`);
});
