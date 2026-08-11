import { Dispatch } from 'react';
import { ADD_ACCOUNTS, CLEAR_ACCOUNTS } from './type';

export const addAccounts = (accounts: string[]) => (dispatch: Dispatch<any>) => {
  dispatch({
    type: ADD_ACCOUNTS,
    payload: accounts,
  });
};

export const clearAccounts = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: CLEAR_ACCOUNTS,
  });
};
