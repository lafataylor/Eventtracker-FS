import { SHOW_FEEDBACK_DIALOG, HIDE_FEEDBACK_DIALOG } from '../actions/type';

export interface StateProps {
  eventId: string;
  confirmation: boolean;
}

export const initialState = { eventId: '', confirmation: false };

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case SHOW_FEEDBACK_DIALOG:
      return {
        ...state,
        eventId: payload,
      };
    case HIDE_FEEDBACK_DIALOG:
      return {
        ...state,
        eventId: '',
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
