import React from 'react';
import Spinner from '../Spinner';

const LoadingDialog = () => {
  return (
    <div className="flex justify-center items-center backdrop-filter backdrop-blur-xl overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none w-full focus:outline-none">
      <div className="relative my-6 mx-auto w-full sm:w-[500px]">
        <div className="border-0 rounded-lg shadow-lg relative justify-center flex flex-col w-full bg-slate-black outline-none focus:outline-none">
          <div className="flex flex-col justify-center items-center p-8 gap-8 rounded-t ">
            <div className="w-full h-full flex items-center justify-center">
              <Spinner colorClass={'text-beaming-orange'} size={48} />
            </div>

            <div className="flex flex-col justify-center items-center">
              <div className="font-medium text-xl text-white">
                Please Wait...
              </div>

              {/* <p className="text-white mt-1 font-normal text-sm">{des}</p> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingDialog;
