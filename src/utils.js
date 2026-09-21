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
    default: return fallback;
  }
};
