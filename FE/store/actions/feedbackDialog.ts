import { Dispatch } from 'react';
import { SHOW_FEEDBACK_DIALOG, HIDE_FEEDBACK_DIALOG } from './type';

export const showFeedbackDialog = (event_id: string) => (
  dispatch: Dispatch<any>
) => {
  return dispatch({
    type: SHOW_FEEDBACK_DIALOG,
    payload: event_id,
  });
};

export const hideFeedbackDialog = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: HIDE_FEEDBACK_DIALOG,
  });
};
