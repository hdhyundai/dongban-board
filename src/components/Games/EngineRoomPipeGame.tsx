import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  ShieldCheck,
  Activity,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Droplets,
  Zap,
} from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";
import { getGameCanvasFont } from "../../lib/gameFonts";

interface EngineRoomPipeGameProps {
  onFinish: (score: number) => void;
}

type PipeType = "straight" | "corner" | "tee" | "cross";

interface PipeNode {
  row: number;
  col: number;
  type: PipeType;
  rotation: number; // 0, 90, 180, 270 degrees
  displayRotation: number; // for smooth rotation animation
  targetRotation: number;
  fluidFlow: boolean;
  flowDirection: { dx: number; dy: number };
}

interface FluidParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
}

interface LeakParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const GRID_ROWS = 5;
const GRID_COLS = 6;

export default function EngineRoomPipeGame({ onFinish }: EngineRoomPipeGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [stage, setStage] = useState(1);
  const [pressureBar, setPressureBar] = useState(0); // 0 to 16.0 bar
  const [timeLeft, setTimeLeft] = useState(55);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [pipeCircuitClosed, setPipeCircuitClosed] = useState(false);
  const [flowRateM3, setFlowRateM3] = useState(0);
  const [leakWarning, setLeakWarning] = useState<string | null>(null);

  const stateRef = useRef({
    score: 0,
    stage: 1,
    timeLeft: 55,
    grid: [] as PipeNode[][],
    particles: [] as FluidParticle[],
    leakParticles: [] as LeakParticle[],
    lastTime: 0,
    isTesting: false,
    testProgress: 0,
    currentPressure: 0,
    targetPressure: 0,
    circuitConnected: false,
    hoverCell: null as { r: number; c: number } | null,
    leakPoints: [] as { x: number; y: number }[],
    successStamp: false,
    successStampTimer: 0,
    pumpAngle: 0,
    coolerFanAngle: 0,
  });

  const animFrameRef = useRef<number | null>(null);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  // Helper to determine pipe port connectivity based on type & rotation
  const getOpenings = (type: PipeType, rotation: number) => {
    const rot = ((Math.round(rotation) % 360) + 360) % 360;
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

  // Traverse circuit from (0,0) to evaluate connection and detect leak points
  const evaluateConnections = useCallback((grid: PipeNode[][]): { connected: boolean; leaks: { r: number; c: number; dir: string }[] } => {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        grid[r][c].fluidFlow = false;
      }
    }

    const start = grid[0][0];
    const targetR = GRID_ROWS - 1;
    const targetC = GRID_COLS - 1;

    // Inlet must have an opening to the left to receive seawater from SW Pump #1
    const startOpenings = getOpenings(start.type, start.rotation);
    if (!startOpenings.left) {
      return { connected: false, leaks: [] };
    }

    const queue: { r: number; c: number }[] = [];
    const visited = new Set<string>();
    const leaks: { r: number; c: number; dir: string }[] = [];

    queue.push({ r: 0, c: 0 });
    visited.add("0,0");
    start.fluidFlow = true;

    let reachedTarget = false;

    while (queue.length > 0) {
      const { r, c } = queue.shift()!;
      const currNode = grid[r][c];
      const openings = getOpenings(currNode.type, currNode.rotation);

      if (r === targetR && c === targetC && openings.right) {
        reachedTarget = true;
      }

      // Check Top
      if (openings.top) {
        if (r > 0) {
          const neighbor = grid[r - 1][c];
          const nOpenings = getOpenings(neighbor.type, neighbor.rotation);
          if (nOpenings.bottom) {
            if (!visited.has(`${r - 1},${c}`)) {
              neighbor.fluidFlow = true;
              visited.add(`${r - 1},${c}`);
              queue.push({ r: r - 1, c });
            }
          } else {
            leaks.push({ r, c, dir: "top" });
          }
        } else {
          leaks.push({ r, c, dir: "top" });
        }
      }

      // Check Right
      if (openings.right) {
        if (c < GRID_COLS - 1) {
          const neighbor = grid[r][c + 1];
          const nOpenings = getOpenings(neighbor.type, neighbor.rotation);
          if (nOpenings.left) {
            if (!visited.has(`${r},${c + 1}`)) {
              neighbor.fluidFlow = true;
              visited.add(`${r},${c + 1}`);
              queue.push({ r, c: c + 1 });
            }
          } else {
            leaks.push({ r, c, dir: "right" });
          }
        } else if (!(r === targetR && c === targetC)) {
          leaks.push({ r, c, dir: "right" });
        }
      }

      // Check Bottom
      if (openings.bottom) {
        if (r < GRID_ROWS - 1) {
          const neighbor = grid[r + 1][c];
          const nOpenings = getOpenings(neighbor.type, neighbor.rotation);
          if (nOpenings.top) {
            if (!visited.has(`${r + 1},${c}`)) {
              neighbor.fluidFlow = true;
              visited.add(`${r + 1},${c}`);
              queue.push({ r: r + 1, c });
            }
          } else {
            leaks.push({ r, c, dir: "bottom" });
          }
        } else {
          leaks.push({ r, c, dir: "bottom" });
        }
      }

      // Check Left
      if (openings.left && c > 0) {
        const neighbor = grid[r][c - 1];
        const nOpenings = getOpenings(neighbor.type, neighbor.rotation);
        if (nOpenings.right) {
          if (!visited.has(`${r},${c - 1}`)) {
            neighbor.fluidFlow = true;
            visited.add(`${r},${c - 1}`);
            queue.push({ r, c: c - 1 });
          }
        } else {
          leaks.push({ r, c, dir: "left" });
        }
      }
    }

    return { connected: reachedTarget, leaks };
  }, []);

  const generateGrid = useCallback((stg: number): PipeNode[][] => {
    const grid: PipeNode[][] = [];
    const pipeTypes: PipeType[] = ["straight", "corner", "tee", "corner", "straight", "cross"];

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
          displayRotation: rot,
          targetRotation: rot,
          fluidFlow: false,
          flowDirection: { dx: 1, dy: 0 },
        });
      }
      grid.push(row);
    }

    // Ensure start node has a compatible layout pattern
    grid[0][0].type = Math.random() > 0.4 ? "corner" : "straight";
    grid[GRID_ROWS - 1][GRID_COLS - 1].type = Math.random() > 0.4 ? "corner" : "straight";

    // Guarantee that grid is NOT pre-solved at start
    let attempts = 0;
    while (evaluateConnections(grid).connected && attempts < 30) {
      const randR = Math.floor(Math.random() * GRID_ROWS);
      const randC = Math.floor(Math.random() * GRID_COLS);
      grid[randR][randC].rotation = (grid[randR][randC].rotation + 90) % 360;
      grid[randR][randC].displayRotation = grid[randR][randC].rotation;
      grid[randR][randC].targetRotation = grid[randR][randC].rotation;
      attempts++;
    }

    return grid;
  }, [evaluateConnections]);

  const startGame = () => {
    const s = stateRef.current;
    s.score = 0;
    s.stage = 1;
    s.timeLeft = 55;
    s.grid = generateGrid(1);
    s.isTesting = false;
    s.testProgress = 0;
    s.currentPressure = 0;
    s.targetPressure = 0;
    s.particles = [];
    s.leakParticles = [];
    s.successStamp = false;
    const evalRes = evaluateConnections(s.grid);
    s.circuitConnected = evalRes.connected;
    s.lastTime = performance.now();

    setScore(0);
    setStage(1);
    setTimeLeft(55);
    setPressureBar(0);
    setPipeCircuitClosed(s.circuitConnected);
    setFlowRateM3(s.circuitConnected ? 450 : 0);
    setLeakWarning(null);
    setGameState("PLAYING");
    gameAudio.playClick();
  };

  const rotatePipe = (r: number, c: number) => {
    if (gameState !== "PLAYING" || stateRef.current.isTesting) return;
    const s = stateRef.current;
    const node = s.grid[r][c];

    node.targetRotation += 90;
    node.rotation = (Math.round(node.targetRotation) % 360 + 360) % 360;
    gameAudio.playValveTurn();

    const evalRes = evaluateConnections(s.grid);
    const wasConnected = s.circuitConnected;
    s.circuitConnected = evalRes.connected;
    setPipeCircuitClosed(evalRes.connected);
    setFlowRateM3(evalRes.connected ? 450 : 0);
    setLeakWarning(null);

    if (!wasConnected && evalRes.connected) {
      gameAudio.playWaterRush();
    }
  };

  const triggerPressureTest = () => {
    if (gameState !== "PLAYING" || stateRef.current.isTesting) return;
    const s = stateRef.current;
    s.isTesting = true;
    s.testProgress = 0;
    s.currentPressure = 0;
    s.targetPressure = 16.0;

    gameAudio.playHydraulicWhoosh();

    const evalRes = evaluateConnections(s.grid);
    if (!evalRes.connected) {
      setLeakWarning("🚨 개방단 누수 감지! 배관 미체결 상태에서 고압 통수 시험 불가");
      gameAudio.playHit();

      // Emit leak burst particles at open leaks
      const cellW = 86;
      const cellH = 76;
      const startX = 100;
      const startY = 45;

      evalRes.leaks.slice(0, 3).forEach((leak) => {
        const lx = startX + leak.c * cellW + cellW / 2;
        const ly = startY + leak.r * cellH + cellH / 2;
        for (let i = 0; i < 24; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * 120;
          s.leakParticles.push({
            x: lx,
            y: ly,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0,
            maxLife: 0.6 + Math.random() * 0.4,
            size: 3 + Math.random() * 4,
          });
        }
      });
    }
  };

  // Main Render & Game Loop
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
      if (finalScore >= 1200) {
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#38BDF8", "#00A352", "#F5A623", "#0284C7", "#FFFFFF"],
        });
      }
    };

    const render = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min((now - s.lastTime) / 1000, 0.1);
      s.lastTime = now;

      const w = canvas.width;
      const h = canvas.height;

      // Machinery rotation animation
      s.pumpAngle += dt * (s.circuitConnected ? 8 : 2);
      s.coolerFanAngle += dt * 3;

      // Smooth pipe rotation interpolation
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const node = s.grid[r]?.[c];
          if (node) {
            const diff = node.targetRotation - node.displayRotation;
            if (Math.abs(diff) > 0.5) {
              node.displayRotation += diff * 18 * dt;
            } else {
              node.displayRotation = node.targetRotation;
            }
          }
        }
      }

      // Handle Pressure Test sequence
      if (s.isTesting) {
        s.testProgress += dt * 1.2;
        const currentP = Math.min(16.0, +(s.testProgress * 16.0).toFixed(1));
        s.currentPressure = currentP;
        setPressureBar(currentP);

        if (s.testProgress >= 1.0) {
          s.isTesting = false;
          if (s.circuitConnected) {
            // Stage Cleared! Passed 16 BAR Hydrostatic Test
            s.successStamp = true;
            s.successStampTimer = 1.2;
            const addedScore = 600 + s.timeLeft * 25;
            s.score += addedScore;
            setScore(s.score);
            gameAudio.playShipHorn();
            s.stage += 1;
            setStage(s.stage);
            s.timeLeft = Math.min(65, s.timeLeft + 25);
            setTimeLeft(s.timeLeft);

            confetti({
              particleCount: 50,
              spread: 60,
              origin: { y: 0.5 },
              colors: ["#38BDF8", "#34D399", "#F5A623"],
            });

            setTimeout(() => {
              s.grid = generateGrid(s.stage);
              const evalRes = evaluateConnections(s.grid);
              s.circuitConnected = evalRes.connected;
              setPipeCircuitClosed(evalRes.connected);
              setFlowRateM3(evalRes.connected ? 450 : 0);
              s.successStamp = false;
            }, 800);
          } else {
            // Leak failure!
            gameAudio.playHit();
            s.score = Math.max(0, s.score - 50);
            setScore(s.score);
          }
        }
      }

      // Update Fluid Particles
      if (s.circuitConnected || s.isTesting) {
        // Spawn active fluid particles in flow paths
        if (s.particles.length < 140) {
          for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
              const node = s.grid[r]?.[c];
              if (node && node.fluidFlow && Math.random() < 0.25) {
                const cellW = 86;
                const cellH = 76;
                const startX = 100;
                const startY = 45;
                const cx = startX + c * cellW + cellW / 2;
                const cy = startY + r * cellH + cellH / 2;
                s.particles.push({
                  x: cx + (Math.random() - 0.5) * 16,
                  y: cy + (Math.random() - 0.5) * 16,
                  vx: (Math.random() - 0.5) * 20,
                  vy: (Math.random() - 0.5) * 20,
                  life: 0,
                  maxLife: 0.6 + Math.random() * 0.5,
                  size: 2 + Math.random() * 2.5,
                  alpha: 0.8,
                });
              }
            }
          }
        }
      }

      // Update particle positions
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
        if (p.life >= p.maxLife) {
          s.particles.splice(i, 1);
        }
      }

      // Update leak spray particles
      for (let i = s.leakParticles.length - 1; i >= 0; i--) {
        const lp = s.leakParticles[i];
        lp.life += dt;
        lp.x += lp.vx * dt;
        lp.y += lp.vy * dt;
        lp.vy += 120 * dt; // gravity
        if (lp.life >= lp.maxLife) {
          s.leakParticles.splice(i, 1);
        }
      }

      // -------------------------------------------------------------
      // DRAW BACKGROUND & ENGINE ROOM CAD ENVIRONMENT
      // -------------------------------------------------------------
      // Blueprint deep marine gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, "#080f1d");
      bgGrad.addColorStop(0.5, "#0b172a");
      bgGrad.addColorStop(1, "#070d18");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Industrial Steel Deck Floor Plates & Seams
      ctx.strokeStyle = "rgba(148, 163, 184, 0.05)";
      ctx.lineWidth = 1;
      const plateSize = 40;
      for (let px = 0; px < w; px += plateSize) {
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
      }
      for (let py = 0; py < h; py += plateSize) {
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        ctx.stroke();
      }

      // CAD Technical Grid Coordinate Lines
      const cellW = 86;
      const cellH = 76;
      const startX = 100;
      const startY = 45;

      // Coordinate labels (A1..F5)
      ctx.font = getGameCanvasFont(9, "bold", true);
      ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const colLetters = ["A", "B", "C", "D", "E", "F"];
      for (let c = 0; c < GRID_COLS; c++) {
        const cx = startX + c * cellW + cellW / 2;
        ctx.fillText(`COL ${colLetters[c]}`, cx, startY - 12);
      }
      for (let r = 0; r < GRID_ROWS; r++) {
        const cy = startY + r * cellH + cellH / 2;
        ctx.fillText(`R${r + 1}`, startX - 16, cy);
      }

      // -------------------------------------------------------------
      // LEFT MACHINERY: HD-SWP 01 (SEAWATER PUMP & VOLUTE CASING)
      // -------------------------------------------------------------
      const pumpX = 52;
      const pumpY = startY + cellH / 2;

      ctx.save();
      // Pump cast iron volute body
      const pumpBodyGrad = ctx.createRadialGradient(pumpX, pumpY, 10, pumpX, pumpY, 44);
      pumpBodyGrad.addColorStop(0, "#38bdf8");
      pumpBodyGrad.addColorStop(0.3, "#0284c7");
      pumpBodyGrad.addColorStop(0.8, "#0f172a");
      pumpBodyGrad.addColorStop(1, "#0369a1");

      ctx.fillStyle = pumpBodyGrad;
      ctx.beginPath();
      ctx.arc(pumpX, pumpY, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Spinning Impeller Blades Indicator
      ctx.save();
      ctx.translate(pumpX, pumpY);
      ctx.rotate(s.pumpAngle);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(20 * Math.cos((i * Math.PI) / 2), 20 * Math.sin((i * Math.PI) / 2));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#0284c7";
      ctx.fill();
      ctx.restore();

      // Connecting pipe from pump into Grid (0,0)
      ctx.fillStyle = s.circuitConnected ? "#38bdf8" : "#0284c7";
      ctx.fillRect(pumpX + 28, pumpY - 12, startX - (pumpX + 28), 24);
      ctx.strokeStyle = "#7dd3fc";
      ctx.lineWidth = 2;
      ctx.strokeRect(pumpX + 28, pumpY - 12, startX - (pumpX + 28), 24);

      // Flange at inlet
      ctx.fillStyle = "#64748b";
      ctx.fillRect(startX - 6, pumpY - 16, 6, 32);

      // Pump Nameplate & Status Badge
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(8, pumpY + 42, 86, 38);
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(8, pumpY + 42, 86, 38);

      ctx.font = getGameCanvasFont(8, "black");
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("HD-SWP 01", 51, pumpY + 54);
      ctx.font = getGameCanvasFont(7, "bold");
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("1,780 RPM | 450 m³/h", 51, pumpY + 68);
      ctx.restore();

      // -------------------------------------------------------------
      // RIGHT MACHINERY: M/E CENTRAL COOLER & PLATE HEAT EXCHANGER
      // -------------------------------------------------------------
      const coolerX = startX + GRID_COLS * cellW + 44;
      const coolerY = startY + (GRID_ROWS - 1) * cellH + cellH / 2;

      ctx.save();
      // Heat Exchanger Heavy Titanium Frame
      ctx.fillStyle = "#064e3b";
      ctx.fillRect(coolerX - 28, coolerY - 38, 56, 76);
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.strokeRect(coolerX - 28, coolerY - 38, 56, 76);

      // Titanium plate pack lines
      ctx.strokeStyle = "rgba(52, 211, 153, 0.4)";
      ctx.lineWidth = 1;
      for (let ty = coolerY - 30; ty <= coolerY + 30; ty += 6) {
        ctx.beginPath();
        ctx.moveTo(coolerX - 22, ty);
        ctx.lineTo(coolerX + 22, ty);
        ctx.stroke();
      }

      // Connecting pipe from Grid (4,5) to Cooler
      ctx.fillStyle = s.circuitConnected ? "#34d399" : "#059669";
      ctx.fillRect(startX + GRID_COLS * cellW, coolerY - 12, coolerX - 28 - (startX + GRID_COLS * cellW), 24);
      ctx.strokeStyle = "#6ee7b7";
      ctx.lineWidth = 2;
      ctx.strokeRect(startX + GRID_COLS * cellW, coolerY - 12, coolerX - 28 - (startX + GRID_COLS * cellW), 24);

      // Flange at outlet
      ctx.fillStyle = "#64748b";
      ctx.fillRect(startX + GRID_COLS * cellW, coolerY - 16, 6, 32);

      // Cooler Nameplate & Temp Monitor
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(coolerX - 42, coolerY + 44, 84, 38);
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(coolerX - 42, coolerY + 44, 84, 38);

      ctx.font = getGameCanvasFont(8, "black");
      ctx.fillStyle = "#34d399";
      ctx.fillText("M/E PHE COOLER", coolerX, coolerY + 56);
      ctx.font = getGameCanvasFont(7, "bold");
      ctx.fillStyle = "#a7f3d0";
      ctx.fillText("TEMP: 32.4°C [OK]", coolerX, coolerY + 70);
      ctx.restore();

      // -------------------------------------------------------------
      // DRAW PIPE GRID & HIGH-END METALLIC CYLINDERS
      // -------------------------------------------------------------
      const pipeR = 15; // pipe half-thickness (30px diameter)

      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const node = s.grid[r]?.[c];
          if (!node) continue;

          const cx = startX + c * cellW + cellW / 2;
          const cy = startY + r * cellH + cellH / 2;
          const isHovered = s.hoverCell && s.hoverCell.r === r && s.hoverCell.c === c;

          // Cell Mounting Frame
          ctx.save();
          ctx.fillStyle = isHovered ? "rgba(56, 189, 248, 0.08)" : "rgba(15, 23, 42, 0.55)";
          ctx.fillRect(startX + c * cellW, startY + r * cellH, cellW, cellH);

          ctx.strokeStyle = isHovered ? "rgba(56, 189, 248, 0.6)" : "rgba(148, 163, 184, 0.12)";
          ctx.lineWidth = isHovered ? 1.5 : 1;
          ctx.strokeRect(startX + c * cellW, startY + r * cellH, cellW, cellH);

          // Corner bolt rivets on cell
          ctx.fillStyle = "#475569";
          const crs = 4;
          ctx.fillRect(startX + c * cellW + 2, startY + r * cellH + 2, crs, crs);
          ctx.fillRect(startX + (c + 1) * cellW - 6, startY + r * cellH + 2, crs, crs);
          ctx.fillRect(startX + c * cellW + 2, startY + (r + 1) * cellH - 6, crs, crs);
          ctx.fillRect(startX + (c + 1) * cellW - 6, startY + (r + 1) * cellH - 6, crs, crs);

          // Rotate coordinate system around pipe center for smooth rendering
          ctx.translate(cx, cy);
          ctx.rotate((node.displayRotation * Math.PI) / 180);

          // Get openings based on base rotation 0, since canvas is rotated by node.displayRotation
          const openings = getOpenings(node.type, 0);

          // Colors based on fluid state
          const isFlowing = node.fluidFlow;
          const metalDark = isFlowing ? "#0369a1" : "#1e293b";
          const metalMid = isFlowing ? "#0284c7" : "#334155";
          const metalHi = isFlowing ? "#7dd3fc" : "#94a3b8";
          const metalEdge = isFlowing ? "#38bdf8" : "#475569";

          // Draw pipe segments
          // Helper to draw horizontal arm with 3D cylindrical shader
          const drawHorizontalArm = (x1: number, x2: number) => {
            const minX = Math.min(x1, x2);
            const armLen = Math.abs(x2 - x1);
            const armGrad = ctx.createLinearGradient(0, -pipeR, 0, pipeR);
            armGrad.addColorStop(0, metalDark);
            armGrad.addColorStop(0.35, metalHi);
            armGrad.addColorStop(0.7, metalMid);
            armGrad.addColorStop(1, metalDark);

            ctx.fillStyle = armGrad;
            ctx.fillRect(minX, -pipeR, armLen, pipeR * 2);

            // Specular core streak
            ctx.fillStyle = isFlowing ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.3)";
            ctx.fillRect(minX, -3, armLen, 6);

            // Arm border lines
            ctx.strokeStyle = metalEdge;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(minX, -pipeR);
            ctx.lineTo(minX + armLen, -pipeR);
            ctx.moveTo(minX, pipeR);
            ctx.lineTo(minX + armLen, pipeR);
            ctx.stroke();
          };

          // Helper to draw vertical arm with 3D cylindrical shader
          const drawVerticalArm = (y1: number, y2: number) => {
            const minY = Math.min(y1, y2);
            const armLen = Math.abs(y2 - y1);
            const armGrad = ctx.createLinearGradient(-pipeR, 0, pipeR, 0);
            armGrad.addColorStop(0, metalDark);
            armGrad.addColorStop(0.35, metalHi);
            armGrad.addColorStop(0.7, metalMid);
            armGrad.addColorStop(1, metalDark);

            ctx.fillStyle = armGrad;
            ctx.fillRect(-pipeR, minY, pipeR * 2, armLen);

            // Specular core streak
            ctx.fillStyle = isFlowing ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.3)";
            ctx.fillRect(-3, minY, 6, armLen);

            // Arm border lines
            ctx.strokeStyle = metalEdge;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-pipeR, minY);
            ctx.lineTo(-pipeR, minY + armLen);
            ctx.moveTo(pipeR, minY);
            ctx.lineTo(pipeR, minY + armLen);
            ctx.stroke();
          };

          // Draw arms for open ports
          if (openings.left) {
            drawHorizontalArm(-cellW / 2, 0);
            // Flange collar & bolts
            ctx.fillStyle = "#475569";
            ctx.fillRect(-cellW / 2, -pipeR - 4, 6, pipeR * 2 + 8);
            ctx.fillStyle = "#94a3b8";
            ctx.fillRect(-cellW / 2 + 1, -pipeR - 2, 3, 4);
            ctx.fillRect(-cellW / 2 + 1, pipeR - 2, 3, 4);
          }
          if (openings.right) {
            drawHorizontalArm(0, cellW / 2);
            ctx.fillStyle = "#475569";
            ctx.fillRect(cellW / 2 - 6, -pipeR - 4, 6, pipeR * 2 + 8);
            ctx.fillStyle = "#94a3b8";
            ctx.fillRect(cellW / 2 - 4, -pipeR - 2, 3, 4);
            ctx.fillRect(cellW / 2 - 4, pipeR - 2, 3, 4);
          }
          if (openings.top) {
            drawVerticalArm(-cellH / 2, 0);
            ctx.fillStyle = "#475569";
            ctx.fillRect(-pipeR - 4, -cellH / 2, pipeR * 2 + 8, 6);
            ctx.fillStyle = "#94a3b8";
            ctx.fillRect(-pipeR - 2, -cellH / 2 + 1, 4, 3);
            ctx.fillRect(pipeR - 2, -cellH / 2 + 1, 4, 3);
          }
          if (openings.bottom) {
            drawVerticalArm(0, cellH / 2);
            ctx.fillStyle = "#475569";
            ctx.fillRect(-pipeR - 4, cellH / 2 - 6, pipeR * 2 + 8, 6);
            ctx.fillStyle = "#94a3b8";
            ctx.fillRect(-pipeR - 2, cellH / 2 - 4, 4, 3);
            ctx.fillRect(pipeR - 2, cellH / 2 - 4, 4, 3);
          }

          // Center Pipe Hub & Marine Valve
          const hubGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, pipeR + 3);
          hubGrad.addColorStop(0, metalHi);
          hubGrad.addColorStop(0.5, metalMid);
          hubGrad.addColorStop(1, metalDark);

          ctx.fillStyle = hubGrad;
          ctx.beginPath();
          ctx.arc(0, 0, pipeR + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = metalEdge;
          ctx.lineWidth = 2;
          ctx.stroke();

          // 4-Spoke Industrial Valve Handwheel
          ctx.strokeStyle = isFlowing ? "#0284c7" : "#d97706";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(10, 0);
          ctx.moveTo(0, -10);
          ctx.lineTo(0, 10);
          ctx.stroke();

          // Outer Handwheel Rim
          ctx.beginPath();
          ctx.arc(0, 0, 11, 0, Math.PI * 2);
          ctx.strokeStyle = isFlowing ? "#38bdf8" : "#f59e0b";
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Valve Center Nut
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fillStyle = isFlowing ? "#e0f2fe" : "#fbbf24";
          ctx.fill();

          ctx.restore();
        }
      }

      // -------------------------------------------------------------
      // DRAW FLUID PARTICLES & LEAK MIST SPRAYS
      // -------------------------------------------------------------
      ctx.save();
      for (const p of s.particles) {
        ctx.fillStyle = `rgba(125, 211, 252, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw high-pressure leak bursts
      for (const lp of s.leakParticles) {
        const leakAlpha = Math.max(0, 1 - lp.life / lp.maxLife);
        ctx.fillStyle = `rgba(239, 68, 68, ${leakAlpha})`;
        ctx.beginPath();
        ctx.arc(lp.x, lp.y, lp.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // -------------------------------------------------------------
      // ANALOG BOURDON TUBE HYDROSTATIC PRESSURE GAUGE (HUD)
      // -------------------------------------------------------------
      const gaugeCenterX = w - 68;
      const gaugeCenterY = h - 56;
      const gaugeRadius = 38;

      ctx.save();
      // Gauge outer bezel (Brushed steel ring)
      const bezelGrad = ctx.createLinearGradient(
        gaugeCenterX - gaugeRadius,
        gaugeCenterY - gaugeRadius,
        gaugeCenterX + gaugeRadius,
        gaugeCenterY + gaugeRadius
      );
      bezelGrad.addColorStop(0, "#cbd5e1");
      bezelGrad.addColorStop(0.5, "#475569");
      bezelGrad.addColorStop(1, "#0f172a");

      ctx.beginPath();
      ctx.arc(gaugeCenterX, gaugeCenterY, gaugeRadius + 4, 0, Math.PI * 2);
      ctx.fillStyle = bezelGrad;
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Gauge dial face
      ctx.beginPath();
      ctx.arc(gaugeCenterX, gaugeCenterY, gaugeRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#090d16";
      ctx.fill();

      // Gauge colored arc (Green safe up to 16, Red over 16)
      const startAngle = Math.PI * 0.75;
      const endAngle = Math.PI * 2.25;

      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
      ctx.beginPath();
      ctx.arc(gaugeCenterX, gaugeCenterY, gaugeRadius - 6, startAngle, endAngle);
      ctx.stroke();

      // High pressure zone arc (12 ~ 16+ BAR)
      const testZoneStart = startAngle + (endAngle - startAngle) * (12 / 20);
      const testZoneEnd = startAngle + (endAngle - startAngle) * (18 / 20);
      ctx.strokeStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(gaugeCenterX, gaugeCenterY, gaugeRadius - 6, testZoneStart, testZoneEnd);
      ctx.stroke();

      // Needle position (mapped to 0..20 BAR)
      const pressureRatio = Math.min(1.0, s.currentPressure / 20);
      const needleAngle = startAngle + (endAngle - startAngle) * pressureRatio;

      ctx.save();
      ctx.translate(gaugeCenterX, gaugeCenterY);
      ctx.rotate(needleAngle);

      // Gauge needle
      ctx.strokeStyle = s.circuitConnected ? "#34d399" : "#f59e0b";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(gaugeRadius - 10, 0);
      ctx.stroke();

      // Needle center cap
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();

      // Gauge labels
      ctx.font = getGameCanvasFont(7, "black");
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("TEST BAR", gaugeCenterX, gaugeCenterY - 14);

      ctx.font = getGameCanvasFont(11, "black", true);
      ctx.fillStyle = s.currentPressure >= 16.0 ? "#34d399" : s.currentPressure > 0 ? "#fbbf24" : "#e2e8f0";
      ctx.fillText(`${s.currentPressure.toFixed(1)}`, gaugeCenterX, gaugeCenterY + 16);
      ctx.restore();

      // -------------------------------------------------------------
      // SUCCESS HYDROSTATIC STAMP (선급 수압 기밀 시험 합격)
      // -------------------------------------------------------------
      if (s.successStamp) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-0.06);

        ctx.fillStyle = "rgba(6, 78, 59, 0.92)";
        ctx.fillRect(-170, -45, 340, 90);
        ctx.strokeStyle = "#34d399";
        ctx.lineWidth = 4;
        ctx.strokeRect(-170, -45, 340, 90);

        ctx.font = getGameCanvasFont(15, "black");
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText("★ 선급(DNV·KR) 수압 기밀 16.0 BAR 합격 ★", 0, -10);

        ctx.font = getGameCanvasFont(11, "bold");
        ctx.fillStyle = "#a7f3d0";
        ctx.fillText("HYDROSTATIC TEST PASSED • STAGE CLEARED!", 0, 18);
        ctx.restore();
      }

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
  }, [gameState, generateGrid, evaluateConnections]);

  // Handle cell click / rotation
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameState !== "PLAYING") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const cellW = 86;
    const cellH = 76;
    const startX = 100;
    const startY = 45;

    const col = Math.floor((x - startX) / cellW);
    const row = Math.floor((y - startY) / cellH);

    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
      rotatePipe(row, col);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const cellW = 86;
    const cellH = 76;
    const startX = 100;
    const startY = 45;

    const col = Math.floor((x - startX) / cellW);
    const row = Math.floor((y - startY) / cellH);

    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
      stateRef.current.hoverCell = { r: row, c: col };
    } else {
      stateRef.current.hoverCell = null;
    }
  };

  const handleCanvasMouseLeave = () => {
    stateRef.current.hoverCell = null;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex flex-col bg-slate-950 font-hd select-none overflow-hidden text-white"
    >
      {/* Top Industrial Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              <span>기관실 복합 배관 CAD 라우팅</span>
              <span className="text-[10px] font-bold text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60">
                CLASS DNV·KR 16 BAR
              </span>
            </h2>
            <div className="text-[10px] text-slate-400 font-bold">
              SW Cooling Circuit & Hydrostatic Pressure Test
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-black bg-slate-800 px-2.5 py-1 rounded-lg text-cyan-300 border border-slate-700">
            STAGE {stage}
          </span>
          <button
            onClick={toggleSound}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title={isMuted ? "음소거 해제" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Primary Engineering HUD Bar */}
      <div className="grid grid-cols-4 bg-slate-950/90 border-b border-slate-800 px-3 py-1.5 text-center shrink-0">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-slate-400 font-bold">시공 점수</span>
          <span className="text-sm font-black text-amber-400 tabular-nums">
            {score.toLocaleString()}점
          </span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] text-slate-400 font-bold">남은 시간</span>
          <span
            className={`text-sm font-black tabular-nums ${
              timeLeft <= 10 ? "text-rose-500 animate-pulse" : "text-white"
            }`}
          >
            {timeLeft}초
          </span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] text-slate-400 font-bold">회로 연결 상태</span>
          <span
            className={`text-sm font-black flex items-center gap-1 ${
              pipeCircuitClosed ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {pipeCircuitClosed ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>통수 완료 (450m³/h)</span>
              </>
            ) : (
              <>
                <Droplets className="w-3.5 h-3.5 text-amber-400" />
                <span>배선 조립 중</span>
              </>
            )}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] text-slate-400 font-bold">선급 수압 게이지</span>
          <span className="text-sm font-black text-cyan-400 tabular-nums">
            {pressureBar.toFixed(1)} / 16.0 BAR
          </span>
        </div>
      </div>

      {/* Main CAD Interactive Canvas Area */}
      <div className="relative flex-1 w-full min-h-0 bg-slate-950 flex items-center justify-center p-1 sm:p-2 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={720}
          height={480}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          className="w-full h-full max-h-full object-contain cursor-pointer rounded-xl border border-slate-800 shadow-2xl"
        />

        {/* Leak Alert Toast */}
        {leakWarning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-rose-950/90 border border-rose-500 text-rose-200 px-4 py-2 rounded-xl text-xs font-black shadow-xl flex items-center gap-2 backdrop-blur-md animate-bounce">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{leakWarning}</span>
          </div>
        )}

        {/* READY / Intro Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white z-20">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center mb-3 text-cyan-400 shadow-xl shadow-cyan-500/20">
              <Activity className="w-7 h-7" />
            </div>

            <h3 className="text-lg sm:text-xl font-black mb-1 text-white">
              HD현대삼호 기관실 복합 배관 CAD 라우팅
            </h3>
            <div className="text-xs text-cyan-400 font-bold mb-3">
              Seawater & Central Heat Exchanger Piping System
            </div>

            <p className="text-xs text-slate-300 max-w-md mb-4 leading-relaxed font-medium">
              좌측 <strong className="text-cyan-400">해수 공급 펌프(HD-SWP 01)</strong>에서 우측{" "}
              <strong className="text-emerald-400">주기관 판형 열교환기(M/E PHE)</strong>까지 배관 노드를 클릭하여 90°씩
              회전시켜 완전한 밀폐 냉각 회로를 연결하세요.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-300 bg-slate-900/90 p-3 rounded-xl border border-slate-800 mb-5 max-w-lg w-full text-left font-bold">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                <span>배관 클릭 90° 회전</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span>양단 연결 시 유체 통수</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span>수압 16 BAR 가압 합격</span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-8 py-3 bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black rounded-xl shadow-lg shadow-cyan-600/30 text-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>배관 CAD 설계 및 시공 시작</span>
            </button>
          </div>
        )}

        {/* GAMEOVER Overlay */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white z-20">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mb-3 text-cyan-400">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <h3 className="text-lg sm:text-xl font-black mb-1 text-white">기관실 배관 공정 완료</h3>
            <div className="text-xs text-slate-400 mb-4 font-bold">
              선급(DNV / KR) 수압 16.0 BAR 기밀 검사 결과
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 w-full max-w-xs mb-5 shadow-xl space-y-2.5">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-400">최종 배관 점수</span>
                <span className="text-lg font-black text-amber-400 tabular-nums">{score.toLocaleString()}점</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-400">완료 단계</span>
                <span className="font-black text-cyan-400 tabular-nums">{stage} 단계 통과</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-400">선급 기밀 검사</span>
                <span className="font-black text-emerald-400">DNV·KR 승인</span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black rounded-xl shadow-lg flex items-center gap-2 transition-all active:scale-95 text-sm cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>배관 라우팅 재도전</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Command Action Bar */}
      <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <span className="hidden sm:inline">💡 팁: 배관 노드를 클릭하여 90° 회전시키고, 완결되면</span>
          <span className="text-cyan-400 font-bold">[수압 16 BAR 통수 시험]</span>
          <span className="hidden sm:inline">버튼을 눌러 승인받으세요.</span>
        </div>

        <button
          onClick={triggerPressureTest}
          disabled={!pipeCircuitClosed || gameState !== "PLAYING" || stateRef.current.isTesting}
          className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all active:scale-95 cursor-pointer ${
            pipeCircuitClosed && gameState === "PLAYING" && !stateRef.current.isTesting
              ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/30 animate-pulse"
              : "bg-slate-800 text-slate-500 cursor-not-allowed opacity-60"
          }`}
        >
          <Gauge className="w-4 h-4" />
          <span>수압 16 BAR 통수 시험</span>
        </button>
      </div>
    </div>
  );
}
