import { CancelToken } from 'axios';
import { Event } from './objects/simpleObject';

export interface GetEventByIDRequest {
  id: string;
}

export interface GetEventByUserRequest {
  user: string;
}

export interface GetEventByDateRequest {
  date: string;
}

export interface GetEventByDateRangeRequest {
  start: string;
  end: string;
}

export interface GetEventByFilterRequest {
  filters: any;
}

export interface GetEventsBySearchTermRequest {
  query: string;
  cancelToken?: CancelToken;
}

export interface AddFeedbackRequest {
  event_id: string;
  changes: string;
}

export interface GetFavoritedEventsRequest {
  email: string;
}

export interface AddFavoriteEventRequest {
  email: string;
  event_ids: string[];
}

export interface RemoveFavoriteEventRequest {
  email: string;
  event_ids: string[];
}

export interface CreateEventFromDashboardRequest {
  single_image: File;
  for_location?: string;
}

export interface CreateEventFromInstagramRequest {
  instagram_url: string;
  for_location?: string;
}

export interface EventResponse {
  status_code: number;
  status: string;
  data: Event;
}

export interface EventsResponse {
  status_code: number;
  status: string;
  data: Event[];
}
