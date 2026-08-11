import { SHOW_MAP, HIDE_MAP } from '../actions/type';

export interface StateProps {
  location: string;
  coordinates: any;
}

export const initialState = { location: '', coordinates: { lat: 36.7783, lng: -119.4179 } };

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case SHOW_MAP:
      return {
        ...state,
        location: payload.location,
        coordinates: payload.coordinates,
      };
    case HIDE_MAP:
      return {
        ...state,
        location: '',
        coordinates: { lat: 36.7783, lng: -119.4179 },
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
