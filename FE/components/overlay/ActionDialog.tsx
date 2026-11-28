import React from 'react';
import { ActionDialogProps } from '../../interface/objects/simpleObject';
import { useStore } from '../../store/store';
import {
  actionDialogBodyClass,
  actionDialogButtonClass,
  actionDialogButtonsRowClass,
  actionDialogMessageClass,
  actionDialogShellClass,
  actionDialogTitleClass,
} from '../../utils/actionDialogLayout';

const ActionDialog = () => {
  const [state] = useStore();
  const { actionDialog } = state;

  return (
    <div className="flex justify-center items-center backdrop-filter backdrop-blur-md overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none w-full focus:outline-none px-0">
      <div className={actionDialogShellClass()}>
        <div className="border-0 rounded-lg shadow-lg relative justify-center flex flex-col w-full bg-slate-black outline-none focus:outline-none">
          <div className={actionDialogBodyClass()}>
            <div className={actionDialogTitleClass()}>
              {actionDialog.dialog.title}
            </div>
            <div className={actionDialogMessageClass()}>
              {actionDialog.dialog.body}
            </div>
            <div className={actionDialogButtonsRowClass()}>
              {(actionDialog.dialog as ActionDialogProps).buttons.map(
                (button) => (
                  <button
                    type="button"
                    key={button.type}
                    className={actionDialogButtonClass(button.type)}
                    onClick={() => button.onClick()}
                  >
                    {button.label}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActionDialog;
