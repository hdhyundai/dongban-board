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
}

const BLOCK_TYPES = [
  { name: "선저 외판 블록", color: "#003876" },
  { name: "이중저 구조 블록", color: "#005696" },
  { name: "화물창 격벽 블록", color: "#007AFF" },
  { name: "LNG 극저온 탱크", color: "#00A352" },
  { name: "메인 엔진 블록", color: "#E05A47" },
  { name: "상갑판 외판 블록", color: "#4A90E2" },
  { name: "스마트 휠하우스 블록", color: "#F5A623" },
  { name: "친환경 윙 세일 블록", color: "#50E3C2" },
];

export default function CraneStackGame({ onFinish }: CraneStackGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [blockCount, setBlockCount] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; color: string } | null>(null);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    combo: 0,
    maxCombo: 0,
    blockCount: 0,
    blocks: [] as Block[],
    currentBlock: {
      x: 100,
      y: 0,
      width: 180,
      height: 28,
      vx: 4.2,
      color: BLOCK_TYPES[0].color,
      type: BLOCK_TYPES[0].name,
    },
    fallingPieces: [] as FallingPiece[],
    particles: [] as Particle[],
    cameraY: 0,
    targetCameraY: 0,
    craneTrolleyX: 0,
    cableSwing: 0,
    baseY: 0,
    logicalW: 800,
    logicalH: 520,
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    const s = stateRef.current;
    s.isPlaying = true;
    s.score = 0;
    s.combo = 0;
    s.maxCombo = 0;
    s.blockCount = 0;
    s.cameraY = 0;
    s.targetCameraY = 0;
    s.fallingPieces = [];
    s.particles = [];

    const baseY = s.logicalH - 70;
    s.baseY = baseY;

    // Foundation Keel Block
    const initialWidth = Math.min(220, s.logicalW * 0.45);
    s.blocks = [
      {
        x: s.logicalW / 2 - initialWidth / 2,
        y: baseY,
        width: initialWidth,
        height: 32,
        color: "#1e293b",
        type: "도크 선저 킬블록",
      },
    ];

    s.currentBlock = {
      x: 40,
      y: baseY - 32 - 40,
      width: initialWidth,
      height: 28,
      vx: 4.2,
      color: BLOCK_TYPES[0].color,
      type: BLOCK_TYPES[0].name,
    };

    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setBlockCount(0);
    setFeedback(null);
    setGameState("PLAYING");
    gameAudio.playClick();
  };

  const handleDrop = () => {
    if (gameState !== "PLAYING") return;
    const s = stateRef.current;
    if (!s.isPlaying) return;

    const topBlock = s.blocks[s.blocks.length - 1];
    const curr = s.currentBlock;

    const diff = curr.x - topBlock.x;
    const absDiff = Math.abs(diff);

    // Completely missed!
    if (absDiff >= curr.width) {
      gameAudio.playDrop();
      s.fallingPieces.push({
        x: curr.x,
        y: curr.y,
        width: curr.width,
        height: curr.height,
        color: curr.color,
        vx: curr.vx * 0.5,
        vy: 2,
        angle: 0,
        vAngle: 0.08,
      });

      s.isPlaying = false;
      setGameState("GAMEOVER");
      setFeedback({ text: "블록 낙하 사고! (DOCK CRASH)", color: "#ef4444" });
      onFinish(s.score);
      return;
    }

    // Perfect fit tolerance (±4px)
    let newWidth = curr.width;
    let newX = curr.x;

    if (absDiff <= 4) {
      // PERFECT FIT!
      newX = topBlock.x;
      s.combo += 1;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      const pts = (1000 + s.combo * 250) * Math.min(s.combo, 6);
      s.score += pts;

      setFeedback({ text: `PERFECT FIT! 0mm 오차 (+${pts.toLocaleString()})`, color: "#10b981" });
      gameAudio.playPerfect(Math.min(s.combo, 8));

      // Welding spark burst
      for (let i = 0; i < 28; i++) {
        s.particles.push({
          x: newX + (i / 28) * newWidth,
          y: curr.y + curr.height,
          vx: (Math.random() - 0.5) * 8,
          vy: -Math.random() * 6 - 2,
          color: i % 2 === 0 ? "#fbbf24" : "#ffffff",
          size: Math.random() * 3 + 1.5,
          life: 0.8,
        });
      }
    } else {
      // Overhang slicing
      newWidth = curr.width - absDiff;
      s.combo = 0;
      const pts = Math.round(400 + (newWidth / topBlock.width) * 400);
      s.score += pts;

      gameAudio.playSlice();
      setFeedback({ text: `정밀 단차 가공 (+${pts.toLocaleString()})`, color: "#38bdf8" });

      // Create falling sliced piece
      const slicedX = diff > 0 ? topBlock.x + topBlock.width : curr.x;
      newX = diff > 0 ? topBlock.x + diff : topBlock.x;

      s.fallingPieces.push({
        x: slicedX,
        y: curr.y,
        width: absDiff,
        height: curr.height,
        color: curr.color,
        vx: (diff > 0 ? 1 : -1) * 3,
        vy: 2,
        angle: 0,
        vAngle: (diff > 0 ? 1 : -1) * 0.06,
      });

      // Sparks along the slice
      for (let i = 0; i < 14; i++) {
        s.particles.push({
          x: slicedX,
          y: curr.y + Math.random() * curr.height,
          vx: (diff > 0 ? 1 : -1) * (Math.random() * 4 + 2),
          vy: -Math.random() * 4,
          color: "#f59e0b",
          size: 2,
          life: 0.6,
        });
      }
    }

    // Place the new block
    const placedBlock: Block = {
      x: newX,
      y: topBlock.y - curr.height,
      width: newWidth,
      height: curr.height,
      color: curr.color,
      type: curr.type,
    };
    s.blocks.push(placedBlock);

    s.blockCount += 1;
    setScore(s.score);
    setCombo(s.combo);
    setMaxCombo(s.maxCombo);
    setBlockCount(s.blockCount);

    if (s.blockCount % 6 === 0) {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    }

    // Move camera up as tower grows
    if (s.blocks.length > 5) {
      s.targetCameraY = (s.blocks.length - 5) * curr.height;
    }

    // Next block
    const nextType = BLOCK_TYPES[s.blockCount % BLOCK_TYPES.length];
    const nextSpeed = 4.0 + Math.min(6.0, s.blockCount * 0.25);
    s.currentBlock = {
      x: s.blockCount % 2 === 0 ? 20 : s.logicalW - newWidth - 20,
      y: placedBlock.y - curr.height - 35,
      width: newWidth,
      height: 28,
      vx: (s.blockCount % 2 === 0 ? 1 : -1) * nextSpeed,
      color: nextType.color,
      type: nextType.name,
    };
  };

  // Canvas Loop & Dynamic Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;
      const s = stateRef.current;

      const w = canvas.width;
      const h = canvas.height;

      // Update Physics
      if (s.isPlaying) {
        // Move current block back and forth
        s.currentBlock.x += s.currentBlock.vx;
        if (s.currentBlock.x <= 20) {
          s.currentBlock.x = 20;
          s.currentBlock.vx *= -1;
        } else if (s.currentBlock.x + s.currentBlock.width >= w - 20) {
          s.currentBlock.x = w - 20 - s.currentBlock.width;
          s.currentBlock.vx *= -1;
        }

        s.craneTrolleyX = s.currentBlock.x + s.currentBlock.width / 2;
        s.cableSwing = Math.sin(now * 0.004) * 0.05;
      }

      // Smooth Camera tracking
      s.cameraY += (s.targetCameraY - s.cameraY) * 0.1;

      // Update falling pieces
      for (let i = s.fallingPieces.length - 1; i >= 0; i--) {
        const piece = s.fallingPieces[i];
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.vy += 0.45; // gravity
        piece.angle += piece.vAngle;

        if (piece.y > h + s.cameraY + 100) {
          s.fallingPieces.splice(i, 1);
        }
      }

      // Update particles
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life -= dt * 2;
        if (p.life <= 0) {
          s.particles.splice(i, 1);
        }
      }

      // ---------------- RENDER ----------------
      ctx.clearRect(0, 0, w, h);

      // Sky Background (HD Hyundai Shipyard Sunset/Night)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, "#081021");
      skyGrad.addColorStop(0.6, "#132342");
      skyGrad.addColorStop(1, "#1a3258");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(0, s.cameraY);

      // Dock Walls & Floor
      const dockY = s.baseY;
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, dockY + 32, w, h - dockY);

      // Keel blocks foundations
      for (let bx = 30; bx < w; bx += 70) {
        ctx.fillStyle = "#334155";
        ctx.fillRect(bx, dockY + 16, 44, 20);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(bx + 4, dockY + 20, 36, 12);
      }

      // Render Stacked Blocks
      s.blocks.forEach((b, idx) => {
        // Block Body
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.width, b.height);

        // Highlight top rim
        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.fillRect(b.x, b.y, b.width, 3);

        // Shadow bottom rim
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fillRect(b.x, b.y + b.height - 3, b.width, 3);

        // Stiffener ribs & block borders
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x, b.y, b.width, b.height);

        // Name on block
        if (b.width > 70 && idx > 0) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(b.type, b.x + b.width / 2, b.y + 18);
        }
      });

      // Render Falling Pieces
      s.fallingPieces.forEach((p) => {
        ctx.save();
        ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.strokeRect(-p.width / 2, -p.height / 2, p.width, p.height);
        ctx.restore();
      });

      // Render Particles
      s.particles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Render Active Dropping Block
      if (s.isPlaying) {
        const curr = s.currentBlock;

        // Block Body
        ctx.fillStyle = curr.color;
        ctx.fillRect(curr.x, curr.y, curr.width, curr.height);

        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fillRect(curr.x, curr.y, curr.width, 3);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(curr.x, curr.y, curr.width, curr.height);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(curr.type, curr.x + curr.width / 2, curr.y + 18);

        // Suspension Wire Ropes to Goliath Crane
        const cableTopY = curr.y - 120;
        ctx.strokeStyle = "#d1d5db";
        ctx.lineWidth = 1.5;

        // Left cable
        ctx.beginPath();
        ctx.moveTo(curr.x + 12, curr.y);
        ctx.lineTo(s.craneTrolleyX - 8, cableTopY);
        ctx.stroke();

        // Right cable
        ctx.beginPath();
        ctx.moveTo(curr.x + curr.width - 12, curr.y);
        ctx.lineTo(s.craneTrolleyX + 8, cableTopY);
        ctx.stroke();

        // Crane Spreader Hook
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(s.craneTrolleyX - 22, cableTopY - 14, 44, 14);

        // Overhead Gantry Beam
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(0, cableTopY - 24, w, 10);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(s.craneTrolleyX - 16, cableTopY - 24, 32, 10);
      }

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    // ResizeObserver
    const container = mountRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = entry.contentRect.width;
        const ch = entry.contentRect.height;
        if (cw > 50 && ch > 50) {
          canvas.width = cw;
          canvas.height = ch;
          stateRef.current.logicalW = cw;
          stateRef.current.logicalH = ch;
          stateRef.current.baseY = ch - 70;
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      onClick={handleDrop}
      className="relative w-full h-full flex-1 min-h-0 flex flex-col bg-slate-950 rounded-xl lg:rounded-2xl overflow-hidden select-none font-hd cursor-pointer"
    >
      {/* 2D Canvas */}
      <canvas ref={canvasRef} className="w-full h-full flex-1 min-h-0 relative touch-none" />

      {/* Top HUD */}
      <div className="absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-3 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-2.5 sm:px-3.5 py-1 sm:py-1.5 shadow-lg flex items-center gap-1.5 sm:gap-2">
            <Anchor className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            <span className="text-[11px] sm:text-[12px] font-black text-amber-400 uppercase tracking-wider">
              골리앗 크레인 탑재
            </span>
            <span className="text-[10px] sm:text-[11px] text-slate-300 font-bold bg-slate-800 px-1.5 sm:px-2 py-0.5 rounded-full">
              {blockCount}단 탑재
            </span>
          </div>

          {combo > 1 && (
            <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl px-2.5 py-1 text-emerald-400 text-[11px] font-black animate-pulse">
              🔥 {combo} COMBO!
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <button
            onClick={toggleSound}
            className="p-1.5 sm:p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 shadow-md active:scale-95"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>

          <div className="bg-slate-900/95 border border-amber-500/30 rounded-xl px-3 sm:px-4 py-1 sm:py-1.5 shadow-lg flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[14px] sm:text-[15px] font-black text-amber-400 tabular-nums">
              {score.toLocaleString()}점
            </span>
          </div>
        </div>
      </div>

      {/* Floating Center Feedback */}
      {feedback && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 pointer-events-none z-10 animate-in fade-in duration-150">
          <div
            className="px-4 py-1.5 rounded-full font-black text-[12px] shadow-xl border bg-slate-900/90 backdrop-blur-md whitespace-nowrap"
            style={{ color: feedback.color, borderColor: `${feedback.color}40` }}
          >
            {feedback.text}
          </div>
        </div>
      )}

      {/* In-game Bottom Hint */}
      {gameState === "PLAYING" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="px-6 py-2 bg-slate-900/80 backdrop-blur-md border border-slate-700/80 rounded-full text-slate-300 text-[12px] font-bold shadow-lg">
            화면 터치 / 클릭 [선체 블록 권하 및 안착]
          </div>
        </div>
      )}

      {/* Start / Game Over Modal */}
      {gameState !== "PLAYING" && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20 text-center animate-in fade-in duration-300">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 shadow-xl shadow-amber-500/20">
            <Anchor className="w-8 h-8 text-slate-950 stroke-[2.5]" />
          </div>

          <h3 className="text-[22px] font-black text-white mb-2 tracking-tight">
            {gameState === "READY" ? "HD현대삼호 골리앗 크레인 탑재" : "탑재 작업 완료"}
          </h3>

          <p className="text-[13px] text-slate-400 max-w-md mb-6 leading-relaxed">
            {gameState === "READY"
              ? "좌우로 이동하는 900톤 골리앗 크레인 블록을 선체 위 정확한 위치에 안착시키세요! 오차 0mm 정밀 탑재 시 콤보 점수가 폭발하며, 빗나간 여분은 잘려 나갑니다."
              : `최종 탑재 점수: ${score.toLocaleString()}점 (최대 ${maxCombo}콤보 / 총 ${blockCount}단 완성)`}
          </p>

          <button
            onClick={startGame}
            className="px-8 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-[15px] rounded-2xl shadow-xl shadow-amber-500/30 flex items-center gap-2.5 transition-all active:scale-95 cursor-pointer"
          >
            {gameState === "READY" ? <Play className="w-5 h-5 fill-current" /> : <RotateCcw className="w-5 h-5" />}
            <span>{gameState === "READY" ? "선체 탑재 시작" : "다시 도전하기"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
