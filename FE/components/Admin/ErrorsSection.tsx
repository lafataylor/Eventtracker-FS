import React, { useEffect, useState } from 'react';
import { Account } from '../../interface/objects/simpleObject';
import { setSelectedAccounts } from '../../store/actions/selections';
import { useStore } from '../../store/store';
import AccountsListItem from './AccountsListItem';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import { FaChevronDown } from 'react-icons/fa';

interface ErrorsSectionProps {
  title: string;
  subTitle: string;
  children: React.ReactNode;
  defaultIsExpanded?: boolean;
  isAlt: boolean;
  onClick: Function;
  tooltip?: {
    text: string;
  };
}

const ErrorsSection = ({
  title,
  subTitle,
  children,
  defaultIsExpanded,
  isAlt,
  onClick,
  tooltip,
}: ErrorsSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (defaultIsExpanded) {
      setIsExpanded(defaultIsExpanded);
    }
  }, []);

  return (
    <div className="flex flex-col relative ">
      <div
        onClick={() => {
          setIsExpanded(!isExpanded);
          onClick();
        }}
        className={
          'rounded-xl shadow-[0px_0px_40px_rgba(0,0,0,0.05)] text-black shadow-dim-shadow flex items-start gap-4 p-4 z-[1] ' +
          (isAlt ? 'bg-beaming-orange' : 'bg-beaming-orange') +
          ' hover:filter hover:brightness-[90%] hover:cursor-pointer'
        }
      >
        <FaChevronDown
          className="w-4  pt-[2px] mt-2 h-3 text-black transition-transform duration-200"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : '',
          }}
        />
        <div className="flex flex-row items-center gap-2">
          <div>
            <div className="font-medium select-none">{title}</div>
            {isExpanded && subTitle && (
              <div className="text-sm select-none">{subTitle}</div>
            )}
          </div>
          {tooltip ? (
            <img
              id={title}
              src="/images/info_trans.png"
              alt="info"
              className="w-9 px-3"
            />
          ) : (
            <></>
          )}
        </div>
        {tooltip ? (
          <ReactTooltip
            anchorId={title}
            place="bottom"
            variant="info"
            content={tooltip.text}
            style={{
              width: '200px',
              borderRadius: '8px',
            }}
          />
        ) : (
          <></>
        )}
      </div>
      {isExpanded ? (
        <div className="flex gap-6 flex-wrap -mt-2 pt-2 rounded-b-xl overflow-clip relative z-0">
          <div
            className={
              'absolute top-0 left-0 w-full h-full opacity-30 ' +
              (isAlt ? 'bg-beaming-orange' : 'bg-beaming-orange')
            }
          ></div>

          {children}
        </div>
      ) : (
        ''
      )}
    </div>
  );
};

export default ErrorsSection;