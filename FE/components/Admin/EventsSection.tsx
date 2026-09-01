import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Event } from '../../interface/objects/simpleObject';
import {
  addToDeletedStack,
  setSelectedEvents,
} from '../../store/actions/selections';
import { useStore } from '../../store/store';
import { Constants } from '../../utils/constants';
import EventsListItem from './EventsListItem';
import {
  columnNameToProperty,
  sortNameToColumnName,
  columnNameToSortOption,
  convertTo24Hr,
  getValueFromColumnName,
  matchSortNameToColumnName,
} from '../../utils/utils';
import {
  requestMiddleware,
  deleteAdminAccounts,
  deleteEvents,
} from '../../services/lib/admin';
import { FaChevronDown, FaArrowDown, FaArrowUp } from 'react-icons/fa';
import { FaBan } from 'react-icons/fa';
import { Option } from '../../interface/filterInterface';

interface EventsSectionProps {
  title: string;
  subTitle?: string;
  events: Event[];
  defaultIsExpanded?: boolean;
  isAlt: boolean;
  onClick: Function;
  setSelectedColumn: Function;
  selectedColumn: string;
  sortOrder: string;
  setSortBy: Function;
  setSortOrder: Function;
  onEventUpdate: Function;
  sortBy: Option;
}

const EventsSection = ({
  title,
  subTitle,
  events,
  defaultIsExpanded,
  isAlt,
  onClick,
  setSelectedColumn,
  selectedColumn,
  sortOrder,
  sortBy,
  setSortOrder,
  setSortBy,
  onEventUpdate,
}: EventsSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [state, dispatch] = useStore();
  const { selections, hiddenColumns } = state;

  const expandedContainerRef = useRef(null);

  useEffect(() => {
    if (defaultIsExpanded) {
      setTimeout(() => {
        setIsExpanded(defaultIsExpanded);
      }, 0);
    }
  }, []);

  const onSelectOrDeselectAllClickedHandler = (isChecked: boolean) => {
    let updatedSelected: Object = { ...selections.events };

    for (let i = 0; i < events.length; i++) {
      if (isChecked) {
        (updatedSelected as any)[events[i].id] = true;
      } else {
        delete (updatedSelected as any)[events[i].id];
      }
    }

    setSelectedEvents(updatedSelected)(dispatch);
  };

  const onSelectOrDeselectHandler = (isChecked: boolean, id: number) => {
    const updatedSelected = { ...selections.events };

    if (isChecked) {
      updatedSelected[id] = isChecked;
    } else {
      delete updatedSelected[id];
    }
    setSelectedEvents(updatedSelected)(dispatch);
  };

  const handleColumnSelect = (column: string, sortOrderValue: string) => {
    const sortOptionValue = columnNameToSortOption(column, sortOrderValue);
    const sortOption = Constants.eventsSortingOptions.find(
      (option) => option.value === sortOptionValue.toString()
    );
    setSortBy(sortOption);
  };

  const handleColumnClick = (column: string) => {
    if (selectedColumn === column) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
        handleColumnSelect(column, 'desc');
      } else {
        setSortOrder('asc');
        handleColumnSelect(column, 'asc');
      }
    } else {
      setSelectedColumn(column);
      setSortOrder('asc');
      handleColumnSelect(column, 'asc');
    }
  };

  const handleUnpinColumn = (e: React.MouseEvent, column: string) => {
    e.stopPropagation();
    setSelectedColumn('');
    setSortOrder('');
    // setSortBy({ value: '', label: 'None' });
  };

  const columns = useMemo(() => {
    const originalColumns = [...Constants.eventsTableColumns];

    // if (selectedColumn !== '') {
    //   const pinnedColumnIndex = originalColumns.indexOf(selectedColumn);
    //   if (pinnedColumnIndex !== -1) {
    //     originalColumns.splice(pinnedColumnIndex, 1);
    //     return [selectedColumn, ...originalColumns];
    //   }
    // }

    return originalColumns;
  }, [selectedColumn]);

  const sortedEvents = useMemo(() => {
    const allEvents = [...events];
    if (selectedColumn !== '' && selectedColumn !== 'Thumbnail') {
      allEvents.sort((a, b) => {
        const valA = getValueFromColumnName(a, selectedColumn);
        const valB = getValueFromColumnName(b, selectedColumn);

        const isDateColumn = ['Start Date', 'End Date', 'Date'].includes(
          selectedColumn
        );
        const isTimeColumn = ['Start Time', 'End Time', 'Time'].includes(
          selectedColumn
        );
        const isPriceColumn = selectedColumn === 'Ticket Price';
        let valueA: any = valA;
        let valueB: any = valB;

        if (isDateColumn) {
          valueA = valA ? new Date(valA) : new Date(0);
          valueB = valB ? new Date(valB) : new Date(0);
        } else if (isTimeColumn) {
          valueA = valA
            ? new Date(`1970-01-01T${convertTo24Hr(valA)}`)
            : new Date(0);
          valueB = valB
            ? new Date(`1970-01-01T${convertTo24Hr(valB)}`)
            : new Date(0);
        } else if (isPriceColumn) {
          valueA = parseFloat((valA ?? '').replace(/[^0-9.-]+/g, '')) || 0;
          valueB = parseFloat((valB ?? '').replace(/[^0-9.-]+/g, '')) || 0;
        } else {
          valueA = valA ? valA.toString().toLowerCase() : '';
          valueB = valB ? valB.toString().toLowerCase() : '';
        }

        if (sortOrder === 'asc') {
          return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
        } else {
          return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
        }
      });
    }

    return allEvents;
  }, [events, selectedColumn, sortOrder]);

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
            onEventUpdate();
          })
          .catch((error) => {
            //console.log(error);
          });
      }
    }
  };

  return (
    <div
      className={
        'flex flex-col h-full ' + (isExpanded ? 'w-full overflow-hidden' : '')
      }
    >
      <div
        onClick={() => {
          deleteItemsInStack();
          setIsExpanded(!isExpanded);
          onClick();
        }}
        className={
          'relative rounded-t-xl before:absolute before:w-2 before:h-[50px] before:bg-beaming-orange-dark before:right-0 before:-bottom-[50px] before:z-[1] shadow-[0px_0px_40px_rgba(0,0,0,0.05)] shadow-dim-shadow flex items-start gap-4 p-4 z-[1px] ' +
          (isAlt ? 'bg-beaming-orange' : 'bg-beaming-orange') +
          ' hover:filter hover:brightness-[90%] hover:cursor-pointer'
        }
      >
        {isExpanded && (
          <div className="absolute bottom-0 left-0 bg-beaming-orange z-[-10] w-[100%] text-beaming-orange">
            ...
          </div>
        )}
        <FaChevronDown
          className="w-4 pt-[2px] mt-2 h-3 text-black transition-transform duration-200"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : '',
          }}
        />
        <div>
          <div className="font-semibold text-black select-none">{title}</div>
          {isExpanded && subTitle && (
            <div className="text-sm select-none text-black">{subTitle}</div>
          )}
        </div>
      </div>
      {isExpanded ? (
        <div
          ref={expandedContainerRef}
          className="flex gap-6 flex-wrap -mt-2 pt-2 rounded-b-xl relative z-1"
        >
          <div
            className={
              'absolute top-0 left-0 w-full h-full opacity-10 ' +
              (isAlt ? 'bg-beaming-orange' : 'bg-beaming-orange')
            }
          ></div>

          <div className="flex flex-col scroll-margin overflow-auto max-h-[calc(100vh-17rem)] rounded-b-xl w-full z-[2]">
            <div className="w-fit sticky z-10 top-0 flex text-midnight font-semibold border-b-2 border-b-beaming-orange">
              <td className="w-[50px] border-r-[1px] border-slate-black text-beaming-orange font-semibold flex justify-center align-middle p-3 whitespace-nowrap bg-beaming-orange-dark">
                <label className="custom_checkbox relative">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      deleteItemsInStack();
                      onSelectOrDeselectAllClickedHandler(e.target.checked);
                    }}
                  />
                  <span className="custom_checkbox_mark"></span>
                </label>
              </td>
              {columns.map((column, index) => (
                <td
                  key={`column_heading_${index}`}
                  className={
                    'border-r-[1px] min-w-[200px] border-slate-black font-semibold flex items-center justify-center align-middle p-3 whitespace-nowrap bg-beaming-orange-dark select-none hover:cursor-pointer hover:filter hover:brightness-90 ' +
                    ((column as string) in hiddenColumns.columns
                      ? 'hidden '
                      : '') +
                    // (index === 0 && selectedColumn !== ''
                    //   ? '!bg-beaming-orange'
                    //   : '') +
                    ((column as string) === 'Address' ? 'w-[400px]' : '')
                  }
                  onClick={() => {
                    deleteItemsInStack();
                    if (column !== 'Thumbnail') {
                      handleColumnClick(column as string);
                    }
                  }}
                >
                  {column}
                  {selectedColumn === column && (
                    <span className="">
                      {/* <FaBan
                        className="inline ml-4"
                        onClick={(e) => handleUnpinColumn(e, column)}
                      /> */}

                      {selectedColumn != 'Thumbnail' ? (
                        sortOrder === 'asc' ? (
                          <FaArrowUp className="inline ml-1" />
                        ) : (
                          <FaArrowDown className="inline ml-1" />
                        )
                      ) : null}
                    </span>
                  )}
                </td>
              ))}
            </div>
            <tbody>
              {events.length === 0 ? null : (
                <>
                  {sortedEvents.map((event, index) => (
                    <EventsListItem
                      key={`event_row_${index}_${event.id}`}
                      event={event}
                      isSelected={event.id in selections.events}
                      setSelected={(isChecked: boolean) => {
                        deleteItemsInStack();
                        onSelectOrDeselectHandler(isChecked, event.id);
                      }}
                      isLast={events.length - 1 === index}
                      columns={columns}
                      isHighlighted={false}
                      onUpdate={onEventUpdate}
                    />
                  ))}
                </>
              )}
            </tbody>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default EventsSection;
