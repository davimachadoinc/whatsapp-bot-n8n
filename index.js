const { default: makeWASocket, useSingleFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const fs = require('fs');

const { state, saveState } = useSingleFileAuthState('./auth.json');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => res.send('WhatsApp Bot is running.'));

const startBot = async () => {
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveState);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    console.log(`📩 Nova mensagem de ${sender}: ${text}`);

    // Envia para seu webhook do n8n
    try {
      await axios.post(process.env.N8N_WEBHOOK_URL, {
        sender,
        text,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('Erro ao enviar pro n8n:', err.message);
    }
  });
};

startBot();

app.listen(PORT, () => {
  console.log(`Servidor express ouvindo na porta ${PORT}`);
});
