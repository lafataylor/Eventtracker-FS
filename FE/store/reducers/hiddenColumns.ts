import { SET_HIDDEN_COLUMNS, RESET_HIDDEN_COLUMNS } from '../actions/type';

export interface StateProps {
  columns: Object;
}

export const initialState: StateProps = {
  columns: {},
};

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case SET_HIDDEN_COLUMNS:
      return {
        ...state,
        columns: payload,
      };
    case RESET_HIDDEN_COLUMNS:
      return {
        ...state,
        columns: {},
      };
    default:
      return state;
  }
}

export default { initialState, reducer };
