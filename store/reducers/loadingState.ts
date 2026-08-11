import { SHOW_LOADING_DIALOAG, HIDE_LOADING_DIALOAG, SHOW_SPINNER, HIDE_SPINNER } from '../actions/type';

export interface StateProps {
  isVisible: boolean;
  isSpinnerVisible: boolean;
}

export const initialState = {
  isVisible: false,
  isSpinnerVisible: false,
};

function reducer(state = initialState, action: any) {
  const { type } = action;

  switch (type) {
    case SHOW_LOADING_DIALOAG:
      return {
        ...state,
        isVisible: true,
      };
    case HIDE_LOADING_DIALOAG:
      return {
        ...state,
        isVisible: false,
      };
    case SHOW_SPINNER:
      return {
        ...state,
        isSpinnerVisible: true,
      };
    case HIDE_SPINNER:
      return {
        ...state,
        isSpinnerVisible: false,
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
