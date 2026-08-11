import React, { useEffect, useMemo, useState } from 'react';
import AdminSideBar from '../../../components/Admin/AdminSideBar';
import { useStore } from '../../../store/store';
import { Constants } from '../../../utils/constants';
import DeleteRowsOverlay from '../../../components/Admin/DeleteRowsOverlay';
import EventCard from '../../../components/Dashboard/EventCard';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import ActionDialog from '../../../components/overlay/ActionDialog';
import {
  hideLoadingDialog,
  hideSpinner,
  showLoadingDialog,
  showSpinner,
} from '../../../store/actions/loadingState';
import {
  deleteEvents,
  readAdminEvents,
  requestMiddleware,
  readAdminDuplicates,
  recoverDuplicate,
  addDuplicate,
} from '../../../services/lib/admin';

import {
  addToDeletedStack,
  resetSelections,
  setSelectedEvents,
} from '../../../store/actions/selections';
import DeletionConfirmationOverlay from '../../../components/Admin/DeletionConfirmationOverlay';
import InfoOverlay from '../../../components/Admin/InfoOverlay';
import {
  HIDE_INFO_OVERLAY,
  SHOW_INFO_OVERLAY,
} from '../../../store/actions/type';
import Spinner from '../../../components/Spinner';
import { Event } from '../../../interface/objects/simpleObject';
import EventDetails from '../../../components/Dashboard/EventDetails';

const Index = () => {
  const [state, dispatch] = useStore();
  const {
    selections,
    loader,
    filter,
    search,
    actionDialog,
    hiddenColumns,
    auth,
    eventDetailsDialog,
  } = state;
  const { overlay } = auth;

  const [duplicateEvents, setDuplicateEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [deletionResult, setDeletionResult] = useState({
    success: false,
    count: 0,
    error: null,
  });

  const [eventIdToMark, setEventIdToMark] = useState('');
  const [markingInProgress, setMarkingInProgress] = useState(false);

  const clearDeletionResult = () => {
    setDeletionResult({
      success: false,
      count: 0,
      error: null,
    });
  };

  const fetchDuplicates = async () => {
    if (await requestMiddleware(dispatch)) {
      showLoadingDialog()(dispatch);
      setIsLoading(true);
      
      try {
        const res = await readAdminDuplicates();
        if (res.status === 200) {
          const duplicates: Event[] = res.data?.duplicate_events || [];
          //console.log('duplicates', duplicates);
          setDuplicateEvents(duplicates);
        }
      } catch (error) {
        const message = error || 'Error fetching duplicate events';
        dispatch({
          type: SHOW_INFO_OVERLAY,
          payload: { message, isError: true },
        });
      } finally {
        hideLoadingDialog()(dispatch);
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const deleteSelectedEvents = async () => {
    if (Object.keys(selections.events).length === 0) return;
    
    const eventsToDelete = Object.keys(selections.events);
    showSpinner()(dispatch);

    if (await requestMiddleware(dispatch)) {
      try {
        await deleteEvents({ events: eventsToDelete });
        addToDeletedStack(selections.events)(dispatch);
        hideSpinner()(dispatch);
        resetSelections()(dispatch);
        setDeletionResult({
          success: true,
          count: eventsToDelete.length,
          error: null,
        });

        // Remove deleted events from the list
        setDuplicateEvents(prev => 
          prev.filter(event => !eventsToDelete.includes(event.id.toString()))
        );
      } catch (error) {
        hideSpinner()(dispatch);
        //console.log('Deletion error: ', error);
        dispatch({
          type: SHOW_INFO_OVERLAY,
          payload: { message: 'Failed to delete events', isError: true },
        });
      }
    }
  };

  const handleRecoverEvent = async (eventId: number) => {
    if (await requestMiddleware(dispatch)) {
      showSpinner()(dispatch);
      try {
        await recoverDuplicate(eventId.toString());
        
        // Remove the recovered event from duplicates
        setDuplicateEvents(prev => 
          prev.filter(event => event.id !== eventId)
        );
        
        dispatch({
          type: SHOW_INFO_OVERLAY,
          payload: { message: 'Event recovered successfully', isError: false },
        });
      } catch (error) {
        dispatch({
          type: SHOW_INFO_OVERLAY,
          payload: { message: 'Failed to recover event', isError: true },
        });
      } finally {
        hideSpinner()(dispatch);
      }
    }
  };

  const handleSelectEvent = (event: Event, isSelected: boolean) => {
    const updatedSelections = {...selections.events};
    
    if (isSelected) {
      updatedSelections[event.id] = true;
    } else {
      delete updatedSelections[event.id];
    }
    
    setSelectedEvents(updatedSelections)(dispatch);
  };

  const handleMarkAsDuplicate = async () => {
    if (!eventIdToMark || eventIdToMark.trim() === '') {
      dispatch({
        type: SHOW_INFO_OVERLAY,
        payload: { message: 'Please enter a valid event ID', isError: true },
      });
      return;
    }

    if (await requestMiddleware(dispatch)) {
      setMarkingInProgress(true);
      showSpinner()(dispatch);
      
      try {
        await addDuplicate(eventIdToMark.trim());
        dispatch({
          type: SHOW_INFO_OVERLAY,
          payload: { message: 'Event marked as duplicate successfully', isError: false },
        });
        
        // Refresh the duplicates list to show the newly marked duplicate
        await fetchDuplicates();
        
        // Clear the input
        setEventIdToMark('');
      } catch (error) {
        dispatch({
          type: SHOW_INFO_OVERLAY,
          payload: { message: 'Failed to mark event as duplicate', isError: true },
        });
      } finally {
        hideSpinner()(dispatch);
        setMarkingInProgress(false);
      }
    }
  };

  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="duplicates" />
      <div
        className="px-8 pt-8 h-full font-montserrat flex flex-col w-full text-off-white overflow-x-auto"
        onClick={() => {}}
      >
        <nav className="border-b-4 border-beaming-orange flex justify-start items-center flex pb-3 gap-4">
          <div className="text-5xl font-bold px-3">Duplicates</div>
        </nav>

        {/*<div className="my-6 p-4 bg-stone-gray bg-opacity-20 rounded-xl">
          <h3 className="text-xl font-bold mb-4 text-beaming-orange">
            Mark an Event as Duplicate
          </h3>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col">
              <label className="text-sm mb-1 text-beaming-orange">Event ID</label>
              <input
                type="text"
                value={eventIdToMark}
                onChange={(e) => setEventIdToMark(e.target.value)}
                className="py-2 px-4 bg-midnight border border-beaming-orange rounded-lg text-off-white focus:outline-none focus:ring-2 focus:ring-beaming-orange"
                placeholder="Enter event ID"
                disabled={markingInProgress}
              />
            </div>
            <button
              className="py-2 px-6 bg-beaming-orange text-black font-medium rounded-lg disabled:opacity-50"
              onClick={handleMarkAsDuplicate}
              disabled={markingInProgress}
            >
              {markingInProgress ? (
                <div className="flex items-center gap-2">
                  <Spinner colorClass="text-black" size={16} />
                  <span>Processing...</span>
                </div>
              ) : (
                'Mark as Duplicate'
              )}
            </button>
          </div>
        </div>*/}

        <div className="flex-1 w-full overflow-x-auto overflow-y-auto py-8">
          {isLoading ? (
            <div className="w-full h-64 flex items-center justify-center">
              <Spinner colorClass="text-beaming-orange" size={48} />
            </div>
          ) : duplicateEvents.length === 0 ? (
            <div className="w-full h-64 flex items-center justify-center text-xl">
              No duplicate events found
            </div>
          ) : (
            <div className="flex flex-wrap gap-6">
              {duplicateEvents.map((event) => (
                <div key={`event-${event.id}`} className="relative p-4 bg-stone-gray bg-opacity-20 rounded-xl">
                  <div className="mb-2">
                    <label className="custom_checkbox relative rounded-full">
                      <input
                        type="checkbox"
                        className="rounded-full"
                        checked={!!selections.events[event.id]}
                        onChange={(e) => handleSelectEvent(event, e.target.checked)}
                      />
                      <span className="custom_checkbox_mark"></span>
                    </label>
                  </div>
                  
                  <div className="w-64">
                    <EventCard
                      event={event}
                      disabled={false}
                      isFavorite={false}
                    />
                  </div>
                  
                  {event.duplicate_link && (
                    <div className="mt-2 mb-2">
                      <a 
                        href={event.duplicate_link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-beaming-orange hover:underline"
                      >
                        View Original Post
                      </a>
                    </div>
                  )}
                  
                  <div className="flex mt-2 gap-2">
                    <button
                      className="py-2 px-4 w-full flex items-center justify-center gap-2 rounded-lg border-beaming-orange border-[1px] bg-beaming-orange text-black font-medium"
                      onClick={() => handleRecoverEvent(event.id)}
                    >
                      Recover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {Object.keys(selections.events).length > 0 && (
          <DeleteRowsOverlay
            isAccounts={false}
            deleteItems={deleteSelectedEvents}
          />
        )}

        <EventDetails isEdit={true} />
      </div>

      {loader.isVisible && <LoadingDialog />}
      {actionDialog.dialog != null && <ActionDialog />}
      {(deletionResult.success || deletionResult.error) && (
        <DeletionConfirmationOverlay
          itemType="Event"
          result={deletionResult}
          onClose={clearDeletionResult}
        />
      )}
      {overlay.isVisible && (
        <InfoOverlay
          message={overlay.message}
          onClose={() => dispatch({ type: HIDE_INFO_OVERLAY })}
        />
      )}
    </div>
  );
};

export default Index;
