import { Dispatch } from 'react';
import { Event } from '../../interface/objects/simpleObject';
import { SHOW_EVENT, HIDE_EVENT } from './type';

export const showEvent = (event: Event) => (dispatch: Dispatch<any>) => {
  return dispatch({
    type: SHOW_EVENT,
    payload: event,
  });
};

export const hideEvent = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: HIDE_EVENT,
  });
};
