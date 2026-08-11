import React, { useMemo } from 'react';
import EventCard from '../Dashboard/EventCard';
import { Event, ReportedError } from '../../interface/objects/simpleObject';
import { Constants } from '../../utils/constants';
import { useStore } from '../../store/store';
import {
  requestMiddleware,
  resolveError,
  updateEvent,
} from '../../services/lib/admin';
import {
  hideLoadingDialog,
  showLoadingDialog,
} from '../../store/actions/loadingState';
import { showEvent } from '../../store/actions/eventDetailsDialog';
import { formatDate, getProperty } from '../../utils/utils';
import { FaTrashAlt, FaCheck, FaEdit } from 'react-icons/fa';

interface ErrorListItemProps {
  error: ReportedError;
  onResolve: Function;
}

const ErrorListItem = ({ error, onResolve }: ErrorListItemProps) => {
  const [, dispatch] = useStore();

  const isDateField = (field: any) => {
    return field === 'start_date' || field === 'end_date';
  };
  const formatDatetoISO = (dateString: any) => {
    const date = new Date(dateString);
    return date.toISOString();
  };
  const getFields = useMemo(() => {
    const updatedEvent = { ...error.event };
    const changes = JSON.parse(error.changes);

    const field = changes['field_name'];
    const property = getProperty(field);
    let currentValue = '';
    if (property.length == 1) {
      currentValue = (updatedEvent as any)[property[0]];
    } else if (property.length == 2) {
      currentValue = (updatedEvent as any)[property[0]][property[1]];
    }
    const originalValue =
      changes['current'] != null
        ? changes['current'].split(Constants.delimiter).join(', ')
        : '';
    if (isDateField(property[0])) {
      currentValue = formatDate(new Date(currentValue));
    }

    return [
      { label: 'Detail', value: changes['field_name'] },

      {
        label: 'Current',
        value: currentValue,
      },
      {
        label: 'Original *',
        value: originalValue,
      },
      { label: 'Correction', value: changes['correction'] },
    ];
  }, []);

  const onEditEventClickedHandler = () => {
    const updatedEvent = { ...error.event };

    const changes = JSON.parse(error.changes);

    const field = changes['field_name'];
    const property = getProperty(field);

    if (property.length == 1 && (updatedEvent as any)[property[0]] == '') {
      (updatedEvent as any)[property[0]] = changes['correction'];
    } else if (
      property.length == 2 &&
      (updatedEvent as any)[property[0]][property[1]] == null
    ) {
      (updatedEvent as any)[property[0]][property[1]] = changes['correction'];
    }
    showEvent(updatedEvent)(dispatch);
  };

  const onResolveClickedHandler = async () => {
    if (await requestMiddleware(dispatch)) {
      showLoadingDialog()(dispatch);
      resolveError({ id: error.id })
        .then((res) => {
          hideLoadingDialog()(dispatch);
          if (res.status == 200) {
            onResolve(error.id);
          }
        })
        .catch(() => {
          hideLoadingDialog()(dispatch);
        });
    }
  };

  const onAcceptSuggestionClickedHandler = async () => {
    if (await requestMiddleware(dispatch)) {
      showLoadingDialog()(dispatch);

      const updatedEvent = { ...error.event };
      const changes = JSON.parse(error.changes);
      const field = changes['field_name'];
      const property = getProperty(field);

      if (property.length == 1) {
        (updatedEvent as any)[property[0]] = isDateField(property[0])
          ? formatDatetoISO(changes['correction'])
          : changes['correction'];
      } else if (property.length == 2) {
        (updatedEvent as any)[property[0]][property[1]] = isDateField(
          property[1]
        )
          ? formatDatetoISO(changes['correction'])
          : changes['correction'];
      }

      try {
        await updateEvent({ id: updatedEvent.id, event: updatedEvent }); // Save the updated event
        await resolveError({ id: error.id }); // Resolve the error
        onResolve(error.id); // Update the state to remove the error
      } catch (e) {
        console.error(e);
      } finally {
        hideLoadingDialog()(dispatch);
      }
    }
  };

  return (
    <div className="w-full mb-5 grid grid-cols-[1fr_auto] gap-8">
      <div className="w-full p-4 rounded-xl border-[1px] border-beaming-orange flex flex-row gap-6">
        <EventCard event={error.event} disabled={true} />
        <div className="w-full relative flex-1">
          <div className="text-off-white font-[300]">
            Reported at {new Date(error.created_at).toLocaleString()}
          </div>
          <div className="w-full grid grid-cols-[auto_1fr] content-center gap-2 mt-2">
            {getFields.map((field) => (
              <React.Fragment key={field.label}>
                <div
                  className={`py-3 rounded-xl text-sm font-bold z-[1] flex items-center ${
                    field.label === 'Current' ? 'mb-4' : ''
                  }`}
                >
                  {field.label}
                </div>
                <div
                  className={`rounded-xl text-sm flex items-center justify-center py-1 text-black bg-beaming-orange ${
                    field.label === 'Current' ? 'mb-4' : ''
                  }`}
                >
                  {field.value}
                </div>
              </React.Fragment>
            ))}
          </div>
          <div className=" absolute right-0 bottom-0 text-sm ">
            * at the time of reporting
          </div>
        </div>
      </div>
      <div>
        <button
          className="py-2 px-7 w-full flex items-center justify-center gap-3 rounded-lg  border-[1px]  text-white font-medium shadow-xl mb-3"
          onClick={onEditEventClickedHandler}
        >
          <FaEdit className="w-3 h-3" />
          Edit Event Details
        </button>
        <button
          className="py-2 px-7 w-full flex items-center justify-center gap-3 rounded-lg border-solid-red border-[1px] bg-solid-red text-white font-medium shadow-xl mb-3"
          onClick={onResolveClickedHandler}
        >
          <FaTrashAlt className="w-3 h-3" />
          Ignore Suggestion
        </button>
        <button
          className="py-2 px-7 w-full flex items-center justify-center gap-3 rounded-lg border-beaming-orange border-[1px] bg-beaming-orange text-black font-medium shadow-xl"
          onClick={onAcceptSuggestionClickedHandler}
        >
          <FaCheck className="w-3 h-3" />
          Accept Suggestion
        </button>
      </div>
    </div>
  );
};

export default ErrorListItem;
