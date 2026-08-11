import { Dispatch } from 'react';
import { FilterItemProps } from '../../interface/filterInterface';
import { Event } from '../../interface/objects/simpleObject';
import {
  SHOW_FILTER_RESULTS,
  UPDATE_FILTER,
  RESET_FILTERS,
  LOADED_EVENTS_BY_FILTER,
} from './type';

export const showFilterResults = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: SHOW_FILTER_RESULTS,
  });
};

export const updateFilters = (filters: FilterItemProps[]) => (
  dispatch: Dispatch<any>
) => {
  dispatch({
    type: UPDATE_FILTER,
    payload: filters,
  });
};

export const resetFilters = () => (dispatch: Dispatch<any>) => {
  dispatch({
    type: RESET_FILTERS,
  });
};

export const setEventsLoadedByFilter = (events: Event[]) => (
  dispatch: Dispatch<any>
) => {
  dispatch({
    type: LOADED_EVENTS_BY_FILTER,
    payload: events,
  });
};
