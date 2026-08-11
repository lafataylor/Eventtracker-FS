import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store/store';
import AdminSideBar from '../../../components/Admin/AdminSideBar';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import ActionDialog from '../../../components/overlay/ActionDialog';
import { readFeedback } from '../../../services/lib/admin';
import {
  hideLoadingDialog,
  showLoadingDialog,
} from '../../../store/actions/loadingState';
import FeedbackSection from '../../../components/Admin/FeedbackSection';
import { Feedback } from '../../../interface/objects/simpleObject';
import InfoOverlay from '../../../components/Admin/InfoOverlay';

const index = () => {
  const [state, dispatch] = useStore();
  const { loader, actionDialog, auth } = state;

  const { overlay } = auth;

  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);

  useEffect(() => {
    const fetchFeedbacks = async () => {
      showLoadingDialog()(dispatch);
      readFeedback()
        .then((res) => {
          hideLoadingDialog()(dispatch);
          if (res.data.status === 'success') {
            setFeedbacks(res.data.data);
          }
        })
        .catch((e) => {
          hideLoadingDialog()(dispatch);
          //console.log(e);
        });
    };
    fetchFeedbacks();
  }, []);

  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="feedback" />
      <div className="p-8 h-full font-montserrat flex flex-col w-full text-off-white overflow-y-auto">
        <nav className="border-b-4 border-beaming-orange">
          <div className="text-5xl font-semibold pb-3 px-3">Feedback</div>
        </nav>
        <div className="flex flex-col font-semibold pt-6 gap-5 text-sm px-1">
          <FeedbackSection />
        </div>
      </div>

      {loader.isVisible && <LoadingDialog />}
      {actionDialog.dialog && <ActionDialog />}
      {overlay.isVisible && (
        <InfoOverlay
          message={overlay.message}
          onClose={() => dispatch({ type: 'HIDE_INFO_OVERLAY' })}
        />
      )}
    </div>
  );
};

export default index;

