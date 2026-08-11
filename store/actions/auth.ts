import { Dispatch } from 'react';
import {
  LOGIN_SUCCESS,
  LOGIN_FAIL,
  REGISTER_SUCCESS,
  REGISTER_FAIL,
  LOGOUT,
  SET_MESSAGE,
  SHOW_LOADING_DIALOAG,
  HIDE_LOADING_DIALOAG,
  SHOW_INFO_OVERLAY,
  HIDE_INFO_OVERLAY,
  USER_LOGIN_SUCCESS,
  USER_LOGIN_FAIL,
  USER_REGISTER_SUCCESS,
  USER_REGISTER_FAIL,
  USER_LOGOUT,
  USER_LOGIN_SUCCESS_ES,
  GET_ALL_USERS,
  EDIT_USER
} from './type';

import { AxiosResponse } from 'axios';
import AuthService from '../../services/lib/auth';
import { AuthRequest, AuthRequestRegsiter, AuthSuccessResponse, AuthUserSuccessResponse } from '../../interface/authInterface';
import Cookies from 'js-cookie';
import axiosClient from '../../services/apiClient';
import { useRouter } from 'next/router';
import { editUser, getAllUsers } from '../../services/lib/admin';
// Constants for token expiry time
const TOKEN_EXPIRY_MINUTES = 58;

// Function to set cookies for admin or user
const setTokenCookies = (tokenRes: AuthSuccessResponse, isAdmin: boolean) => {
  const now = new Date();
  const expiryTime = now.getTime() + TOKEN_EXPIRY_MINUTES * 60 * 1000;

  // Set cookies with different names for admin and regular user
  const tokenName = isAdmin ? 'adminToken' : 'userToken';
  const refreshTokenName = isAdmin ? 'adminRefreshToken' : 'userRefreshToken';
  const expiryName = isAdmin ? 'adminTokenExpiry' : 'userTokenExpiry';

  Cookies.set(tokenName, tokenRes.jwtToken, { expires: 1 });
  Cookies.set(refreshTokenName, tokenRes.refreshToken, { expires: 7 });
  Cookies.set(expiryName, expiryTime.toString(), { expires: 1 });

};


// Auth functions with user/admin distinction
export const login = (data: AuthRequest, isAdmin: boolean, language?: string) => (dispatch: Dispatch<any>) => {
  dispatch({ type: SHOW_LOADING_DIALOAG });

  const loginMethod = isAdmin ? AuthService.adminLogin : AuthService.userLogin;

  return loginMethod(data).then(
    (res: AxiosResponse) => {
      const tokenRes: AuthUserSuccessResponse = res.data;
      setTokenCookies(tokenRes, isAdmin);

      dispatch({ type: HIDE_LOADING_DIALOAG });
      dispatch({ type: isAdmin ? LOGIN_SUCCESS : language === 'es' ? USER_LOGIN_SUCCESS_ES : USER_LOGIN_SUCCESS });
      if(!isAdmin){

        localStorage.setItem('userFirstName', tokenRes.user.firstName);
        localStorage.setItem('userLastName', tokenRes.user.lastName);
        localStorage.setItem('userEmail', tokenRes.user.email);
      } else {
        localStorage.setItem('adminEmail', data.email);
      }
    
      return Promise.resolve();
    },
    (error) => {
      const message = 'Login failed. Please check input credentials';

      dispatch({ type: HIDE_LOADING_DIALOAG });
      dispatch({ type: isAdmin ? LOGIN_FAIL : USER_LOGIN_FAIL });
      dispatch({ type: SHOW_INFO_OVERLAY, payload: { message, isError: true } });
      dispatch({ type: SET_MESSAGE, payload: message });


      return Promise.reject();
    }
  );
};

export const register = (data: AuthRequestRegsiter, isAdmin: boolean, onSuccess?: () => void ) => (dispatch: Dispatch<any>) => {
  const registerMethod = isAdmin ? AuthService.adminRegister : AuthService.userRegister;

  dispatch({ type: SHOW_LOADING_DIALOAG });

  return registerMethod(data).then(
    (res: AxiosResponse) => {
      const tokenRes: AuthSuccessResponse = res.data;

      if (!isAdmin){
        setTokenCookies(tokenRes, isAdmin);
      }

      dispatch({ type: HIDE_LOADING_DIALOAG });

      dispatch({ type: isAdmin ? REGISTER_SUCCESS : USER_REGISTER_SUCCESS });
      
      // Dispatch info overlay and message
      dispatch({
        type: SHOW_INFO_OVERLAY,
        payload: { message: 'User registered successfully!', isError: false }
      });

      // Redirect to login page
      if (onSuccess) onSuccess();

      return Promise.resolve();
    },
    (error) => {
      const message = error.response?.data?.message || error.message || error.toString();
      
      dispatch({ type: HIDE_LOADING_DIALOAG });

      dispatch({ type: isAdmin ? REGISTER_FAIL : USER_REGISTER_FAIL });
      dispatch({ type: SHOW_INFO_OVERLAY, payload: { message, isError: true } });
      dispatch({ type: SET_MESSAGE, payload: message });

      return Promise.reject();
    }
  );
};

export const adminGetAllUsers = () => (dispatch: Dispatch<any>) => {
  return getAllUsers().then(
    (res: AxiosResponse) => {
      dispatch({ type: GET_ALL_USERS, payload: res.data });
    }
  );
};

export const adminEditUser = (data: AuthRequest) => (dispatch: Dispatch<any>) => {
  return editUser(data).then(
    (res: AxiosResponse) => {
      dispatch({ type: EDIT_USER, payload: res.data });
    }
  );
};


// Logout function to clear relevant cookies based on user type
export const logout = (isAdmin: boolean) => (dispatch: Dispatch<any>) => {
  const message = 'Logging Out! Please login again.';

  // Clear cookies based on user type
  const tokenName = isAdmin ? 'adminToken' : 'userToken';
  const refreshTokenName = isAdmin ? 'adminRefreshToken' : 'userRefreshToken';
  const expiryName = isAdmin ? 'adminTokenExpiry' : 'userTokenExpiry';

  if(!isAdmin){
    localStorage.removeItem('userEmail');
  }

  Cookies.remove(tokenName);
  Cookies.remove(refreshTokenName);
  Cookies.remove(expiryName);

  dispatch({ type: SHOW_INFO_OVERLAY, payload: { message, isError: true } });
  dispatch({ type: isAdmin ? LOGOUT : USER_LOGOUT });
};
