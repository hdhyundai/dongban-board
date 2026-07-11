import React, { useState, useEffect } from "react";
import { X, Send, Mail } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { api } from "../../lib/api";
import { formatDateForInput, generateTimeOptions } from "../../lib/utils";
import { Task } from "../../types";
import { TEAMS } from "../../lib/constants";
interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string | null;
  initialDate: Date;
}
export default function TaskModal({
  isOpen,
  onClose,
  taskId,
  initialDate,
}: TaskModalProps) {
  const { tasks, currentUser, members, addToast } = useAppStore();
  const existingTask = taskId ? tasks.find((t) => t.id === taskId) : null;
  const isCreator = existingTask
    ? existingTask.creatorEmail === currentUser?.email
    : true;
  const currentMember = members.find((m) => m.email === currentUser?.email);
  const senderName = currentMember ? `${currentMember.name} ${currentMember.title}` : currentUser?.displayName || currentUser?.email || "알 수 없는 사용자";
  const [title, setTitle] = useState(existingTask?.title || "");
  const [isFocus, setIsFocus] = useState(existingTask?.isFocus || false);
  const [type, setType] = useState<Task["type"]>(
    existingTask?.type || "individual",
  );
  const [teamId, setTeamId] = useState(existingTask?.teamId || "t1");
  const [assignee, setAssignee] = useState(existingTask?.assignee || "");
  const [location, setLocation] = useState(existingTask?.location || "");
  const [startDate, setStartDate] = useState(
    existingTask?.startDate || formatDateForInput(initialDate),
  );
  const [endDate, setEndDate] = useState(
    existingTask?.endDate || formatDateForInput(initialDate),
  );
  const [startTime, setStartTime] = useState(
    existingTask?.startTime || "08:00",
  );
  const [endTime, setEndTime] = useState(existingTask?.endTime || "17:00");
  const [description, setDescription] = useState(
    existingTask?.description || "",
  );
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailContent, setEmailContent] = useState("");
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  useEffect(() => {
    if (type === "notice") {
      setTeamId("t_notice");
    }
  }, [type]);
  const handleSendEmail = async () => {
    if (!emailContent.trim()) {
      addToast("메일 내용을 입력해주세요.", "error");
      return;
    }
    
    if (!existingTask?.creatorEmail) {
      addToast("작성자 이메일 정보가 없습니다.", "error");
      return;
    }
    
    addToast("메일을 발송 중입니다...");
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: existingTask.creatorEmail,
          subject: `[업무 코멘트] ${existingTask.title}`,
          html: `<p>${senderName}님이 다음 업무에 대한 코멘트를 남겼습니다.</p>
                 <hr/>
                 <p><b>업무명:</b> ${existingTask.title}</p>
                 <p><b>내용:</b></p>
                 <p>${emailContent.replace(/\n/g, "<br/>")}</p>`
        })
      });
      
      if (res.ok) {
        addToast("성공적으로 메일을 발송했습니다.", "success");
        setEmailContent("");
        setShowEmailForm(false);
      } else {
        addToast("메일 발송에 실패했습니다.", "error");
      }
    } catch (e) {
      console.error(e);
      addToast("메일 발송 중 오류가 발생했습니다.", "error");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCreator) return;
    const taskData: Partial<Task> = {
      title,
      type,
      teamId,
      assignee,
      location,
      startDate,
      endDate,
      startTime,
      endTime,
      description,
      isFocus,
      creatorEmail: existingTask?.creatorEmail || currentUser?.email || "",
    };
    const id = taskId || Date.now().toString();
    try {
      await api.saveTask(id, taskData);
      addToast(taskId ? "수정되었습니다." : "등록되었습니다.");
      onClose();
    } catch (err) {
      addToast("오류가 발생했습니다.", "error");
    }
  };
  const handleDelete = async () => {
    if (!taskId || !isCreator) return;
    if (!showConfirmDelete) {
      setShowConfirmDelete(true);
      return;
    }
    await api.deleteTask(taskId);
    addToast("삭제되었습니다.");
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
      {" "}
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[550px] overflow-hidden flex flex-col max-h-[85vh] border border-gray-300">
        {" "}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-white shrink-0">
          {" "}
          <h3 className="text-[18px] font-bold text-[#1D1D1F] tracking-tight">
            {isCreator ? (taskId ? "일정 편집" : "새로운 일정") : "일정 상세"}
          </h3>{" "}
          <button
            onClick={onClose}
            className="p-1.5 text-[#48484A] hover:text-[#1D1D1F] active:scale-95 hover:bg-[#F2F2F7] rounded-full transition-colors"
          >
            {" "}
            <X className="w-4 h-4" />{" "}
          </button>{" "}
        </div>{" "}
        <form
          onSubmit={handleSubmit}
          className="p-5 overflow-y-auto space-y-4 bg-white custom-scrollbar flex-1"
        >
          {" "}
          <div className="flex flex-col gap-2.5">
            {" "}
            <input
              required
              disabled={!isCreator}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3.5 py-2.5 text-[15px] font-bold focus:bg-white focus:border-[#007AFF] outline-none transition-all disabled:opacity-70 disabled:bg-gray-200"
              placeholder="일정 제목"
            />{" "}
            <label className="flex items-center gap-1.5 cursor-pointer w-fit pl-1">
              {" "}
              <input
                disabled={!isCreator}
                type="checkbox"
                checked={isFocus}
                onChange={(e) => setIsFocus(e.target.checked)}
                className="w-3.5 h-3.5 text-[#FF9500] rounded-[4px] border-gray-400 focus:ring-[#FF9500]"
              />{" "}
              <span className="text-[13px] font-bold text-[#1D1D1F] ">
                이달의 포커스 업무로 강조
              </span>{" "}
            </label>{" "}
          </div>{" "}
          <div className="h-px w-full bg-gray-200 my-1"></div>{" "}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {" "}
            <div>
              {" "}
              <label className="block text-[12px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                업무 구분 <span className="text-[#FF3B30]">*</span>
              </label>{" "}
              <select
                disabled={!isCreator}
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3 py-2 text-[14px] font-bold focus:bg-white focus:border-[#007AFF] outline-none disabled:opacity-70 disabled:bg-gray-200"
              >
                {" "}
                <option value="individual">개인별 업무</option>{" "}
                <option value="section">과단위 업무</option>{" "}
                <option value="department">부서단위 업무</option>{" "}
                <option value="notice">부서공지</option>{" "}
              </select>{" "}
            </div>{" "}
            <div>
              {" "}
              <label className="block text-[12px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                소속 파트 <span className="text-[#FF3B30]">*</span>
              </label>{" "}
              <select
                disabled={!isCreator || type === "notice"}
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3 py-2 text-[14px] font-bold focus:bg-white focus:border-[#007AFF] outline-none disabled:opacity-70 disabled:bg-gray-200"
              >
                {" "}
                {TEAMS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {" "}
            <div>
              {" "}
              <label className="block text-[12px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                담당자 명{" "}
                {type !== "notice" && teamId !== "t5" && (
                  <span className="text-[#FF3B30]">*</span>
                )}
              </label>{" "}
              <input
                required={type !== "notice" && teamId !== "t5"}
                disabled={!isCreator}
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3 py-2 text-[14px] font-bold focus:bg-white focus:border-[#007AFF] outline-none placeholder:text-[#86868B] disabled:opacity-70 disabled:bg-gray-200"
                placeholder="예: 김상생 책임"
              />{" "}
            </div>{" "}
            <div>
              {" "}
              <label className="block text-[12px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                장소
              </label>{" "}
              <input
                disabled={!isCreator}
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3 py-2 text-[14px] font-bold focus:bg-white focus:border-[#007AFF] outline-none placeholder:text-[#86868B] disabled:opacity-70 disabled:bg-gray-200"
                placeholder="선택 사항"
              />{" "}
            </div>{" "}
          </div>{" "}
          <div className="h-px w-full bg-gray-200 my-1"></div>{" "}
          <div className="space-y-3">
            {" "}
            <div className="grid grid-cols-2 gap-3">
              {" "}
              <div>
                {" "}
                <label className="block text-[12px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                  시작 날짜 <span className="text-[#FF3B30]">*</span>
                </label>{" "}
                <input
                  required
                  disabled={!isCreator}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3 py-2 text-[14px] font-bold focus:bg-white outline-none disabled:opacity-70 disabled:bg-gray-200"
                />{" "}
              </div>{" "}
              <div>
                {" "}
                <label className="block text-[12px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                  종료 날짜 <span className="text-[#FF3B30]">*</span>
                </label>{" "}
                <input
                  required
                  disabled={!isCreator}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3 py-2 text-[14px] font-bold focus:bg-white outline-none disabled:opacity-70 disabled:bg-gray-200"
                />{" "}
              </div>{" "}
            </div>{" "}
            <div className="grid grid-cols-2 gap-3">
              {" "}
              <div>
                {" "}
                <label className="block text-[12px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                  시작 시간 <span className="text-[#FF3B30]">*</span>
                </label>{" "}
                <select
                  disabled={!isCreator}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3 py-2 text-[14px] font-bold outline-none disabled:opacity-70 disabled:bg-gray-200"
                >
                  {" "}
                  {generateTimeOptions().map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}{" "}
                </select>{" "}
              </div>{" "}
              <div>
                {" "}
                <label className="block text-[12px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                  종료 시간 <span className="text-[#FF3B30]">*</span>
                </label>{" "}
                <select
                  disabled={!isCreator}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3 py-2 text-[14px] font-bold outline-none disabled:opacity-70 disabled:bg-gray-200"
                >
                  {" "}
                  {generateTimeOptions()
                    .filter((t) => startDate !== endDate || t >= startTime)
                    .map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}{" "}
                </select>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
          <div className="h-px w-full bg-gray-200 my-1"></div>{" "}
          <div>
            {" "}
            <textarea
              disabled={!isCreator}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3.5 py-2 text-[14px] font-bold focus:bg-white focus:border-[#007AFF] outline-none resize-none disabled:opacity-70 disabled:bg-gray-200"
              placeholder="주간업무 작성 기준으로 작성해주세요(선택 사항)"
            ></textarea>{" "}
          </div>{" "}
          {!isCreator && existingTask?.creatorEmail && (
            <div className="flex-col gap-2 mt-1 pt-3 border-t border-gray-200 flex">
              {" "}
              <button
                type="button"
                onClick={() => setShowEmailForm(!showEmailForm)}
                className="w-full py-2 bg-[#F2F2F7] active:scale-95 hover:bg-[#E5E5EA] text-[#007AFF] text-[13px] font-bold rounded-[10px] flex items-center justify-center gap-1.5 transition-all"
              >
                {" "}
                <Mail className="w-3.5 h-3.5" /> 작성자에게 메일로 지시/코멘트
                보내기{" "}
              </button>{" "}
              {showEmailForm && (
                <div className="flex flex-col gap-1.5 mt-1">
                  {" "}
                  <textarea
                    rows={2}
                    value={emailContent}
                    onChange={(e) => setEmailContent(e.target.value)}
                    className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3 py-2 text-[13px] font-bold outline-none focus:border-[#007AFF] focus:bg-white transition-all resize-none"
                    placeholder="내용을 작성해주세요..."
                  ></textarea>{" "}
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    className="py-2.5 bg-[#34C759] active:scale-95 hover:bg-[#28A745] text-white text-[13px] font-bold rounded-[10px] flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                  >
                    {" "}
                    <Send className="w-3.5 h-3.5" /> 메일 바로 보내기{" "}
                  </button>{" "}
                </div>
              )}{" "}
            </div>
          )}{" "}
          <div className="pt-1 flex justify-between gap-3 items-center shrink-0">
            {" "}
            {isCreator && taskId && (
              <div className="flex items-center gap-2">
                {" "}
                {showConfirmDelete ? (
                  <>
                    {" "}
                    <span className="text-[13px] font-bold text-red-500">
                      정말 삭제하시겠습니까?
                    </span>{" "}
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-3 py-1.5 rounded-[8px] text-[13px] font-bold text-white bg-red-500 active:scale-95 hover:bg-red-600 transition-colors"
                    >
                      확인
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => setShowConfirmDelete(false)}
                      className="px-3 py-1.5 rounded-[8px] text-[13px] font-bold text-gray-700 bg-gray-200 active:scale-95 hover:bg-gray-300 transition-colors"
                    >
                      취소
                    </button>{" "}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-4 py-2.5 rounded-[10px] text-[14px] font-bold text-[#FF3B30] bg-[#FF3B30]/10 active:scale-95 hover:bg-[#FF3B30]/20 transition-colors"
                  >
                    삭제
                  </button>
                )}{" "}
              </div>
            )}{" "}
            <div className="flex gap-3 ml-auto">
              {" "}
              {isCreator && (
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#007AFF] active:scale-95 hover:bg-[#0062CC] text-white rounded-[10px] text-[14px] font-bold shadow-[0_4px_12px_rgba(0,122,255,0.3)] transition-all"
                >
                  저장
                </button>
              )}{" "}
            </div>{" "}
          </div>{" "}
        </form>{" "}
      </div>{" "}
    </div>
  );
}
