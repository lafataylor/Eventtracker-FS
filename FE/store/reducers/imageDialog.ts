import { SHOW_IMAGE, HIDE_IMAGE } from '../actions/type';

export interface StateProps {
  imgURL: string;
}

export const initialState = { imgURL: '' };

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case SHOW_IMAGE:
      return {
        ...state,
        imgURL: payload,
      };
    case HIDE_IMAGE:
      return {
        ...state,
        imgURL: '',
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
