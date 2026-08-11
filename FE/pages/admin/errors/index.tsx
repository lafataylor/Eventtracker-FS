import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store/store';
import AdminSideBar from '../../../components/Admin/AdminSideBar';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import ActionDialog from '../../../components/overlay/ActionDialog';
import {
  readErrors,
  requestMiddleware,
  resolveError,
} from '../../../services/lib/admin';
import {
  hideLoadingDialog,
  showLoadingDialog,
} from '../../../store/actions/loadingState';
import { updateLastSeenError } from '../../../services/lib/admin';
import ErrorsSection from '../../../components/Admin/ErrorsSection';
import ErrorListItem from '../../../components/Admin/ErrorListItem';
import {
  FeedbackError,
  ReportedError,
} from '../../../interface/objects/simpleObject';
import EventDetails from '../../../components/Dashboard/EventDetails';
import { getProperty } from '../../../utils/utils';
import InfoOverlay from '../../../components/Admin/InfoOverlay';

const index = () => {
  const [state, dispatch] = useStore();
  const { loader, actionDialog, auth } = state;

  const { overlay } = auth;

  const [errors, setErrors] = useState<ReportedError[]>([]);

  useEffect(() => {
    const fetchErrors = async () => {
      if (await requestMiddleware(dispatch)) {
        showLoadingDialog()(dispatch);
        readErrors()
          .then((res) => {
            hideLoadingDialog()(dispatch);
            if (res.data.status === 'success') {
              const updatedErrors = res.data.data;
              const unresolvedErrors: ReportedError[] = [];
              const resolveErrorPromises = updatedErrors.map(
                async (error: ReportedError) => {
                  const changes: FeedbackError = JSON.parse(error.changes);
                  const property = getProperty(changes.field_name);
                  let currentValue = '';
                  if (property.length === 1) {
                    currentValue = (error.event as any)[property[0]];
                  } else if (property.length === 2) {
                    currentValue = (error.event as any)[property[0]][
                      property[1]
                    ];
                  }

                  if (currentValue !== changes.correction) {
                    unresolvedErrors.push(error);
                  } else {
                    // Mark the error as resolved
                    await resolveError({ id: error.id });
                    dispatch({
                      type: 'SHOW_INFO_OVERLAY',
                      payload: {
                        message: 'Ticket resolved successfully',
                        isError: false,
                      },
                    });
                  }
                }
              );

              Promise.all(resolveErrorPromises)
                .then(() => {
                  setErrors(unresolvedErrors);

                  if (updatedErrors.length > 0) {
                    updateLastSeenError({
                      last_seen_error:
                        updatedErrors[updatedErrors.length - 1]['id'],
                    }).catch((e) => {
                      //console.log(e);
                    });
                  }
                })
                .catch((e) => {
                  //console.log(e);
                });
            }
          })
          .catch((e) => {
            hideLoadingDialog()(dispatch);
            //console.log(e);
          });
      }
    };
    fetchErrors();
  }, []);

  const onResolve = (id: number) => {
    setErrors(errors.filter((error) => error.id !== id));
    dispatch({
      type: 'SHOW_INFO_OVERLAY',
      payload: { message: 'Ticket resolved successfully', isError: false },
    });
  };

  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="errors" />
      <div className="p-8 h-full font-montserrat flex flex-col w-full text-off-white overflow-y-auto">
        <nav className="border-b-4 border-beaming-orange">
          <div className="text-5xl font-bold pb-3 px-3">Reported Errors</div>
        </nav>
        <div className="flex flex-col font-semibold pt-6 gap-5 text-sm px-1">
          <ErrorsSection
            title="Error Reports"
            subTitle={`${errors.length} new errors reported`}
            defaultIsExpanded={true}
            isAlt={false}
            onClick={() => {}}
          >
            <div className="w-full p-6 rounded-b-xl z-[1]">
              {errors.map((error) => (
                <ErrorListItem
                  key={error.id}
                  error={error}
                  onResolve={onResolve}
                />
              ))}
            </div>
          </ErrorsSection>
          <EventDetails isEdit={true} />
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
