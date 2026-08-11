import { Dispatch } from 'react';
import { SHOW_IMAGE, HIDE_IMAGE } from './type';

export const showImage = (imgURL: string) => (dispatch: Dispatch<any>) => {
  return dispatch({
    type: SHOW_IMAGE,
    payload: imgURL,
  });
};

export const hideImage = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: HIDE_IMAGE,
  });
};
