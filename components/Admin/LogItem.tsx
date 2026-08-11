import React from 'react';
import { Log } from '../../interface/objects/simpleObject';
import { format24HrTime, formatDate } from '../../utils/utils';
import { FaChevronDown } from 'react-icons/fa';

interface LogItemProps {
  log: Log;
}

const LogItem = ({ log }: LogItemProps) => {
  return (
    <div className="flex flex-row items-center gap-2">
      <FaChevronDown
        className="w-3  pt-[2px] h-3 text-black transition-transform duration-200"
        style={{
          transform: 'rotate(-90deg)',
        }}
      />
      <div className="select-none text-sm text-black">
        Scrape run at{' '}
        {'<' +
          formatDate(new Date(parseInt(log.scraped_at) * 1000)) +
          ' ' +
          format24HrTime(new Date(parseInt(log.scraped_at) * 1000)) +
          '>'}{' '}
        using {log.scraped_by} fetched {log.number_of_new_images} images against{' '}
        {log.number_of_accounts} accounts
      </div>
    </div>
  );
};

export default LogItem;
