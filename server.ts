import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import { GameEngine } from "./src/game/GameEngine.js";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Game state
  const gameEngine = new GameEngine(io);

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    gameEngine.addPlayer(socket);

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      gameEngine.removePlayer(socket.id);
    });

    socket.on("move", (data) => {
      gameEngine.handlePlayerMove(socket.id, data);
    });

    socket.on("placeBomb", () => {
      gameEngine.handlePlaceBomb(socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
