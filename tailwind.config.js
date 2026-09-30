import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // 고학년에 맞는 차분한 색: 기존 코드의 orange → indigo, pink → violet 로 바꿔서 적용
      colors: { orange: colors.indigo, pink: colors.violet },
    },
  },
  plugins: [],
};
