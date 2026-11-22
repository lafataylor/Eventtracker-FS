import React, { useEffect, useState } from 'react';
import { Account } from '../../interface/objects/simpleObject';
import {
  requestMiddleware,
  deleteAdminAccounts,
  deleteEvents,
} from '../../services/lib/admin';
import {
  addToDeletedStack,
  setSelectedAccounts,
} from '../../store/actions/selections';
import { useStore } from '../../store/store';
import AccountsListItem from './AccountsListItem';
import { FaChevronDown } from 'react-icons/fa';
import {
  accountsDesktopTableGridClass,
  accountsRowShowsTrackingStatus,
} from '../../utils/manageAccountsUi';

/** How many rows to show on mobile before "Show all N accounts". */
const MOBILE_PREVIEW_COUNT = 5;

interface AccountsSectionProps {
  title: string;
  subTitle?: string;
  /** Short city/group label for the mobile accordion header (e.g. "Bali"). */
  cityLabel?: string;
  /** Count shown in the mobile badge; defaults to accounts.length. */
  count?: number;
  accounts: Account[];
  defaultIsExpanded?: boolean;
  isAlt: boolean;
  onClick: Function;
  /** Mobile Select mode — show checkboxes on list rows. */
  selectionMode?: boolean;
  onTrackFlagsChange?: (
    accountId: number,
    patch: {
      track_feed?: boolean | null;
      track_stories?: boolean | null;
    }
  ) => void;
}

const AccountsSection = ({
  title,
  subTitle,
  cityLabel,
  count,
  accounts,
  defaultIsExpanded,
  isAlt,
  onClick,
  selectionMode = false,
  onTrackFlagsChange,
}: AccountsSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultIsExpanded ?? false);
  const [showAllMobile, setShowAllMobile] = useState(false);
  const [state, dispatch] = useStore();
  const { selections } = state;

  const badgeCount = count ?? accounts.length;
  const mobileLabel = cityLabel ?? title;

  useEffect(() => {
    if (defaultIsExpanded) {
      setIsExpanded(defaultIsExpanded);
    }
  }, []);

  useEffect(() => {
    // Reset truncation when the section collapses or the list changes.
    if (!isExpanded) setShowAllMobile(false);
  }, [isExpanded, accounts.length]);

  const onSelectOrDeselectAllClickedHandler = (isChecked: boolean) => {
    let updatedSelected: Object = { ...selections.accounts };

    for (let i = 0; i < accounts.length; i++) {
      if (isChecked) {
        (updatedSelected as any)[accounts[i].id] = true;
      } else {
        delete (updatedSelected as any)[accounts[i].id];
      }
    }

    setSelectedAccounts(updatedSelected)(dispatch);
  };

  const onSelectOrDeselectHandler = (isChecked: boolean, id: number) => {
    const updatedSelected = { ...selections.accounts };

    if (isChecked) {
      updatedSelected[id] = isChecked;
    } else {
      delete updatedSelected[id];
    }
    setSelectedAccounts(updatedSelected)(dispatch);
  };

  const deleteItemsInStack = async () => {
    if ('items' in selections.accounts) {
      const stackItems = { ...selections.accounts.items };
      const data = Object.keys(stackItems);

      if (await requestMiddleware(dispatch)) {
        (selections.accounts.type == 'account'
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

  const mobileVisibleAccounts =
    showAllMobile || accounts.length <= MOBILE_PREVIEW_COUNT
      ? accounts
      : accounts.slice(0, MOBILE_PREVIEW_COUNT);

  const headerClass = isExpanded
    ? 'bg-beaming-orange text-midnight'
    : // Collapsed: dark bar on phone (mockup); keep orange on desktop.
      'bg-slate-black text-off-white border border-stone-gray/50 md:bg-beaming-orange md:text-midnight md:border-0';

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          setIsExpanded(!isExpanded);
          onClick();
        }}
        className={
          'rounded-xl overflow-hidden shadow-[0px_0px_40px_rgba(0,0,0,0.05)] shadow-dim-shadow flex items-center gap-3 p-4 z-[1] w-full text-left hover:filter hover:brightness-[90%] hover:cursor-pointer ' +
          headerClass
        }
      >
        {/* Desktop: chevron left (existing). Mobile: chevron right (mockup). */}
        <FaChevronDown
          className={
            'hidden md:block w-4 h-3 shrink-0 transition-transform duration-200 ' +
            (isExpanded ? 'text-black rotate-180' : 'text-black')
          }
        />
        <div className="min-w-0 flex-1 flex items-center gap-3">
          <div className="font-semibold select-none truncate md:hidden">
            {mobileLabel}
          </div>
          <div className="hidden md:block min-w-0">
            <div className="font-semibold select-none text-midnight">{title}</div>
            {isExpanded && subTitle && (
              <div className="text-sm select-none text-midnight">{subTitle}</div>
            )}
          </div>
          <span
            className={
              'md:hidden shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full ' +
              (isExpanded
                ? 'bg-slate-black/25 text-midnight'
                : 'bg-stone-gray/40 text-off-white')
            }
          >
            {badgeCount}
          </span>
        </div>
        <FaChevronDown
          className={
            'md:hidden w-4 h-4 shrink-0 transition-transform duration-200 ' +
            (isExpanded
              ? 'text-midnight rotate-180'
              : 'text-off-white md:text-black')
          }
        />
      </button>
      {isExpanded ? (
        <div className="flex gap-6 flex-wrap -mt-2 pt-2 rounded-b-xl overflow-clip relative z-0">
          <div
            className={
              'hidden md:block w-full h-full absolute top-0 left-0 opacity-30 ' +
              (isAlt ? 'bg-beaming-orange' : 'bg-beaming-orange')
            }
          ></div>

          {accounts.length == 0 ? (
            <div className="w-full h-full flex items-center justify-center font-medium p-6 pt-8 z-[1]">
              No Accounts Found...
            </div>
          ) : (
            <>
              {/* Mobile stacked list — same select/bulk path as desktop table */}
              <div className="md:hidden w-full z-[1] bg-midnight/40 rounded-b-xl">
                {selectionMode && accounts.length > 0 ? (
                  <div className="flex items-center gap-3 px-3 py-3 border-b border-slate-black">
                    <label className="custom_checkbox relative shrink-0">
                      <input
                        type="checkbox"
                        checked={accounts.every(
                          (account) => account.id in selections.accounts
                        )}
                        onChange={(e) => {
                          deleteItemsInStack();
                          onSelectOrDeselectAllClickedHandler(e.target.checked);
                        }}
                      />
                      <span className="custom_checkbox_mark"></span>
                    </label>
                    <span className="text-sm text-stone-gray font-medium">
                      Select all in this group
                    </span>
                  </div>
                ) : null}
                {mobileVisibleAccounts.map((account, index) => (
                  <AccountsListItem
                    key={account.id}
                    account={account}
                    isSelected={account.id in selections.accounts}
                    setSelected={(isChecked: boolean) => {
                      deleteItemsInStack();
                      onSelectOrDeselectHandler(isChecked, account.id);
                    }}
                    isLast={
                      index === mobileVisibleAccounts.length - 1 &&
                      (showAllMobile ||
                        accounts.length <= MOBILE_PREVIEW_COUNT)
                    }
                    selectionMode={selectionMode}
                    onTrackFlagsChange={onTrackFlagsChange}
                  />
                ))}
                {!showAllMobile && accounts.length > MOBILE_PREVIEW_COUNT ? (
                  <button
                    type="button"
                    className="w-full text-center text-beaming-orange font-semibold py-3.5 text-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAllMobile(true);
                    }}
                  >
                    Show all {accounts.length} accounts
                  </button>
                ) : null}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block w-full overflow-x-auto z-[1]">
                <table className="rounded-b-xl min-w-[720px] w-full h-full">
                  <thead
                    className={
                      'grid text-beaming-orange font-semibold ' +
                      accountsDesktopTableGridClass() +
                      ' border-b-4 border-b-beaming-orange'
                    }
                  >
                    <td className="border-r-[1px] border-slate-black text-beaming-orange font-semibold flex justify-center items-center relative">
                      <label className="custom_checkbox relative">
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            deleteItemsInStack();
                            onSelectOrDeselectAllClickedHandler(
                              e.target.checked
                            );
                          }}
                        />
                        <span className="custom_checkbox_mark"></span>
                      </label>
                    </td>
                    <td className="border-r-[1px] border-slate-black text-beaming-orange font-semibold flex justify-center  align-middle p-3">
                      Username
                    </td>
                    <td className="border-r-[1px] border-slate-black text-beaming-orange font-semibold flex justify-center align-middle p-3">
                      Date Added
                    </td>
                    <td className="border-r-[1px] border-slate-black text-beaming-orange font-semibold flex justify-center align-middle p-3">
                      Track feed
                    </td>
                    <td
                      className={
                        (accountsRowShowsTrackingStatus('desktop')
                          ? 'border-r-[1px] border-slate-black '
                          : '') +
                        'text-beaming-orange font-semibold flex justify-center align-middle p-3'
                      }
                    >
                      Track stories
                    </td>
                    {accountsRowShowsTrackingStatus('desktop') ? (
                      <td className=" border-slate-black align-middle text-beaming-orange font-semibold flex justify-center p-3">
                        Status
                      </td>
                    ) : null}
                  </thead>
                  <div className=" max-h-[30vh] overflow-y-auto">
                    {accounts.map((account, index) => (
                      <AccountsListItem
                        key={account.id}
                        account={account}
                        isSelected={account.id in selections.accounts}
                        setSelected={(isChecked: boolean) => {
                          deleteItemsInStack();
                          onSelectOrDeselectHandler(isChecked, account.id);
                        }}
                        isLast={accounts.length - 1 == index}
                        onTrackFlagsChange={onTrackFlagsChange}
                      />
                    ))}
                  </div>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        ''
      )}
    </div>
  );
};

export default AccountsSection;
