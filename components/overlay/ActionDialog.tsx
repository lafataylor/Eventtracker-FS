import React from 'react';
import { ActionDialogProps } from '../../interface/objects/simpleObject';
import { useStore } from '../../store/store';

const ActionDialog = () => {
  const [state, dispatch] = useStore();
  const { actionDialog } = state;

  return (
    <div className="flex justify-center items-center backdrop-filter backdrop-blur-md overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none w-full focus:outline-none">
      <div className="relative my-6 mx-auto w-full sm:w-[600px]">
        <div className="border-0 rounded-lg shadow-lg relative justify-center flex flex-col w-full bg-slate-black outline-none focus:outline-none">
          <div className="flex flex-col justify-center items-center py-8 px-12 gap-8 rounded-t">
            <div className="font-medium text-xl text-beaming-orange">
              {actionDialog.dialog.title}
            </div>
            <div className="font-medium text-off-white">
              {actionDialog.dialog.body}
            </div>
            <div className="w-full flex flex-row items-center justify-between px-2 gap-4">
              {(actionDialog.dialog as ActionDialogProps).buttons.map(
                (button) => (
                  <div
                    key={button.type}
                    className={`text-white w-40 px-2 py-3 font-semibold rounded-lg text-sm hover:cursor-pointer text-center ${
                      button.type === 'submit'
                        ? 'bg-beaming-orange text-black'
                        : button.type === 'cancel'
                        ? 'bg-black'
                        : 'bg-solid-red'
                    }`}
                    onClick={() => button.onClick()}
                  >
                    {button.label}
                  </div>
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
