const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

const regex = /async function generateWeeklyReport\(\) \{[\s\S]*?async function generateDailyReport\(\) \{[\s\S]*?^\}/m;

const newCode = `async function generateWeeklyReport() {
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
          assignee: t.assignee,
          date: \`\${t.startDate}~\${t.endDate}\`,
          time: \`\${t.startTime}~\${t.endTime}\`,
          isFocus: t.isFocus,
          description: t.description
        };
      })
    };

    const prompt = \`[System Persona]
당신은 HD현대삼호 동반성장부의 최고 전략 분석가이자 보고서 작성 AI입니다. 제공된 데이터를 바탕으로 이번 주 부서가 집중해야 할 핵심 추진 과제와 방향성을 제시하는 최고 수준의 HTML 주간 보고서를 작성하십시오.

[Mail & Title Rule (필수 적용)]
- 메일 제목: HD현대삼호 동반성장부 주간 업무 계획 보고
- HTML 문서 최상단(<h1>) 제목: HD현대삼호 동반성장부 주간 업무 계획 보고

[Data Processing Rule]
1. 기준 일시: \${todayStr} ~ \${nextWeekStr} (이번 주 월~금 날짜 계산)
2. '주간업무' 및 '전체업무' 데이터에서 해당 기간에 속하는 계획 데이터를 추출하십시오.
3. [중요] 제공된 입력 데이터(tasksData)에 있는 대시보드의 모든 업무(Task) 내용을 누락 없이 반드시 상세 표에 모두 포함하여 작성하십시오. 임의로 요약하여 업무를 생략하면 안 됩니다.

[입력 데이터]
\${JSON.stringify(stats, null, 2)}

[Analysis & Insight Rule]
1. [💡 이번 주 핵심 전략 및 인사이트] 섹션을 상단에 배치하십시오.
2. 인사이트 도출 기준:
   - Resource Allocation: 이번 주 가장 중요한 크리티컬 패스(Critical Path) 업무와 경영진 보고/마감 일정을 강조.
   - Synergy Effect: 인력지원과, 기획과, 협력과 등 각 파트 간 일정 중 연계하여 처리할 때 시너지가 나거나 병목을 줄일 수 있는 포인트를 분석하여 제언.

[Design & HTML Rule]
1. 폰트: 'Malgun Gothic', 줄간격 1.6 적용.
2. 컬러: 메인 테마 '#0A2540(다크 네이비)', 주의 및 강조 사항은 '#D97706(엠버)'.
3. 구성요소:
   <메인 타이틀> -> <이번 주 부서 포커스(Focus)> -> <💡 핵심 전략 및 인사이트> -> <파트별 주간 계획 상세 표(소속, 일자, 담당자, 업무명, 상세내용)>.
4. 디자인 세부: HTML 표의 헤더는 다크 네이비 배경에 흰색 글씨를 적용하여 무게감을 주고, 중요 일정은 굵은 글씨로 하이라이트 처리.
5. 이메일 클라이언트 호환성: <style> 태그를 절대 사용하지 말고, 모든 HTML 요소에 style="..." 형태의 인라인 스타일(inline style)을 직접 100% 지정하여 디자인, 배경색, 여백, 글씨체 등이 이메일에서 완벽하고 고급스럽게 표현되도록 하십시오.
6. 마크다운(\\\`\\\`\\\`html 등) 없이 순수 HTML 코드만 반환하십시오. <html>이나 <body> 태그 없이 <div>로 시작해도 됩니다.\`;

    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
    
    const response = await generateContentWithRetry({
      model: "gemini-2.5-flash",
      contents: prompt
    });

    let htmlContent = response.text.replace(/^\\s*\\\`\\\`\\\`(?:html)?/mi, '').replace(/\\\`\\\`\\\`\\s*$/m, '').trim();

    htmlContent += \`
      <div style="margin-top: 40px; margin-bottom: 20px; text-align: center;">
        <a href="https://dongban-board.onrender.com" style="display: inline-block; padding: 14px 28px; background-color: #008C45; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          동반성장부 통합 업무 워크스페이스 바로 가기
        </a>
      </div>
    \`;

    await sendEmailToAll("HD현대삼호 동반성장부 주간 업무 계획 보고", "", htmlContent);
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
          assignee: t.assignee,
          status: "진행완료",
          isFocus: t.isFocus,
          description: t.description
        };
      })
    };

    const prompt = \`[System Persona]
당신은 HD현대삼호 동반성장부의 최고 전략 분석가이자 보고서 작성 AI입니다. 제공된 데이터를 바탕으로 임원진 및 부서장이 당일 실적과 리스크를 직관적으로 파악할 수 있는 최고 수준의 HTML 보고서를 작성하십시오.

[Mail & Title Rule (필수 적용)]
- 메일 제목: HD현대삼호 동반성장부 일일 업무 실적 보고
- HTML 문서 최상단(<h1>) 제목: HD현대삼호 동반성장부 일일 업무 실적 보고

[Data Processing Rule]
1. 기준 일시: \${todayStr}
2. 입력된 데이터 중 시작일자와 종료일자에 오늘 날짜가 포함된 업무를 필터링하십시오.
3. [중요] 제공된 입력 데이터(tasksData)에 있는 대시보드의 모든 당일 업무(Task) 내용을 누락 없이 반드시 상세 실적 표에 모두 포함하여 작성하십시오. 임의로 요약하거나 하나라도 누락하면 안 됩니다.

[입력 데이터]
\${JSON.stringify(stats, null, 2)}

[Analysis & Insight Rule]
1. 단순 일정 나열을 금지합니다. 당일 완료된 업무가 부서 목표(외국인 인력 정착, 협력사 지원, 노무 리스크 관리 등)에 어떤 기여를 했는지 평가하십시오.
2. [💡 AI Daily Insight] 섹션을 생성하여 다음을 분석하십시오.
   - 업무 집중도: 특정 소속이나 개인에게 업무가 집중되었는지 확인.
   - 리스크 및 병목 경고: 일정이 겹치거나 지연이 예상되는 업무, 타 부서 연계 시 발생할 수 있는 마찰 요소를 선제적으로 짚어냄.

[Design & HTML Rule]
1. 폰트: 'Malgun Gothic', 'Apple SD Gothic Neo', 14px~22px.
2. 컬러: 메인 테마 '#0A2540(다크 네이비)', 배경 '#F8F9FA'.
3. 구성요소:
   <메인 타이틀> -> <Executive Summary (3줄 요약)> -> <💡 AI Daily Insight> -> <당일 상세 실적 표(구분(팀), 담당자, 업무명, 상태, 상세내용)>.
4. 표(Table) 양식: border-collapse 적용, 짝수 행 배경색 변경(Zebra 패턴), 상태값(진행완료/진행중)은 시각적 뱃지(Badge) 형태로 CSS 처리.
5. 이메일 클라이언트 호환성: <style> 태그를 절대 사용하지 말고, 모든 HTML 요소에 style="..." 형태의 인라인 스타일(inline style)을 직접 100% 지정하여 디자인, 배경색, 여백, 글씨체 등이 이메일에서 완벽하고 고급스럽게 표현되도록 하십시오.
6. 마크다운(\\\`\\\`\\\`html 등) 없이 순수 HTML 코드만 반환하십시오. <html>이나 <body> 태그 없이 <div>로 시작해도 됩니다.\`;

    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
    
    const response = await generateContentWithRetry({
      model: "gemini-2.5-flash",
      contents: prompt
    });

    let htmlContent = response.text.replace(/^\\s*\\\`\\\`\\\`(?:html)?/mi, '').replace(/\\\`\\\`\\\`\\s*$/m, '').trim();

    htmlContent += \`
      <div style="margin-top: 40px; margin-bottom: 20px; text-align: center;">
        <a href="https://dongban-board.onrender.com" style="display: inline-block; padding: 14px 28px; background-color: #008C45; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          동반성장부 통합 업무 워크스페이스 바로 가기
        </a>
      </div>
    \`;

    await sendEmailToAll("HD현대삼호 동반성장부 일일 업무 실적 보고", "", htmlContent);
  } catch (error) {
    console.error("Error in generateDailyReport:", error);
    throw error;
  }
}`

const parts = content.split('// Helper function to check if today is a public holiday (YYYY-MM-DD)');
if (parts.length === 2) {
  const beforeFunc = parts[0].replace(regex, newCode);
  fs.writeFileSync('server.ts', beforeFunc + '// Helper function to check if today is a public holiday (YYYY-MM-DD)' + parts[1]);
  console.log("Replaced successfully using JS string manipulation.");
} else {
  console.log("Could not find split point");
}
