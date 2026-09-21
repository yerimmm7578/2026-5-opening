import { readPublicState } from './_lib.js';

// 학생·학부모 공용 조회. Vercel CDN이 2초간 응답을 공유(캐시)하므로
// 접속자가 많아도 데이터베이스 부담이 거의 없습니다.
export default async function handler(req, res) {
  try {
    const state = await readPublicState();
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=2');
    res.status(200).json(state);
  } catch (e) {
    console.error('state error', e);
    res.status(500).json({ error: 'state_failed' });
  }
}
