import axiosClient from '../apiClient';
import { AuthRequest } from '../../interface/authInterface';

function adminLogin(data: AuthRequest) {
  return axiosClient.post('auth/login/', data);
}

function adminRegister(data: AuthRequest) {
  return axiosClient.post('auth/register/', data);
}

function userLogin(data: AuthRequest) {
  return axiosClient.post('auth/userLogin/', data);
}

function userRegister(data: AuthRequest) {
  return axiosClient.post('auth/userRegister/', data);
}

export default {
  adminLogin,
  adminRegister,
  userLogin,
  userRegister
};
