import React, { useEffect, useState, useRef } from 'react';
import { hideImage } from '../../store/actions/imageDialog';
import { useStore } from '../../store/store';
import Image from './Image';
import { FiX } from 'react-icons/fi';
import { showEvent } from '../../store/actions/eventDetailsDialog';

const ImageDialog = () => {
  const [state, dispatch] = useStore();
  const { imageDialog } = state;
  if (imageDialog.imgURL.length == 0) {
    return <></>;
  }

  return (
    <div
      className="fixed top-0 left-0 z-30 flex justify-center items-center  w-[100vw] h-[100vh] backdrop-blur-sm"
      onClick={() => hideImage()(dispatch)}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 lg:w-[70vw] h-[90%] w-full flex flex-col px-6 py-6 gap-5 lg:rounded-lg rounded-3xl  bg-slate-black "
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <FiX
            onClick={() => hideImage()(dispatch)}
            className="flex justify-end w-5 h-5 lg:w-7 lg:h-7 hover:cursor-pointer text-mist-white"
          />
        </div>
        <div className="h-[90%] flex items-center justify-center relative">
          <img
            src={imageDialog.imgURL}
            className="w-full h-full object-contain"
          />
        </div>
      </div>
    </div>
  );
};

export default ImageDialog;
