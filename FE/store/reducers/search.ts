import {
  SHOW_SEARCH_RESULTS,
  RESET_SEARCH,
  LOADED_EVENTS_BY_SEARCH,
  LOADED_ACCOUNTS_BY_SEARCH,
  UPDATE_SEARCH_RESULTS,
} from '../actions/type';
import { Account, Event } from '../../interface/objects/simpleObject';

export interface StateProps {
  show: boolean;
  eventResults: Event[] | null;
  accountResults: Account[] | null;
  loading: boolean;
  query: string;
}

export const initialState: StateProps = {
  show: false,
  eventResults: null as null | Event[],
  accountResults: null as null | Account[],
  loading: false,
  query: '',
};

function reducer(state = initialState, action: any): StateProps {
  const { type, payload } = action;

  switch (type) {
    case SHOW_SEARCH_RESULTS:
      return { ...state, show: true };
    case RESET_SEARCH:
      return { ...state, show: false, eventResults: null, accountResults: null, loading: false };
    case LOADED_EVENTS_BY_SEARCH:
      return { ...state, eventResults: payload.events, query: payload.query };
    case LOADED_ACCOUNTS_BY_SEARCH:
      return { ...state, accountResults: payload };
    case UPDATE_SEARCH_RESULTS:
      return { ...state, eventResults: payload.eventResults, accountResults: payload.accountResults };
    case 'SET_SEARCH_LOADING':
      return { ...state, loading: payload.loading };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
