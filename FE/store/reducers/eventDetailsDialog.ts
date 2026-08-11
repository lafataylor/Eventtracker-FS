import { Event } from '../../interface/objects/simpleObject';
import { Constants } from '../../utils/constants';
import { SHOW_EVENT, HIDE_EVENT } from '../actions/type';

export interface StateProps {
  event: null | Event;
}

export const initialState = {
  event: null as null | Event,
};

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case SHOW_EVENT:
      return {
        ...state,
        event: payload,
      };
    case HIDE_EVENT:
      return {
        ...state,
        event: null as null | Event,
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
