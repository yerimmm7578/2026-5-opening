import { useState, useEffect, memo } from 'react';
import { IconSparkles, IconHeart, IconSend, IconTrash } from './icons.jsx';
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
const GuessPhase = ({ viewerRole, summary, students, guessCount, myGuessId, onSubmitGuess, sending, answerStudent }) => {
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

      {viewerRole === 'parent' && (
        <div className="bg-green-50/70 border border-green-100 rounded-2xl p-5 text-center">
          <p className="font-bold text-green-800 mb-1">👨‍👩‍👧 우리 아이들이 이 친구가 누구인지 고르고 있어요</p>
          <p className="text-xs text-green-600 mb-3">정답이 발표되면 이곳에 결과와 응원 댓글창이 열려요.</p>
          <ProgressBar value={guessCount} max={students.length} color="bg-green-500" />
          <p className="text-xs text-gray-500 mt-2">제출한 친구 {guessCount} / {students.length}명</p>
        </div>
      )}

      {viewerRole === 'teacher' && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
          <p className="text-sm font-bold text-gray-700 mb-2">
            🔒 정답 (선생님 화면에서만 보여요): <span className="text-orange-600 text-lg">{answerStudent ? answerStudent.name : '확인 중...'}</span>
          </p>
          <ProgressBar value={guessCount} max={students.length} color="bg-orange-500" />
          <p className="text-xs text-gray-500 mt-2">제출한 친구 {guessCount} / {students.length}명</p>
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

// ---------- 발표 후 댓글 ----------
export const LiveCommentSection = memo(({ student, comments, serverAction, showModal, promptMessage, promptColorClass, fixedWriterName, onDelete }) => {
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (sending) return;
    if (!commentText.trim()) return showModal('알림', '댓글 내용을 입력해주세요.');
    if (checkProfanity(commentText)) return showModal('경고', '바르고 고운 말을 써주세요!', true);
    setSending(true);
    try {
      await serverAction('addComment', { writerName: fixedWriterName, targetStudentId: student.id, text: commentText.trim() });
      setCommentText('');
    } catch (err) {
      showModal('오류', errorMessage(err, '댓글 등록에 실패했어요. 다시 시도해주세요.'), true);
    }
    setSending(false);
  };

  return (
    <div className="mt-6 bg-white p-5 rounded-2xl shadow-inner border border-gray-100">
      <div className={`p-3 rounded-xl mb-5 text-center text-sm font-bold ${promptColorClass}`}>{promptMessage}</div>
      <form onSubmit={handleAddComment} className="flex flex-col md:flex-row gap-2 mb-6">
        <div className="flex items-center justify-center px-4 py-2 bg-gray-100 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 min-w-max shadow-inner">{fixedWriterName}</div>
        <div className="flex-1 flex gap-2">
          <input type="text" maxLength={200} placeholder={`${student.name} 친구에게 따뜻한 한마디...`} value={commentText} onChange={(e) => setCommentText(e.target.value)} className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" required />
          <button type="submit" disabled={sending} className="px-4 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition flex items-center justify-center shadow-md disabled:opacity-60"><IconSend /></button>
        </div>
      </form>
      <div className="space-y-3 max-h-72 overflow-y-auto pr-2 no-scrollbar">
        {comments.map((c) => (
          <div key={c.id} className="bg-gray-50 p-3 rounded-xl rounded-tl-none border border-gray-100">
            <div className="flex items-baseline justify-between mb-1 gap-2">
              <span className="font-bold text-sm text-gray-800">{c.writerName}</span>
              <span className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {onDelete && <button onClick={() => onDelete(c)} title="댓글 삭제" className="text-red-400 hover:text-red-600 p-1 bg-red-50 rounded"><IconTrash /></button>}
              </span>
            </div>
            <p className="text-gray-700 text-sm">{c.text}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="text-center text-sm text-gray-400 py-4">아직 등록된 댓글이 없습니다. 첫 응원을 남겨주세요!</p>}
      </div>
    </div>
  );
});

// ---------- 방송 화면 전체 (학생 / 학부모 / 교사 공용) ----------
export const BroadcastView = memo(({
  viewerRole, broadcast, students, guessCount, comments, showModal, serverAction,
  fixedWriterName, myGuessId, onSubmitGuess, sending, answerId, onDeleteComment,
}) => {
  const isRevealed = broadcast.phase === 'revealed';
  const revealedStudent = isRevealed ? students.find((s) => s.id === broadcast.revealedStudentId) : null;
  const answerStudent = answerId ? students.find((s) => s.id === answerId) : null;

  let headerBg = 'bg-orange-500', promptMsg = '💌 발표된 친구에게 칭찬·응원 한마디를 남겨주세요!', promptColor = 'bg-blue-50 text-blue-700 border-blue-200';
  if (viewerRole === 'parent') { headerBg = 'bg-green-500'; promptMsg = '💖 따뜻한 응원의 댓글을 남겨주세요!'; promptColor = 'bg-pink-50 text-pink-700 border-pink-200'; }
  else if (viewerRole === 'teacher') { headerBg = 'bg-gray-800'; promptMsg = '👨‍🏫 선생님도 따뜻한 격려를 남겨주세요!'; promptColor = 'bg-gray-50 text-gray-700 border-gray-200'; }

  return (
    <div>
      <div className={`${headerBg} text-white p-6 rounded-t-3xl text-center shadow-lg relative`}>
        <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-bold mb-3 animate-pulse-soft">🔴 라이브 방송 중</span>
        <h2 className="text-3xl font-black mb-2">
          {isRevealed && revealedStudent ? `${revealedStudent.name} 친구를 칭찬해요!` : '이 친구는 누구일까요? 🕵️'}
        </h2>
      </div>
      <div className="bg-white p-6 md:p-8 rounded-b-3xl shadow-xl border-x border-b border-gray-200">
        {broadcast.phase === 'guessing' && (
          <GuessPhase
            viewerRole={viewerRole} summary={broadcast.summary} students={students} guessCount={guessCount}
            myGuessId={myGuessId} onSubmitGuess={onSubmitGuess} sending={sending} answerStudent={answerStudent}
          />
        )}
        {isRevealed && revealedStudent && (
          <>
            <RevealPhase student={revealedStudent} summary={broadcast.summary} result={broadcast.result} myGuessId={myGuessId} viewerRole={viewerRole} showModal={showModal} />
            <LiveCommentSection student={revealedStudent} comments={comments} serverAction={serverAction} showModal={showModal} promptMessage={promptMsg} promptColorClass={promptColor} fixedWriterName={fixedWriterName} onDelete={onDeleteComment} />
          </>
        )}
        {isRevealed && !revealedStudent && <p className="text-center text-gray-500 py-10">발표된 친구를 찾는 중입니다...</p>}
      </div>
    </div>
  );
});
