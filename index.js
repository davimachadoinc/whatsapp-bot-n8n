const crypto = require("crypto");
global.crypto = crypto;

const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");
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
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ qr, connection, lastDisconnect }) => {
    if (qr) {
      // Gera QR visual
      const url = await QRCode.toDataURL(qr);
      console.log("\n📱 ESCANEIE ESSE QR CODE NO SEU WHATSAPP:\n");
      console.log(url); // você pode colar essa URL em qualquer navegador!
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("🔌 Conexão encerrada:", reason);
      startBot();
    } else if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    console.log(`📩 Mensagem de ${sender}: ${text}`);

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
  res.send("🤖 Bot WhatsApp rodando com QR visual!");
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor Express escutando na porta ${PORT}`);
});
