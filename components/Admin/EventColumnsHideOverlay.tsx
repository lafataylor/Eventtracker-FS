import React, { useState } from 'react';
import { setHiddenColumns } from '../../store/actions/hiddenColumns';
import { useStore } from '../../store/store';
import { Constants } from '../../utils/constants';

const EventColumnsHideOverlay = () => {
  const [state, dispatch] = useStore();
  const { hiddenColumns } = state;

  const onSelectOrDeselectHandler = (isChecked: boolean, index: string) => {
    const updatedSelected = { ...hiddenColumns.columns };

    if (isChecked) {
      updatedSelected[index] = isChecked;
    } else {
      delete updatedSelected[index];
    }
    setHiddenColumns(updatedSelected)(dispatch);
  };

  return (
    <div className="rounded-xl absolute top-11 right-0 p-4 bg-slate-black z-[3] shadow-[0px_5.30739px_5.30739px_rgba(0,0,0,0.25)] shadow-transparent-black_bg">
      {/*<div className="flex items-center gap-2 border-[1px] border-ocean-blue bg-white px-4 p-2 rounded-lg ">
        <input
          className="outline-none text-sm"
          placeholder="Search"
          type="text"
        />
      </div>*/}
      <div className="max-h-[200px] overflow-auto flex flex-col gap-2 mt-2 pr-4">
        {Constants.eventsTableColumns.map((column, index) => (
          <div
            key={`hide_column_${index}`}
            className="flex flex-row gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={column in hiddenColumns.columns}
              onChange={(e) =>
                onSelectOrDeselectHandler(e.target.checked, column)
              }
            />
            <span
              className="text-[0.75rem] hover:cursor-pointer"
              onClick={() =>
                onSelectOrDeselectHandler(
                  !(column in hiddenColumns.columns),
                  column
                )
              }
            >
              {column}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventColumnsHideOverlay;
