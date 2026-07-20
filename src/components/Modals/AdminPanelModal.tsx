import { useState } from "react";
import { X, UserPlus, Calendar } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { api } from "../../lib/api";
import MemberFormModal from "./MemberFormModal";
export default function AdminPanelModal({ onClose }: { onClose: () => void }) {
  const { members, addToast } = useAppStore();
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [isMemberFormOpen, setIsMemberFormOpen] = useState(false);
  const handleResetPassword = async (email: string) => {
    if (resettingEmail !== email) {
      setResettingEmail(email);
      setTimeout(() => setResettingEmail(null), 3000);
      return;
    }
    
    addToast("비밀번호를 초기화하는 중입니다...");
    try {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (data.success) {
        addToast(email + "의 비밀번호가 '123456789'로 초기화되었습니다.", "success");
      } else {
        addToast("초기화 실패: " + data.error, "error");
      }
      setResettingEmail(null);
    } catch (err: any) {
      console.error(err);
      addToast("비밀번호 초기화 중 오류가 발생했습니다.", "error");
    }
  };

  const handleEdit = (email: string) => {
    setEditingEmail(email);
    setIsMemberFormOpen(true);
  };
  const handleNew = () => {
    setEditingEmail(null);
    setIsMemberFormOpen(true);
  };
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [resettingEmail, setResettingEmail] = useState<string | null>(null);
  const handleDelete = async (email: string) => {
    if (deletingEmail !== email) {
      setDeletingEmail(email);
      setTimeout(() => setDeletingEmail(null), 3000);
      return;
    }
    try {
      const newList = members.filter((m) => m.email !== email);
      await api.saveMembers(newList);
      addToast("삭제되었습니다.");
      setDeletingEmail(null);
    } catch (err) {
      addToast("오류가 발생했습니다.", "error");
    }
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] p-4 animate-in fade-in duration-300">
      {" "}
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[650px] overflow-hidden flex flex-col max-h-[85vh] border border-gray-300">
        {" "}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white shrink-0">
          {" "}
          <h3 className="text-[18px] font-bold text-[#1D1D1F] tracking-tight">
            부서원 관리 (관리자 모드)
          </h3>{" "}
          <button
            onClick={onClose}
            className="p-1.5 text-[#48484A] hover:text-[#1D1D1F] active:scale-95 hover:bg-[#F2F2F7] border border-transparent rounded-full transition-colors focus:outline-none"
          >
            {" "}
            <X className="w-5 h-5" />{" "}
          </button>{" "}
        </div>{" "}
        <div className="p-4 bg-[#F9F9FB] flex justify-between border-b border-gray-200 shrink-0">
          {" "}
          <div className="flex gap-2">
            {" "}
            <button
              onClick={async () => {
                addToast("주간 보고서를 생성 및 전송 중입니다...", "info");
                try {
                  const res = await fetch("/api/reports/weekly", { method: "POST" });
                  const data = await res.json();
                  if (res.ok) {
                    addToast("주간 보고서가 성공적으로 발송되었습니다!", "success");
                  } else {
                    addToast("발송 실패: " + (data.error || "오류가 발생했습니다."), "error");
                  }
                } catch (err) {
                  addToast("주간 보고서 발송 중 오류가 발생했습니다.", "error");
                }
              }}
              className="bg-purple-600 active:scale-95 hover:bg-purple-700 text-white px-3 py-2 rounded-[10px] text-[12px] font-bold shadow-sm transition-all active:scale-95 w-[90px] sm:w-auto"
            >
              주간 보고서
              <br className="sm:hidden" />{" "}
              <span className="hidden sm:inline"> </span>수동 발송{" "}
            </button>{" "}
            <button
              onClick={async () => {
                addToast("일일 보고서를 생성 및 전송 중입니다...", "info");
                try {
                  const res = await fetch("/api/reports/daily", { method: "POST" });
                  const data = await res.json();
                  if (res.ok) {
                    addToast("일일 보고서가 성공적으로 발송되었습니다!", "success");
                  } else {
                    addToast("발송 실패: " + (data.error || "오류가 발생했습니다."), "error");
                  }
                } catch (err) {
                  addToast("일일 보고서 발송 중 오류가 발생했습니다.", "error");
                }
              }}
              className="bg-teal-600 active:scale-95 hover:bg-teal-700 text-white px-3 py-2 rounded-[10px] text-[12px] font-bold shadow-sm transition-all active:scale-95 w-[90px] sm:w-auto pl-[13px] ml-[-1px] sm:pl-3 sm:ml-0"
            >
              일일 보고서
              <br className="sm:hidden" />{" "}
              <span className="hidden sm:inline"> </span>수동 발송{" "}
            </button>{" "}
          </div>{" "}
          <button
            onClick={handleNew}
            className="bg-[#007AFF] active:scale-95 hover:bg-[#0062CC] text-white px-4 py-2.5 rounded-[10px] text-[13px] font-bold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 w-[110px] sm:w-auto"
          >
            {" "}
            <UserPlus className="hidden sm:block w-4 h-4" />{" "}
            <span className="text-center sm:text-left">
              신규 부서원
              <br className="sm:hidden" />{" "}
              <span className="hidden sm:inline"> </span>추가
            </span>{" "}
          </button>{" "}
        </div>{" "}
        <div className="flex-1 overflow-y-auto p-4 bg-white custom-scrollbar flex flex-col gap-2.5">
          {" "}
          {members.map((m) => (
            <div
              key={m.email}
              className="flex items-center justify-between p-3.5 border border-gray-200 rounded-[14px] bg-gray-50 active:scale-95 hover:bg-[#007AFF]/5 transition-colors"
            >
              {" "}
              <div className="flex flex-col">
                {" "}
                <span className="font-bold text-[14px] text-[#1D1D1F] ">
                  {" "}
                  {m.name} {m.title}{" "}
                  <span className="text-[12px] font-medium text-[#86868B] ml-1.5">
                    {m.email}
                  </span>{" "}
                </span>{" "}
                <span className="text-[12px] text-[#48484A] mt-1 font-semibold flex items-center gap-1">
                  {" "}
                  <Calendar className="w-3.5 h-3.5 text-[#86868B]" />{" "}
                  {m.birthDate}{" "}
                  {m.isLunar ? (
                    <span className="text-[#FF3B30] font-bold px-1 bg-[#FF3B30]/10 rounded border border-[#FF3B30]/20">
                      음력
                    </span>
                  ) : (
                    <span className="text-[#34C759] font-bold px-1 bg-[#34C759]/10 rounded border border-[#34C759]/20">
                      양력
                    </span>
                  )}{" "}
                </span>{" "}
              </div>{" "}
              <div className="flex gap-2 shrink-0">
                {" "}
                                <button
                  onClick={() => handleResetPassword(m.email)}
                  className={`px-3.5 py-1.5 bg-white border border-gray-300 rounded-[8px] text-[12px] font-bold active:scale-95 hover:bg-gray-100 transition-colors shadow-sm ${resettingEmail === m.email ? 'text-orange-500 border-orange-500 bg-orange-50' : 'text-[#8E8E93]'}`}
                >
                  {resettingEmail === m.email ? '확인' : '비번 리셋'}
                </button>{" "}
                <button
                  onClick={() => handleEdit(m.email)}
                  className="px-3.5 py-1.5 bg-white border border-gray-300 rounded-[8px] text-[12px] font-bold text-[#007AFF] active:scale-95 hover:bg-gray-100 transition-colors shadow-sm"
                >
                  수정
                </button>{" "}
                <button
                  onClick={() => handleDelete(m.email)}
                  className={`px-3.5 py-1.5 bg-white border rounded-[8px] text-[12px] font-bold active:scale-95 hover:bg-gray-100 transition-colors shadow-sm ${deletingEmail === m.email ? 'text-white bg-red-500 hover:bg-red-600 border-red-500' : 'text-[#FF3B30] border-gray-300'}`}
                >
                  {deletingEmail === m.email ? '확인' : '삭제'}
                </button>{" "}
              </div>{" "}
            </div>
          ))}{" "}
        </div>{" "}
      </div>{" "}
      {isMemberFormOpen && (
        <MemberFormModal
          onClose={() => setIsMemberFormOpen(false)}
          editingEmail={editingEmail}
        />
      )}{" "}
    </div>
  );
}
