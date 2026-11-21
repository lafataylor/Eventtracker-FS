import React, { useState } from 'react';
import { Account } from '../../interface/objects/simpleObject';
import { formatDate } from '../../utils/utils';
import {
  requestMiddleware,
  updateAdminAccount,
} from '../../services/lib/admin';
import { useStore } from '../../store/store';

interface AccountsListItemProps {
  account: Account;
  isSelected: boolean;
  setSelected: Function;
  isLast: boolean;
  /** When true, mobile rows show a checkbox (Select mode). Desktop always shows one. */
  selectionMode?: boolean;
  onTrackFlagsChange?: (
    accountId: number,
    patch: {
      track_feed?: boolean | null;
      track_stories?: boolean | null;
    }
  ) => void;
}

function formatAddedLabel(date: Date): string {
  // Mockup: "Added Nov 14, 2026"
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function trackFeedOn(account: Account): boolean {
  // null / undefined → feed on (historical default)
  return account.track_feed !== false;
}

function trackStoriesOn(account: Account): boolean {
  // null / undefined → stories off
  return account.track_stories === true;
}

const AccountsListItem = ({
  account,
  isSelected,
  setSelected,
  isLast,
  selectionMode = false,
  onTrackFlagsChange,
}: AccountsListItemProps) => {
  const statusLabel = account.status || 'Tracking';
  const [, dispatch] = useStore();
  const [saving, setSaving] = useState<'feed' | 'stories' | null>(null);

  const feedChecked = trackFeedOn(account);
  const storiesChecked = trackStoriesOn(account);

  const toggleFlag = async (field: 'track_feed' | 'track_stories', next: boolean) => {
    if (saving) return;
    setSaving(field === 'track_feed' ? 'feed' : 'stories');
    const previous = {
      track_feed: account.track_feed,
      track_stories: account.track_stories,
    };
    onTrackFlagsChange?.(account.id, { [field]: next });
    try {
      if (!(await requestMiddleware(dispatch))) {
        onTrackFlagsChange?.(account.id, previous);
        return;
      }
      await updateAdminAccount({ id: account.id, [field]: next });
    } catch (error) {
      onTrackFlagsChange?.(account.id, previous);
    } finally {
      setSaving(null);
    }
  };

  const trackControls = (
    <div className="flex flex-col gap-1.5 text-sm text-off-white">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={feedChecked}
          disabled={saving !== null}
          onChange={(e) => toggleFlag('track_feed', e.target.checked)}
        />
        <span>Track feed</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={storiesChecked}
          disabled={saving !== null}
          onChange={(e) => toggleFlag('track_stories', e.target.checked)}
        />
        <span>Track stories</span>
      </label>
    </div>
  );

  return (
    <>
      {/* Mobile list row — owner mockup 2026-11-20 */}
      <div
        className={
          'md:hidden flex items-start gap-3 px-3 py-3.5 ' +
          (isLast ? '' : 'border-b border-slate-black')
        }
      >
        {selectionMode ? (
          <label className="custom_checkbox relative shrink-0 mt-1">
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
          <div className="mt-2">{trackControls}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <span
            className="w-2.5 h-2.5 rounded-full bg-vibrant-green"
            aria-hidden
          />
          <span className="text-off-white text-sm">{statusLabel}</span>
        </div>
      </div>

      {/* Desktop table row — columns extended for Track feed / Track stories */}
      <tr
        className={
          'hidden md:grid grid-cols-[50px_2fr_1fr_1.2fr_1.2fr_1fr] ' +
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
        <td className="border-r-[1px] border-slate-black flex align-middle p-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <input
              type="checkbox"
              checked={feedChecked}
              disabled={saving !== null}
              onChange={(e) => toggleFlag('track_feed', e.target.checked)}
            />
            <span>Track feed</span>
          </label>
        </td>
        <td className="border-r-[1px] border-slate-black flex align-middle p-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <input
              type="checkbox"
              checked={storiesChecked}
              disabled={saving !== null}
              onChange={(e) => toggleFlag('track_stories', e.target.checked)}
            />
            <span>Track stories</span>
          </label>
        </td>
        <td className="align-middle flex p-3">{statusLabel}</td>
      </tr>
    </>
  );
};

export default AccountsListItem;
