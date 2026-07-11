import * as XLSX from 'xlsx';
import { Task } from '../types';
import { TEAMS } from './constants';
import { formatDateForInput } from './utils';

export const exportToExcel = (tasks: Task[]) => {
  if (tasks.length === 0) { 
    return false;
  }
  
  const headers1 = ['일련번호', '업무 제목', '구분', '소 파트', '담당자', '장소', '시작일자', '종료일자', '시작시간', '종료시간', '포커스', '설명'];
  const rows1 = tasks.map(task => {
    const team = TEAMS.find(t => t.id === task.teamId)?.name || '';
    const type = task.type === 'section' ? '과단위' : (task.type === 'department' ? '부서단위' : (task.type === 'notice' ? '부서공지' : '개인별'));
    return [task.id, task.title, type, team, task.assignee, task.location||'', task.startDate, task.endDate, task.startTime, task.endTime, task.isFocus?'O':'X', task.description||''];
  });
  const ws1 = XLSX.utils.aoa_to_sheet([headers1, ...rows1]);

  const headers2 = ['업무 구분', '업무 제목', '소속 및 담당자', '진행 일정', '상세 내용'];
  const rows2: any[][] = [];
  
  const sortedTasks = [...tasks].sort((a,b) => a.startDate.localeCompare(b.startDate));
  
  sortedTasks.forEach(task => {
    const team = TEAMS.find(t => t.id === task.teamId)?.name || '';
    const type = task.type === 'section' ? '과단위' : (task.type === 'department' ? '부서단위' : (task.type === 'notice' ? '부서공지' : '개인별'));
    const assigneeStr = team + (task.assignee ? ' ' + task.assignee : '');
    const dateStr = task.startDate === task.endDate ? task.startDate : `${task.startDate} ~ ${task.endDate}`;
    
    const descLines = task.description ? task.description.split('\n') : [''];
    
    descLines.forEach((line, index) => {
      if (index === 0) {
        rows2.push([type, task.title, assigneeStr, dateStr, line]);
      } else {
        rows2.push(['', '', '', '', line]);
      }
    });
  });
  
  const ws2 = XLSX.utils.aoa_to_sheet([headers2, ...rows2]);

  const wb = XLSX.utils.book_new(); 
  XLSX.utils.book_append_sheet(wb, ws1, "전체업무");
  XLSX.utils.book_append_sheet(wb, ws2, "주간업무");
  XLSX.writeFile(wb, `동반성장부_일정_${formatDateForInput(new Date())}.xlsx`);
  return true;
};
