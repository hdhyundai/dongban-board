import { useState, useEffect, useRef } from "react";
import {
  X,
  Trophy,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
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
interface GameScore {
  id: string;
  playerName: string;
  score: number;
  timestamp: number;
}
interface GamesModalProps {
  onClose: () => void;
}
export default function GamesModal({ onClose }: GamesModalProps) {
  const { currentUser, members } = useAppStore();
  const [activeGame, setActiveGame] = useState<string>("clicker");
  const [leaderboard, setLeaderboard] = useState<GameScore[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] =
    useState(false); /* Derive player name from logged-in user */
  const currentMember = members.find((m) => m.email === currentUser?.email);
  const extractName = (displayName?: string | null) => {
    if (!displayName) return currentUser?.email?.split("@")[0] || "익명 사용자";
    const parts = displayName.split(" ");
    if (parts.length >= 3 && /^\d+$/.test(parts[0])) return parts[1];
    if (
      parts.length === 2 &&
      ["사원", "대리", "과장", "차장", "부장", "책임", "수석"].includes(
        parts[1],
      )
    )
      return parts[0];
    const match = displayName.match(/[가-힣]{2,4}/);
    return match ? match[0] : displayName;
  };
  const playerName = currentMember
    ? currentMember.name
    : extractName(
        currentUser?.displayName,
      ); /* Map employee ID or email to name for existing leaderboard records */
  const displayPlayerName = (nameOrId?: string) => {
    if (!nameOrId) return "익명 사용자";
    const member = members.find(
      (m) => m.email.split("@")[0] === nameOrId || m.name === nameOrId,
    );
    return member ? member.name : nameOrId;
  };
  useEffect(() => {
    fetchLeaderboard(activeGame);
  }, [activeGame]);
  const fetchLeaderboard = async (gameId: string) => {
    setLoadingBoard(true);
    try {
      /* Memory, and Schulte are sorted by ascending (time), others descending (score) */
      const isAsc = gameId === "memory" || gameId === "schulte";
      const q = query(
        collection(db, `games/${gameId}/scores`),
        orderBy("score", isAsc ? "asc" : "desc"),
        limit(50) /* Fetch more to deduplicate locally */,
      );
      const snapshot = await getDocs(q);
      const scores: GameScore[] = [];
      snapshot.forEach((doc) =>
        scores.push({ id: doc.id, ...doc.data() } as GameScore),
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
      const docRef = doc(db, `games/${activeGame}/scores`, docId);
      const docSnap = await getDoc(docRef);
      const isAsc = activeGame === "memory" || activeGame === "schulte";
      if (docSnap.exists()) {
        const currentScore =
          docSnap.data()
            .score; /* If the new score is NOT better, don't update */
        const isBetter = isAsc ? score < currentScore : score > currentScore;
        if (!isBetter) {
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
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 lg:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      {" "}
      <div className="bg-white rounded-[16px] lg:rounded-[24px] shadow-2xl w-full max-w-6xl flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden border border-gray-200 max-h-[95vh] lg:max-h-[90vh]">
        {" "}
        {/* Sidebar */}{" "}
        <div className="w-full lg:w-56 bg-gray-50 lg:border-r border-b lg:border-b-0 border-gray-200 p-4 lg:p-6 flex flex-col shrink-0 lg:overflow-y-auto">
          {" "}
          <div className="flex justify-between items-center mb-4 lg:mb-6">
            {" "}
            <h2 className="text-[18px] lg:text-[20px] font-bold text-[#1D1D1F] flex items-center gap-2">
              {" "}
              <Trophy className="w-5 h-5 text-yellow-500" /> 스트레스 타파!{" "}
            </h2>{" "}
            <button
              onClick={onClose}
              className="lg:hidden p-2 bg-gray-200 rounded-full text-gray-500"
            >
              {" "}
              <X className="w-4 h-4" />{" "}
            </button>{" "}
          </div>{" "}
          <div className="flex flex-row lg:flex-col gap-2 mb-2 lg:mb-6 overflow-x-auto custom-scrollbar pb-3 lg:pb-0">
            {" "}
            <GameTab
              id="clicker"
              label="분노의 광클"
              active={activeGame}
              onClick={setActiveGame}
            />{" "}
            <GameTab
              id="memory"
              label="짝맞추기"
              active={activeGame}
              onClick={setActiveGame}
            />{" "}
            <GameTab
              id="math"
              label="두뇌 암산"
              active={activeGame}
              onClick={setActiveGame}
            />{" "}
            <GameTab
              id="whack"
              label="두더지 잡기"
              active={activeGame}
              onClick={setActiveGame}
            />{" "}
            <GameTab
              id="schulte"
              label="1~25 순서대로"
              active={activeGame}
              onClick={setActiveGame}
            />{" "}
          </div>{" "}
          <div className="mt-auto hidden lg:block bg-gray-100 p-3 rounded-[12px] border border-gray-200 ">
            {" "}
            <label className="block text-[11px] font-bold text-[#86868B] mb-1">
              현재 플레이어
            </label>{" "}
            <div className="text-[14px] font-bold text-[#1D1D1F] truncate">
              {playerName}
            </div>{" "}
          </div>{" "}
        </div>{" "}
        {/* Main Area */}{" "}
        <div className="flex-1 flex flex-col bg-white relative min-h-[400px] lg:min-h-0 lg:overflow-hidden">
          {" "}
          <button
            onClick={onClose}
            className="hidden lg:flex absolute top-4 right-4 p-2 bg-gray-100 active:scale-95 hover:bg-gray-200 rounded-full text-gray-500 transition-colors z-10"
          >
            {" "}
            <X className="w-5 h-5" />{" "}
          </button>{" "}
          <div className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center relative overflow-y-auto">
            {" "}
            {activeGame === "clicker" && (
              <ClickerGame onFinish={saveScore} />
            )}{" "}
            {activeGame === "memory" && <MemoryGame onFinish={saveScore} />}{" "}
            {activeGame === "math" && <MathGame onFinish={saveScore} />}{" "}
            {activeGame === "whack" && <WhackAMoleGame onFinish={saveScore} />}{" "}
            {activeGame === "schulte" && (
              <SchulteTableGame onFinish={saveScore} />
            )}{" "}
          </div>{" "}
        </div>{" "}
        {/* Leaderboard Panel */}{" "}
        <div className="w-full lg:w-64 bg-[#1D1D1F] text-white flex flex-col shrink-0">
          {" "}
          <button
            onClick={() => setIsLeaderboardOpen(!isLeaderboardOpen)}
            className="lg:hidden w-full flex items-center justify-between p-4 bg-[#2C2C2E] border-t border-[#3A3A3C]"
          >
            {" "}
            <div className="font-bold text-[15px] flex items-center gap-2">
              {" "}
              명예의 전당 🏆{" "}
            </div>{" "}
            {isLeaderboardOpen ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}{" "}
          </button>{" "}
          <div
            className={`${isLeaderboardOpen ? "flex" : "hidden"} lg:flex flex-col flex-1 p-4 lg:p-6 h-[300px] lg:h-auto overflow-hidden`}
          >
            {" "}
            <h3 className="hidden lg:flex text-[16px] font-bold mb-4 text-[#F2F2F7] items-center gap-2">
              {" "}
              명예의 전당 🏆{" "}
            </h3>{" "}
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {" "}
              {loadingBoard ? (
                <div className="text-[13px] text-gray-400 text-center py-4">
                  로딩중...
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="text-[13px] text-gray-400 text-center py-4">
                  아직 기록이 없습니다.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {" "}
                  {leaderboard.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between bg-white/10 px-3 py-2 rounded-[10px]"
                    >
                      {" "}
                      <div className="flex items-center gap-2 overflow-hidden">
                        {" "}
                        <span
                          className={`font-black text-[14px] ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-500"}`}
                        >
                          {" "}
                          {i + 1}{" "}
                        </span>{" "}
                        <span
                          className="text-[13px] font-bold truncate"
                          title={displayPlayerName(s.playerName)}
                        >
                          {displayPlayerName(s.playerName)}
                        </span>{" "}
                      </div>{" "}
                      <span className="text-[13px] font-bold text-[#34C759] shrink-0 ml-2">
                        {" "}
                        {activeGame === "memory" || activeGame === "schulte"
                          ? `${s.score}초`
                          : activeGame === "math"
                            ? `${s.score}점`
                            : `${s.score}번`}{" "}
                      </span>{" "}
                    </div>
                  ))}{" "}
                </div>
              )}{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
function GameTab({
  id,
  label,
  active,
  onClick,
}: {
  id: string;
  label: string;
  active: string;
  onClick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`shrink-0 whitespace-nowrap px-4 py-2 lg:w-full lg:text-left lg:py-3 rounded-[20px] lg:rounded-[12px] font-bold text-[13px] lg:text-[14px] transition-colors ${active === id ? "bg-[#1D1D1F] text-white" : "bg-gray-200 lg:bg-transparent text-[#48484A] active:scale-95 hover:bg-gray-200"}`}
    >
      {" "}
      {label}{" "}
    </button>
  );
}
function ClickerGame({ onFinish }: { onFinish: (s: number) => void }) {
  const [clicks, setClicks] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const timerRef = useRef<any>(null);
  const startGame = () => {
    setClicks(0);
    setTimeLeft(10);
    setPlaying(true);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setPlaying(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  useEffect(() => {
    if (timeLeft === 0 && clicks > 0 && !playing) {
      onFinish(clicks);
    }
  }, [timeLeft, clicks, playing]);
  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);
  return (
    <div className="flex flex-col items-center text-center">
      {" "}
      <h3 className="text-[24px] font-bold text-[#1D1D1F] mb-2">
        분노의 광클
      </h3>{" "}
      <p className="text-[#86868B] text-[14px] mb-8 font-medium">
        10초 동안 버튼을 최대한 많이 클릭하세요!
      </p>{" "}
      {!playing && timeLeft === 10 && (
        <button
          onClick={startGame}
          className="bg-[#34C759] active:scale-95 hover:bg-[#28A745] text-white px-8 py-4 rounded-[16px] text-[20px] font-bold shadow-lg transition-transform active:scale-95 flex items-center gap-2"
        >
          {" "}
          <Play className="w-6 h-6" /> 게임 시작{" "}
        </button>
      )}{" "}
      {playing && (
        <div className="flex flex-col items-center">
          {" "}
          <div className="text-[48px] font-black text-[#FF3B30] mb-8 animate-pulse">
            {timeLeft}초
          </div>{" "}
          <button
            onClick={() => setClicks((c) => c + 1)}
            className="w-48 h-48 bg-[#007AFF] active:scale-95 hover:bg-[#0056b3] text-white rounded-full text-[40px] font-black shadow-xl active:scale-90 transition-all select-none"
          >
            {" "}
            {clicks}{" "}
          </button>{" "}
        </div>
      )}{" "}
      {!playing && timeLeft === 0 && (
        <div className="flex flex-col items-center">
          {" "}
          <div className="text-[64px] font-black text-[#007AFF] mb-4">
            {clicks}번!
          </div>{" "}
          <p className="text-[#48484A] font-bold mb-8">
            기록이 저장되었습니다.
          </p>{" "}
          <button
            onClick={() => setTimeLeft(10)}
            className="bg-gray-200 active:scale-95 hover:bg-gray-300 text-[#1D1D1F] px-6 py-3 rounded-[12px] font-bold flex items-center gap-2 transition-colors"
          >
            {" "}
            <RotateCcw className="w-5 h-5" /> 다시 하기{" "}
          </button>{" "}
        </div>
      )}{" "}
    </div>
  );
}
const EMOJIS = ["🚢", "⚓", "🌊", "🏗️", "🔧", "👷", "📈", "🤝"];
function MemoryGame({ onFinish }: { onFinish: (s: number) => void }) {
  const [cards, setCards] = useState<
    { id: number; content: string; isImage: boolean; flipped: boolean; matched: boolean }[]
  >([]);
  const [playing, setPlaying] = useState(false);
  const [flipped, setFlipped] = useState<number[]>([]);
  const startTimeRef = useRef(0);
  const [timeStr, setTimeStr] = useState("0.0");
  const timerRef = useRef<any>(null);
  const [availableImages, setAvailableImages] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/memory-images')
      .then(r => r.json())
      .then(data => {
        if (data.images) setAvailableImages(data.images);
      })
      .catch(console.error);
  }, []);

  const startGame = () => {
    let selectedContent: { content: string, isImage: boolean }[] = [];
    if (availableImages.length > 0) {
      const shuffledImages = [...availableImages].sort(() => Math.random() - 0.5);
      const toUse = shuffledImages.slice(0, 8);
      let i = 0;
      while (toUse.length < 8) {
         toUse.push(toUse[i % toUse.length]);
         i++;
      }
      selectedContent = toUse.map(img => ({ content: img, isImage: true }));
    } else {
      selectedContent = EMOJIS.map(emoji => ({ content: emoji, isImage: false }));
    }

    const shuffled = [...selectedContent, ...selectedContent]
      .sort(() => Math.random() - 0.5)
      .map((item, idx) => ({
        id: idx,
        content: item.content,
        isImage: item.isImage,
        flipped: false,
        matched: false,
      }));
    
    setCards(shuffled);
    setPlaying(true);
    setFlipped([]);
    startTimeRef.current = Date.now();
  };

  useEffect(() => {
    if (!playing) return;
    const updateTime = () =>
      setTimeStr(((Date.now() - startTimeRef.current) / 1000).toFixed(1));
    timerRef.current = setInterval(updateTime, 100);
    return () => clearInterval(timerRef.current);
  }, [playing]);

  const handleCardClick = (id: number) => {
    if (flipped.length === 2) return;
    if (cards[id].flipped || cards[id].matched) return;
    const newCards = [...cards];
    newCards[id].flipped = true;
    setCards(newCards);
    const newFlipped = [...flipped, id];
    setFlipped(newFlipped);
    if (newFlipped.length === 2) {
      const [first, second] = newFlipped;
      if (newCards[first].content === newCards[second].content) {
        newCards[first].matched = true;
        newCards[second].matched = true;
        setCards(newCards);
        setFlipped([]);
        if (newCards.every((c) => c.matched)) {
          clearInterval(timerRef.current);
          setPlaying(false);
          const finalTime = parseFloat(
            ((Date.now() - startTimeRef.current) / 1000).toFixed(1),
          );
          setTimeStr(finalTime.toFixed(1));
          onFinish(finalTime);
        }
      } else {
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c, i) =>
              i === first || i === second ? { ...c, flipped: false } : c,
            ),
          );
          setFlipped([]);
        }, 800);
      }
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      {" "}
      <h3 className="text-[24px] font-bold text-[#1D1D1F] mb-2">
        동반성장 짝맞추기
      </h3>{" "}
      {!playing && cards.length === 0 && (
        <button
          onClick={startGame}
          className="bg-[#34C759] text-white px-8 py-4 rounded-[16px] text-[20px] font-bold shadow-lg mt-8 flex items-center gap-2"
        >
          {" "}
          <Play className="w-6 h-6" /> 시작하기{" "}
        </button>
      )}{" "}
      {cards.length > 0 && (
        <div className="flex flex-col items-center">
          {" "}
          <div className="text-[24px] font-bold text-[#007AFF] mb-6">
            {timeStr}초
          </div>{" "}
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {" "}
            {cards.map((c, i) => (
              <div
                key={i}
                onClick={() => playing && handleCardClick(i)}
                className={`w-14 h-14 sm:w-20 sm:h-20 flex items-center justify-center text-[24px] sm:text-[32px] rounded-[12px] cursor-pointer transition-all duration-300 transform ${c.flipped || c.matched ? "bg-blue-100 rotate-y-180" : "bg-[#1D1D1F] active:scale-95 hover:bg-gray-800 shadow-md"}`}
              >
                {" "}
                {(c.flipped || c.matched) ? (
                  c.isImage ? (
                    <img src={c.content} alt="card" className="w-[85%] h-[85%] object-cover rounded-full contrast-125 saturate-110 brightness-105" />
                  ) : (
                    c.content
                  )
                ) : ""}{" "}
              </div>
            ))}{" "}
          </div>{" "}
          {!playing && cards.every((c) => c.matched) && (
            <button
              onClick={() => setCards([])}
              className="mt-8 bg-gray-200 active:scale-95 hover:bg-gray-300 text-[#1D1D1F] px-6 py-3 rounded-[12px] font-bold flex items-center gap-2"
            >
              {" "}
              <RotateCcw className="w-5 h-5" /> 다시 하기{" "}
            </button>
          )}{" "}
        </div>
      )}{" "}
    </div>
  );
}
function MathGame({ onFinish }: { onFinish: (s: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [problem, setProblem] = useState({ q: "", a: 0 });
  const [input, setInput] = useState("");
  const timerRef = useRef<any>(null);
  const generateProblem = () => {
    const ops = ["+", "-", "*"];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, answer;
    if (op === "+") {
      a = Math.floor(Math.random() * 90) + 10;
      b = Math.floor(Math.random() * 90) + 10;
      answer = a + b;
    } else if (op === "-") {
      a = Math.floor(Math.random() * 90) + 10;
      b = Math.floor(Math.random() * a);
      answer = a - b;
    } else {
      a = Math.floor(Math.random() * 11) + 2;
      b = Math.floor(Math.random() * 11) + 2;
      answer = a * b;
    }
    setProblem({ q: `${a} ${op === "*" ? "×" : op} ${b}`, a: answer });
    setInput("");
  };
  const startGame = () => {
    setScore(0);
    setTimeLeft(30);
    setPlaying(true);
    generateProblem();
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setPlaying(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  useEffect(() => {
    if (timeLeft === 0 && score > 0 && !playing) {
      onFinish(score);
    }
  }, [timeLeft, score, playing]);
  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);
  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (!playing) return;
    if (parseInt(input) === problem.a) {
      setScore((s) => s + 1);
      generateProblem();
    } else {
      setInput(""); /* shake or clear */
    }
  };
  return (
    <div className="flex flex-col items-center w-full text-center">
      {" "}
      <h3 className="text-[24px] font-bold text-[#1D1D1F] mb-2">
        두뇌 풀가동 암산
      </h3>{" "}
      <p className="text-[#86868B] text-[14px] mb-6 font-medium">
        30초 동안 최대한 많은 문제를 푸세요!
      </p>{" "}
      {!playing && timeLeft === 30 && (
        <button
          onClick={startGame}
          className="bg-[#007AFF] active:scale-95 hover:bg-[#0056b3] text-white px-8 py-4 rounded-[16px] text-[20px] font-bold shadow-lg transition-transform active:scale-95 flex items-center gap-2"
        >
          {" "}
          <Play className="w-6 h-6" /> 시작하기{" "}
        </button>
      )}{" "}
      {playing && (
        <div className="flex flex-col items-center w-full max-w-sm">
          {" "}
          <div className="flex justify-between w-full mb-8 px-4">
            {" "}
            <div className="text-[24px] font-black text-[#FF3B30]">
              {timeLeft}초
            </div>{" "}
            <div className="text-[24px] font-black text-[#34C759]">
              {score}점
            </div>{" "}
          </div>{" "}
          <div className="text-[48px] font-black text-[#1D1D1F] mb-8">
            {problem.q} = ?
          </div>{" "}
          <form onSubmit={handleSubmit} className="w-full">
            {" "}
            <input
              type="number"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full text-center text-[32px] font-bold py-4 rounded-[16px] border-2 border-[#007AFF] focus:outline-none focus:ring-4 focus:ring-blue-100"
              autoFocus
              placeholder="정답 입력 후 엔터"
            />{" "}
          </form>{" "}
        </div>
      )}{" "}
      {!playing && timeLeft === 0 && (
        <div className="flex flex-col items-center">
          {" "}
          <div className="text-[54px] font-black text-[#007AFF] mb-4">
            {score}점!
          </div>{" "}
          <p className="text-[#48484A] font-bold mb-8">
            기록이 저장되었습니다.
          </p>{" "}
          <button
            onClick={() => {
              setTimeLeft(30);
              setScore(0);
            }}
            className="bg-gray-200 active:scale-95 hover:bg-gray-300 text-[#1D1D1F] px-6 py-3 rounded-[12px] font-bold flex items-center gap-2 transition-colors"
          >
            {" "}
            <RotateCcw className="w-5 h-5" /> 다시 하기{" "}
          </button>{" "}
        </div>
      )}{" "}
    </div>
  );
}
function WhackAMoleGame({ onFinish }: { onFinish: (s: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [activeMoles, setActiveMoles] = useState<boolean[]>(
    Array(9).fill(false),
  );
  const timerRef = useRef<any>(null);
  const moleIntervalRef = useRef<any>(null);
  const startGame = () => {
    setScore(0);
    setTimeLeft(15);
    setPlaying(true);
    setActiveMoles(Array(9).fill(false));
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    moleIntervalRef.current = setInterval(() => {
      setActiveMoles((prev) => {
        const next = [...prev];
        const numActive = next.filter(Boolean).length;
        if (numActive < 3) {
          const emptyIndices = next
            .map((val, idx) => (!val ? idx : -1))
            .filter((idx) => idx !== -1);
          if (emptyIndices.length > 0) {
            const randomIdx =
              emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
            next[randomIdx] = true; /* auto hide after 800ms */
            setTimeout(() => {
              setActiveMoles((current) => {
                const updated = [...current];
                updated[randomIdx] = false;
                return updated;
              });
            }, 800);
          }
        }
        return next;
      });
    }, 600);
  };
  const endGame = () => {
    clearInterval(timerRef.current);
    clearInterval(moleIntervalRef.current);
    setPlaying(false);
    setActiveMoles(Array(9).fill(false));
  };
  useEffect(() => {
    if (timeLeft === 0 && score > 0 && !playing) {
      onFinish(score);
    }
  }, [timeLeft, score, playing]);
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(moleIntervalRef.current);
    };
  }, []);
  const handleWhack = (index: number) => {
    if (!playing || !activeMoles[index]) return;
    setActiveMoles((prev) => {
      const next = [...prev];
      next[index] = false;
      return next;
    });
    setScore((s) => s + 1);
  };
  return (
    <div className="flex flex-col items-center w-full text-center">
      {" "}
      <h3 className="text-[24px] font-bold text-[#1D1D1F] mb-2">
        두더지 잡기
      </h3>{" "}
      <p className="text-[#86868B] text-[14px] mb-6 font-medium">
        15초 동안 나타나는 두더지를 잡아라!
      </p>{" "}
      {!playing && timeLeft === 15 && (
        <button
          onClick={startGame}
          className="bg-[#FF9500] active:scale-95 hover:bg-[#E08300] text-white px-8 py-4 rounded-[16px] text-[20px] font-bold shadow-lg transition-transform active:scale-95 flex items-center gap-2"
        >
          {" "}
          <Play className="w-6 h-6" /> 시작하기{" "}
        </button>
      )}{" "}
      {playing && (
        <div className="flex flex-col items-center w-full">
          {" "}
          <div className="flex justify-between w-64 mb-6">
            {" "}
            <div className="text-[24px] font-black text-[#FF3B30]">
              {timeLeft}초
            </div>{" "}
            <div className="text-[24px] font-black text-[#007AFF]">
              {score}점
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-3 gap-3">
            {" "}
            {activeMoles.map((isActive, i) => (
              <div
                key={i}
                onMouseDown={() => handleWhack(i)}
                className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-[40px] cursor-pointer select-none transition-transform ${isActive ? "bg-[#34C759] active:scale-90 shadow-inner" : "bg-gray-200"}`}
              >
                {" "}
                {isActive ? "🐹" : ""}{" "}
              </div>
            ))}{" "}
          </div>{" "}
        </div>
      )}{" "}
      {!playing && timeLeft === 0 && (
        <div className="flex flex-col items-center">
          {" "}
          <div className="text-[54px] font-black text-[#007AFF] mb-4">
            {score}점!
          </div>{" "}
          <p className="text-[#48484A] font-bold mb-8">
            기록이 저장되었습니다.
          </p>{" "}
          <button
            onClick={() => {
              setTimeLeft(15);
              setScore(0);
            }}
            className="bg-gray-200 active:scale-95 hover:bg-gray-300 text-[#1D1D1F] px-6 py-3 rounded-[12px] font-bold flex items-center gap-2 transition-colors"
          >
            {" "}
            <RotateCcw className="w-5 h-5" /> 다시 하기{" "}
          </button>{" "}
        </div>
      )}{" "}
    </div>
  );
}
function SchulteTableGame({ onFinish }: { onFinish: (s: number) => void }) {
  const [numbers, setNumbers] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [currentNum, setCurrentNum] = useState(1);
  const startTimeRef = useRef(0);
  const [timeStr, setTimeStr] = useState("0.0");
  const timerRef = useRef<any>(null);
  const startGame = () => {
    const arr = Array.from({ length: 25 }, (_, i) => i + 1).sort(
      () => Math.random() - 0.5,
    );
    setNumbers(arr);
    setCurrentNum(1);
    setPlaying(true);
    startTimeRef.current = Date.now();
  };
  useEffect(() => {
    if (!playing) return;
    const updateTime = () =>
      setTimeStr(((Date.now() - startTimeRef.current) / 1000).toFixed(1));
    timerRef.current = setInterval(updateTime, 100);
    return () => clearInterval(timerRef.current);
  }, [playing]);
  const handleClick = (num: number) => {
    if (!playing) return;
    if (num === currentNum) {
      if (num === 25) {
        clearInterval(timerRef.current);
        setCurrentNum(26);
        setPlaying(false);
        const finalTime = parseFloat(
          ((Date.now() - startTimeRef.current) / 1000).toFixed(1),
        );
        setTimeStr(finalTime.toFixed(1));
        onFinish(finalTime);
      } else {
        setCurrentNum((c) => c + 1);
      }
    }
  };
  return (
    <div className="flex flex-col items-center w-full">
      {" "}
      <h3 className="text-[24px] font-bold text-[#1D1D1F] mb-2">
        1~25 순서대로
      </h3>{" "}
      <p className="text-[#86868B] text-[14px] mb-6 font-medium">
        1부터 25까지 순서대로 최대한 빨리 클릭하세요!
      </p>{" "}
      {!playing && numbers.length === 0 && (
        <button
          onClick={startGame}
          className="bg-[#AF52DE] active:scale-95 hover:bg-[#9B40C6] text-white px-8 py-4 rounded-[16px] text-[20px] font-bold shadow-lg transition-transform active:scale-95 flex items-center gap-2"
        >
          {" "}
          <Play className="w-6 h-6" /> 시작하기{" "}
        </button>
      )}{" "}
      {numbers.length > 0 && (
        <div className="flex flex-col items-center">
          {" "}
          <div className="flex justify-between items-center w-full max-w-[320px] px-2 mb-4">
            {" "}
            <div className="text-[24px] font-bold text-[#007AFF]">
              {timeStr}초
            </div>{" "}
            {playing && (
              <div className="text-[18px] font-black bg-gray-100 px-3 py-1 rounded-[8px]">
                다음: {currentNum}
              </div>
            )}{" "}
          </div>{" "}
          <div className="grid grid-cols-5 gap-2 sm:gap-3 bg-gray-50 p-2 sm:p-4 rounded-[16px] border border-gray-200 ">
            {" "}
            {numbers.map((num, i) => {
              const isClicked = num < currentNum;
              return (
                <div
                  key={i}
                  onMouseDown={() => handleClick(num)}
                  className={`w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center text-[20px] sm:text-[24px] font-bold rounded-[8px] sm:rounded-[12px] cursor-pointer transition-all select-none ${isClicked ? "bg-gray-200 text-gray-400" : "bg-white text-[#1D1D1F] shadow-sm hover:shadow-md border border-gray-200 active:bg-blue-100 active:scale-95"}`}
                >
                  {" "}
                  {num}{" "}
                </div>
              );
            })}{" "}
          </div>{" "}
          {!playing && currentNum > 25 && (
            <button
              onClick={() => setNumbers([])}
              className="mt-8 bg-gray-200 active:scale-95 hover:bg-gray-300 text-[#1D1D1F] px-6 py-3 rounded-[12px] font-bold flex items-center gap-2"
            >
              {" "}
              <RotateCcw className="w-5 h-5" /> 다시 하기{" "}
            </button>
          )}{" "}
        </div>
      )}{" "}
    </div>
  );
}
