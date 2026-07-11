import { useMemo, useState, useRef, useEffect } from "react";
import {
  format,
  addMonths,
  subMonths,
  getDaysInMonth,
  startOfMonth,
  getDay,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Gift,
  MessageSquare,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { TEAMS, HOLIDAYS, getHoliday } from "../lib/constants";
import {
  cn,
  formatDateForInput,
  isSameDate,
  getBirthdayThisYear,
} from "../lib/utils";
import { Task } from "../types";
interface CalendarProps {
  filteredTasks: Task[];
  onOpenTaskModal: (date: Date) => void;
  onEditTask: (id: string) => void;
  onDateClick?: () => void;
}
export default function Calendar({
  filteredTasks,
  onOpenTaskModal,
  onEditTask,
  onDateClick,
}: CalendarProps) {
  const { selectedDate, setSelectedDate, members, addToast } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [moreTasksDate, setMoreTasksDate] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hideNames, setHideNames] = useState(false);
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const handleToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(new Date());
  };
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getDay(startOfMonth(currentMonth));
  const currentMonthBirthdays = useMemo(() => {
    return members
      .filter((b) => {
        const bday = getBirthdayThisYear(b, year);
        return bday.month === month + 1;
      })
      .sort(
        (a, b) =>
          getBirthdayThisYear(a, year).day - getBirthdayThisYear(b, year).day,
      );
  }, [members, month, year]);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        /* Calculate the required width based on number of birthdays */
        const namesCount = currentMonthBirthdays.length;
        const columns = namesCount > 3 ? 2 : namesCount;
        const requiredWidth = 160 + columns * 110;
        if (entry.target.clientWidth < requiredWidth) {
          setHideNames(true);
        } else {
          setHideNames(false);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [currentMonthBirthdays.length]);
  const renderCells = () => {
    const cells = [];
    const todayStr = formatDateForInput(new Date());
    for (let i = 0; i < 42; i++) {
      const dayNum = i - firstDay + 1;
      const isCurrentMonth = dayNum > 0 && dayNum <= daysInMonth;
      const cellDate = isCurrentMonth ? new Date(year, month, dayNum) : null;
      const cellDateStr = cellDate ? formatDateForInput(cellDate) : "";
      const isSelected = isSameDate(cellDate, selectedDate);
      const holidayName = isCurrentMonth ? getHoliday(cellDateStr) : null;
      const isRed = isCurrentMonth && (i % 7 === 0 || holidayName);
      const isSat = i % 7 === 6;
      const dayTasks = isCurrentMonth
        ? filteredTasks
            .filter(
              (t) => t.startDate <= cellDateStr && t.endDate >= cellDateStr,
            )
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
        : [];
      cells.push(
        <div
          key={i}
          onClick={() => {
            if (isCurrentMonth) {
              setSelectedDate(cellDate);
              if (window.innerWidth <= 1024 && dayTasks.length > 0) {
                setMoreTasksDate(cellDate);
              }
              onDateClick?.();
            }
          }}
          onDoubleClick={() => isCurrentMonth && onOpenTaskModal(cellDate)}
          className={cn(
            "relative border-r border-b border-gray-200 transition-colors p-0.5 sm:p-1.5 flex flex-col h-full overflow-hidden",
            isCurrentMonth
              ? "bg-white active:scale-95 hover:bg-gray-50 cursor-pointer"
              : "bg-[#F9F9FB] text-black/15",
            isSelected &&
              isCurrentMonth &&
              "ring-2 ring-inset ring-[#007AFF] z-10 bg-[#007AFF]/5 rounded-[4px]",
          )}
        >
          {" "}
          {isCurrentMonth ? (
            <>
              {" "}
              <div className="absolute top-1.5 left-1.5 z-10">
                {" "}
                <span
                  className={cn(
                    "w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center font-bold text-[11px] sm:text-[12px]",
                    cellDateStr === todayStr
                      ? "bg-[#007AFF] rounded-full shadow-md text-white"
                      : isRed
                        ? "text-[#FF3B30]"
                        : isSat
                          ? "text-[#007AFF]"
                          : "text-[#1D1D1F] ",
                  )}
                >
                  {" "}
                  {dayNum}{" "}
                </span>{" "}
              </div>{" "}
              {holidayName && (
                <span className="absolute top-1 sm:top-1.5 right-1 sm:right-1.5 text-[9px] sm:text-[10px] font-bold text-[#FF3B30] bg-white/80 px-1 rounded truncate max-w-[calc(100%-28px)] sm:max-w-none">
                  {holidayName}
                </span>
              )}{" "}
              <div className="flex items-start w-full h-full relative z-20 pt-[2px]">
                {" "}
                <div className="w-[18px] sm:w-[26px] shrink-0"></div>{" "}
                <div className="flex flex-col gap-0.5 sm:gap-1 flex-1 min-w-0">
                  {" "}
                  {dayTasks.slice(0, 4).map((t, idx) => {
                    const team = TEAMS.find((x) => x.id === t.teamId)!;
                    if (idx === 3 && dayTasks.length > 4) {
                      return (
                        <div
                          key={`more-${idx}`}
                          className="flex items-center gap-1 w-full"
                        >
                          {" "}
                          <div
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              onEditTask(t.id);
                            }}
                            className={cn(
                              "flex-1 min-w-0 bg-white rounded-[4px] shadow-sm border px-1 py-0 sm:px-1.5 sm:py-0.5 text-[9px] sm:text-[11px] font-bold truncate leading-tight cursor-pointer",
                              team.border,
                              team.bg,
                              team.text,
                            )}
                          >
                            {" "}
                            {t.title}{" "}
                          </div>{" "}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setMoreTasksDate(cellDate);
                            }}
                            className="shrink-0 bg-white border border-gray-300 px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold text-center text-[#48484A] shadow-sm cursor-pointer hover:bg-gray-50"
                          >
                            {" "}
                            +{dayTasks.length - 4}{" "}
                          </div>{" "}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={t.id || `t-${idx}`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onEditTask(t.id);
                        }}
                        className={cn(
                          "w-full bg-white rounded-[4px] shadow-sm border px-1 py-0 sm:px-1.5 sm:py-0.5 text-[9px] sm:text-[11px] font-bold truncate leading-tight hover:opacity-80 transition-opacity cursor-pointer",
                          team?.border,
                          team?.bg,
                          team?.text,
                        )}
                      >
                        {" "}
                        {t.title}{" "}
                      </div>
                    );
                  })}{" "}
                </div>{" "}
              </div>{" "}
            </>
          ) : (
            <div className="text-[13px] md:text-[15px] font-bold p-1">
              {dayNum > 0 ? dayNum : ""}
            </div>
          )}{" "}
        </div>,
      );
    }
    return cells;
  };
  return (
    <div className="bg-white rounded-none sm:rounded-[28px] sm:shadow-sm flex-1 flex flex-col overflow-hidden min-h-0 border-b sm:border border-gray-300 border-x-0">
      {" "}
      <div className="flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-5 items-center px-3 pt-[5px] pb-[11px] sm:px-4 sm:pt-[5px] sm:pb-[11px] md:px-5 md:pt-[5px] md:pb-[11px] border-b border-gray-200 h-[58px] sm:h-[58px] md:h-[58px] shrink-0 bg-white ">
        {" "}
        <div
          ref={containerRef}
          className="flex justify-start items-center gap-2 sm:gap-3 min-w-0 order-2 md:order-1 w-full md:w-auto overflow-hidden"
        >
          {" "}
          <button
            onClick={handleToday}
            className="hidden md:block w-[59px] shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 text-[13px] sm:text-[14px] font-bold text-[#1D1D1F] bg-[#E5E5EA] active:scale-95 hover:bg-gray-300 border border-gray-300 rounded-[8px] sm:rounded-[10px] transition-colors"
          >
            오늘
          </button>{" "}
          {currentMonthBirthdays.length > 0 && (
            <>
              {" "}
              <button
                onClick={() => setShowBirthdayModal(true)}
                className="hidden md:flex h-[39px] items-center gap-1.5 text-[12.5px] font-extrabold text-[#0D9488] bg-[#0D9488]/10 px-3 rounded-[8px] border border-[#0D9488]/20 transition-colors active:scale-95 hover:bg-[#0D9488]/20 text-left min-w-0"
              >
                {" "}
                <span className="shrink-0">🎂 생일자</span>{" "}
                <div
                  className={`hidden md:grid gap-x-2 ${currentMonthBirthdays.length > 3 ? "gap-y-0.5" : "gap-y-1"} ml-1 ${hideNames ? "!hidden" : ""}`}
                  style={{
                    gridTemplateColumns:
                      currentMonthBirthdays.length === 4
                        ? "repeat(2, 1fr)"
                        : `repeat(${Math.min(currentMonthBirthdays.length, 3)}, 1fr)`,
                  }}
                >
                  {" "}
                  {currentMonthBirthdays.map((b, b_idx) => (
                    <span
                      key={b.id || `b-${b_idx}`}
                      className={`whitespace-nowrap ${currentMonthBirthdays.length > 3 ? "text-[11px] leading-[14px]" : "leading-normal"}`}
                    >
                      {" "}
                      {b.name} {b.title}
                      {b.isLunar ? "(음)" : ""}(
                      {getBirthdayThisYear(b, year).day}일){" "}
                    </span>
                  ))}{" "}
                </div>{" "}
              </button>{" "}
            </>
          )}{" "}
        </div>{" "}
<div className="flex items-center justify-between md:justify-center md:gap-4 shrink-0 order-1 md:order-2 w-full md:w-auto px-1">
          <div className="flex justify-start flex-1 basis-0 md:hidden">
            <button
              onClick={handleToday}
              className="w-[59px] shrink-0 px-3 py-1.5 text-[13px] font-bold text-[#1D1D1F] bg-[#E5E5EA] active:scale-95 hover:bg-gray-300 border border-gray-300 rounded-[8px] transition-colors"
            >
              오늘
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5 sm:gap-4 shrink-0">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 sm:p-2 active:scale-95 hover:bg-gray-100 border border-transparent hover:border-gray-200 rounded-full transition-colors text-[#48484A] hover:text-[#1D1D1F]"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-[17px] sm:text-[20px] md:text-[22px] font-bold text-[#1D1D1F] tracking-tight min-w-[110px] sm:min-w-[140px] text-center whitespace-nowrap">
              {format(currentMonth, "yyyy년 M월")}
            </h2>
            <button
              onClick={handleNextMonth}
              className="p-1.5 sm:p-2 active:scale-95 hover:bg-gray-100 border border-transparent hover:border-gray-200 rounded-full transition-colors text-[#48484A] hover:text-[#1D1D1F]"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="flex justify-end flex-1 basis-0 md:hidden">
            {currentMonthBirthdays.length > 0 && (
              <button
                onClick={() => setShowBirthdayModal(true)}
                className="h-[36px] flex items-center justify-center gap-1 text-[12.5px] font-extrabold text-[#0D9488] bg-[#0D9488]/10 rounded-[8px] border border-[#0D9488]/20 transition-colors active:scale-95 hover:bg-[#0D9488]/20 text-left shrink-0"
                style={{ width: "63.375px" }}
              >
                <span className="shrink-0">🎂 생일자</span>
              </button>
            )}
          </div>
        </div>        <div className="hidden md:flex flex-wrap justify-end gap-3 min-w-0 order-3 h-[46px] pt-[8px] mt-[3px] items-center">
          {" "}
          {TEAMS.filter((t) => t.id !== "t_notice").map((team) => (
            <span
              key={team.id}
              className="flex items-center gap-1.5 text-[13px] font-bold text-[#48484A] h-[18.5px] -mt-[17px]"
            >
              {" "}
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: team.hex }}
              ></div>{" "}
              {team.name}{" "}
            </span>
          ))}{" "}
        </div>{" "}
      </div>{" "}
      <div className="grid grid-cols-7 border-b border-gray-200 shrink-0 bg-[#F9F9FB] ">
        {" "}
        {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => (
          <div
            key={day}
            className={cn(
              "text-center py-1.5 sm:py-2.5 text-[11px] sm:text-[12px] font-bold",
              i === 0
                ? "text-[#FF3B30]"
                : i === 6
                  ? "text-[#007AFF]"
                  : "text-[#3A3A3C]",
            )}
          >
            {" "}
            {day}{" "}
          </div>
        ))}{" "}
      </div>{" "}
      <div className="flex-1 overflow-y-auto min-h-0 bg-white no-scrollbar">
        {" "}
        <div className="grid grid-cols-7 grid-rows-6 h-full min-h-[60vh] sm:min-h-[500px] md:min-h-[600px] xl:min-h-[650px] border-l border-t border-gray-200 ">
          {" "}
          {renderCells()}{" "}
        </div>{" "}
      </div>{" "}
      {moreTasksDate && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-transparent"
          onClick={() => setMoreTasksDate(null)}
        >
          {" "}
          <div
            className="bg-white rounded-[16px] shadow-[0_10px_40px_rgba(0,0,0,0.2)] border border-gray-200 w-64 max-h-[350px] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {" "}
            <div className="px-4 py-3 flex items-center justify-between">
              {" "}
              <h3 className="text-[14px] font-bold text-[#1D1D1F] ">
                {" "}
                {format(moreTasksDate, "M월 d일")} 일정{" "}
              </h3>{" "}
              <button
                onClick={() => setMoreTasksDate(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                {" "}
                <X className="w-4 h-4" />{" "}
              </button>{" "}
            </div>{" "}
            <div className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto overscroll-contain no-scrollbar">
              {" "}
              {filteredTasks
                .filter(
                  (t) =>
                    t.startDate <= formatDateForInput(moreTasksDate) &&
                    t.endDate >= formatDateForInput(moreTasksDate),
                )
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map((t) => {
                  const team = TEAMS.find((x) => x.id === t.teamId) || TEAMS[0];
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setMoreTasksDate(null);
                        onEditTask(t.id);
                      }}
                      className={cn(
                        "flex flex-col px-2 py-1.5 rounded-[8px] border cursor-pointer hover:opacity-80 active:scale-95 transition-all",
                        team.border,
                        team.bg,
                      )}
                    >
                      {" "}
                      <div className="flex justify-between items-center mb-0.5">
                        {" "}
                        <span
                          className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 bg-white/60 rounded border whitespace-nowrap",
                            team.text,
                          )}
                        >
                          {team.name}
                        </span>{" "}
                        <span className="text-[10px] text-[#48484A] font-bold">
                          {t.startTime}
                        </span>{" "}
                      </div>{" "}
                      <div
                        className={cn(
                          "text-[12px] font-bold text-[#1D1D1F] truncate",
                          team.text,
                        )}
                      >
                        {t.title}
                      </div>{" "}
                    </div>
                  );
                })}{" "}
            </div>{" "}
          </div>{" "}
        </div>
      )}{" "}
      {showBirthdayModal && currentMonthBirthdays.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          {" "}
          <div className="bg-white rounded-[24px] shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            {" "}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              {" "}
              <h3 className="text-[18px] font-bold text-[#1D1D1F] flex items-center gap-2">
                {" "}
                🎂 {format(currentMonth, "M월")} 생일자 명단{" "}
              </h3>{" "}
              <button
                onClick={() => setShowBirthdayModal(false)}
                className="p-2 -mr-2 bg-gray-200/50 active:scale-95 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
              >
                {" "}
                <X className="w-4 h-4" />{" "}
              </button>{" "}
            </div>{" "}
            <div className="p-5 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {" "}
              {currentMonthBirthdays.map((b, b_idx) => {
                const bd = getBirthdayThisYear(b, year);
                const today = new Date();
                const todayDate = new Date(
                  today.getFullYear(),
                  today.getMonth(),
                  today.getDate(),
                );
                const bdayDate = new Date(year, bd.month - 1, bd.day);
                const diffTime = todayDate.getTime() - bdayDate.getTime();
                const diffDays = Math.floor(
                  Math.abs(diffTime / (1000 * 60 * 60 * 24)),
                );
                const canSend = diffDays <= 3;
                return (
                  <div
                    key={b.id || `b2-${b_idx}`}
                    className="flex flex-col gap-2 p-3 bg-teal-50/50 rounded-[12px] border border-teal-100/50"
                  >
                    {" "}
                    <div className="flex justify-between items-center mb-0.5">
                      {" "}
                      <span className="font-bold text-[#1D1D1F] text-[15px]">
                        {b.name} {b.title}
                      </span>{" "}
                      <span className="text-[13px] font-bold text-teal-700 bg-teal-100 px-2 py-1 rounded-[6px]">
                        {" "}
                        {bd.month}월 {bd.day}일 {b.isLunar ? "(음)" : ""}{" "}
                      </span>{" "}
                    </div>{" "}
                    <div className="flex gap-2 mt-1">
                      {" "}
                      <button
                        disabled={!canSend}
                        onClick={async () => {
                          if (!canSend) return;
                          addToast(
                            `${b.name}님에게 생일 축하 메일을 발송 중입니다...`,
                          );
                          try {
                            const res = await fetch("/api/send-email", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                to: b.email,
                                subject: "🎉 생일을 진심으로 축하합니다!",
                                html: `<p>${b.name} ${b.title}님,</p><p>생일을 진심으로 축하합니다! 🎉<br/>항상 건강하시고 행복한 하루 보내시길 바랍니다.</p>`,
                              }),
                            });
                            if (res.ok) {
                              addToast(
                                `${b.name}님에게 생일 축하 메일을 발송했습니다!`,
                              );
                            } else {
                              addToast(
                                "메일 발송에 실패했습니다. 설정을 확인해주세요.",
                              );
                            }
                          } catch (e) {
                            addToast("메일 발송에 실패했습니다.");
                          }
                        }}
                        className={`flex-1 py-1.5 flex justify-center items-center gap-1.5 bg-white text-teal-700 text-[12px] font-bold rounded-[8px] border border-teal-100 transition-colors ${canSend ? "hover:bg-teal-50 active:scale-95 cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
                      >
                        {" "}
                        <MessageSquare className="w-3.5 h-3.5" /> 메일
                        보내기{" "}
                      </button>{" "}
                      <button
                        disabled={!canSend}
                        onClick={async () => {
                          if (!canSend) return;
                          addToast(
                            `${b.name}님에게 생일 선물(기프티콘) 메일을 발송 중입니다...`,
                          );
                          try {
                            const res = await fetch("/api/send-email", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                to: b.email,
                                subject: "🎁 모바일 교환권이 도착했습니다!",
                                html: `<p>${b.name} ${b.title}님,</p><p>생일을 진심으로 축하합니다! 🎉<br/>작은 정성이지만 아래 기프티콘으로 달콤한 하루 보내시길 바랍니다.</p><hr/><p>🎂 <b>[모바일 교환권] 스타벅스 달콤한 디저트 세트</b><br/>☕ 카페 아메리카노 T 2잔 + 🍰 부드러운 생크림 카스텔라</p><p>교환처: 전국 스타벅스 매장<br/>유효기간: 발행일로부터 93일</p><p style="font-size: 24px; text-align: center;">🎁<br/>( ˘͈ ᵕ ˘͈♡)☕</p><hr/><p>다시 한 번 생일 축하드립니다! 🥳</p>`,
                              }),
                            });
                            if (res.ok) {
                              addToast(
                                `${b.name}님에게 생일 선물을 발송했습니다!`,
                              );
                            } else {
                              addToast(
                                "메일 발송에 실패했습니다. 설정을 확인해주세요.",
                              );
                            }
                          } catch (e) {
                            addToast("메일 발송에 실패했습니다.");
                          }
                        }}
                        className={`flex-1 py-1.5 flex justify-center items-center gap-1.5 bg-teal-600 text-white text-[12px] font-bold rounded-[8px] transition-colors ${canSend ? "hover:bg-teal-700 active:scale-95 cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
                      >
                        {" "}
                        <Gift className="w-3.5 h-3.5" /> 선물 보내기{" "}
                      </button>{" "}
                    </div>{" "}
                  </div>
                );
              })}{" "}
            </div>{" "}
            <div className="p-4 border-t border-gray-100 flex justify-end">
              {" "}
              <button
                onClick={() => setShowBirthdayModal(false)}
                className="px-5 py-2.5 bg-[#1D1D1F] active:scale-95 hover:bg-black text-white text-[14px] font-bold rounded-[12px] transition-colors"
              >
                {" "}
                닫기{" "}
              </button>{" "}
            </div>{" "}
          </div>{" "}
        </div>
      )}{" "}
    </div>
  );
}
