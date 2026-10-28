import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Sparkles, Trophy, Anchor } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface CraneStackGameProps {
  onFinish: (score: number) => void;
}

interface Block {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  type: string;
}

interface FallingPiece {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

const BLOCK_TYPES = [
  { name: "선저 외판 블록", color: "#003876" }, // HD Navy
  { name: "이중저 구조 블록", color: "#005696" },
  { name: "화물창 격벽 블록", color: "#007AFF" },
  { name: "LNG 극저온 탱크", color: "#00A352" }, // HD Green
  { name: "메인 엔진 블록", color: "#E05A47" },
  { name: "상갑판 외판 블록", color: "#4A90E2" },
  { name: "스마트 휠하우스 블록", color: "#F5A623" },
  { name: "친환경 윙 세일 블록", color: "#50E3C2" },
];

export default function CraneStackGame({ onFinish }: CraneStackGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [feedbackText, setFeedbackText] = useState<{ text: string; color: string; scale: number } | null>(null);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  // Game internal mutable state
  const stateRef = useRef({
    score: 0,
    combo: 0,
    maxCombo: 0,
    blocks: [] as Block[],
    currentBlock: {
      x: 0,
      y: 0,
      width: 160,
      height: 26,
      vx: 3.5,
      color: BLOCK_TYPES[0].color,
      type: BLOCK_TYPES[0].name,
    },
    fallingPieces: [] as FallingPiece[],
    particles: [] as Particle[],
    cameraY: 0,
    targetCameraY: 0,
    craneX: 0,
    shake: 0,
    baseY: 0,
    width: 600,
    height: 520,
  });

  const animFrameRef = useRef<number | null>(null);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    const s = stateRef.current;
    s.score = 0;
    s.combo = 0;
    s.maxCombo = 0;
    s.cameraY = 0;
    s.targetCameraY = 0;
    s.fallingPieces = [];
    s.particles = [];
    s.shake = 0;

    const baseWidth = 180;
    const blockHeight = 26;
    const initialY = s.height - 70;
    s.baseY = initialY;

    // Base dock platform
    s.blocks = [
      {
        x: s.width / 2 - baseWidth / 2,
        y: initialY,
        width: baseWidth,
        height: blockHeight,
        color: "#1D1D1F",
        type: "제1도크 기저 기초",
      },
    ];

    // First moving block
    s.currentBlock = {
      x: 50,
      y: initialY - blockHeight,
      width: baseWidth,
      height: blockHeight,
      vx: 3.2,
      color: BLOCK_TYPES[1 % BLOCK_TYPES.length].color,
      type: BLOCK_TYPES[1 % BLOCK_TYPES.length].name,
    };

    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setFeedbackText(null);
    setGameState("PLAYING");
    gameAudio.playClick();
  };

  const spawnParticles = (x: number, y: number, color: string, count: number = 18) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      stateRef.current.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        color,
        size: Math.random() * 4 + 2,
        life: 0,
        maxLife: Math.random() * 25 + 20,
      });
    }
  };

  const dropBlock = () => {
    const s = stateRef.current;
    if (gameState !== "PLAYING") return;

    const topBlock = s.blocks[s.blocks.length - 1];
    const curr = s.currentBlock;
    const diff = curr.x - topBlock.x;
    const absDiff = Math.abs(diff);

    // Tolerance for "PERFECT" placement
    const tolerance = 4;

    if (absDiff <= tolerance) {
      // Perfect landing!
      curr.x = topBlock.x; // snap exactly
      const newCombo = s.combo + 1;
      s.combo = newCombo;
      if (newCombo > s.maxCombo) s.maxCombo = newCombo;
      s.score += 100 * newCombo;

      // Slight width recovery on combo 3+
      if (newCombo >= 3 && curr.width < 180) {
        curr.width = Math.min(180, curr.width + 8);
      }

      gameAudio.playPerfect(newCombo);
      spawnParticles(curr.x + curr.width / 2, curr.y + curr.height, "#FFD700", 25);
      setFeedbackText({ text: `PERFECT! x${newCombo}`, color: "#FFD700", scale: 1.4 });

      // If combo is high, confetti pop
      if (newCombo % 5 === 0) {
        confetti({
          particleCount: 30,
          spread: 60,
          origin: { y: 0.6 },
        });
      }
    } else if (absDiff < curr.width) {
      // Sliced overhang
      s.combo = 0;
      s.score += 50;
      gameAudio.playSlice();

      let placedWidth = curr.width - absDiff;
      let placedX = diff > 0 ? curr.x : topBlock.x;
      let overhangWidth = absDiff;
      let overhangX = diff > 0 ? curr.x + placedWidth : curr.x;

      curr.width = placedWidth;
      curr.x = placedX;

      // Add falling piece
      s.fallingPieces.push({
        x: overhangX,
        y: curr.y,
        width: overhangWidth,
        height: curr.height,
        color: curr.color,
        vx: (diff > 0 ? 1 : -1) * (Math.random() * 2 + 1.5),
        vy: 1,
        angle: 0,
        vAngle: (diff > 0 ? 0.08 : -0.08),
      });

      spawnParticles(overhangX + (diff > 0 ? 0 : overhangWidth), curr.y + curr.height / 2, "#FFFFFF", 12);
      setFeedbackText({ text: "GOOD!", color: "#007AFF", scale: 1.1 });
    } else {
      // Complete miss!
      s.fallingPieces.push({
        x: curr.x,
        y: curr.y,
        width: curr.width,
        height: curr.height,
        color: curr.color,
        vx: curr.vx * 0.8,
        vy: 2,
        angle: 0,
        vAngle: curr.vx > 0 ? 0.05 : -0.05,
      });

      s.shake = 15;
      gameAudio.playGameOver();
      endGame();
      return;
    }

    // Push block to stack
    s.blocks.push({
      x: curr.x,
      y: curr.y,
      width: curr.width,
      height: curr.height,
      color: curr.color,
      type: curr.type,
    });

    // Speed scales gently with height
    const blockCount = s.blocks.length;
    const nextSpeed = Math.min(8.5, 3.2 + blockCount * 0.12);
    const nextTypeIdx = blockCount % BLOCK_TYPES.length;

    // Next block
    s.currentBlock = {
      x: Math.random() > 0.5 ? 20 : s.width - curr.width - 20,
      y: curr.y - curr.height,
      width: curr.width,
      height: curr.height,
      vx: (Math.random() > 0.5 ? 1 : -1) * nextSpeed,
      color: BLOCK_TYPES[nextTypeIdx].color,
      type: BLOCK_TYPES[nextTypeIdx].name,
    };

    // Camera targets moving up to show the top 8 blocks nicely
    if (s.blocks.length > 5) {
      s.targetCameraY = (s.blocks.length - 5) * curr.height;
    }

    setScore(s.score);
    setCombo(s.combo);
    setMaxCombo(s.maxCombo);
  };

  const endGame = () => {
    const s = stateRef.current;
    setGameState("GAMEOVER");
    onFinish(s.score);

    if (s.score >= 1000) {
      confetti({
        particleCount: 70,
        spread: 80,
        origin: { y: 0.5 },
      });
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowDown") {
        e.preventDefault();
        if (gameState === "PLAYING") {
          dropBlock();
        } else if (gameState === "READY" || gameState === "GAMEOVER") {
          startGame();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState]);

  // Main 60fps game animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;
      const s = stateRef.current;

      // Handle screen shake
      if (s.shake > 0) {
        s.shake *= 0.88;
        if (s.shake < 0.2) s.shake = 0;
      }

      // Smooth camera interpolation
      s.cameraY += (s.targetCameraY - s.cameraY) * 0.1;

      ctx.save();
      ctx.clearRect(0, 0, s.width, s.height);

      if (s.shake > 0) {
        ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
      }

      // --- Draw Shipyard Sky & Background ---
      // Sky gradient shifting from shipyard blue to sunset as you get higher
      const heightFactor = Math.min(1, s.blocks.length / 40);
      const grad = ctx.createLinearGradient(0, 0, 0, s.height);
      if (heightFactor < 0.5) {
        grad.addColorStop(0, "#E8F2FA");
        grad.addColorStop(1, "#C2DEFA");
      } else {
        grad.addColorStop(0, "#2D3748");
        grad.addColorStop(1, "#E28743");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s.width, s.height);

      // Sea horizon at bottom
      const oceanY = s.baseY + 30 + s.cameraY;
      if (oceanY < s.height) {
        ctx.fillStyle = "#0D5287";
        ctx.fillRect(0, oceanY, s.width, s.height - oceanY);

        // Water waves
        ctx.fillStyle = "#1976D2";
        ctx.beginPath();
        ctx.ellipse(s.width * 0.3, oceanY + 8, 80, 4, 0, 0, Math.PI * 2);
        ctx.ellipse(s.width * 0.7, oceanY + 14, 110, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Distant Shipyard Crane Silhouettes
      ctx.fillStyle = "rgba(0, 56, 118, 0.12)";
      // Crane tower 1
      ctx.fillRect(40, 120 + s.cameraY * 0.2, 14, 250);
      ctx.fillRect(20, 120 + s.cameraY * 0.2, 120, 10);
      // Crane tower 2
      ctx.fillRect(s.width - 90, 80 + s.cameraY * 0.2, 16, 300);
      ctx.fillRect(s.width - 160, 80 + s.cameraY * 0.2, 140, 12);

      // --- Apply Camera Offset for World Objects ---
      ctx.save();
      ctx.translate(0, s.cameraY);

      // 1. Draw Drydock Base (도크 기저 플랫폼)
      const baseBlock = s.blocks[0];
      if (baseBlock) {
        ctx.fillStyle = "#2D3748";
        ctx.fillRect(baseBlock.x - 20, baseBlock.y, baseBlock.width + 40, baseBlock.height);
        // Yellow safety hazard stripes on dock
        ctx.fillStyle = "#F5A623";
        for (let x = baseBlock.x - 20; x < baseBlock.x + baseBlock.width + 20; x += 18) {
          ctx.beginPath();
          ctx.moveTo(x, baseBlock.y + baseBlock.height);
          ctx.lineTo(x + 8, baseBlock.y + baseBlock.height);
          ctx.lineTo(x + 14, baseBlock.y);
          ctx.lineTo(x + 6, baseBlock.y);
          ctx.fill();
        }
      }

      // 2. Draw Stacked Blocks
      for (let i = 0; i < s.blocks.length; i++) {
        const b = s.blocks[i];
        if (i === 0) continue; // base already drawn

        // Block main body
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.width, b.height);

        // Subtle container/steel plate rib lines
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.fillRect(b.x, b.y, b.width, 2); // top highlight
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(b.x, b.y + b.height - 2, b.width, 2); // bottom shadow

        // Vertical panel rivets
        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        for (let px = b.x + 16; px < b.x + b.width - 8; px += 20) {
          ctx.fillRect(px, b.y + 2, 2, b.height - 4);
        }

        // Tier badge on left edge
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText(`${i}F`, b.x + 4, b.y + b.height - 8);
      }

      // 3. Draw Falling Pieces (Sliced fragments)
      for (let i = s.fallingPieces.length - 1; i >= 0; i--) {
        const p = s.fallingPieces[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.angle += p.vAngle;

        ctx.save();
        ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        ctx.restore();

        // Remove offscreen
        if (p.y > s.baseY + 200) {
          s.fallingPieces.splice(i, 1);
        }
      }

      // 4. Draw Particles
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const pt = s.particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.15;
        pt.life++;

        const alpha = 1 - pt.life / pt.maxLife;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        if (pt.life >= pt.maxLife) {
          s.particles.splice(i, 1);
        }
      }

      // 5. Draw Active Moving Block & Goliath Crane Cable
      if (gameState === "PLAYING") {
        const curr = s.currentBlock;
        curr.x += curr.vx;

        // Bounce back and forth
        if (curr.x <= 15) {
          curr.x = 15;
          curr.vx = Math.abs(curr.vx);
        } else if (curr.x + curr.width >= s.width - 15) {
          curr.x = s.width - 15 - curr.width;
          curr.vx = -Math.abs(curr.vx);
        }

        // Draw Crane Hook Cables from top
        const craneGantryY = -s.cameraY + 20;
        const blockCenterX = curr.x + curr.width / 2;

        ctx.strokeStyle = "#4A5568";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Left cable
        ctx.moveTo(blockCenterX - curr.width * 0.35, craneGantryY);
        ctx.lineTo(curr.x + 8, curr.y);
        // Right cable
        ctx.moveTo(blockCenterX + curr.width * 0.35, craneGantryY);
        ctx.lineTo(curr.x + curr.width - 8, curr.y);
        ctx.stroke();

        // Hoist spreader bar
        ctx.fillStyle = "#F5A623";
        ctx.fillRect(curr.x + 4, curr.y - 6, curr.width - 8, 5);

        // Block body
        ctx.fillStyle = curr.color;
        ctx.fillRect(curr.x, curr.y, curr.width, curr.height);

        // Highlights
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fillRect(curr.x, curr.y, curr.width, 3);
        ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
        ctx.fillRect(curr.x, curr.y + curr.height - 3, curr.width, 3);

        // Alignment laser guide beam if in combo streak (combo >= 3)
        if (s.combo >= 3) {
          ctx.strokeStyle = "rgba(0, 163, 82, 0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(curr.x, curr.y + curr.height);
          ctx.lineTo(curr.x, curr.y + curr.height + 40);
          ctx.moveTo(curr.x + curr.width, curr.y + curr.height);
          ctx.lineTo(curr.x + curr.width, curr.y + curr.height + 40);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.restore(); // Restore camera offset

      // --- Top Gantry of HD Goliath Crane (HUD fixed) ---
      ctx.fillStyle = "#F5A623"; // Goliath iconic yellow
      ctx.fillRect(0, 0, s.width, 18);
      ctx.fillStyle = "#1D1D1F";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("HD HYUNDAI SAMHO GOLIATH CRANE 1200T", 20, 13);

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [gameState]);

  // Milestone check for ships
  const getShipRank = (height: number) => {
    if (height < 5) return { name: "기초 블록 거치", badge: "초심자" };
    if (height < 10) return { name: "소형 항만 예인선", badge: "초급 선박" };
    if (height < 20) return { name: "15,000TEU 초대형 컨테이너선", badge: "중급 주력선" };
    if (height < 35) return { name: "30만톤 초대형 원유운반선 (VLCC)", badge: "고급 주력선" };
    if (height < 50) return { name: "174k CBM 친환경 LNG운반선", badge: "친환경 고부가가치" };
    return { name: "차세대 미래 수소추진 스마트선", badge: "해양 명장 🏆" };
  };

  const currentShip = getShipRank(stateRef.current.blocks.length - 1);

  return (
    <div className="flex flex-col items-center w-full max-w-[620px] select-none font-hd">
      {/* Top Game Controls & HUD */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-4 py-2.5 rounded-xl flex items-center justify-between gap-3 shadow-md mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#007AFF]/20 border border-[#007AFF]/40 flex items-center justify-center text-[#007AFF] shrink-0">
            <Anchor className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm sm:text-base text-white">
            골리앗 크레인 블록 쌓기
          </span>
          <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
            {currentShip.name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title={isMuted ? "소리 켜기" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Main Game Stage Container */}
      <div
        onClick={() => {
          if (gameState === "PLAYING") dropBlock();
          else if (gameState === "READY" || gameState === "GAMEOVER") startGame();
        }}
        className="relative w-full h-[360px] sm:h-[400px] bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-800 cursor-pointer touch-none"
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={520}
          className="w-full h-full object-cover"
        />

        {/* Live In-Game Floating HUD */}
        {gameState === "PLAYING" && (
          <div className="absolute top-4 left-3 right-3 flex justify-between items-start pointer-events-none">
            <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-white">
              <div className="text-[9px] font-medium text-gray-400">건조 높이</div>
              <div className="text-base sm:text-lg font-bold text-[#FFD700] tabular-nums">
                {Math.max(0, stateRef.current.blocks.length - 1)}
                <span className="text-xs font-medium text-gray-300 ml-1">블록</span>
              </div>
            </div>

            {/* Score & Combo */}
            <div className="flex flex-col items-end gap-1">
              <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-white text-right">
                <div className="text-[9px] font-medium text-gray-400">건조 포인트</div>
                <div className="text-base sm:text-lg font-bold text-[#34C759] tabular-nums">
                  {score.toLocaleString()}
                </div>
              </div>

              {combo > 1 && (
                <div className="bg-gradient-to-r from-amber-500 to-red-500 px-2.5 py-0.5 rounded-full text-white font-bold text-[11px] shadow-lg animate-bounce flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  COMBO x{combo}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feedback text overlay (PERFECT / GOOD) */}
        {feedbackText && gameState === "PLAYING" && (
          <div
            key={feedbackText.text + Date.now()}
            className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none font-bold text-xl sm:text-2xl drop-shadow-md animate-out fade-out zoom-out-95 duration-500"
            style={{ color: feedbackText.color }}
          >
            {feedbackText.text}
          </div>
        )}

        {/* READY / START SCREEN OVERLAY */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-6 text-center text-white">
            <div className="w-12 h-12 rounded-xl bg-[#007AFF]/20 border border-[#007AFF]/40 flex items-center justify-center mb-3 text-[#007AFF] shadow-inner">
              <Anchor className="w-6 h-6" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-1.5 text-white">
              골리앗 크레인 블록 탑재
            </h2>
            <p className="text-slate-300 text-xs sm:text-[13px] max-w-sm mb-4 leading-relaxed">
              화면을 클릭하거나 <span className="text-amber-400 font-bold bg-white/10 px-1.5 py-0.5 rounded">스페이스바</span>를 눌러 선박 블록을 안착시키세요.<br />오차 없이 연속 안착 시 콤보 보너스가 발동합니다.
            </p>
            <button
              onClick={startGame}
              className="bg-[#007AFF] hover:bg-[#0062cc] text-white px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-lg active:scale-95 transition-transform flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              크레인 가동하기
            </button>
          </div>
        )}

        {/* GAME OVER SCREEN OVERLAY */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 text-center text-white animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-2.5 text-amber-400">
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold mb-1 text-white">선체 블록 탑재 완료</h3>
            <div className="text-xs text-slate-300 mb-3 font-medium">
              최종 등급: <span className="text-amber-400 font-bold">{currentShip.name}</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 w-full max-w-xs mb-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-center">
                <div className="text-[10px] text-slate-400 font-medium">최종 점수</div>
                <div className="text-lg sm:text-xl font-bold text-[#34C759]">{score.toLocaleString()}점</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-center">
                <div className="text-[10px] text-slate-400 font-medium">건조 높이</div>
                <div className="text-lg sm:text-xl font-bold text-[#FFD700]">
                  {Math.max(0, stateRef.current.blocks.length - 1)}층
                </div>
              </div>
            </div>

            <button
              onClick={startGame}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-md active:scale-95 transition-transform flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              다시 도전하기
            </button>
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <div className="mt-2 text-xs text-slate-400 flex items-center gap-3">
        <span>💡 조작법: 마우스 클릭 / 터치 / 스페이스바</span>
        <span>•</span>
        <span>오차 4px 이하 시 PERFECT 콤보</span>
      </div>
    </div>
  );
}
