import axios from 'axios';

import { getToken } from '../auth/authStorage';

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

export default apiClient;
