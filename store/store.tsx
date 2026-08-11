import React, { useContext, useReducer, ReactNode } from 'react';

import AuthReducer, { StateProps as AuthStateProps } from './reducers/auth';
import MessageReducer, {
  StateProps as MessageStateProps,
} from './reducers/message';
import ImageDialogReducer, {
  StateProps as ImageDialogStateProps,
} from './reducers/imageDialog';
import MapDialogReducer, {
  StateProps as MapDialogStateProps,
} from './reducers/mapDialog';
import FeedbackDialogReducer, {
  StateProps as FeedbackDialogStateProps,
} from './reducers/feedbackDialog';
import EventDetailsDialogReducer, {
  StateProps as EventDetailsDialogStateProps,
} from './reducers/eventDetailsDialog';
import PopupReducer, { StateProps as PopupStateProps } from './reducers/popup';
import FilterReducer, {
  StateProps as FilterStateProps,
} from './reducers/filter';
import SelectionsReducer, {
  StateProps as SelectionsStateProps,
} from './reducers/selections';
import HiddenColumnsReducer, {
  StateProps as HiddenColumnsStateProps,
} from './reducers/hiddenColumns';
import LoaderReducer, {
  StateProps as LoaderStateProps,
} from './reducers/loadingState';
import ActionDialogReducer, {
  StateProps as ActionDialogStateProps,
} from './reducers/actionDialog';
import SearchReducer, {
  StateProps as SearchStateProps,
} from './reducers/search';
import ExperimentalReducer, {
  StateProps as ExperimentalStateProps,
} from './reducers/experimental';
import EventReducer, {
  StateProps as EventStateProps,
} from './reducers/event';

interface InitialStateProps {
  auth: AuthStateProps;
  message: MessageStateProps;
  imageDialog: ImageDialogStateProps;
  mapDialog: MapDialogStateProps;
  feedbackDialog: FeedbackDialogStateProps;
  eventDetailsDialog: EventDetailsDialogStateProps;
  popup: PopupStateProps;
  filter: FilterStateProps;
  selections: SelectionsStateProps;
  hiddenColumns: HiddenColumnsStateProps;
  loader: LoaderStateProps;
  actionDialog: ActionDialogStateProps;
  search: SearchStateProps;
  experimental: ExperimentalStateProps;
  event: EventStateProps;
}

interface StoreProviderProps {
  children?: ReactNode;
}

const Store = React.createContext<any>({} as any);
Store.displayName = 'Store';

const initialState: InitialStateProps = {
  auth: AuthReducer.initialState,
  message: MessageReducer.initialState,
  imageDialog: ImageDialogReducer.initialState,
  mapDialog: MapDialogReducer.initialState,
  feedbackDialog: FeedbackDialogReducer.initialState,
  eventDetailsDialog: EventDetailsDialogReducer.initialState,
  popup: PopupReducer.initialState,
  filter: FilterReducer.initialState,
  selections: SelectionsReducer.initialState,
  hiddenColumns: HiddenColumnsReducer.initialState,
  loader: LoaderReducer.initialState,
  actionDialog: ActionDialogReducer.initialState,
  search: SearchReducer.initialState,
  experimental: ExperimentalReducer.initialState,
  event: EventReducer.initialState,
};
const rootReducer = (
  {
    auth,
    message,
    imageDialog,
    mapDialog,
    feedbackDialog,
    eventDetailsDialog,
    popup,
    filter,
    selections,
    hiddenColumns,
    loader,
    actionDialog,
    search,
    experimental,
    event,
  }: InitialStateProps,
  action: any
) => ({
  auth: AuthReducer.reducer(auth, action),
  message: MessageReducer.reducer(message, action),
  imageDialog: ImageDialogReducer.reducer(imageDialog, action),
  mapDialog: MapDialogReducer.reducer(mapDialog, action),
  feedbackDialog: FeedbackDialogReducer.reducer(feedbackDialog, action),
  eventDetailsDialog: EventDetailsDialogReducer.reducer(
    eventDetailsDialog,
    action
  ),
  popup: PopupReducer.reducer(popup, action),
  filter: FilterReducer.reducer(filter, action),
  selections: SelectionsReducer.reducer(selections, action),
  hiddenColumns: HiddenColumnsReducer.reducer(hiddenColumns, action),
  loader: LoaderReducer.reducer(loader, action),
  actionDialog: ActionDialogReducer.reducer(actionDialog, action),
  search: SearchReducer.reducer(search, action),
  experimental: ExperimentalReducer.reducer(experimental, action),
  event: EventReducer.reducer(event, action),
});

export const useStore = () => useContext(Store);

export const StoreProvider = ({ children }: StoreProviderProps) => {
  const [state, dispatch] = useReducer(rootReducer, initialState);

  const store = React.useMemo(() => [state, dispatch], [state]);

  return <Store.Provider value={store}>{children}</Store.Provider>;
};
