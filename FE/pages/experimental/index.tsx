import AddAccount from '../../components/Admin/AddAccount';
import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useStore } from '../../store/store';
import { addAccounts } from '../../store/actions/experimental';

const ExperimentalPage = () => {
  const [state, dispatch] = useStore();
  const [accounts, setAccounts] = useState([] as string[]);
  const [events, setEvents] = useState([]);

  const addAccount = (account: string) => {
    const updatedAccounts = [...accounts];

    if (
      updatedAccounts.filter((existingAccount) => existingAccount == account)
        .length == 0
    ) {
      updatedAccounts.push("@"+account);
    }

    setAccounts(updatedAccounts);
  };

  const removeAccount = (index: number) => {
    const updatedAccounts = [...accounts];
    updatedAccounts.splice(index, 1);
    setAccounts(updatedAccounts);
  };

  return (
    <div className="flex flex-col h-screen bg-[#282726]">
      <div className="px-4 py-4 h-1/8 text-[#D0A215] font-semibold"> Event Tracker (Beta)</div>
      <div className="pb-8 flex-grow flex flex-col items-center justify-center bg-[#282726] overflow-y-auto">
        <h1 className="text-[#FFFCF0] text-3xl font-semibold">Test Mode</h1>
        <p className="py-2 text-[#FFFCF0]">Please enter some Instagram account handles to fetch and label the <span className="italic"> 5 most recent posts </span> against each.</p>
        <br/>
        {/*<AddAccount hide={() => {}} />*/}
        <div
          className="h-28 w-[50em] border-2 border-[#D0A215] rounded-lg flex flex-row flex-wrap px-3 py-3 gap-2 overflow-y-auto"
        >
          {accounts.map((account, index) => (
            <div key={index} className="h-9 w-fit bg-[#D0A215] px-2 py-2 text-sm flex flex-row items-center gap-4 rounded-md">
              <span className="font-medium">{account}</span>
              <img
                className="w-[0.65rem] mr-[0.2em] hover:cursor-pointer"
                src="/images/close.png"
                onClick={() => removeAccount(index)}
              />
            </div>
          ))}
          <div className="border-[1px] w-40 h-9 border-solid border-[#AD8301] px-2 py-1 flex flex-row items-center gap-2 rounded-md">
            <span className="text-[#AD8301]">@</span>
            <input
              className="w-full text-sm bg-[#282726] text-[#FFFCF0]"
              type="text"
              placeholder="Account Handle"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  addAccount(e.currentTarget.value);
                  e.currentTarget.value = '';
                }
              }}
              onBlur={(e) => {

              }}
            />
          </div>
        </div>

        <br/>
        <br/>

        <Link href="/experimental/experimentalResults">
          <button onClick={()=>{addAccounts(accounts)(dispatch); }} className="px-4 py-2 bg-[#D0A215] hover:bg-[#AD8301] text-[#100F0F] font-medium rounded-lg"> FETCH </button>
        </Link>
      </div>
    </div>
  );
};

export default ExperimentalPage;