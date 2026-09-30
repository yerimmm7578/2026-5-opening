export const checkProfanity = (text) => {
  const badWords = ['바보', '멍청이', '짜증', '싫어', '병신', '씨발', '새끼', '죽어'];
  return badWords.some((word) => text.includes(word));
};

// 서버 오류 코드를 학생/선생님이 이해할 수 있는 말로 바꿔줍니다.
export const errorMessage = (err, fallback = '잠시 후 다시 시도해주세요.') => {
  switch (err && err.code) {
    case 'wrong_password': return '비밀번호가 다릅니다.';
    case 'too_many_attempts': return '비밀번호를 너무 많이 틀렸어요. 5분 뒤에 다시 시도해주세요.';
    case 'teacher_password_not_set': return '서버에 교사 비밀번호(TEACHER_PASSWORD)가 설정되지 않았습니다.';
    case 'profanity': return '바르고 고운 말을 써주세요!';
    case 'not_guessing': return '지금은 이름을 고를 수 있는 시간이 아니에요.';
    case 'not_revealed': return '정답이 발표된 뒤에 댓글을 쓸 수 있어요.';
    case 'no_praises': return '이 친구에게 온 칭찬이 아직 없어요.';
    case 'feelings_closed': return '지금은 기분을 쓸 수 있는 시간이 아니에요.';
    case 'no_emotion': return "기분을 나타내는 말을 찾지 못했어요.\n'기뻐요', '뿌듯해요'처럼 내 기분을 넣어서 다시 써볼까요?";
    case 'activity_closed': return '활동2가 시작되지 않았어요. 먼저 [활동2 시작]을 눌러주세요.';
    case 'invalid_praise': return '강점을 하나 고르고, "어떤 행동을 봤는지"를 5글자 이상 적어주세요.';
    case 'invalid_reflection': return '새롭게 알게 된 점과 실천 다짐을 모두 적어주세요.';
    default: return fallback;
  }
};

// 강점 종류 (서버의 STRENGTHS 와 같은 순서·이름이어야 해요)
export const STRENGTHS = [
  { id: '배려', desc: '친구의 마음을 살피고 도와줘요', color: '#0ea5e9' },
  { id: '성실', desc: '맡은 일을 끝까지 꾸준히 해요', color: '#6366f1' },
  { id: '창의', desc: '새롭고 독특한 생각을 내요', color: '#a855f7' },
  { id: '유머', desc: '주변을 즐겁게 만들어요', color: '#f59e0b' },
  { id: '리더십', desc: '의견을 모으고 앞에서 이끌어요', color: '#ef4444' },
  { id: '협동', desc: '함께 힘을 모아 일해요', color: '#10b981' },
  { id: '용기', desc: '어려워도 먼저 도전해요', color: '#f97316' },
  { id: '정직', desc: '솔직하고 약속을 잘 지켜요', color: '#14b8a6' },
];
export const strengthColor = (id) => (STRENGTHS.find((x) => x.id === id) || {}).color || '#64748b';
