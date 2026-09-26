import { useState, useRef, useEffect, useCallback } from 'react';
import { IconUser, IconTeacher, IconParents, IconPlay, IconSend, IconTrash, IconUpload } from './icons.jsx';
import { BroadcastView } from './components.jsx';
import { callAction, setTeacherKey } from './api.js';
import { checkProfanity, errorMessage } from './utils.js';

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
        <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">학부모 공개수업 특별 앱</span>
        <h2 className="text-3xl font-extrabold text-gray-800">따뜻한 마음을 나누는 시간</h2>
        <p className="text-gray-600">친구들의 칭찬으로 "이 친구는 누구일까요?" 맞혀봐요!</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        <div onClick={() => setViewMode('student')} className="bg-white p-8 rounded-3xl shadow-sm border border-blue-100 hover:shadow-xl cursor-pointer text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center"><IconUser /></div>
          <div><h3 className="text-xl font-bold mb-1">학생 입장</h3><p className="text-xs text-gray-500">칭찬 쓰기 · 친구 맞히기</p></div>
        </div>
        <div onClick={() => setViewMode('parent')} className="bg-white p-8 rounded-3xl shadow-sm border border-green-100 hover:shadow-xl cursor-pointer text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center"><IconParents /></div>
          <div><h3 className="text-xl font-bold mb-1">학부모 입장</h3><p className="text-xs text-gray-500">관람 및 응원 댓글 달기</p></div>
        </div>
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-orange-100 text-center flex flex-col items-center gap-4 relative overflow-hidden">
          {!showPwInput ? (
            <div className="w-full h-full flex flex-col items-center justify-center cursor-pointer" onClick={() => setShowPwInput(true)}>
              <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mb-3"><IconTeacher /></div>
              <h3 className="text-xl font-bold mb-1">교사 입장</h3><p className="text-xs text-gray-500">방송 제어 및 댓글 관리</p>
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
export function TeacherView({ studentsList, broadcast, guessCount, comments, showModal, serverAction }) {
  const [activeTab, setActiveTab] = useState('manage');
  const [newStudent, setNewStudent] = useState({ grade: '5', classNum: '1', name: '', number: '' });
  const fileInputRef = useRef(null);

  // 교사 전용 정보(학생별 칭찬 개수, 정답, 제출 인원)를 확인합니다.
  // 저장소 요청을 아끼기 위해 [방송 제어] 탭을 보고 있을 때만 3초마다 확인해요.
  const [info, setInfo] = useState({ praiseCounts: {}, broadcast: null, guessCount: 0 });
  const refreshInfo = useCallback(async () => {
    if (document.hidden) return;
    try {
      const res = await callAction('teacherInfo');
      if (res.data) setInfo(res.data);
    } catch (e) { /* 다음 주기에 다시 시도 */ }
  }, []);
  useEffect(() => {
    if (activeTab !== 'broadcast') return undefined;
    refreshInfo();
    const t = setInterval(refreshInfo, 3000);
    return () => clearInterval(t);
  }, [activeTab, refreshInfo]);

  const act = async (name, payload) => {
    const data = await serverAction(name, payload);
    if (activeTab === 'broadcast') refreshInfo();
    return data;
  };
  const fail = (err, fallback) => showModal('오류', errorMessage(err, fallback), true);

  // ---------- 방송 시작 준비 (AI 요약 확인/수정) ----------
  const [prep, setPrep] = useState(null); // { student, summary, loading, failed, count, starting }
  const generateSummary = async (student) => {
    setPrep((p) => (p ? { ...p, loading: true } : p));
    try {
      const d = await serverAction('prepareSummary', { studentId: student.id });
      setPrep((p) => (p ? { ...p, summary: d.summary, failed: !!d.failed, count: d.praiseCount, loading: false } : p));
    } catch (err) {
      setPrep(null);
      fail(err, 'AI 요약을 만들지 못했어요. 잠시 후 다시 시도해주세요.');
    }
  };
  const openPrep = (student) => {
    setPrep({ student, summary: '', loading: true, failed: false, count: 0, starting: false });
    generateSummary(student);
  };
  const confirmStart = async () => {
    if (!prep || !prep.summary.trim() || prep.starting) return;
    setPrep((p) => ({ ...p, starting: true }));
    try {
      await act('startBroadcast', { studentId: prep.student.id, summary: prep.summary.trim() });
      setPrep(null);
    } catch (err) {
      setPrep((p) => (p ? { ...p, starting: false } : p));
      fail(err, '방송을 시작하지 못했어요.');
    }
  };

  const handleReveal = async () => {
    try { await act('revealAnswer'); } catch (err) { fail(err, '정답을 발표하지 못했어요.'); }
  };
  const handleEnd = async () => {
    if (broadcast.phase === 'guessing' && !confirm('아직 정답 발표 전이에요. 방송을 취소할까요?\n(지금까지 제출된 답은 사라져요)')) return;
    try { await act('endBroadcast'); } catch (err) { fail(err, '방송을 종료하지 못했어요.'); }
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
      setPrep(null);
      showModal('초기화 완료', '칭찬과 댓글이 모두 지워졌어요.');
    } catch (err) { fail(err, '초기화에 실패했습니다.'); }
  };

  // ---------- 댓글 관리 ----------
  const [allComments, setAllComments] = useState([]);
  const loadAllComments = useCallback(async () => {
    try { const d = await serverAction('getAllComments'); setAllComments((d && d.comments) || []); } catch (e) { /* 무시 */ }
  }, [serverAction]);
  useEffect(() => {
    if (activeTab !== 'comments') return undefined;
    loadAllComments();
    const t = setInterval(loadAllComments, 10000);
    return () => clearInterval(t);
  }, [activeTab, loadAllComments]);

  const handleDeleteComment = async (c) => {
    if (!confirm(`이 댓글을 삭제할까요?\n\n"${c.text}"`)) return;
    try {
      await act('deleteComment', { studentId: c.targetStudentId, commentId: c.id });
      if (activeTab === 'comments') loadAllComments();
    } catch (err) { fail(err, '댓글 삭제에 실패했습니다.'); }
  };

  // ---------- 화면 계산 ----------
  const phase = broadcast.phase;
  const answerId = phase !== 'idle' && info.broadcast ? info.broadcast.targetId : null;
  const answerStudent = answerId ? studentsList.find((s) => s.id === answerId) : null;
  const liveGuessCount = Math.max(guessCount, phase === 'guessing' ? info.guessCount : 0);
  const tabBtn = (id, label) => (
    <button onClick={() => setActiveTab(id)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === id ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
  );

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-full max-w-md mx-auto">
        {tabBtn('manage', '학생 명단')}
        {tabBtn('broadcast', '방송 제어')}
        {tabBtn('comments', '댓글 관리')}
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

      {activeTab === 'broadcast' && (
        <div className="space-y-6 animate-fade-in-up">
          {/* 진행 상태 + 제어 버튼 */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><IconPlay /> 방송 제어</h3>
            {phase === 'idle' && <p className="text-sm text-gray-500">아래 명단에서 맞히기를 진행할 친구를 골라 [방송 시작]을 눌러주세요.</p>}
            {phase === 'guessing' && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-blue-700">🔍 맞히기 진행 중</p>
                  <p className="text-sm text-gray-600">정답: <b className="text-orange-600">{answerStudent ? answerStudent.name : '...'}</b> · 제출 {liveGuessCount}/{studentsList.length}명</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleEnd} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200">방송 취소</button>
                  <button onClick={handleReveal} className="px-5 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold shadow-md hover:bg-orange-600">🎉 정답 발표</button>
                </div>
              </div>
            )}
            {phase === 'revealed' && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-green-700">✅ 정답 발표 완료 — 댓글을 받는 중</p>
                  <p className="text-sm text-gray-600">{answerStudent ? `${answerStudent.name} 친구` : ''} · 댓글 {comments.length}개</p>
                </div>
                <button onClick={handleEnd} className="px-5 py-2 bg-gray-800 text-white rounded-xl text-sm font-bold shadow-md hover:bg-gray-900">방송 종료 (다음 친구로)</button>
              </div>
            )}
          </div>

          {/* 학생/학부모에게 보이는 화면 모니터링 */}
          <div className="bg-gray-100 p-4 sm:p-6 rounded-3xl border-2 border-orange-300 shadow-lg relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="font-bold text-gray-700 flex items-center gap-2 text-lg">📺 학생/학부모 기기 송출 화면</h3>
              {phase !== 'idle'
                ? <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">실시간 모니터링 중</span>
                : <span className="bg-gray-300 text-gray-600 text-xs font-bold px-3 py-1 rounded-full">방송 대기 중</span>}
            </div>
            {phase !== 'idle' ? (
              <div className="ring-4 ring-gray-200 rounded-3xl overflow-hidden bg-white">
                <BroadcastView
                  viewerRole="teacher" broadcast={broadcast} students={studentsList} guessCount={liveGuessCount} comments={comments}
                  showModal={showModal} serverAction={serverAction} fixedWriterName="선생님" answerId={answerId} onDeleteComment={handleDeleteComment}
                />
              </div>
            ) : (
              <div className="bg-white rounded-2xl py-12 text-center text-gray-400 text-sm">
                [방송 시작]을 누르면 학생과 학부모에게 보이는 화면이 여기에 나타납니다.
              </div>
            )}
          </div>

          {/* AI 요약 확인 후 시작 */}
          {prep && phase === 'idle' && (
            <div className="bg-purple-50 p-5 rounded-2xl border-2 border-purple-200 shadow-md animate-fade-in-up">
              <h3 className="font-bold text-purple-800 mb-1">🤖 AI 요약 확인 후 방송 시작</h3>
              <p className="text-xs text-purple-600 mb-3">{prep.count ? `${prep.count}개의 칭찬을 요약했어요. ` : ''}이름이 드러나는 표현이 없는지 확인하고, 필요하면 직접 고쳐주세요.</p>
              {prep.loading ? (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="w-8 h-8 border-4 border-purple-300 border-t-purple-600 rounded-full animate-spin"></div>
                  <p className="text-sm font-bold text-purple-600 animate-pulse">AI가 칭찬을 읽고 있어요...</p>
                </div>
              ) : (
                <>
                  {prep.failed && <p className="text-xs font-bold text-red-500 mb-2">AI 요약에 실패해서 친구들의 칭찬을 그대로 가져왔어요. 다듬어서 사용하거나 [다시 만들기]를 눌러주세요.</p>}
                  <textarea value={prep.summary} onChange={(e) => setPrep((p) => ({ ...p, summary: e.target.value }))} rows="4" maxLength={800} className="w-full p-3 border border-purple-200 rounded-xl text-sm bg-white mb-3" />
                </>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => setPrep(null)} className="px-4 py-2 bg-white border rounded-xl text-sm font-bold">취소</button>
                <button onClick={() => generateSummary(prep.student)} disabled={prep.loading} className="px-4 py-2 bg-purple-100 text-purple-700 rounded-xl text-sm font-bold disabled:opacity-50">다시 만들기</button>
                <button onClick={confirmStart} disabled={prep.loading || prep.starting || !prep.summary.trim()} className="px-5 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold shadow-md hover:bg-orange-600 disabled:opacity-50">{prep.starting ? '시작하는 중...' : '이 내용으로 방송 시작'}</button>
              </div>
            </div>
          )}

          {/* 친구 목록 (방송 대기 중에만) */}
          {phase === 'idle' && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100">
              <h3 className="font-bold text-gray-800 mb-1">맞히기를 진행할 친구 고르기</h3>
              <p className="text-xs text-gray-500 mb-4">칭찬이 1개 이상 도착한 친구만 방송할 수 있어요.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {studentsList.map((student) => {
                  const count = info.praiseCounts[student.id] || 0;
                  return (
                    <div key={student.id} className={`p-4 rounded-xl border ${prep && prep.student.id === student.id ? 'border-purple-400 ring-2 ring-purple-200' : 'bg-white'} text-center flex flex-col gap-2 transition-all`}>
                      <div className="text-sm font-bold text-gray-400">{student.number}번</div>
                      <div className="text-lg font-black">{student.name}</div>
                      <div className={`text-xs font-bold ${count ? 'text-pink-500' : 'text-gray-300'}`}>💌 칭찬 {count}개</div>
                      <button onClick={() => openPrep(student)} disabled={!count} className="py-1.5 rounded-lg text-sm font-bold bg-gray-800 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">방송 시작</button>
                    </div>
                  );
                })}
                {studentsList.length === 0 && <p className="col-span-full text-center text-gray-400 py-6">먼저 [학생 명단]에서 학생을 등록해주세요.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'comments' && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">전체 댓글 관리 ({allComments.length}개)</h3>
            <button onClick={loadAllComments} className="px-3 py-1 bg-gray-100 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-200">새로고침</button>
          </div>
          <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {allComments.map((c) => (
              <div key={c.id} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 mb-1"><b className="text-orange-500">{c.studentName}</b> 친구에게 · {c.writerName} · {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="text-sm text-gray-800 break-words">{c.text}</p>
                </div>
                <button onClick={() => handleDeleteComment(c)} className="shrink-0 text-red-400 hover:text-red-600 p-1 bg-red-50 rounded"><IconTrash /></button>
              </div>
            ))}
            {allComments.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">아직 등록된 댓글이 없습니다.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 학생 화면
// =====================================================================
export function StudentView({ studentsList, broadcast, guessCount, comments, showModal, serverAction, autoLoginId }) {
  const [loginInfo, setLoginInfo] = useState({ grade: '', classNum: '', number: '', name: '' });
  const [loggedInStudent, setLoggedInStudent] = useState(null);
  const [praiseText, setPraiseText] = useState('');
  const [activeTarget, setActiveTarget] = useState(null);
  const [sending, setSending] = useState(false);
  const [written, setWritten] = useState([]);
  const [myGuess, setMyGuess] = useState(null); // { roundId, guessId }
  const [guessSending, setGuessSending] = useState(false);

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
    } catch (e) { /* 무시 */ }
  }, [serverAction]);
  useEffect(() => {
    if (loggedInStudent) syncStatus(loggedInStudent);
  }, [loggedInStudent, broadcast.roundId, broadcast.phase, syncStatus]);

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

  // ---- 방송 중: 맞히기 / 정답 발표 화면 ----
  if (broadcast.phase !== 'idle') {
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
        viewerRole="student" broadcast={broadcast} students={studentsList} guessCount={guessCount} comments={comments}
        showModal={showModal} serverAction={serverAction} fixedWriterName={loggedInStudent.name}
        myGuessId={myGuessId} onSubmitGuess={handleSubmitGuess} sending={guessSending}
      />
    );
  }

  // ---- 방송 전: 친구들에게 칭찬 쓰기 ----
  const classmates = studentsList.filter((s) => s.id !== loggedInStudent.id);
  const handleSubmitPraise = async (targetId) => {
    if (sending) return;
    if (!praiseText.trim()) return;
    if (checkProfanity(praiseText)) return showModal('경고', '바르고 고운 말을 써주세요!', true);
    setSending(true);
    try {
      const d = await serverAction('savePraise', { writerId: loggedInStudent.id, targetId, text: praiseText.trim() });
      setWritten(d.written || []);
      setPraiseText('');
      setActiveTarget(null);
      showModal('전송 완료', '익명으로 칭찬이 전달되었습니다!');
    } catch (err) {
      showModal('오류', errorMessage(err, '전송에 실패했어요. 다시 한 번 눌러주세요.'), true);
    }
    setSending(false);
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-blue-100 flex justify-between items-center">
        <h2 className="text-xl font-bold">{loggedInStudent.name} 안녕! 👋</h2>
        <div className="font-bold text-gray-500">작성 완료: <span className="text-blue-500">{written.length}</span>/{classmates.length}</div>
      </div>
      <p className="text-sm text-gray-500 text-center">친구의 좋은 점을 적어주세요. 선생님이 방송을 시작하면 <b>"이 친구는 누구일까요?"</b> 퀴즈가 시작돼요!</p>
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
                  <textarea value={praiseText} maxLength={300} onChange={(e) => setPraiseText(e.target.value)} rows="3" placeholder="친구가 잘하는 점을 적어주세요. (이름은 쓰지 않아도 돼요)" className="w-full p-3 border rounded-xl text-sm mb-3"></textarea>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setActiveTarget(null)} className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-bold">취소</button>
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

// =====================================================================
// 학부모 화면
// =====================================================================
export function ParentView({ studentsList, broadcast, guessCount, comments, showModal, serverAction, autoChildName }) {
  const [childName, setChildName] = useState(autoChildName || '');
  const [isEntered, setIsEntered] = useState(!!autoChildName);
  // 자녀 이름은 교사가 등록한 학생 명단과 상관없이 자유롭게 입력해 입장합니다. (댓글에 적히는 이름으로만 쓰여요.)
  const handleEnter = (e) => {
    e.preventDefault();
    const name = childName.trim();
    if (!name) return showModal('알림', '자녀 이름을 입력해주세요.', true);
    setChildName(name);
    setIsEntered(true);
  };

  if (!isEntered) {
    return (
      <div className="flex justify-center py-12 animate-fade-in-up">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-green-100 text-center max-w-sm w-full">
          <h2 className="text-xl font-bold mb-6">학부모 입장</h2>
          <form onSubmit={handleEnter} className="flex flex-col gap-3">
            <input type="text" value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="자녀 이름" className="px-4 py-3 bg-gray-50 border rounded-xl text-center font-bold" autoFocus />
            <button type="submit" className="py-3 bg-green-500 text-white rounded-xl font-bold">입장하기</button>
          </form>
        </div>
      </div>
    );
  }
  if (broadcast.phase !== 'idle') {
    return (
      <BroadcastView
        viewerRole="parent" broadcast={broadcast} students={studentsList} guessCount={guessCount} comments={comments}
        showModal={showModal} serverAction={serverAction} fixedWriterName={`${childName} 학부모님`}
      />
    );
  }
  return (
    <div className="flex flex-col items-center py-16 text-center animate-fade-in-up">
      <div className="w-20 h-20 bg-green-50 text-green-400 rounded-full flex justify-center items-center mb-6 animate-pulse-soft"><IconPlay /></div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">방송 대기 중입니다</h2>
      <p className="text-gray-500">선생님이 방송을 시작하면 자동으로 나타납니다.</p>
    </div>
  );
}
