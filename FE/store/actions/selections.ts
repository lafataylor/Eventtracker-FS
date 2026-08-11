import { Dispatch } from 'react';
import {
  SET_SELECTED_ACCOUNTS,
  SET_SELECTED_EVENTS,
  RESET_SELECTIONS,
  ADD_TO_DELETED_STACK,
} from './type';

export const setSelectedAccounts = (accounts: Object) => (
  dispatch: Dispatch<any>
) => {
  return dispatch({
    type: SET_SELECTED_ACCOUNTS,
    payload: accounts,
  });
};

export const setSelectedEvents = (events: Object) => (
  dispatch: Dispatch<any>
) => {
  return dispatch({
    type: SET_SELECTED_EVENTS,
    payload: events,
  });
};

export const resetSelections = () => (dispatch: Dispatch<any>) => {
  return dispatch({
    type: RESET_SELECTIONS,
  });
};

export const addToDeletedStack = (items: Object) => (
  dispatch: Dispatch<any>
) => {
  return dispatch({
    type: ADD_TO_DELETED_STACK,
    payload: items,
  });
};
