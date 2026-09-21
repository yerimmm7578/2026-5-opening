import { Redis } from '@upstash/redis';
import { createHash, timingSafeEqual } from 'node:crypto';

// Vercel에서 Upstash Redis를 연결하면 KV_REST_API_* 값이 자동으로 등록됩니다.
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

// ★ 여러 학급이 같은 Redis 저장소를 공유하게 되더라도 데이터가 섞이지 않도록,
// 모든 키 앞에 학급 구분 접두사를 붙입니다. Vercel 환경변수 CLASS_ID를 넣으면
// 그 값이, 넣지 않으면 'default'가 사용됩니다. (환경변수 CLASS_ID를 프로젝트마다
// 다르게 설정해 두면, 혹시 Redis를 실수로 공용으로 연결해도 안전합니다.)
const NS = String(process.env.CLASS_ID || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
export const k = (name) => `${NS}:${name}`;

// 방송 상태: idle(대기) → guessing(맞히기 진행) → revealed(정답 발표)
export const IDLE = { phase: 'idle', roundId: 0, targetId: null, summary: '', result: null };

export async function readBroadcast() {
  const b = await redis.get(k('broadcast'));
  return b && typeof b === 'object' ? b : IDLE;
}

// 학생/학부모 기기에 내려주는 공개 데이터.
// ★ 맞히기 진행 중에는 정답(targetId)과 칭찬 원문을 절대 포함하지 않습니다.
export async function readPublicState() {
  const p = redis.pipeline();
  p.hgetall(k('students'));
  p.get(k('broadcast'));
  p.hlen(k('guesses'));
  const [students, broadcast, guessCount] = await p.exec();
  const b = broadcast && typeof broadcast === 'object' ? broadcast : IDLE;
  const revealed = b.phase === 'revealed' && b.targetId;

  let comments = [];
  if (revealed) {
    comments = Object.values((await redis.hgetall(k(`comments:${b.targetId}`))) || {});
  }
  return {
    students: Object.values(students || {}),
    broadcast: {
      phase: b.phase,
      roundId: b.roundId,
      summary: b.phase === 'idle' ? '' : b.summary,
      revealedStudentId: revealed ? b.targetId : null,
      result: revealed ? b.result : null,
    },
    guessCount: Number(guessCount || 0),
    comments,
  };
}

const sha = (s) => createHash('sha256').update(String(s)).digest();

export function passwordMatches(input) {
  const real = process.env.TEACHER_PASSWORD;
  if (!real || !input) return false;
  return timingSafeEqual(sha(input), sha(real));
}

export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (Array.isArray(xff) ? xff[0] : (xff || '')).split(',')[0].trim() || 'unknown';
}

const BAD_WORDS = ['바보', '멍청이', '짜증', '싫어', '병신', '씨발', '새끼', '죽어'];
export const hasBadWord = (text) => BAD_WORDS.some((w) => String(text).includes(w));

export const str = (v, max) => String(v ?? '').trim().slice(0, max);

// 요약문에 정답 학생의 이름(성 포함/제외)이 남아 있으면 '이 친구'로 바꿉니다.
// (예: "민준이가" → "이 친구가", "민준은" → "이 친구는")
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function maskName(text, name) {
  const n = String(name || '').trim();
  let out = String(text || '');
  if (n.length < 2) return out;
  const variants = new Set([n]);
  if (n.length >= 3) variants.add(n.slice(1));
  [...variants].sort((a, b) => b.length - a.length).forEach((v) => {
    out = out.replace(new RegExp(escapeRegExp(v) + '(?:이(?=[가는도를의랑와과]|[\\s.,!?]|$))?', 'g'), '이 친구');
  });
  return out.replace(/이 친구은/g, '이 친구는').replace(/이 친구을/g, '이 친구를');
}

// praises 해시의 필드 이름은 "쓴학생id>받는학생id" 형태입니다.
export const splitKey = (k) => {
  const i = k.indexOf('>');
  return [k.slice(0, i), k.slice(i + 1)];
};
