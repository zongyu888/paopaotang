import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameStateData, Player } from './game/types';
import { GameCanvas } from './components/GameCanvas';
import { Users, Trophy, Play, Bomb, Zap, FastForward } from 'lucide-react';

const APP_URL = (import.meta as any).env.VITE_APP_URL || window.location.origin;

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameStateData | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  
  const keysRef = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const newSocket = io(APP_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setPlayerId(newSocket.id || '');
    });

    newSocket.on('gameState', (state: GameStateData) => {
      setGameState(state);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket || !gameState || gameState.state !== 'PLAYING') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'Space') {
        socket.emit('placeBomb');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const inputInterval = setInterval(() => {
      let dx = 0;
      let dy = 0;
      
      if (keysRef.current['ArrowUp'] || keysRef.current['KeyW']) dy -= 1;
      if (keysRef.current['ArrowDown'] || keysRef.current['KeyS']) dy += 1;
      if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) dx -= 1;
      if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) dx += 1;

      socket.emit('move', { dx, dy });
    }, 1000 / 60); // 60fps input polling

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(inputInterval);
    };
  }, [socket, gameState?.state]);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center font-sans">
        <div className="animate-pulse text-xl font-medium tracking-tight">Connecting to server...</div>
      </div>
    );
  }

  const me = gameState.players[playerId];
  const activePlayers = Object.values(gameState.players as Record<string, Player>).filter(p => !p.isSpectator);
  const spectators = Object.values(gameState.players as Record<string, Player>).filter(p => p.isSpectator);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col items-center justify-center p-4">
      
      {/* Header */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-600">
          BOMBER BRAWL
        </h1>
        
        <div className="flex items-center gap-4 text-sm font-medium">
          <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
            <Users size={16} className="text-zinc-400" />
            <span>{activePlayers.length}/4 Players</span>
          </div>
          {spectators.length > 0 && (
            <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
              <span className="text-zinc-400">Spectators:</span>
              <span>{spectators.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="relative flex flex-col items-center">
        
        {/* Status Overlay */}
        {gameState.state === 'LOBBY' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg border border-white/10">
            <h2 className="text-4xl font-bold tracking-tight mb-4">Waiting for Players</h2>
            <p className="text-zinc-400 mb-8">Need at least 2 players to start.</p>
            {me?.isSpectator && (
              <div className="px-4 py-2 bg-zinc-800 rounded-full text-sm font-medium border border-zinc-700">
                You are a spectator
              </div>
            )}
          </div>
        )}

        {gameState.state === 'COUNTDOWN' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg border border-white/10">
            <h2 className="text-2xl font-medium text-zinc-300 mb-2">Game starting in</h2>
            <div className="text-8xl font-bold text-white tracking-tighter">{gameState.countdown}</div>
          </div>
        )}

        {gameState.state === 'GAME_OVER' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-lg border border-white/10">
            <Trophy size={64} className="text-yellow-500 mb-6" />
            <h2 className="text-5xl font-bold tracking-tight mb-2">Game Over</h2>
            <p className="text-xl text-zinc-400">
              {activePlayers.filter(p => p.alive).length > 0 
                ? 'We have a winner!' 
                : 'Draw! Everyone died.'}
            </p>
          </div>
        )}

        {/* The Canvas */}
        <div className="border border-zinc-800 rounded-lg overflow-hidden shadow-2xl shadow-black/50">
          <GameCanvas gameState={gameState} playerId={playerId} />
        </div>

        {/* Player Stats (if playing) */}
        {me && !me.isSpectator && gameState.state === 'PLAYING' && (
          <div className="mt-6 flex gap-6 bg-zinc-900/50 p-4 rounded-2xl border border-white/5 w-full max-w-2xl justify-center">
            <Stat icon={<Bomb size={20} />} label="Bombs" value={`${me.maxBombs - me.bombsPlaced}/${me.maxBombs}`} color="text-orange-500" />
            <Stat icon={<Zap size={20} />} label="Fire Range" value={me.fireRange} color="text-red-500" />
            <Stat icon={<FastForward size={20} />} label="Speed" value={me.speed.toFixed(1)} color="text-blue-500" />
          </div>
        )}

        {/* Controls Guide */}
        <div className="mt-8 text-center text-zinc-500 text-sm flex gap-6">
          <span><kbd className="bg-zinc-800 px-2 py-1 rounded border border-zinc-700 text-zinc-300">WASD</kbd> or <kbd className="bg-zinc-800 px-2 py-1 rounded border border-zinc-700 text-zinc-300">Arrows</kbd> to move</span>
          <span><kbd className="bg-zinc-800 px-2 py-1 rounded border border-zinc-700 text-zinc-300">Space</kbd> to place bomb</span>
        </div>

      </div>
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string | number, color: string }) {
  return (
    <div className="flex items-center gap-3 bg-zinc-950 px-4 py-2 rounded-xl border border-white/5">
      <div className={color}>{icon}</div>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</span>
        <span className="font-mono font-medium text-lg leading-none">{value}</span>
      </div>
    </div>
  );
}
