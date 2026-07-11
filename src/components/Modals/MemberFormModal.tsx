import React, { useState } from "react";
import { X, Info } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { api } from "../../lib/api";
export default function MemberFormModal({
  onClose,
  editingEmail,
}: {
  onClose: () => void;
  editingEmail: string | null;
}) {
  const { members, addToast } = useAppStore();
  const existingMember = editingEmail
    ? members.find((m) => m.email === editingEmail)
    : null;
  const [email, setEmail] = useState(existingMember?.email || "");
  const [name, setName] = useState(existingMember?.name || "");
  const [title, setTitle] = useState(existingMember?.title || "");
  const [birthDate, setBirthDate] = useState(existingMember?.birthDate || "");
  const [isLunar, setIsLunar] = useState(existingMember?.isLunar || false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isEdit =
        !!editingEmail; /* In a real app, Firebase Admin SDK is needed to create accounts securely. */
      /* Here we assume the account logic is handled and we just update the Firestore list. */
      let newList = [...members];
      if (isEdit) {
        const idx = newList.findIndex((m) => m.email === editingEmail);
        if (idx > -1) {
          const existingMap = newList[idx].lunarMap;
          newList[idx] = {
            email,
            name,
            title,
            birthDate,
            isLunar,
            lunarMap: existingMap,
          };
        }
      } else {
        newList.push({ email, name, title, birthDate, isLunar });
      }
      await api.saveMembers(newList);
      addToast(isEdit ? "수정되었습니다." : "등록되었습니다.");
      onClose();
    } catch (err) {
      addToast("오류 발생: 시스템 관리자에게 문의하세요.", "error");
    }
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[350] p-4 animate-in fade-in duration-300">
      {" "}
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[400px] overflow-hidden flex flex-col border border-gray-300">
        {" "}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white shrink-0">
          {" "}
          <h3 className="text-[18px] font-bold text-[#1D1D1F] tracking-tight">
            {editingEmail ? "부서원 정보 수정" : "신규 부서원 등록"}
          </h3>{" "}
          <button
            onClick={onClose}
            className="p-1.5 text-[#48484A] hover:text-[#1D1D1F] active:scale-95 hover:bg-[#F2F2F7] border border-transparent rounded-full transition-colors focus:outline-none"
          >
            {" "}
            <X className="w-5 h-5" />{" "}
          </button>{" "}
        </div>{" "}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 bg-white ">
          {" "}
          <div>
            {" "}
            <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
              이메일 (아이디) <span className="text-[#FF3B30]">*</span>
            </label>{" "}
            <input
              disabled={!!editingEmail}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3.5 py-2.5 text-[14px] font-bold focus:bg-white focus:border-[#007AFF] outline-none disabled:opacity-50"
              placeholder="예: user@hd.com"
            />{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-3">
            {" "}
            <div>
              {" "}
              <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                이름 <span className="text-[#FF3B30]">*</span>
              </label>{" "}
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3.5 py-2.5 text-[14px] font-bold focus:bg-white focus:border-[#007AFF] outline-none"
                placeholder="예: 홍길동"
              />{" "}
            </div>{" "}
            <div>
              {" "}
              <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                직급 <span className="text-[#FF3B30]">*</span>
              </label>{" "}
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3.5 py-2.5 text-[14px] font-bold focus:bg-white focus:border-[#007AFF] outline-none"
                placeholder="예: 책임"
              />{" "}
            </div>{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
              생년월일 <span className="text-[#FF3B30]">*</span>
            </label>{" "}
            <div className="flex items-center gap-3">
              {" "}
              <input
                type="date"
                required
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="flex-1 bg-[#F5F5F7] border border-gray-300 rounded-[10px] px-3.5 py-2.5 text-[14px] font-bold focus:bg-white focus:border-[#007AFF] outline-none cursor-pointer"
              />{" "}
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0 mt-1">
                {" "}
                <input
                  type="checkbox"
                  checked={isLunar}
                  onChange={(e) => setIsLunar(e.target.checked)}
                  className="w-4 h-4 text-[#FF3B30] rounded-[4px] border-gray-400 focus:ring-[#FF3B30] cursor-pointer"
                />{" "}
                <span className="text-[13px] font-bold text-[#1D1D1F] ">
                  음력
                </span>{" "}
              </label>{" "}
            </div>{" "}
          </div>{" "}
          {!editingEmail && (
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-[10px] flex gap-2 items-start mt-2">
              {" "}
              <Info className="w-4 h-4 text-[#007AFF] mt-0.5 shrink-0" />{" "}
              <p className="text-[11.5px] font-medium text-blue-800 leading-snug">
                신규 등록 시 시스템 접근 비밀번호는{" "}
                <strong className="text-[#007AFF]">123456789</strong>로 자동
                지정됩니다. (실제 환경에서는 서버 연동 필요)
              </p>{" "}
            </div>
          )}{" "}
          <button
            type="submit"
            className="mt-4 w-full py-3 bg-[#007AFF] active:scale-95 hover:bg-[#0062CC] text-white rounded-[10px] text-[14px] font-bold shadow-sm transition-all active:scale-95"
          >
            저장하기
          </button>{" "}
        </form>{" "}
      </div>{" "}
    </div>
  );
}
