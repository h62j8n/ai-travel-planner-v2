import { CssBaseline, ThemeProvider } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { RouterProvider } from 'react-router-dom';
import 'dayjs/locale/ko';

import theme from './theme/theme';
import router from './router/router';

/**
 * 앱 전역 프로바이더 구성.
 * LocalizationProvider(AdapterDayjs)는 일정 생성 폼 등에서 쓰이는
 * MUI DatePicker(@mui/x-date-pickers)가 공통으로 사용한다.
 */
function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ko">
        <RouterProvider router={router} />
      </LocalizationProvider>
    </ThemeProvider>
  );
}

export default App;
