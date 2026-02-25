import React, { useEffect, useRef } from 'react';
import { GameStateData } from '../game/types';
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE } from '../game/constants';

interface GameCanvasProps {
  gameState: GameStateData | null;
  playerId: string;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, playerId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw map
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = gameState.map[y][x];
        if (tile === 1) {
          ctx.fillStyle = '#666'; // Solid wall
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = '#444';
          ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else if (tile === 2) {
          ctx.fillStyle = '#D2691E'; // Breakable brick
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = '#8B4513';
          ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = '#A9DFBF'; // Grass/floor
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Draw powerups
    gameState.powerups.forEach((p) => {
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(p.x * TILE_SIZE + TILE_SIZE / 2, p.y * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let text = '?';
      if (p.type === 'BOMB_UP') text = 'B';
      if (p.type === 'FIRE_UP') text = 'F';
      if (p.type === 'SPEED_UP') text = 'S';
      ctx.fillText(text, p.x * TILE_SIZE + TILE_SIZE / 2, p.y * TILE_SIZE + TILE_SIZE / 2);
    });

    // Draw bombs
    gameState.bombs.forEach((b) => {
      // Pulsing effect based on timer
      const scale = 1 + Math.sin(b.timer * 0.2) * 0.1;
      const size = (TILE_SIZE * 0.8) * scale;
      
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(b.x + TILE_SIZE / 2, b.y + TILE_SIZE / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Highlight
      ctx.fillStyle = '#FF4136';
      ctx.beginPath();
      ctx.arc(b.x + TILE_SIZE / 2 - size/6, b.y + TILE_SIZE / 2 - size/6, size / 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw explosions
    gameState.explosions.forEach((e) => {
      ctx.fillStyle = 'rgba(255, 165, 0, 0.8)'; // Orange
      ctx.fillRect(e.x * TILE_SIZE, e.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      
      ctx.fillStyle = 'rgba(255, 0, 0, 0.6)'; // Red center
      ctx.fillRect(e.x * TILE_SIZE + TILE_SIZE/4, e.y * TILE_SIZE + TILE_SIZE/4, TILE_SIZE/2, TILE_SIZE/2);
    });

    // Draw players
    Object.values(gameState.players as Record<string, any>).forEach((p: any) => {
      if (!p.alive || p.isSpectator) return;
      
      const playerSize = TILE_SIZE * 0.8;
      const offset = (TILE_SIZE - playerSize) / 2;
      
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x + TILE_SIZE / 2, p.y + TILE_SIZE / 2, playerSize / 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Outline for local player
      if (p.id === playerId) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

  }, [gameState, playerId]);

  return (
    <canvas
      ref={canvasRef}
      width={MAP_WIDTH * TILE_SIZE}
      height={MAP_HEIGHT * TILE_SIZE}
      className="bg-gray-900 rounded-lg shadow-2xl"
    />
  );
};
