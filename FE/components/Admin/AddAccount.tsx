import { useRouter } from 'next/router';
import React, { useState, useRef, useEffect } from 'react';
import CreatableSelect from 'react-select/creatable';
import { addUser, requestMiddleware } from '../../services/lib/admin';
import {
  hideLoadingDialog,
  showLoadingDialog,
} from '../../store/actions/loadingState';
import { useStore } from '../../store/store';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import { Account } from '../../interface/objects/simpleObject';
import { FiX } from 'react-icons/fi';
import InfoOverlay from './InfoOverlay';
import FollowingListFetchModal from './FollowingListFetchModal';
import { OnChangeValue } from 'react-select';

interface AddAccountProps {
  existingAccounts: Account[];
  hide: Function;
  setInfoMessage: Function;
  setDynamicValue: Function;
  locations: string[];
}

interface LocationOption {
  value: string;
  label: string;
}

function AddAccount({
  existingAccounts,
  hide,
  setInfoMessage,
  setDynamicValue,
  locations,
}: AddAccountProps) {
  const router = useRouter();
  const [state, dispatch] = useStore();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [existingUsernames, setExistingUsernames] = useState<string[]>([]);
  const accountsContainerRef = useRef<HTMLInputElement>(null);
  const accountsFileInputRef = useRef<HTMLInputElement>(null);
  const [isFollowingListFetchModalOpen, setIsFollowingListFetchModalOpen] =
    useState(false);

  const [step, setStep] = useState('selectLocation');
  const [selectedLocation, setSelectedLocation] =
    useState<LocationOption | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const customSelectStyles = {
    control: (provided: any) => ({
      ...provided,
      backgroundColor: '#1E293B',
      borderColor: '#F97316',
      color: 'white',
      borderWidth: '2px',
    }),
    singleValue: (provided: any) => ({
      ...provided,
      color: 'white',
    }),
    input: (provided: any) => ({
      ...provided,
      color: 'white',
    }),
    menu: (provided: any) => ({
      ...provided,
      backgroundColor: '#1E293B',
    }),
    option: (provided: any, state: any) => ({
      ...provided,
      backgroundColor: state.isFocused ? '#334155' : '#1E293B',
      color: 'white',
      ':active': {
        backgroundColor: '#334155',
      },
    }),
  };

  useEffect(() => {
    setExistingUsernames(
      existingAccounts.map((account) => (account.user ?? '').toLowerCase())
    );

    const savedInfoMessage = localStorage.getItem('infoMessage');
    const savedDynamicValue = localStorage.getItem('dynamicValue');

    if (savedInfoMessage) {
      setInfoMessage(savedInfoMessage);
    }
    if (savedDynamicValue) {
      setDynamicValue(savedDynamicValue);
    }
  }, [existingAccounts]);

  useEffect(() => {
    if (step === 'addAccounts' && selectedLocation) {
      const accountsForLocation = existingAccounts
        .filter(
          (acc) => (acc.forLocation || 'general') === selectedLocation.value
        )
        .map((acc) => acc.user)
        .filter((u): u is string => !!u);
      setAccounts(accountsForLocation);
    } else {
      setAccounts([]);
    }
  }, [step, selectedLocation, existingAccounts]);

  const addAccount = (account: string) => {
    const normalizedAccount = account.trim().toLowerCase();
    if (!normalizedAccount) return;

    if (accounts.includes(normalizedAccount)) {
      setAddError(
        `'${normalizedAccount}' is already in the list for this location.`
      );
      return;
    }

    setAccounts((prevAccounts) => [...prevAccounts, normalizedAccount]);
    setAddError(null);
  };

  const addAccounts = (newAccounts: string[]) => {
    const normalizedNewAccounts = newAccounts
      .join(',')
      .split(/[\n,]+/)
      .map((account) => account.trim().toLowerCase())
      .filter((account) => account.length > 0);

    const uniqueNewAccounts: string[] = [];
    let firstError: string | null = null;

    for (const newAccount of normalizedNewAccounts) {
      if (accounts.includes(newAccount)) {
        if (!firstError)
          firstError = `'${newAccount}' is already in the list for this location.`;
        continue;
      }
      if (!uniqueNewAccounts.includes(newAccount)) {
        uniqueNewAccounts.push(newAccount);
      }
    }

    setAddError(firstError);

    if (uniqueNewAccounts.length > 0) {
      setAccounts((prevAccounts) => [...prevAccounts, ...uniqueNewAccounts]);
      setDynamicValue(uniqueNewAccounts.length.toString());
      setInfoMessage(' new unique accounts added.');
    } else {
      setDynamicValue(null);
      setInfoMessage('No new unique accounts to add.');
    }
  };

  const removeAccount = (index: number) => {
    const updatedAccounts = [...accounts];
    updatedAccounts.splice(index, 1);
    setAccounts(updatedAccounts);
  };

  const onAddAccountClickedHandler = async () => {
    if (accounts.length > 0) {
      const existingAccountsForLocation = existingAccounts
        .filter(
          (acc) => (acc.forLocation || 'general') === selectedLocation?.value
        )
        .map((acc) => (acc.user ?? '').toLowerCase());

      const uniqueAccounts = accounts.filter(
        (account) => !existingAccountsForLocation.includes(account.toLowerCase())
      );

      if (uniqueAccounts.length > 0 && (await requestMiddleware(dispatch))) {
        showLoadingDialog()(dispatch);
        const users = uniqueAccounts.map((account) => ({
          user: account,
          is_personal: true,
          for_location: selectedLocation?.value,
        }));

        addUser({ users })
          .then(() => {
            const message = ` new unique accounts added.`;
            setDynamicValue(uniqueAccounts.length.toString());
            setInfoMessage(message);

            // Save message to local storage
            localStorage.setItem('infoMessage', message);
            localStorage.setItem(
              'dynamicValue',
              uniqueAccounts.length.toString()
            );

            hideLoadingDialog()(dispatch);
            router.reload();
          })
          .catch((error) => {
            hideLoadingDialog()(dispatch);
            const message = `Error: ${error}`;
            setDynamicValue(null);
            setInfoMessage(message);

            // Save message to local storage
            localStorage.setItem('infoMessage', message);
            localStorage.setItem('dynamicValue', '');
          });
      } else {
        setDynamicValue(null);
        const message = 'No new unique accounts to add.';
        setInfoMessage(message);

        // Save message to local storage
        localStorage.setItem('infoMessage', message);
        localStorage.setItem('dynamicValue', '');
      }
    }
  };

  const importTextFromFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    e.preventDefault();

    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();

      reader.onload = (event) => {
        const text = event.target?.result as string;
        addAccounts(text.split(','));
        e.target.value = '';
      };

      reader.readAsText(file);
    } else {
      setDynamicValue(null);
      setInfoMessage('No file selected or the file could not be read.');

      // Save message to local storage
      localStorage.setItem(
        'infoMessage',
        'No file selected or the file could not be read.'
      );
      localStorage.setItem('dynamicValue', '');
    }
  };

  const locationOptions: LocationOption[] = locations.map((loc) => ({
    value: loc,
    label: loc,
  }));

  return (
    <>
      <div
        className="fixed top-0 left-0 z-50 flex justify-center items-center  w-[100vw] h-[100vh] backdrop-blur-sm"
        onClick={() => hide()}
      >
        <div
          className="fixed top-1/2 lg:left-1/2 -translate-x-1/2 -translate-y-1/2 justify-between gap-2  lg:w-[40vw] h-full lg:h-fit w-full p-6 px-8 lg:rounded-lg rounded-3xl bg-slate-black shadow-[8px_8px_32px_rgba(0,0,0,0.25)] shadow-transparent-black"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onClick={() => hide()}
            className="flex justify-end absolute right-4 top-4"
          >
            <FiX className="flex justify-end cursor-pointer w-4 h-4 text-white" />
          </div>

          {step === 'selectLocation' ? (
            <div>
              <div className="text-off-white text-3xl font-semibold">
                Select Location
              </div>
              <div className="text-sm mt-14 outline-none">
                Choose a location for the new accounts, or create a new one.
              </div>
              <div className="flex flex-col mt-6 ">
                <span className="pb-1 font-semibold">LOCATION</span>
                <CreatableSelect
                  isClearable
                  options={locationOptions}
                  onChange={(newValue: OnChangeValue<LocationOption, false>) =>
                    setSelectedLocation(newValue)
                  }
                  styles={customSelectStyles}
                  value={selectedLocation}
                />
              </div>
              <div className="flex justify-end mt-8">
                <button
                  className="py-2 px-7 w-fit self-end rounded-lg border-beaming-orange text-white border-[1px] bg-beaming-orange text-midnight font-medium mt-2 disabled:opacity-50"
                  onClick={() => setStep('addAccounts')}
                  disabled={!selectedLocation}
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-off-white text-3xl font-semibold">
                Add New Account(s) to "{selectedLocation?.label}"
              </div>
              <div className="text-sm mt-14 outline-none">
                If the account you want to add is private, you will need to wait
                for its approval of follow request. You can check the status
                under the Status column in the table.
              </div>
              <div className="flex flex-col mt-6 ">
                <span className="pb-1 font-semibold">Enter Username(s)</span>
                {addError && (
                  <span className="text-red-500 text-sm mt-1">{addError}</span>
                )}
                <div
                  ref={accountsContainerRef}
                  className="h-28 w-full border-2 border-slate-black rounded-lg flex flex-row flex-wrap px-3 py-3 gap-2 overflow-y-auto bg-midnight "
                >
                  {accounts.map((account, index) => (
                    <div
                      key={index}
                      className="h-9 w-fit bg-beaming-orange pl-3 pr-2 py-2 text-sm text-black font-medium flex flex-row items-center gap-4 rounded-md"
                    >
                      <span>{account}</span>
                      <img
                        className="w-[0.65rem] hover:cursor-pointer mr-[0.2em]"
                        src="/images/close.png"
                        onClick={() => removeAccount(index)}
                      />
                    </div>
                  ))}
                  <div className="border-[1px] w-40 h-9 border-solid border-beaming-orange px-2 py-1 flex flex-row items-center gap-2 rounded-md">
                    <span className=" text-beaming-orange ">@</span>
                    <input
                      className="w-full text-sm bg-midnight"
                      type="text"
                      placeholder="Account Name"
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') {
                          setAddError(null);
                        }
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const newAccount = e.currentTarget.value.trim();
                          if (newAccount) {
                            addAccount(newAccount);
                            e.currentTarget.value = '';
                          }
                          accountsContainerRef.current?.scrollTo(
                            0,
                            accountsContainerRef.current.scrollHeight
                          );
                        }
                      }}
                      onBlur={(e) => {
                        e.preventDefault();
                        const newAccount = e.currentTarget.value.trim();
                        if (newAccount) {
                          addAccount(newAccount);
                          e.currentTarget.value = '';
                          accountsContainerRef.current?.scrollTo(
                            0,
                            accountsContainerRef.current.scrollHeight
                          );
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
              {isFollowingListFetchModalOpen && (
                <FollowingListFetchModal
                  hide={() => setIsFollowingListFetchModalOpen(false)}
                  addAccounts={addAccounts}
                />
              )}
              <div className="flex flex-col justify-between mt-4">
                <button
                  id="import_accounts"
                  className="py-2 px-7 w-fit flex items-center justify-center gap-3 rounded-lg border-beaming-orange border-[1px] bg-beaming-orange text-midnight font-medium"
                  onClick={() => accountsFileInputRef.current?.click()}
                >
                  <img className="w-5" src="/images/clip.png" />
                  Import Accounts from CSV
                  <input
                    ref={accountsFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => importTextFromFile(e)}
                    accept=".csv, .txt"
                  />
                </button>
                <ReactTooltip
                  anchorId="import_accounts"
                  place="bottom"
                  content="Import accounts from a list in a .txt or .csv file"
                  style={{ backgroundColor: '#282726', color: '#FFFCF0' }}
                />
                <button
                  id="import_following"
                  className="py-2 px-7 mt-4 w-fit flex items-center justify-center gap-3 rounded-lg border-beaming-orange border-[1px] bg-beaming-orange text-midnight font-medium mb-20"
                  onClick={() => setIsFollowingListFetchModalOpen(true)}
                >
                  <img className="w-5" src="/images/clip.png" />
                  Import Following List
                </button>
                <ReactTooltip
                  anchorId="import_following"
                  place="bottom"
                  content="Import following list of a specific account"
                  style={{ backgroundColor: '#282726', color: '#FFFCF0' }}
                />
                <div className="flex justify-between">
                  <button
                    className="py-2 px-7 w-fit self-end rounded-lg border-beaming-orange text-white border-[1px] bg-transparent text-white font-medium mt-2"
                    onClick={() => setStep('selectLocation')}
                  >
                    Back
                  </button>
                  <button
                    className="py-2 px-7 w-fit self-end rounded-lg border-beaming-orange text-white border-[1px] bg-beaming-orange text-midnight font-medium mt-2"
                    onClick={onAddAccountClickedHandler}
                  >
                    Add Accounts{' '}
                    {
                      <span className="font-bold text-sm">
                        ({
                          accounts.filter(
                            (acc) =>
                              !existingAccounts
                                .filter(
                                  (a) =>
                                    (a.forLocation || 'general') ===
                                    selectedLocation?.value
                                )
                                .map((a) => (a.user ?? '').toLowerCase())
                                .includes(acc.toLowerCase())
                          ).length
                        }{' '}
                        new)
                      </span>
                    }
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default AddAccount;
