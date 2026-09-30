import {
  redis, k, hsetObj, hgetObj, hgetallObj, getObj, setObj,
  readPublicState, readBroadcast, IDLE, passwordMatches, clientIp,
  hasBadWord, str, maskName, splitKey, STRENGTHS,
} from './_lib.js';
import { makeSummary } from './_summary.js';
import { extractEmotions } from './_emotion.js';

const TEACHER_ACTIONS = new Set([
  'verifyTeacher', 'addStudent', 'addStudentsBulk', 'removeStudent', 'teacherInfo',
  'prepareSummary', 'startBroadcast', 'revealAnswer', 'endBroadcast',
  'deleteComment', 'getAllComments', 'resetData',
  'startActivity2', 'stopActivity2', 'startActivity4', 'stopActivity4', 'nextHint', 'startFeelings', 'endFeelings', 'deleteFeeling', 'clearFeelings',
]);
// 화면 데이터를 다시 내려줄 필요가 없는(읽기 전용) 동작
const READ_ONLY = new Set(['verifyTeacher', 'teacherInfo', 'prepareSummary', 'getAllComments', 'myStatus', 'strengthReport']);

const bad = (res, code, error) => res.status(code).json({ error });

const cleanStudent = (s) => {
  const grade = str(s?.grade, 10).replace(/>/g, '');
  const classNum = str(s?.classNum, 20).replace(/>/g, '');
  const number = str(s?.number, 5).replace(/[^0-9]/g, '');
  const name = str(s?.name, 20);
  if (!grade || !classNum || !number || !name) return null;
  return { id: `${grade}-${classNum}-${number}`, grade, classNum, number, name };
};

// 받는 친구에게 온 칭찬에서 강점별 개수를 셉니다. 예: [{ name: '배려', count: 3 }, ...] (많은 순)
const strengthCountsFor = (allPraises, targetId) => {
  const counts = {};
  Object.entries(allPraises || {}).forEach(([field, v]) => {
    if (splitKey(field)[1] !== targetId || !v || !STRENGTHS.includes(v.strength)) return;
    counts[v.strength] = (counts[v.strength] || 0) + 1;
  });
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
};

const writtenBy = (keys, writerId) =>
  keys.filter((key) => splitKey(key)[0] === writerId).map((key) => splitKey(key)[1]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const { action, payload } = req.body || {};

  try {
    // ---- 교사 전용 기능: 비밀번호 확인 (틀린 시도는 IP별로 횟수 제한) ----
    if (TEACHER_ACTIONS.has(action)) {
      if (!process.env.TEACHER_PASSWORD) return bad(res, 500, 'teacher_password_not_set');
      const failKey = k(`authfail:${clientIp(req)}`);
      const fails = Number((await redis.get(failKey)) || 0);
      if (fails >= 10) return bad(res, 429, 'too_many_attempts');
      if (!passwordMatches(req.headers['x-teacher-key'])) {
        await redis.incr(failKey);
        await redis.expire(failKey, 300);
        return bad(res, 401, 'wrong_password');
      }
    }

    let data = null;

    switch (action) {
      case 'verifyTeacher':
        data = { ok: true };
        break;

      // ---------- 명단 관리 ----------
      case 'addStudent': {
        const s = cleanStudent(payload);
        if (!s) return bad(res, 400, 'invalid_student');
        await hsetObj(k('students'), { [s.id]: s });
        break;
      }
      case 'addStudentsBulk': {
        const obj = {};
        (Array.isArray(payload) ? payload.slice(0, 200) : []).forEach((raw) => {
          const s = cleanStudent(raw);
          if (s) obj[s.id] = s;
        });
        if (Object.keys(obj).length === 0) return bad(res, 400, 'invalid_students');
        await hsetObj(k('students'), obj);
        break;
      }
      case 'removeStudent': {
        const id = str(payload, 60);
        if (!id) break;
        const keys = (await redis.hkeys(k('praises'))) || [];
        const stale = keys.filter((field) => { const [w, t] = splitKey(field); return w === id || t === id; });
        const ops = [redis.hdel(k('students'), id), redis.del(k(`comments:${id}`)), redis.hdel(k('guesses'), id), redis.hdel(k('feelings'), id), redis.hdel(k('selfStrengths'), id), redis.hdel(k('reflections'), id), redis.srem(k('revealedIds'), id)];
        if (stale.length) ops.push(redis.hdel(k('praises'), ...stale));
        await Promise.all(ops);
        const b = await readBroadcast();
        if (b.targetId === id) await Promise.all([setObj(k('broadcast'), IDLE), redis.del(k('guesses'))]);
        break;
      }

      // ---------- 교사: 방송 제어 ----------
      case 'teacherInfo': {
        const [allPraises, b, guessCount, revealedIds, selfAll, reflAll] = await Promise.all([
          hgetallObj(k('praises')),
          getObj(k('broadcast')),
          redis.hlen(k('guesses')),
          redis.smembers(k('revealedIds')),
          redis.hlen(k('selfStrengths')),
          redis.hlen(k('reflections')),
        ]);
        const praiseCounts = {};
        const strengthTotals = {};
        Object.entries(allPraises || {}).forEach(([field, v]) => {
          const t = splitKey(field)[1];
          praiseCounts[t] = (praiseCounts[t] || 0) + 1;
          if (v && STRENGTHS.includes(v.strength)) strengthTotals[v.strength] = (strengthTotals[v.strength] || 0) + 1;
        });
        data = {
          praiseCounts, strengthTotals, selfCount: Number(selfAll || 0), reflectionCount: Number(reflAll || 0),
          broadcast: b && typeof b === 'object' ? b : IDLE, guessCount: Number(guessCount || 0), revealedIds: revealedIds || [],
        };
        break;
      }

      // AI 요약 초안 만들기 (교사가 확인·수정한 뒤 방송을 시작합니다)
      case 'prepareSummary': {
        const studentId = str(payload?.studentId, 60);
        const student = await hgetObj(k('students'), studentId);
        if (!student) return bad(res, 404, 'no_student');
        const all = await hgetallObj(k('praises'));
        const texts = Object.entries(all)
          .filter(([field]) => splitKey(field)[1] === studentId)
          .map(([, v]) => v.text);
        if (texts.length === 0) return bad(res, 400, 'no_praises');
        data = { ...(await makeSummary(student.name, texts)), praiseCount: texts.length };
        break;
      }

      case 'startBroadcast': {
        if ((await getObj(k('activity'))) !== 'a2') return bad(res, 400, 'activity_closed');
        const studentId = str(payload?.studentId, 60);
        const student = await hgetObj(k('students'), studentId);
        if (!student) return bad(res, 404, 'no_student');
        const summary = maskName(str(payload?.summary, 800), student.name);
        if (!summary) return bad(res, 400, 'invalid_summary');
        const keywords = strengthCountsFor(await hgetallObj(k('praises')), studentId).slice(0, 3);
        await redis.del(k('guesses'));
        // 힌트 1: 강점 키워드 → (교사가 [힌트 더 보기]) → 힌트 2: AI 요약. 키워드가 없으면 바로 요약부터 보여줘요.
        await setObj(k('broadcast'), { phase: 'guessing', roundId: Date.now(), targetId: studentId, summary, keywords, hintLevel: keywords.length ? 1 : 2, result: null });
        break;
      }

      case 'nextHint': {
        const b = await readBroadcast();
        if (b.phase !== 'guessing') return bad(res, 400, 'not_guessing');
        await setObj(k('broadcast'), { ...b, hintLevel: 2 });
        break;
      }

      case 'revealAnswer': {
        const b = await readBroadcast();
        if (b.phase !== 'guessing') return bad(res, 400, 'not_guessing');
        const [guesses, total] = await Promise.all([hgetallObj(k('guesses')), redis.hlen(k('students'))]);
        const votes = Object.values(guesses || {});
        const participants = votes.length;
        const correct = votes.filter((v) => v.guessId === b.targetId).length;
        const result = { correct, participants, total: Number(total || 0), percent: participants ? Math.round((correct / participants) * 100) : 0 };
        await Promise.all([
          setObj(k('broadcast'), { ...b, phase: 'revealed', result }),
          redis.sadd(k('revealedIds'), b.targetId),
        ]);
        break;
      }

      case 'endBroadcast':
        await Promise.all([setObj(k('broadcast'), IDLE), redis.del(k('guesses'))]);
        break;

      // ---------- 교사: 댓글 관리 ----------
      case 'deleteComment': {
        const studentId = str(payload?.studentId, 60);
        const commentId = str(payload?.commentId, 60);
        if (studentId && commentId) await redis.hdel(k(`comments:${studentId}`), commentId);
        break;
      }
      case 'getAllComments': {
        const students = Object.values(await hgetallObj(k('students')));
        const results = await Promise.all(students.map((s) => hgetallObj(k(`comments:${s.id}`))));
        const list = [];
        students.forEach((s, i) => {
          Object.values(results[i] || {}).forEach((c) => list.push({ ...c, studentName: s.name }));
        });
        list.sort((a, b) => b.timestamp - a.timestamp);
        data = { comments: list };
        break;
      }

      // ---------- 교사: 활동 시작 / 중지 ----------
      // 한 번에 하나의 활동만 진행돼요. 활동을 시작하면 학생 화면이 그 활동 화면으로 바뀌고,
      // 중지하면 다시 활동1(칭찬 쓰기) 화면으로 돌아가요.
      case 'startActivity2':
        await Promise.all([setObj(k('broadcast'), IDLE), redis.del(k('guesses')), setObj(k('activity'), 'a2')]);
        break;
      case 'stopActivity2':
        await Promise.all([setObj(k('broadcast'), IDLE), redis.del(k('guesses')), redis.del(k('activity'))]);
        break;
      case 'startActivity4':
        await Promise.all([setObj(k('broadcast'), IDLE), redis.del(k('guesses')), setObj(k('activity'), 'a4')]);
        break;
      case 'stopActivity4':
        await redis.del(k('activity'));
        break;
      case 'startFeelings':
        await Promise.all([setObj(k('broadcast'), IDLE), redis.del(k('guesses')), setObj(k('activity'), 'a3')]);
        break;
      case 'endFeelings':
        await redis.del(k('activity'));
        break;
      case 'deleteFeeling': { // 워드클라우드에서 감정 단어 하나를 지웁니다.
        const word = str(payload?.text, 40);
        if (!word) break;
        const all = await hgetallObj(k('feelings'));
        for (const [id, v] of Object.entries(all)) {
          if (!v || !Array.isArray(v.words) || !v.words.includes(word)) continue;
          const rest = v.words.filter((w) => w !== word);
          if (rest.length) await hsetObj(k('feelings'), { [id]: { ...v, words: rest } });
          else await redis.hdel(k('feelings'), id);
        }
        break;
      }
      case 'clearFeelings':
        await redis.del(k('feelings'));
        break;

      // 리허설 후 새로 시작할 때: 칭찬·댓글·방송 상태를 지우고 학생 명단은 유지
      case 'resetData': {
        const ids = (await redis.hkeys(k('students'))) || [];
        await Promise.all([
          redis.del(k('praises')), redis.del(k('guesses')), redis.del(k('revealedIds')), redis.del(k('feelings')), redis.del(k('selfStrengths')), redis.del(k('reflections')), redis.del(k('activity')), setObj(k('broadcast'), IDLE),
          ...ids.map((id) => redis.del(k(`comments:${id}`))),
        ]);
        break;
      }

      // ---------- 학생/학부모 기능 ----------
      case 'myStatus': {
        const writerId = str(payload?.writerId, 60);
        const [keys, b, guess, myFeeling, mySelf] = await Promise.all([
          redis.hkeys(k('praises')), readBroadcast(), hgetObj(k('guesses'), writerId), hgetObj(k('feelings'), writerId), hgetObj(k('selfStrengths'), writerId),
        ]);
        data = {
          selfStrengths: Array.isArray(mySelf) ? mySelf : [],
          myFeeling: myFeeling && myFeeling.text ? { text: myFeeling.text, words: myFeeling.words || [] } : null,
          written: writtenBy(keys || [], writerId),
          guessId: b.phase !== 'idle' && guess ? guess.guessId : null,
          roundId: b.roundId,
        };
        break;
      }

      // 칭찬 쓰기: 강점 하나 + 상황 · 행동 · 느낀 점 (행동은 필수)
      case 'savePraise': {
        const writerId = str(payload?.writerId, 60);
        const targetId = str(payload?.targetId, 60);
        const strength = str(payload?.strength, 10);
        const situation = str(payload?.situation, 100);
        const action = str(payload?.action, 150);
        const feeling = str(payload?.feeling, 100);
        if (!writerId || !targetId || writerId === targetId) return bad(res, 400, 'invalid_praise');
        if (!STRENGTHS.includes(strength) || action.length < 5) return bad(res, 400, 'invalid_praise');
        if ([situation, action, feeling].some(hasBadWord)) return bad(res, 400, 'profanity');
        const text = [situation, action, feeling].filter(Boolean).join(' ');
        // 같은 친구에게는 1개만 저장(중복 클릭해도 한 번만 등록)
        await hsetObj(k('praises'), { [`${writerId}>${targetId}`]: { text, strength, situation, action, feeling } });
        data = { written: writtenBy((await redis.hkeys(k('praises'))) || [], writerId) };
        break;
      }

      // 활동1: 내가 생각하는 나의 장점 (최대 3개)
      case 'saveSelfStrengths': {
        const writerId = str(payload?.writerId, 60);
        const list = [...new Set(Array.isArray(payload?.strengths) ? payload.strengths : [])].filter((x) => STRENGTHS.includes(x)).slice(0, 3);
        if (!(await redis.hexists(k('students'), writerId))) return bad(res, 400, 'invalid_student');
        await hsetObj(k('selfStrengths'), { [writerId]: list });
        data = { selfStrengths: list };
        break;
      }

      // 활동4: 내가 받은 칭찬의 강점 vs 내가 예상한 강점 (칭찬 원문은 내려주지 않아요)
      case 'strengthReport': {
        if ((await getObj(k('activity'))) !== 'a4') return bad(res, 400, 'activity_closed');
        const writerId = str(payload?.writerId, 60);
        const [all, self, refl] = await Promise.all([hgetallObj(k('praises')), hgetObj(k('selfStrengths'), writerId), hgetObj(k('reflections'), writerId)]);
        const received = {};
        STRENGTHS.forEach((x) => { received[x] = 0; });
        let total = 0;
        Object.entries(all).forEach(([field, v]) => {
          if (splitKey(field)[1] !== writerId) return;
          total += 1;
          if (v && received[v.strength] != null) received[v.strength] += 1;
        });
        data = { received, total, self: Array.isArray(self) ? self : [], reflection: refl || null };
        break;
      }

      case 'saveReflection': {
        if ((await getObj(k('activity'))) !== 'a4') return bad(res, 400, 'activity_closed');
        const writerId = str(payload?.writerId, 60);
        const insight = str(payload?.insight, 120);
        const pledge = str(payload?.pledge, 120);
        if (!insight || !pledge) return bad(res, 400, 'invalid_reflection');
        if (hasBadWord(insight) || hasBadWord(pledge)) return bad(res, 400, 'profanity');
        if (!(await redis.hexists(k('students'), writerId))) return bad(res, 400, 'invalid_student');
        await hsetObj(k('reflections'), { [writerId]: { insight, pledge } });
        data = { reflection: { insight, pledge } };
        break;
      }

      case 'submitGuess': {
        const b = await readBroadcast();
        if (b.phase !== 'guessing') return bad(res, 400, 'not_guessing');
        const writerId = str(payload?.writerId, 60);
        const guessId = str(payload?.guessId, 60);
        const [okW, okG] = await Promise.all([redis.hexists(k('students'), writerId), redis.hexists(k('students'), guessId)]);
        if (!okW || !okG) return bad(res, 400, 'invalid_guess');
        await hsetObj(k('guesses'), { [writerId]: { guessId } });
        data = { ok: true, guessId, roundId: b.roundId };
        break;
      }

      // 활동3: 칭찬을 듣고 난 후 나의 기분 쓰기 (학생 1명당 1개, 다시 쓰면 덮어써요)
      // 학생이 쓴 문장에서 '감정 단어'만 뽑아 저장하고, 화면에는 감정 단어만 보여줘요.
      case 'submitFeeling': {
        if ((await getObj(k('activity'))) !== 'a3') return bad(res, 400, 'feelings_closed');
        const writerId = str(payload?.writerId, 60);
        const text = str(payload?.text, 100).replace(/\s+/g, ' ');
        if (!text) return bad(res, 400, 'invalid_feeling');
        if (hasBadWord(text)) return bad(res, 400, 'profanity');
        if (!(await redis.hexists(k('students'), writerId))) return bad(res, 400, 'invalid_feeling');
        const { words } = await extractEmotions(text);
        if (!words.length || words.some((w) => hasBadWord(w))) return bad(res, 400, 'no_emotion');
        await hsetObj(k('feelings'), { [writerId]: { text, words } });
        data = { text, words };
        break;
      }

      case 'addComment': {
        const b = await readBroadcast();
        const targetStudentId = str(payload?.targetStudentId, 60);
        if (b.phase !== 'revealed' || b.targetId !== targetStudentId) return bad(res, 400, 'not_revealed');
        const writerName = str(payload?.writerName, 30);
        const text = str(payload?.text, 200);
        if (!writerName || !text) return bad(res, 400, 'invalid_comment');
        if (hasBadWord(text)) return bad(res, 400, 'profanity');
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await hsetObj(k(`comments:${targetStudentId}`), { [id]: { id, writerName, targetStudentId, text, timestamp: Date.now() } });
        break;
      }

      default:
        return bad(res, 400, 'unknown_action');
    }

    return res.status(200).json({ state: READ_ONLY.has(action) ? null : await readPublicState(), data });
  } catch (e) {
    console.error('action error', action, e);
    return bad(res, 500, 'server_error');
  }
}
