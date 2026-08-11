import { Dispatch } from 'react';
import { SHOW_POPUP, CLOSE_POPUP } from './type';

export const showPopup = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: SHOW_POPUP,
  });
};

export const closePopup = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: CLOSE_POPUP,
  });
};
