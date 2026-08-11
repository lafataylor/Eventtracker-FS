import { Dispatch } from 'react';
import { Account, Event } from '../../interface/objects/simpleObject';
import {
  SHOW_SEARCH_RESULTS,
  RESET_SEARCH,
  LOADED_EVENTS_BY_SEARCH,
  LOADED_ACCOUNTS_BY_SEARCH,
  UPDATE_SEARCH_RESULTS,
} from './type';

export const updateSearchResults = (eventResults: Event[], accountResults: Account[]) => ({
  type: UPDATE_SEARCH_RESULTS,
  payload: { eventResults, accountResults },
});

export const showSearchResults = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: SHOW_SEARCH_RESULTS,
  });
};

export const resetSearch = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: RESET_SEARCH,
  });
};

export const setEventsLoadedBySearch = (events: Event[], query: string) => (dispatch: Dispatch<any>) => {
  dispatch({
    type: LOADED_EVENTS_BY_SEARCH,
    payload: { events, query },
  });
};

export const setAccountsLoadedBySearch = (accounts: Account[]) => (dispatch: Dispatch<any>) => {
  dispatch({
    type: LOADED_ACCOUNTS_BY_SEARCH,
    payload: accounts,
  });
};

// New action to update the search loading flag
export const setSearchLoading = (loading: boolean) => (dispatch: Dispatch<any>) => {
  dispatch({
    type: 'SET_SEARCH_LOADING',
    payload: { loading },
  });
};
