import axios, { isAxiosError } from 'axios';

import { clearSession, getToken } from '../auth/authStorage';
// router.tsx가 pages -> api -> client.ts로 이어지는 순환 import 체인을 형성하지만,
// 아래에서는 router 바인딩을 응답 인터셉터 콜백 "내부"에서만 참조하므로 문제가 없다.
// ESM은 default export도 live binding으로 취급하므로, 인터셉터가 실제로 실행되는 시점
// (모듈 로드가 모두 끝난 뒤 API 호출이 발생하는 시점)에는 router가 이미 초기화되어 있다.
import router from '../router/router';

/**
 * 공용 axios 인스턴스.
 * 요청 인터셉터에서 sessionStorage에 저장된 JWT를 Authorization 헤더에 첨부한다.
 * (CLAUDE.md: JWT는 sessionStorage에 저장, localStorage 금지)
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// 로그인/회원가입 시도 자체가 실패해 401을 받는 경우는 "토큰 만료"가 아니므로
// 전역 리다이렉트 대상에서 제외한다(각 화면이 자체 에러 메시지를 노출한다).
const AUTH_ATTEMPT_PATHS = ['/auth/login', '/auth/signup'];

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 401) {
      const requestUrl = error.config?.url ?? '';
      const isAuthAttempt = AUTH_ATTEMPT_PATHS.some((path) => requestUrl.includes(path));

      if (!isAuthAttempt) {
        clearSession();
        // 이미 로그인 화면이면 불필요한 재이동/재렌더를 반복하지 않는다.
        if (window.location.pathname !== '/login') {
          router.navigate('/login');
        }
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
