import { Dispatch } from 'react';
import { ActionDialogProps } from '../../interface/objects/simpleObject';
import { SHOW_ACTION_DIALOG, HIDE_ACTION_DIALOG } from './type';

export const showActionDialog = (dialog: ActionDialogProps) => (
  dispatch: Dispatch<any>
) => {
  dispatch({
    type: SHOW_ACTION_DIALOG,
    payload: dialog,
  });
};

export const hideActionDialog = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: HIDE_ACTION_DIALOG,
  });
};
