import { ADD_ACCOUNTS, CLEAR_ACCOUNTS } from '../actions/type';

export interface StateProps {
  accounts: string[];
}

export const initialState = { accounts: [] as string[]};

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case ADD_ACCOUNTS:
      if (Array.isArray(payload)) {
        // Ensure the payload is an array of strings before assigning to 'accounts'
        return {
          ...state,
          accounts: payload,
        };
      } else {
        // Handle the case where payload is not an array of strings (Optional)
        return state;
      }
    case CLEAR_ACCOUNTS:
      return {
        ...state,
        accounts: [],
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
