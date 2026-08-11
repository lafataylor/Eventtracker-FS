import { Dispatch } from 'react';
import { SHOW_LOADING_DIALOAG, HIDE_LOADING_DIALOAG, SHOW_SPINNER, HIDE_SPINNER } from './type';

export const showLoadingDialog = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: SHOW_LOADING_DIALOAG,
  });
};

export const hideLoadingDialog = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: HIDE_LOADING_DIALOAG,
  });
};

export const showSpinner = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: SHOW_SPINNER,
  });
};

export const hideSpinner = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: HIDE_SPINNER,
  });
};