const crypto = require("crypto");
global.crypto = crypto;

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const axios = require("axios");
const QRCode = require("qrcode");
const express = require("express");
const {
  default: makeWASocket,
  useMultiFileAuthState,
} = require("baileys");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// 🔌 Conexão com o banco Neon
const pg = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
});

async function prepareAuthFolder() {
  await pg.connect();

  const result = await pg.query("SELECT data FROM whatsapp_auth ORDER BY id DESC LIMIT 1");

  if (result.rows.length > 0) {
    const authData = result.rows[0].data;

    // Cria pasta temporária no container
    const authPath = "/tmp/auth";
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath);
    }

    // Escreve cada arquivo de volta no /tmp/auth/
    for (const file in authData) {
      const fullPath = path.join(authPath, file);
      fs.writeFileSync(fullPath, JSON.stringify(authData[file]));
    }

    console.log("✅ Sessão restaurada do banco de dados.");
  } else {
    console.log("⚠️ Nenhuma sessão encontrada no banco. Aguarde o QR Code.");
  }

  return "/tmp/auth";
}

async function startBot() {
  const authFolder = await prepareAuthFolder();
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  // Mostra o QR Code visual
  sock.ev.on("connection.update", async ({ qr, connection }) => {
    if (qr) {
      const qrImg = await QRCode.toDataURL(qr);
      console.log("📱 ESCANEIE ESSE QR CODE NO WHATSAPP:");
      console.log(qrImg);
    }

    if (connection === "open") {
      console.log("🤖 Bot conectado ao WhatsApp!");
    }
  });

  // Salva a sessão no banco ao atualizar
  sock.ev.on("creds.update", async () => {
    const authPath = "/tmp/auth";
    const files = fs.readdirSync(authPath);

    const data = {};
    for (const file of files) {
      const content = fs.readFileSync(path.join(authPath, file), "utf8");
      data[file] = JSON.parse(content);
    }

    await pg.query("DELETE FROM whatsapp_auth");
    await pg.query("INSERT INTO whatsapp_auth (data) VALUES ($1)", [data]);

    console.log("💾 Sessão atualizada no banco Neon.");
  });

  // Recebe mensagens e envia pro n8n
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
}

startBot();

app.get("/", (_, res) => {
  res.send("🤖 Bot WhatsApp conectado com Neon!");
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor Express rodando na porta ${PORT}`);
});
