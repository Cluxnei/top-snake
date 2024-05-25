import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import { addClient, removeClient } from "./game.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use("/static", express.static(join(__dirname, "static")));
const server = createServer(app);
const io = new Server(server);

app.get("/", (req, res) => {
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

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});
