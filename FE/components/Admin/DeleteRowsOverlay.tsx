import { useRouter } from 'next/router';
import React, { useMemo } from 'react';
import {
  deleteAdminAccounts,
  deleteEvents,
  requestMiddleware,
} from '../../services/lib/admin';
import {
  hideActionDialog,
  showActionDialog,
} from '../../store/actions/actionDialog';
import {
  hideLoadingDialog,
  showLoadingDialog,
} from '../../store/actions/loadingState';
import { resetSelections } from '../../store/actions/selections';
import { useStore } from '../../store/store';
import { RiDeleteBin6Line } from 'react-icons/ri';

interface DeleteRowsOverlayProps {
  isAccounts: boolean;
  deleteItems: () => void;
}

const DeleteRowsOverlay = ({
  isAccounts,
  deleteItems,
}: DeleteRowsOverlayProps) => {
  const router = useRouter();
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

  return (
    <div className="w-1/2 fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-6 bg-slate-black flex flex-row justify-between items-center shadow-[8px_8px_32px_rgba(0,0,0,0.25)] shadow-transparent-black rounded-2xl z-[8]">
      <div className="flex flex-row items-center gap-4">
        <span className="text-off-white text-3xl font-semibold">{count}</span>
        <span>{isAccounts ? 'Account(s)' : 'Event(s)'} selected</span>
      </div>
      <button
        className="py-2 px-7 w-fit self-end rounded-lg border-slate-black text-black border-[1px] bg-beaming-orange flex flex-row gap-3 items-center"
        onClick={onDeleteClickedHandler}
      >
        <RiDeleteBin6Line className="w-5 h-5" />
        <span className="font-semibold">Delete</span>
      </button>
    </div>
  );
};

export default DeleteRowsOverlay;
