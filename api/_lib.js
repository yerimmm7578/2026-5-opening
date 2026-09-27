import Redis from 'ioredis';
import { createHash, timingSafeEqual } from 'node:crypto';

// ★ Vercel Storage에서 만든 Redis는 "REDIS_URL" 하나로 접속하는 일반 Redis 방식입니다.
// (Upstash REST 방식과는 다릅니다.) KV_URL은 예전 Vercel KV가 남긴 이름이라 혹시 몰라 함께 봐 둡니다.
const REDIS_URL = process.env.REDIS_URL || process.env.KV_URL || '';

function createClient() {
  if (!REDIS_URL) {
    console.error('REDIS_URL 환경변수가 없습니다. Vercel > Storage에서 Redis를 프로젝트에 연결했는지, Redeploy를 했는지 확인하세요.');
    // 명확한 오류가 나도록, 어떤 명령을 호출해도 즉시 실패하는 가짜 클라이언트를 돌려줍니다.
    const fail = () => Promise.reject(new Error('REDIS_URL_NOT_SET'));
    return new Proxy({}, { get: () => fail });
  }
  const client = new Redis(REDIS_URL, {
    // 서버리스 환경에서 연결이 잠깐 끊겨도 요청마다 오래 기다리지 않도록 재시도를 짧게 제한합니다.
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 200, 1000),
    enableAutoPipelining: true,
  });
  client.on('error', (e) => console.error('redis client error:', e && e.message));
  return client;
}

// Vercel 서버리스 함수의 컨테이너가 재사용될 때(warm start) 같은 연결을 다시 쓰도록
// 전역(global) 스코프에 클라이언트를 한 번만 만들어 캐시합니다.
export const redis = globalThis.__praiseRedisClient || (globalThis.__praiseRedisClient = createClient());

// ★ 여러 학급이 같은 Redis 저장소를 공유하게 되더라도 데이터가 섞이지 않도록,
// 모든 키 앞에 학급 구분 접두사를 붙입니다. Vercel 환경변수 CLASS_ID를 넣으면
// 그 값이, 넣지 않으면 'default'가 사용됩니다.
const NS = String(process.env.CLASS_ID || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
export const k = (name) => `${NS}:${name}`;

// ---- JSON 직렬화 헬퍼 ----
// 일반 Redis는 문자열만 저장하므로, 객체는 JSON 문자열로 감싸서 넣고 꺼낼 때 다시 풀어줍니다.
const enc = (v) => JSON.stringify(v);
const dec = (v) => { try { return v == null ? null : JSON.parse(v); } catch { return null; } };

export async function hsetObj(key, fieldValueObj) {
  const encoded = {};
  Object.entries(fieldValueObj).forEach(([f, v]) => { encoded[f] = enc(v); });
  if (!Object.keys(encoded).length) return 0;
  return redis.hset(key, encoded);
}
export async function hgetObj(key, field) {
  const raw = await redis.hget(key, field);
  return raw == null ? null : dec(raw);
}
export async function hgetallObj(key) {
  const raw = (await redis.hgetall(key)) || {};
  const out = {};
  Object.entries(raw).forEach(([f, v]) => { out[f] = dec(v); });
  return out;
}
export async function getObj(key) {
  const raw = await redis.get(key);
  return raw == null ? null : dec(raw);
}
export async function setObj(key, value) {
  return redis.set(key, enc(value));
}

// 방송 상태: idle(대기) → guessing(맞히기 진행) → revealed(정답 발표)
export const IDLE = { phase: 'idle', roundId: 0, targetId: null, summary: '', result: null };

export async function readBroadcast() {
  const b = await getObj(k('broadcast'));
  return b && typeof b === 'object' ? b : IDLE;
}

// 학생/학부모 기기에 내려주는 공개 데이터.
// ★ 맞히기 진행 중에는 정답(targetId)과 칭찬 원문을 절대 포함하지 않습니다.
export async function readPublicState() {
  const [studentsMap, broadcastRaw, guessCount] = await Promise.all([
    hgetallObj(k('students')),
    getObj(k('broadcast')),
    redis.hlen(k('guesses')),
  ]);
  const b = broadcastRaw && typeof broadcastRaw === 'object' ? broadcastRaw : IDLE;
  const revealed = b.phase === 'revealed' && b.targetId;

  let comments = [];
  if (revealed) {
    comments = Object.values(await hgetallObj(k(`comments:${b.targetId}`)));
  }
  return {
    students: Object.values(studentsMap),
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
