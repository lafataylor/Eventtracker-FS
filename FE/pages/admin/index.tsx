import React, { useState, useEffect, useMemo } from 'react';
import AdminSideBar from '../../components/Admin/AdminSideBar';
import { FiFilter, FiX } from 'react-icons/fi';
import { BiSortAlt2 } from 'react-icons/bi';

import { useRouter } from 'next/router';

import Scrollbars from 'react-custom-scrollbars-2';
import Select, {
  components,
  SingleValue,
  ValueContainerProps,
} from 'react-select';
import { Account } from '../../interface/objects/simpleObject';
import { useStore } from '../../store/store';
import { Constants } from '../../utils/constants';
import AccountsFilter from '../../components/Filter/AccountsFilter';
import AccountsSection from '../../components/Admin/AccountsSection';
import AddAccount from '../../components/Admin/AddAccount';
import DeleteRowsOverlay from '../../components/Admin/DeleteRowsOverlay';
import LoadingDialog from '../../components/overlay/LoadingDialog';
import {
  hideLoadingDialog,
  showLoadingDialog,
} from '../../store/actions/loadingState';
import {
  deleteAdminAccounts,
  deleteEvents,
  readAdminAccounts,
  requestMiddleware,
  refetchToken,
} from '../../services/lib/admin';
import { Option } from '../../interface/filterInterface';
import SearchBar from '../../components/SearchBar';
import SortOverlay from '../../components/SortOverlay';
import ActionDialog from '../../components/overlay/ActionDialog';
import {
  addToDeletedStack,
  resetSelections,
} from '../../store/actions/selections';
import getFilterString, { colorFromClass } from '../../utils/color_convertor';
import DeletionConfirmationOverlay from '../../components/Admin/DeletionConfirmationOverlay';
import InfoOverlay from '../../components/Admin/InfoOverlay';
import { HIDE_INFO_OVERLAY, SHOW_INFO_OVERLAY } from '../../store/actions/type';

const { ValueContainer } = components;

const CustomSelectValueContainer = ({ children, ...props }: any) => {
  let label = props.hasValue ? (props.getValue() as any)[0]['label'] : '';

  if (label == 'None') {
    props.clearValue();
  }

  return (
    <ValueContainer {...props}>
      <div className="flex flex-row items-center justify-center gap-2 hover:cursor-pointer">
        <BiSortAlt2 className="w-4 h-4 text-mist-white" />
        <div className="flex flex-row">{children}</div>
      </div>
    </ValueContainer>
  );
};

const Index = () => {
  const [state, dispatch] = useStore();
  const { selections, loader, search, actionDialog, auth } = state;
  const { overlay } = auth;
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [dynamicValue, setDynamicValue] = useState<string | null>(null);

  const router = useRouter();

  const [sort, setSort] = useState(
    Constants.accountSortingOptions[0] as Option
  );
  const [showSortOverlay, setShowSortOverlay] = useState(false);

  const [addAccount, setAddAccount] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterType, setFilterType] = useState(
    Constants.accountsFilterOptions[0]
  );

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deletionResult, setDeletionResult] = useState({
    success: false,
    count: 0,
    error: null,
  });

  const clearDeletionResult = () => {
    setDeletionResult({
      success: false,
      count: 0,
      error: null,
    });
  };

  useEffect(() => {
    const adminEmailFromSession = localStorage.getItem('adminEmail');

    if (adminEmailFromSession == "dummy_@gmail.com" || adminEmailFromSession == 'superadmin@eventtracker.lafaslist.com'){
      // handle super admin access
    } else {
      router.push("/admin/events")
    }
    
    const storedInfoMessage = localStorage.getItem('infoMessage');
    const storedDynamicValue = localStorage.getItem('dynamicValue');

    if (storedInfoMessage) {
      setInfoMessage(storedInfoMessage);
    }

    if (storedDynamicValue) {
      setDynamicValue(storedDynamicValue);
    }
  }, []);

  useEffect(() => {
    const fetchAccounts = async () => {
      if (await requestMiddleware(dispatch)) {
        showLoadingDialog()(dispatch);
        readAdminAccounts()
          .then((res) => {
            if (res.status == 200) {
              const fetchedAccounts: Account[] = res.data;

              fetchedAccounts.forEach((account) => {
                if (!('status' in account)) {
                  (account as Account).status = 'Tracking';
                }
              });

              fetchedAccounts.sort((a, b) => {
                const dateA = new Date(a.created_at);
                const dateB = new Date(b.created_at);
                return dateB.getTime() - dateA.getTime();
              });

              setAccounts(fetchedAccounts);
            }
            hideLoadingDialog()(dispatch);
          })
          .catch((error) => {
            hideLoadingDialog()(dispatch);
            console.error('Error fetching accounts:', error);
          });
      }
    };
    fetchAccounts();
  }, []);

  const sortAccounts = (accounts: Account[], sortValue: string): Account[] => {
    const [field, order] = sortValue.split('_');

    if (!field || !order) {
      console.warn('Invalid or empty sort value, returning original array.');
      return accounts;
    }

    return accounts.sort((a, b) => {
      let valA: string | number, valB: string | number;

      if (field === 'name') {
        valA = a.user.toLowerCase();
        valB = b.user.toLowerCase();
        return order === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else if (field === 'creation') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
        return order === 'asc' ? valA - valB : valB - valA;
      }

      console.error('No valid sorting field provided:', field);
      return 0;
    });
  };

  const accountsByLocation = useMemo(() => {
    let allAccounts = [...accounts];

    if (sort.value) {
      allAccounts = sortAccounts(allAccounts, sort.value);
    }

    let finalAccounts =
      filterType.value === 'All'
        ? allAccounts
        : allAccounts.filter((account) => account.status === filterType.value);
    finalAccounts = finalAccounts.filter(
      (acc) => !(acc.id in selections.deletedStack)
    );

    const grouped: { [key: string]: Account[] } = {};
    for (const account of finalAccounts) {
      const location = account.forLocation || 'general';
      if (!grouped[location]) {
        grouped[location] = [];
      }
      grouped[location].push(account);
    }

    // ensure general is first if it exists
    const sortedGrouped: { [key: string]: Account[] } = {};
    if (grouped.general) {
      sortedGrouped.general = grouped.general;
      delete grouped.general;
    }
    const sortedKeys = Object.keys(grouped).sort();
    for (const key of sortedKeys) {
      sortedGrouped[key] = grouped[key];
    }

    return sortedGrouped;
  }, [accounts, filterType, sort.value, selections.deletedStack]);

  const searchFilteredAndSortedAccounts = useMemo(() => {
    if (search.accountResults) {
      let allAccounts = [...search.accountResults];

      if (sort.value) {
        allAccounts = sortAccounts(allAccounts, sort.value);
      }

      let finalAccounts =
        filterType.value === 'All'
          ? allAccounts
          : allAccounts.filter(
              (account) => account.status === filterType.value
            );
      finalAccounts = finalAccounts.filter(
        (acc) => !(acc.id in selections.deletedStack)
      );

      return finalAccounts;
    }
    return [];
  }, [search.accountResults, filterType, sort.value, selections.deletedStack]);

  const deleteItemsInStack = async () => {
    const stackItems = { ...selections.accounts };
    const accountsToDelete = Object.keys(stackItems);

    if (await requestMiddleware(dispatch)) {
      deleteAdminAccounts({ accounts: accountsToDelete })
        .then((res) => {
          addToDeletedStack(stackItems)(dispatch);
          resetSelections()(dispatch);
          const updatedAccounts = accounts.filter(
            (account) => !accountsToDelete.includes(account.id.toString())
          );

          setAccounts(updatedAccounts);
          setDeletionResult({
            success: true,
            count: accountsToDelete.length,
            error: null,
          });
        })
        .catch((error) => {
          //console.log('Deletion error: ', error);
          setDeletionResult({
            success: false,
            count: 0,
            error: error.toString(),
          });
        });
    }
  };
  const isFilterSet = () => {
    return filterType != Constants.accountsFilterOptions[0];
  };
  const handleCloseOverlay = () => {
    setInfoMessage(null);
    setDynamicValue(null);
    localStorage.removeItem('infoMessage');
    localStorage.removeItem('dynamicValue');
  };
  const locations = useMemo(
    () => [
      'general',
      ...Array.from(new Set(accounts.flatMap(a => a.forLocation ? [a.forLocation] : []))),
    ],
    [accounts]
  );
  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="accounts" />
      <div
        className="p-8 pb-0 h-full  font-montserrat flex flex-col w-full text-off-white"
        onClick={() => {
          setShowFilter(false);
          setShowSortOverlay(false);
        }}
      >
        <nav className="border-b-4 border-beaming-orange">
          <div className="text-5xl font-bold pb-3 px-3">Manage Accounts</div>
        </nav>
        {addAccount ? (
          <AddAccount
            existingAccounts={accounts}
            hide={() => setAddAccount(false)}
            setInfoMessage={setInfoMessage}
            setDynamicValue={setDynamicValue}
            locations={locations}
          />
        ) : null}
        <div className="flex justify-between mt-5 mb-8 relative">
          <div>
            <button
              onClick={() => {
                setAddAccount(true);
              }}
              className="bg-slate-black px-6 p-2 text-white font-semibold rounded-lg"
            >
              + Add Accounts
            </button>
          </div>
          <div className="flex justify-evenly gap-4 relative z-[3]">
            <SearchBar
              isAccounts={true}
              allAccounts={accounts}
            />
            {false && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSortOverlay(false);
                  setShowFilter(!showFilter);
                }}
                className={
                  'lg:flex hidden group items-center gap-2 border-solid border-[1px] px-3 py-1 rounded-lg relative overflow-clip text-mist-white border-slate-black bg-transparent-white '
                }
              >
                <div
                  className={`w-full h-full bg-pearl-white absolute top-0 left-0 z-0 opacity-0 group-hover:opacity-100 ${
                    isFilterSet() ? 'opacity-100' : ''
                  }`}
                ></div>
                <FiFilter
                  className={`w-4 h-4 z-[1] text-mist-white filter group-hover:!brightness-0 ${
                    isFilterSet() ? '!brightness-0' : ''
                  }`}
                />
                <span
                  className={`z-[1] text-mist-white filter group-hover:!brightness-0 ${
                    isFilterSet() ? '!brightness-0' : ''
                  }`}
                >
                  Filter
                </span>
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowFilter(false);
                setShowSortOverlay(!showSortOverlay);
              }}
              className="lg:flex hidden group items-center gap-2 border-solid border-[1px] px-3 py-1 rounded-lg relative overflow-clip text-mist-white border-slate-black bg-transparent-white  "
            >
              <div
                className={
                  'w-full h-full bg-pearl-white absolute top-0 left-0 z-0 opacity-0 group-hover:opacity-100' +
                  (sort ? (sort.value == '' ? ' ' : ' opacity-100 ') : '')
                }
              ></div>
              <BiSortAlt2
                className={
                  'w-5 h-5 z-[1] text-mist-white filter group-hover:!brightness-0' +
                  (sort ? (sort.value == '' ? ' ' : ' !brightness-0 ') : '')
                }
              />
              <span
                className={
                  'z-[1] text-mist-white filter group-hover:!brightness-0' +
                  (sort ? (sort.value == '' ? ' ' : ' !brightness-0 ') : '')
                }
              >
                Sort
              </span>
            </button>
            {showSortOverlay ? (
              <SortOverlay
                hide={() => setShowSortOverlay(false)}
                value={sort}
                onChange={(newValue: any) => setSort(newValue as Option)}
                options={Constants.accountSortingOptions}
              />
            ) : null}
          </div>
          {showFilter ? (
            <AccountsFilter
              hide={() => setShowFilter(false)}
              value={filterType}
              onChange={setFilterType}
            />
          ) : null}
        </div>

        <div className="flex-1 w-full overflow-x-auto overflow-y-auto pb-8">
          <div className="w-[100%] flex flex-col gap-8  pr-4">
            {search.show ? (
              <AccountsSection
                key="search"
                title="Search Results"
                subTitle={`Showing ${
                  search.accountResults?.length ?? 0
                } account(s)`}
                accounts={searchFilteredAndSortedAccounts}
                isAlt={false}
                defaultIsExpanded={true}
                onClick={() => {}}
              />
            ) : (
              <>
                {Object.entries(accountsByLocation).map(
                  ([location, locationAccounts], index) => (
                    <AccountsSection
                      key={location}
                      title={
                        location === 'general'
                          ? `Accounts with no specified location (${locationAccounts.length})`
                          : `Accounts for ${location} (${locationAccounts.length})`
                      }
                      accounts={locationAccounts}
                      defaultIsExpanded={true}
                      isAlt={index % 2 !== 0}
                      onClick={() => {}}
                    />
                  )
                )}
              </>
            )}
          </div>
          {Object.keys(selections.accounts).length > 0 ? (
            <DeleteRowsOverlay
              isAccounts={true}
              deleteItems={deleteItemsInStack}
            />
          ) : null}
        </div>
      </div>

      {loader.isVisible ? <LoadingDialog /> : null}
      {actionDialog.dialog != null ? <ActionDialog /> : null}
      {deletionResult.success || deletionResult.error ? (
        <DeletionConfirmationOverlay
          itemType={'Account'}
          result={deletionResult}
          onClose={clearDeletionResult}
        />
      ) : null}
      {overlay?.isVisible && (
        <InfoOverlay
          message={overlay.message}
          onClose={() => dispatch({ type: HIDE_INFO_OVERLAY })}
        />
      )}
      {infoMessage && (
        <InfoOverlay
          message={infoMessage}
          dynamicValue={dynamicValue}
          onClose={handleCloseOverlay}
        />
      )}
    </div>
  );
};

export default Index;
