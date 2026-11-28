import React, { useMemo } from 'react';
import {
  hideActionDialog,
  showActionDialog,
} from '../../store/actions/actionDialog';
import { resetSelections } from '../../store/actions/selections';
import { useStore } from '../../store/store';
import { RiDeleteBin6Line } from 'react-icons/ri';
import {
  adminDeleteBarButtonClass,
  adminDeleteBarClass,
  adminDeleteBarCountClass,
  adminDeleteBarLabelClass,
} from '../../utils/adminDeleteBar';

interface DeleteRowsOverlayProps {
  isAccounts: boolean;
  deleteItems: () => void;
}

const DeleteRowsOverlay = ({
  isAccounts,
  deleteItems,
}: DeleteRowsOverlayProps) => {
  const [state, dispatch] = useStore();
  const { selections } = state;

  const onDeleteClickedHandler = () => {
    showActionDialog({
      title: 'Confirm Delete',
      body: 'Are you sure you want to permanently delete the selected item(s)?',
      buttons: [
        {
          type: 'cancel',
          label: 'Cancel',
          onClick: () => {
            hideActionDialog()(dispatch);
          },
        },
        {
          type: 'delete',
          label: 'Delete',
          onClick: () => {
            hideActionDialog()(dispatch);
            deleteItems();
            resetSelections()(dispatch);
          },
        },
      ],
    })(dispatch);
  };

  const count = useMemo(() => {
    return Object.keys(isAccounts ? selections.accounts : selections.events)
      .length;
  }, [selections.accounts, selections.events]);

  // 2026-11-27: phone used to clip "N Event(s) selected" over Delete because
  // the bar was w-1/2 with desktop padding. Edge-to-edge on mobile; half-width
  // centered from md up (Accounts shares this overlay).
  return (
    <div className={adminDeleteBarClass()}>
      <div className="flex flex-row items-center gap-2 md:gap-4 min-w-0">
        <span className={adminDeleteBarCountClass()}>{count}</span>
        <span className={adminDeleteBarLabelClass()}>
          {isAccounts ? 'Account(s)' : 'Event(s)'} selected
        </span>
      </div>
      <button
        type="button"
        className={adminDeleteBarButtonClass()}
        onClick={onDeleteClickedHandler}
      >
        <RiDeleteBin6Line className="w-5 h-5 shrink-0" />
        <span className="font-semibold">Delete</span>
      </button>
    </div>
  );
};

export default DeleteRowsOverlay;
