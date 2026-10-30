import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Compass, ShieldAlert, Award, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Anchor, Link2 } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";
import { getGameCanvasFont } from "../../lib/gameFonts";

interface TugboatPilotGameProps {
  onFinish: (score: number) => void;
}

export default function TugboatPilotGame({ onFinish }: TugboatPilotGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER" | "SUCCESS">("READY");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [shipDamage, setShipDamage] = useState(0);
  const [approachSpeedKts, setApproachSpeedKts] = useState(0.5);
  const [isTowConnected, setIsTowConnected] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [distToDock, setDistToDock] = useState(140);
  const [alignmentText, setAlignmentText] = useState("정렬 대기");

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
    timeLeft: 55,
    shipDamage: 0,
    logicalW: 800,
    logicalH: 520,
    dockGateY: 90,
    towConnected: false,
    activeTugInputCount: 0,
    currentDriftX: 18, // Cross-current pushing ship toward right breakwater
    // ASD (Azimuth Stern Drive) High-Power Tugboat
    tug: {
      x: 400,
      y: 350,
      angle: -Math.PI / 2, // Facing UP
      speed: 0, // current linear velocity along angle
      vx: 0,
      vy: 0,
      w: 24,
      h: 46,
    },
    // 2D Massive VLCC Vessel (300,000 DWT Dead Ship)
    ship: {
      x: 370,
      y: 430,
      angle: 0.12, // Tilted towards quay
      vx: 0.32, // Drifting sideways with current
      vy: -0.85, // Entering harbor
      angularVelocity: 0.0018,
      w: 64,
      h: 240,
    },
    wakeParticles: [] as Array<{ x: number; y: number; vx: number; vy: number; radius: number; life: number; color: string }>,
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
    s.timeLeft = 55;
    s.shipDamage = 0;
    s.towConnected = false;
    s.activeTugInputCount = 0;
    s.wakeParticles = [];

    const midX = s.logicalW / 2;
    s.tug.x = midX + 50;
    s.tug.y = s.logicalH - 140;
    s.tug.angle = -Math.PI / 2; // facing forward/up
    s.tug.speed = 0;
    s.tug.vx = 0;
    s.tug.vy = 0;

    // Ship starts drifting under gentle cross-current towards right breakwater
    s.ship.x = midX - 30;
    s.ship.y = s.logicalH + 60;
    s.ship.angle = 0.09;
    s.ship.vx = 0.14;
    s.ship.vy = -0.34;
    s.ship.angularVelocity = 0.0012;
    s.isPlaying = true;
    s.lastTime = performance.now();

    setScore(0);
    setTimeLeft(60);
    setShipDamage(0);
    setApproachSpeedKts(0.5);
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
    confetti({ particleCount: 95, spread: 85, origin: { y: 0.6 } });
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
      const w = Math.max(360, Math.floor(rect.width));
      const h = Math.max(300, Math.floor(rect.height));

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
      const dt = Math.min((now - stateRef.current.lastTime) / 1000, 0.06);
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

        // 1. ASD TUGBOAT REALISTIC PROPULSION & STEERING
        // Target forward/reverse speed (realistic harbor work speeds)
        let targetLinearSpeed = 0;
        if (k.up) {
          targetLinearSpeed = k.push ? 110 : 80; // Realistic harbor work speed
        } else if (k.down) {
          targetLinearSpeed = -45; // Gentle reverse backing
        }

        // Throttle response
        const accelRate = targetLinearSpeed !== 0 ? 5.5 : 3.5;
        s.tug.speed += (targetLinearSpeed - s.tug.speed) * Math.min(1, accelRate * dt);

        // Steering: smooth azimuth turning
        const steerRate = 2.4; // rad/s
        if (k.left) s.tug.angle -= steerRate * dt;
        if (k.right) s.tug.angle += steerRate * dt;

        // Tug velocity vector
        const forwardX = Math.cos(s.tug.angle);
        const forwardY = Math.sin(s.tug.angle);

        s.tug.vx = forwardX * s.tug.speed;
        s.tug.vy = forwardY * s.tug.speed;

        s.tug.x += s.tug.vx * dt;
        s.tug.y += s.tug.vy * dt;

        // Quay breakwater boundaries for tugboat
        const quayMargin = 120;
        s.tug.x = Math.max(quayMargin + 10, Math.min(w - quayMargin - 10, s.tug.x));
        s.tug.y = Math.max(30, Math.min(h - 20, s.tug.y));

        // Azimuth propeller wash / water foaming wake
        if (Math.abs(s.tug.speed) > 15) {
          const wakeDir = s.tug.speed > 0 ? -1 : 1;
          const wakeOriginDist = 18;
          for (let p = 0; p < 2; p++) {
            s.wakeParticles.push({
              x: s.tug.x + forwardX * wakeOriginDist * wakeDir + (Math.random() - 0.5) * 6,
              y: s.tug.y + forwardY * wakeOriginDist * wakeDir + (Math.random() - 0.5) * 6,
              vx: forwardX * 35 * wakeDir + (Math.random() - 0.5) * 15,
              vy: forwardY * 35 * wakeDir + (Math.random() - 0.5) * 15,
              radius: 2.5 + Math.random() * 3,
              life: 0.65,
              color: "rgba(224, 242, 254, 0.7)",
            });
          }
        }

        // 2. VLCC DEAD SHIP KINEMATICS & TOWING
        // Bow tip coordinates in world space
        const shipBowX = s.ship.x + Math.sin(s.ship.angle) * (s.ship.h / 2);
        const shipBowY = s.ship.y - Math.cos(s.ship.angle) * (s.ship.h / 2);

        // Towline connection check: when tug is within 105px of bow
        const distToBow = Math.hypot(s.tug.x - shipBowX, s.tug.y - shipBowY);
        const canTow = distToBow < 110;
        s.towConnected = canTow;
        setIsTowConnected(canTow);

        // Gentle cross-current drift pushing dead ship rightward
        s.ship.vx += (8 * dt) / 60;

        // Apply Towline tension force if connected
        if (s.towConnected) {
          const tdx = s.tug.x - shipBowX;
          const tdy = s.tug.y - shipBowY;
          const tDist = Math.max(10, Math.hypot(tdx, tdy));

          // Tow pulling force proportional to tug thrust
          const pullMag = (s.tug.speed > 30 ? 2.2 : s.tug.speed < -15 ? 1.4 : 0.8) * (tDist / 55);
          const pullX = (tdx / tDist) * pullMag;
          const pullY = (tdy / tDist) * pullMag;

          // Pull directly steers ship and affects velocity
          s.ship.vx += pullX * dt * 0.7;
          s.ship.vy += pullY * dt * 0.6;
          s.ship.angularVelocity += (pullX * 0.0003) * dt * 25;

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
        const isContact = Math.abs(localX) < shipHalfW + 18 && Math.abs(localY) < shipHalfH + 18;

        if (isContact) {
          const relativeSpeed = Math.hypot(s.tug.vx - s.ship.vx * 18, s.tug.vy - s.ship.vy * 18);
          if (relativeSpeed > 110) {
            s.shipDamage += 16;
            setShipDamage(Math.min(100, Math.round(s.shipDamage)));
            gameAudio.playFailure();
            if (s.shipDamage >= 100) {
              triggerGameOver("예인선 선체 충돌 파손! 예인선의 과속 접근으로 선박 외판이 완파되었습니다.");
            }
          }

          // Gentle pushing force rotates and brakes ship
          const pushForce = k.push ? 2.4 : 1.2;
          s.ship.vx += (forwardX * pushForce * dt) / 25;
          s.ship.angularVelocity += ((localY > 0 ? -1 : 1) * forwardX * 0.0006 * dt);

          // Pushing from bow front brakes forward momentum
          if (localY < -shipHalfH * 0.5 && forwardY > 0) {
            s.ship.vy *= 0.96; // active braking
          }

          s.score += Math.round(pushForce * 15);
        }

        // Water drag on massive dead ship (slow majestic nautical glide)
        s.ship.vx *= 0.985;
        s.ship.vy *= 0.993;
        s.ship.angularVelocity *= 0.97;

        s.ship.x += s.ship.vx * dt * 18;
        s.ship.y += s.ship.vy * dt * 18;
        s.ship.angle += s.ship.angularVelocity * dt * 18;

        // Knots calculation (realistic dead-slow harbor scale)
        const currentSpeedKts = Math.abs(s.ship.vy * 1.5).toFixed(1);
        setApproachSpeedKts(+currentSpeedKts);
        setScore(s.score);

        // Distance to dock slip gate & Lateral alignment status
        const distanceM = Math.max(0, Math.round((shipBowY - s.dockGateY) * 0.8));
        setDistToDock(distanceM);

        const deviationX = s.ship.x - (w / 2);
        if (Math.abs(deviationX) < 18 && Math.abs(s.ship.angle) < 0.08) {
          setAlignmentText("정렬 양호 (정중앙)");
        } else if (deviationX < -18) {
          setAlignmentText("좌측 편향 (우현으로 유도)");
        } else {
          setAlignmentText("우측 편향 (좌현으로 유도)");
        }

        // Breakwater collisions
        const shipLeft = s.ship.x - shipHalfW;
        const shipRight = s.ship.x + shipHalfW;
        if (shipLeft < quayMargin || shipRight > w - quayMargin) {
          s.shipDamage += 25;
          s.ship.vx *= -0.4;
          setShipDamage(Math.min(100, Math.round(s.shipDamage)));
          gameAudio.playFailure();

          if (s.shipDamage >= 100) {
            triggerGameOver("항만 방파제 안벽 좌초 충돌! 조류를 제어하지 못해 선박이 안벽에 충돌했습니다.");
          }
        }

        // Dock Gate Arrival Check
        const midX = w / 2;
        if (shipBowY <= s.dockGateY + 15) {
          // Strict Docking Criteria
          if (s.activeTugInputCount < 6) {
            triggerGameOver("예인 미조작 충돌! 예인선이 작동하지 않아 표류 선박이 안벽에 방치 충돌했습니다.");
          } else if (Math.abs(s.ship.vy * 1.5) > 0.72) {
            triggerGameOver(
              `안벽 고속 격돌 사고! 접근 속도(${currentSpeedKts} kts)가 안전 기준(0.7 kts 이하)을 초과하여 도크 안벽을 들이받았습니다.`
            );
          } else if (Math.abs(s.ship.x - midX) > 36) {
            triggerGameOver("도크 진입선 이탈! 도크 입구 돌출부 및 돌핀 안벽에 측면 충돌했습니다.");
          } else if (Math.abs(s.ship.angle) > 0.11) {
            const deg = ((s.ship.angle * 180) / Math.PI).toFixed(1);
            triggerGameOver(`선체 진입 각도 불량(${deg}°)! 선미가 안벽 모서리에 걸려 파손되었습니다.`);
          } else {
            const alignmentBonus = Math.max(0, Math.round(2500 - Math.abs(s.ship.x - midX) * 40));
            const angleBonus = Math.max(0, Math.round(2000 - Math.abs(s.ship.angle) * 15000));
            const damageBonus = (100 - s.shipDamage) * 40;
            const timeBonus = Math.round(s.timeLeft * 60);

            triggerSuccess(4500 + alignmentBonus + angleBonus + damageBonus + timeBonus);
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

      // Tidal Current Flow Arrows
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
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

      // ----------------- HIGH-VISIBILITY TARGET DOCK & BERTHING SLIP -----------------
      const midX = w / 2;
      const gateW = 95;
      const dockDepth = s.dockGateY;

      // 1. Drydock Inner Basin
      ctx.fillStyle = "#032b43";
      ctx.fillRect(midX - gateW, 0, gateW * 2, dockDepth);

      // Dock Head Concrete Wall at very top
      ctx.fillStyle = "#334155";
      ctx.fillRect(midX - gateW - 20, 0, (gateW * 2) + 40, 22);

      // Yellow/Black Hazard Stripes on Dock Head
      for (let hx = midX - gateW - 20; hx <= midX + gateW + 20; hx += 24) {
        ctx.fillStyle = (hx % 48 === 0) ? "#f59e0b" : "#0f172a";
        ctx.fillRect(hx, 16, 24, 6);
      }

      // Overhead Gantry Crane / Dock Gate Signboard
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(midX - 140, 4, 280, 20);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(midX - 140, 4, 280, 20);

      ctx.fillStyle = "#fbbf24";
      ctx.font = getGameCanvasFont(11, "bold");
      ctx.textAlign = "center";
      ctx.fillText("🎯 HD현대삼호 제1드라이도크 접안 슬립 (TARGET BERTH)", midX, 18);

      // 2. High-Visibility Glowing Holographic Ship Target Silhouette
      const pulsePhase = Math.sin(now * 0.005);
      const glowAlpha = 0.35 + pulsePhase * 0.15;

      // Holographic Target Fill
      ctx.fillStyle = `rgba(16, 185, 129, ${glowAlpha})`;
      ctx.beginPath();
      // Ship bow target shape inside dock
      ctx.moveTo(midX, dockDepth - 4);
      ctx.lineTo(midX + 28, dockDepth - 32);
      ctx.lineTo(midX + 28, 26);
      ctx.lineTo(midX - 28, 26);
      ctx.lineTo(midX - 28, dockDepth - 32);
      ctx.closePath();
      ctx.fill();

      // Holographic Neon Green Outline
      ctx.save();
      ctx.shadowColor = "#10b981";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);

      // Target Crosshair & Label inside the dock slip
      ctx.fillStyle = "#ecfdf5";
      ctx.font = getGameCanvasFont(10, "bold");
      ctx.textAlign = "center";
      ctx.fillText("★ 최종 접안 위치 (PARK HERE) ★", midX, 50);

      // Pulsing Downward Directional Arrows
      ctx.fillStyle = "#10b981";
      ctx.font = getGameCanvasFont(11, "bold");
      ctx.fillText("▼ ▼ ▼ 이 구역으로 안전 진입 (0.7 kts 이하) ▼ ▼ ▼", midX, dockDepth - 10);

      // 3. Dock Gate Entrance Pillars & Floating Lighthouses
      // Left Pier Head (Port - Red Light)
      ctx.fillStyle = "#475569";
      ctx.fillRect(midX - gateW - 16, dockDepth - 8, 18, 26);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(midX - gateW - 7, dockDepth + 18, 8, 0, Math.PI * 2);
      ctx.fill();
      // Flashing light ring
      ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(midX - gateW - 7, dockDepth + 18, 12 + pulsePhase * 3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#fca5a5";
      ctx.font = getGameCanvasFont(9, "bold");
      ctx.fillText("적색 부표 (Port)", midX - gateW - 20, dockDepth + 34);

      // Right Pier Head (Starboard - Green Light)
      ctx.fillStyle = "#475569";
      ctx.fillRect(midX + gateW - 2, dockDepth - 8, 18, 26);
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(midX + gateW + 7, dockDepth + 18, 8, 0, Math.PI * 2);
      ctx.fill();
      // Flashing light ring
      ctx.strokeStyle = "rgba(34, 197, 94, 0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(midX + gateW + 7, dockDepth + 18, 12 + pulsePhase * 3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#86efac";
      ctx.font = getGameCanvasFont(9, "bold");
      ctx.fillText("녹색 부표 (Stbd)", midX + gateW + 20, dockDepth + 34);

      // 4. Approach Fairway Laser Corridor
      // Faint green illumination on water channel
      ctx.fillStyle = "rgba(16, 185, 129, 0.05)";
      ctx.fillRect(midX - 42, dockDepth, 84, h - dockDepth);

      // Left & Right Laser Corridor Boundary Lines
      ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(midX - 42, dockDepth);
      ctx.lineTo(midX - 42, h);
      ctx.moveTo(midX + 42, dockDepth);
      ctx.lineTo(midX + 42, h);
      ctx.stroke();

      // High-visibility Green Centerline Laser with distance markings
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(midX, dockDepth);
      ctx.lineTo(midX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Centerline Distance Waypoints
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = getGameCanvasFont(9, "bold");
      ctx.textAlign = "center";
      for (let distY = dockDepth + 60; distY < h; distY += 75) {
        const markM = Math.round((distY - dockDepth) * 0.8);
        ctx.fillText(`접안선 [${markM}m]`, midX, distY - 6);
      }

      // Floating Live Target Status Banner above dock gate
      const curBowY = s.ship.y - Math.cos(s.ship.angle) * (s.ship.h / 2);
      const liveDistM = Math.max(0, Math.round((curBowY - dockDepth) * 0.8));

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(midX - 90, dockDepth + 8, 180, 18);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(midX - 90, dockDepth + 8, 180, 18);

      ctx.fillStyle = "#38bdf8";
      ctx.font = getGameCanvasFont(10, "bold");
      ctx.fillText(`도크 입구까지: ${liveDistM}m 남음`, midX, dockDepth + 21);

      // Wake particles
      s.wakeParticles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.radius), 0, Math.PI * 2);
        ctx.fill();
      });

      // Render Dead Ship (VLCC)
      ctx.save();
      ctx.translate(s.ship.x, s.ship.y);
      ctx.rotate(s.ship.angle);

      // Hull shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(-s.ship.w / 2 + 5, -s.ship.h / 2 + 5, s.ship.w, s.ship.h);

      // Ship Hull (Dark Crimson Red / Navy Blue)
      ctx.fillStyle = "#831843"; // Hull bottom
      ctx.beginPath();
      ctx.moveTo(0, -s.ship.h / 2); // Bulbous bow
      ctx.lineTo(s.ship.w / 2, -s.ship.h / 2 + 40);
      ctx.lineTo(s.ship.w / 2, s.ship.h / 2 - 20);
      ctx.lineTo(s.ship.w / 2 - 12, s.ship.h / 2);
      ctx.lineTo(-s.ship.w / 2 + 12, s.ship.h / 2);
      ctx.lineTo(-s.ship.w / 2, s.ship.h / 2 - 20);
      ctx.lineTo(-s.ship.w / 2, -s.ship.h / 2 + 40);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#4c0519";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Deck Tanks & Manifolds
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(-s.ship.w / 2 + 6, -s.ship.h / 2 + 50, s.ship.w - 12, s.ship.h - 90);

      // Tank domes
      ctx.fillStyle = "#cbd5e1";
      for (let ty = -s.ship.h / 2 + 65; ty < s.ship.h / 2 - 50; ty += 35) {
        ctx.beginPath();
        ctx.arc(0, ty, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Accommodation Superstructure & Bridge at stern
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-s.ship.w / 2 + 8, s.ship.h / 2 - 45, s.ship.w - 16, 28);
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(-s.ship.w / 2 + 10, s.ship.h / 2 - 42, s.ship.w - 20, 8);

      // Ship Bow Name
      ctx.fillStyle = "#facc15";
      ctx.font = getGameCanvasFont(9, "bold");
      ctx.textAlign = "center";
      ctx.fillText("HD VLCC 300K", 0, -s.ship.h / 2 + 30);

      ctx.restore();

      // Towline (Hawser)
      const shipBowXWorld = s.ship.x + Math.sin(s.ship.angle) * (s.ship.h / 2);
      const shipBowYWorld = s.ship.y - Math.cos(s.ship.angle) * (s.ship.h / 2);

      if (s.towConnected) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(s.tug.x, s.tug.y);
        ctx.lineTo(shipBowXWorld, shipBowYWorld);
        ctx.stroke();

        // Tow connection shackles
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(shipBowXWorld, shipBowYWorld, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Render ASD Tugboat
      ctx.save();
      ctx.translate(s.tug.x, s.tug.y);
      ctx.rotate(s.tug.angle + Math.PI / 2); // Rotate so model points up

      // Tug shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(-s.tug.w / 2 + 3, -s.tug.h / 2 + 3, s.tug.w, s.tug.h);

      // Tug Hull (Orange / White ASD Harbor Tug)
      ctx.fillStyle = "#ea580c";
      ctx.beginPath();
      ctx.moveTo(0, -s.tug.h / 2);
      ctx.lineTo(s.tug.w / 2, -s.tug.h / 2 + 12);
      ctx.lineTo(s.tug.w / 2, s.tug.h / 2 - 8);
      ctx.lineTo(s.tug.w / 2 - 6, s.tug.h / 2);
      ctx.lineTo(-s.tug.w / 2 + 6, s.tug.h / 2);
      ctx.lineTo(-s.tug.w / 2, s.tug.h / 2 - 8);
      ctx.lineTo(-s.tug.w / 2, -s.tug.h / 2 + 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#9a3412";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Heavy Rubber Bow Fender (Fender Nose)
      ctx.fillStyle = "#18181b";
      ctx.beginPath();
      ctx.arc(0, -s.tug.h / 2 + 4, 8, Math.PI, 0);
      ctx.fill();

      // Wheelhouse Cabin
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-s.tug.w / 2 + 4, -s.tug.h / 2 + 14, s.tug.w - 8, 16);
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(-s.tug.w / 2 + 6, -s.tug.h / 2 + 16, s.tug.w - 12, 6);

      // Aft Towing Winch Drum
      ctx.fillStyle = "#334155";
      ctx.fillRect(-6, 8, 12, 8);

      ctx.restore();

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [gameState]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-white rounded-2xl overflow-hidden shadow-2xl border border-slate-800 select-none font-hd">
      {/* Top HUD */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              영암호 초대형 VLCC 예인선 도크 접안 파일럿
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
              <span>ASD 쌍축 Z-Drive 예인선</span>
              <span className="text-slate-600">|</span>
              <span className={isTowConnected ? "text-emerald-400 flex items-center gap-0.5" : "text-amber-400"}>
                <Link2 className="w-3 h-3" />
                {isTowConnected ? "예인줄 체결 완료 (Towing)" : "예인줄 미체결 (접근 필요)"}
              </span>
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2 text-xs">
          {/* Dock Target Distance */}
          <div className="flex items-center gap-1.5 bg-sky-950/90 px-2.5 py-1 rounded-md border border-sky-600">
            <span className="text-[10px] text-sky-300 font-bold">도크 거리:</span>
            <span className="text-xs font-black text-amber-300 tabular-nums">
              {distToDock}m
            </span>
          </div>

          {/* Alignment Status */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">중앙선:</span>
            <span className={`text-xs font-black ${alignmentText.includes("양호") ? "text-emerald-400" : "text-amber-400"}`}>
              {alignmentText}
            </span>
          </div>

          {/* Approach Speed */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">진입 속도:</span>
            <span className={`text-xs font-black tabular-nums ${approachSpeedKts <= 0.7 ? "text-emerald-400" : "text-rose-400 animate-pulse"}`}>
              {approachSpeedKts} kts
            </span>
          </div>

          {/* Hull Damage */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">손상:</span>
            <span className={`text-xs font-black tabular-nums ${shipDamage > 50 ? "text-rose-400 animate-pulse" : shipDamage > 20 ? "text-amber-400" : "text-emerald-400"}`}>
              {shipDamage}%
            </span>
          </div>

          {/* Time Limit */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-700">
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
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center mb-2.5 text-sky-400 shadow-lg">
              <Compass className="w-8 h-8" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-white mb-1.5">
              영암호 초대형 VLCC 예인선 도크 접안 파일럿
            </h3>
            <div className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-3.5 py-1.5 rounded-xl text-xs font-bold mb-3 max-w-md">
              🎯 최종 접안 목표: 상단 중앙의 [제1드라이도크 녹색 목표 실루엣] 안으로 배를 안착시키세요!
            </div>
            <p className="text-xs text-slate-300 max-w-md mb-4 leading-relaxed font-normal">
              1. 예인선을 대형 선박의 선수(머리)에 접근시켜 <strong>예인줄을 체결</strong>하세요.<br />
              2. 중앙 녹색 가이드 라인을 따라 선박을 상단 <strong>[제1드라이도크 슬립]</strong>으로 유도하세요.<br />
              3. 진입 시 역추진으로 속도를 <strong>0.7노트 이하</strong>로 감속해야 안전 접안이 완료됩니다.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 mb-6 bg-slate-900/90 px-4 py-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-sky-300">
                  W / A / S / D 또는 방향키
                </span>
                <span>전후진 고출력 추진 & 조타</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-sky-300">
                  Space / Push
                </span>
                <span>최대 부스트 추진</span>
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
            onPointerDown={() => {
              keysRef.current.left = true;
              stateRef.current.activeTugInputCount++;
            }}
            onPointerUp={() => (keysRef.current.left = false)}
            onPointerLeave={() => (keysRef.current.left = false)}
            className="w-11 h-9 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform cursor-pointer"
            title="좌현 선회 (A / Left)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onPointerDown={() => {
              keysRef.current.up = true;
              stateRef.current.activeTugInputCount++;
            }}
            onPointerUp={() => (keysRef.current.up = false)}
            onPointerLeave={() => (keysRef.current.up = false)}
            className="w-11 h-9 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform cursor-pointer"
            title="전진 추진 (W / Up)"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            onPointerDown={() => {
              keysRef.current.down = true;
              stateRef.current.activeTugInputCount++;
            }}
            onPointerUp={() => (keysRef.current.down = false)}
            onPointerLeave={() => (keysRef.current.down = false)}
            className="w-11 h-9 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform cursor-pointer"
            title="역추진 후진 (S / Down)"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            onPointerDown={() => {
              keysRef.current.right = true;
              stateRef.current.activeTugInputCount++;
            }}
            onPointerUp={() => (keysRef.current.right = false)}
            onPointerLeave={() => (keysRef.current.right = false)}
            className="w-11 h-9 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform cursor-pointer"
            title="우현 선회 (D / Right)"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="text-[11px] text-slate-400 hidden sm:block">
          키보드 [W/A/S/D] 또는 방향키로 전후진·회전 · 선수에 근접하면 예인줄이 체결됩니다.
        </div>

        <button
          onPointerDown={() => {
            keysRef.current.push = true;
            stateRef.current.activeTugInputCount++;
          }}
          onPointerUp={() => (keysRef.current.push = false)}
          onPointerLeave={() => (keysRef.current.push = false)}
          className="px-4 h-9 bg-sky-600 active:bg-sky-500 hover:bg-sky-500 border border-sky-500 rounded-lg flex items-center gap-1.5 text-white font-black text-xs active:scale-95 transition-transform ml-auto cursor-pointer"
        >
          <Anchor className="w-4 h-4" />
          최대 부스트 (Push)
        </button>
      </div>
    </div>
  );
}
