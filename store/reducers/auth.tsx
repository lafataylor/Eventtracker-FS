import Cookies from 'js-cookie';
import {
  LOGIN_SUCCESS,
  LOGIN_FAIL,
  REGISTER_SUCCESS,
  REGISTER_FAIL,
  LOGOUT,
  SHOW_INFO_OVERLAY,
  HIDE_INFO_OVERLAY,
  USER_LOGIN_SUCCESS,
  USER_LOGIN_FAIL,
  USER_REGISTER_SUCCESS,
  USER_REGISTER_FAIL,
  USER_LOGOUT,
  USER_LOGIN_SUCCESS_ES,
} from '../actions/type';

const adminToken =
  typeof window !== 'undefined' ? Cookies.get('adminToken') : undefined;
const userToken =
  typeof window !== 'undefined' ? Cookies.get('userToken') : undefined;

export interface StateProps {
  isAdminLoggedIn: boolean;
  isUserLoggedIn: boolean;
  chosenLanguage?: string;
  overlay: {
    message: string;
    isError: boolean;
    isVisible: boolean;
  };
}

export const initialState: StateProps = {
  isAdminLoggedIn: !!adminToken,
  isUserLoggedIn: !!userToken,
  chosenLanguage: 'en',
  overlay: { message: '', isError: false, isVisible: false },
};

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case REGISTER_SUCCESS: // Admin Register Success
      return {
        ...state,
        isAdminLoggedIn: true,
      };
    case REGISTER_FAIL: // Admin Register Fail
      return {
        ...state,
        isAdminLoggedIn: false,
      };
    case LOGIN_SUCCESS: // Admin Login Success
      return {
        ...state,
        isAdminLoggedIn: true,
      };
    case LOGIN_FAIL: // Admin Login Fail
      return {
        ...state,
        isAdminLoggedIn: false,
      };
    case USER_REGISTER_SUCCESS: // User Register Success
      return {
        ...state,
        isUserLoggedIn: false,
      };
    case USER_REGISTER_FAIL: // User Register Fail
      return {
        ...state,
        isUserLoggedIn: false,
      };
    case USER_LOGIN_SUCCESS: // User Login Success
      return {
        ...state,
        isUserLoggedIn: true,
        chosenLanguage: 'en',
      };
    case USER_LOGIN_SUCCESS_ES: // User Login Success ES
      return {
        ...state,
        isUserLoggedIn: true,
        chosenLanguage: 'es',
      };
    case USER_LOGIN_FAIL: // User Login Fail
      return {
        ...state,
        isUserLoggedIn: false,
      };
    case LOGOUT: // Admin Logout
      return {
        ...state,
        isAdminLoggedIn: false,
      };
    case USER_LOGOUT: // User Logout
      return {
        ...state,
        isUserLoggedIn: false,
      };
    case SHOW_INFO_OVERLAY:
      return {
        ...state,
        overlay: {
          message: payload.message,
          isError: payload.isError,
          isVisible: true,
        },
      };
    case HIDE_INFO_OVERLAY:
      return {
        ...state,
        overlay: {
          ...state.overlay,
          isVisible: false,
        },
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
