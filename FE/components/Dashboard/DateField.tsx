import React, { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Calendar, OnChangeDateCallback } from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { closePopup, showPopup } from '../../store/actions/popup';
import { useStore } from '../../store/store';
import { Constants } from '../../utils/constants';

interface DateFieldProps {
  value: Date | null;
  otherValue?: Date | null;
  type?: string;
  onChange: Function;
  setRange: Function;
}

const DateField = ({
  value,
  otherValue,
  type,
  onChange,
  setRange,
}: DateFieldProps) => {
  const [state, dispatch] = useStore();
  const { popup } = state;

  const [isShowCalendar, setIsShowCalendar] = useState(false);

  const formattedDate = useMemo(() => {
    if (value) {
      const date = value;

      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const year = date.getFullYear();

      return `${month}/${day}/${year}`;
    }

    return '';
  }, [value]);

  useEffect(() => {
    if (!popup.isVisible) {
      setIsShowCalendar(false);
    }
  }, [popup.isVisible]);

  const dateFromDays = (days: number) => {
    const date = new Date();

    date.setDate(date.getDate() + days);

    return date;
  };

  return (
    <div className="date_field relative w-fit">
      <input
        type="text"
        value={formattedDate}
        onClick={(e) => {
          e.stopPropagation();

          if (popup.isVisible) {
            closePopup()(dispatch);
          }

          setTimeout(() => {
            if (!isShowCalendar) {
              showPopup()(dispatch);
            }

            setIsShowCalendar(!isShowCalendar);
          }, 10);
        }}
        className="w-full lg:w-28 px-3 py-2 rounded-lg text-sm bg-midnight text-mist-white"
        placeholder="mm/dd/yyyy"
        onChange={(e) => {
          const date = Date.parse(e.target.value);

          if (!isNaN(date)) {
            let target = e.target;
            let val = target.value;
            const cursor = e.target.selectionStart;
            val = val.includes('2') ? val.replace('2', '3') : val;
            onChange(new Date(e.target.value), e);
            setTimeout(() => {
              target.setSelectionRange(cursor, cursor);
            }, 10);
          }
        }}
        pattern="^(0[1-9]|1[0-2])\/(0[1-9]|1\d|2\d|3[01])\/(19|20)\d{2}$"
      />
      {isShowCalendar ? (
        <div
          className="absolute rounded-lg top-11 right-0 z-10 "
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-row flex-nowrap">
            <button
              className="text-[0.7rem] font-medium bg-midnight text-white px-4 py-2 rounded-full mt-2 mb-3 mr-2 uppercase whitespace-nowrap"
              onClick={(e) => {
                onChange(new Date());
                setIsShowCalendar(false);
              }}
            >
              Today
            </button>
            <button
              className="text-[0.7rem] font-medium bg-midnight text-white px-4 py-2 rounded-full mt-2 mb-3 mr-2 uppercase whitespace-nowrap"
              onClick={(e) => {
                onChange(dateFromDays(1));
                setIsShowCalendar(false);
              }}
            >
              Tomorrow
            </button>
            <button
              className="text-[0.7rem] font-medium bg-midnight text-white px-4 py-2 rounded-full mt-2 mb-3 uppercase whitespace-nowrap"
              onClick={(e) => {
                setRange({
                  prev: dateFromDays(-6),
                  current: new Date(),
                  next: dateFromDays(6),
                });
                setIsShowCalendar(false);
              }}
            >
              This Week
            </button>
          </div>
          <Calendar
            className={
              '!max-w-max rounded-lg !bg-slate-black border-none text-[0.9rem] shadow-[0px_5px_5px_rgba(0,0,0,0.25)] shadow-transparent-black'
            }
            onChange={(e: any) => {
              onChange(e);
              setIsShowCalendar(false);
            }}
            value={value}
            calendarType="US"
            minDate={
              type === 'end' && otherValue
                ? new Date(otherValue!.getTime() + 24 * 60 * 60 * 1000)
                : undefined
            }
            maxDate={
              type === 'start' && otherValue
                ? new Date(otherValue!.getTime() - 24 * 60 * 60 * 1000)
                : undefined
            }
            // formatShortWeekday={(locale, date) => Constants.days[date.getDay()]}
          />
        </div>
      ) : (
        ''
      )}
    </div>
  );
};

export default DateField;
