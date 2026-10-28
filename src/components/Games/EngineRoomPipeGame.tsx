import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, ShieldCheck, Cog, Activity, Gauge, CheckCircle2 } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface EngineRoomPipeGameProps {
  onFinish: (score: number) => void;
}

type PipeType = "straight" | "corner" | "tee" | "cross";

interface PipeNode {
  row: number;
  col: number;
  type: PipeType;
  rotation: number; // 0, 90, 180, 270
  fluidFlow: boolean;
  fluidColor: string;
}

interface FluidParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const GRID_ROWS = 5;
const GRID_COLS = 6;

export default function EngineRoomPipeGame({ onFinish }: EngineRoomPipeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [stage, setStage] = useState(1);
  const [pressureBar, setPressureBar] = useState(0); // 0 to 16 bar
  const [timeLeft, setTimeLeft] = useState(50);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [pipeCircuitClosed, setPipeCircuitClosed] = useState(false);

  const stateRef = useRef({
    score: 0,
    stage: 1,
    timeLeft: 50,
    grid: [] as PipeNode[][],
    startNode: { row: 0, col: 0 },
    endNode: { row: 4, col: 5 },
    particles: [] as FluidParticle[],
    width: 620,
    height: 520,
    lastTime: 0,
    isTesting: false,
    testProgress: 0,
    circuitConnected: false,
  });

  const animFrameRef = useRef<number | null>(null);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  // Helper to test node port connections
  // Rotation 0: straight connects [left, right], corner connects [top, right]
  const getOpenings = (type: PipeType, rotation: number): { top: boolean; right: boolean; bottom: boolean; left: boolean } => {
    const rot = (rotation % 360 + 360) % 360;
    let base = { top: false, right: false, bottom: false, left: false };

    if (type === "straight") {
      // 0, 180: horizontal [left, right]; 90, 270: vertical [top, bottom]
      if (rot === 0 || rot === 180) base = { top: false, right: true, bottom: false, left: true };
      else base = { top: true, right: false, bottom: true, left: false };
    } else if (type === "corner") {
      // 0: top & right
      if (rot === 0) base = { top: true, right: true, bottom: false, left: false };
      else if (rot === 90) base = { top: false, right: true, bottom: true, left: false };
      else if (rot === 180) base = { top: false, right: false, bottom: true, left: true };
      else base = { top: true, right: false, bottom: false, left: true };
    } else if (type === "tee") {
      // 0: left, top, right
      if (rot === 0) base = { top: true, right: true, bottom: false, left: true };
      else if (rot === 90) base = { top: true, right: true, bottom: true, left: false };
      else if (rot === 180) base = { top: false, right: true, bottom: true, left: true };
      else base = { top: true, right: false, bottom: true, left: true };
    } else if (type === "cross") {
      base = { top: true, right: true, bottom: true, left: true };
    }
    return base;
  };

  const generateGrid = (stg: number): PipeNode[][] => {
    const grid: PipeNode[][] = [];
    const pipeTypes: PipeType[] = ["straight", "corner", "tee", "corner", "straight"];

    for (let r = 0; r < GRID_ROWS; r++) {
      const row: PipeNode[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        const type = pipeTypes[Math.floor(Math.random() * pipeTypes.length)];
        const rot = [0, 90, 180, 270][Math.floor(Math.random() * 4)];
        row.push({
          row: r,
          col: c,
          type,
          rotation: rot,
          fluidFlow: false,
          fluidColor: "#38BDF8", // Sea Water cooling blue
        });
      }
      grid.push(row);
    }

    return grid;
  };

  // Traverse circuit from (0,0) with BFS to check if path reaches (GRID_ROWS-1, GRID_COLS-1)
  const evaluateConnections = (grid: PipeNode[][]): boolean => {
    // Reset all fluid flows
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        grid[r][c].fluidFlow = false;
      }
    }

    const start = grid[0][0];
    const targetR = GRID_ROWS - 1;
    const targetC = GRID_COLS - 1;

    // Queue for BFS
    const queue: { r: number; c: number }[] = [];
    const visited = new Set<string>();

    queue.push({ r: 0, c: 0 });
    visited.add("0,0");
    start.fluidFlow = true;

    let reachedTarget = false;

    while (queue.length > 0) {
      const { r, c } = queue.shift()!;
      const currNode = grid[r][c];
      const openings = getOpenings(currNode.type, currNode.rotation);

      if (r === targetR && c === targetC) {
        reachedTarget = true;
      }

      // Check 4 neighbors
      // Top
      if (openings.top && r > 0) {
        const neighbor = grid[r - 1][c];
        const nOpenings = getOpenings(neighbor.type, neighbor.rotation);
        if (nOpenings.bottom && !visited.has(`${r - 1},${c}`)) {
          neighbor.fluidFlow = true;
          visited.add(`${r - 1},${c}`);
          queue.push({ r: r - 1, c });
        }
      }
      // Right
      if (openings.right && c < GRID_COLS - 1) {
        const neighbor = grid[r][c + 1];
        const nOpenings = getOpenings(neighbor.type, neighbor.rotation);
        if (nOpenings.left && !visited.has(`${r},${c + 1}`)) {
          neighbor.fluidFlow = true;
          visited.add(`${r},${c + 1}`);
          queue.push({ r, c: c + 1 });
        }
      }
      // Bottom
      if (openings.bottom && r < GRID_ROWS - 1) {
        const neighbor = grid[r + 1][c];
        const nOpenings = getOpenings(neighbor.type, neighbor.rotation);
        if (nOpenings.top && !visited.has(`${r + 1},${c}`)) {
          neighbor.fluidFlow = true;
          visited.add(`${r + 1},${c}`);
          queue.push({ r: r + 1, c });
        }
      }
      // Left
      if (openings.left && c > 0) {
        const neighbor = grid[r][c - 1];
        const nOpenings = getOpenings(neighbor.type, neighbor.rotation);
        if (nOpenings.right && !visited.has(`${r},${c - 1}`)) {
          neighbor.fluidFlow = true;
          visited.add(`${r},${c - 1}`);
          queue.push({ r, c: c - 1 });
        }
      }
    }

    return reachedTarget;
  };

  const startGame = () => {
    const s = stateRef.current;
    s.score = 0;
    s.stage = 1;
    s.timeLeft = 50;
    s.grid = generateGrid(1);
    s.isTesting = false;
    s.testProgress = 0;
    s.particles = [];
    s.circuitConnected = evaluateConnections(s.grid);
    s.lastTime = performance.now();

    setScore(0);
    setStage(1);
    setTimeLeft(50);
    setPressureBar(0);
    setPipeCircuitClosed(s.circuitConnected);
    setGameState("PLAYING");
    gameAudio.playClick();
  };

  const rotatePipe = (r: number, c: number) => {
    if (gameState !== "PLAYING") return;
    const s = stateRef.current;
    const node = s.grid[r][c];
    node.rotation = (node.rotation + 90) % 360;
    gameAudio.playValveTurn();

    const connected = evaluateConnections(s.grid);
    s.circuitConnected = connected;
    setPipeCircuitClosed(connected);

    if (connected) {
      gameAudio.playWaterRush();
    }
  };

  const triggerPressureTest = () => {
    if (gameState !== "PLAYING" || stateRef.current.isTesting) return;
    const s = stateRef.current;
    s.isTesting = true;
    s.testProgress = 0;
    gameAudio.playHydraulicWhoosh();
  };

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let timerInterval: any = null;
    if (gameState === "PLAYING") {
      timerInterval = setInterval(() => {
        stateRef.current.timeLeft -= 1;
        setTimeLeft(stateRef.current.timeLeft);

        if (stateRef.current.timeLeft <= 0) {
          clearInterval(timerInterval);
          finishGame();
        }
      }, 1000);
    }

    const finishGame = () => {
      setGameState("GAMEOVER");
      const finalScore = stateRef.current.score;
      onFinish(finalScore);
      if (finalScore >= 1000) {
        confetti({
          particleCount: 70,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#38BDF8", "#00A352", "#F5A623", "#FFFFFF"],
        });
      }
    };

    const render = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min((now - s.lastTime) / 1000, 0.1);
      s.lastTime = now;

      const w = canvas.width;
      const h = canvas.height;

      // Handle pressure test animation
      if (s.isTesting) {
        s.testProgress += dt * 1.5;
        setPressureBar(Math.min(16, +(s.testProgress * 16).toFixed(1)));

        if (s.testProgress >= 1) {
          s.isTesting = false;
          if (s.circuitConnected) {
            // Stage Cleared!
            const addedScore = 500 + s.timeLeft * 20;
            s.score += addedScore;
            setScore(s.score);
            gameAudio.playShipHorn();
            s.stage += 1;
            setStage(s.stage);
            s.timeLeft = Math.min(60, s.timeLeft + 25);
            setTimeLeft(s.timeLeft);
            s.grid = generateGrid(s.stage);
            s.circuitConnected = evaluateConnections(s.grid);
            setPipeCircuitClosed(s.circuitConnected);
          } else {
            // Leak failure!
            gameAudio.playHit();
            s.score = Math.max(0, s.score - 50);
            setScore(s.score);
          }
        }
      }

      // ---------------- DRAW ENGINE ROOM CAD ----------------
      // Blueprint grid background
      ctx.fillStyle = "#0c1524";
      ctx.fillRect(0, 0, w, h);

      // Blueprint fine grid
      ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Drawing Pipe Grid
      const cellW = 80;
      const cellH = 80;
      const startX = 70;
      const startY = 55;

      // Source Pump & Target Cooler Badges
      // Source Pump (Inlet) at top-left
      ctx.save();
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(startX - 55, startY + 15, 45, 50);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText("SEAWATER", startX - 32, startY + 36);
      ctx.fillText("PUMP #1", startX - 32, startY + 48);
      ctx.restore();

      // Destination Engine Heat Exchanger at bottom-right
      ctx.save();
      ctx.fillStyle = "#059669";
      ctx.fillRect(startX + GRID_COLS * cellW + 10, startY + (GRID_ROWS - 1) * cellH + 15, 48, 50);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText("MAIN ENG", startX + GRID_COLS * cellW + 34, startY + (GRID_ROWS - 1) * cellH + 36);
      ctx.fillText("COOLER", startX + GRID_COLS * cellW + 34, startY + (GRID_ROWS - 1) * cellH + 48);
      ctx.restore();

      // Draw Grid Cells & Pipes
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const node = s.grid[r]?.[c];
          if (!node) continue;

          const cx = startX + c * cellW + cellW / 2;
          const cy = startY + r * cellH + cellH / 2;

          // Cell outline box
          ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
          ctx.strokeRect(startX + c * cellW, startY + r * cellH, cellW, cellH);

          // Draw Pipe Node with Metallic 3D Styling
          ctx.save();
          ctx.translate(cx, cy);

          const openings = getOpenings(node.type, node.rotation);
          const pipeR = 14; // half thickness

          // Pipe fill color (connected glow or dark steel)
          const pipeFill = node.fluidFlow ? "#0284c7" : "#475569";
          const pipeEdge = node.fluidFlow ? "#38bdf8" : "#94a3b8";

          // Draw pipe arms
          ctx.fillStyle = pipeFill;
          ctx.strokeStyle = pipeEdge;
          ctx.lineWidth = 3;

          // Center junction hub
          ctx.beginPath();
          ctx.arc(0, 0, pipeR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Arms to open sides
          if (openings.top) {
            ctx.fillRect(-pipeR, -cellH / 2, pipeR * 2, cellH / 2);
            ctx.beginPath();
            ctx.moveTo(-pipeR, 0);
            ctx.lineTo(-pipeR, -cellH / 2);
            ctx.moveTo(pipeR, 0);
            ctx.lineTo(pipeR, -cellH / 2);
            ctx.stroke();
            // Flange bolt
            ctx.fillStyle = "#64748b";
            ctx.fillRect(-pipeR - 3, -cellH / 2, pipeR * 2 + 6, 4);
          }
          if (openings.right) {
            ctx.fillRect(0, -pipeR, cellW / 2, pipeR * 2);
            ctx.beginPath();
            ctx.moveTo(0, -pipeR);
            ctx.lineTo(cellW / 2, -pipeR);
            ctx.moveTo(0, pipeR);
            ctx.lineTo(cellW / 2, pipeR);
            ctx.stroke();
            ctx.fillStyle = "#64748b";
            ctx.fillRect(cellW / 2 - 4, -pipeR - 3, 4, pipeR * 2 + 6);
          }
          if (openings.bottom) {
            ctx.fillRect(-pipeR, 0, pipeR * 2, cellH / 2);
            ctx.beginPath();
            ctx.moveTo(-pipeR, 0);
            ctx.lineTo(-pipeR, cellH / 2);
            ctx.moveTo(pipeR, 0);
            ctx.lineTo(pipeR, cellH / 2);
            ctx.stroke();
            ctx.fillStyle = "#64748b";
            ctx.fillRect(-pipeR - 3, cellH / 2 - 4, pipeR * 2 + 6, 4);
          }
          if (openings.left) {
            ctx.fillRect(-cellW / 2, -pipeR, cellW / 2, pipeR * 2);
            ctx.beginPath();
            ctx.moveTo(0, -pipeR);
            ctx.lineTo(-cellW / 2, -pipeR);
            ctx.moveTo(0, pipeR);
            ctx.lineTo(-cellW / 2, pipeR);
            ctx.stroke();
            ctx.fillStyle = "#64748b";
            ctx.fillRect(-cellW / 2, -pipeR - 3, 4, pipeR * 2 + 6);
          }

          // Valve Handwheel in center
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fillStyle = node.fluidFlow ? "#38bdf8" : "#f59e0b";
          ctx.fill();
          ctx.strokeStyle = "#1e293b";
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.restore();
        }
      }

      // Pressure Gauge on bottom
      ctx.save();
      const gaugeX = w - 110;
      const gaugeY = h - 45;
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.fillRect(gaugeX - 35, gaugeY - 25, 120, 50);
      ctx.strokeStyle = "#38bdf8";
      ctx.strokeRect(gaugeX - 35, gaugeY - 25, 120, 50);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px monospace";
      ctx.fillText("HYDRAULIC TEST", gaugeX - 25, gaugeY - 10);
      ctx.font = "bold 14px monospace";
      ctx.fillStyle = s.circuitConnected ? "#34d399" : "#fbbf24";
      ctx.fillText(`${pressureBar} BAR`, gaugeX - 25, gaugeY + 12);
      ctx.restore();

      if (gameState === "PLAYING") {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    if (gameState === "PLAYING") {
      animFrameRef.current = requestAnimationFrame(render);
    } else {
      render(performance.now());
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [gameState, pressureBar]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameState !== "PLAYING") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const cellW = 80;
    const cellH = 80;
    const startX = 70;
    const startY = 55;

    const col = Math.floor((x - startX) / cellW);
    const row = Math.floor((y - startY) / cellH);

    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
      rotatePipe(row, col);
    }
  };

  return (
    <div className="relative flex flex-col items-center select-none w-full max-w-[660px]">
      {/* Top Status Bar */}
      <div className="flex items-center justify-between w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-t-[16px] text-white">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-[13px] text-cyan-400">스마트 의장: 기관실 복합 배관 CAD 라우팅</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            <span>스테이지 {stage}</span>
            <span className="text-cyan-400">| 해수 냉각 계통</span>
          </div>
          <button
            onClick={toggleSound}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            title={isMuted ? "음소거 해제" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Stats HUD Bar */}
      <div className="grid grid-cols-4 w-full bg-slate-950 border-x border-b border-slate-800 px-3 py-2 text-center text-xs">
        <div>
          <div className="text-[10px] text-slate-400">설계 점수</div>
          <div className="text-[16px] font-black text-amber-400 font-mono">{score.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">남은 시간</div>
          <div className={`text-[16px] font-black font-mono ${timeLeft <= 10 ? "text-rose-500 animate-pulse" : "text-white"}`}>
            {timeLeft}초
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">배관 회로 연결</div>
          <div className={`text-[16px] font-black font-mono ${pipeCircuitClosed ? "text-emerald-400" : "text-amber-400"}`}>
            {pipeCircuitClosed ? "정상 연결 ✓" : "배선 중"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">수압 시험</div>
          <div className="text-[16px] font-black text-cyan-400 font-mono">{pressureBar} BAR</div>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative w-full aspect-[620/520] bg-slate-950 overflow-hidden border-x border-b border-slate-800 cursor-pointer">
        <canvas ref={canvasRef} width={620} height={520} onClick={handleCanvasClick} className="w-full h-full block" />

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4 text-cyan-400 shadow-lg shadow-cyan-500/20">
              <Activity className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black mb-2 text-white">
              스마트 의장: 기관실 복합 배관 CAD 라우팅
            </h3>
            <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
              선박의 핵심 심장인 기관실(Engine Room)!
              <br />
              해수 펌프(Pump)에서 주엔진 냉각기(Cooler)까지 각 배관 노드를 클릭하여 회전시켜 누수 없는 최적 유체 회로를 완성하세요.
            </p>
            <div className="flex flex-col gap-2 text-xs text-slate-400 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 mb-6 max-w-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>배관 노드를 클릭/터치하여 90도씩 회전</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>펌프부터 냉각기까지 연결 시 푸른 냉각수 통수</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>하단 [수압 통수 시험] 버튼으로 16 BAR 가압 합격</span>
              </div>
            </div>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-600/30 flex items-center gap-2 transition-all transform active:scale-95"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>배관 CAD 설계 시작</span>
            </button>
          </div>
        )}

        {/* GAMEOVER Overlay */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mb-3 text-cyan-400">
              <ShieldCheck className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black mb-1 text-white">기관실 배관 시공 완료</h3>
            <div className="text-xs text-slate-400 mb-4">선급(DNV/Lloyd) 수압 16 BAR 기밀 승인 완료</div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 w-full max-w-xs mb-6 shadow-xl space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">최종 획득 점수</span>
                <span className="text-xl font-black text-amber-400 font-mono">{score.toLocaleString()}점</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">완료 스테이지</span>
                <span className="font-bold text-cyan-400 font-mono">{stage} 단계</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startGame}
                className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all active:scale-95 text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>재도전</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="w-full bg-slate-900 px-4 py-3 rounded-b-[16px] border border-t-0 border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400">💡 팁: 각 배관을 클릭하여 90도 회전시켜 회로를 연결하세요.</span>
        <button
          onClick={triggerPressureTest}
          disabled={!pipeCircuitClosed || gameState !== "PLAYING"}
          className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 ${
            pipeCircuitClosed && gameState === "PLAYING"
              ? "bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-500/20"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          <Gauge className="w-4 h-4" />
          <span>수압 16 BAR 통수 시험</span>
        </button>
      </div>
    </div>
  );
}
