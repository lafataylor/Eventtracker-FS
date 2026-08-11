import { Dispatch } from 'react';
import { SET_HIDDEN_COLUMNS, RESET_HIDDEN_COLUMNS } from './type';

export const setHiddenColumns = (columns: Object) => (
  dispatch: Dispatch<any>
) => {
  return dispatch({
    type: SET_HIDDEN_COLUMNS,
    payload: columns,
  });
};

export const resetHiddenColumns = () => (dispatch: Dispatch<any>) => {
  return dispatch({
    type: RESET_HIDDEN_COLUMNS,
  });
};
