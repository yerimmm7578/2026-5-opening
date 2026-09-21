// 서버(Vercel 함수)와 통신하는 함수 모음
let teacherKey = '';
export const setTeacherKey = (k) => { teacherKey = k; };

export async function fetchState() {
  const r = await fetch('/api/state');
  if (!r.ok) throw new Error('state_failed');
  return r.json();
}

// 반환값: { state, data }  (state = 화면 공용 데이터, data = 동작별 결과)
export async function callAction(action, payload) {
  const r = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-teacher-key': teacherKey },
    body: JSON.stringify({ action, payload }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(body.error || 'action_failed');
    err.code = body.error || 'action_failed';
    throw err;
  }
  return body;
}
