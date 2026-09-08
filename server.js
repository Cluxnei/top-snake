import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import { addClient, removeClient } from "./game.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// O jogo e servido atras de um proxy, sob um prefixo, e nao na raiz do
// dominio. BASE_PATH e a unica fonte dessa verdade no servidor; o cliente
// deriva o dele da URL da propria pagina, entao os dois nunca discordam.
// Vazio ("") volta a servir na raiz, que e como isto roda localmente.
const BASE_PATH = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(`${BASE_PATH}/static`, express.static(join(__dirname, "static")));
const server = createServer(app);
// O caminho do socket.io precisa viver sob o mesmo prefixo, senao o
// handshake sai para a raiz do dominio e nao chega neste processo.
const io = new Server(server, { path: `${BASE_PATH}/socket.io/` });

app.get(`${BASE_PATH}/`, (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  console.log("a user connected");
  addClient({
    socket,
  });
  socket.on("disconnect", () => {
    removeClient(socket);
    console.log("user disconnected");
  });
});

server.listen(PORT, () => {
  console.log(`server running at http://localhost:${PORT}${BASE_PATH}/`);
});
