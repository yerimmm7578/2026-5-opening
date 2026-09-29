import { initializeApp, getApps, cert, } from 'firebase-admin/app';
import { getFirestore, FieldPath, FieldValue } from 'firebase-admin/firestore';
import { createHash, timingSafeEqual } from 'node:crypto';

// ============================================================
//  Firebase(Firestore) 연결
//  Vercel 환경변수 3개가 필요합니다:
//  FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
// ============================================================
const clean = (v) => String(v || '').trim().replace(/^"([\s\S]*)"$/, '$1');

const PROJECT_ID = clean(process.env.FIREBASE_PROJECT_ID);
const CLIENT_EMAIL = clean(process.env.FIREBASE_CLIENT_EMAIL);
const PRIVATE_KEY = clean(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');

function getDb() {
  if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error('Firebase 환경변수가 없습니다. Vercel > Settings > Environment Variables 3개를 확인하고 Redeploy 하세요.');
    throw new Error('FIREBASE_ENV_NOT_SET');
  }
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: PROJECT_ID,
        clientEmail: CLIENT_EMAIL,
        privateKey: PRIVATE_KEY,
      }),
    });
  }
  return getFirestore();
}

// ============================================================
//  Redis 명령 흉내 내기 (다른 api 파일들이 기존처럼 redis.xxx 를 써도 동작하도록)
//  저장 위치: Firestore 컬렉션 "kv" 안에 키 하나당 문서 하나
//   - 문자열: { value: "..." }
//   - 해시:   { data: { 필드: "값", ... } }
// ============================================================
const COL = 'kv';
const ref = (key) => getDb().collection(COL).doc(encodeURIComponent(String(key)));

const live = (snap) => {
  if (!snap.exists) return null;
  const d = snap.data();
  if (d.expiresAt && d.expiresAt <= Date.now()) return null;
  return d;
};

const commands = {
  async get(key) {
    const d = live(await ref(key).get());
    return d && d.value != null ? d.value : null;
  },

  async set(key, value, ...opts) {
    let ttlMs = 0;
    let nx = false;
    for (let i = 0; i < opts.length; i++) {
      const o = String(opts[i]).toUpperCase();
      if (o === 'EX') ttlMs = Number(opts[++i]) * 1000;
      else if (o === 'PX') ttlMs = Number(opts[++i]);
      else if (o === 'NX') nx = true;
    }
    const doc = { type: 'string', value: String(value), expiresAt: ttlMs ? Date.now() + ttlMs : null };
    const r = ref(key);
    if (nx) {
      return getDb().runTransaction(async (t) => {
        if (live(await t.get(r))) return null;
        t.set(r, doc);
        return 'OK';
      });
    }
    await r.set(doc);
    return 'OK';
  },

  async del(...keys) {
    await Promise.all(keys.flat().map((key) => ref(key).delete()));
    return keys.flat().length;
  },

  async exists(...keys) {
    const snaps = await Promise.all(keys.flat().map((key) => ref(key).get()));
    return snaps.filter((s) => live(s)).length;
  },

  async incrby(key, n) {
    const r = ref(key);
    return getDb().runTransaction(async (t) => {
      const d = live(await t.get(r));
      const next = Number((d && d.value) || 0) + Number(n);
      t.set(r, { type: 'string', value: String(next), expiresAt: (d && d.expiresAt) || null });
      return next;
    });
  },

  async incr(key) {
    return commands.incrby(key, 1);
  },

  async expire(key, seconds) {
    try {
      await ref(key).update({ expiresAt: Date.now() + Number(seconds) * 1000 });
      return 1;
    } catch {
      return 0;
    }
  },

  // hset(key, {필드: 값}) 또는 hset(key, 필드, 값, 필드, 값 ...)
  async hset(key, ...args) {
    const data = {};
    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      Object.entries(args[0]).forEach(([f, v]) => { data[f] = String(v); });
    } else {
      for (let i = 0; i + 1 < args.length; i += 2) data[String(args[i])] = String(args[i + 1]);
    }
    const n = Object.keys(data).length;
    if (!n) return 0;
    await ref(key).set({ type: 'hash', data }, { merge: true });
    return n;
  },

  async hget(key, field) {
    const d = live(await ref(key).get());
    const v = d && d.data ? d.data[field] : null;
    return v == null ? null : v;
  },

  async hgetall(key) {
    const d = live(await ref(key).get());
    return (d && d.data) || {};
  },

  async hlen(key) {
    const d = live(await ref(key).get());
    return d && d.data ? Object.keys(d.data).length : 0;
  },

  async hexists(key, field) {
    const d = live(await ref(key).get());
    return d && d.data && d.data[field] != null ? 1 : 0;
  },

  async hdel(key, ...fields) {
    const list = fields.flat();
    if (!list.length) return 0;
    const args = [];
    list.forEach((f) => { args.push(new FieldPath('data', String(f)), FieldValue.delete()); });
    try {
      await ref(key).update(...args);
      return list.length;
    } catch (e) {
      if (e && (e.code === 5 || /NOT_FOUND/.test(String(e.message)))) return 0;
      throw e;
    }
  },

  async hincrby(key, field, n) {
    const r = ref(key);
    return getDb().runTransaction(async (t) => {
      const d = live(await t.get(r));
      const data = { ...((d && d.data) || {}) };
      const next = Number(data[field] || 0) + Number(n);
      data[field] = String(next);
      t.set(r, { type: 'hash', data });
      return next;
    });
  },
};

// 지원하지 않는 명령이 호출되면, 어떤 명령인지 알려주는 오류를 냅니다.
export const redis = new Proxy(commands, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (prop === 'then' || typeof prop === 'symbol') return undefined;
    return () => Promise.reject(new Error(`UNSUPPORTED_REDIS_COMMAND: ${String(prop)}`));
  },
});

// ★ 여러 학급이 같은 저장소를 공유하게 되더라도 데이터가 섞이지 않도록,
// 모든 키 앞에 학급 구분 접두사를 붙입니다. Vercel 환경변수 CLASS_ID를 넣으면
// 그 값이, 넣지 않으면 'default'가 사용됩니다.
const NS = String(process.env.CLASS_ID || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
export const k = (name) => `${NS}:${name}`;

// ---- JSON 직렬화 헬퍼 ----
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
