import "dotenv/config";
import express from "express";
import { google } from "googleapis";
import { marked } from "marked";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import { GoogleGenAI } from "@google/genai";
import { initializeApp as initAdminApp, cert } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import cron from "node-cron";

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

const APP_ID = process.env.APP_ID || process.env.APPLET_ID || 'eb3f0661-2776-44fe-b636-367868eb0a11';
const EMAIL_API_URL = "https://script.google.com/macros/s/AKfycbxgO-GG7aUahtXZSa9YqKP9snlr2gMJW0yB9vBSgv6a-jbQ-VFHEK1F6UYZ83tuX1fT/exec";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "missing_key" });

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


async function sendEmail(emailAddress: string, subject: string, htmlContent: string) {
  console.log("=== SEND EMAIL (GMAIL API) ===");
  console.log("To:", emailAddress);
  console.log("Subject:", subject);
  
  try {
    if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
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
      } catch (profileErr) {
        console.warn("Failed to fetch Gmail profile. Using fallback SMTP_USER:", profileErr);
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
      return { success: true };
    } else {
      // Fallback to webhook if no Gmail creds
      const data = {
        to: emailAddress,
        subject: subject,
        html: htmlContent,
        htmlBody: htmlContent,
        message: htmlContent,
        messageHtml: htmlContent,
        body: htmlContent.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/^[ \t]+/gm, '').replace(/\n{3,}/g, '\n\n').trim()
      };
      const response = await fetch(EMAIL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return { success: response.ok };
    }
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: String(error) };
  }
}


async function sendEmailToAll(subject, textBody, htmlBody) {
  try {
    // 1. Get emails of all department members from Firestore first
    const members = await getMembers();
    let emails = members.map(m => m.email).filter(Boolean);
    console.log("Department members emails from Firestore:", emails);
    
    // 2. If no members in Firestore, fall back to Firebase Auth users
    if (emails.length === 0) {
      try {
        const listUsersResult = await getAdminAuth().listUsers(1000);
        emails = listUsersResult.users.map(u => u.email).filter(Boolean);
        console.log("Fallback: Firebase Auth users emails:", emails);
      } catch (authErr) {
        console.warn("Could not list Firebase Auth users:", authErr);
      }
    }
    
    if (emails.length === 0) {
      console.log("No users found to send emails to.");
      return;
    }
    
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
      tasksData: weekTasks.map(t => ({
        title: t.title,
        assignee: t.assignee,
        date: `${t.startDate}~${t.endDate}`,
        time: `${t.startTime}~${t.endTime}`,
        isFocus: t.isFocus,
        description: t.description
      }))
    };

    const prompt = `[System Persona]
당신은 HD현대삼호 동반성장부의 최고 전략 분석가이자 보고서 작성 AI입니다. 제공된 데이터를 바탕으로 이번 주 부서가 집중해야 할 핵심 추진 과제와 방향성을 제시하는 최고 수준의 HTML 주간 보고서를 작성하십시오.

[Mail & Title Rule (필수 적용)]
- 메일 제목: HD현대삼호 동반성장부 주간 업무 계획 보고
- HTML 문서 최상단(<h1>) 제목: HD현대삼호 동반성장부 주간 업무 계획 보고

[Data Processing Rule]
1. 기준 일시: ${todayStr} ~ ${nextWeekStr} (이번 주 월~금 날짜 계산)
2. '주간업무' 및 '전체업무' 데이터에서 해당 기간에 속하는 계획 데이터를 추출하십시오.

[입력 데이터]
${JSON.stringify(stats, null, 2)}

[Analysis & Insight Rule]
1. [💡 이번 주 핵심 전략 및 인사이트] 섹션을 상단에 배치하십시오.
2. 인사이트 도출 기준:
   - Resource Allocation: 이번 주 가장 중요한 크리티컬 패스(Critical Path) 업무와 경영진 보고/마감 일정을 강조.
   - Synergy Effect: 인력지원과, 기획과, 협력과 등 각 파트 간 일정 중 연계하여 처리할 때 시너지가 나거나 병목을 줄일 수 있는 포인트를 분석하여 제언.

[Design & HTML Rule]
1. 폰트: 'Malgun Gothic', 줄간격 1.6 적용.
2. 컬러: 메인 테마 '#0A2540(다크 네이비)', 주의 및 강조 사항은 '#D97706(엠버)'.
3. 구성요소:
   <메인 타이틀> -> <이번 주 부서 포커스(Focus)> -> <💡 핵심 전략 및 인사이트> -> <파트별 주간 계획 상세 표(일자, 소속 및 담당자, 업무명, 상세내용)>.
4. 디자인 세부: HTML 표의 헤더는 다크 네이비 배경에 흰색 글씨를 적용하여 무게감을 주고, 중요 일정은 굵은 글씨로 하이라이트 처리.
5. 마크다운(\`\`\`html 등) 없이 순수 HTML 코드만 반환하십시오. <html>이나 <body> 태그 없이 <div>로 시작해도 됩니다.
`;

    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
    
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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

    await sendEmailToAll("HD현대삼호 동반성장부 주간 업무 계획 보고", "", htmlContent);
  } catch (error) {
    console.error("Error in generateWeeklyReport:", error);
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
      tasksData: todayTasks.map(t => ({
        title: t.title,
        assignee: t.assignee,
        status: "진행완료", // Or however it is tracked, defaulting to '진행완료/진행중' depending on conditions
        isFocus: t.isFocus,
        description: t.description
      }))
    };

    const prompt = `[System Persona]
당신은 HD현대삼호 동반성장부의 최고 전략 분석가이자 보고서 작성 AI입니다. 제공된 데이터를 바탕으로 임원진 및 부서장이 당일 실적과 리스크를 직관적으로 파악할 수 있는 최고 수준의 HTML 보고서를 작성하십시오.

[Mail & Title Rule (필수 적용)]
- 메일 제목: HD현대삼호 동반성장부 일일 업무 실적 보고
- HTML 문서 최상단(<h1>) 제목: HD현대삼호 동반성장부 일일 업무 실적 보고

[Data Processing Rule]
1. 기준 일시: ${todayStr}
2. 입력된 데이터 중 시작일자와 종료일자에 오늘 날짜가 포함된 업무를 필터링하십시오.

[입력 데이터]
${JSON.stringify(stats, null, 2)}

[Analysis & Insight Rule]
1. 단순 일정 나열을 금지합니다. 당일 완료된 업무가 부서 목표(외국인 인력 정착, 협력사 지원, 노무 리스크 관리 등)에 어떤 기여를 했는지 평가하십시오.
2. [💡 AI Daily Insight] 섹션을 생성하여 다음을 분석하십시오.
   - 업무 집중도: 특정 소속이나 개인에게 업무가 집중되었는지 확인.
   - 리스크 및 병목 경고: 일정이 겹치거나 지연이 예상되는 업무, 타 부서 연계 시 발생할 수 있는 마찰 요소를 선제적으로 짚어냄.

[Design & HTML Rule]
1. 폰트: 'Malgun Gothic', 'Apple SD Gothic Neo', 14px~22px.
2. 컬러: 메인 테마 '#0A2540(다크 네이비)', 배경 '#F8F9FA'.
3. 구성요소:
   <메인 타이틀> -> <Executive Summary (3줄 요약)> -> <💡 AI Daily Insight> -> <당일 상세 실적 표(구분, 담당자, 업무명, 상태, 비고)>.
4. 표(Table) 양식: border-collapse 적용, 짝수 행 배경색 변경(Zebra 패턴), 상태값(진행완료/진행중)은 시각적 뱃지(Badge) 형태로 CSS 처리.
5. 마크다운(\`\`\`html 등) 없이 순수 HTML 코드만 반환하십시오. <html>이나 <body> 태그 없이 <div>로 시작해도 됩니다.
`;

    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
    
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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

    await sendEmailToAll("HD현대삼호 동반성장부 일일 업무 실적 보고", "", htmlContent);
  } catch (error) {
    console.error("Error in generateDailyReport:", error);
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
  generateWeeklyReport();
}, { timezone: "Asia/Seoul" });

// Daily: 4:50 PM KST (평일 월~금)
cron.schedule('50 16 * * 1-5', () => {
  console.log("Cron: Triggering Daily Report...");
  const today = getKSTDate();
  if (isHoliday(today)) {
    console.log("Today is a holiday. Skipping daily report.");
    return;
  }
  generateDailyReport();
}, { timezone: "Asia/Seoul" });

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // API to manually trigger reports (for testing)
  
  
  
  app.get("/api/memory-images", (req, res) => {
    try {
      const fs = require('fs');
      const path = require('path');
      
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
