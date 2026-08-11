import React, { useEffect, useState } from 'react';
import AdminSideBar from '../../../components/Admin/AdminSideBar';

import Scrollbars from 'react-custom-scrollbars-2';
import Select from 'react-select';
import {
  Account,
  KeywordColActivations,
  Keywords,
  Log,
} from '../../../interface/objects/simpleObject';
import { useStore } from '../../../store/store';
import { Constants } from '../../../utils/constants';
import AccountsFilter from '../../../components/Filter/AccountsFilter';
import AccountsSection from '../../../components/Admin/AccountsSection';
import AddAccount from '../../../components/Admin/AddAccount';
import DeleteRowsOverlay from '../../../components/Admin/DeleteRowsOverlay';
import SettingsSection from '../../../components/Admin/SettingsSection';
import LogItem from '../../../components/Admin/LogItem';
import {
  readKeywords,
  readPreferences,
  readSystemLogs,
  requestMiddleware,
  updateKeywords,
  updatePreferences,
} from '../../../services/lib/admin';
import {
  hideLoadingDialog,
  showLoadingDialog,
} from '../../../store/actions/loadingState';
import LoadingDialog from '../../../components/overlay/LoadingDialog';

import ActionDialog from '../../../components/overlay/ActionDialog';
import {
  hideActionDialog,
  showActionDialog,
} from '../../../store/actions/actionDialog';

const tailwindConfig = require('../../../tailwind.config.js');
const colors = tailwindConfig.theme.colors;

const sunnyGold = colors['beaming-orange'];
const midnight = colors['midnight'];
const slateBlack = colors['slate-black'];
const mistWhite = colors['mist-white'];

const index = () => {
  const [state, dispatch] = useStore();
  const { selections, loader, actionDialog } = state;

  const [lastClickedSection, setLastClickedSection] = useState('');

  const [syncOption, setSyncOption] = useState('api');
  const [persistenceOption, setPersistenceOption] = useState(
    Constants.persistenceOptions[0]
  );
  const [prompt, setPrompt] = useState('');
  const [logs, setLogs] = useState([] as Log[]);
  const [keywords, setKeywords] = useState({
    'Event Name': [],
    'Event Price': [],
    Venue: [],
    Location: [],
    'Event Date': [],
    'Event Time': [],
    Artist: [],
    'With/Opener': [],
    Host: [],
    Promoter: [],
    Offering: [],
  } as Keywords);
  const [keywordActivatedCol, setKeywordActivatedCol] = useState('');
  const [activatedColKeywords, setActivatedColKeywords] = useState(
    [] as string[]
  );
  const [highlightedCol, setHighlightedCol] = useState('');

  const customStyles: Object = {
    option: (provided: any, state: any) => ({
      ...provided,
      color: state.isSelected ? mistWhite : mistWhite,
      borderRadius: '8px',
      padding: '10px 20px',
      backgroundColor: state.isSelected ? slateBlack : 'none',
      cursor: state.isSelected ? 'auto' : 'pointer',
      whiteSpace: 'nowrap',
      fontSize: '0.8rem',
      '&:active': {
        backgroundColor: mistWhite,
      },
    }),
    control: (styles: React.CSSProperties) => ({
      ...styles,
      backgroundColor: midnight,
      border: 'none',
      padding: '4px 5px',
      borderRadius: '8px',
      boxShadow: 'none',
      color: mistWhite,
    }),
    menu: (style: React.CSSProperties) => ({
      ...style,
      backgroundColor: midnight,
      borderRadius: '10px',
      padding: '10px',
      width: 'max-content',
      right: 0,
    }),
    indicatorSeparator: () => null,
    dropdownIndicator: (style: React.CSSProperties) => ({
      ...style,
      color: mistWhite,
    }),
    singleValue: (style: React.CSSProperties) => ({
      ...style,
      fontSize: '0.8rem',
      color: mistWhite,
      fontWeight: '500',
    }),
    valueContainer: (style: React.CSSProperties) => ({
      ...style,
      color: mistWhite,
    }),
    container: (style: React.CSSProperties) => ({
      ...style,
      minWidth: '120px',
    }),
  };

  useEffect(() => {
    const fetchPreferences = async () => {
      if (await requestMiddleware(dispatch)) {
        showLoadingDialog()(dispatch);
        readPreferences()
          .then((res) => {
            if (res.status == 200) {
              if (res.data.status == 'success') {
                setSyncOption(res.data.data['use']);

                let persistenceVal = res.data.data['persistence_day_count'];
                let persistenceValFiltered =
                  Constants.persistenceOptions.filter(
                    (option) => parseInt(option.value) == persistenceVal
                  );

                setPersistenceOption(
                  persistenceValFiltered.length > 0
                    ? persistenceValFiltered[0]
                    : Constants.persistenceOptions[0]
                );

                setPrompt(res.data.data['prompt']);
              }
            }

            hideLoadingDialog()(dispatch);
          })
          .catch((error) => {
            alert(error);
            hideLoadingDialog()(dispatch);
          });

        // readSystemLogs({})
        //   .then((res) => {
        //     if (res.status == 200) {
        //       if (res.data.status == 'success') {
        //         setLogs(res.data.data);
        //       }
        //     }
        //   })
        //   .catch((error) => {
        //     alert(error);
        //   });

        readKeywords()
          .then((res) => {
            if (res.status == 200) {
              if (res.data.status == 'success') {
                setKeywords(res.data.data);
              }
            }
          })
          .catch((error) => {
            alert(error);
          });
      }
    };

    fetchPreferences();
  }, []);

  const onPreferenceChangedHandler = async (newVal: any, property: string) => {
    const data = {
      use: syncOption,
      persistence_day_count: parseInt(persistenceOption.value),
      prompt: prompt,
    };

    if (property == 'use') {
      setSyncOption(newVal);
      data['use'] = newVal;
    } else if (property == 'persistence_day_count') {
      setPersistenceOption(newVal);
      data['persistence_day_count'] = parseInt(newVal.value);
    } else if (property == 'prompt') {
      setPrompt(newVal);
      data['prompt'] = prompt;
    }

    if (await requestMiddleware(dispatch)) {
      showLoadingDialog()(dispatch);
      updatePreferences(data)
        .then(() => {
          hideLoadingDialog()(dispatch);
        })
        .catch((error) => {
          alert(error);
          hideLoadingDialog()(dispatch);
        });
    }
  };

  const handlePromptChange = (event: any) => {
    setPrompt(event.target.value);
  };

  const addKeyword = (col: string, keyword: string) => {
    const updatedKeywords = [...activatedColKeywords];

    if (!updatedKeywords.includes(keyword)) {
      updatedKeywords.push(keyword);
      (updatedKeywords as any)[col] = updatedKeywords;

      setActivatedColKeywords(updatedKeywords);
    }
  };

  const removeKeyword = (keyword: string) => {
    const updatedKeywords = [...activatedColKeywords];

    updatedKeywords.splice(updatedKeywords.indexOf(keyword), 1);

    setActivatedColKeywords(updatedKeywords);
  };

  const toggleColActivation = async (col: string) => {
    if (keywordActivatedCol == '') {
      setKeywordActivatedCol(col);
      setActivatedColKeywords((keywords as any)[col]);
    } else if (col == keywordActivatedCol) {
      const updatedKeywords = { ...keywords };
      const existingColKeywords = [...(updatedKeywords as any)[col]];

      let isUpdated = existingColKeywords.length != activatedColKeywords.length;

      if (!isUpdated) {
        for (let i = 0; i < activatedColKeywords.length; i++) {
          if (!existingColKeywords.includes(activatedColKeywords[i])) {
            isUpdated = true;
            break;
          }
        }
      }

      setHighlightedCol('');

      if (isUpdated) {
        if (await requestMiddleware(dispatch)) {
          showLoadingDialog()(dispatch);
          updateKeywords({
            column_name: keywordActivatedCol,
            keywords: activatedColKeywords,
          })
            .then(() => {
              hideLoadingDialog()(dispatch);

              (updatedKeywords as any)[col] = activatedColKeywords;

              setKeywords(updatedKeywords);

              setKeywordActivatedCol('');
              setActivatedColKeywords([]);
            })
            .catch((error) => {
              alert(error);
              hideLoadingDialog()(dispatch);
            });
        }
      } else {
        setKeywordActivatedCol('');
        setActivatedColKeywords([]);
      }
    } else {
      const existingKeywords = { ...keywords };
      const existingColKeywords = [
        ...(existingKeywords as any)[keywordActivatedCol],
      ];

      let isUpdated = existingColKeywords.length != activatedColKeywords.length;

      if (!isUpdated) {
        for (let i = 0; i < activatedColKeywords.length; i++) {
          if (!existingColKeywords.includes(activatedColKeywords[i])) {
            isUpdated = true;
            break;
          }
        }
      }

      setHighlightedCol('');

      if (isUpdated) {
        showActionDialog({
          title: 'Warning: Unsaved Changes',
          body: `You’ve made some changes against ${col} that you have not saved. How would you like to proceed?`,
          buttons: [
            {
              type: 'delete',
              label: 'Discard Changes',
              onClick: () => {
                hideActionDialog()(dispatch);
                setKeywordActivatedCol('');
                setActivatedColKeywords([]);
              },
            },
            {
              type: 'cancel',
              label: 'Review Changes',
              onClick: () => {
                hideActionDialog()(dispatch);
                setHighlightedCol(keywordActivatedCol);
              },
            },
            {
              type: 'submit',
              label: 'Save Changes',
              onClick: async () => {
                hideActionDialog()(dispatch);
                if (await requestMiddleware(dispatch)) {
                  showLoadingDialog()(dispatch);
                  updateKeywords({
                    column_name: keywordActivatedCol,
                    keywords: activatedColKeywords,
                  })
                    .then(() => {
                      hideLoadingDialog()(dispatch);

                      const updatedKeywords = { ...keywords };

                      (updatedKeywords as any)[col] = activatedColKeywords;

                      setKeywords(updatedKeywords);

                      setKeywordActivatedCol('');
                      setActivatedColKeywords([]);
                    })
                    .catch((error) => {
                      alert(error);
                      hideLoadingDialog()(dispatch);
                    });
                }
              },
            },
          ],
        })(dispatch);
      } else {
        setKeywordActivatedCol(col);
        setActivatedColKeywords((keywords as any)[col]);
      }
    }
  };

  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="settings" />
      <div className="h-full  font-montserrat flex flex-col w-full text-off-white">
        <div className="px-8 pt-8 h-full  font-montserrat flex flex-col w-full text-off-white overflow-y-auto">
          <nav className="border-b-4 border-beaming-orange">
            <div className="text-5xl font-semibold pb-3 px-3">Settings</div>
          </nav>
          <div className="flex flex-col font-semibold  pt-6 gap-5 text-sm  h-full px-1 ">
            {/*<Scrollbars className="container-scroll">*/}
            <div className="w-[99%] pr-5 flex flex-col gap-8 pb-8">
              {/*<SettingsSection
                  title="Accounts management settings"
                  defaultIsExpanded={true}
                  isAlt={lastClickedSection != 'sync'}
                  onClick={() => setLastClickedSection('sync')}
                >
                  <div className="flex gap-6 flex-1 -mt-2 p-6 pt-8 rounded-b-xl z-[1]">
                    <div className="flex items-start self-start gap-5">
                      <label className="font-medium">
                        Sync account media using:
                      </label>
                      <div className="flex flex-col -mt-2">
                        <span
                          className={
                            'flex items-center gap-3 hover:cursor-pointer p-2 rounded-lg ' +
                            (syncOption == 'api'
                              ? 'bg-slate-black'
                              : '')
                          }
                          onClick={() =>
                            onPreferenceChangedHandler('api', 'use')
                          }
                        >
                          <input
                            type="radio"
                            name="ss"
                            checked={syncOption == 'api'}
                            className="setting_sync_inp_radio"
                          />
                          Instagram API
                        </span>
                        <span
                          className={
                            'flex items-center gap-3 hover:cursor-pointer p-2 rounded-lg ' +
                            (syncOption == 'scraper'
                              ? 'bg-slate-black'
                              : '')
                          }
                          onClick={() =>
                            onPreferenceChangedHandler('scraper', 'use')
                          }
                        >
                          <input
                            type="radio"
                            name="ss"
                            checked={syncOption == 'scraper'}
                            className="setting_sync_inp_radio"
                          />
                          Instagram Scraper
                        </span>
                      </div>
                    </div>
                  </div>
                </SettingsSection> */}
              <div className="z-10">
                <SettingsSection
                  title="Event Deletion"
                  defaultIsExpanded={true}
                  isAlt={lastClickedSection != 'manage'}
                  onClick={() => setLastClickedSection('manage')}
                >
                  <div className="flex gap-6 pl-10  flex-1 -mt-2 p-6 pt-8 rounded-b-xl z-[1]">
                    <div className="flex items-center gap-5 self-start">
                      <label className="font-medium whitespace-nowrap">
                        Delete events after:
                      </label>
                      <div className="flex flex-col">
                        <Select
                          onChange={(newVal) =>
                            onPreferenceChangedHandler(
                              newVal,
                              'persistence_day_count'
                            )
                          }
                          value={persistenceOption}
                          options={Constants.persistenceOptions}
                          styles={customStyles}
                          isSearchable={false}
                          menuPlacement="auto"
                          menuPosition="fixed"
                        />
                      </div>
                      <div className="text-[0.75rem]">
                        *Events will be irreversibly deleted from the database
                        after the Event Date has passed this set number of days
                      </div>
                    </div>
                  </div>
                </SettingsSection>
              </div>
              <SettingsSection
                title="Labelling Prompt"
                defaultIsExpanded={true}
                isAlt={lastClickedSection != 'extraction'}
                onClick={() => setLastClickedSection('extraction')}
              >
                <div className="gap-6 pl-10 flex-1 -mt-2 pr-10 pb-8 pt-8 rounded-b-xl w-full z-[1]">
                  <div>
                    <label className="font-normal text-sm whitespace-nowrap mb-2">
                      Finetune this prompt to change how labels are extracted:
                    </label>
                    <div className="mt-4 flex flex-col w-full border-black">
                      <textarea
                        className="text-white text-[16px] resize-none bg-slate-black border-0 border-midnight rounded-md p-4"
                        rows={30}
                        value={prompt}
                        onChange={handlePromptChange}
                      ></textarea>
                    </div>
                    <div className="flex flex-col w-full">
                      <button
                        className="mt-6 flex w-auto px-8 justify-center items-center text-midnight rounded-lg border-beaming-orange-dark border-2 gap-4 p-3 font-semibold self-end hover:cursor-pointer bg-beaming-orange"
                        onClick={() =>
                          onPreferenceChangedHandler(prompt, 'prompt')
                        }
                      >
                        Update
                      </button>
                    </div>
                  </div>
                </div>
              </SettingsSection>

              {/* <SettingsSection
                  title="Scraping Logs"
                  defaultIsExpanded={true}
                  isAlt={lastClickedSection != 'logs'}
                  onClick={() => setLastClickedSection('logs')}
                >
                  <div className="w-full flex flex-col gap-2 px-3 py-4 h-[300px] overflow-auto z-[1]">
                    {logs.map((log, index) => (
                      <LogItem key={`log_item_${index}`} log={log} />
                    ))}
                  </div>
                </SettingsSection> */}
              {/*<SettingsSection
                  title="Keywords"
                  defaultIsExpanded={true}
                  isAlt={lastClickedSection != 'keywords'}
                  onClick={() => setLastClickedSection('keywords')}
                  tooltip={{
                    text:
                      'Keywords related to each field help extract more accurate information for the events ',
                  }}
                >
                  <div className="w-full px-3 py-4 z-[1]">
                    {Constants.keywordColumns.map((col) => (
                      <div
                        key={col}
                        className="w-[60%] flex flex-row items-start gap-7 mb-4"
                      >
                        <div
                          className={
                            'w-full pl-4 py-2 pr-7 border-ocean-blue border-[1px] rounded-lg grid grid-cols-[1fr_3fr] gap-2 ' +
                            (highlightedCol == col ? 'border-[#D94F4F]' : '')
                          }
                        >
                          <div className="w-full text-off-white font-medium pt-1">
                            {col}
                          </div>
                          <div className="w-full flex flex-row flex-wrap gap-2">
                            {(keywordActivatedCol == col
                              ? activatedColKeywords
                              : (keywords as any)[col]
                            ).map((keyword: string) => (
                              <div className="h-8 w-fit bg-beaming-orange text-slate-black font-medium px-2 py-1 text-sm flex flex-row items-center gap-4 rounded-md">
                                <span>{keyword}</span>
                                {keywordActivatedCol == col && (
                                  <img
                                    className="w-[0.65rem] hover:cursor-pointer mr-[0.2em]"
                                    src="/images/close.png"
                                    onClick={() => removeKeyword(keyword)}
                                  />
                                )}
                              </div>
                            ))}
                            {keywordActivatedCol == col && (
                              <div className="border-[1px] w-40 h-8 bg-slate-black border-solid border-main-midnight px-2 py-1 flex flex-row items-center gap-2 rounded-md">
                                <input
                                  className="w-full text-sm bg-slate-black "
                                  type="text"
                                  placeholder="Keyword"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      addKeyword(col, e.currentTarget.value);
                                      e.currentTarget.value = '';
                                    }
                                  }}
                                  onBlur={(e) => {
                                    e.preventDefault();

                                    if (e.currentTarget.value.length > 0) {
                                      addKeyword(col, e.currentTarget.value);
                                      e.currentTarget.value = '';
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          className={
                            'w-11 h-11 flex items-center justify-center rounded-lg border-ocean-blue border-[1px] bg-ocean-blue ' +
                            (highlightedCol == col ? 'border-[#D94F4F]' : '')
                          }
                          onClick={() => toggleColActivation(col)}
                        >
                          <img
                            className="w-2/5"
                            src={
                              keywordActivatedCol == col
                                ? '/images/save.png'
                                : '/images/edit.png'
                            }
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </SettingsSection>*/}
            </div>
            {/*</Scrollbars>*/}
          </div>
        </div>
      </div>

      {loader.isVisible ? <LoadingDialog /> : <></>}
      {actionDialog.dialog != null ? <ActionDialog /> : <></>}
    </div>
  );
};

export default index;
