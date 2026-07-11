export const TEAMS = [
  { id: 't_notice', name: '부서공지', text: 'text-white', bg: 'bg-[#6B7280]', border: 'border-[#4B5563]', hex: '#6B7280' },
  { id: 't5', name: '담당임원', text: 'text-[#FF3B30]', bg: 'bg-[#FF3B30]/15', border: 'border-[#FF3B30]/30', hex: '#FF3B30' },
  { id: 't1', name: '기획과', text: 'text-[#007AFF]', bg: 'bg-[#007AFF]/15', border: 'border-[#007AFF]/30', hex: '#007AFF' },
  { id: 't2', name: '지원과', text: 'text-[#34C759]', bg: 'bg-[#34C759]/15', border: 'border-[#34C759]/30', hex: '#34C759' },
  { id: 't3', name: '인력지원과', text: 'text-[#FF9500]', bg: 'bg-[#FF9500]/15', border: 'border-[#FF9500]/30', hex: '#FF9500' },
  { id: 't4', name: '협력과', text: 'text-[#AF52DE]', bg: 'bg-[#AF52DE]/15', border: 'border-[#AF52DE]/30', hex: '#AF52DE' },
];

export const HOLIDAYS: Record<string, string> = {
  "2025-01-01": "신정", "2025-01-28": "설날 연휴", "2025-01-29": "설날", "2025-01-30": "설날 연휴",
  "2025-03-01": "3·1절", "2025-03-03": "대체공휴일", "2025-05-01": "노동절", "2025-05-05": "어린이날", "2025-05-06": "대체공휴일",
  "2025-06-06": "현충일", "2025-08-15": "광복절", "2025-10-03": "개천절", "2025-10-05": "추석 연휴",
  "2025-10-06": "추석", "2025-10-07": "추석 연휴", "2025-10-08": "대체공휴일", "2025-10-09": "한글날", "2025-12-25": "성탄절",
  "2026-01-01": "신정", "2026-01-02": "회사휴무",
  "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴", "2026-02-19": "대체휴가",
  "2026-03-01": "3·1절", "2026-03-02": "대체공휴일",
  "2026-05-01": "노동절", "2026-05-05": "어린이날", "2026-05-24": "부처님오신날", "2026-05-25": "대체공휴일",
  "2026-06-03": "지방선거일", "2026-06-06": "현충일",
  "2026-08-03": "하기휴가", "2026-08-04": "하기휴가", "2026-08-05": "하기휴가", "2026-08-06": "하기휴가", "2026-08-07": "하기휴가", "2026-08-08": "하기휴가", "2026-08-09": "하기휴가", "2026-08-10": "하기휴가", "2026-08-11": "하기휴가", "2026-08-12": "하기휴가", "2026-08-13": "하기휴가", "2026-08-14": "하기휴가",
  "2026-08-15": "광복절", "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-09-26": "추석 연휴", "2026-09-27": "대체공휴일", "2026-09-28": "대체휴가",
  "2026-10-03": "개천절", "2026-10-09": "한글날", "2026-10-27": "창립기념일",
  "2026-12-25": "기독탄신일"
};

export const QUOTES = [
  {author: "니체 (철학자, 독일)", text: "나를 죽이지 못하는 고통은 나를 더 강하게 만든다."},
  {author: "아리스토텔레스 (철학자, 그리스)", text: "탁월함은 행위가 아니라 습관이다."},
  {author: "괴테 (문학가, 독일)", text: "아는 것만으로는 부족하다, 적용해야 강하다."},
  {author: "피터 드러커 (경영학자, 미국)", text: "미래를 예측하는 가장 좋은 방법은 창조하는 것이다."},
  {author: "공자 (사상가, 중국)", text: "멈추지 않는다면 얼마나 천천히 가는지는 중요하지 않다."},
  {author: "일론 머스크 (기업가, 미국)", text: "실패가 선택지에 없다면 혁신도 없다."}
  // Shortened list for code size, can add more later if needed
];

export const INITIAL_MEMBERS = [
  { email: "jwkim0732@hd.com", name: "김진위", title: "수석", birthDate: "1974-01-26", isLunar: false },
  { email: "bouncer1@hd.com", name: "박희성", title: "책임", birthDate: "1984-07-27", isLunar: false },
  { email: "pss7833@hd.com", name: "박상수", title: "책임", birthDate: "1977-02-14", isLunar: true, lunarMap: { 2024: "03-23", 2025: "03-13", 2026: "03-31", 2027: "03-21", 2028: "03-09", 2029: "03-28", 2030: "03-17" } },
  { email: "rngmlwns0003@hd.com", name: "구희준", title: "매니저", birthDate: "1996-06-15", isLunar: false },
  { email: "c001211@hd.com", name: "이현아", title: "사원", birthDate: "1994-03-22", isLunar: false },
  { email: "a545254@hd.com", name: "이은정", title: "사원", birthDate: "1997-07-10", isLunar: false },
  { email: "heungsu0807@hd.com", name: "이흥수", title: "책임", birthDate: "1978-11-03", isLunar: false },
  { email: "jungh315@hd.com", name: "정헌", title: "책임", birthDate: "1968-03-15", isLunar: false },
  { email: "b217@hd.com", name: "정현문", title: "책임", birthDate: "1967-01-17", isLunar: false },
  { email: "kands48@hd.com", name: "김만수", title: "책임", birthDate: "1974-06-10", isLunar: false },
  { email: "jjg5644@hd.com", name: "정재근", title: "선임", birthDate: "1996-04-27", isLunar: false },
  { email: "p021435@hd.com", name: "이호민", title: "책임", birthDate: "1982-06-11", isLunar: false },
  { email: "p021603@hd.com", name: "하다윤", title: "책임", birthDate: "1985-10-26", isLunar: false },
  { email: "araya@hd.com", name: "백세정", title: "매니저", birthDate: "1999-08-03", isLunar: false },
  { email: "a591545@hd.com", name: "박도은", title: "사원", birthDate: "1997-10-24", isLunar: false },
  { email: "jiaesong@hd.com", name: "송지애", title: "책임", birthDate: "1987-06-17", isLunar: false },
  { email: "p009273@hd.com", name: "안태일", title: "책임", birthDate: "1972-01-13", isLunar: false },
  { email: "sangmin9501@hd.com", name: "박상민", title: "선임", birthDate: "1995-01-03", isLunar: false },
  { email: "njh6300@hd.com", name: "노정현", title: "선임", birthDate: "1996-10-28", isLunar: false }
];

export const ADMIN_HASH = "OTk5OQ==";
export const EMAIL_API_URL = "https://script.google.com/macros/s/AKfycbxgO-GG7aUahtXZSa9YqKP9snlr2gMJW0yB9vBSgv6a-jbQ-VFHEK1F6UYZ83tuX1fT/exec";


export function getHoliday(dateStr: string): string | null {
  if (HOLIDAYS[dateStr]) {
    return HOLIDAYS[dateStr];
  }

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
  const mmdd = `${monthStr}-${dayStr}`;

  const solarHolidays: Record<string, string> = {
    "01-01": "신정",
    "03-01": "3·1절",
    "05-01": "노동절",
    "05-05": "어린이날",
    "06-06": "현충일",
    "07-17": "제헌절",
    "08-15": "광복절",
    "10-03": "개천절",
    "10-09": "한글날",
    "10-27": "창립기념일",
    "12-25": "성탄절"
  };

  if (solarHolidays[mmdd]) {
    return solarHolidays[mmdd];
  }

  // 하기휴가: 8월 첫째 주(월~금), 둘째 주(월~금)
  // 8월 1일이 주말(토,일)이면 그 다음주 월요일부터, 평일이면 그 주 월요일부터 시작
  const firstMondayDate = new Date(year, 7, 1);
  const augFirstDay = firstMondayDate.getDay();
  while (firstMondayDate.getDay() !== 1) {
    if (augFirstDay === 0 || augFirstDay === 6) {
      firstMondayDate.setDate(firstMondayDate.getDate() + 1);
    } else {
      firstMondayDate.setDate(firstMondayDate.getDate() - 1);
    }
  }
  
  const d1 = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const d2 = Date.UTC(firstMondayDate.getFullYear(), firstMondayDate.getMonth(), firstMondayDate.getDate());
  const dayDiff = Math.floor((d1 - d2) / (1000 * 3600 * 24));

  if (dayDiff >= 0 && dayDiff <= 11) {
    if (weekday >= 1 && weekday <= 5) {
      return "하기휴가";
    }
  }

  // 대체공휴일 처리 (토, 일과 겹치는 경우 다음 비공휴일)
  // 단순화를 위해 월요일인 경우에만 직전 토, 일이 대체공휴일 적용 대상인지 확인
  if (weekday === 1) {
    const yesterday = new Date(year, month - 1, day - 1);
    const dayBefore = new Date(year, month - 1, day - 2);
    
    const getMMDD = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const subEligible = ["03-01", "05-05", "08-15", "10-03", "10-09", "12-25"];
    
    if (subEligible.includes(getMMDD(yesterday)) || subEligible.includes(getMMDD(dayBefore))) {
      return "대체공휴일";
    }
  }

  return null;
}
