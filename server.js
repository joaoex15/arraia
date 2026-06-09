// ============================================================
// server.js — Backend do Arraiá Corporativo
// Stack: Node.js + Express + Socket.IO
// ============================================================

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// --- Estado Global ---
// energyMax define quantos cliques equivalem a 100%
// Ajuste este valor conforme o número esperado de participantes
const ENERGY_MAX = 500;
let energyCount = 0; // Contador bruto de cliques recebidos

// Calcula a % com base no total de cliques
function getPercent() {
  return Math.min(Math.round((energyCount / ENERGY_MAX) * 100), 100);
}

// --- Servir arquivos estáticos (pasta /public) ---
app.use(express.static(path.join(__dirname, "public")));

// --- Rota: Tela do Celular ---
app.get("/celular", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "celular.html"));
});

// --- Rota: Telão do Evento ---
app.get("/telao", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "telao.html"));
});

// --- Rota raiz: redireciona para /telao ---
app.get("/", (req, res) => {
  res.redirect("/telao");
});

// --- Rota admin: reset manual via GET (ex: /admin/reset?key=arraia2025) ---
const ADMIN_KEY = process.env.ADMIN_KEY || "arraia2025";
app.get("/admin/reset", (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Chave inválida." });
  }
  energyCount = 0;
  const payload = { energy: 0, percent: 0 };
  io.emit("energy_update", payload);
  console.log("[ADMIN] Energia resetada para 0.");
  res.json({ ok: true, message: "Energia resetada!", ...payload });
});

// --- Rota admin: define energia manualmente ---
app.get("/admin/set", (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Chave inválida." });
  }
  const val = parseInt(req.query.energy, 10);
  if (isNaN(val) || val < 0) {
    return res.status(400).json({ error: "Valor inválido." });
  }
  energyCount = Math.min(val, ENERGY_MAX);
  const payload = { energy: energyCount, percent: getPercent() };
  io.emit("energy_update", payload);
  console.log(`[ADMIN] Energia definida para ${energyCount} (${payload.percent}%).`);
  res.json({ ok: true, ...payload });
});

// ============================================================
// Socket.IO — Lógica de Eventos em Tempo Real
// ============================================================
io.on("connection", (socket) => {
  const clientIp = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  console.log(`[+] Cliente conectado: ${socket.id} (${clientIp})`);

  // Ao conectar, envia o estado atual para o novo cliente
  socket.emit("energy_update", {
    energy: energyCount,
    percent: getPercent()
  });

  // --- Evento: Adicionar lenha (clique do celular) ---
  // O debounce de 200ms é feito no front-end, mas aqui também
  // podemos ter um rate-limit simples por socket
  let lastClickTime = 0;
  socket.on("add_energy", () => {
    const now = Date.now();
    // Rate-limit server-side: ignora se menos de 150ms desde o último clique deste socket
    if (now - lastClickTime < 150) return;
    lastClickTime = now;

    if (energyCount < ENERGY_MAX) {
      energyCount++;
    }

    const payload = { energy: energyCount, percent: getPercent() };

    // Emite para TODOS os clientes conectados (telão + outros celulares)
    io.emit("energy_update", payload);

    // Log a cada 10 cliques para não poluir o console
    if (energyCount % 10 === 0) {
      console.log(`[ENERGY] ${energyCount}/${ENERGY_MAX} (${payload.percent}%)`);
    }
  });

  socket.on("disconnect", () => {
    console.log(`[-] Cliente desconectado: ${socket.id}`);
  });
});

// --- Iniciar Servidor ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🔥 Arraiá Server rodando na porta ${PORT}`);
  console.log(`   Telão  → http://localhost:${PORT}/telao`);
  console.log(`   Celular → http://localhost:${PORT}/celular`);
  console.log(`   Reset  → http://localhost:${PORT}/admin/reset?key=${ADMIN_KEY}\n`);
});