import { ActionDialogProps } from '../../interface/objects/simpleObject';
import { SHOW_ACTION_DIALOG, HIDE_ACTION_DIALOG } from '../actions/type';

export interface StateProps {
  dialog: null | ActionDialogProps;
}

export const initialState = {
  dialog: null as null | ActionDialogProps,
};

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case SHOW_ACTION_DIALOG:
      return {
        ...state,
        dialog: payload,
      };
    case HIDE_ACTION_DIALOG:
      return {
        ...state,
        dialog: null,
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
