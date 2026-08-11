import { Dispatch } from 'react';
import Cookies from 'js-cookie';
import axiosClient from '../apiClient';
import { SHOW_INFO_OVERLAY } from '../../store/actions/type';

const getHeader = () => {
  if (typeof window !== 'undefined') {
    const token = Cookies.get('userToken');
    return token ? { Authorization: 'Token ' + token } : {};
  }

  return {};
};

// Constants for token expiry time
const TOKEN_EXPIRY_MINUTES = 58;

// Function to refetch the user token
export async function refetchUserToken(dispatch: Dispatch<any>) {
  try {
    const refreshToken = Cookies.get('userRefreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token stored');
    }

    // Call the API to refresh the token
    const response = await axiosClient.post('/auth/refreshToken/', {
      refreshToken,
    });

    // Extract the new tokens from the response
    const { jwtToken, refreshToken: newRefreshToken } = response.data;
    const now = new Date();
    const expiryTime = now.getTime() + TOKEN_EXPIRY_MINUTES * 60 * 1000;

    // Set the updated tokens in cookies
    Cookies.set('userToken', jwtToken, { expires: 1 });
    Cookies.set('userRefreshToken', newRefreshToken, { expires: 7 });
    Cookies.set('userTokenExpiry', expiryTime.toString(), { expires: 1 });

    // Dispatch a success message to the user
    dispatch({
      type: SHOW_INFO_OVERLAY,
      payload: { message: 'Session refreshed successfully.', isError: false },
    });
  } catch (error) {
    dispatch({
      type: SHOW_INFO_OVERLAY,
      payload: {
        message: 'Session expired. Please log in again.',
        isError: true,
      },
    });
    throw new Error('Failed to refresh user token');
  }
}


export function shareFeedback(text: string, email: string, first_name: string, last_name: string){
  const data = {
    text,
    email,
    first_name,
    last_name,
  }
  return axiosClient.post('admin/feedback/', data, {
    headers: getHeader(),
  });
}