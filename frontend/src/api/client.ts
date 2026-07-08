import axios from 'axios';

/**
 * axios 인스턴스 스켈레톤.
 * 실제 baseURL/인터셉터(JWT 첨부 등)는 인증 구현 단계에서 채운다.
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
});

export default apiClient;
