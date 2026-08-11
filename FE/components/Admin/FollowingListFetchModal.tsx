import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { useStore } from '../../store/store';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import { getFollowingList } from '../../services/lib/admin';

const FollowingListFetchModal = ({ hide, addAccounts }: { hide: Function, addAccounts: Function }) => {
  const [state, dispatch] = useStore();
  const [accountName, setAccountName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAccountName(e.target.value);
  };

  const handleSubmit = async () => {
    setIsProcessing(true);
    try {
      const followingList = await getFollowingList(accountName);
      addAccounts(followingList);
    } catch (error) {
      console.error('Error fetching following list:', error);
    } finally {
      setIsProcessing(false);
      hide(); // Close the modal after processing
    }
  };

  return (
    <div
      className="fixed top-0 left-0 z-50 flex justify-center items-center w-[100vw] h-[100vh] backdrop-blur-sm"
      onClick={() => hide()}
    >
      <div
        className="fixed top-0 lg:left-0 justify-between gap-2 lg:w-[40vw] h-full min-h-[70vh] lg:h-fit w-full p-6 px-8 lg:rounded-lg rounded-3xl bg-slate-black shadow-[8px_8px_32px_rgba(0,0,0,0.25)] shadow-transparent-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onClick={() => hide()}
          className="flex justify-end absolute right-4 top-4"
        >
          <FiX className="flex justify-end cursor-pointer w-4 h-4 text-white" />
        </div>

        <div className="flex flex-col justify-between h-[64vh]">      
            <div className="text-off-white text-3xl font-semibold">
                Fetch Following List
                <div className="text-sm mt-6 outline-none">
                    Enter the account name to fetch the following list.
                </div>
            </div>

            <div className="flex flex-col mt-6">
            <span className="pb-1 font-semibold">Account Name</span>
            <div className="relative">
              <input
                type="text"
                value={accountName}
                onChange={handleInputChange}
                placeholder="Enter account name"
                className={`border-2 border-slate-black rounded-lg p-2 bg-midnight text-off-white pl-8 w-full ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isProcessing}
              />
              <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-beaming-orange pl-1"> @ </span>
            </div>
            </div>
            {isProcessing && (
                <div className="flex flex-col">
                    <p>
                        Processing...<br />
                        This may take 2-5 minutes. Please do not close the window.<br />
                    </p>
                    <p>
                        Time elapsed: <span className="font-semibold text-beaming-orange text-xl">{formatTime(timer)}</span>
                    </p>
                </div>
            )}
            <div className="flex flex-col justify-between mt-4">
            <button
                className="py-2 px-7 w-fit self-end rounded-lg border-beaming-orange text-white border-[1px] bg-beaming-orange text-midnight font-medium mt-20"
                onClick={handleSubmit}
                disabled={isProcessing}
            >
                Fetch Following List
            </button>
            </div>
            <ReactTooltip
            anchorId="fetch_following"
            place="bottom"
            content="Fetch the following list of the specified account"
            style={{ backgroundColor: '#282726', color: '#FFFCF0' }}
          />
        </div>  
      </div>
    </div>
  );
};

export default FollowingListFetchModal;
