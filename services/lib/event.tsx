import axiosClient from '../apiClient';
import {
  GetEventByIDRequest,
  GetEventByUserRequest,
  GetEventByDateRequest,
  GetEventByDateRangeRequest,
  GetEventByFilterRequest,
  GetEventsBySearchTermRequest,
  AddFeedbackRequest,
  GetFavoritedEventsRequest,
  AddFavoriteEventRequest,
  RemoveFavoriteEventRequest,
} from '../../interface/eventInterface';

function getEvent(params: GetEventByIDRequest) {
  return axiosClient.get(`event/`, { params: params });
}

function getEventByUser(params: GetEventByUserRequest) {
  return axiosClient.get(`event/user/`, { params: params });
}

function getEventByDate(params: GetEventByDateRequest) {
  return axiosClient.get(`event/date/`, { params: params });
}

function getEventByDateRange(params: GetEventByDateRangeRequest) {
  return axiosClient.get(`event/date/range/`, { params: params });
}

function getEventByFilter(data: GetEventByFilterRequest) {
  return axiosClient.post(`event/filter/`, data);
}

function getEventsBySearchTerm(params: GetEventsBySearchTermRequest) {
  return axiosClient.get('event/search/', { params: params });
}

function addFeedback(data: AddFeedbackRequest) {
  return axiosClient.post('event/feedback/', data);
}

function getFavoritedEvents(params: GetFavoritedEventsRequest) {
  return axiosClient.get('event/favorites/', { params: params });
}

function addFavoriteEvent(data: AddFavoriteEventRequest) {
  return axiosClient.post('event/favorites/add/', data);
}

function removeFavoriteEvent(data: RemoveFavoriteEventRequest) {
  return axiosClient.post('event/favorites/remove/', data);
}

function getLocations() {
  return axiosClient.get('event/locations/');
}

export default {
  getEvent,
  getEventByUser,
  getEventByDate,
  getEventByDateRange,
  getEventByFilter,
  getEventsBySearchTerm,
  addFeedback,
  getFavoritedEvents,
  addFavoriteEvent,
  removeFavoriteEvent,
  getLocations,
};
