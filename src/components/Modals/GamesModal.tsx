import React, { useState, useEffect } from "react";
import {
  X,
  Trophy,
  ChevronDown,
  ChevronUp,
  Anchor,
  Compass,
  Flame,
  Medal,
  Waves,
  Cog,
  Brush,
  Scan,
  Activity,
  ArrowLeftRight,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { useAppStore } from "../../store/useAppStore";

// 11 Dedicated Shipyard Games
import CraneStackGame from "../Games/CraneStackGame";
import GoliathTurnoverGame from "../Games/GoliathTurnoverGame";
import WeldingMasterGame from "../Games/WeldingMasterGame";
import EngineRoomPipeGame from "../Games/EngineRoomPipeGame";
import PaintBlasterGame from "../Games/PaintBlasterGame";
import DockWaterGame from "../Games/DockWaterGame";
import TugboatPilotGame from "../Games/TugboatPilotGame";
import AnchorMooringGame from "../Games/AnchorMooringGame";
import PropellerTuneGame from "../Games/PropellerTuneGame";
import LNGTankInspectGame from "../Games/LNGTankInspectGame";
import OceanRunnerGame from "../Games/OceanRunnerGame";

interface GameScore {
  id: string;
  playerName: string;
  score: number;
  timestamp: number;
}

interface GamesModalProps {
  onClose: () => void;
}

const getWeekString = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function GamesModal({ onClose }: GamesModalProps) {
  const { currentUser, members } = useAppStore();
  const [activeGame, setActiveGame] = useState<string>("crane");
  const [leaderboard, setLeaderboard] = useState<GameScore[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  /* Derive player name from logged-in user */
  const currentMember = members.find((m) => m.email === currentUser?.email);
  const extractName = (displayName?: string | null) => {
    if (!displayName) return currentUser?.email?.split("@")[0] || "익명 사용자";
    const parts = displayName.split(" ");
    if (parts.length >= 3 && /^\d+$/.test(parts[0])) return parts[1];
    if (
      parts.length === 2 &&
      ["사원", "대리", "과장", "차장", "부장", "책임", "수석"].includes(parts[1])
    )
      return parts[0];
    const match = displayName.match(/[가-힣]{2,4}/);
    return match ? match[0] : displayName;
  };

  const playerName = currentMember
    ? currentMember.name
    : extractName(currentUser?.displayName);

  const displayPlayerName = (nameOrId?: string) => {
    if (!nameOrId) return "익명 사용자";
    const member = members.find(
      (m) => m.email.split("@")[0] === nameOrId || m.name === nameOrId
    );
    return member ? member.name : nameOrId;
  };

  useEffect(() => {
    fetchLeaderboard(activeGame);
  }, [activeGame]);

  const fetchLeaderboard = async (gameId: string) => {
    setLoadingBoard(true);
    try {
      const weekStr = getWeekString();
      const q = query(
        collection(db, `games/${gameId}/weekly_scores/${weekStr}/scores`),
        orderBy("score", "desc"),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const scores: GameScore[] = [];
      snapshot.forEach((doc) =>
        scores.push({ id: doc.id, ...doc.data() } as GameScore)
      );
      const uniqueScores: GameScore[] = [];
      const seenPlayers = new Set<string>();
      for (const s of scores) {
        if (!seenPlayers.has(s.playerName)) {
          seenPlayers.add(s.playerName);
          uniqueScores.push(s);
          if (uniqueScores.length === 10) break;
        }
      }
      setLeaderboard(uniqueScores);
    } catch (e) {
      console.error("Fetch leaderboard error:", e);
    } finally {
      setLoadingBoard(false);
    }
  };

  const saveScore = async (score: number) => {
    try {
      const docId = currentUser?.email || playerName;
      const weekStr = getWeekString();
      const docRef = doc(db, `games/${activeGame}/weekly_scores/${weekStr}/scores`, docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const currentScore = docSnap.data().score;
        if (score <= currentScore) {
          fetchLeaderboard(activeGame);
          return;
        }
      }
      await setDoc(docRef, { playerName, score, timestamp: Date.now() });
      fetchLeaderboard(activeGame);
    } catch (e) {
      console.error("Save score error:", e);
    }
  };

  const getScoreFormat = (_gameId: string, val: number) => {
    return `${val.toLocaleString()}점`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 lg:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-[20px] lg:rounded-[28px] shadow-2xl w-full max-w-6xl flex flex-col lg:flex-row overflow-hidden border border-gray-200 max-h-[96vh] lg:max-h-[92vh]">
        {/* Sidebar */}
        <div className="w-full lg:w-72 bg-slate-50 lg:border-r border-b lg:border-b-0 border-gray-200 p-3 lg:p-5 flex flex-col shrink-0 lg:overflow-y-auto">
          <div className="flex justify-between items-center mb-3 lg:mb-4">
            <h2 className="text-[17px] lg:text-[19px] font-black text-[#002C6C] flex items-center gap-2 tracking-tight">
              <Building2 className="w-5 h-5 text-amber-500" />
              HD조선소 아케이드
            </h2>
            <button
              onClick={onClose}
              className="lg:hidden p-2 bg-gray-200 rounded-full text-gray-500 active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Game Selection Tabs */}
          <div className="flex flex-row lg:flex-col gap-1.5 mb-2 lg:mb-6 overflow-x-auto custom-scrollbar pb-3 lg:pb-0">
            {/* Category 1: 중장비 & 건조 엔지니어링 */}
            <div className="hidden lg:block text-[11px] font-black text-slate-400 px-3 py-1 uppercase tracking-wider">
              중장비 & 선체 건조
            </div>
            <GameTab
              id="crane"
              icon={<Anchor className="w-4 h-4 text-amber-500" />}
              label="골리앗 크레인 탑재"
              badge="대표작"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="turnover"
              icon={<ArrowLeftRight className="w-4 h-4 text-orange-500" />}
              label="900T 블록 턴오버"
              badge="신규"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="welding"
              icon={<Flame className="w-4 h-4 text-rose-500" />}
              label="용접 마스터: 비드"
              badge="정밀"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="pipe"
              icon={<Activity className="w-4 h-4 text-cyan-500" />}
              label="기관실 복합 배관 CAD"
              badge="신규"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="paint"
              icon={<Brush className="w-4 h-4 text-pink-500" />}
              label="선체 친환경 에어리스 도장"
              active={activeGame}
              onClick={setActiveGame}
            />

            {/* Category 2: 시운전 & 도크 항만 작전 */}
            <div className="hidden lg:block text-[11px] font-black text-slate-400 px-3 pt-3 pb-1 uppercase tracking-wider border-t border-slate-200 mt-2">
              도크 진수 & 시운전 작전
            </div>
            <GameTab
              id="dockwater"
              icon={<Waves className="w-4 h-4 text-cyan-500" />}
              label="드라이도크 안전 진수식"
              badge="물리"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="tugboat"
              icon={<Compass className="w-4 h-4 text-sky-500" />}
              label="영암호 예인선 하버 파일럿"
              badge="인기"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="mooring"
              icon={<Anchor className="w-4 h-4 text-blue-500" />}
              label="안벽 계류 윈치 & 볼라드"
              badge="신규"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="propeller"
              icon={<Cog className="w-4 h-4 text-yellow-500" />}
              label="황동 프로펠러 얼라인먼트"
              badge="정밀"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="lnginspect"
              icon={<Scan className="w-4 h-4 text-emerald-500" />}
              label="LNG 멤브레인 레이저 검사"
              badge="하이테크"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="voyager"
              icon={<Compass className="w-4 h-4 text-indigo-500" />}
              label="영암만 Sea Trial 시운전"
              badge="쾌속"
              active={activeGame}
              onClick={setActiveGame}
            />
          </div>

          {/* Current Player Profile Footer */}
          <div className="mt-auto hidden lg:block bg-white p-3.5 rounded-[14px] border border-gray-200 shadow-sm">
            <div className="text-[11px] font-bold text-gray-400 mb-0.5">현재 플레이어</div>
            <div className="text-[14px] font-black text-[#1D1D1F] flex items-center justify-between">
              <span className="truncate">{playerName}</span>
              <span className="text-[10px] bg-blue-100 text-[#007AFF] px-2 py-0.5 rounded-full font-bold">
                동반성장부
              </span>
            </div>
          </div>
        </div>

        {/* Main Game Screen */}
        <div className="flex-1 flex flex-col bg-slate-900 relative min-h-[440px] lg:min-h-0 overflow-y-auto">
          <button
            onClick={onClose}
            className="hidden lg:flex absolute top-4 right-4 p-2.5 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 shadow-sm border border-slate-700 transition-all z-20 active:scale-95"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 p-2 sm:p-3 lg:p-4 flex flex-col items-center justify-center relative min-h-0 w-full font-hd">
            {activeGame === "crane" && <CraneStackGame onFinish={saveScore} />}
            {activeGame === "turnover" && <GoliathTurnoverGame onFinish={saveScore} />}
            {activeGame === "welding" && <WeldingMasterGame onFinish={saveScore} />}
            {activeGame === "pipe" && <EngineRoomPipeGame onFinish={saveScore} />}
            {activeGame === "paint" && <PaintBlasterGame onFinish={saveScore} />}
            {activeGame === "dockwater" && <DockWaterGame onFinish={saveScore} />}
            {activeGame === "tugboat" && <TugboatPilotGame onFinish={saveScore} />}
            {activeGame === "mooring" && <AnchorMooringGame onFinish={saveScore} />}
            {activeGame === "propeller" && <PropellerTuneGame onFinish={saveScore} />}
            {activeGame === "lnginspect" && <LNGTankInspectGame onFinish={saveScore} />}
            {activeGame === "voyager" && <OceanRunnerGame onFinish={saveScore} />}
          </div>
        </div>

        {/* Weekly Leaderboard Panel */}
        <div className="w-full lg:w-72 bg-[#121824] text-white flex flex-col shrink-0 border-l border-slate-800">
          <button
            onClick={() => setIsLeaderboardOpen(!isLeaderboardOpen)}
            className="lg:hidden w-full flex items-center justify-between p-4 bg-slate-900 border-t border-slate-800"
          >
            <div className="font-bold text-[15px] flex items-center gap-2 text-amber-400">
              <Trophy className="w-4 h-4 fill-current" /> 주간 명예의 전당
            </div>
            {isLeaderboardOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>

          <div
            className={`${isLeaderboardOpen ? "flex" : "hidden"} lg:flex flex-col flex-1 p-4 lg:p-5 h-[280px] lg:h-auto overflow-hidden`}
          >
            <div className="hidden lg:flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-[15px] font-black text-white flex items-center gap-2">
                <Medal className="w-4 h-4 text-amber-400" />
                주간 명예의 전당
              </h3>
              <span className="text-[10px] font-bold text-gray-400 bg-white/10 px-2 py-0.5 rounded-full">
                이번 주
              </span>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
              {loadingBoard ? (
                <div className="text-[13px] text-gray-400 text-center py-8">기록 불러오는 중...</div>
              ) : leaderboard.length === 0 ? (
                <div className="text-[13px] text-gray-400 text-center py-8 flex flex-col items-center">
                  <Trophy className="w-8 h-8 text-gray-600 mb-2 stroke-1" />
                  첫 번째 랭커에 도전해보세요!
                </div>
              ) : (
                leaderboard.map((s, i) => (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-[12px] transition-colors border ${
                      i === 0
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                        : i === 1
                        ? "bg-slate-300/10 border-slate-300/20 text-slate-200"
                        : i === 2
                        ? "bg-amber-700/15 border-amber-700/30 text-amber-400"
                        : "bg-white/5 border-white/5 text-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <span
                        className={`font-black text-[13px] w-5 text-center ${
                          i === 0
                            ? "text-amber-400"
                            : i === 1
                            ? "text-slate-300"
                            : i === 2
                            ? "text-amber-600"
                            : "text-gray-500"
                        }`}
                      >
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                      </span>
                      <span
                        className="text-[13px] font-bold truncate max-w-[100px]"
                        title={displayPlayerName(s.playerName)}
                      >
                        {displayPlayerName(s.playerName)}
                      </span>
                    </div>

                    <span className="text-[13px] font-black text-emerald-400 shrink-0 ml-2 tabular-nums">
                      {getScoreFormat(activeGame, s.score)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GameTab({
  id,
  label,
  icon,
  badge,
  active,
  onClick,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  active: string;
  onClick: (id: string) => void;
}) {
  const isSelected = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`shrink-0 whitespace-nowrap px-3 py-2 lg:w-full lg:text-left rounded-[12px] font-bold text-[12px] lg:text-[13px] transition-all flex items-center justify-between gap-2 ${
        isSelected
          ? "bg-[#002C6C] text-white shadow-md shadow-blue-900/20"
          : "bg-white lg:bg-transparent text-gray-700 hover:bg-gray-200/70 border border-gray-200 lg:border-transparent active:scale-95"
      }`}
    >
      <div className="flex items-center gap-2 truncate">
        <span className={isSelected ? "text-amber-300" : "text-gray-500"}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      {badge && (
        <span
          className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase shrink-0 ${
            isSelected
              ? "bg-amber-400 text-slate-900"
              : "bg-blue-100 text-[#007AFF]"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
