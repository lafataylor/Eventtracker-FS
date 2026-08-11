import { Dispatch } from 'react';
import { SHOW_MAP, HIDE_MAP, SHOW_SPINNER, HIDE_SPINNER } from './type';
import { geocodeLocation } from '../../utils/geocode';

export const showMap = (location: string) => async (dispatch: Dispatch<any>) => {
  const coordinates = await geocodeLocation(location);
  dispatch({
    type: SHOW_MAP,
    payload: { location, coordinates },
  });
  dispatch({ type: HIDE_SPINNER });
};

export const hideMap = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: HIDE_MAP,
  });
};
