import { useState, useEffect, memo } from 'react';
import { IconSparkles, IconSend } from './icons.jsx';
import { checkProfanity, errorMessage } from './utils.js';

export const Modal = ({ isOpen, onClose, title, message, isError }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in-up">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border-2 border-orange-100">
        {title && (
          <h3 className={`text-xl font-bold mb-2 flex items-center gap-2 ${isError ? 'text-red-600' : 'text-gray-800'}`}>
            <span>{isError ? '🚨' : '✨'}</span> {title}
          </h3>
        )}
        {message && <p className="text-gray-600 mb-4 text-sm leading-relaxed whitespace-pre-line">{message}</p>}
        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className={`px-5 py-2 text-white font-semibold rounded-xl transition-all shadow-md ${isError ? 'bg-red-500 hover:bg-red-600' : 'bg-orange-500 hover:bg-orange-600'}`}>확인</button>
        </div>
      </div>
    </div>
  );
};

// AI 요약 카드
const SummaryCard = ({ summary, student }) => (
  <div className="mb-6 bg-gradient-to-br from-purple-50 to-indigo-50 p-5 rounded-2xl border border-purple-200 relative overflow-hidden">
    <div className="absolute top-0 right-0 p-3 opacity-20"><IconSparkles /></div>
    <h3 className="font-bold text-purple-800 mb-4 flex items-center gap-2">
      <IconSparkles /> {student ? `AI가 정리한 ${student.name} 친구의 모습` : 'AI가 친구들의 칭찬을 읽고 정리했어요'}
    </h3>
    <div className="flex flex-col gap-4">
      <div className="flex-1 bg-white/70 backdrop-blur-sm p-4 rounded-xl border border-purple-100 shadow-sm text-gray-800 text-base leading-relaxed font-medium">
        "{summary}"
      </div>
    </div>
  </div>
);

const ProgressBar = ({ value, max, color = 'bg-blue-500' }) => (
  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
    <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }}></div>
  </div>
);

// ---------- 맞히기 진행 화면 ----------
const GuessPhase = ({ viewerRole, summary, students, guessCount, myGuessId, onSubmitGuess, sending, onReveal, onCancel, revealing }) => {
  const [selected, setSelected] = useState(myGuessId || null);
  useEffect(() => { if (myGuessId) setSelected(myGuessId); }, [myGuessId]);
  const nameOf = (id) => (students.find((s) => s.id === id) || {}).name || '';

  return (
    <div className="space-y-5">
      <SummaryCard summary={summary} />

      {viewerRole === 'student' && (
        <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 sm:p-5">
          <h3 className="font-bold text-blue-800 mb-1">🕵️ 이 친구는 누구일까요?</h3>
          <p className="text-xs text-blue-600 mb-4">우리반 친구 중 한 명을 골라 주세요.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {students.map((s) => (
              <button
                key={s.id} type="button" onClick={() => setSelected(s.id)}
                className={`px-3 py-3 rounded-xl border text-sm font-bold transition ${selected === s.id ? 'bg-blue-500 text-white border-blue-500 ring-2 ring-blue-200 shadow-md' : 'bg-white text-gray-700 border-gray-200 hover:bg-blue-50'}`}
              >
                <span className={`text-xs mr-1 ${selected === s.id ? 'text-blue-100' : 'text-gray-400'}`}>{s.number}</span>{s.name}
              </button>
            ))}
          </div>
          {myGuessId && (
            <p className="text-sm font-bold text-green-600 mb-3 text-center">✅ 제출했어요! (내 선택: {nameOf(myGuessId)}) — 정답 발표를 기다려요</p>
          )}
          <button
            onClick={() => selected && onSubmitGuess(selected)}
            disabled={!selected || sending || selected === myGuessId}
            className="w-full py-3 bg-blue-500 text-white rounded-xl font-bold shadow-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {sending ? '제출 중...' : myGuessId ? '다른 친구로 다시 제출하기' : '이 친구로 정할래요!'}
          </button>
        </div>
      )}

      {viewerRole === 'teacher' && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-6 text-center space-y-4">
          <p className="text-base font-bold text-orange-800">🤔 이 친구는 누구일까요? 생각이 정리되면 정답을 확인해 보세요!</p>
          <button
            onClick={onReveal} disabled={revealing}
            className="px-10 py-4 bg-orange-500 text-white rounded-2xl text-xl font-black shadow-lg hover:bg-orange-600 disabled:opacity-60 transition"
          >
            {revealing ? '확인하는 중...' : '🎉 정답 확인'}
          </button>
          <div>
            <ProgressBar value={guessCount} max={students.length} color="bg-orange-400" />
            <p className="text-xs text-gray-500 mt-2">학생 기기에서 고른 친구 {guessCount} / {students.length}명</p>
          </div>
          <button onClick={onCancel} className="text-xs text-gray-400 underline hover:text-gray-600">다른 물음표 상자 고르기 (취소)</button>
        </div>
      )}
    </div>
  );
};

// ---------- 정답 발표 화면 ----------
const RevealPhase = ({ student, summary, result, myGuessId, viewerRole, showModal }) => {
  const r = result || { percent: 0, correct: 0, participants: 0, total: 0 };

  return (
    <div>
      <div id="capture-area" className="p-4 -mx-4 bg-white rounded-xl space-y-5">
        <div className="text-center">
          <p className="text-sm font-bold text-gray-500 mb-1">정답은 바로...</p>
          <p className="text-4xl sm:text-5xl font-black text-orange-500">🎉 {student.name} 🎉</p>
        </div>
        <SummaryCard summary={summary} student={student} />

        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 text-center">
          <p className="text-sm font-bold text-orange-700 mb-1">우리반 친구들이 맞힌 비율</p>
          <p className="text-6xl font-black text-orange-500 mb-3">{r.percent}%</p>
          <div className="h-4 bg-white rounded-full overflow-hidden border border-orange-100">
            <div className="h-full bg-gradient-to-r from-orange-400 to-pink-500 transition-all duration-1000" style={{ width: `${r.percent}%` }}></div>
          </div>
          <p className="text-sm text-gray-700 mt-3 font-medium">참여한 친구 <b>{r.participants}</b>명 중 <b>{r.correct}</b>명이 맞혔어요!</p>
          <p className="text-xs text-gray-400 mt-1">우리반 {r.total}명 중 {r.participants}명 참여</p>
        </div>

        {viewerRole === 'student' && (
          <p className={`text-center text-sm font-bold py-3 rounded-xl ${myGuessId === student.id ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
            {myGuessId === student.id ? '🎉 내가 고른 친구가 정답이에요!' : myGuessId ? '아쉬워요! 다음 기회에 꼭 맞혀봐요 💪' : '이번에는 참여하지 못했어요.'}
          </p>
        )}
      </div>
    </div>
  );
};

// ---------- 방송 화면 전체 (학생 / 교사 공용) ----------
export const BroadcastView = memo(({
  viewerRole, broadcast, students, guessCount, showModal,
  myGuessId, onSubmitGuess, sending, onReveal, onCancel, onNext, revealing,
}) => {
  const isRevealed = broadcast.phase === 'revealed';
  const revealedStudent = isRevealed ? students.find((s) => s.id === broadcast.revealedStudentId) : null;
  const headerBg = viewerRole === 'teacher' ? 'bg-gray-800' : 'bg-orange-500';

  return (
    <div>
      <div className={`${headerBg} text-white p-6 rounded-t-3xl text-center shadow-lg relative`}>
        <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-bold mb-3 animate-pulse-soft">
          {viewerRole === 'teacher' ? '🎯 활동2 진행 중' : '🔴 라이브 방송 중'}
        </span>
        <h2 className="text-3xl font-black mb-2">
          {isRevealed && revealedStudent ? `${revealedStudent.name} 친구를 칭찬해요!` : '이 친구는 누구일까요? 🕵️'}
        </h2>
      </div>
      <div className="bg-white p-6 md:p-8 rounded-b-3xl shadow-xl border-x border-b border-gray-200">
        {broadcast.phase === 'guessing' && (
          <GuessPhase
            viewerRole={viewerRole} summary={broadcast.summary} students={students} guessCount={guessCount}
            myGuessId={myGuessId} onSubmitGuess={onSubmitGuess} sending={sending}
            onReveal={onReveal} onCancel={onCancel} revealing={revealing}
          />
        )}
        {isRevealed && revealedStudent && (
          <>
            <RevealPhase student={revealedStudent} summary={broadcast.summary} result={broadcast.result} myGuessId={myGuessId} viewerRole={viewerRole} showModal={showModal} />
            {viewerRole === 'teacher' && onNext && (
              <div className="mt-6 text-center">
                <button onClick={onNext} className="px-8 py-3 bg-gray-800 text-white rounded-2xl text-lg font-black shadow-lg hover:bg-gray-900 transition">다음 친구 고르기 ➜</button>
              </div>
            )}
          </>
        )}
        {isRevealed && !revealedStudent && <p className="text-center text-gray-500 py-10">발표된 친구를 찾는 중입니다...</p>}
      </div>
    </div>
  );
});

// =====================================================================
// 활동3: 워드클라우드 / 기분 쓰기
// =====================================================================
const CLOUD_COLORS = ['#f97316', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#eab308', '#ef4444', '#14b8a6'];
const hashStr = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; };

// 같은 말이 여러 번 나오면 더 크게 보여주는 워드클라우드
export const WordCloud = memo(({ words }) => {
  const counts = {};
  (words || []).forEach((w) => { const t = String(w).trim(); if (t) counts[t] = (counts[t] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => hashStr(a[0]) - hashStr(b[0])); // 큰 글자가 한쪽에 몰리지 않게 섞기
  const max = Math.max(1, ...entries.map(([, c]) => c));
  if (entries.length === 0) {
    return <p className="text-center text-gray-400 py-12 text-sm">아직 올라온 기분이 없어요. 첫 번째 친구를 기다리는 중...</p>;
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-2 py-6 min-h-[14rem]">
      {entries.map(([text, count]) => {
        const size = max === 1 ? 2 : 1.3 + ((count - 1) / (max - 1)) * 2.7; // rem
        return (
          <span
            key={text} title={`${count}명`}
            className="font-black leading-tight animate-fade-in-up"
            style={{ fontSize: `${size}rem`, color: CLOUD_COLORS[hashStr(text) % CLOUD_COLORS.length] }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
});

export const FEELING_QUESTION = '칭찬을 듣고 난 후 나의 기분은 어떤가요?';

// 학생 기기: 기분 쓰기 + (작성 후) 친구들의 기분 워드클라우드
export const FeelingView = ({ studentName, feelings, myFeeling, onSubmit, sending }) => {
  const [text, setText] = useState(myFeeling || '');
  useEffect(() => { if (myFeeling) setText(myFeeling); }, [myFeeling]);
  const submit = (e) => { e.preventDefault(); if (text.trim() && !sending) onSubmit(text.trim()); };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="bg-gradient-to-br from-pink-500 to-orange-400 text-white p-6 rounded-3xl text-center shadow-lg">
        <p className="text-sm font-bold opacity-90 mb-2">💗 {studentName}, 이제 마음을 나눠봐요</p>
        <h2 className="text-2xl sm:text-3xl font-black leading-snug">{FEELING_QUESTION}</h2>
      </div>

      <form onSubmit={submit} className="bg-white p-5 rounded-2xl shadow-sm border border-pink-100 space-y-3">
        <p className="text-xs text-gray-500">기분을 한 단어나 짧은 말로 적어주세요. (예: 뿌듯해요, 기분 좋아요) — 이름은 보이지 않아요.</p>
        <div className="flex gap-2">
          <input
            type="text" value={text} maxLength={20} onChange={(e) => setText(e.target.value)}
            placeholder="나의 기분을 적어보세요" className="flex-1 px-4 py-3 bg-gray-50 border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-pink-300" required
          />
          <button type="submit" disabled={sending || !text.trim()} className="px-5 bg-pink-500 text-white rounded-xl font-bold flex items-center gap-1 disabled:opacity-60 shadow-md">
            <IconSend /> {sending ? '...' : myFeeling ? '바꾸기' : '올리기'}
          </button>
        </div>
        {myFeeling && <p className="text-sm font-bold text-green-600">✅ 내 기분: {myFeeling}</p>}
      </form>

      <div className="bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50 rounded-3xl border border-pink-100 p-4">
        <h3 className="text-center font-bold text-gray-700 mb-1">☁️ 우리반 친구들의 기분</h3>
        {myFeeling
          ? <WordCloud words={feelings} />
          : <p className="text-center text-gray-400 py-12 text-sm">내 기분을 올리면 친구들의 기분을 볼 수 있어요!</p>}
      </div>
    </div>
  );
};
