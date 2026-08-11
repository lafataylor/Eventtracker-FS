import { Event } from '../../interface/objects/simpleObject';
import {
  SHOW_EVENT,
  HIDE_EVENT,
  USER_FAVORITE_EVENT,
} from '../actions/type';

export interface StateProps {
  events: Event[];
  selectedEvent: null | Event;
  justFavorited: boolean;
}

export const initialState: StateProps = {
  events: [],
  justFavorited: false,
  selectedEvent: null,
};

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case SHOW_EVENT:
      return {
        ...state,
        selectedEvent: payload,
      };
    case HIDE_EVENT:
      return {
        ...state,
        selectedEvent: null,
      };
    case USER_FAVORITE_EVENT:
      return {
        ...state,
        justFavorited: !state.justFavorited,
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
