import React from 'react';
import { Account } from '../../interface/objects/simpleObject';
import { formatDate } from '../../utils/utils';

interface AccountsListItemProps {
  account: Account;
  isSelected: boolean;
  setSelected: Function;
  isLast: boolean;
  /** When true, mobile rows show a checkbox (Select mode). Desktop always shows one. */
  selectionMode?: boolean;
}

function formatAddedLabel(date: Date): string {
  // Mockup: "Added Nov 14, 2026"
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const AccountsListItem = ({
  account,
  isSelected,
  setSelected,
  isLast,
  selectionMode = false,
}: AccountsListItemProps) => {
  const statusLabel = account.status || 'Tracking';

  return (
    <>
      {/* Mobile list row — owner mockup 2026-11-20 */}
      <div
        className={
          'md:hidden flex items-center gap-3 px-3 py-3.5 ' +
          (isLast ? '' : 'border-b border-slate-black')
        }
      >
        {selectionMode ? (
          <label className="custom_checkbox relative shrink-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => setSelected(e.target.checked)}
            />
            <span className="custom_checkbox_mark"></span>
          </label>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-off-white truncate">
            {account.user}
          </div>
          <div className="text-sm text-stone-gray mt-0.5">
            Added {formatAddedLabel(new Date(account.created_at))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="w-2.5 h-2.5 rounded-full bg-vibrant-green"
            aria-hidden
          />
          <span className="text-off-white text-sm">{statusLabel}</span>
        </div>
      </div>

      {/* Desktop table row — unchanged layout */}
      <tr
        className={
          'hidden md:grid grid-cols-[50px_2fr_1fr_1fr] ' +
          (isLast ? '' : 'border-b-[1px] border-slate-black')
        }
      >
        <td className="border-r-[1px] border-slate-black flex justify-center align-middle p-3">
          <label className="custom_checkbox relative">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => setSelected(e.target.checked)}
            />
            <span className="custom_checkbox_mark"></span>
          </label>
        </td>
        <td className="border-r-[1px] border-slate-black flex align-middle p-3">
          {account.user}
        </td>
        <td className="border-r-[1px] border-slate-black flex align-middle p-3">
          {formatDate(new Date(account.created_at))}
        </td>
        <td className="align-middle flex p-3">{statusLabel}</td>
      </tr>
    </>
  );
};

export default AccountsListItem;
