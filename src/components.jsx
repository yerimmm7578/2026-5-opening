import { useState, useEffect, useRef, memo } from 'react';
import { IconSparkles, IconSend } from './icons.jsx';
import { checkProfanity, errorMessage, STRENGTHS, strengthColor } from './utils.js';

export const Modal = ({ isOpen, onClose, title, message, isError }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in-up">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border-2 border-orange-100">
        {title && (
          <h3 className={`text-xl font-bold mb-2 flex items-center gap-2 ${isError ? 'text-red-600' : 'text-gray-800'}`}>
            {title}
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

// 강점 칩 (예: 배려 ×3)
export const StrengthChip = ({ id, count, big }) => (
  <span className={`inline-flex items-center gap-1 rounded-full font-bold text-white ${big ? 'px-4 py-2 text-base' : 'px-3 py-1 text-sm'}`} style={{ backgroundColor: strengthColor(id) }}>
    {id}{count > 1 && <span className="opacity-80 text-xs">×{count}</span>}
  </span>
);

// 힌트 1: 친구들이 고른 강점 키워드
const KeywordCard = ({ keywords }) => (
  <div className="mb-4 bg-slate-50 border border-slate-200 p-5 rounded-2xl">
    <p className="text-xs font-bold text-slate-500 mb-3">힌트 1 · 친구들이 이 친구에게서 찾은 강점</p>
    <div className="flex flex-wrap gap-2">{keywords.map((kw) => <StrengthChip key={kw.name} id={kw.name} count={kw.count} big />)}</div>
  </div>
);

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
const GuessPhase = ({ viewerRole, summary, keywords, hintLevel, students, guessCount, myGuessId, onSubmitGuess, sending, onReveal, onCancel, onHint, revealing }) => {
  const [selected, setSelected] = useState(myGuessId || null);
  useEffect(() => { if (myGuessId) setSelected(myGuessId); }, [myGuessId]);
  const nameOf = (id) => (students.find((s) => s.id === id) || {}).name || '';

  return (
    <div className="space-y-5">
      {keywords && keywords.length > 0 && <KeywordCard keywords={keywords} />}
      {hintLevel >= 2
        ? <SummaryCard summary={summary} />
        : (
          <div className="mb-6 border-2 border-dashed border-slate-300 rounded-2xl py-8 text-center text-slate-400 text-sm font-bold">
            힌트 2 (AI 요약)는 아직 열리지 않았어요. 힌트 1을 보고 먼저 추리해 보세요.
          </div>
        )}

      {viewerRole === 'student' && (
        <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 sm:p-5">
          <h3 className="font-bold text-blue-800 mb-1">이 친구는 누구일까요?</h3>
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
          <p className="text-base font-bold text-orange-800">근거를 들어 추리해 보세요. 정리가 되면 정답을 확인해요!</p>
          <div className="flex flex-wrap justify-center gap-3">
            {hintLevel < 2 && (
              <button onClick={onHint} className="px-8 py-4 bg-white border-2 border-orange-400 text-orange-700 rounded-2xl text-lg font-black shadow-sm hover:bg-orange-100 transition">힌트 2 열기 (AI 요약)</button>
            )}
            <button
              onClick={onReveal} disabled={revealing}
              className="px-10 py-4 bg-orange-500 text-white rounded-2xl text-xl font-black shadow-lg hover:bg-orange-600 disabled:opacity-60 transition"
            >
              {revealing ? '확인하는 중...' : '정답 확인'}
            </button>
          </div>
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
const RevealPhase = ({ student, summary, keywords, myGuessId, viewerRole }) => {
  return (
    <div>
      <div id="capture-area" className="p-4 -mx-4 bg-white rounded-xl space-y-5">
        <div className="text-center">
          <p className="text-sm font-bold text-gray-500 mb-1">정답은 바로...</p>
          <p className="text-4xl sm:text-5xl font-black text-orange-500">{student.name} </p>
        </div>
        {keywords && keywords.length > 0 && <KeywordCard keywords={keywords} />}
        <SummaryCard summary={summary} student={student} />

        {viewerRole === 'student' && (
          <p className={`text-center text-sm font-bold py-3 rounded-xl ${myGuessId === student.id ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
            {myGuessId === student.id ? '내가 고른 친구가 정답이에요!' : myGuessId ? '아쉬워요! 다음 기회에 꼭 맞혀봐요 ' : '이번에는 참여하지 못했어요.'}
          </p>
        )}
      </div>
    </div>
  );
};

// ---------- 방송 화면 전체 (학생 / 교사 공용) ----------
export const BroadcastView = memo(({
  viewerRole, broadcast, students, guessCount, showModal,
  myGuessId, onSubmitGuess, sending, onReveal, onCancel, onNext, onHint, revealing,
}) => {
  const isRevealed = broadcast.phase === 'revealed';
  const revealedStudent = isRevealed ? students.find((s) => s.id === broadcast.revealedStudentId) : null;
  const headerBg = viewerRole === 'teacher' ? 'bg-gray-800' : 'bg-orange-500';

  return (
    <div>
      <div className={`${headerBg} text-white p-6 rounded-t-3xl text-center shadow-lg relative`}>
        <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-bold mb-3 animate-pulse-soft">
          {viewerRole === 'teacher' ? '활동2 진행 중' : '활동2 · 친구 맞히기'}
        </span>
        <h2 className="text-3xl font-black mb-2">
          {isRevealed && revealedStudent ? `${revealedStudent.name} 친구를 칭찬해요!` : '이 친구는 누구일까요? '}
        </h2>
      </div>
      <div className="bg-white p-6 md:p-8 rounded-b-3xl shadow-xl border-x border-b border-gray-200">
        {broadcast.phase === 'guessing' && (
          <GuessPhase
            viewerRole={viewerRole} summary={broadcast.summary} keywords={broadcast.keywords} hintLevel={broadcast.hintLevel || 2} students={students} guessCount={guessCount}
            myGuessId={myGuessId} onSubmitGuess={onSubmitGuess} sending={sending}
            onReveal={onReveal} onCancel={onCancel} onHint={onHint} revealing={revealing}
          />
        )}
        {isRevealed && revealedStudent && (
          <>
            <RevealPhase student={revealedStudent} summary={broadcast.summary} keywords={broadcast.keywords} myGuessId={myGuessId} viewerRole={viewerRole} />
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

// 학생 기기: 기분 쓰기 + (작성 후) 친구들의 '감정 단어' 워드클라우드
export const FeelingView = ({ studentName, feelings, myFeeling, onSubmit, sending }) => {
  const [text, setText] = useState(myFeeling ? myFeeling.text : '');
  useEffect(() => { if (myFeeling && myFeeling.text) setText(myFeeling.text); }, [myFeeling && myFeeling.text]);
  const submit = (e) => { e.preventDefault(); if (text.trim() && !sending) onSubmit(text.trim()); };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="bg-gradient-to-br from-pink-500 to-orange-400 text-white p-6 rounded-3xl text-center shadow-lg">
        <p className="text-sm font-bold opacity-90 mb-2">{studentName}, 이제 마음을 나눠봐요</p>
        <h2 className="text-2xl sm:text-3xl font-black leading-snug">{FEELING_QUESTION}</h2>
      </div>

      <form onSubmit={submit} className="bg-white p-5 rounded-2xl shadow-sm border border-pink-100 space-y-3">
        <p className="text-xs text-gray-500">내 기분을 자유롭게 적어주세요. (예: 칭찬을 들으니까 너무 뿌듯하고 기뻤어요) — 화면에는 <b>기분을 나타내는 말</b>만 이름 없이 보여요.</p>
        <textarea
          value={text} maxLength={100} rows="3" onChange={(e) => setText(e.target.value)}
          placeholder="나의 기분을 적어보세요" className="w-full px-4 py-3 bg-gray-50 border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-pink-300" required
        />
        <button type="submit" disabled={sending || !text.trim()} className="w-full py-3 bg-pink-500 text-white rounded-xl font-bold flex items-center justify-center gap-1 disabled:opacity-60 shadow-md">
          <IconSend /> {sending ? '기분을 읽는 중...' : myFeeling ? '바꿔서 올리기' : '내 기분 올리기'}
        </button>
        {myFeeling && myFeeling.words && myFeeling.words.length > 0 && (
          <p className="text-sm font-bold text-green-600">✅ 내 기분 단어: {myFeeling.words.join(', ')}</p>
        )}
      </form>

      <div className="bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50 rounded-3xl border border-pink-100 p-4">
        <h3 className="text-center font-bold text-gray-700 mb-1">우리반 친구들의 기분</h3>
        {myFeeling
          ? <WordCloud words={feelings} />
          : <p className="text-center text-gray-400 py-12 text-sm">내 기분을 올리면 친구들의 기분을 볼 수 있어요!</p>}
      </div>
    </div>
  );
};


// =====================================================================
// 활동4: 나 vs 친구가 본 나
// =====================================================================
// 학급 전체 강점 분포 (교사용)
export const ClassStrengthChart = ({ totals }) => {
  const max = Math.max(1, ...STRENGTHS.map((x) => (totals && totals[x.id]) || 0));
  return (
    <div className="space-y-2">
      {STRENGTHS.map((x) => {
        const n = (totals && totals[x.id]) || 0;
        return (
          <div key={x.id} className="flex items-center gap-3">
            <span className="w-14 text-sm font-bold text-gray-700 shrink-0">{x.id}</span>
            <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(n / max) * 100}%`, backgroundColor: x.color }}></div>
            </div>
            <span className="w-10 text-right text-sm font-bold text-gray-600">{n}</span>
          </div>
        );
      })}
    </div>
  );
};

// 학생 기기: 내가 예상한 강점 vs 친구들이 찾은 강점 + 성찰 + 강점 카드 저장
export const StrengthReport = ({ student, report, onSaveReflection, saving, showModal }) => {
  const cardRef = useRef(null);
  const [insight, setInsight] = useState('');
  const [pledge, setPledge] = useState('');
  const [downloading, setDownloading] = useState(false);
  const saved = report && report.reflection;
  useEffect(() => {
    if (saved) { setInsight(saved.insight); setPledge(saved.pledge); }
  }, [saved && saved.insight, saved && saved.pledge]);

  if (!report) return <div className="flex justify-center py-16"><div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>;

  const { received, total, self } = report;
  const max = Math.max(1, ...STRENGTHS.map((x) => received[x.id] || 0));
  const byCount = [...STRENGTHS].sort((a, b) => (received[b.id] || 0) - (received[a.id] || 0));
  const top = byCount.filter((x) => received[x.id] > 0).slice(0, 3);
  const hidden = byCount.filter((x) => received[x.id] > 0 && !self.includes(x.id)).slice(0, 2);
  const fewer = self.filter((id) => !received[id]);
  const matched = self.filter((id) => received[id] > 0);
  const names = (list) => list.map((x) => (typeof x === 'string' ? x : x.id)).join(', ');

  const submit = (e) => { e.preventDefault(); if (insight.trim() && pledge.trim() && !saving) onSaveReflection(insight.trim(), pledge.trim()); };

  const downloadCard = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${student.name}_강점카드.png`;
      a.click();
    } catch (e) {
      showModal('오류', '이미지를 저장하지 못했어요. 화면을 캡처해서 저장해 주세요.', true);
    }
    setDownloading(false);
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="bg-slate-800 text-white p-6 rounded-3xl text-center shadow-lg">
        <p className="text-sm font-bold opacity-80 mb-2">활동4 · {student.name}</p>
        <h2 className="text-2xl sm:text-3xl font-black leading-snug">내가 아는 나 vs 친구가 본 나</h2>
      </div>

      {total === 0 ? (
        <div className="bg-white p-8 rounded-2xl border text-center text-gray-500 text-sm">아직 친구들에게 받은 칭찬이 없어요.</div>
      ) : (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-indigo-100">
          <h3 className="font-bold text-gray-800 mb-1">친구들이 찾아 준 나의 강점 <span className="text-gray-400 text-sm font-normal">(칭찬 {total}개)</span></h3>
          <p className="text-xs text-gray-500 mb-4">테두리 표시는 활동1에서 내가 예상한 장점이에요.</p>
          <div className="space-y-2">
            {STRENGTHS.map((x) => {
              const n = received[x.id] || 0;
              const mine = self.includes(x.id);
              return (
                <div key={x.id} className="flex items-center gap-3">
                  <span className={`w-16 shrink-0 text-center text-sm font-bold rounded-lg py-1 ${mine ? 'border-2 border-dashed border-slate-500 text-slate-800' : 'text-gray-600'}`}>{x.id}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(n / max) * 100}%`, backgroundColor: x.color }}></div>
                  </div>
                  <span className="w-8 text-right text-sm font-bold text-gray-600">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-emerald-700 mb-1">내가 몰랐던 내 장점</p>
            <p className="font-black text-emerald-900">{hidden.length ? names(hidden) : '없어요'}</p>
            <p className="text-[11px] text-emerald-700 mt-1">친구들은 찾았지만 내가 고르지 않았어요.</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-amber-700 mb-1">생각보다 적게 나온 장점</p>
            <p className="font-black text-amber-900">{self.length === 0 ? '비교할 수 없어요' : fewer.length ? names(fewer) : '없어요'}</p>
            <p className="text-[11px] text-amber-700 mt-1">내가 골랐지만 친구들은 아직 못 봤어요.</p>
          </div>
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-sky-700 mb-1">나도 알고 친구도 아는 장점</p>
            <p className="font-black text-sky-900">{matched.length ? names(matched) : '없어요'}</p>
            <p className="text-[11px] text-sky-700 mt-1">내 예상과 친구들의 생각이 같아요.</p>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="bg-white p-5 rounded-2xl shadow-sm border border-indigo-100 space-y-4">
        <h3 className="font-bold text-gray-800">돌아보기</h3>
        <div>
          <label className="text-sm font-bold text-gray-700">이 결과를 보고 새롭게 알게 된 점</label>
          <textarea value={insight} maxLength={120} rows="2" onChange={(e) => setInsight(e.target.value)} placeholder="예: 내가 배려를 잘하는 사람이라고 친구들이 생각한다는 걸 알았다." className="w-full mt-1 p-3 border rounded-xl text-sm" required />
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700">이번 주에 내가 실천할 것</label>
          <textarea value={pledge} maxLength={120} rows="2" onChange={(e) => setPledge(e.target.value)} placeholder="예: 내 강점인 성실함을 살려서 모둠 활동 기록을 맡아 보겠다." className="w-full mt-1 p-3 border rounded-xl text-sm" required />
        </div>
        <button type="submit" disabled={saving || !insight.trim() || !pledge.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-60 shadow-md">
          {saving ? '저장 중...' : saved ? '수정해서 저장하기' : '저장하고 강점 카드 만들기'}
        </button>
      </form>

      {saved && (
        <div className="space-y-3">
          <div ref={cardRef} className="bg-white border-4 border-indigo-500 rounded-3xl p-6 space-y-4">
            <div className="text-center">
              <p className="text-xs font-bold text-indigo-500 tracking-widest">MY STRENGTH CARD</p>
              <h3 className="text-2xl font-black text-gray-800">{student.name}의 강점 카드</h3>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {top.length ? top.map((x) => <StrengthChip key={x.id} id={x.id} count={received[x.id]} big />) : <span className="text-sm text-gray-400">받은 강점이 아직 없어요</span>}
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-gray-800 leading-relaxed">
              <p className="text-xs font-bold text-slate-500 mb-1">새롭게 알게 된 점</p>
              <p className="mb-3">{saved.insight}</p>
              <p className="text-xs font-bold text-slate-500 mb-1">이번 주 실천 다짐</p>
              <p>{saved.pledge}</p>
            </div>
          </div>
          <button onClick={downloadCard} disabled={downloading} className="w-full py-3 bg-white border-2 border-indigo-500 text-indigo-700 rounded-xl font-bold disabled:opacity-60">{downloading ? '이미지 만드는 중...' : '강점 카드 이미지로 저장'}</button>
        </div>
      )}
    </div>
  );
};
