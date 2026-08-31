import axiosClient from '../apiClient';
import {
  CreateUserRequest,
  DeleteUserRequest,
  UpdatePreferenceRequest,
  ReadSystemLogsRequest,
  DeleteAccountsRequest,
  DeleteEventsRequest,
  UpdateEventRequest,
  UpdateKeywordsRequest,
  ResolveErrorRequest,
  UpdateLastSeenErrorRequest,
  RunScraperRequest,
  CreateAccountDetailRequest,
  UpdateAccountDetailRequest,
  DeleteAccountDetailRequest,
} from '../../interface/adminInterface';
import { Dispatch } from 'react';
import { checkTokenExpiredStatus } from '../../utils/utils';
import { logout } from '../../store/actions/auth';
import AuthService from './auth';
import Cookies from 'js-cookie';
import { SHOW_INFO_OVERLAY } from '../../store/actions/type';
import { ApifyClient } from 'apify-client';
import { CreateEventFromDashboardRequest, CreateEventFromInstagramRequest } from '../../interface/eventInterface';
import base64 from 'base-64';
import { AuthRequest } from '../../interface/authInterface';

const getHeader = () => {
  if (typeof window !== 'undefined') {
    const token = Cookies.get('adminToken');
    return token ? { Authorization: 'Token ' + token } : {};
  }

  return {};
};

export async function requestMiddleware(
  dispatch: Dispatch<any>
): Promise<boolean> {
  const isExpired = checkTokenExpiredStatus(true);

  if (isExpired) {
    try {
      await refetchToken(dispatch);
      const refreshedToken = Cookies.get('adminToken');
      if (!refreshedToken) {
        throw new Error('Token refresh failed');
      }
      return true;
    } catch (error) {
      console.error('Token refetch failed:', error);
      logout(true)(dispatch);
      return false;
    }
  }

  return true;
}

export function addUser(data: CreateUserRequest) {
  return axiosClient.post('admin/user/', data, {
    headers: getHeader(),
  });
}

export function readAdminAccounts() {
  return axiosClient.get('admin/accounts/', {
    headers: getHeader(),
  });
}

export function deleteAdminAccounts(data: DeleteAccountsRequest) {
  return axiosClient.delete('admin/accounts/', {
    headers: getHeader(),
    data: data,
  });
}

export function deleteUser(data: DeleteUserRequest) {
  return axiosClient.delete(`admin/user/${data.id}/`, {
    headers: getHeader(),
  });
}

export function deleteEvents(data: DeleteEventsRequest) {
  return axiosClient.delete('admin/event/', {
    headers: getHeader(),
    data: data,
  });
}

export function readAdminEvents() {
  return axiosClient.get('admin/event/', {
    headers: getHeader(),
  });
}

export function readLogs() {
  return axiosClient.get('admin/system/logs', {
    headers: getHeader(),
  });
}

export function updateEvent(data: UpdateEventRequest) {
  return axiosClient.put('admin/event/', data, {
    headers: getHeader(),
  });
}

export function readPreferences() {
  return axiosClient.get(`admin/preferences/`, {
    headers: getHeader(),
  });
}

export function updatePreferences(data: UpdatePreferenceRequest) {
  return axiosClient.put(`admin/preferences/`, data, {
    headers: getHeader(),
  });
}

export function readSystemLogs(params: ReadSystemLogsRequest) {
  return axiosClient.get('admin/system/logs/', {
    params: params,
    headers: getHeader(),
  });
}

export function readKeywords() {
  return axiosClient.get('admin/keywords/', {
    headers: getHeader(),
  });
}

export function updateKeywords(data: UpdateKeywordsRequest) {
  return axiosClient.put('admin/keywords/', data, {
    headers: getHeader(),
  });
}

export function checkNewErrors() {
  return axiosClient.get('admin/errors/notifs/', {
    headers: getHeader(),
  });
}

export function updateLastSeenError(data: UpdateLastSeenErrorRequest) {
  return axiosClient.put('admin/errors/notifs/', data, {
    headers: getHeader(),
  });
}

export function readErrors() {
  return axiosClient.get('admin/errors/', {
    headers: getHeader(),
  });
}

export function readFeedback() {
  return axiosClient.get('admin/feedback/', {
    headers: getHeader(),
  });
}

export function resolveError(data: ResolveErrorRequest) {
  return axiosClient.delete('admin/errors/', {
    headers: getHeader(),
    data: data,
  });
}

export function runScraper(data: RunScraperRequest) {
  return axiosClient.post('admin/runScraper/', data, {
    headers: getHeader(),
  });
}

export function createEventFromDashboard(data: CreateEventFromDashboardRequest) {
  const formData = new FormData();
  formData.append('single_image', data.single_image);
  if (data.for_location) {
    formData.append('for_location', data.for_location);
  }

  return axiosClient.post('admin/createEventFromDashboard/', formData, {
    headers: {
      ...getHeader(),
      'Content-Type': 'multipart/form-data',
    },
    timeout: 1000000,
  });
}

const TOKEN_EXPIRY_MINUTES = 58;

export async function refetchToken(dispatch: Dispatch<any>) {
  try {
    const refreshToken = Cookies.get('adminRefreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token stored');
    }

    const response = await axiosClient.post('auth/refreshToken/', {
      refreshToken,
    });

    const newToken = response.data.jwtToken;
    const newRefreshToken = response.data.refreshToken;
    const now = new Date();
    const expiryTime = now.getTime() + TOKEN_EXPIRY_MINUTES * 60 * 1000;

    Cookies.set('adminToken', newToken, { expires: 1 });
    Cookies.set('adminRefreshToken', newRefreshToken, { expires: 1 });
    Cookies.set('tokenExpiry', expiryTime.toString(), { expires: 1 });

    dispatch({
      type: SHOW_INFO_OVERLAY,
      payload: { message: 'Session refreshed successfully.', isError: false },
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    dispatch({
      type: SHOW_INFO_OVERLAY,
      payload: {
        message: 'Session expired. Please log in again.',
        isError: true,
      },
    });
    throw new Error('Failed to refresh token');
  }
}


// scope: 'flagged' (default) = hidden without a surviving twin, i.e. the old
// scraper's flags — the rows worth restoring. 'merged' = collapsed duplicates,
// each reporting what it was kept instead of. 'all' = both.
export function readAdminDuplicates(offset: number = 0, scope: string = 'flagged') {
  return axiosClient.get(
    `event/getDuplicateEvents/?offset=${offset}&scope=${scope}`, {
    headers: getHeader()
  });
}

export function recoverDuplicate(event_id: string) {
  return axiosClient.post('event/recoverDuplicate/', { event_id }, {
    headers: getHeader()
  });
}

// Ticket 1: candidate duplicate PAIRS for side-by-side review.
export function readEventMatches(status: string = 'pending', limit: number = 50) {
  return axiosClient.get(`event/matches/?status=${status}&limit=${limit}`, {
    headers: getHeader()
  });
}

// Ticket 1: record the owner's verdict on a pair.
// action: 'keep_a' | 'keep_b' | 'not_duplicate'
export function resolveEventMatch(match_id: number, action: string) {
  return axiosClient.post('event/matches/resolve/', { match_id, action }, {
    headers: getHeader()
  });
}

export function addDuplicate(event_id: string) {
  return axiosClient.post('event/addDuplicate/', { event_id }, {
    headers: getHeader()
  });
}

export async function getFollowingList(account: string) {
  try {
      // Initialize the ApifyClient with your Apify API token
      const client = new ApifyClient({
          token: process.env.NEXT_PUBLIC_APIFY_API_KEY
      });

      // Prepare Actor input
      const input = {
          "instaId": account
      };

      // Run the Actor and wait for it to finish
      const run = await client.actor("sejinius/instagram-following-scraper").call(input);

      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      const uniqueIds = Array.from(new Set(items.filter(item => item.introduction !== "Suggested for you").map(item => item.id)));
      return uniqueIds;

  } catch (error) {
      console.error('Error fetching followers:', error);
  }
}

export async function uploadImage(image: File) {
  // Convert the File object to a base64 string
  const reader = new FileReader();
  reader.readAsDataURL(image);
  
  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        const formData = new FormData();
        formData.append('image', image);

        const imageReq = await axiosClient.post('admin/uploadImage/', formData, {
          headers: {
            ...getHeader(),
            'Content-Type': 'multipart/form-data',
          },
        });
        resolve(imageReq);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => {
      reject(error);
    };
  });
}

export async function createEventFromInstagram(data: CreateEventFromInstagramRequest) {
  const formData = new FormData();
  formData.append('instagram_url', data.instagram_url);
  if (data.for_location) {
    formData.append('for_location', data.for_location);
  }

  return axiosClient.post('admin/createEventFromInstagram/', formData, {
    headers: {
      ...getHeader(),
      'Content-Type': 'multipart/form-data',
    },
    // A many-slide carousel takes real time server-side (mirror every slide,
    // one vision call over all of them). The client default of 30s would abort
    // requests that are still succeeding, so the owner would see an error for
    // an add that actually worked - then retry and make duplicates. This
    // generous override already existed; do not add a second `timeout` key
    // (duplicate object keys fail the production type check).
    timeout: 1000000,
  });
}


export function getAllUsers() {
  return axiosClient.get('auth/getAllUsers/', {
    headers: getHeader()
  });
}

export function clearGeocode() {
  return axiosClient.delete('admin/geocode/clear/', {
    headers: getHeader()
  });
}

export function editUser(data: any) {
  return axiosClient.put('auth/editUser/', data, {
    headers: getHeader()
  });
}

// Account Details
export function readAccountDetails(account_id?: number) {
  return axiosClient.get('admin/details/', {
    headers: getHeader(),
    params: account_id !== undefined ? { account_id } : {},
  });
}

export function readDetailFields() {
  return axiosClient.get('admin/details/fields/', {
    headers: getHeader(),
  });
}

export function createAccountDetail(data: CreateAccountDetailRequest) {
  return axiosClient.post('admin/details/', data, {
    headers: getHeader(),
  });
}

export function updateAccountDetail(data: UpdateAccountDetailRequest) {
  return axiosClient.put('admin/details/', data, {
    headers: getHeader(),
  });
}

export function deleteAccountDetail(data: DeleteAccountDetailRequest) {
  return axiosClient.delete('admin/details/', {
    headers: getHeader(),
    data,
  });
}
