export type GameState = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'GAME_OVER';

export interface Player {
  id: string;
  x: number;
  y: number;
  speed: number;
  maxBombs: number;
  bombsPlaced: number;
  fireRange: number;
  alive: boolean;
  color: string;
  isSpectator: boolean;
  input: { dx: number; dy: number };
}

export interface Bomb {
  id: string;
  playerId: string;
  x: number;
  y: number;
  timer: number;
  fireRange: number;
}

export interface Explosion {
  x: number;
  y: number;
  timer: number;
}

export type PowerupType = 'BOMB_UP' | 'FIRE_UP' | 'SPEED_UP';

export interface Powerup {
  id: string;
  x: number;
  y: number;
  type: PowerupType;
}

export interface GameStateData {
  state: GameState;
  countdown: number;
  players: Record<string, Player>;
  bombs: Bomb[];
  explosions: Explosion[];
  powerups: Powerup[];
  map: number[][];
}
