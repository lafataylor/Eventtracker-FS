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

interface AccountsSectionProps {
  title: string;
  subTitle?: string;
  accounts: Account[];
  defaultIsExpanded?: boolean;
  isAlt: boolean;
  onClick: Function;
}

const AccountsSection = ({
  title,
  subTitle,
  accounts,
  defaultIsExpanded,
  isAlt,
  onClick,
}: AccountsSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultIsExpanded ?? false);
  const [state, dispatch] = useStore();
  const { selections } = state;

  useEffect(() => {
    if (defaultIsExpanded) {
      setIsExpanded(defaultIsExpanded);
    }
  }, []);

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

  return (
    <div className="flex flex-col ">
      <div
        onClick={() => {
          //deleteItemsInStack();
          setIsExpanded(!isExpanded);
          onClick();
        }}
        className={
          'rounded-xl overflow-y-auto shadow-[0px_0px_40px_rgba(0,0,0,0.05)]  shadow-dim-shadow flex items-start gap-4 p-4 z-[1] ' +
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
        <div>
          <div className="font-semibold select-none text-midnight">{title}</div>
          {isExpanded && subTitle && (
            <div className="text-sm select-none text-midnight">{subTitle}</div>
          )}
        </div>
      </div>
      {isExpanded ? (
        <div className="flex gap-6 flex-wrap -mt-2 pt-2 rounded-b-xl overflow-clip relative z-0">
          <div
            className={
              'w-full h-full absolute top-0 left-0 opacity-30 ' +
              (isAlt ? 'bg-beaming-orange' : 'bg-beaming-orange')
            }
          ></div>

          {accounts.length == 0 ? (
            <div className="w-full h-full flex items-center justify-center font-medium p-6 pt-8 z-[1]">
              No Accounts Found...
            </div>
          ) : (
            <table className="rounded-b-xl  w-full h-full z-[1]">
              <thead className="grid text-beaming-orange font-semibold grid-cols-[50px_2fr_1fr_1fr] border-b-4 border-b-beaming-orange">
                <td className="border-r-[1px] border-slate-black text-beaming-orange font-semibold flex justify-center items-center relative">
                  <label className="custom_checkbox relative">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        deleteItemsInStack();
                        onSelectOrDeselectAllClickedHandler(e.target.checked);
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
                <td className=" border-slate-black align-middle text-beaming-orange font-semibold flex justify-center p-3">
                  Status
                </td>
              </thead>
              <div className=" max-h-[30vh] overflow-y-auto">
                {accounts.map((account, index) => (
                  <AccountsListItem
                    account={account}
                    isSelected={account.id in selections.accounts}
                    setSelected={(isChecked: boolean) => {
                      deleteItemsInStack();
                      onSelectOrDeselectHandler(isChecked, account.id);
                    }}
                    isLast={accounts.length - 1 == index}
                  />
                ))}
              </div>
            </table>
          )}
        </div>
      ) : (
        ''
      )}
    </div>
  );
};

export default AccountsSection;
