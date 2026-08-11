import React from 'react';
import { Account } from '../../interface/objects/simpleObject';
import { formatDate } from '../../utils/utils';

interface AccountsListItemProps {
  account: Account;
  isSelected: boolean;
  setSelected: Function;
  isLast: boolean;
}

const AccountsListItem = ({
  account,
  isSelected,
  setSelected,
  isLast,
}: AccountsListItemProps) => {
  return (
    <tr
      className={
        'grid grid-cols-[50px_2fr_1fr_1fr] ' +
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
      <td className="align-middle flex p-3">Tracking</td>
    </tr>
  );
};

export default AccountsListItem;
