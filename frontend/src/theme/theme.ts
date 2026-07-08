import { createTheme } from '@mui/material/styles';

/**
 * MUI 테마 기본 세팅.
 * 색상은 docs/wireframe 의 팔레트(틸 primary / 코랄 secondary)를 따른다.
 * 화면별 상세 스타일은 각 페이지 구현 시 추가한다.
 */
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#00897B',
      dark: '#00695C',
      light: '#4DB6AC',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#FF7043',
      dark: '#E64A19',
      light: '#FFA270',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#FAFAFA',
      paper: '#FFFFFF',
    },
    warning: {
      main: '#ED6C02',
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
  },
});

export default theme;
