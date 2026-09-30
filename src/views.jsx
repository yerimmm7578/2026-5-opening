import { useState, useRef, useEffect, useCallback } from 'react';
import { IconUser, IconTeacher, IconPlay, IconSend, IconTrash, IconUpload } from './icons.jsx';
import { BroadcastView, WordCloud, FeelingView, FEELING_QUESTION, StrengthReport, ClassStrengthChart } from './components.jsx';
import { callAction, setTeacherKey } from './api.js';
import { checkProfanity, errorMessage, STRENGTHS, strengthColor } from './utils.js';

export function HomeView({ setViewMode, showModal }) {
  const [teacherPw, setTeacherPw] = useState('');
  const [showPwInput, setShowPwInput] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleTeacherLogin = async (e) => {
    e.preventDefault();
    if (checking) return;
    setChecking(true);
    setTeacherKey(teacherPw);
    try {
      await callAction('verifyTeacher');
      setViewMode('teacher');
    } catch (err) {
      setTeacherKey('');
      showModal('오류', errorMessage(err, '확인에 실패했어요. 인터넷 연결을 확인해주세요.'), true);
    }
    setChecking(false);
  };

  return (
    <div className="flex flex-col items-center justify-center py-8 space-y-10 animate-fade-in-up">
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-extrabold text-gray-800">따뜻한 마음을 나누는 시간</h2>
        <p className="text-gray-600">친구의 강점을 찾아 주고, 친구들이 본 나의 모습을 돌아보는 시간</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        <div onClick={() => setViewMode('student')} className="bg-white p-8 rounded-3xl shadow-sm border border-blue-100 hover:shadow-xl cursor-pointer text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center"><IconUser /></div>
          <div><h3 className="text-xl font-bold mb-1">학생 입장</h3><p className="text-xs text-gray-500">강점 칭찬 · 추리 · 성찰</p></div>
        </div>
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-orange-100 text-center flex flex-col items-center gap-4 relative overflow-hidden">
          {!showPwInput ? (
            <div className="w-full h-full flex flex-col items-center justify-center cursor-pointer" onClick={() => setShowPwInput(true)}>
              <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mb-3"><IconTeacher /></div>
              <h3 className="text-xl font-bold mb-1">교사 입장</h3><p className="text-xs text-gray-500">활동 진행 및 학생 명단 관리</p>
            </div>
          ) : (
            <form onSubmit={handleTeacherLogin} className="w-full flex flex-col items-center justify-center gap-3">
              <input type="password" value={teacherPw} onChange={(e) => setTeacherPw(e.target.value)} placeholder="교사 비밀번호" className="w-full px-3 py-2 bg-gray-50 border rounded-lg text-center" autoFocus />
              <div className="flex gap-2 w-full">
                <button type="button" onClick={() => setShowPwInput(false)} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm font-bold">취소</button>
                <button type="submit" disabled={checking} className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold disabled:opacity-60">{checking ? '확인 중...' : '확인'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// 교사 화면
// =====================================================================
export function TeacherView({ studentsList, broadcast, guessCount, activity, feelingCount, feelings, showModal, serverAction }) {
  const a2Open = activity === 'a2';
  const feelingsOpen = activity === 'a3';
  const a4Open = activity === 'a4';
  const [activeTab, setActiveTab] = useState('manage');
  const [newStudent, setNewStudent] = useState({ grade: '5', classNum: '1', name: '', number: '' });
  const fileInputRef = useRef(null);

  // 교사 전용 정보(학생별 칭찬 개수, 정답, 제출 인원, 발표 완료 목록)를 확인합니다.
  // 저장소 요청을 아끼기 위해 [활동2] 탭을 보고 있을 때만 3초마다 확인해요.
  const [info, setInfo] = useState({ praiseCounts: {}, strengthTotals: {}, selfCount: 0, reflectionCount: 0, broadcast: null, guessCount: 0, revealedIds: [] });
  const refreshInfo = useCallback(async () => {
    if (document.hidden) return;
    try {
      const res = await callAction('teacherInfo');
      if (res.data) setInfo(res.data);
    } catch (e) { /* 다음 주기에 다시 시도 */ }
  }, []);
  useEffect(() => {
    if (activeTab !== 'activity2' && activeTab !== 'activity4') return undefined;
    refreshInfo();
    const t = setInterval(refreshInfo, 3000);
    return () => clearInterval(t);
  }, [activeTab, refreshInfo]);

  const act = async (name, payload) => {
    const data = await serverAction(name, payload);
    if (activeTab === 'activity2' || activeTab === 'activity4') refreshInfo();
    return data;
  };
  const fail = (err, fallback) => showModal('오류', errorMessage(err, fallback), true);

  // ---------- 활동2: 시작 / 중지 ----------
  const startActivity2 = async () => {
    if ((feelingsOpen || a4Open) && !confirm('진행 중인 다른 활동이 중지되고 활동2가 시작돼요. 계속할까요?')) return;
    try { await act('startActivity2'); } catch (err) { fail(err, '활동2를 시작하지 못했어요.'); }
  };
  const stopActivity2 = async () => {
    if (broadcast.phase !== 'idle' && !confirm('진행 중인 친구 맞히기가 끝나고, 학생 화면이 칭찬 쓰기 화면으로 돌아가요.\n활동2를 중지할까요?')) return;
    try { await act('stopActivity2'); } catch (err) { fail(err, '활동2를 중지하지 못했어요.'); }
  };

  // ---------- 활동2: 물음표 상자 ----------
  const [opening, setOpening] = useState(null); // AI 요약을 만드는 중인 학생 id
  const [revealing, setRevealing] = useState(false);
  // 물음표 상자를 누르면 → AI가 칭찬을 요약해서 화면에 보여줍니다.
  const openBox = async (student) => {
    if (opening) return;
    setOpening(student.id);
    try {
      const d = await serverAction('prepareSummary', { studentId: student.id });
      if (d.failed && !confirm('AI 요약에 실패해서 친구들의 칭찬을 그대로 보여주게 돼요.\n그래도 진행할까요?')) { setOpening(null); return; }
      await act('startBroadcast', { studentId: student.id, summary: d.summary });
    } catch (err) {
      fail(err, 'AI 요약을 만들지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    setOpening(null);
  };
  // 학생이 [정답 확인]을 누르면 → 친구 이름이 보입니다.
  const handleReveal = async () => {
    if (revealing) return;
    setRevealing(true);
    try { await act('revealAnswer'); } catch (err) { fail(err, '정답을 확인하지 못했어요.'); }
    setRevealing(false);
  };
  const handleHint = async () => {
    try { await act('nextHint'); } catch (err) { fail(err, '힌트를 열지 못했어요.'); }
  };
  const handleCancel = async () => {
    if (!confirm('정답 확인 전이에요. 이 상자를 닫고 다른 상자를 고를까요?\n(지금까지 제출된 답은 사라져요)')) return;
    try { await act('endBroadcast'); } catch (err) { fail(err, '취소하지 못했어요.'); }
  };
  const handleNext = async () => {
    try { await act('endBroadcast'); } catch (err) { fail(err, '다음으로 넘어가지 못했어요.'); }
  };

  // ---------- 명단 관리 ----------
  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.number) return;
    try {
      await act('addStudent', {
        grade: String(newStudent.grade).trim(), classNum: String(newStudent.classNum).trim(),
        number: String(newStudent.number).trim(), name: String(newStudent.name).trim(),
      });
      setNewStudent((prev) => ({ ...prev, name: '', number: '' }));
    } catch (err) { fail(err, '학생 추가에 실패했습니다.'); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

        let headerRowIndex = -1, colNum = -1, colName = -1, colGrade = -1, colClass = -1;
        for (let i = 0; i < Math.min(20, json.length); i++) {
          if (!json[i]) continue;
          for (let j = 0; j < json[i].length; j++) {
            const cellVal = json[i][j];
            if (cellVal == null) continue;
            const cell = String(cellVal).replace(/\s/g, '');
            if (!cell) continue;
            if (cell.includes('번호')) colNum = j;
            if (cell.includes('성명') || cell.includes('이름')) colName = j;
            if (cell.includes('학년')) colGrade = j;
            if (cell.includes('반')) colClass = j;
          }
          if (colNum !== -1 && colName !== -1) { headerRowIndex = i; break; }
        }
        if (headerRowIndex === -1) return showModal('파싱 실패', '엑셀 파일에서 [번호]와 [성명] 열을 찾지 못했습니다. 양식을 확인해주세요.', true);

        const parsed = [];
        for (let i = headerRowIndex + 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row[colNum] == null || row[colName] == null) continue;
          const numStr = String(row[colNum]).replace(/[^0-9]/g, '');
          const nameStr = String(row[colName]).trim();
          if (numStr && nameStr) {
            parsed.push({
              grade: colGrade !== -1 && row[colGrade] != null ? String(row[colGrade]).trim() : '5',
              classNum: colClass !== -1 && row[colClass] != null ? String(row[colClass]).trim() : '1',
              number: numStr, name: nameStr,
            });
          }
        }
        if (parsed.length === 0) return showModal('알림', '유효한 학생 데이터를 찾지 못했습니다.', true);
        await act('addStudentsBulk', parsed);
        showModal('업로드 완료', `총 ${parsed.length}명의 학생이 성공적으로 입력되었습니다.`);
      } catch (err) {
        fail(err, '엑셀 처리 중 오류가 발생했습니다. 파일 형식을 확인해주세요.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleRemoveStudent = async (studentId) => {
    if (confirm('정말 삭제하시겠습니까?\n(이 친구에게 온/이 친구가 쓴 칭찬도 함께 삭제돼요)')) {
      try { await act('removeStudent', studentId); } catch (err) { fail(err, '삭제 실패'); }
    }
  };

  const handleReset = async () => {
    if (!confirm('지금까지 쓴 모든 칭찬·맞히기 기록·댓글을 지우고 방송을 끕니다.\n(학생 명단은 그대로 유지됩니다)\n\n정말 초기화할까요?')) return;
    try {
      await act('resetData');
      showModal('초기화 완료', '칭찬과 댓글이 모두 지워졌어요.');
    } catch (err) { fail(err, '초기화에 실패했습니다.'); }
  };

  // ---------- 활동4: 나 vs 친구가 본 나 ----------
  const startActivity4 = async () => {
    if ((a2Open || feelingsOpen) && !confirm('진행 중인 다른 활동이 중지되고 활동4가 시작돼요. 계속할까요?')) return;
    try { await act('startActivity4'); } catch (err) { fail(err, '활동4를 시작하지 못했어요.'); }
  };
  const stopActivity4 = async () => {
    try { await act('stopActivity4'); } catch (err) { fail(err, '활동4를 중지하지 못했어요.'); }
  };

  // ---------- 활동3: 기분 나누기 ----------
  const startFeelings = async () => {
    if ((a2Open || a4Open) && !confirm('진행 중인 다른 활동이 중지되고 활동3이 시작돼요. 계속할까요?')) return;
    try { await act('startFeelings'); } catch (err) { fail(err, '활동3을 시작하지 못했어요.'); }
  };
  const endFeelings = async () => {
    try { await act('endFeelings'); } catch (err) { fail(err, '활동3을 중지하지 못했어요.'); }
  };
  const removeFeeling = async (text) => {
    if (!confirm(`"${text}" 를 화면에서 지울까요?`)) return;
    try { await act('deleteFeeling', { text }); } catch (err) { fail(err, '삭제에 실패했습니다.'); }
  };
  const clearFeelings = async () => {
    if (!confirm('올라온 기분을 모두 지울까요?')) return;
    try { await act('clearFeelings'); } catch (err) { fail(err, '삭제에 실패했습니다.'); }
  };

  // ---------- 화면 계산 ----------
  const phase = broadcast.phase;
  const liveGuessCount = Math.max(guessCount, phase === 'guessing' ? info.guessCount : 0);
  const tabBtn = (id, label) => (
    <button onClick={() => setActiveTab(id)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === id ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
  );

  // 물음표 상자 순서: 번호 순서대로 두면 누구인지 짐작할 수 있어서, 고정된 무작위 순서로 섞어요.
  const boxHash = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; };
  const boxStudents = [...studentsList].sort((a, b) => boxHash(a.id) - boxHash(b.id));
  const BOX_COLORS = ['from-sky-500 to-blue-600', 'from-emerald-500 to-teal-600', 'from-violet-500 to-indigo-600', 'from-cyan-500 to-sky-600', 'from-teal-500 to-emerald-600', 'from-slate-500 to-slate-700'];

  // 활동3: 같은 기분 문구를 묶어서 (관리용)
  const feelingCounts = {};
  (feelings || []).forEach((f) => { feelingCounts[f] = (feelingCounts[f] || 0) + 1; });

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-full max-w-xl mx-auto">
        {tabBtn('manage', '학생 명단')}
        {tabBtn('activity2', a2Open ? '활동2 🔴' : '활동2')}
        {tabBtn('activity3', feelingsOpen ? '활동3 🔴' : '활동3')}
        {tabBtn('activity4', a4Open ? '활동4 🔴' : '활동4')}
      </div>

      {activeTab === 'manage' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in-up">
          <div className="md:col-span-1 space-y-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><IconUpload /> 나이스 엑셀 업로드</h3>
              <p className="text-xs text-gray-500 mb-3">학년, 반, 번호, 이름이 포함된 엑셀(.xlsx)을 올려주세요. (비고란은 무시됩니다)</p>
              <input type="file" accept=".xlsx, .xls, .csv" ref={fileInputRef} onChange={handleFileUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer" />
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100">
              <h3 className="font-bold text-gray-800 mb-3">학생 개별 추가</h3>
              <form onSubmit={handleAddStudent} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="학년" value={newStudent.grade} onChange={(e) => setNewStudent({ ...newStudent, grade: e.target.value })} className="border rounded px-3 py-2 text-sm" required />
                  <input type="text" placeholder="반" value={newStudent.classNum} onChange={(e) => setNewStudent({ ...newStudent, classNum: e.target.value })} className="border rounded px-3 py-2 text-sm" required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder="번호" value={newStudent.number} onChange={(e) => setNewStudent({ ...newStudent, number: e.target.value })} className="border rounded px-3 py-2 text-sm" required />
                  <input type="text" placeholder="이름" value={newStudent.name} onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })} className="border rounded px-3 py-2 text-sm" required />
                </div>
                <button type="submit" className="w-full py-2 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-gray-900 transition">추가하기</button>
              </form>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-100">
              <h3 className="font-bold text-gray-800 mb-2">전체 초기화</h3>
              <p className="text-xs text-gray-500 mb-3">리허설 후 실제 수업을 새로 시작할 때 사용하세요. 칭찬·맞히기 기록·댓글이 지워지고 학생 명단은 유지돼요.</p>
              <button onClick={handleReset} className="w-full py-2 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 transition">칭찬·댓글 모두 지우기</button>
            </div>
          </div>
          <div className="md:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-orange-100">
            <h3 className="font-bold text-gray-800 mb-3">현재 학급 명단 ({studentsList.length}명)</h3>
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                  <tr><th className="px-4 py-3 rounded-tl-lg">ID (학년-반-번호)</th><th className="px-4 py-3">이름</th><th className="px-4 py-3 text-right rounded-tr-lg">관리</th></tr>
                </thead>
                <tbody>
                  {studentsList.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100 hover:bg-orange-50/50">
                      <td className="px-4 py-3 font-medium text-gray-600">{s.id}</td>
                      <td className="px-4 py-3 font-bold text-gray-800">{s.name}</td>
                      <td className="px-4 py-3 text-right"><button onClick={() => handleRemoveStudent(s.id)} className="text-red-400 hover:text-red-600 p-1 bg-red-50 rounded"><IconTrash /></button></td>
                    </tr>
                  ))}
                  {studentsList.length === 0 && <tr><td colSpan="3" className="text-center py-8 text-gray-400">등록된 학생이 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'activity2' && (
        <div className="space-y-6 animate-fade-in-up">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100">
            {!a2Open ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">[활동2 시작]을 누르면 학생 기기가 <b>친구 맞히기 화면</b>으로 바뀌어요.</p>
                <button onClick={startActivity2} className="px-5 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold shadow-md hover:bg-orange-600">▶ 활동2 시작</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-orange-600">🔴 활동2 진행 중</p>
                  <p className="text-sm text-gray-600">학생 기기는 친구 맞히기 화면이에요. 중지하면 칭찬 쓰기 화면으로 돌아가요.</p>
                </div>
                <button onClick={stopActivity2} className="px-5 py-2 bg-gray-800 text-white rounded-xl text-sm font-bold shadow-md hover:bg-gray-900">■ 활동2 중지</button>
              </div>
            )}
          </div>
          {!a2Open ? (
            <div className="bg-white rounded-3xl border border-dashed border-orange-200 py-16 text-center text-gray-400 text-sm">
              활동2를 시작하면 물음표 상자가 나타나요.
            </div>
          ) : phase === 'idle' ? (
            <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-orange-100">
              <h3 className="font-bold text-gray-800 text-lg mb-1 flex items-center gap-2"><IconPlay /> 활동2 · 이 친구는 누구일까요?</h3>
              <p className="text-sm text-gray-500 mb-5">한 명씩 앞으로 나와 <b>물음표 상자</b>를 눌러요. <b>힌트 1(강점 키워드)</b>로 먼저 추리하고, 필요하면 <b>힌트 2(AI 요약)</b>를 열어요. 근거를 들어 이야기한 뒤 <b>[정답 확인]</b>을 누르면 이름이 나타나요.</p>
              {opening && (
                <div className="flex items-center justify-center gap-3 mb-5 py-3 bg-purple-50 rounded-2xl border border-purple-200">
                  <div className="w-6 h-6 border-4 border-purple-300 border-t-purple-600 rounded-full animate-spin"></div>
                  <p className="text-sm font-bold text-purple-700 animate-pulse">AI가 친구들의 칭찬을 읽고 있어요...</p>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {boxStudents.map((student) => {
                  const count = info.praiseCounts[student.id] || 0;
                  const isRevealed = (info.revealedIds || []).includes(student.id);
                  const isOpening = opening === student.id;
                  const color = BOX_COLORS[boxHash(student.id) % BOX_COLORS.length];
                  const disabled = isRevealed || !count || !!opening;
                  return (
                    <button
                      key={student.id} onClick={() => openBox(student)} disabled={disabled}
                      className={`aspect-square rounded-3xl flex flex-col items-center justify-center gap-1 shadow-md transition-all ${
                        isRevealed ? 'bg-green-50 border-2 border-green-200 cursor-default'
                          : !count ? 'bg-gray-100 border border-gray-200 cursor-not-allowed'
                            : `bg-gradient-to-br ${color} text-white hover:scale-105 active:scale-95 ${opening && !isOpening ? 'opacity-50' : ''}`}`}
                    >
                      {isRevealed ? (
                        <><span className="text-2xl">✅</span><span className="text-xl font-black text-green-700">{student.name}</span></>
                      ) : !count ? (
                        <><span className="text-5xl font-black text-gray-300">?</span><span className="text-[11px] font-bold text-gray-400">칭찬 없음</span></>
                      ) : isOpening ? (
                        <div className="w-8 h-8 border-4 border-white/50 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <span className="text-7xl font-black drop-shadow">?</span>
                      )}
                    </button>
                  );
                })}
                {studentsList.length === 0 && <p className="col-span-full text-center text-gray-400 py-6">먼저 [학생 명단]에서 학생을 등록해주세요.</p>}
              </div>
              <p className="text-xs text-gray-400 mt-5">칭찬이 1개 이상 도착한 친구만 상자를 열 수 있어요. 상자 순서는 번호와 상관없이 섞여 있어요.</p>
            </div>
          ) : (
            <BroadcastView
              viewerRole="teacher" broadcast={broadcast} students={studentsList} guessCount={liveGuessCount}
              showModal={showModal} onReveal={handleReveal} onCancel={handleCancel} onNext={handleNext} onHint={handleHint} revealing={revealing}
            />
          )}
        </div>
      )}

      {activeTab === 'activity3' && (
        <div className="space-y-6 animate-fade-in-up">
          <div className="bg-gradient-to-br from-pink-500 to-orange-400 text-white p-6 rounded-3xl text-center shadow-lg">
            <p className="text-sm font-bold opacity-90 mb-2">활동3 · 기분 나누기</p>
            <h2 className="text-2xl sm:text-3xl font-black leading-snug">{FEELING_QUESTION}</h2>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-pink-100">
            {!feelingsOpen ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">[활동3 시작]을 누르면 학생 기기가 <b>기분 쓰기 화면</b>으로 바뀌어요.</p>
                <button onClick={startFeelings} className="px-5 py-2 bg-pink-500 text-white rounded-xl text-sm font-bold shadow-md hover:bg-pink-600">▶ 활동3 시작</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-pink-600">🔴 활동3 진행 중</p>
                  <p className="text-sm text-gray-600">기분을 올린 친구 <b>{feelingCount}</b> / {studentsList.length}명 · 중지하면 칭찬 쓰기 화면으로 돌아가요.</p>
                </div>
                <button onClick={endFeelings} className="px-5 py-2 bg-gray-800 text-white rounded-xl text-sm font-bold shadow-md hover:bg-gray-900">■ 활동3 중지</button>
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 text-sm mb-2">함께 이야기해 봐요</h3>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-600">
              <li>칭찬을 <b>들을 때</b>와 <b>해 줄 때</b>의 기분은 어떻게 달랐나요?</li>
              <li>쑥스럽거나 부담스러운 마음이 들었다면, 그 이유는 무엇일까요?</li>
              <li>진짜 칭찬과 듣기 좋은 말(아부)은 어떻게 다를까요?</li>
            </ol>
          </div>

          {feelingsOpen && (
            <>
              <div className="bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50 rounded-3xl border border-pink-100 p-4">
                <h3 className="text-center font-bold text-gray-700 mb-1">우리반 친구들의 기분</h3>
                <WordCloud words={feelings} />
              </div>
              {Object.keys(feelingCounts).length > 0 && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-gray-800 text-sm">올라온 감정 단어 관리</h3>
                    <button onClick={clearFeelings} className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100">모두 지우기</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(feelingCounts).map(([text, count]) => (
                      <span key={text} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 bg-gray-50 border border-gray-200 rounded-full text-sm">
                        {text}{count > 1 && <b className="text-pink-500">×{count}</b>}
                        <button onClick={() => removeFeeling(text)} title="삭제" className="text-red-400 hover:text-red-600 p-1 rounded-full"><IconTrash /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'activity4' && (
        <div className="space-y-6 animate-fade-in-up">
          <div className="bg-slate-800 text-white p-6 rounded-3xl text-center shadow-lg">
            <p className="text-sm font-bold opacity-80 mb-2">활동4</p>
            <h2 className="text-2xl sm:text-3xl font-black leading-snug">내가 아는 나 vs 친구가 본 나</h2>
            <p className="text-sm opacity-80 mt-2">내가 예상한 장점과 친구들이 찾아 준 강점을 비교하고, 돌아보며 강점 카드를 만들어요.</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-indigo-100">
            {!a4Open ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">[활동4 시작]을 누르면 학생 기기가 <b>나의 강점 분석 화면</b>으로 바뀌어요.</p>
                <button onClick={startActivity4} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700">▶ 활동4 시작</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-indigo-600">🔴 활동4 진행 중</p>
                  <p className="text-sm text-gray-600">돌아보기를 마친 친구 <b>{info.reflectionCount}</b> / {studentsList.length}명 · 중지하면 칭찬 쓰기 화면으로 돌아가요.</p>
                </div>
                <button onClick={stopActivity4} className="px-5 py-2 bg-gray-800 text-white rounded-xl text-sm font-bold shadow-md hover:bg-gray-900">■ 활동4 중지</button>
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">우리 반이 찾아 준 강점 분포</h3>
              <span className="text-xs text-gray-400">나의 장점을 미리 고른 친구 {info.selfCount}명</span>
            </div>
            <ClassStrengthChart totals={info.strengthTotals} />
            <p className="text-xs text-gray-400 mt-4">우리 반에서 가장 많이 나온 강점은 무엇인가요? 왜 그런 결과가 나왔을지 이야기해 보세요.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 학생 화면
// =====================================================================
export function StudentView({ studentsList, broadcast, guessCount, activity, feelings, showModal, serverAction, autoLoginId }) {
  const [loginInfo, setLoginInfo] = useState({ grade: '', classNum: '', number: '', name: '' });
  const [loggedInStudent, setLoggedInStudent] = useState(null);
  const [praise, setPraise] = useState({ strength: '', situation: '', action: '', feeling: '' });
  const [selfStrengths, setSelfStrengths] = useState([]);
  const [selfDraft, setSelfDraft] = useState([]);
  const [selfSaving, setSelfSaving] = useState(false);
  const [report, setReport] = useState(null);
  const [reportSaving, setReportSaving] = useState(false);
  const [activeTarget, setActiveTarget] = useState(null);
  const [sending, setSending] = useState(false);
  const [written, setWritten] = useState([]);
  const [myGuess, setMyGuess] = useState(null); // { roundId, guessId }
  const [guessSending, setGuessSending] = useState(false);
  const [myFeeling, setMyFeeling] = useState(null); // { text, words }
  const [feelingSending, setFeelingSending] = useState(false);

  // 미리보기/자동 입장용
  useEffect(() => {
    if (autoLoginId && !loggedInStudent) {
      const s = studentsList.find((x) => x.id === autoLoginId);
      if (s) setLoggedInStudent(s);
    }
  }, [autoLoginId, studentsList, loggedInStudent]);

  // 내가 쓴 칭찬 목록 / 내가 고른 답을 서버에서 다시 불러오기 (새로고침해도 유지)
  const syncStatus = useCallback(async (stu) => {
    try {
      const d = await serverAction('myStatus', { writerId: stu.id });
      setWritten(d.written || []);
      setMyGuess(d.guessId ? { roundId: d.roundId, guessId: d.guessId } : null);
      setMyFeeling(d.myFeeling || null);
      setSelfStrengths(d.selfStrengths || []);
      setSelfDraft(d.selfStrengths || []);
    } catch (e) { /* 무시 */ }
  }, [serverAction]);
  useEffect(() => {
    if (loggedInStudent) syncStatus(loggedInStudent);
  }, [loggedInStudent, broadcast.roundId, broadcast.phase, activity, syncStatus]);

  // 활동4가 열리면 내 강점 분석 결과를 불러옵니다.
  useEffect(() => {
    if (activity !== 'a4' || !loggedInStudent) return undefined;
    let stop = false;
    (async () => {
      try { const d = await serverAction('strengthReport', { writerId: loggedInStudent.id }); if (!stop) setReport(d); } catch (e) { /* 무시 */ }
    })();
    return () => { stop = true; };
  }, [activity, loggedInStudent, serverAction]);

  const handleLogin = (e) => {
    e.preventDefault();
    const student = studentsList.find((s) =>
      String(s.grade) === loginInfo.grade.trim() && String(s.classNum) === loginInfo.classNum.trim() &&
      String(s.number) === loginInfo.number.trim() && s.name === loginInfo.name.trim());
    if (student) setLoggedInStudent(student);
    else showModal('실패', '입력 정보가 일치하지 않습니다.', true);
  };

  if (!loggedInStudent) {
    return (
      <div className="flex justify-center py-10 animate-fade-in-up">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-blue-100 max-w-sm w-full">
          <h2 className="text-xl font-bold text-center mb-6">학생 로그인</h2>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="학년" value={loginInfo.grade} onChange={(e) => setLoginInfo({ ...loginInfo, grade: e.target.value })} className="px-3 py-2 bg-gray-50 border rounded-xl text-center" required />
              <input type="text" placeholder="반 (예: 1, 솔잎)" value={loginInfo.classNum} onChange={(e) => setLoginInfo({ ...loginInfo, classNum: e.target.value })} className="px-3 py-2 bg-gray-50 border rounded-xl text-center" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="출석번호" value={loginInfo.number} onChange={(e) => setLoginInfo({ ...loginInfo, number: e.target.value })} className="px-3 py-2 bg-gray-50 border rounded-xl text-center" required />
              <input type="text" placeholder="이름" value={loginInfo.name} onChange={(e) => setLoginInfo({ ...loginInfo, name: e.target.value })} className="px-3 py-2 bg-gray-50 border rounded-xl text-center" required />
            </div>
            <button type="submit" className="w-full mt-2 py-3 bg-blue-500 text-white rounded-xl font-bold">입장하기</button>
          </form>
        </div>
      </div>
    );
  }

  // ---- 활동4: 나 vs 친구가 본 나 ----
  if (activity === 'a4') {
    const handleSaveReflection = async (insight, pledge) => {
      if (reportSaving) return;
      if (checkProfanity(insight) || checkProfanity(pledge)) return showModal('경고', '바르고 고운 말을 써주세요!', true);
      setReportSaving(true);
      try {
        const d = await serverAction('saveReflection', { writerId: loggedInStudent.id, insight, pledge });
        setReport((r) => (r ? { ...r, reflection: d.reflection } : r));
        showModal('저장 완료', '강점 카드가 만들어졌어요. 아래에서 이미지로 저장할 수 있어요.');
      } catch (err) {
        showModal('오류', errorMessage(err, '저장하지 못했어요. 다시 시도해주세요.'), true);
      }
      setReportSaving(false);
    };
    return <StrengthReport student={loggedInStudent} report={report} onSaveReflection={handleSaveReflection} saving={reportSaving} showModal={showModal} />;
  }

  // ---- 활동3: 칭찬을 듣고 난 후 나의 기분 ----
  if (activity === 'a3') {
    const handleSubmitFeeling = async (text) => {
      if (feelingSending) return;
      if (checkProfanity(text)) return showModal('경고', '바르고 고운 말을 써주세요!', true);
      setFeelingSending(true);
      try {
        const d = await serverAction('submitFeeling', { writerId: loggedInStudent.id, text });
        setMyFeeling({ text: (d && d.text) || text, words: (d && d.words) || [] });
      } catch (err) {
        showModal('오류', errorMessage(err, '올리지 못했어요. 다시 한 번 눌러주세요.'), true);
      }
      setFeelingSending(false);
    };
    return (
      <FeelingView studentName={loggedInStudent.name} feelings={feelings} myFeeling={myFeeling} onSubmit={handleSubmitFeeling} sending={feelingSending} />
    );
  }

  // ---- 방송 중: 맞히기 / 정답 발표 화면 ----
  if (activity === 'a2' && broadcast.phase === 'idle') {
    return (
      <div className="flex flex-col items-center py-16 text-center animate-fade-in-up">
        <div className="w-20 h-20 bg-orange-50 text-orange-400 rounded-full flex justify-center items-center mb-6 animate-pulse-soft text-4xl"></div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">곧 친구 맞히기가 시작돼요!</h2>
        <p className="text-gray-500">선생님 화면을 보고 있어 주세요. 상자가 열리면 이 화면에 나타나요.</p>
      </div>
    );
  }
  if (activity === 'a2' && broadcast.phase !== 'idle') {
    const myGuessId = myGuess && myGuess.roundId === broadcast.roundId ? myGuess.guessId : null;
    const handleSubmitGuess = async (guessId) => {
      if (guessSending) return;
      setGuessSending(true);
      try {
        await serverAction('submitGuess', { writerId: loggedInStudent.id, guessId });
        setMyGuess({ roundId: broadcast.roundId, guessId });
      } catch (err) {
        showModal('오류', errorMessage(err, '제출에 실패했어요. 다시 한 번 눌러주세요.'), true);
      }
      setGuessSending(false);
    };
    return (
      <BroadcastView
        viewerRole="student" broadcast={broadcast} students={studentsList} guessCount={guessCount}
        showModal={showModal}
        myGuessId={myGuessId} onSubmitGuess={handleSubmitGuess} sending={guessSending}
      />
    );
  }

  // ---- 방송 전: 친구들에게 칭찬 쓰기 ----
  const classmates = studentsList.filter((s) => s.id !== loggedInStudent.id);
  const resetPraise = () => setPraise({ strength: '', situation: '', action: '', feeling: '' });
  const handleSubmitPraise = async (targetId) => {
    if (sending) return;
    if (!praise.strength) return showModal('알림', '이 친구의 강점을 하나 골라 주세요.', true);
    if (praise.action.trim().length < 5) return showModal('알림', '"어떤 행동을 봤는지" 5글자 이상 구체적으로 적어 주세요.', true);
    if ([praise.situation, praise.action, praise.feeling].some(checkProfanity)) return showModal('경고', '바르고 고운 말을 써주세요!', true);
    setSending(true);
    try {
      const d = await serverAction('savePraise', {
        writerId: loggedInStudent.id, targetId, strength: praise.strength,
        situation: praise.situation.trim(), action: praise.action.trim(), feeling: praise.feeling.trim(),
      });
      setWritten(d.written || []);
      resetPraise();
      setActiveTarget(null);
      showModal('전송 완료', '익명으로 칭찬이 전달되었습니다.');
    } catch (err) {
      showModal('오류', errorMessage(err, '전송에 실패했어요. 다시 한 번 눌러주세요.'), true);
    }
    setSending(false);
  };

  const toggleSelf = (id) => setSelfDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : d.length >= 3 ? d : [...d, id]));
  const saveSelf = async () => {
    if (selfSaving) return;
    setSelfSaving(true);
    try {
      const d = await serverAction('saveSelfStrengths', { writerId: loggedInStudent.id, strengths: selfDraft });
      setSelfStrengths(d.selfStrengths || []);
    } catch (err) {
      showModal('오류', errorMessage(err, '저장하지 못했어요. 다시 시도해주세요.'), true);
    }
    setSelfSaving(false);
  };
  const selfChanged = selfDraft.join(',') !== selfStrengths.join(',');

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-blue-100 flex justify-between items-center">
        <h2 className="text-xl font-bold">{loggedInStudent.name} 안녕! </h2>
        <div className="font-bold text-gray-500">작성 완료: <span className="text-blue-500">{written.length}</span>/{classmates.length}</div>
      </div>
      <div className="bg-white p-5 rounded-2xl border border-indigo-100 space-y-3">
        <div>
          <h3 className="font-bold text-gray-800">먼저, 내가 생각하는 나의 장점 3가지</h3>
          <p className="text-xs text-gray-500">미리 골라 두면 나중에 친구들이 찾아 준 강점과 비교해 볼 수 있어요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STRENGTHS.map((x) => {
            const on = selfDraft.includes(x.id);
            return (
              <button key={x.id} type="button" title={x.desc} onClick={() => toggleSelf(x.id)}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition ${on ? 'text-white border-transparent shadow' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                style={on ? { backgroundColor: x.color } : undefined}>{x.id}</button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">{selfDraft.length}/3 선택 {selfStrengths.length > 0 && !selfChanged && <span className="text-green-600 font-bold">· 저장됨</span>}</p>
          <button type="button" onClick={saveSelf} disabled={selfSaving || !selfChanged || selfDraft.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40">{selfSaving ? '저장 중...' : '저장'}</button>
        </div>
      </div>
      <p className="text-sm text-gray-500 text-center">친구의 강점을 찾아 <b>구체적인 행동</b>을 근거로 적어 주세요. 선생님이 활동을 시작하면 다음 단계로 넘어가요.</p>
      <div className="space-y-4">
        {classmates.map((c) => {
          const done = written.includes(c.id);
          const active = activeTarget === c.id;
          return (
            <div key={c.id} className={`bg-white rounded-2xl border ${done ? 'border-green-200' : 'border-gray-200'} overflow-hidden`}>
              <div onClick={() => !done && setActiveTarget(active ? null : c.id)} className={`flex justify-between p-4 ${done ? 'bg-green-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                <div className="flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold">{c.number}</div><div className="font-bold">{c.name} {done && '✅'}</div></div>
                {!done && <div className="text-blue-500 text-sm font-bold bg-blue-50 px-3 py-1 rounded-lg">작성하기 ▼</div>}
              </div>
              {active && !done && (
                <div className="p-4 bg-blue-50/30">
                  <div className="space-y-3 mb-3">
                    <div>
                      <p className="text-xs font-bold text-gray-600 mb-2">① 이 친구의 어떤 강점이 보였나요? (하나 고르기)</p>
                      <div className="flex flex-wrap gap-2">
                        {STRENGTHS.map((x) => {
                          const on = praise.strength === x.id;
                          return (
                            <button key={x.id} type="button" onClick={() => setPraise((p) => ({ ...p, strength: x.id }))}
                              className={`px-3 py-1.5 rounded-full text-sm font-bold border transition ${on ? 'text-white border-transparent shadow' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                              style={on ? { backgroundColor: x.color } : undefined}>{x.id}</button>
                          );
                        })}
                      </div>
                      {praise.strength && <p className="text-[11px] text-gray-500 mt-1">{praise.strength}: {(STRENGTHS.find((x) => x.id === praise.strength) || {}).desc}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600">② 언제, 어떤 상황이었나요? (선택)</label>
                      <input type="text" value={praise.situation} maxLength={100} onChange={(e) => setPraise((p) => ({ ...p, situation: e.target.value }))} placeholder="예: 모둠 활동 시간에" className="w-full mt-1 p-2.5 border rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600">③ 그 친구가 어떤 행동을 했나요? (꼭 쓰기)</label>
                      <textarea value={praise.action} maxLength={150} rows="2" onChange={(e) => setPraise((p) => ({ ...p, action: e.target.value }))} placeholder="예: 의견이 다른 친구의 말을 끝까지 듣고 자기 생각을 차분히 말했어요." className="w-full mt-1 p-2.5 border rounded-xl text-sm"></textarea>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600">④ 그 행동을 보고 내가 느낀 점 (선택)</label>
                      <input type="text" value={praise.feeling} maxLength={100} onChange={(e) => setPraise((p) => ({ ...p, feeling: e.target.value }))} placeholder="예: 나도 본받고 싶었어요." className="w-full mt-1 p-2.5 border rounded-xl text-sm" />
                    </div>
                    <p className="text-[11px] text-gray-400">이름은 쓰지 않아도 돼요. 누가 썼는지는 보이지 않아요.</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setActiveTarget(null); resetPraise(); }} className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-bold">취소</button>
                    <button onClick={() => handleSubmitPraise(c.id)} disabled={sending} className="px-5 py-2 bg-blue-500 text-white rounded-xl text-sm font-bold flex gap-1 items-center disabled:opacity-60"><IconSend /> {sending ? '전송 중...' : '익명 전송'}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
