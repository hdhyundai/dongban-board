import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  updatePassword,
  signOut,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAppStore } from "../store/useAppStore";
import { Calendar, Loader } from "lucide-react";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdEmail, setPwdEmail] = useState("");
  const [pwdOld, setPwdOld] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const { addToast } = useAppStore();
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      addToast("반갑습니다!");
    } catch (err) {
      addToast("정보가 올바르지 않습니다.", "error");
    }
  };
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdNew !== pwdConfirm) {
      addToast("새 비밀번호가 일치하지 않습니다.", "error");
      return;
    }
    if (pwdNew.length < 6) {
      addToast("비밀번호는 6자리 이상이어야 합니다.", "error");
      return;
    }
    setIsChangingPassword(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        pwdEmail,
        pwdOld,
      );
      await updatePassword(userCredential.user, pwdNew);
      await signOut(auth);
      addToast(
        "비밀번호가 성공적으로 변경되었습니다. 새 비밀번호로 로그인해주세요.",
        "success",
      );
      setShowPasswordModal(false);
      setPwdEmail("");
      setPwdOld("");
      setPwdNew("");
      setPwdConfirm("");
    } catch (error: any) {
      if (
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found" ||
        error.code === "auth/invalid-credential"
      ) {
        addToast(
          "등록되지 않은 이메일이거나 현재 비밀번호가 틀렸습니다.",
          "error",
        );
      } else {
        addToast(
          "비밀번호 변경 중 오류가 발생했습니다. (" + error.code + ")",
          "error",
        );
      }
    } finally {
      setIsChangingPassword(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-[#F2F2F7] z-[200] flex items-center justify-center">
      {" "}
      <div className="bg-white p-8 md:p-10 rounded-[32px] shadow-[0_20px_40px_rgba(0,0,0,0.08)] border border-gray-200 w-full max-w-[400px] mx-4 animate-in fade-in zoom-in-95 duration-300">
        {" "}
        <div className="flex flex-col items-center mb-8">
          {" "}
          <div className="w-14 h-14 rounded-[16px] bg-gradient-to-br from-[#007AFF] to-[#0056b3] flex items-center justify-center shadow-lg mb-4">
            {" "}
            <Calendar className="text-white w-7 h-7" />{" "}
          </div>{" "}
          <h2 className="text-[22px] font-bold text-[#1D1D1F] tracking-tight text-center">
            동반성장부 워크스페이스
          </h2>{" "}
          <p className="text-[14px] text-[#48484A] font-medium mt-1">
            사내 관리자에게 부여받은 계정으로 로그인해주세요.
          </p>{" "}
        </div>{" "}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          {" "}
          <div>
            {" "}
            <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
              이메일
            </label>{" "}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[12px] p-3.5 text-[15px] font-bold focus:bg-white focus:border-[#007AFF] outline-none transition-all focus:ring-4 focus:ring-[#007AFF]/10"
              placeholder="이메일 주소"
            />{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
              비밀번호
            </label>{" "}
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[12px] p-3.5 text-[15px] font-bold focus:bg-white focus:border-[#007AFF] outline-none transition-all focus:ring-4 focus:ring-[#007AFF]/10"
              placeholder="비밀번호"
            />{" "}
          </div>{" "}
          <button
            type="submit"
            className="mt-2 w-full py-3.5 bg-[#007AFF] active:scale-95 hover:bg-[#0062CC] text-white rounded-[12px] text-[15px] font-bold shadow-md transition-all active:scale-95 flex justify-center items-center gap-2"
          >
            {" "}
            <span>로그인</span>{" "}
          </button>{" "}
          <div className="mt-2 text-center">
            {" "}
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="text-[13px] text-[#48484A] font-bold hover:text-[#007AFF] transition-colors underline underline-offset-2"
            >
              {" "}
              비밀번호를 변경하시려면 여기를 클릭하세요{" "}
            </button>{" "}
          </div>{" "}
        </form>{" "}
      </div>{" "}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] p-4 sm:p-6 animate-in fade-in duration-300">
          {" "}
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-[400px] overflow-hidden flex flex-col border border-gray-300">
            {" "}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-white ">
              {" "}
              <h3 className="text-[20px] font-bold text-[#1D1D1F] tracking-tight">
                비밀번호 변경
              </h3>{" "}
              <button
                onClick={() => setShowPasswordModal(false)}
                className="p-2 text-[#48484A] hover:text-[#1D1D1F] active:scale-95 hover:bg-[#F2F2F7] border border-gray-200 rounded-full transition-colors focus:outline-none"
              >
                {" "}
                ✕{" "}
              </button>{" "}
            </div>{" "}
            <form
              onSubmit={handlePasswordChange}
              className="p-6 space-y-4 bg-white "
            >
              {" "}
              <div>
                {" "}
                <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                  이메일
                </label>{" "}
                <input
                  type="email"
                  required
                  value={pwdEmail}
                  onChange={(e) => setPwdEmail(e.target.value)}
                  className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[12px] p-3.5 text-[15px] font-bold focus:bg-white focus:border-[#007AFF] outline-none"
                />{" "}
              </div>{" "}
              <div>
                {" "}
                <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                  현재 비밀번호
                </label>{" "}
                <input
                  type="password"
                  required
                  value={pwdOld}
                  onChange={(e) => setPwdOld(e.target.value)}
                  className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[12px] p-3.5 text-[15px] font-bold focus:bg-white focus:border-[#007AFF] outline-none"
                />{" "}
              </div>{" "}
              <div className="h-px w-full bg-gray-200 my-2"></div>{" "}
              <div>
                {" "}
                <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                  새 비밀번호
                </label>{" "}
                <input
                  type="password"
                  required
                  minLength={6}
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[12px] p-3.5 text-[15px] font-bold focus:bg-white focus:border-[#007AFF] outline-none"
                />{" "}
              </div>{" "}
              <div>
                {" "}
                <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
                  새 비밀번호 확인
                </label>{" "}
                <input
                  type="password"
                  required
                  minLength={6}
                  value={pwdConfirm}
                  onChange={(e) => setPwdConfirm(e.target.value)}
                  className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[12px] p-3.5 text-[15px] font-bold focus:bg-white focus:border-[#007AFF] outline-none"
                />{" "}
              </div>{" "}
              <button
                disabled={isChangingPassword}
                type="submit"
                className="mt-4 w-full py-3.5 bg-[#007AFF] active:scale-95 hover:bg-[#0062CC] text-white rounded-[12px] text-[15px] font-bold active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {" "}
                {isChangingPassword ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" /> 변경 중...
                  </>
                ) : (
                  "변경하기"
                )}{" "}
              </button>{" "}
            </form>{" "}
          </div>{" "}
        </div>
      )}{" "}
    </div>
  );
}
