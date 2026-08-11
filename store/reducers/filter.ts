import { SingleValue } from 'react-select';
import { FilterItemProps, Option } from '../../interface/filterInterface';
import { Event } from '../../interface/objects/simpleObject';
import { Constants } from '../../utils/constants';
import {
  SHOW_FILTER_RESULTS,
  UPDATE_FILTER,
  RESET_FILTERS,
  LOADED_EVENTS_BY_FILTER,
} from '../actions/type';

export interface StateProps {
  filters: FilterItemProps[];
  show: boolean;
  results: null | Event[];
}

export const initialState = {
  filters: [
    {
      type: Constants.propertyOptions[0],
      condition: Constants.conditionOptions['default'][0],
      conjugation: Constants.conjugationOptions[0],
      values: [],
    },
  ],
  show: false,
  results: null as null | Event[],
};

function reducer(state = initialState, action: any) {
  const { type, payload } = action;

  switch (type) {
    case SHOW_FILTER_RESULTS:
      return {
        ...state,
        show: true,
      };
    case RESET_FILTERS:
      return {
        ...state,
        show: false,
        results: [],
      };
    case UPDATE_FILTER:
      return {
        ...state,
        filters: payload,
      };
    case LOADED_EVENTS_BY_FILTER:
      return {
        ...state,
        results: payload,
      };
    default:
      return state;
  }
}

export default {
  initialState,
  reducer,
};
