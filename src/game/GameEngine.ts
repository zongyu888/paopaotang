import { Server, Socket } from "socket.io";
import { GameState, Player, Bomb, Explosion, Powerup, PowerupType, GameStateData } from "./types.js";
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE } from "./constants.js";

const FPS = 60;
const TICK_RATE = 1000 / FPS;

const PLAYER_COLORS = ["#FF4136", "#0074D9", "#2ECC40", "#FFDC00"];
const SPAWN_POINTS = [
  { x: 1, y: 1 },
  { x: MAP_WIDTH - 2, y: 1 },
  { x: 1, y: MAP_HEIGHT - 2 },
  { x: MAP_WIDTH - 2, y: MAP_HEIGHT - 2 },
];

export class GameEngine {
  private io: Server;
  private state: GameState = "LOBBY";
  private countdown: number = 10;
  private players: Record<string, Player> = {};
  private bombs: Bomb[] = [];
  private explosions: Explosion[] = [];
  private powerups: Powerup[] = [];
  private map: number[][] = [];
  private loopInterval: NodeJS.Timeout | null = null;
  private countdownInterval: NodeJS.Timeout | null = null;
  private bombIdCounter = 0;
  private powerupIdCounter = 0;

  constructor(io: Server) {
    this.io = io;
    this.initMap();
    this.startGameLoop();
  }

  private initMap() {
    this.map = Array(MAP_HEIGHT).fill(0).map(() => Array(MAP_WIDTH).fill(0));
    
    // Randomize the density of breakable bricks and solid walls
    const breakableDensity = 0.4 + Math.random() * 0.4; // 40% to 80%
    const solidDensity = 0.1 + Math.random() * 0.2; // 10% to 30% for random solid walls

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        // Outer boundary is always solid
        if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
          this.map[y][x] = 1; // Solid wall
        } 
        // Fixed grid pattern of solid walls (standard bomberman)
        else if (x % 2 === 0 && y % 2 === 0) {
          this.map[y][x] = 1; // Solid wall
        } 
        else {
          const rand = Math.random();
          if (rand < solidDensity) {
            // Some extra random solid walls for varied terrain
            this.map[y][x] = 1;
          } else if (rand < solidDensity + breakableDensity) {
            // Breakable brick
            this.map[y][x] = 2;
          }
        }
      }
    }

    // Clear spawn areas to ensure players can move
    SPAWN_POINTS.forEach((p) => {
      // Clear a 3x3 area around the spawn point
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cy = p.y + dy;
          const cx = p.x + dx;
          if (cy > 0 && cy < MAP_HEIGHT - 1 && cx > 0 && cx < MAP_WIDTH - 1) {
            // Don't remove the fixed grid walls, just the random ones and bricks
            if (!(cx % 2 === 0 && cy % 2 === 0)) {
               this.map[cy][cx] = 0;
            }
          }
        }
      }
    });
  }

  public addPlayer(socket: Socket) {
    const activePlayers = Object.values(this.players).filter((p) => !p.isSpectator);
    const isSpectator = activePlayers.length >= 4 || this.state === "PLAYING";
    
    let spawnIndex = activePlayers.length;
    if (isSpectator) spawnIndex = 0; // Spectators don't really spawn

    const player: Player = {
      id: socket.id,
      x: SPAWN_POINTS[spawnIndex]?.x * TILE_SIZE || TILE_SIZE,
      y: SPAWN_POINTS[spawnIndex]?.y * TILE_SIZE || TILE_SIZE,
      speed: 3,
      maxBombs: 1,
      bombsPlaced: 0,
      fireRange: 2,
      alive: !isSpectator,
      color: PLAYER_COLORS[spawnIndex] || "#999999",
      isSpectator,
      input: { dx: 0, dy: 0 },
    };

    this.players[socket.id] = player;
    this.checkLobbyState();
    this.broadcastState();
  }

  public removePlayer(id: string) {
    delete this.players[id];
    this.checkLobbyState();
    this.checkWinCondition();
    this.broadcastState();
  }

  private checkLobbyState() {
    if (this.state === "LOBBY") {
      const activePlayers = Object.values(this.players).filter((p) => !p.isSpectator);
      if (activePlayers.length >= 2) {
        this.startCountdown();
      }
    } else if (this.state === "COUNTDOWN") {
      const activePlayers = Object.values(this.players).filter((p) => !p.isSpectator);
      if (activePlayers.length < 2) {
        this.cancelCountdown();
      }
    }
  }

  private startCountdown() {
    this.state = "COUNTDOWN";
    this.countdown = 10;
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        this.startGame();
      }
      this.broadcastState();
    }, 1000);
  }

  private cancelCountdown() {
    this.state = "LOBBY";
    this.countdown = 10;
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.broadcastState();
  }

  private startGame() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.state = "PLAYING";
    this.initMap();
    this.bombs = [];
    this.explosions = [];
    this.powerups = [];
    
    let spawnIndex = 0;
    Object.values(this.players).forEach((p) => {
      if (!p.isSpectator) {
        p.x = SPAWN_POINTS[spawnIndex].x * TILE_SIZE;
        p.y = SPAWN_POINTS[spawnIndex].y * TILE_SIZE;
        p.alive = true;
        p.speed = 3;
        p.maxBombs = 1;
        p.bombsPlaced = 0;
        p.fireRange = 2;
        p.input = { dx: 0, dy: 0 };
        spawnIndex++;
      }
    });
    this.broadcastState();
  }

  public handlePlayerMove(id: string, data: { dx: number; dy: number }) {
    if (this.state !== "PLAYING") return;
    const player = this.players[id];
    if (!player || !player.alive || player.isSpectator) return;

    let { dx, dy } = data;
    if (dx !== 0 && dy !== 0) {
      dx = 0;
    }
    player.input = { dx: Math.sign(dx), dy: Math.sign(dy) };
  }

  public handlePlaceBomb(id: string) {
    if (this.state !== "PLAYING") return;
    const player = this.players[id];
    if (!player || !player.alive || player.isSpectator) return;

    if (player.bombsPlaced >= player.maxBombs) return;

    const tileX = Math.floor((player.x + TILE_SIZE / 2) / TILE_SIZE);
    const tileY = Math.floor((player.y + TILE_SIZE / 2) / TILE_SIZE);

    // Check if bomb already exists here
    if (this.bombs.some(b => Math.floor(b.x / TILE_SIZE) === tileX && Math.floor(b.y / TILE_SIZE) === tileY)) {
      return;
    }

    player.bombsPlaced++;
    this.bombs.push({
      id: `bomb_${this.bombIdCounter++}`,
      playerId: player.id,
      x: tileX * TILE_SIZE,
      y: tileY * TILE_SIZE,
      timer: 180, // 3 seconds at 60fps
      fireRange: player.fireRange,
    });
  }

  private startGameLoop() {
    this.loopInterval = setInterval(() => {
      this.update();
    }, TICK_RATE);
  }

  private update() {
    if (this.state !== "PLAYING") return;

    let stateChanged = false;

    // Update players
    Object.values(this.players).forEach((player) => {
      if (!player.alive || player.isSpectator) return;
      if (player.input.dx === 0 && player.input.dy === 0) return;

      const newX = player.x + player.input.dx * player.speed;
      const newY = player.y + player.input.dy * player.speed;

      const playerSize = TILE_SIZE * 0.8;
      const offset = (TILE_SIZE - playerSize) / 2;
      
      const left = newX + offset;
      const right = newX + TILE_SIZE - offset;
      const top = newY + offset;
      const bottom = newY + TILE_SIZE - offset;

      const checkCollision = (x: number, y: number) => {
        const tileX = Math.floor(x / TILE_SIZE);
        const tileY = Math.floor(y / TILE_SIZE);
        if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) return true;
        if (this.map[tileY][tileX] === 1 || this.map[tileY][tileX] === 2) return true;
        
        for (const bomb of this.bombs) {
          if (Math.floor(bomb.x / TILE_SIZE) === tileX && Math.floor(bomb.y / TILE_SIZE) === tileY) {
            const pTileX = Math.floor((player.x + TILE_SIZE/2) / TILE_SIZE);
            const pTileY = Math.floor((player.y + TILE_SIZE/2) / TILE_SIZE);
            if (pTileX === tileX && pTileY === tileY) return false;
            return true;
          }
        }
        return false;
      };

      if (!checkCollision(left, top) && !checkCollision(right, top) &&
          !checkCollision(left, bottom) && !checkCollision(right, bottom)) {
        player.x = newX;
        player.y = newY;
        stateChanged = true;
      }

      // Check powerup collection
      const pTileX = Math.floor((player.x + TILE_SIZE/2) / TILE_SIZE);
      const pTileY = Math.floor((player.y + TILE_SIZE/2) / TILE_SIZE);
      const powerupIndex = this.powerups.findIndex(p => p.x === pTileX && p.y === pTileY);
      if (powerupIndex !== -1) {
        const powerup = this.powerups[powerupIndex];
        this.powerups.splice(powerupIndex, 1);
        if (powerup.type === 'BOMB_UP') player.maxBombs++;
        if (powerup.type === 'FIRE_UP') player.fireRange++;
        if (powerup.type === 'SPEED_UP') player.speed = Math.min(player.speed + 0.5, 6);
        stateChanged = true;
      }
    });

    // Update bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      bomb.timer--;
      if (bomb.timer <= 0) {
        this.explodeBomb(bomb);
        this.bombs.splice(i, 1);
        const player = this.players[bomb.playerId];
        if (player) player.bombsPlaced--;
        stateChanged = true;
      }
    }

    // Update explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.timer--;
      if (exp.timer <= 0) {
        this.explosions.splice(i, 1);
        stateChanged = true;
      } else {
        // Check player death
        Object.values(this.players).forEach(p => {
          if (p.alive && !p.isSpectator) {
            const pTileX = Math.floor((p.x + TILE_SIZE/2) / TILE_SIZE);
            const pTileY = Math.floor((p.y + TILE_SIZE/2) / TILE_SIZE);
            if (pTileX === exp.x && pTileY === exp.y) {
              p.alive = false;
              stateChanged = true;
              this.checkWinCondition();
            }
          }
        });
      }
    }

    // We broadcast state at a fixed rate to keep clients in sync
    this.broadcastState();
  }

  private explodeBomb(bomb: Bomb) {
    const tileX = Math.floor(bomb.x / TILE_SIZE);
    const tileY = Math.floor(bomb.y / TILE_SIZE);

    const addExplosion = (x: number, y: number) => {
      this.explosions.push({ x, y, timer: 30 }); // 0.5 seconds
    };

    addExplosion(tileX, tileY);

    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];

    for (const dir of directions) {
      for (let i = 1; i <= bomb.fireRange; i++) {
        const x = tileX + dir.dx * i;
        const y = tileY + dir.dy * i;

        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) break;

        if (this.map[y][x] === 1) {
          break; // Solid wall stops explosion
        }

        if (this.map[y][x] === 2) {
          // Breakable brick
          this.map[y][x] = 0;
          addExplosion(x, y);
          
          // Chance to drop powerup
          if (Math.random() < 0.4) {
            const types: PowerupType[] = ['BOMB_UP', 'FIRE_UP', 'SPEED_UP'];
            this.powerups.push({
              id: `pu_${this.powerupIdCounter++}`,
              x,
              y,
              type: types[Math.floor(Math.random() * types.length)]
            });
          }
          break; // Brick stops explosion
        }

        // Check if explosion hits another bomb
        const otherBombIndex = this.bombs.findIndex(b => Math.floor(b.x / TILE_SIZE) === x && Math.floor(b.y / TILE_SIZE) === y);
        if (otherBombIndex !== -1) {
          const otherBomb = this.bombs[otherBombIndex];
          this.bombs.splice(otherBombIndex, 1);
          const p = this.players[otherBomb.playerId];
          if (p) p.bombsPlaced--;
          this.explodeBomb(otherBomb); // Chain reaction
          break;
        }

        addExplosion(x, y);
      }
    }
  }

  private checkWinCondition() {
    if (this.state !== "PLAYING") return;
    const alivePlayers = Object.values(this.players).filter(p => p.alive && !p.isSpectator);
    if (alivePlayers.length <= 1) {
      this.state = "GAME_OVER";
      setTimeout(() => {
        this.state = "LOBBY";
        this.checkLobbyState();
        this.broadcastState();
      }, 5000);
    }
  }

  private broadcastState() {
    const stateData: GameStateData = {
      state: this.state,
      countdown: this.countdown,
      players: this.players,
      bombs: this.bombs,
      explosions: this.explosions,
      powerups: this.powerups,
      map: this.map,
    };
    this.io.emit("gameState", stateData);
  }
}
