import "dotenv/config";
import express from "express";
import { google } from "googleapis";
import { marked } from "marked";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import { GoogleGenAI } from "@google/genai";
import { initializeApp as initAdminApp, cert } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import cron from "node-cron";
import nodemailer from "nodemailer";

const firebaseConfig = { 
  apiKey: "AIzaSyDw_WQxhF_07Hjhmgb_rfGuOqAE7lDvw00", 
  authDomain: "hd-workspace.firebaseapp.com", 
  projectId: "hd-workspace", 
  storageBucket: "hd-workspace.firebasestorage.app", 
  messagingSenderId: "105147883492", 
  appId: "1:105147883492:web:278e38487300447e4a31f1" 
};


try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initAdminApp({
      credential: cert(serviceAccount)
    });
    console.log("Firebase Admin initialized");
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT is not set. Admin SDK not initialized.");
  }
} catch (e) {
  console.error("Failed to initialize firebase-admin:", e);
}

const appFb = initializeApp(firebaseConfig);
const auth = getAuth(appFb);
const db = getFirestore(appFb);

const APP_ID = 'default-app-id';
const EMAIL_API_URL = process.env.EMAIL_API_URL || "https://script.google.com/macros/s/AKfycbxcZJZaLES5dcoMcWv3UcQdwlKFZZ6a4Yb9hbSwmr314-IEPEb1GTcadCKbCfSWSSzl/exec";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "missing_key",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function generateContentWithRetry(params: { model: string; contents: string; config?: any }, maxRetries = 3) {
  let lastError: any = null;
  const modelsToTry = [params.model, "gemini-3.1-flash-lite"]; // Try primary then fallback model
  
  for (const model of modelsToTry) {
    let delay = 1000; // start with 1s delay
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Calling Gemini API (${model}), attempt ${attempt}/${maxRetries}...`);
        const response = await ai.models.generateContent({
          model: model,
          contents: params.contents,
          config: params.config
        });
        if (response && response.text) {
          return response;
        }
        throw new Error("Empty response received from Gemini API");
      } catch (err: any) {
        lastError = err;
        console.error(`Gemini API call failed on ${model} (attempt ${attempt}/${maxRetries}):`, err?.message || err);
        
        // If it's a 4xx error (e.g. 400, 403), don't retry as it's not a transient server/rate issue
        if (err?.status && err.status >= 400 && err.status < 500) {
          console.warn("Non-transient 4xx error. Skipping retries for this model.");
          break;
        }
        
        if (attempt < maxRetries) {
          console.log(`Waiting ${delay}ms before retrying...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff
        }
      }
    }
  }
  
  throw lastError || new Error("Failed to generate content after retries and fallbacks.");
}

async function getFbAuth() {
  await signInWithEmailAndPassword(auth, "system_cron@hd.com", "cronPassword123!");
}

function decryptField(text: string): string {
  if (!text || !text.startsWith('ENC:')) return text;
  try {
    return decodeURIComponent(Buffer.from(text.slice(4), 'base64').toString('utf8'));
  } catch (e) {
    return text;
  }
}

async function getMembers() {
  const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'workspace_settings', 'members');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return snap.data().list || [];
  }
  return [];
}

async function getTasks() {
  const snapshot = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'workspace_tasks'));
  const tasks: any[] = [];
  snapshot.forEach(d => {
    const data = d.data();
    if (data.title) data.title = decryptField(data.title);
    if (data.description) data.description = decryptField(data.description);
    tasks.push({ id: d.id, ...data });
  });
  return tasks;
}

function getKSTDate() {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 9));
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


let gmailApiBroken = false;

async function sendEmail(emailAddress: string, subject: string, htmlContent: string) {
  console.log("=== SEND EMAIL ===");
  console.log("To:", emailAddress);
  console.log("Subject:", subject);

  // 1. Try Nodemailer if SMTP_USER and SMTP_PASS/PASSWORD are available
  const smtpUser = process.env.SMTP_USER || "hshi.dongban1@gmail.com";
  const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  
  if (smtpPass) {
    console.log(`Attempting to send via Nodemailer as ${smtpUser}...`);
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
      await transporter.sendMail({
        from: `"HD현대삼호 동반성장부" <${smtpUser}>`,
        to: emailAddress,
        subject: subject,
        html: htmlContent
      });
      console.log("Successfully sent via Nodemailer.");
      return { success: true, method: 'nodemailer' };
    } catch (err: any) {
      console.error("Nodemailer failed:", err?.message || err);
    }
  }
  
  let gmailApiAttempted = false;
  let gmailApiSuccess = false;
  let gmailError = null;

  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN && !gmailApiBroken) {
    gmailApiAttempted = true;
    try {
      console.log("Attempting to send via Gmail API...");
      const oAuth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET
      );
      oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

      const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

      let senderEmail = process.env.SMTP_USER || "hshi.dongban1@gmail.com";
      try {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        if (profile.data.emailAddress) {
          senderEmail = profile.data.emailAddress;
          console.log("Resolved authenticated sender email:", senderEmail);
        }
      } catch (profileErr: any) {
        console.warn("Failed to fetch Gmail profile. Using fallback SMTP_USER:", profileErr?.message || profileErr);
      }

      const utf8FromName = `=?utf-8?B?${Buffer.from("HD현대삼호 동반성장부").toString('base64')}?=`;
      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

      const messageParts = [
        `From: ${utf8FromName} <${senderEmail}>`,
        `To: ${emailAddress}`,
        `Subject: ${utf8Subject}`,
        'Content-Type: text/html; charset="utf-8"',
        'MIME-Version: 1.0',
        '',
        htmlContent
      ];

      const encodedMessage = Buffer.from(messageParts.join('\r\n'))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage },
      });
      console.log("Successfully sent via Gmail API.");
      gmailApiSuccess = true;
      return { success: true, method: 'gmail_api' };
    } catch (error: any) {
      gmailError = error?.message || error;
      console.error('Gmail API attempt failed, will fall back to Webhook:', error);
      const errMsg = String(error);
      if (errMsg.includes('invalid_grant') || errMsg.includes('invalid_client') || errMsg.includes('expired') || errMsg.includes('revoked')) {
        console.warn("Gmail OAuth token is expired or revoked. Disabling primary Gmail API to prevent future timeouts.");
        gmailApiBroken = true;
      }
    }
  }

  // Fallback to Webhook if Gmail API was not configured OR failed
  try {
    console.log("Sending email via Webhook fallback...");
    const data = {
      to: emailAddress,
      subject: subject,
      html: htmlContent,
      htmlBody: htmlContent,
      message: htmlContent,
      messageHtml: htmlContent
    };
    const response = await fetch(EMAIL_API_URL, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      console.log("Successfully sent via Webhook fallback.");
      return { success: true, method: 'webhook_fallback' };
    } else {
      const responseText = await response.text().catch(() => "");
      console.error("Webhook fallback failed with status:", response.status, responseText);
      return { success: false, error: `Webhook failed with status ${response.status}: ${responseText}` };
    }
  } catch (webhookError: any) {
    console.error("Webhook fallback also failed:", webhookError);
    return { success: false, error: `Gmail error: ${gmailError}, Webhook error: ${webhookError?.message || webhookError}` };
  }
}


async function sendEmailToAll(subject, textBody, htmlBody) {
  try {
    const members = await getMembers();
    let emails = members.map((m: any) => m.email).filter(Boolean);
    
    // 등록된 부서원 메일이 없을 경우
    if (emails.length === 0) {
      console.warn("No member emails found to send report.");
      return { success: false, error: "No member emails registered." };
    }
    
    console.log("Sending email to:", emails);
    
    // Send email individually to avoid issues with comma-separated lists and to protect privacy
    let successCount = 0;
    let failCount = 0;
    
    for (const email of emails) {
      const result = await sendEmail(email, subject, htmlBody);
      if (result.success) {
        console.log("Successfully sent email to: " + email);
        successCount++;
      } else {
        console.error("Failed to send email to: " + email);
        failCount++;
      }
    }
    
    console.log(`Finished sending emails. Success: ${successCount}, Failed: ${failCount}`);
  } catch (error) {
    console.error("Error in sendEmailToAll:", error);
  }
}

async function generateWeeklyReport() {
  console.log("Generating Weekly Report...");
  try {
    await getFbAuth();
    const tasks = await getTasks();
    const today = getKSTDate();
    const nextWeek = getKSTDate();
    nextWeek.setDate(today.getDate() + 7);
    
    const todayStr = formatDate(today);
    const nextWeekStr = formatDate(nextWeek);
    
    const weekTasks = tasks.filter(t => 
      (t.startDate >= todayStr && t.startDate <= nextWeekStr) || 
      (t.endDate >= todayStr && t.endDate <= nextWeekStr) ||
      (t.startDate <= todayStr && t.endDate >= nextWeekStr)
    );
    
    const stats = {
      totalTasks: weekTasks.length,
      focusTasks: weekTasks.filter(t => t.isFocus).length,
      tasksData: weekTasks.map(t => {
        let teamName = "알수없음";
        if (t.teamId === 't_notice') teamName = "부서공지";
        else if (t.teamId === 't5') teamName = "담당임원";
        else if (t.teamId === 't1') teamName = "기획과";
        else if (t.teamId === 't2') teamName = "지원과";
        else if (t.teamId === 't3') teamName = "인력지원과";
        else if (t.teamId === 't4') teamName = "협력과";
        return {
          team: teamName,
          title: t.title,
          assignee: t.assignee ? t.assignee.trim() : "-",
          date: `${t.startDate}~${t.endDate}`,
          time: `${t.startTime}~${t.endTime}`,
          status: t.startDate <= todayStr ? "진행중" : "진행예정",
          isFocus: t.isFocus,
          description: t.description ? t.description.trim() : "-"
        };
      })
    };

    const prompt = `[System Persona]
당신은 HD현대삼호 동반성장부의 업무 공유 및 보고서 작성 AI입니다. 팀원들이 캘린더에 등록한 주간 업무 데이터(일정 제목 및 세부 내용)를 바탕으로, 팀장 및 부서원들이 주간 주요 현황과 세부 계획을 한눈에 직관적으로 파악할 수 있는 최고 수준의 HTML 주간 보고서를 작성하십시오.

[Mail & Title Rule (필수 적용)]
- 메일 제목: [동반성장부] 주간 업무 현황 및 계획 보고 (${todayStr} ~ ${nextWeekStr})
- HTML 문서 최상단(<h1>) 제목: HD현대삼호 동반성장부 주간 업무 현황 및 계획

[Data Processing Rule]
1. 기준 일시: ${todayStr} ~ ${nextWeekStr} (이번 주 월~금)
2. [중요] 제공된 입력 데이터(tasksData)는 이미 이번 주에 해당하는 데이터로 필터링되어 전달됩니다. 임의로 데이터를 다시 필터링하거나 삭제하지 마십시오.
3. [중요] 제공된 입력 데이터(tasksData)에 있는 모든 업무(Task)를 누락 없이 상세 표에 포함하십시오.
4. [필수] 캘린더의 **'일정/업무 제목'**과 **'세부 내용(메모/설명)'**을 분리하여 상세 표의 각 칼럼에 명확히 기재하십시오. (세부 내용이 없는 경우 '-' 처리)

[입력 데이터]
${JSON.stringify(stats, null, 2)}

[Report Content Rule]
1. [📌 이번 주 주요 업무 요약]
   - 과도한 전략 분석(시너지, 크리티컬 패스 등)은 배제하고, **'이번 주 주요 마감 건(D-Day)', '주요 회의/보고/행사/현장 점검'** 등 부서 전체가 알아야 할 핵심 내용만 2~3줄로 간결하게 요약하십시오.
2. [📋 파트별 주간 상세 업무 현황 표]
   - 캘린더 등록 업무를 파트별/일자별로 정리하여 상세 표를 구성하십시오.

[Design & HTML Exact Rule (제시된 템플릿 스타일 100% 준수)]
1. Font Stack & Base Style:
   - HD현대 폰트 굵기(Weight)별 적용 규칙 (HTML 요소 인라인 스타일 작성 시 아래 폰트명 규칙을 반드시 따르십시오):
     * 본문/얇은 텍스트 (font-weight: 400): font-family: 'HD Light', 'HDLight', 'HD현대', 'Pretendard', sans-serif;
     * 중간 텍스트 (font-weight: 500): font-family: 'HD Medium', 'HDMedium', 'HD현대', 'Pretendard', sans-serif;
     * 제목/강조 텍스트 (font-weight: 700~800): font-family: 'HD Bold', 'HDBold', 'HD현대', 'Pretendard', sans-serif;
   - -webkit-font-smoothing: antialiased; line-height: 1.6; color: #1e293b;
2. Card Container:
   - max-width: 860px; margin: 0 auto; padding: 36px 32px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04);
3. Header Section:
   - 상단 브랜드 라인: <span style="font-family: 'HD Bold', 'HDBold', sans-serif; font-size: 11px; font-weight: 700; color: #0284c7; letter-spacing: 1px; text-transform: uppercase; display: block; margin-bottom: 4px;">HD HYUNDAI SAMHO</span>
   - 메인 타이틀(<h1>): font-family: 'HD Bold', 'HDBold', sans-serif; font-size: 22px; color: #0a2540; font-weight: 800; letter-spacing: -0.6px; line-height: 1.3; margin: 0;
   - 우측 날짜 뱃지: <span style="font-family: 'HD Medium', 'HDMedium', sans-serif; background-color: #f1f5f9; padding: 6px 12px; border-radius: 20px; border: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 500;">📅 ${todayStr} ~ ${nextWeekStr}</span>
4. Summary Box (📌 이번 주 주요 업무 요약):
   - Box: background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0a2540; padding: 18px 20px; margin-bottom: 28px; border-radius: 6px;
   - Header: font-size: 14px; font-weight: 700; color: #0a2540; margin-bottom: 10px; letter-spacing: -0.3px;
   - Bullet List: margin: 0; padding-left: 18px; font-size: 13.5px; color: #334155; line-height: 1.7; letter-spacing: -0.2px;
5. Table Exact Alignment & Style (📋 파트별 주간 상세 업무 현황):
   - Section Title: font-size: 14px; font-weight: 700; color: #0a2540; margin-bottom: 12px; letter-spacing: -0.3px;
   - Table Style: width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden;
   - Column Widths: 구분(13%), 담당자(11%), 상태(11%), 업무명(27%), 상세내용(38%)
   - Table Header (th): background-color: #0a2540; color: #ffffff; border: 1px solid #0a2540; vertical-align: middle; font-weight: 700; letter-spacing: -0.3px; (구분/담당자/상태: padding 12px 8px, text-align center | 업무명/상세내용: padding 12px 14px, text-align left)
   - Table Row (tr & td):
     * 모든 td 필수 공통: border: 1px solid #e2e8f0; vertical-align: middle;
     * 짝수 행 Zebra 패턴: background-color: #f8fafc; (홀수 행: #ffffff)
     * [구분]: text-align: center; color: #334155; font-weight: 500; padding: 12px 8px;
     * [담당자]: text-align: center; color: #0f172a; font-weight: 700; padding: 12px 8px;
     * [상태]: text-align: center; padding: 12px 8px;
       - 완료 뱃지: <span style="display: inline-block; padding: 3px 10px; font-size: 11px; font-weight: 700; color: #065f46; background-color: #d1fae5; border-radius: 12px; letter-spacing: -0.2px;">완료</span>
       - 진행중 뱃지: <span style="display: inline-block; padding: 3px 10px; font-size: 11px; font-weight: 700; color: #1e40af; background-color: #dbeafe; border-radius: 12px; letter-spacing: -0.2px;">진행중</span>
       - 예정 뱃지: <span style="display: inline-block; padding: 3px 10px; font-size: 11px; font-weight: 700; color: #475569; background-color: #e2e8f0; border-radius: 12px; letter-spacing: -0.2px;">예정</span>
     * [업무명]: text-align: left; font-weight: 700; color: #0f172a; letter-spacing: -0.3px; line-height: 1.4; padding: 12px 14px;
     * [상세내용]: text-align: left; color: #475569; letter-spacing: -0.2px; line-height: 1.5; padding: 12px 14px;
6. Footer Section:
   - margin-top: 24px; padding-top: 12px; border-top: 1px solid #f1f5f9; font-size: 11.5px; color: #94a3b8; text-align: right; letter-spacing: -0.2px;
   - 문구: "본 보고서는 HD현대삼호 동반성장부 업무 관리 시스템에서 자동 생성되었습니다."
7. 이메일 호환성:
   - <style> 태그 없이 모든 HTML 요소에 style="..." 인라인 스타일(inline style)을 100% 명시하십시오.
8. 마크다운(\`\`\`html 등) 없이 순수 HTML 코드만 반환하십시오. 최상위 <div>로 시작해도 됩니다.`;

    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
    
    const response = await generateContentWithRetry({
      model: "gemini-2.5-flash",
      contents: prompt
    });

    let htmlContent = response.text.replace(/^\s*\`\`\`(?:html)?/mi, '').replace(/\`\`\`\s*$/m, '').trim();

    htmlContent += `
      <div style="margin-top: 40px; margin-bottom: 20px; text-align: center;">
        <a href="https://dongban-board.onrender.com" style="display: inline-block; padding: 14px 28px; background-color: #008C45; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          동반성장부 통합 업무 워크스페이스 바로 가기
        </a>
      </div>
    `;

    await sendEmailToAll(`[동반성장부] 주간 업무 현황 및 계획 보고 (${todayStr} ~ ${nextWeekStr})`, "", htmlContent);
  } catch (error) {
    console.error("Error in generateWeeklyReport:", error);
    throw error;
  }
}

async function generateDailyReport() {
  console.log("Generating Daily Report...");
  try {
    await getFbAuth();
    const tasks = await getTasks();
    const today = getKSTDate();
    
    const todayStr = formatDate(today);
    
    const todayTasks = tasks.filter(t => t.startDate <= todayStr && t.endDate >= todayStr);
    
    const stats = {
      totalTasks: todayTasks.length,
      focusTasks: todayTasks.filter(t => t.isFocus).length,
      tasksData: todayTasks.map(t => {
        let teamName = "알수없음";
        if (t.teamId === 't_notice') teamName = "부서공지";
        else if (t.teamId === 't5') teamName = "담당임원";
        else if (t.teamId === 't1') teamName = "기획과";
        else if (t.teamId === 't2') teamName = "지원과";
        else if (t.teamId === 't3') teamName = "인력지원과";
        else if (t.teamId === 't4') teamName = "협력과";
        return {
          team: teamName,
          title: t.title,
          assignee: t.assignee ? t.assignee.trim() : "-",
          status: "진행완료",
          isFocus: t.isFocus,
          description: t.description ? t.description.trim() : "-"
        };
      })
    };

    const prompt = `[System Persona]
당신은 HD현대삼호 동반성장부의 일일 업무 공유 및 보고서 작성 AI입니다. 팀원들이 캘린더에 등록한 당일 업무 데이터(일정 제목 및 세부 내용)를 바탕으로, 팀장 및 팀원들이 오늘의 업무 실적과 진행 현황을 직관적으로 파악할 수 있는 최고 수준의 HTML 일일 보고서를 작성하십시오.

[Mail & Title Rule (필수 적용)]
- 메일 제목: [동반성장부] 일일 업무 실적 보고 (${todayStr})
- HTML 문서 최상단(<h1>) 제목: HD현대삼호 동반성장부 일일 업무 실적 보고

[Data Processing Rule]
1. 기준 일시: ${todayStr} (당일)
2. [중요] 제공된 입력 데이터(tasksData)는 이미 오늘 날짜에 해당하는 당일 업무로 필터링되어 전달됩니다. 임의로 데이터를 다시 필터링하거나 삭제하지 마십시오.
3. [중요] 제공된 입력 데이터(tasksData)에 있는 모든 당일 업무(Task)를 누락 없이 상세 실적 표에 모두 포함하여 작성하십시오.
4. [필수] 캘린더의 **'일정/업무 제목'**과 **'세부 내용(메모/설명)'**을 분리하여 상세 표의 각 칼럼에 명확히 기재하십시오. (세부 내용이 없는 경우 '-' 처리)

[입력 데이터]
${JSON.stringify(stats, null, 2)}

[Report Content Rule]
1. [📌 당일 주요 업무 요약]
   - 과도한 기여도/리스크 분석은 배제하고, **오늘 완료된 핵심 실적 및 진행 중인 중요 업무**를 2~3줄 내외로 간결하게 요약하십시오.
2. [📋 당일 상세 실적 현황 표]
   - 팀원별 당일 수행 업무와 세부 내용을 상세 표에 정돈하여 작성하십시오.

[Design & HTML Exact Rule (제시된 템플릿 스타일 100% 준수)]
1. Font Stack & Base Style:
   - HD현대 폰트 굵기(Weight)별 적용 규칙 (HTML 요소 인라인 스타일 작성 시 아래 폰트명 규칙을 반드시 따르십시오):
     * 본문/얇은 텍스트 (font-weight: 400): font-family: 'HD Light', 'HDLight', 'HD현대', 'Pretendard', sans-serif;
     * 중간 텍스트 (font-weight: 500): font-family: 'HD Medium', 'HDMedium', 'HD현대', 'Pretendard', sans-serif;
     * 제목/강조 텍스트 (font-weight: 700~800): font-family: 'HD Bold', 'HDBold', 'HD현대', 'Pretendard', sans-serif;
   - -webkit-font-smoothing: antialiased; line-height: 1.6; color: #1e293b;
2. Card Container:
   - max-width: 860px; margin: 0 auto; padding: 36px 32px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04);
3. Header Section:
   - 상단 브랜드 라인: <span style="font-family: 'HD Bold', 'HDBold', sans-serif; font-size: 11px; font-weight: 700; color: #0284c7; letter-spacing: 1px; text-transform: uppercase; display: block; margin-bottom: 4px;">HD HYUNDAI SAMHO</span>
   - 메인 타이틀(<h1>): font-family: 'HD Bold', 'HDBold', sans-serif; font-size: 22px; color: #0a2540; font-weight: 800; letter-spacing: -0.6px; line-height: 1.3; margin: 0;
   - 우측 날짜 뱃지: <span style="font-family: 'HD Medium', 'HDMedium', sans-serif; background-color: #f1f5f9; padding: 6px 12px; border-radius: 20px; border: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 500;">📅 ${todayStr}</span>
4. Summary Box (📌 당일 주요 업무 요약):
   - Box: background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0a2540; padding: 18px 20px; margin-bottom: 28px; border-radius: 6px;
   - Header: font-size: 14px; font-weight: 700; color: #0a2540; margin-bottom: 10px; letter-spacing: -0.3px;
   - Bullet List: margin: 0; padding-left: 18px; font-size: 13.5px; color: #334155; line-height: 1.7; letter-spacing: -0.2px;
5. Table Exact Alignment & Style (📋 당일 상세 실적 현황):
   - Section Title: font-size: 14px; font-weight: 700; color: #0a2540; margin-bottom: 12px; letter-spacing: -0.3px;
   - Table Style: width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden;
   - Column Widths: 구분(13%), 담당자(11%), 상태(11%), 업무명(27%), 상세내용(38%)
   - Table Header (th): background-color: #0a2540; color: #ffffff; border: 1px solid #0a2540; vertical-align: middle; font-weight: 700; letter-spacing: -0.3px; (구분/담당자/상태: padding 12px 8px, text-align center | 업무명/상세내용: padding 12px 14px, text-align left)
   - Table Row (tr & td):
     * 모든 td 필수 공통: border: 1px solid #e2e8f0; vertical-align: middle;
     * 짝수 행 Zebra 패턴: background-color: #f8fafc; (홀수 행: #ffffff)
     * [구분]: text-align: center; color: #334155; font-weight: 500; padding: 12px 8px;
     * [담당자]: text-align: center; color: #0f172a; font-weight: 700; padding: 12px 8px;
     * [상태]: text-align: center; padding: 12px 8px;
       - 완료 뱃지: <span style="display: inline-block; padding: 3px 10px; font-size: 11px; font-weight: 700; color: #065f46; background-color: #d1fae5; border-radius: 12px; letter-spacing: -0.2px;">완료</span>
       - 진행중 뱃지: <span style="display: inline-block; padding: 3px 10px; font-size: 11px; font-weight: 700; color: #1e40af; background-color: #dbeafe; border-radius: 12px; letter-spacing: -0.2px;">진행중</span>
       - 예정 뱃지: <span style="display: inline-block; padding: 3px 10px; font-size: 11px; font-weight: 700; color: #475569; background-color: #e2e8f0; border-radius: 12px; letter-spacing: -0.2px;">예정</span>
     * [업무명]: text-align: left; font-weight: 700; color: #0f172a; letter-spacing: -0.3px; line-height: 1.4; padding: 12px 14px;
     * [상세내용]: text-align: left; color: #475569; letter-spacing: -0.2px; line-height: 1.5; padding: 12px 14px;
6. Footer Section:
   - margin-top: 24px; padding-top: 12px; border-top: 1px solid #f1f5f9; font-size: 11.5px; color: #94a3b8; text-align: right; letter-spacing: -0.2px;
   - 문구: "본 보고서는 HD현대삼호 동반성장부 업무 관리 시스템에서 자동 생성되었습니다."
7. 이메일 호환성:
   - <style> 태그 없이 모든 HTML 요소에 style="..." 인라인 스타일(inline style)을 100% 명시하십시오.
8. 마크다운(\`\`\`html 등) 없이 순수 HTML 코드만 반환하십시오. 최상위 <div>로 시작해도 됩니다.`;

    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
    
    const response = await generateContentWithRetry({
      model: "gemini-2.5-flash",
      contents: prompt
    });

    let htmlContent = response.text.replace(/^\s*\`\`\`(?:html)?/mi, '').replace(/\`\`\`\s*$/m, '').trim();

    htmlContent += `
      <div style="margin-top: 40px; margin-bottom: 20px; text-align: center;">
        <a href="https://dongban-board.onrender.com" style="display: inline-block; padding: 14px 28px; background-color: #008C45; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          동반성장부 통합 업무 워크스페이스 바로 가기
        </a>
      </div>
    `;

    await sendEmailToAll(`[동반성장부] 일일 업무 실적 보고 (${todayStr})`, "", htmlContent);
  } catch (error) {
    console.error("Error in generateDailyReport:", error);
    throw error;
  }
}


// Helper function to check if today is a public holiday (YYYY-MM-DD)
function isHoliday(date) {
  const dateString = formatDate(date);
  // 2026년 주요 공휴일 목록 (임시)
  const holidays2026 = [
    "2026-01-01", // 신정
    "2026-02-16", // 설날 연휴
    "2026-02-17", // 설날
    "2026-02-18", // 설날 연휴
    "2026-03-01", // 삼일절
    "2026-05-05", // 어린이날
    "2026-05-24", // 부처님오신날
    "2026-05-25", // 대체공휴일
    "2026-06-06", // 현충일
    "2026-08-15", // 광복절
    "2026-08-16", // 대체공휴일
    "2026-09-24", // 추석 연휴
    "2026-09-25", // 추석
    "2026-09-26", // 추석 연휴
    "2026-10-03", // 개천절
    "2026-10-09", // 한글날
    "2026-12-25"  // 기독탄신일(크리스마스)
  ];
  return holidays2026.includes(dateString);
}

// Cron setup
// Weekly: Monday 7:00 AM KST
cron.schedule('0 7 * * 1', () => {
  console.log("Cron: Triggering Weekly Report...");
  generateWeeklyReport().catch(err => console.error("Cron Weekly Report Error:", err));
}, { timezone: "Asia/Seoul" });

// Daily: 4:50 PM KST (평일 월~금)
cron.schedule('50 16 * * 1-5', () => {
  console.log("Cron: Triggering Daily Report...");
  const today = getKSTDate();
  if (isHoliday(today)) {
    console.log("Today is a holiday. Skipping daily report.");
    return;
  }
  generateDailyReport().catch(err => console.error("Cron Daily Report Error:", err));
}, { timezone: "Asia/Seoul" });

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  app.get("/api/memory-images", (req, res) => {
    try {
      
      
      
      let targetDir = path.join(process.cwd(), 'public');
      if (process.env.NODE_ENV === "production") {
        const distDir = path.join(process.cwd(), 'dist');
        if (fs.existsSync(distDir)) {
          targetDir = distDir;
        }
      }
      
      if (!fs.existsSync(targetDir)) {
        return res.json({ images: [] });
      }
      
      const files = fs.readdirSync(targetDir);
      const imageFiles = files.filter(f => 
        /^([1-9]|1[0-9])\.png$/.test(f)
      );
      
      res.json({ images: imageFiles.map(f => `/${f}`) });
    } catch(e) {
      console.error("Error reading memory images:", e);
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Missing email" });
      }
      if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
        return res.status(500).json({ error: "서버에 Firebase 서비스 계정 키가 설정되지 않았습니다. (FIREBASE_SERVICE_ACCOUNT 필요)" });
      }
      const userRecord = await getAdminAuth().getUserByEmail(email);
      await getAdminAuth().updateUser(userRecord.uid, {
        password: "123456789"
      });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/send-email", async (req, res) => {
    try {
      const { to, subject, html } = req.body;
      if (!to || !subject || !html) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const result = await sendEmail(to, subject, html);
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/reports/weekly", async (req, res) => {
    try {
      await generateWeeklyReport();
      res.json({ message: "Weekly report generated." });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e) });
    }
  });

  
  app.post("/api/reports/daily", async (req, res) => {
    try {
      await generateDailyReport();
      res.json({ message: "Daily report generated." });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });


  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
