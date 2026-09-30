import { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from './components.jsx';
import { HomeView, TeacherView, StudentView } from './views.jsx';
import { fetchState, callAction } from './api.js';

const IDLE_PUBLIC = { phase: 'idle', roundId: 0, summary: '', revealedStudentId: null, result: null };
const POLL_MS = 3000;

// preview: 미리보기 화면에서만 쓰는 옵션 ({ view, studentId, childName })
export default function App({ preview } = {}) {
  const [viewMode, setViewMode] = useState((preview && preview.view) || 'home');
  const [modalState, setModalState] = useState({ isOpen: false, title: '', message: '', isError: false });
  const [isLoading, setIsLoading] = useState(true);
  const [connError, setConnError] = useState(false);
  const [studentsList, setStudentsList] = useState([]);
  const [broadcast, setBroadcast] = useState(IDLE_PUBLIC);
  const [guessCount, setGuessCount] = useState(0);
  const [feelingsOpen, setFeelingsOpen] = useState(false);
  const [feelings, setFeelings] = useState([]);

  const lastJson = useRef('');      // 직전 데이터 (같으면 화면을 다시 그리지 않음)
  const actionVersion = useRef(0);  // 내가 방금 한 동작보다 오래된 조회 결과는 버리기 위한 표시
  const fetching = useRef(false);
  const failCount = useRef(0);      // 연속 실패 횟수 (한 번 실패로 바로 배너를 띄우지 않기 위함)

  const showModal = useCallback((title, message, isError = false) => setModalState({ isOpen: true, title, message, isError }), []);
  const closeModal = () => setModalState({ isOpen: false, title: '', message: '', isError: false });

  const applyState = useCallback((data) => {
    if (!data || !Array.isArray(data.students)) return;
    const students = [...data.students].sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));
    const fOpen = !!data.feelingsOpen;
    const fList = Array.isArray(data.feelings) ? [...data.feelings].sort() : [];
    const bc = data.broadcast || IDLE_PUBLIC;
    const json = JSON.stringify([students, bc, data.guessCount || 0, fOpen, fList]);
    if (json === lastJson.current) return;
    lastJson.current = json;
    setStudentsList(students);
    setBroadcast(bc);
    setGuessCount(data.guessCount || 0);
    setFeelingsOpen(fOpen);
    setFeelings(fList);
  }, []);

  const poll = useCallback(async () => {
    if (fetching.current || document.hidden) return;
    fetching.current = true;
    const startedAt = actionVersion.current;
    try {
      const data = await fetchState();
      if (actionVersion.current === startedAt) applyState(data);
      failCount.current = 0;
      setConnError(false);
    } catch (e) {
      // 한 번 실패했다고 바로 배너를 띄우지 않고, 연속으로 여러 번 실패할 때만 보여줍니다.
      failCount.current += 1;
      if (failCount.current >= 3) setConnError(true);
    } finally {
      fetching.current = false;
      setIsLoading(false);
    }
  }, [applyState]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [poll]);

  // 서버에 동작을 요청하고, 돌려받은 최신 데이터를 바로 화면에 반영. 반환값은 동작별 결과(data)
  const serverAction = useCallback(async (action, payload) => {
    const res = await callAction(action, payload);
    actionVersion.current += 1;
    applyState(res.state);
    return res.data;
  }, [applyState]);

  const shared = { studentsList, broadcast, guessCount, feelingsOpen, feelings, showModal, serverAction };

  const renderView = () => {
    switch (viewMode) {
      case 'teacher': return <TeacherView {...shared} />;
      case 'student': return <StudentView {...shared} autoLoginId={preview && preview.studentId} />;
      default: return <HomeView setViewMode={setViewMode} showModal={showModal} />;
    }
  };

  return (
    <div className="min-h-screen pb-10">
      {connError && (
        <div className="bg-red-500 text-white text-center text-sm font-bold py-2 px-4">
          인터넷 연결이 불안정해요. 다시 연결하는 중입니다...
        </div>
      )}
      <header className="bg-white/90 backdrop-blur-md shadow-sm sticky top-0 z-40 px-6 py-4 flex justify-between items-center border-b border-orange-100">
        <h1 className={`text-2xl font-black text-orange-500 flex items-center gap-2 ${preview ? '' : 'cursor-pointer'}`} onClick={() => { if (!preview) setViewMode('home'); }}>🌻 우리반 칭찬릴레이</h1>
        <div className="flex gap-3 items-center">
          {viewMode !== 'home' && !preview && <button onClick={() => setViewMode('home')} className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg text-sm font-bold">← 처음으로</button>}
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-12 h-12 border-4 border-orange-300 border-t-orange-600 rounded-full animate-spin"></div></div>
        ) : renderView()}
      </main>
      <Modal isOpen={modalState.isOpen} onClose={closeModal} title={modalState.title} message={modalState.message} isError={modalState.isError} />
    </div>
  );
}
