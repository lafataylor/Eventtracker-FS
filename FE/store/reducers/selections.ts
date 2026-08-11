import {
  SET_SELECTED_ACCOUNTS,
  SET_SELECTED_EVENTS,
  RESET_SELECTIONS,
  ADD_TO_DELETED_STACK,
} from '../actions/type';

export interface StateProps {
  accounts: Object;
  events: Object;
  deletedStack: Object;
}

export const initialState: StateProps = {
  accounts: {},
  events: {},
  deletedStack: {},
};

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case SET_SELECTED_ACCOUNTS:
      return {
        ...state,
        accounts: payload,
      };
    case SET_SELECTED_EVENTS:
      return {
        ...state,
        events: payload,
      };
    case RESET_SELECTIONS:
      return {
        ...state,
        accounts: {},
        events: {},
      };
    case ADD_TO_DELETED_STACK:
      return {
        ...state,
        deletedStack: { ...state.deletedStack, ...payload },
      };
    default:
      return state;
  }
}

export default { initialState, reducer };
