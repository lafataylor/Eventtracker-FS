import React, { useEffect, useState } from 'react';
import { Event } from '../../interface/objects/simpleObject';
import {
  deleteAdminAccounts,
  deleteEvents,
  requestMiddleware,
  updateEvent,
} from '../../services/lib/admin';
import { showEvent } from '../../store/actions/eventDetailsDialog';
import {
  hideLoadingDialog,
  hideSpinner,
  showSpinner,
} from '../../store/actions/loadingState';
import { addToDeletedStack } from '../../store/actions/selections';
import { useStore } from '../../store/store';
import { Constants } from '../../utils/constants';
import {
  columnNameToProperty,
  getValueFromColumnName,
} from '../../utils/utils';
import EventsListItemMultipleValuesField from './EventsListItemMultipleValuesField';
import EventsListItemSingleValueField from './EventsListItemSingleValueField';
import { SHOW_INFO_OVERLAY } from '../../store/actions/type';

interface EventsListItemProps {
  event: Event;
  isSelected: boolean;
  setSelected: Function;
  isLast: boolean;
  columns: any;
  isHighlighted: boolean;
  onUpdate: Function;
}

const EventsListItem = ({
  event,
  isSelected,
  setSelected,
  isLast,
  columns,
  isHighlighted,
  onUpdate,
}: EventsListItemProps) => {
  const [state, dispatch] = useStore();
  const { selections, hiddenColumns } = state;

  const [updatedEvent, setUpdatedEvent] = useState(event);

  const hasMultipleValues = (column: string) => {
    const value = getValueFromColumnName(updatedEvent, column);

    if (value != null) {
      return value.toString().includes(Constants.delimiter);
    } else {
      return false;
    }
  };

  const getOptions = (value: string) => {
    const valueSplit = value.split(Constants.delimiter);

    const options = valueSplit.map((val) => ({
      value: val,
      label: val,
    }));

    return [
      { custom: true, type: 'label', label: 'Other predicted texts' },
      ...options,
      { custom: true, type: 'add', value: '' },
    ];
  };

  const onValueChangeHandler = (
    propertyName: string,
    value: any,
    setEditing: any
  ) => {
    deleteItemsInStack();

    const fields = propertyName.split(',');

    let finalValue = value;

    if (fields.length > 1) {
      finalValue = { [fields[1]]: value };

      if (fields[0] === 'venue') {
        finalValue = { ...finalValue, id: event.venue.id };
      }
    } else {
      if (fields[0] === 'price') {
        finalValue = finalValue.replace('$', '');
      }
      if (fields[0] === 'start_date' || fields[0] === 'end_date') {
        finalValue = new Date(finalValue).toISOString();
      }
    }

    if (event.id) {
      showSpinner()(dispatch);
      updateEvent({
        id: event.id,
        event: {
          [fields[0]]: finalValue,
        },
      })
        .then(() => {
          hideSpinner()(dispatch);
          const newUpdatedEvent = { ...updatedEvent };
          if (fields.length > 1) {
            if (
              (newUpdatedEvent as any)[fields[0]] &&
              (newUpdatedEvent as any)[fields[0]][fields[1]] &&
              (newUpdatedEvent as any)[fields[0]][fields[1]].includes(
                Constants.delimiter
              )
            ) {
              let values: string[] = (newUpdatedEvent as any)[fields[0]][
                fields[1]
              ].split(Constants.delimiter);

              if (values.includes(value)) {
                values.splice(values.indexOf(value), 1);
              }
              values = [value, ...values];

              finalValue[fields[1]] = values.join(Constants.delimiter);
            }

            (newUpdatedEvent as any)[fields[0]] = {
              ...event.venue,
              ...finalValue,
            };
          } else {
            if ((newUpdatedEvent as any)[fields[0]] != null) {
              if (
                (newUpdatedEvent as any)[fields[0]].includes(
                  Constants.delimiter
                )
              ) {
                let values: string[] = (newUpdatedEvent as any)[
                  fields[0]
                ].split(Constants.delimiter);

                if (values.includes(value)) {
                  values.splice(values.indexOf(value), 1);
                }
                values = [value, ...values];

                finalValue = values.join(Constants.delimiter);
              }
            }

            (newUpdatedEvent as any)[fields[0]] = finalValue;
          }
          setUpdatedEvent(newUpdatedEvent);
          onUpdate();
          setEditing(false);
        })
        .catch((error) => {
          //console.log('Error updating event: ', error);
          const message = 'Failed to update the event. Please try again later.';
          dispatch({
            type: SHOW_INFO_OVERLAY,
            payload: { message, isError: true },
          });
          hideSpinner()(dispatch);
        });
    }
  };

  const deleteItemsInStack = async () => {
    if ('items' in selections.events) {
      const stackItems = { ...selections.events.items };
      const data = Object.keys(stackItems);

      if (await requestMiddleware(dispatch)) {
        (selections.events.type === 'account'
          ? deleteAdminAccounts({ accounts: data })
          : deleteEvents({ events: data })
        )
          .then(() => {
            addToDeletedStack(stackItems)(dispatch);
          })
          .catch((error) => {
            //console.log(error);
          });
      }
    }
  };

  return (
    <tr
      className={
        'w-fit flex flex-row ' +
        (isLast ? '' : 'border-b-[1px] border-slate-black')
      }
    >
      <td className="w-[50px] border-r-[1px] border-slate-black flex justify-center items-center p-3">
        <label className="custom_checkbox relative">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => setSelected(e.target.checked)}
          />
          <span className="custom_checkbox_mark"></span>
        </label>
      </td>
      {(columns as string[]).map((column, index) => {
        if (column === 'Thumbnail') {
          return (
            <td
              key={`column_value_${index}`}
              className={
                'border-r-[1px] w-[200px] border-slate-black flex items-center justify-center p-3 hover:cursor-pointer ' +
                (column in hiddenColumns.columns ? 'hidden ' : '') +
                (index === 0 && isHighlighted ? 'bg-beaming-orange' : '')
              }
              onClick={() => {
                deleteItemsInStack();
                showEvent(event)(dispatch);
              }}
            >
              <img
                className="w-32 h-32 object-cover"
                src={updatedEvent.orig_thumb}
              />
            </td>
          );
        } else if (hasMultipleValues(column)) {
          return (
            <EventsListItemMultipleValuesField
              key={`column_value_${index}_${event.id}_${column}`}
              propertyName={columnNameToProperty(column)}
              isHidden={column in hiddenColumns.columns}
              isHighlighted={index === 0 && isHighlighted}
              options={getOptions(getValueFromColumnName(updatedEvent, column))}
              onChange={onValueChangeHandler}
            />
          );
        } else if (!Constants.readOnlyColumns.includes(column)) {
          return (
            <EventsListItemSingleValueField
              key={`column_value_${index}_${event.id}_${column}`}
              propertyName={columnNameToProperty(column)}
              isHidden={column in hiddenColumns.columns}
              isHighlighted={index === 0 && isHighlighted}
              value={getValueFromColumnName(updatedEvent, column)}
              onChange={onValueChangeHandler}
            />
          );
        } else {
          return (
            <td
              key={`column_value_${index}`}
              className={
                (index < columns.length - 1
                  ? 'border-r-[1px] w-[200px] border-slate-black flex items-center p-3 break-all '
                  : 'min-w-[200px] items-center flex p-3 ') +
                (column in hiddenColumns.columns ? 'hidden ' : '') +
                (index === 0 && isHighlighted ? 'bg-beaming-orange' : '')
              }
            >
              {getValueFromColumnName(updatedEvent, column)}
            </td>
          );
        }
      })}
    </tr>
  );
};

export default EventsListItem;
