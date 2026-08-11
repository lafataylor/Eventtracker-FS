import { useEffect, useState } from 'react';
import AdminSideBar from '../../../components/Admin/AdminSideBar';
import {
  requestMiddleware,
  runScraper,
  readAdminAccounts,
  readLogs,
} from '../../../services/lib/admin';
import { useStore } from '../../../store/store';
import { Account, Log } from '../../../interface/objects/simpleObject';
import getFilterString from '../../../utils/color_convertor';

import moment from 'moment-timezone';
import Spinner from '../../../components/Spinner';

const index = () => {
  const [state, dispatch] = useStore();

  const [fetchingLogs, setFetchingLogs] = useState(true);
  const [runInProgress, setRunInProgress] = useState(false);

  /*const dummyLogs = [
        {
            "timestamp": "23-03-2024 11:38PM",
            "id": 8,
            "accounts": ["capicua_la","favela.worldwide","do_over"]
        },
        {
            "timestamp": "23-03-2024 11:53PM",
            "id": 9,
            "accounts": ["capicua_la","favela.worldwide","do_over"]
        }
    ]*/

  const fetchLogs = async () => {
    setFetchingLogs(true);
    if (await requestMiddleware(dispatch)) {
      readLogs()
        .then((res) => {
          if (res.status === 200) {
            let logStrings = res.data.data;

            logStrings.reverse();

            logStrings.sort((a: any, b: any) => {
              if (a.status === 'In Progress' && b.status !== 'In Progress') {
                return -1; // a should come before b
              } else if (
                a.status !== 'In Progress' &&
                b.status === 'In Progress'
              ) {
                return 1; // b should come before a
              } else {
                return 0; // Keep the order unchanged
              }
            });

            setLogStrings(logStrings);
          }

          setFetchingLogs(false);
        })
        .catch((error) => {
          alert(error);
        });
    }
  };

  useEffect(() => {
    fetchLogs();

    const interval = setInterval(fetchLogs, 5000);

    return () => clearInterval(interval);
  }, []);

  const [logStrings, setLogStrings] = useState<Log[]>([]);

  const onRunHandler = async () => {
    setRunJustInitiated(true);
    setTimeout(() => {
      setRunJustInitiated(false);
    }, 20000);

    if (await requestMiddleware(dispatch)) {
      setRunInProgress(true);
      readAdminAccounts()
        .then((res) => {
          if (res.status == 200) {
            const accountList: Account[] = res.data;

            const data = {
              accounts: accountList.map((account) => account.user),
            };

            runScraper(data)
              .then((response) => {
                setRunInProgress(false);
                const executionId = response.data.id;

                fetchLogs();
                /*setLogStrings((logStrings) => {
                            return [
                                {
                                    "timestamp": new Date().toLocaleString('en-GB', {hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: true}),
                                    "id": executionId,
                                    "accounts": data.accounts
                                },
                                ...logStrings,
                            ]
                        });*/
              })
              .catch((error) => {
                alert(error);
                setRunInProgress(false);
              });
          }
        })
        .catch((error) => {
          alert(error);
        });
    }
  };

  function formatList(stringList: string) {
    const strings = eval(stringList);
    const length = strings?.length;
    let elements = strings?.slice(0, 2).join(', ');
    if (length > 2) {
      elements += ', ...';
    }
    return `(${length}): ${elements}`;
  }

  function convertToLocalTimezone(timestamp: string) {
    try {
      const userTimezone = moment.tz.guess();
      const converted = moment
        .utc(timestamp)
        .tz(userTimezone)
        .format('YYYY-MM-DD HH:mm:ss z');
      return converted;
    } catch (err) {
      return '...';
    }
  }

  function convertToPSTTimezone(timestamp: string) {
    try {
      const pstOffset = '-08:00';
      const converted = moment
        .utc(timestamp)
        .utcOffset(pstOffset)
        .format('MM/DD/YYYY HH:mm:ss [PST]');
      return converted;
    } catch (err) {
      return '...';
    }
  }

  function isStepLog(status: string){
    if(status){
      return status.toLowerCase().includes("step")
    }

    return false;
  }

  const items = Array.from({ length: 20 }, (_, index) => index + 1);

  const [runJustInitiated, setRunJustInitiated] = useState(false);

  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="runs" />
      <div className="h-full font-montserrat flex flex-col w-full max-w-[83vw] text-off-white">
        <div className="px-8 pt-8 h-full  font-montserrat flex flex-col w-full text-off-white overflow-y-auto">
          <nav className="border-b-4 border-beaming-orange">
            <div className="text-5xl font-semibold pb-3 px-3">Runs</div>
          </nav>
          <div className="flex w-full justify-end mt-6 items-center ">
            <p className='pr-4 font-semibold'>{logStrings.some((log) => log.status === 'In Progress') && "A run is in progress"}</p>
            <div className="flex flex-row justify-end items-center gap-4  ">
              {fetchingLogs && (
                <div className="flex">
                  <Spinner colorClass={'text-beaming-orange'} size={24} />
                </div>
              )}
              <button
                className={`flex w-auto px-5 justify-center items-center text-md text-midnight rounded-lg border-beaming-orange-darkborder-2 gap-4 p-2 font-semibold self-end bg-beaming-orange ${
                  fetchingLogs ||
                  logStrings.some((log) => log.status === 'In Progress')
                    ? ' cursor-not-allowed '
                    : ' hover:cursor-pointer '
                }`}
                onClick={onRunHandler}
                disabled={
                  runJustInitiated ||
                  fetchingLogs ||
                  logStrings.some((log) => log.status === 'In Progress')
                }
              >
                Initiate New Run {runInProgress ? '...' : ''}
              </button>
            </div>
          </div>

          <div className="flex-grow overflow-y-scroll p-4 flex flex-col mt-8 mb-4 bg-beaming-orange bg-opacity-10 rounded-lg">
            {fetchingLogs && logStrings.length === 0 && (
              <div className="flex w-full h-full justify-center items-center">
                <Spinner colorClass={'text-beaming-orange'} size={48} />
              </div>
            )}
            {!fetchingLogs && logStrings.length === 0 && (
              <div className="flex w-full h-full justify-center items-center">
                <p> No Logs to Show </p>
              </div>
            )}
            <div className="flex flex-col gap-2 ">
              {/*items.map((item) => (
                            <div className="flex flex-row justify-between w-full bg-slate-black p-4 rounded-lg">
                                <div> 2 new posts fetched on 23-03-2024 11:58PM</div> 
                                <div> Account list: [capicua_la, do_over, favela.worldwide]</div>
                            </div>
                        ))*/}
              {logStrings.map((log) => {
                if(isStepLog(log.status)){
                  return <div className="flex flex-col justify-start w-full bg-slate-black p-4 gap-4 rounded-lg">
                    <div className='flex justify-between'>
                      <div> # {log.id} </div> 
                      <div className={
                          (log.status == 'Step Failed'
                            ? 'text-vibrant-red'
                            : log.status == 'Step Progressed'
                            ? 'text-beaming-orange'
                            : log.status == 'Step Completed'
                            ? 'text-vibrant-green'
                            : ' text-bright-orange') + ' font-semibold'
                        }> {log.status} </div>
                    </div>
                    <div className='pl-4 break-words'> {log.message} </div>
                  </div>
                }else{
                  
                  return (
                    <div className="flex flex-row justify-between w-full bg-slate-black p-4 rounded-lg">
                      <div> # {log.id} </div>
                      <div> Accounts {formatList(log.accounts_list)} </div>
                      <div>
                        {' '}
                        {log.status == 'Completed'
                          ? 'completed at'
                          : 'started at'}{' '}
                        {convertToPSTTimezone(log.scraped_at)}{' '}
                      </div>
                      {(log.status == 'Completed' ||
                        log.status == 'Labelled') && (
                        <div> {log.number_of_new_events} new events</div>
                      )}
                      <div
                        className={
                          (log.status == 'Failed'
                            ? 'text-vibrant-red'
                            : log.status == 'In Progress'
                            ? 'text-beaming-orange'
                            : log.status == 'Completed'
                            ? 'text-vibrant-green'
                            : ' text-bright-orange') + ' font-semibold'
                        }
                      >
                        {' '}
                        {log.status}{' '}
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
          <div className="pb-4 flex justify-end items-center gap-2 text-sm">
            <img
              className="w-5 h-5"
              src="/images/info.svg"
              style={{
                filter: getFilterString('#DA702C'),
              }}
            />
            <p>
              {' '}
              To edit the list of scraped accounts, click the Accounts tab on
              the left{' '}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default index;
