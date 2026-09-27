import {
  redis, k, hsetObj, hgetObj, hgetallObj, getObj, setObj,
  readPublicState, readBroadcast, IDLE, passwordMatches, clientIp,
  hasBadWord, str, maskName, splitKey,
} from './_lib.js';
import { makeSummary } from './_summary.js';

const TEACHER_ACTIONS = new Set([
  'verifyTeacher', 'addStudent', 'addStudentsBulk', 'removeStudent', 'teacherInfo',
  'prepareSummary', 'startBroadcast', 'revealAnswer', 'endBroadcast',
  'deleteComment', 'getAllComments', 'resetData',
]);
// 화면 데이터를 다시 내려줄 필요가 없는(읽기 전용) 동작
const READ_ONLY = new Set(['verifyTeacher', 'teacherInfo', 'prepareSummary', 'getAllComments', 'myStatus']);

const bad = (res, code, error) => res.status(code).json({ error });

const cleanStudent = (s) => {
  const grade = str(s?.grade, 10).replace(/>/g, '');
  const classNum = str(s?.classNum, 20).replace(/>/g, '');
  const number = str(s?.number, 5).replace(/[^0-9]/g, '');
  const name = str(s?.name, 20);
  if (!grade || !classNum || !number || !name) return null;
  return { id: `${grade}-${classNum}-${number}`, grade, classNum, number, name };
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
        const ops = [redis.hdel(k('students'), id), redis.del(k(`comments:${id}`)), redis.hdel(k('guesses'), id), redis.srem(k('revealedIds'), id)];
        if (stale.length) ops.push(redis.hdel(k('praises'), ...stale));
        await Promise.all(ops);
        const b = await readBroadcast();
        if (b.targetId === id) await Promise.all([setObj(k('broadcast'), IDLE), redis.del(k('guesses'))]);
        break;
      }

      // ---------- 교사: 방송 제어 ----------
      case 'teacherInfo': {
        const [keys, b, guessCount, revealedIds] = await Promise.all([
          redis.hkeys(k('praises')),
          getObj(k('broadcast')),
          redis.hlen(k('guesses')),
          redis.smembers(k('revealedIds')),
        ]);
        const praiseCounts = {};
        (keys || []).forEach((field) => { const t = splitKey(field)[1]; praiseCounts[t] = (praiseCounts[t] || 0) + 1; });
        data = { praiseCounts, broadcast: b && typeof b === 'object' ? b : IDLE, guessCount: Number(guessCount || 0), revealedIds: revealedIds || [] };
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
        const studentId = str(payload?.studentId, 60);
        const student = await hgetObj(k('students'), studentId);
        if (!student) return bad(res, 404, 'no_student');
        const summary = maskName(str(payload?.summary, 800), student.name);
        if (!summary) return bad(res, 400, 'invalid_summary');
        await redis.del(k('guesses'));
        await setObj(k('broadcast'), { phase: 'guessing', roundId: Date.now(), targetId: studentId, summary, result: null });
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

      // 리허설 후 새로 시작할 때: 칭찬·댓글·방송 상태를 지우고 학생 명단은 유지
      case 'resetData': {
        const ids = (await redis.hkeys(k('students'))) || [];
        await Promise.all([
          redis.del(k('praises')), redis.del(k('guesses')), redis.del(k('revealedIds')), setObj(k('broadcast'), IDLE),
          ...ids.map((id) => redis.del(k(`comments:${id}`))),
        ]);
        break;
      }

      // ---------- 학생/학부모 기능 ----------
      case 'myStatus': {
        const writerId = str(payload?.writerId, 60);
        const [keys, b, guess] = await Promise.all([
          redis.hkeys(k('praises')), readBroadcast(), hgetObj(k('guesses'), writerId),
        ]);
        data = {
          written: writtenBy(keys || [], writerId),
          guessId: b.phase !== 'idle' && guess ? guess.guessId : null,
          roundId: b.roundId,
        };
        break;
      }

      case 'savePraise': {
        const writerId = str(payload?.writerId, 60);
        const targetId = str(payload?.targetId, 60);
        const text = str(payload?.text, 300);
        if (!writerId || !targetId || writerId === targetId || !text) return bad(res, 400, 'invalid_praise');
        if (hasBadWord(text)) return bad(res, 400, 'profanity');
        // 같은 친구에게는 1개만 저장(중복 클릭해도 한 번만 등록)
        await hsetObj(k('praises'), { [`${writerId}>${targetId}`]: { text } });
        data = { written: writtenBy((await redis.hkeys(k('praises'))) || [], writerId) };
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
