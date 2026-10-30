import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Compass,
  ShieldAlert,
  Award,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Anchor,
  Link2,
  Ship,
  Sliders,
  CheckCircle2,
  Navigation
} from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";
import { getGameCanvasFont } from "../../lib/gameFonts";

interface TugboatPilotGameProps {
  onFinish: (score: number) => void;
}

type ActiveTugId = "BOW" | "STERN";

interface Tugboat {
  id: ActiveTugId;
  name: string;
  x: number;
  y: number;
  angle: number; // heading in radians (-PI/2 = UP)
  speed: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  badgeColor: string;
  tension: number; // in tons
  connected: boolean;
}

export default function TugboatPilotGame({ onFinish }: TugboatPilotGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER" | "SUCCESS">("READY");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(65);
  const [shipDamage, setShipDamage] = useState(0);
  const [approachSpeedKts, setApproachSpeedKts] = useState(0.4);
  const [failReason, setFailReason] = useState("");
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [distToDock, setDistToDock] = useState(135);
  const [alignmentText, setAlignmentText] = useState("정렬 대기");
  const [shipAngleDeg, setShipAngleDeg] = useState(0);

  // Active tugboat for primary controls
  const [activeTug, setActiveTug] = useState<ActiveTugId>("BOW");
  const [bowTensionDisplay, setBowTensionDisplay] = useState(40);
  const [sternTensionDisplay, setSternTensionDisplay] = useState(35);

  // Keyboard input states
  const keysRef = useRef({
    // Generic / Active Tug keys
    up: false,
    down: false,
    left: false,
    right: false,
    push: false,
    // Dedicated Bow Tug keys (WASD)
    bowUp: false,
    bowDown: false,
    bowLeft: false,
    bowRight: false,
    // Dedicated Stern Tug keys (Arrows)
    sternUp: false,
    sternDown: false,
    sternLeft: false,
    sternRight: false,
  });

  const activeTugRef = useRef<ActiveTugId>("BOW");

  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    timeLeft: 65,
    shipDamage: 0,
    logicalW: 800,
    logicalH: 520,
    dockGateY: 90,
    activeTugInputCount: 0,
    crossCurrentX: 12, // gentle tidal current pushing right
    // Tug 1: 선수 예인선 (삼호 1호) - Orange Hull
    tugBow: {
      id: "BOW" as ActiveTugId,
      name: "삼호 1호 (선수)",
      x: 390,
      y: 280,
      angle: -Math.PI / 2, // Facing UP
      speed: 0,
      vx: 0,
      vy: 0,
      w: 24,
      h: 46,
      color: "#ea580c",
      badgeColor: "#f97316",
      tension: 0,
      connected: true,
    },
    // Tug 2: 선미 예인선 (삼호 2호) - Marine Cyan/Navy Hull
    tugStern: {
      id: "STERN" as ActiveTugId,
      name: "삼호 2호 (선미)",
      x: 390,
      y: 490,
      angle: Math.PI / 2, // Facing DOWN (braking stance)
      speed: 0,
      vx: 0,
      vy: 0,
      w: 24,
      h: 46,
      color: "#0284c7",
      badgeColor: "#38bdf8",
      tension: 0,
      connected: true,
    },
    // Massive 16,000 TEU / 300K DWT Dead Ship (Heavy inertia, 3-DOF: X, Y, Yaw)
    ship: {
      x: 390,
      y: 400,
      angle: 0.08, // Initial slight tilt (+4.5 deg)
      vx: 0.12, // Sideways drift from current
      vy: -0.32, // Slow dead ship drift forward
      angularVelocity: 0.0009,
      w: 66,
      h: 220,
    },
    wakeParticles: [] as Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      life: number;
      color: string;
    }>,
    lastTime: performance.now(),
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const switchActiveTug = (tug: ActiveTugId) => {
    setActiveTug(tug);
    activeTugRef.current = tug;
    gameAudio.playClick();
  };

  const startGame = () => {
    const s = stateRef.current;
    s.score = 0;
    s.timeLeft = 65;
    s.shipDamage = 0;
    s.activeTugInputCount = 0;
    s.wakeParticles = [];

    const midX = s.logicalW / 2;

    // Ship starts with gentle entry heading towards dock
    s.ship.x = midX + 15;
    s.ship.y = s.logicalH + 20;
    s.ship.angle = 0.06;
    s.ship.vx = 0.08;
    s.ship.vy = -0.30;
    s.ship.angularVelocity = 0.0008;

    // Bow Tug (삼호 1호) positioned 80px ahead of Bow
    const bowAttachX = s.ship.x + Math.sin(s.ship.angle) * (s.ship.h / 2);
    const bowAttachY = s.ship.y - Math.cos(s.ship.angle) * (s.ship.h / 2);
    s.tugBow.x = bowAttachX;
    s.tugBow.y = bowAttachY - 75;
    s.tugBow.angle = -Math.PI / 2;
    s.tugBow.speed = 0;
    s.tugBow.vx = 0;
    s.tugBow.vy = 0;
    s.tugBow.tension = 25;
    s.tugBow.connected = true;

    // Stern Tug (삼호 2호) positioned 80px behind Stern
    const sternAttachX = s.ship.x - Math.sin(s.ship.angle) * (s.ship.h / 2);
    const sternAttachY = s.ship.y + Math.cos(s.ship.angle) * (s.ship.h / 2);
    s.tugStern.x = sternAttachX;
    s.tugStern.y = sternAttachY + 75;
    s.tugStern.angle = Math.PI / 2; // Facing back to brake
    s.tugStern.speed = 0;
    s.tugStern.vx = 0;
    s.tugStern.vy = 0;
    s.tugStern.tension = 20;
    s.tugStern.connected = true;

    s.isPlaying = true;
    s.lastTime = performance.now();

    setActiveTug("BOW");
    activeTugRef.current = "BOW";
    setScore(0);
    setTimeLeft(65);
    setShipDamage(0);
    setApproachSpeedKts(0.4);
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
    confetti({ particleCount: 110, spread: 90, origin: { y: 0.6 } });
    onFinish(s.score);
  };

  // Keyboard controls with dual support:
  // - Tab or 1/2 key: Switch active tugboat
  // - WASD: Direct Bow Tug or active tug
  // - Arrow keys: Direct Stern Tug or active tug
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = keysRef.current;

      // Tug Switcher Keys
      if (e.key === "Tab") {
        e.preventDefault();
        const next = activeTugRef.current === "BOW" ? "STERN" : "BOW";
        switchActiveTug(next);
        return;
      }
      if (e.key === "1") {
        switchActiveTug("BOW");
        return;
      }
      if (e.key === "2") {
        switchActiveTug("STERN");
        return;
      }

      // WASD Keys (Bow Tug or Active Tug)
      if (e.key === "w" || e.key === "W") {
        k.bowUp = true;
        k.up = true;
        stateRef.current.activeTugInputCount++;
      }
      if (e.key === "s" || e.key === "S") {
        k.bowDown = true;
        k.down = true;
        stateRef.current.activeTugInputCount++;
      }
      if (e.key === "a" || e.key === "A") {
        k.bowLeft = true;
        k.left = true;
        stateRef.current.activeTugInputCount++;
      }
      if (e.key === "d" || e.key === "D") {
        k.bowRight = true;
        k.right = true;
        stateRef.current.activeTugInputCount++;
      }

      // Arrow Keys (Stern Tug or Active Tug)
      if (e.key === "ArrowUp") {
        k.sternUp = true;
        k.up = true;
        stateRef.current.activeTugInputCount++;
      }
      if (e.key === "ArrowDown") {
        k.sternDown = true;
        k.down = true;
        stateRef.current.activeTugInputCount++;
      }
      if (e.key === "ArrowLeft") {
        k.sternLeft = true;
        k.left = true;
        stateRef.current.activeTugInputCount++;
      }
      if (e.key === "ArrowRight") {
        k.sternRight = true;
        k.right = true;
        stateRef.current.activeTugInputCount++;
      }

      if (e.key === " ") {
        k.push = true;
        stateRef.current.activeTugInputCount++;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.key === "w" || e.key === "W") {
        k.bowUp = false;
        k.up = false;
      }
      if (e.key === "s" || e.key === "S") {
        k.bowDown = false;
        k.down = false;
      }
      if (e.key === "a" || e.key === "A") {
        k.bowLeft = false;
        k.left = false;
      }
      if (e.key === "d" || e.key === "D") {
        k.bowRight = false;
        k.right = false;
      }

      if (e.key === "ArrowUp") {
        k.sternUp = false;
        k.up = false;
      }
      if (e.key === "ArrowDown") {
        k.sternDown = false;
        k.down = false;
      }
      if (e.key === "ArrowLeft") {
        k.sternLeft = false;
        k.left = false;
      }
      if (e.key === "ArrowRight") {
        k.sternRight = false;
        k.right = false;
      }

      if (e.key === " ") {
        k.push = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Main Canvas Render and Dual Tug Physics Loop
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

        // ------------------ DUAL TUGBOAT KINEMATICS ------------------
        // Determine controls for Bow Tug vs Stern Tug
        // If player uses WASD specifically, Bow gets WASD. If Arrows specifically, Stern gets Arrows.
        // If user uses Touch/Generic buttons, current active tug gets k.up/k.down/k.left/k.right.
        const currentActive = activeTugRef.current;

        const isBowSteerLeft = k.bowLeft || (currentActive === "BOW" && k.left);
        const isBowSteerRight = k.bowRight || (currentActive === "BOW" && k.right);
        const isBowThrustUp = k.bowUp || (currentActive === "BOW" && k.up);
        const isBowThrustDown = k.bowDown || (currentActive === "BOW" && k.down);

        const isSternSteerLeft = k.sternLeft || (currentActive === "STERN" && k.left);
        const isSternSteerRight = k.sternRight || (currentActive === "STERN" && k.right);
        const isSternThrustUp = k.sternUp || (currentActive === "STERN" && k.up);
        const isSternThrustDown = k.sternDown || (currentActive === "STERN" && k.down);

        const steerRate = 2.6; // rad/s for nimble ASD tugboats

        // 1. Bow Tug Propulsion (삼호 1호)
        let bowTargetSpeed = 0;
        if (isBowThrustUp) bowTargetSpeed = (k.push && currentActive === "BOW") ? 100 : 75;
        else if (isBowThrustDown) bowTargetSpeed = -40;

        s.tugBow.speed += (bowTargetSpeed - s.tugBow.speed) * Math.min(1, 4.8 * dt);
        if (isBowSteerLeft) s.tugBow.angle -= steerRate * dt;
        if (isBowSteerRight) s.tugBow.angle += steerRate * dt;

        const bowFwdX = Math.cos(s.tugBow.angle);
        const bowFwdY = Math.sin(s.tugBow.angle);
        s.tugBow.vx = bowFwdX * s.tugBow.speed;
        s.tugBow.vy = bowFwdY * s.tugBow.speed;
        s.tugBow.x += s.tugBow.vx * dt;
        s.tugBow.y += s.tugBow.vy * dt;

        // 2. Stern Tug Propulsion (삼호 2호)
        let sternTargetSpeed = 0;
        if (isSternThrustUp) sternTargetSpeed = (k.push && currentActive === "STERN") ? 100 : 75;
        else if (isSternThrustDown) sternTargetSpeed = -40;

        s.tugStern.speed += (sternTargetSpeed - s.tugStern.speed) * Math.min(1, 4.8 * dt);
        if (isSternSteerLeft) s.tugStern.angle -= steerRate * dt;
        if (isSternSteerRight) s.tugStern.angle += steerRate * dt;

        const sternFwdX = Math.cos(s.tugStern.angle);
        const sternFwdY = Math.sin(s.tugStern.angle);
        s.tugStern.vx = sternFwdX * s.tugStern.speed;
        s.tugStern.vy = sternFwdY * s.tugStern.speed;
        s.tugStern.x += s.tugStern.vx * dt;
        s.tugStern.y += s.tugStern.vy * dt;

        // Keep tugboats within harbor boundaries
        const quayMargin = 120;
        s.tugBow.x = Math.max(quayMargin + 8, Math.min(w - quayMargin - 8, s.tugBow.x));
        s.tugBow.y = Math.max(30, Math.min(h - 15, s.tugBow.y));
        s.tugStern.x = Math.max(quayMargin + 8, Math.min(w - quayMargin - 8, s.tugStern.x));
        s.tugStern.y = Math.max(30, Math.min(h - 15, s.tugStern.y));

        // Generate foaming wake particles for both tugs
        const emitWake = (tug: Tugboat, fwdX: number, fwdY: number) => {
          if (Math.abs(tug.speed) > 12) {
            const wakeDir = tug.speed > 0 ? -1 : 1;
            s.wakeParticles.push({
              x: tug.x + fwdX * 18 * wakeDir + (Math.random() - 0.5) * 6,
              y: tug.y + fwdY * 18 * wakeDir + (Math.random() - 0.5) * 6,
              vx: fwdX * 30 * wakeDir + (Math.random() - 0.5) * 12,
              vy: fwdY * 30 * wakeDir + (Math.random() - 0.5) * 12,
              radius: 2.2 + Math.random() * 2.8,
              life: 0.6,
              color: "rgba(224, 242, 254, 0.75)",
            });
          }
        };
        emitWake(s.tugBow, bowFwdX, bowFwdY);
        emitWake(s.tugStern, sternFwdX, sternFwdY);

        // ------------------ SHIP 3-DOF DYNAMICS & HAWSER FORCES ------------------
        const shipHalfH = s.ship.h / 2;
        const shipHalfW = s.ship.w / 2;

        // World coordinates of Bow and Stern bitts
        const sinShip = Math.sin(s.ship.angle);
        const cosShip = Math.cos(s.ship.angle);

        const bowBittsX = s.ship.x + sinShip * (shipHalfH - 8);
        const bowBittsY = s.ship.y - cosShip * (shipHalfH - 8);

        const sternBittsX = s.ship.x - sinShip * (shipHalfH - 8);
        const sternBittsY = s.ship.y + cosShip * (shipHalfH - 8);

        // 1. Bow Hawser Force Calculation
        let bowForceX = 0;
        let bowForceY = 0;
        const bdx = s.tugBow.x - bowBittsX;
        const bdy = s.tugBow.y - bowBittsY;
        const bowDist = Math.hypot(bdx, bdy);
        const bowRestLen = 55;

        if (bowDist > bowRestLen) {
          const stretch = bowDist - bowRestLen;
          // Tension proportional to distance + tug forward thrust component
          const thrustPull = Math.max(0, s.tugBow.speed * 0.4);
          const tensionTons = Math.min(130, Math.round(stretch * 1.3 + thrustPull));
          s.tugBow.tension = tensionTons;

          const unitX = bdx / bowDist;
          const unitY = bdy / bowDist;
          const mag = tensionTons * 0.045;
          bowForceX = unitX * mag;
          bowForceY = unitY * mag;

          // Drag back slightly on the tugboat
          s.tugBow.x -= unitX * stretch * dt * 0.6;
          s.tugBow.y -= unitY * stretch * dt * 0.6;
        } else {
          s.tugBow.tension = 5; // Slack line
        }

        // 2. Stern Hawser Force Calculation
        let sternForceX = 0;
        let sternForceY = 0;
        const sdx = s.tugStern.x - sternBittsX;
        const sdy = s.tugStern.y - sternBittsY;
        const sternDist = Math.hypot(sdx, sdy);
        const sternRestLen = 55;

        if (sternDist > sternRestLen) {
          const stretch = sternDist - sternRestLen;
          const thrustPull = Math.max(0, s.tugStern.speed * 0.4);
          const tensionTons = Math.min(130, Math.round(stretch * 1.3 + thrustPull));
          s.tugStern.tension = tensionTons;

          const unitX = sdx / sternDist;
          const unitY = sdy / sternDist;
          const mag = tensionTons * 0.045;
          sternForceX = unitX * mag;
          sternForceY = unitY * mag;

          // Drag back slightly on the tugboat
          s.tugStern.x -= unitX * stretch * dt * 0.6;
          s.tugStern.y -= unitY * stretch * dt * 0.6;
        } else {
          s.tugStern.tension = 5; // Slack line
        }

        // Cross-current drift pushing rightward
        const currentForceX = (s.crossCurrentX * dt) / 50;

        // Total translational force on ship
        s.ship.vx += (bowForceX + sternForceX + currentForceX) * dt * 0.55;
        s.ship.vy += (bowForceY + sternForceY) * dt * 0.50;

        // Rotational Torque on ship:
        // Bow lever arm: +shipHalfH along ship's local axis
        // Stern lever arm: -shipHalfH along ship's local axis
        // Torque tau = r x F
        // Local perpendicular force at bow = -sinShip*bowForceY + cosShip*bowForceX
        const bowPerp = cosShip * bowForceX + sinShip * bowForceY;
        const sternPerp = cosShip * sternForceX + sinShip * sternForceY;

        const torque = (bowPerp - sternPerp) * 0.00075;
        s.ship.angularVelocity += torque * dt * 20;

        // Hydrodynamic damping & friction
        s.ship.vx *= 0.985;
        s.ship.vy *= 0.993;
        s.ship.angularVelocity *= 0.965;

        // Integrate ship state
        s.ship.x += s.ship.vx * dt * 18;
        s.ship.y += s.ship.vy * dt * 18;
        s.ship.angle += s.ship.angularVelocity * dt * 18;

        // Update HUD metrics
        setBowTensionDisplay(s.tugBow.tension);
        setSternTensionDisplay(s.tugStern.tension);

        const currentSpeedKts = Math.abs(s.ship.vy * 1.4).toFixed(1);
        setApproachSpeedKts(+currentSpeedKts);

        const angleDegrees = +((s.ship.angle * 180) / Math.PI).toFixed(1);
        setShipAngleDeg(angleDegrees);

        const curBowY = s.ship.y - cosShip * shipHalfH;
        const distanceM = Math.max(0, Math.round((curBowY - s.dockGateY) * 0.8));
        setDistToDock(distanceM);

        const deviationX = s.ship.x - w / 2;
        if (Math.abs(deviationX) < 18 && Math.abs(angleDegrees) < 3.5) {
          setAlignmentText("정렬 양호 (정중앙 유도 중)");
        } else if (deviationX < -18) {
          setAlignmentText(`좌측 편향 (${Math.abs(Math.round(deviationX))}px 우현 조정 필요)`);
        } else {
          setAlignmentText(`우측 편향 (${Math.abs(Math.round(deviationX))}px 좌현 조정 필요)`);
        }

        // Score accumulates during well-controlled towing
        if (Math.abs(deviationX) < 25 && Math.abs(angleDegrees) < 5) {
          s.score += Math.round(dt * 150);
          setScore(s.score);
        }

        // Hull collisions with Quays
        const shipLeft = s.ship.x - shipHalfW;
        const shipRight = s.ship.x + shipHalfW;
        if (shipLeft < quayMargin || shipRight > w - quayMargin) {
          s.shipDamage += 22;
          s.ship.vx *= -0.3;
          setShipDamage(Math.min(100, Math.round(s.shipDamage)));
          gameAudio.playFailure();

          if (s.shipDamage >= 100) {
            triggerGameOver("안벽 좌초 충돌 사고! 조류와 선체 회전 제어 실패로 안벽에 선체가 완파되었습니다.");
          }
        }

        // Dock Gate Arrival Check
        const midX = w / 2;
        if (curBowY <= s.dockGateY + 18) {
          // Strict berthing safety verification
          if (s.activeTugInputCount < 6) {
            triggerGameOver("예인 미조작 사고! 예인선 제어 없이 선박이 자력 표류하여 안벽에 충돌했습니다.");
          } else if (Math.abs(s.ship.vy * 1.4) > 0.72) {
            triggerGameOver(
              `안벽 과속 격돌! 선미 2호기의 역추진 제동 부족으로 도크에 고속(${currentSpeedKts} kts) 격돌했습니다.`
            );
          } else if (Math.abs(s.ship.x - midX) > 35) {
            triggerGameOver("도크 진입선 이탈! 선박 정중선이 어긋나 도크 입구 돌핀 안벽에 충돌했습니다.");
          } else if (Math.abs(angleDegrees) > 6.0) {
            triggerGameOver(`선체 진입 각도 불량(${angleDegrees}°)! 선미가 도크 모서리에 걸려 파손되었습니다.`);
          } else {
            // Success calculation
            const alignBonus = Math.max(0, Math.round(3000 - Math.abs(s.ship.x - midX) * 45));
            const angleBonus = Math.max(0, Math.round(2500 - Math.abs(angleDegrees) * 350));
            const dmgBonus = (100 - s.shipDamage) * 45;
            const timeBonus = Math.round(s.timeLeft * 70);

            triggerSuccess(5000 + alignBonus + angleBonus + dmgBonus + timeBonus);
          }
        }
      }

      // Update wake particles
      for (let i = s.wakeParticles.length - 1; i >= 0; i--) {
        const p = s.wakeParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.radius += dt * 5;
        p.life -= dt * 1.8;
        if (p.life <= 0) s.wakeParticles.splice(i, 1);
      }

      // ----------------- RENDER SCENE -----------------
      // Sea Water Background
      const seaGrad = ctx.createLinearGradient(0, 0, 0, h);
      seaGrad.addColorStop(0, "#0369a1");
      seaGrad.addColorStop(1, "#0284c7");
      ctx.fillStyle = seaGrad;
      ctx.fillRect(0, 0, w, h);

      // Tidal Current Flow Arrows
      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 1.5;
      for (let cy = 110; cy < h; cy += 75) {
        ctx.beginPath();
        ctx.moveTo(w / 2 - 90, cy);
        ctx.lineTo(w / 2 + 90, cy);
        ctx.lineTo(w / 2 + 80, cy - 4);
        ctx.stroke();
      }

      // Harbor Quays (Left & Right concrete piers)
      const quayW = 120;
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, quayW, h);
      ctx.fillRect(w - quayW, 0, quayW, h);

      // Pier Bollards & Fenders
      ctx.fillStyle = "#f59e0b";
      for (let y = 30; y < h; y += 45) {
        ctx.fillRect(quayW - 8, y, 8, 12);
        ctx.fillRect(w - quayW, y, 8, 12);
      }

      // ----------------- TARGET DOCK & BERTHING SLIP -----------------
      const midX = w / 2;
      const gateW = 95;
      const dockDepth = s.dockGateY;

      // Drydock Inner Basin
      ctx.fillStyle = "#032b43";
      ctx.fillRect(midX - gateW, 0, gateW * 2, dockDepth);

      // Dock Head Concrete Wall
      ctx.fillStyle = "#334155";
      ctx.fillRect(midX - gateW - 20, 0, gateW * 2 + 40, 22);

      // Yellow/Black Hazard Stripes
      for (let hx = midX - gateW - 20; hx <= midX + gateW + 20; hx += 24) {
        ctx.fillStyle = hx % 48 === 0 ? "#f59e0b" : "#0f172a";
        ctx.fillRect(hx, 16, 24, 6);
      }

      // Dock Signboard
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(midX - 150, 4, 300, 20);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(midX - 150, 4, 300, 20);

      ctx.fillStyle = "#fbbf24";
      ctx.font = getGameCanvasFont(11, "bold");
      ctx.textAlign = "center";
      ctx.fillText("🎯 HD현대삼호 제1도크 접안 슬립 (선수 1호 + 선미 2호 협동 예인)", midX, 18);

      // Glowing Holographic Ship Target Silhouette
      const pulsePhase = Math.sin(now * 0.005);
      const glowAlpha = 0.35 + pulsePhase * 0.15;

      ctx.fillStyle = `rgba(16, 185, 129, ${glowAlpha})`;
      ctx.beginPath();
      ctx.moveTo(midX, dockDepth - 4);
      ctx.lineTo(midX + 28, dockDepth - 32);
      ctx.lineTo(midX + 28, 26);
      ctx.lineTo(midX - 28, 26);
      ctx.lineTo(midX - 28, dockDepth - 32);
      ctx.closePath();
      ctx.fill();

      // Neon Green Outline
      ctx.save();
      ctx.shadowColor = "#10b981";
      ctx.shadowBlur = 10;
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);

      ctx.fillStyle = "#ecfdf5";
      ctx.font = getGameCanvasFont(10, "bold");
      ctx.textAlign = "center";
      ctx.fillText("★ 최종 안착 위치 (선수 1호 정렬 / 선미 2호 제동) ★", midX, 50);

      // Dock Gate Entrance Lighthouses (Port Red & Starboard Green)
      ctx.fillStyle = "#475569";
      ctx.fillRect(midX - gateW - 16, dockDepth - 8, 18, 26);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(midX - gateW - 7, dockDepth + 18, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#475569";
      ctx.fillRect(midX + gateW - 2, dockDepth - 8, 18, 26);
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(midX + gateW + 7, dockDepth + 18, 8, 0, Math.PI * 2);
      ctx.fill();

      // Fairway Laser Corridor & Centerline
      ctx.fillStyle = "rgba(16, 185, 129, 0.06)";
      ctx.fillRect(midX - 44, dockDepth, 88, h - dockDepth);

      ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(midX - 44, dockDepth);
      ctx.lineTo(midX - 44, h);
      ctx.moveTo(midX + 44, dockDepth);
      ctx.lineTo(midX + 44, h);
      ctx.stroke();

      // Centerline
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(midX, dockDepth);
      ctx.lineTo(midX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Wake particles
      s.wakeParticles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.radius), 0, Math.PI * 2);
        ctx.fill();
      });

      // ----------------- RENDER DEAD SHIP (16,000 TEU / VLCC) -----------------
      ctx.save();
      ctx.translate(s.ship.x, s.ship.y);
      ctx.rotate(s.ship.angle);

      // Hull shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(-s.ship.w / 2 + 5, -s.ship.h / 2 + 5, s.ship.w, s.ship.h);

      // Ship Hull (Dark Crimson Red / HD Navy Blue)
      ctx.fillStyle = "#831843";
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
      ctx.fillRect(-s.ship.w / 2 + 6, -s.ship.h / 2 + 48, s.ship.w - 12, s.ship.h - 86);

      // Tank domes
      ctx.fillStyle = "#cbd5e1";
      for (let ty = -s.ship.h / 2 + 65; ty < s.ship.h / 2 - 50; ty += 32) {
        ctx.beginPath();
        ctx.arc(0, ty, 9, 0, Math.PI * 2);
        ctx.fill();
      }

      // Stern Superstructure & Wheelhouse
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-s.ship.w / 2 + 8, s.ship.h / 2 - 42, s.ship.w - 16, 26);
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(-s.ship.w / 2 + 10, s.ship.h / 2 - 39, s.ship.w - 20, 7);

      // Ship Name on deck
      ctx.fillStyle = "#facc15";
      ctx.font = getGameCanvasFont(9, "bold");
      ctx.textAlign = "center";
      ctx.fillText("HD SAMHO VLCC 300K", 0, -s.ship.h / 2 + 30);

      // Bow & Stern Attachment Chocks (Bitts)
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(0, -s.ship.h / 2 + 10, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(0, s.ship.h / 2 - 10, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // World coordinates of Bitts for towlines
      const bowWorldX = s.ship.x + Math.sin(s.ship.angle) * (s.ship.h / 2 - 8);
      const bowWorldY = s.ship.y - Math.cos(s.ship.angle) * (s.ship.h / 2 - 8);

      const sternWorldX = s.ship.x - Math.sin(s.ship.angle) * (s.ship.h / 2 - 8);
      const sternWorldY = s.ship.y + Math.cos(s.ship.angle) * (s.ship.h / 2 - 8);

      // ----------------- RENDER HAWSER TOWLINES -----------------
      // Hawser Line 1: Bow Tug -> Ship Bow
      const drawHawser = (
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        tension: number,
        label: string
      ) => {
        const strainColor =
          tension > 95 ? "#ef4444" : tension > 65 ? "#f59e0b" : "#10b981";

        ctx.save();
        ctx.strokeStyle = strainColor;
        ctx.lineWidth = Math.min(4, Math.max(2, 2 + tension / 40));
        ctx.shadowColor = strainColor;
        ctx.shadowBlur = tension > 70 ? 8 : 0;

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        // Slight catenary curve if low tension
        if (tension < 30) {
          const midTugX = (fromX + toX) / 2 + (Math.random() - 0.5) * 4;
          const midTugY = (fromY + toY) / 2 + 8;
          ctx.quadraticCurveTo(midTugX, midTugY, toX, toY);
        } else {
          ctx.lineTo(toX, toY);
        }
        ctx.stroke();

        // Tension Badge in center of towline
        const badgeX = (fromX + toX) / 2;
        const badgeY = (fromY + toY) / 2;
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(badgeX - 26, badgeY - 9, 52, 18);
        ctx.strokeStyle = strainColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(badgeX - 26, badgeY - 9, 52, 18);

        ctx.fillStyle = "#ffffff";
        ctx.font = getGameCanvasFont(9, "bold");
        ctx.textAlign = "center";
        ctx.fillText(`${label} ${tension}t`, badgeX, badgeY + 4);

        ctx.restore();
      };

      drawHawser(s.tugBow.x, s.tugBow.y, bowWorldX, bowWorldY, s.tugBow.tension, "선수");
      drawHawser(s.tugStern.x, s.tugStern.y, sternWorldX, sternWorldY, s.tugStern.tension, "선미");

      // ----------------- RENDER BOTH TUGBOATS -----------------
      const renderTug = (tug: Tugboat, isSelected: boolean) => {
        ctx.save();
        ctx.translate(tug.x, tug.y);

        // Selection Reticle if currently controlled
        if (isSelected) {
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 3]);
          ctx.beginPath();
          ctx.arc(0, 0, 32 + Math.sin(now * 0.008) * 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Control pointer pill above
          ctx.fillStyle = "#facc15";
          ctx.font = getGameCanvasFont(9, "bold");
          ctx.textAlign = "center";
          ctx.fillText("▼ 조종 중 (ACTIVE)", 0, -tug.h / 2 - 14);
        }

        ctx.rotate(tug.angle + Math.PI / 2); // Rotate to model upright

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(-tug.w / 2 + 3, -tug.h / 2 + 3, tug.w, tug.h);

        // Hull
        ctx.fillStyle = tug.color;
        ctx.beginPath();
        ctx.moveTo(0, -tug.h / 2);
        ctx.lineTo(tug.w / 2, -tug.h / 2 + 12);
        ctx.lineTo(tug.w / 2, tug.h / 2 - 8);
        ctx.lineTo(tug.w / 2 - 6, tug.h / 2);
        ctx.lineTo(-tug.w / 2 + 6, tug.h / 2);
        ctx.lineTo(-tug.w / 2, tug.h / 2 - 8);
        ctx.lineTo(-tug.w / 2, -tug.h / 2 + 12);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Rubber Nose Fender
        ctx.fillStyle = "#18181b";
        ctx.beginPath();
        ctx.arc(0, -tug.h / 2 + 4, 8, Math.PI, 0);
        ctx.fill();

        // Wheelhouse Cabin
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-tug.w / 2 + 4, -tug.h / 2 + 14, tug.w - 8, 16);
        ctx.fillStyle = tug.badgeColor;
        ctx.fillRect(-tug.w / 2 + 6, -tug.h / 2 + 16, tug.w - 12, 6);

        // Tug ID Call Sign on cabin roof
        ctx.fillStyle = "#0f172a";
        ctx.font = getGameCanvasFont(9, "bold");
        ctx.textAlign = "center";
        ctx.fillText(tug.id === "BOW" ? "1호" : "2호", 0, -tug.h / 2 + 27);

        // Towing Winch Drum
        ctx.fillStyle = "#334155";
        ctx.fillRect(-6, 8, 12, 8);

        ctx.restore();
      };

      renderTug(s.tugBow, currentActive === "BOW");
      renderTug(s.tugStern, currentActive === "STERN");

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
      {/* Top HUD: Dual Tugboat Controls & Status */}
      <div className="flex flex-wrap items-center justify-between px-3 sm:px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              HD현대삼호 제1도크 쌍축 2대 협동 예인 시스템
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
              <span className="text-amber-400 flex items-center gap-1">
                <Ship className="w-3 h-3" />
                선수 1호(유도) + 선미 2호(제동·회전)
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400 flex items-center gap-0.5">
                <Link2 className="w-3 h-3" />
                양방향 하우저 체결 완료
              </span>
            </div>
          </div>
        </div>

        {/* Tugboat Selector Switch Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => switchActiveTug("BOW")}
            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTug === "BOW"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/30 ring-1 ring-amber-400"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
            title="선수 예인선 조종 [단축키 1 또는 Tab]"
          >
            <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
            선수 1호 (삼호호)
            <span className="text-[10px] opacity-75 font-mono">{bowTensionDisplay}t</span>
          </button>

          <button
            onClick={() => switchActiveTug("STERN")}
            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTug === "STERN"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30 ring-1 ring-sky-400"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
            title="선미 예인선 조종 [단축키 2 또는 Tab]"
          >
            <span className="w-2 h-2 rounded-full bg-sky-300 animate-pulse" />
            선미 2호 (제동호)
            <span className="text-[10px] opacity-75 font-mono">{sternTensionDisplay}t</span>
          </button>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2 text-xs">
          {/* Target Distance */}
          <div className="flex items-center gap-1.5 bg-sky-950/90 px-2.5 py-1 rounded-md border border-sky-600">
            <span className="text-[10px] text-sky-300 font-bold">도크 잔여:</span>
            <span className="text-xs font-black text-amber-300 tabular-nums">{distToDock}m</span>
          </div>

          {/* Heading Angle */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">선체각:</span>
            <span
              className={`text-xs font-black tabular-nums ${
                Math.abs(shipAngleDeg) < 3.5 ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {shipAngleDeg > 0 ? `+${shipAngleDeg}°` : `${shipAngleDeg}°`}
            </span>
          </div>

          {/* Approach Speed */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">진입속도:</span>
            <span
              className={`text-xs font-black tabular-nums ${
                approachSpeedKts <= 0.7 ? "text-emerald-400" : "text-rose-400 animate-pulse"
              }`}
            >
              {approachSpeedKts} kts
            </span>
          </div>

          {/* Damage */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">손상:</span>
            <span
              className={`text-xs font-black tabular-nums ${
                shipDamage > 50
                  ? "text-rose-400 animate-pulse"
                  : shipDamage > 20
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              {shipDamage}%
            </span>
          </div>

          {/* Time Left */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">시간:</span>
            <span className={`text-xs font-black ${timeLeft <= 10 ? "text-rose-400" : "text-cyan-300"}`}>
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
          <button onClick={toggleSound} className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer">
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div ref={mountRef} className="relative flex-1 w-full min-h-0 overflow-hidden bg-slate-900">
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* Alignment Guidance Pill at Top Center */}
        {gameState === "PLAYING" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none bg-slate-950/80 backdrop-blur-md px-3.5 py-1 rounded-full border border-slate-700/80 text-[11px] font-bold flex items-center gap-2 shadow-lg z-10">
            <Navigation className="w-3.5 h-3.5 text-sky-400" />
            <span>유도 관제:</span>
            <span
              className={
                alignmentText.includes("양호")
                  ? "text-emerald-400"
                  : "text-amber-300"
              }
            >
              {alignmentText}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              현재 조종:{" "}
              <strong className={activeTug === "BOW" ? "text-amber-400" : "text-sky-400"}>
                {activeTug === "BOW" ? "선수 1호 (삼호호)" : "선미 2호 (제동호)"}
              </strong>
            </span>
          </div>
        )}

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center mb-2.5 text-sky-400 shadow-lg">
              <Ship className="w-8 h-8" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-white mb-1.5">
              HD현대삼호 영암호 2대 협동 예인 도크 접안 파일럿
            </h3>
            <div className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-3.5 py-1.5 rounded-xl text-xs font-bold mb-3 max-w-lg">
              ⚓ 선수 1호(삼호호)로 침로를 유도하고, 선미 2호(제동호)로 선체 회전과 속도를 제동하세요!
            </div>
            <p className="text-xs text-slate-300 max-w-lg mb-4 leading-relaxed font-normal">
              1. <strong>[선수 1호기]</strong>는 배의 앞머리를 끌어 상단 <strong>[제1도크 정중선]</strong>으로 이끕니다.<br />
              2. <strong>[선미 2호기]</strong>는 조류로 인한 선미 흔들림(Yaw)을 잡고 <strong>역추진으로 속도를 감속(0.7 kts 이하)</strong>시킵니다.<br />
              3. <strong>[Tab]</strong> 또는 <strong>[1]/[2] 키</strong>로 예인선을 신속히 전환하여 무충격 정밀 접안을 달성하세요.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300 mb-6 bg-slate-900/90 px-4 py-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 bg-amber-950 border border-amber-600 rounded font-mono font-bold text-amber-300">
                  선수 1호: W / A / S / D
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 bg-sky-950 border border-sky-600 rounded font-mono font-bold text-sky-300">
                  선미 2호: ↑ / ← / ↓ / →
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-emerald-300">
                  [Tab] 전환 / [Space] 부스트
                </span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-sky-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              협동 예인 작전 출항하기
            </button>
          </div>
        )}

        {/* SUCCESS Overlay */}
        {gameState === "SUCCESS" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-2 text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-1">
              무사고 안전 도크 접안 완벽 완수!
            </h3>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mb-2">
              최종 점수: {score.toLocaleString()}점
            </div>
            <p className="text-xs text-slate-300 max-w-md mb-5 leading-relaxed">
              선수 1호의 정밀한 각도 유도와 선미 2호의 완벽한 역추진 감속 제동으로 0.7노트 이하 무충격 안착에 성공했습니다.
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
            <p className="text-xs text-slate-400 max-w-md mb-5 leading-relaxed">
              선미 2호기(제동호)를 적극 활용하여 접근 속도를 0.7노트 이하로 낮추고 선미 각도를 정렬해야 합니다.
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

      {/* Bottom Control Bar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-slate-900 border-t border-slate-800 shrink-0 z-10 gap-2">
        {/* Active Tug Toggle Switch */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => switchActiveTug(activeTug === "BOW" ? "STERN" : "BOW")}
            className="px-3 h-9 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded-lg flex items-center gap-1.5 text-xs font-bold text-amber-300 active:scale-95 transition-transform cursor-pointer"
            title="현재 조종할 예인선을 전환합니다 [Tab 키]"
          >
            <Sliders className="w-4 h-4" />
            <span>
              선택 전환: <strong>{activeTug === "BOW" ? "선수 1호 → 선미 2호" : "선미 2호 → 선수 1호"}</strong>
            </span>
          </button>
        </div>

        {/* Directional Pad for Currently Selected Tug */}
        <div className="flex gap-1.5">
          <button
            onPointerDown={() => {
              keysRef.current.left = true;
              stateRef.current.activeTugInputCount++;
            }}
            onPointerUp={() => (keysRef.current.left = false)}
            onPointerLeave={() => (keysRef.current.left = false)}
            className="w-11 h-9 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform cursor-pointer"
            title="좌현 선회"
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
            title="전진 추진"
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
            title="역추진 제동"
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
            title="우현 선회"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="text-[11px] text-slate-400 hidden lg:block">
          💡 선수 1호: <strong>[W/A/S/D]</strong> | 선미 2호: <strong>[방향키]</strong> (동시 제어 지원 / Tab키 전환)
        </div>

        {/* Max Boost Button */}
        <button
          onPointerDown={() => {
            keysRef.current.push = true;
            stateRef.current.activeTugInputCount++;
          }}
          onPointerUp={() => (keysRef.current.push = false)}
          onPointerLeave={() => (keysRef.current.push = false)}
          className="px-3.5 h-9 bg-sky-600 active:bg-sky-500 hover:bg-sky-500 border border-sky-500 rounded-lg flex items-center gap-1.5 text-white font-black text-xs active:scale-95 transition-transform ml-auto cursor-pointer"
        >
          <Anchor className="w-4 h-4" />
          최대 부스트 (Space)
        </button>
      </div>
    </div>
  );
}
