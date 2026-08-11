import { Dispatch } from 'react';
import {
  SHOW_IMAGE,
  LOADED_EVENT,
  LOADED_EVENTS_BY_USER,
  LOADED_EVENTS_BY_DATE,
  LOADED_EVENTS_BY_DATE_RANGE,
  LOADED_EVENTS_BY_FILTER,
  LOAD_FAIL,
  SET_MESSAGE,
  USER_FAVORITE_EVENT,
} from './type';

import { AxiosResponse } from 'axios';

import EventService from '../../services/lib/event';

import {
  GetEventByIDRequest,
  GetEventByUserRequest,
  GetEventByDateRequest,
  GetEventByDateRangeRequest,
  GetEventByFilterRequest,
  EventResponse,
  EventsResponse,
} from '../../interface/eventInterface';
import { Event } from '../../interface/objects/simpleObject';

export const loadEventByID = (data: GetEventByIDRequest) => (
  dispatch: Dispatch<any>
) => {
  return EventService.getEvent(data).then(
    (res: AxiosResponse) => {
      const eventRes: Event = res.data;

      dispatch({
        type: LOADED_EVENT,
        payload: eventRes,
      });

      return Promise.resolve();
    },
    (error) => {
      const message =
        (error.response &&
          error.response.data &&
          error.response.data.message) ||
        error.message ||
        error.toString();

      dispatch({
        type: LOAD_FAIL,
      });

      dispatch({
        type: SET_MESSAGE,
        payload: message,
      });

      return Promise.reject();
    }
  );
};

export const loadEventsByUser = (data: GetEventByUserRequest) => (
  dispatch: Dispatch<any>
) => {
  return EventService.getEventByUser(data).then(
    (res: AxiosResponse) => {
      const eventRes: EventsResponse = res.data;

      dispatch({
        type: LOADED_EVENTS_BY_USER,
        payload: eventRes,
      });

      return Promise.resolve();
    },
    (error) => {
      const message =
        (error.response &&
          error.response.data &&
          error.response.data.message) ||
        error.message ||
        error.toString();

      dispatch({
        type: LOAD_FAIL,
      });

      dispatch({
        type: SET_MESSAGE,
        payload: message,
      });

      return Promise.reject();
    }
  );
};

export const favoriteEvent = () => (
  dispatch: Dispatch<any>
) => {
  dispatch({
    type: USER_FAVORITE_EVENT,
    payload: null,
  });
};

// export const register = (data: AuthRequest) => (dispatch: Dispatch<any>) => {
//   return AuthService.register(data).then(
//     (res: AxiosResponse) => {
//       const tokenRes: AuthSuccessResponse = res.data;

//       if (typeof window !== 'undefined')
//         localStorage.setItem('token', tokenRes.jwtToken);

//       dispatch({
//         type: REGISTER_SUCCESS,
//       });

//       return Promise.resolve();
//     },
//     (error) => {
//       const message =
//         (error.response &&
//           error.response.data &&
//           error.response.data.message) ||
//         error.message ||
//         error.toString();

//       dispatch({
//         type: REGISTER_FAIL,
//       });

//       dispatch({
//         type: SET_MESSAGE,
//         payload: message,
//       });

//       return Promise.reject();
//     }
//   );
// };

// export const logout = () => (dispatch: Dispatch<any>) => {
//   if (typeof window !== 'undefined') localStorage.removeItem('token');

//   dispatch({
//     type: LOGOUT,
//   });
// };
