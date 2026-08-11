import { SHOW_POPUP, CLOSE_POPUP } from '../actions/type';

export interface StateProps {
  isVisible: boolean;
}

export const initialState = { isVisible: false };

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case SHOW_POPUP:
      return {
        ...state,
        isVisible: true,
      };
    case CLOSE_POPUP:
      return {
        ...state,
        isVisible: false,
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
