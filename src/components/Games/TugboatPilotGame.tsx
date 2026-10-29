import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Compass, ShieldAlert, Award, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Anchor, Link2 } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface TugboatPilotGameProps {
  onFinish: (score: number) => void;
}

export default function TugboatPilotGame({ onFinish }: TugboatPilotGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER" | "SUCCESS">("READY");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(50);
  const [shipDamage, setShipDamage] = useState(0);
  const [approachSpeedKts, setApproachSpeedKts] = useState(1.4);
  const [isTowConnected, setIsTowConnected] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const keysRef = useRef<{ up: boolean; down: boolean; left: boolean; right: boolean; push: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false,
    push: false,
  });

  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    timeLeft: 50,
    shipDamage: 0,
    logicalW: 800,
    logicalH: 520,
    dockGateY: 90,
    towConnected: false,
    activeTugInputCount: 0,
    currentDriftX: 18, // Cross-current pushing ship toward right breakwater
    // 2D Tugboat (ASD Azimuth Thrusters)
    tug: {
      x: 400,
      y: 350,
      angle: -Math.PI / 2, // Facing UP
      vx: 0,
      vy: 0,
      thrust: 0,
      w: 22,
      h: 44,
    },
    // 2D Massive VLCC Vessel (300,000 DWT Dead Ship)
    ship: {
      x: 370,
      y: 430,
      angle: 0.14, // Tilted towards quay
      vx: 0.25, // Drifting sideways with current
      vy: -0.85, // Entering harbor
      angularVelocity: 0.0018,
      w: 62,
      h: 240,
    },
    wakeParticles: [] as Array<{ x: number; y: number; vx: number; vy: number; radius: number; life: number }>,
    lastTime: performance.now(),
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    const s = stateRef.current;
    s.score = 0;
    s.timeLeft = 50;
    s.shipDamage = 0;
    s.towConnected = false;
    s.activeTugInputCount = 0;
    s.wakeParticles = [];

    const midX = s.logicalW / 2;
    s.tug.x = midX + 50;
    s.tug.y = s.logicalH - 140;
    s.tug.angle = -Math.PI / 2;
    s.tug.vx = 0;
    s.tug.vy = 0;

    // Ship starts with dangerous cross-current drift towards the right quay wall!
    s.ship.x = midX - 40;
    s.ship.y = s.logicalH + 100;
    s.ship.angle = 0.12; // Heading off-angle
    s.ship.vx = 0.35; // Drifting rightwards
    s.ship.vy = -0.95; // Initial forward momentum
    s.ship.angularVelocity = 0.002;
    s.isPlaying = true;

    setScore(0);
    setTimeLeft(50);
    setShipDamage(0);
    setApproachSpeedKts(1.5);
    setIsTowConnected(false);
    setFailReason("");
    setGameState("PLAYING");

    gameAudio.playStart();
  };

  const triggerGameOver = (reason: string) => {
    const s = stateRef.current;
    if (!s.isPlaying) return;
    s.isPlaying = false;
    setFailReason(reason);
    setGameState("GAMEOVER");
    gameAudio.playFailure();
    onFinish(s.score);
  };

  const triggerSuccess = (scoreEarned: number) => {
    const s = stateRef.current;
    if (!s.isPlaying) return;
    s.isPlaying = false;
    s.score += scoreEarned;
    setScore(s.score);
    setGameState("SUCCESS");
    gameAudio.playVictory();
    confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
    onFinish(s.score);
  };

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") k.up = true;
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") k.down = true;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") k.left = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") k.right = true;
      if (e.key === " ") k.push = true;
      stateRef.current.activeTugInputCount++;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") k.up = false;
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") k.down = false;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") k.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") k.right = false;
      if (e.key === " ") k.push = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = mountRef.current;
    if (!canvas || !container) return;

    let animId = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(280, Math.floor(rect.height));

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      stateRef.current.logicalW = w;
      stateRef.current.logicalH = h;
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    const render = (now: number) => {
      const dt = Math.min((now - stateRef.current.lastTime) / 1000, 0.08);
      stateRef.current.lastTime = now;

      const s = stateRef.current;
      const k = keysRef.current;
      const w = s.logicalW;
      const h = s.logicalH;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);

      if (s.isPlaying) {
        // Countdown timer
        s.timeLeft -= dt;
        if (s.timeLeft <= 0) {
          triggerGameOver("작전 제한시간 초과! 안전 입항 시간 내에 접안을 완료하지 못했습니다.");
        }
        setTimeLeft(Math.max(0, Math.ceil(s.timeLeft)));

        // 1. Tugboat Physics
        const accel = k.up ? 180 : k.down ? -120 : 0;
        const steer = k.left ? -2.9 : k.right ? 2.9 : 0;

        s.tug.angle += steer * dt;
        s.tug.thrust = accel;

        const forwardX = Math.cos(s.tug.angle);
        const forwardY = Math.sin(s.tug.angle);

        s.tug.vx += forwardX * s.tug.thrust * dt;
        s.tug.vy += forwardY * s.tug.thrust * dt;

        // Water drag on tugboat
        s.tug.vx *= 0.93;
        s.tug.vy *= 0.93;

        s.tug.x += s.tug.vx * dt;
        s.tug.y += s.tug.vy * dt;

        // Boundaries for tugboat
        s.tug.x = Math.max(120, Math.min(w - 120, s.tug.x));
        s.tug.y = Math.max(30, Math.min(h - 20, s.tug.y));

        // Tugboat wake
        if (Math.abs(s.tug.thrust) > 20 && Math.random() < 0.6) {
          s.wakeParticles.push({
            x: s.tug.x - forwardX * 18,
            y: s.tug.y - forwardY * 18,
            vx: -forwardX * 25 + (Math.random() - 0.5) * 15,
            vy: -forwardY * 25 + (Math.random() - 0.5) * 15,
            radius: 3 + Math.random() * 4,
            life: 0.8,
          });
        }

        // 2. VLCC Ship Physics
        // Ship bow tip coordinates (in world space)
        const shipBowX = s.ship.x + Math.sin(s.ship.angle) * (s.ship.h / 2);
        const shipBowY = s.ship.y - Math.cos(s.ship.angle) * (s.ship.h / 2);

        // Towline connection check: when tug is near the ship's bow stem (< 80px)
        const distToBow = Math.hypot(s.tug.x - shipBowX, s.tug.y - shipBowY);
        const canTow = distToBow < 95;
        s.towConnected = canTow;
        setIsTowConnected(canTow);

        // Cross-current drift constantly acting on the dead ship
        s.ship.vx += (s.currentDriftX * dt) / 55;

        // Apply Towline tension force if connected
        if (s.towConnected) {
          // Tow vector from bow to tug
          const tdx = s.tug.x - shipBowX;
          const tdy = s.tug.y - shipBowY;
          const tDist = Math.max(10, Math.hypot(tdx, tdy));

          // Tow pulling force
          const pullMag = (s.tug.thrust > 0 ? 3.5 : 1.2) * (tDist / 60);
          const pullX = (tdx / tDist) * pullMag;
          const pullY = (tdy / tDist) * pullMag;

          // Pull directly pulls ship's forward motion and rotates heading!
          s.ship.vx += pullX * dt * 0.9;
          s.ship.vy += pullY * dt * 0.8;
          s.ship.angularVelocity += (pullX * 0.00045) * dt * 45;

          // Award score for active towing control
          s.score += Math.round(dt * 120);
        }

        // Hull contact / Pushing mechanics
        const dx = s.tug.x - s.ship.x;
        const dy = s.tug.y - s.ship.y;
        const cosA = Math.cos(-s.ship.angle);
        const sinA = Math.sin(-s.ship.angle);
        const localX = cosA * dx - sinA * dy;
        const localY = sinA * dx + cosA * dy;

        const shipHalfW = s.ship.w / 2;
        const shipHalfH = s.ship.h / 2;
        const isContact = Math.abs(localX) < shipHalfW + 16 && Math.abs(localY) < shipHalfH + 16;

        if (isContact) {
          const relativeSpeed = Math.hypot(s.tug.vx - s.ship.vx * 35, s.tug.vy - s.ship.vy * 35);
          if (relativeSpeed > 160) {
            // Impact crash into hull!
            s.shipDamage += 16;
            setShipDamage(Math.min(100, Math.round(s.shipDamage)));
            gameAudio.playDrop();
            if (s.shipDamage >= 100) {
              triggerGameOver("예인선 선체 충돌 파손! 예인선의 과속 접근으로 선박 외판이 완파되었습니다.");
            }
          }

          // Gentle pushing force rotates and brakes ship
          const pushForce = k.push ? 3.2 : 1.5;
          s.ship.vx += (forwardX * pushForce * dt) / 28;
          // If pushing front half, rotates opposite to back half
          s.ship.angularVelocity += ((localY > 0 ? -1 : 1) * forwardX * 0.0008 * dt);

          // If pushing against bow from front, helps brake forward momentum
          if (localY < -shipHalfH * 0.6 && forwardY > 0) {
            s.ship.vy *= 0.96; // active braking!
          }

          s.score += Math.round(pushForce * 15);
        }

        // Water drag on massive ship
        s.ship.vx *= 0.985;
        s.ship.vy *= 0.992;
        s.ship.angularVelocity *= 0.97;

        s.ship.x += s.ship.vx * dt * 45;
        s.ship.y += s.ship.vy * dt * 45;
        s.ship.angle += s.ship.angularVelocity * dt * 45;

        // Current forward speed in knots
        const currentSpeedKts = Math.abs(s.ship.vy * 1.5).toFixed(1);
        setApproachSpeedKts(+currentSpeedKts);
        setScore(s.score);

        // Harbor breakwater collisions (Piers at X < 130 and X > w - 130)
        const shipLeft = s.ship.x - shipHalfW;
        const shipRight = s.ship.x + shipHalfW;
        if (shipLeft < 125 || shipRight > w - 125) {
          s.shipDamage += 25;
          s.ship.vx *= -0.4;
          setShipDamage(Math.min(100, Math.round(s.shipDamage)));
          gameAudio.playDrop();

          if (s.shipDamage >= 100) {
            triggerGameOver("항만 방파제 안벽 좌초 충돌! 조류를 제어하지 못해 선박이 안벽에 충돌했습니다.");
          }
        }

        // Dock Gate Arrival Check (When bow crosses into dock gate area)
        const midX = w / 2;
        if (shipBowY <= s.dockGateY + 15) {
          // STRICT DOCKING VALIDATION:
          // 1. AFK check: player must have actually operated the tugboat
          if (s.activeTugInputCount < 10) {
            triggerGameOver("예인 미조작 충돌! 예인선이 작동하지 않아 표류선박이 안벽에 방치 충돌했습니다.");
          }
          // 2. Speed check: Must be dead-slow (< 0.50)
          else if (Math.abs(s.ship.vy) > 0.52) {
            triggerGameOver(
              `안벽 고속 격돌 사고! 접근 속도(${currentSpeedKts} kts)가 안전 기준(0.8 kts 이하)을 초과하여 도크 안벽을 들이받았습니다.`
            );
          }
          // 3. Lateral Alignment check: Center channel width
          else if (Math.abs(s.ship.x - midX) > 34) {
            triggerGameOver("도크 진입선 이탈! 도크 입구 콘크리트 돌출부 및 돌핀 안벽에 측면 충돌했습니다.");
          }
          // 4. Heading Angle check: Must be straight (±5.5 degrees)
          else if (Math.abs(s.ship.angle) > 0.10) {
            const deg = (s.ship.angle * 180 / Math.PI).toFixed(1);
            triggerGameOver(`선체 진입 각도 불량(${deg}°)! 선미가 안벽 모서리에 걸려 파손되었습니다.`);
          }
          // Safe docking verified!
          else {
            const alignmentBonus = Math.max(0, Math.round(2500 - Math.abs(s.ship.x - midX) * 40));
            const angleBonus = Math.max(0, Math.round(2000 - Math.abs(s.ship.angle) * 15000));
            const damageBonus = (100 - s.shipDamage) * 40;
            const timeBonus = Math.round(s.timeLeft * 60);

            triggerSuccess(4000 + alignmentBonus + angleBonus + damageBonus + timeBonus);
          }
        }
      }

      // Update wake particles
      for (let i = s.wakeParticles.length - 1; i >= 0; i--) {
        const p = s.wakeParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.radius += dt * 6;
        p.life -= dt * 1.8;
        if (p.life <= 0) {
          s.wakeParticles.splice(i, 1);
        }
      }

      // ----------------- RENDER -----------------
      // Sea Water Background
      const seaGrad = ctx.createLinearGradient(0, 0, 0, h);
      seaGrad.addColorStop(0, "#0369a1");
      seaGrad.addColorStop(1, "#0284c7");
      ctx.fillStyle = seaGrad;
      ctx.fillRect(0, 0, w, h);

      // Tidal Current Flow Arrows in water
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1.5;
      for (let cy = 120; cy < h; cy += 80) {
        ctx.beginPath();
        ctx.moveTo(w / 2 - 80, cy);
        ctx.lineTo(w / 2 + 80, cy);
        ctx.lineTo(w / 2 + 70, cy - 4);
        ctx.stroke();
      }

      // Harbor Quays (Left & Right concrete piers)
      const quayW = 125;
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, quayW, h);
      ctx.fillRect(w - quayW, 0, quayW, h);

      // Pier Bollards & Fenders
      ctx.fillStyle = "#f59e0b";
      for (let y = 30; y < h; y += 50) {
        ctx.fillRect(quayW - 8, y, 8, 14);
        ctx.fillRect(w - quayW, y, 8, 14);
      }

      // Dock Gate Target Berthing Slip (Center at Y = dockGateY)
      const midX = w / 2;
      const gateW = 90;

      // Inner Dock Basin
      ctx.fillStyle = "#0c4a6e";
      ctx.fillRect(midX - gateW, 0, gateW * 2, s.dockGateY);

      // Target Berthing Slot Outline
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(midX - 32, 10, 64, s.dockGateY + 10);
      ctx.setLineDash([]);

      // Dock Gate Entrance Pillars
      ctx.fillStyle = "#475569";
      ctx.fillRect(midX - gateW - 14, s.dockGateY - 10, 16, 24);
      ctx.fillRect(midX + gateW - 2, s.dockGateY - 10, 16, 24);

      // Green & Red Navigation Buoys
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(midX + gateW, s.dockGateY + 12, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(midX - gateW, s.dockGateY + 12, 7, 0, Math.PI * 2);
      ctx.fill();

      // Render Wake particles
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      for (const p of s.wakeParticles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Render Towline Cable if connected
      const shipBowX = s.ship.x + Math.sin(s.ship.angle) * (s.ship.h / 2);
      const shipBowY = s.ship.y - Math.cos(s.ship.angle) * (s.ship.h / 2);

      if (s.towConnected) {
        ctx.strokeStyle = "#4ade80"; // Bright glowing green Dyneema towline
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(s.tug.x, s.tug.y);
        ctx.lineTo(shipBowX, shipBowY);
        ctx.stroke();

        // Towline tension indicator text
        ctx.fillStyle = "#86efac";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText("TOW HAWSER (80T)", (s.tug.x + shipBowX) / 2, (s.tug.y + shipBowY) / 2 - 8);
      }

      // Render VLCC Giant Ship
      ctx.save();
      ctx.translate(s.ship.x, s.ship.y);
      ctx.rotate(s.ship.angle);

      const sw = s.ship.w;
      const sh = s.ship.h;

      // Ship shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(-sw / 2 - 4, -sh / 2 + 8, sw + 8, sh);

      // Hull Outer Shell (Deep Navy)
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.moveTo(0, -sh / 2); // bow
      ctx.lineTo(sw / 2, -sh / 2 + 25);
      ctx.lineTo(sw / 2, sh / 2 - 10);
      ctx.lineTo(0, sh / 2); // stern
      ctx.lineTo(-sw / 2, sh / 2 - 10);
      ctx.lineTo(-sw / 2, -sh / 2 + 25);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Deck Cargo Hatch Coamings
      ctx.fillStyle = "#f97316";
      const hatchH = 22;
      for (let hy = -sh / 2 + 40; hy < sh / 2 - 40; hy += 32) {
        ctx.fillRect(-sw / 2 + 8, hy, sw - 16, hatchH);
      }

      // Bow Chock & Pad Eyes
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(0, -sh / 2 + 6, 5, 0, Math.PI * 2);
      ctx.fill();

      // Hazard Fenders on Hull Sides
      ctx.fillStyle = "#facc15";
      ctx.fillRect(-sw / 2 - 3, -40, 3, 20);
      ctx.fillRect(-sw / 2 - 3, 20, 3, 20);
      ctx.fillRect(sw / 2, -40, 3, 20);
      ctx.fillRect(sw / 2, 20, 3, 20);

      ctx.restore();

      // Render 2D Tugboat
      ctx.save();
      ctx.translate(s.tug.x, s.tug.y);
      ctx.rotate(s.tug.angle);

      // Tugboat Hull (HD Red / White Wheelhouse)
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.roundRect(-s.tug.w / 2, -s.tug.h / 2, s.tug.w, s.tug.h, [8, 8, 4, 4]);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Rubber Bow Fender (Black)
      ctx.fillStyle = "#18181b";
      ctx.beginPath();
      ctx.arc(0, -s.tug.h / 2 + 2, 9, Math.PI, 0);
      ctx.fill();

      // Wheelhouse
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-s.tug.w / 2 + 4, -4, s.tug.w - 8, 14);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(-s.tug.w / 2 + 5, -2, s.tug.w - 10, 4);

      ctx.restore();

      ctx.restore(); // Restore DPR scale

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 font-hd select-none overflow-hidden text-white">
      {/* Top Header HUD */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/95 border-b border-slate-800 shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg border border-sky-500/30">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-100 flex items-center gap-1.5">
              영암호 예인선 파일럿
              <span className="text-[10px] px-1.5 py-0.2 bg-sky-500/20 text-sky-300 rounded font-bold">
                실시간 예인·밀기
              </span>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block">
              예인줄 체결 및 선체 완충 조타로 도크 중앙선에 감속 접안하세요
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Tow Hawser Status */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-bold ${
              isTowConnected
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 animate-pulse"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>{isTowConnected ? "예인줄 체결됨" : "선수 접근 필요"}</span>
          </div>

          {/* Approach Speed */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">접근 속도:</span>
            <span
              className={`text-xs font-black font-mono ${
                approachSpeedKts <= 0.8 ? "text-emerald-300" : "text-rose-400 animate-pulse"
              }`}
            >
              {approachSpeedKts} kts
            </span>
          </div>

          {/* Hull Damage */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-xs font-black text-rose-400 font-mono">{shipDamage}%</span>
          </div>

          {/* Time Left */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">시간:</span>
            <span className={`text-xs font-black ${timeLeft <= 8 ? "text-rose-400" : "text-cyan-300"}`}>
              {timeLeft}s
            </span>
          </div>

          {/* Score */}
          <div className="flex items-center gap-1.5 bg-sky-950/80 px-2.5 py-1 rounded-md border border-sky-700">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs sm:text-sm font-black text-amber-300 tabular-nums">
              {score.toLocaleString()}점
            </span>
          </div>

          {/* Mute */}
          <button
            onClick={toggleSound}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport (100% Flex, responsive fit) */}
      <div ref={mountRef} className="relative flex-1 w-full min-h-0 overflow-hidden bg-slate-900">
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center mb-3 text-sky-400 shadow-lg">
              <Compass className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-2">
              영암호 초대형 VLCC 예인선 도크 접안 파일럿
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-4 leading-relaxed">
              자력 항해가 불가능한 30만 톤급 초대형 선박이 조류에 밀려 안벽으로 표류하고 있습니다!<br />
              예인선을 선수에 접근시켜 <strong>초강력 예인줄(Tow Hawser)을 체결</strong>하고,
              선체를 안전하게 회전 및 <strong>0.8노트 이하로 감속</strong>시켜 도크 중앙선에 접안시키세요.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 mb-6 bg-slate-900/90 px-4 py-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-sky-300">
                  W / A / S / D 또는 방향키
                </span>
                <span>예인선 전후좌우 조타</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-sky-300">
                  선수 근접 시
                </span>
                <span>예인줄 자동 체결</span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-sky-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              예인 파일럿 출항하기
            </button>
          </div>
        )}

        {/* SUCCESS Overlay */}
        {gameState === "SUCCESS" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-2 text-emerald-400">
              <Anchor className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-1">
              무사고 안전 접안 완벽 성공!
            </h3>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mb-2">
              최종 점수: {score.toLocaleString()}점
            </div>
            <p className="text-xs text-slate-300 max-w-sm mb-5">
              정확한 중앙 정렬과 안전 저속 제동으로 무충격 도크 입항에 성공하였습니다.
            </p>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-sky-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              다시 출항하기
            </button>
          </div>
        )}

        {/* GAMEOVER Overlay */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mb-2 text-rose-400">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-1">
              예인 작전 실패 (안벽 충돌 사고)
            </h3>
            <div className="text-sm font-bold text-rose-300 mb-2 max-w-md bg-rose-950/60 p-2.5 rounded-xl border border-rose-800">
              {failReason}
            </div>
            <p className="text-xs text-slate-400 max-w-sm mb-5">
              예인줄을 걸고 역추진으로 속도를 0.8노트 이하로 낮추고, 중앙 녹색선 안쪽으로 각도를 맞추어야 합니다.
            </p>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-sky-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              다시 도전하기
            </button>
          </div>
        )}
      </div>

      {/* Touch / Quick Control Buttons */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-t border-slate-800 shrink-0 z-10 gap-2">
        <div className="flex gap-1.5">
          <button
            onPointerDown={() => (keysRef.current.left = true)}
            onPointerUp={() => (keysRef.current.left = false)}
            onPointerLeave={() => (keysRef.current.left = false)}
            className="w-11 h-9 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onPointerDown={() => (keysRef.current.up = true)}
            onPointerUp={() => (keysRef.current.up = false)}
            onPointerLeave={() => (keysRef.current.up = false)}
            className="w-11 h-9 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            onPointerDown={() => (keysRef.current.down = true)}
            onPointerUp={() => (keysRef.current.down = false)}
            onPointerLeave={() => (keysRef.current.down = false)}
            className="w-11 h-9 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            onPointerDown={() => (keysRef.current.right = true)}
            onPointerUp={() => (keysRef.current.right = false)}
            onPointerLeave={() => (keysRef.current.right = false)}
            className="w-11 h-9 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="text-[11px] text-slate-400 hidden sm:block">
          키보드 [W/A/S/D] 또는 방향키로 전후진·회전 · 선수에 근접하면 예인줄이 체결됩니다.
        </div>

        <button
          onPointerDown={() => (keysRef.current.push = true)}
          onPointerUp={() => (keysRef.current.push = false)}
          onPointerLeave={() => (keysRef.current.push = false)}
          className="px-4 h-9 bg-sky-600 active:bg-sky-500 hover:bg-sky-550 border border-sky-500 rounded-lg flex items-center gap-1.5 text-white font-black text-xs active:scale-95 transition-transform ml-auto cursor-pointer"
        >
          <Anchor className="w-4 h-4" />
          최대 추진 (Push)
        </button>
      </div>
    </div>
  );
}
