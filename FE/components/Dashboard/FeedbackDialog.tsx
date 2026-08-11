import React, { useState, useEffect } from 'react';
import { Event, FeedbackError } from '../../interface/objects/simpleObject';
import { useStore } from '../../store/store';
import { hideFeedbackDialog } from '../../store/actions/feedbackDialog';
import Select from 'react-select';
import { Constants } from '../../utils/constants';
import { Option } from '../../interface/filterInterface';
import {
  getValueFromColumnNameForFeedback,
  formatDate,
  formatTime,
} from '../../utils/utils';
import {
  hideActionDialog,
  showActionDialog,
} from '../../store/actions/actionDialog';
import {
  hideLoadingDialog,
  showLoadingDialog,
} from '../../store/actions/loadingState';
import EventService from '../../services/lib/event';
import { FaInfoCircle, FaTimes, FaArrowLeft } from 'react-icons/fa';
import { HIDE_INFO_OVERLAY, SHOW_INFO_OVERLAY } from '../../store/actions/type';
import InfoOverlay from '../Admin/InfoOverlay';

const tailwindConfig = require('../../tailwind.config.js');
const colors = tailwindConfig.theme.colors;

const sunnyGold = colors['beaming-orange'];
const vibrantRed = colors['vibrant-red'];
const black = colors['black'];
const white = colors['white'];

const columnOptions: Option[] = [
  { value: '', label: 'Select', disabled: true },
  ...Constants.feedbackTableColumns.map((column) => ({
    value: column,
    label: column,
  })),
  { value: 'Other', label: 'Other' }
];

interface FeedbackDialogProps {
  existingEvent: Event;
  language: string;
}

const FeedbackDialog = ({ existingEvent, language }: FeedbackDialogProps) => {
  const [state, dispatch] = useStore();
  const { feedbackDialog, auth } = state;

  const { overlay } = auth;

  const [errors, setErrors] = useState<FeedbackError[]>([{
    id: new Date().getTime().toString(),
    field_name: '',
    current: '',
    correction: '',
  }]);

  useEffect(() => {
    if (feedbackDialog.eventId.length > 0) {
      setErrors([]);
    }
  }, [feedbackDialog.eventId]);

  if (feedbackDialog.eventId.length == 0) {
    return <></>;
  }

  const sortButtonStyle: Object = {
    option: (provided: any, state: any) => ({
      ...provided,
      color: black,
      borderRadius: '8px',
      padding: '12px 4px',
      backgroundColor: 'none',
      cursor: state.isSelected ? 'auto' : 'pointer',
      whiteSpace: 'nowrap',
      '&:active': {
        backgroundColor: 'rgba(241, 252, 255, 0.5)',
      },
      fontWeight: 400,
      fontSize: '0.95rem',
    }),
    control: (styles: React.CSSProperties) => ({
      ...styles,
      border: `2px solid ${sunnyGold}`,
      '&:hover': {
        border: `2px solid ${sunnyGold}`,
      },
      userSelect: 'none',
      outline: 'none',
      focus: 'none',
      boxShadow: 'none',
      borderRadius: '15px',
      height: '50px',
      padding: '0 10px',
      backgroundColor: '#EFF8FF',
    }),
    menu: (style: React.CSSProperties) => ({
      ...style,
      backgroundColor: white,
      border: `2px solid ${sunnyGold}`,
      borderRadius: '10px',
      padding: '10px',
      left: 0,
      position: 'absolute',
      zIndex: 9999,
    }),
    menuPortal: (style: React.CSSProperties) => ({
      ...style,
      zIndex: 9999,
    }),
    indicatorSeparator: () => null,
    dropdownIndicator: (style: React.CSSProperties) => ({
      ...style,
      display: 'none',
    }),
    singleValue: (style: React.CSSProperties) => ({
      ...style,
      color: black,
      fontWeight: '500',
    }),
    valueContainer: (style: React.CSSProperties) => ({
      ...style,
      color: black,
    }),
    container: (style: React.CSSProperties) => ({
      ...style,
      width: '100%',
      outline: 'none',
    }),
  };

  const addError = () => {
    const newError: FeedbackError = {
      id: new Date().getTime().toString(),
      field_name: '',
      current: '',
      correction: '',
    };

    setErrors((prevErrors) => [newError, ...prevErrors]);
  };

  const updateError = (index: number, values: Partial<FeedbackError>) => {
    setErrors((prevErrors) => {
      const updatedErrors = [...prevErrors];
      updatedErrors[index] = { ...updatedErrors[index], ...values };
      return updatedErrors;
    });
  };

  const removeError = (index: number) => {
    setErrors((prevErrors) => {
      const updatedErrors = [...prevErrors];
      updatedErrors.splice(index, 1);
      return updatedErrors;
    });
  };

  const getOptionFromValue = (options: Option[], value: string) => {
    return options.find((option) => option.value === value) || options[0];
  };

  const hasIncompleteErrors = () => {
    return errors.some(
      (error) => error.field_name === '' || error.correction === ''
    );
  };

  const handleSubmit = () => {
    if (errors.length > 0 && !hasIncompleteErrors()) {
      showActionDialog({
        title: 'Submit Feedback?',
        body: 'Before submitting, please confirm that all errors are reported correctly.',
        buttons: [
          {
            type: 'cancel',
            label: 'Review',
            onClick: () => {
              hideActionDialog()(dispatch);
            },
          },
          {
            type: 'submit',
            label: 'Submit',
            onClick: () => {
              hideActionDialog()(dispatch);
              showLoadingDialog()(dispatch);
              EventService.addFeedback({
                event_id: existingEvent.id.toString(),
                changes: JSON.stringify(errors),
              })
                .then((res) => {
                  hideLoadingDialog()(dispatch);
                  hideFeedbackDialog()(dispatch);
                  setErrors([]); // Reset errors after successful submission
                })
                .catch((err) => {
                  hideLoadingDialog()(dispatch);
                  const message = 'Failed to send feedback!';
                  dispatch({
                    type: SHOW_INFO_OVERLAY,
                    payload: { message, isError: true },
                  });
                  console.error(err);
                });
            },
          },
        ],
      })(dispatch);
    }
  };

  return (
    <div
      className="fixed top-0 left-0 z-30 flex justify-center items-center w-[100vw] h-[100vh] backdrop-blur-sm"
      onClick={() => hideFeedbackDialog()(dispatch)}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 lg:w-[70vw] md:w-[90vw] w-[95vw] h-[90%] grid grid-cols-1 lg:grid-cols-[auto_1fr] px-4 md:px-7 py-6 md:py-10 gap-4 md:gap-8 lg:rounded-lg rounded-md bg-midnight shadow-[8px_8px_32px_rgba(0,0,0,0.25)] shadow-transparent-black overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <FaArrowLeft
          onClick={() => hideFeedbackDialog()(dispatch)}
          className="w-5 hover:cursor-pointer mt-2 text-mist-white lg:block hidden"
        />
        <div
          className="grid grid-rows-[auto_auto_auto_1fr_auto] gap-3"
          style={{
            height: 'calc(90vh - 5rem)',
          }}
        >
          <div className="flex flex-row items-center gap-3">
            <FaArrowLeft
              onClick={() => hideFeedbackDialog()(dispatch)}
              className="w-5 hover:cursor-pointer text-mist-white lg:hidden"
            />
            <FaInfoCircle className="text-mist-white" size={20} />
            <span className="text-mist-white font-semibold text-xl md:text-2xl">
              {language === 'es' ? 'Sugerir Editar' : 'Suggest Edit'} 
            </span>
          </div>
          <div className="text-xs md:text-sm text-mist-white">
            {language === 'es' 
              ? <p> 
                ¿Ves información que necesita corrección o que está incompleta?
                Selecciona qué detalle necesita actualizarse y luego ingresa la información correcta.
                Si hay varios problemas, haz clic en "+agregar error".
              </p> 
              : <div>
                <p>See information that needs correcting or is incomplete? </p>
                <p className="my-2">Select which detail needs updating and then enter the correct information.</p>
                <p >If there are multiple issues, click "+Add Error"</p>
              </div>              
            }
          </div>
          <div className="flex flex-row items-center justify-between mt-3">
            <div className="text-sm font-medium text-mist-white">
            </div>
            <div
              className="font-semibold text-beaming-orange hover:cursor-pointer hover:underline text-sm md:text-base"
              onClick={addError}
            >
              + Add Error
            </div>
          </div>
          <div className="h-full overflow-auto pr-2 md:pr-6 border border-slate-black bg-white/5 p-6 rounded-lg">
            {errors.map((error, index) => (
              <div
                key={error.id}
                className="w-full mb-6 bg-midnight rounded-2xl"
              >
                <div className="bg-beaming-orange-dark rounded-2xl pl-4 md:pl-7 pr-3 md:pr-4 py-3 flex flex-row items-center justify-between">
                  <div className="font-semibold text-sm md:text-base">Error #{index + 1}</div>
                  <FaTimes
                    className="w-3 h-3 hover:cursor-pointer"
                    onClick={() => removeError(index)}
                  />
                </div>
                <div className="px-3 md:px-[10%] lg:px-[20%] py-4 md:py-8 flex flex-col gap-3">
                  <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_4fr] gap-2 md:gap-5 items-start md:items-center">
                    <div className="font-medium text-off-white text-sm md:text-md">
                      Detail
                    </div>
                    <Select
                      value={getOptionFromValue(
                        columnOptions,
                        error.field_name
                      )}
                      onChange={(newValue) => {
                        updateError(index, {
                          field_name: (newValue as Option)['value'],
                          current: getValueFromColumnNameForFeedback(
                            existingEvent,
                            (newValue as Option)['value']
                          ),
                        });
                      }}
                      options={columnOptions}
                      styles={{
                        ...(sortButtonStyle as any),
                        control: (styles: React.CSSProperties) => ({
                          ...styles,
                          ...(sortButtonStyle as any)['control'](),
                          border: `2px solid ${
                            error.field_name != '' ? sunnyGold : vibrantRed
                          }`,
                          '&:hover': {
                            border: `2px solid ${
                              error.field_name != '' ? sunnyGold : vibrantRed
                            }`,
                          },
                          height: '45px',
                          '@media (min-width: 768px)': {
                            height: '50px',
                          },
                        }),
                        overflow: 'visible',
                      }}
                      isOptionDisabled={(option) => option.disabled ?? false}
                      menuPortalTarget={document.body}
                    />
                  </div>
                  {error.field_name == '' ? (
                    <></>
                  ) : (
                    <>
                      <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_4fr] gap-2 md:gap-5 items-start md:items-center">
                        <div className="font-medium text-off-white text-sm md:text-md">
                          Current
                        </div>
                        <div className="flex flex-col justify-center h-[45px] md:h-[50px] rounded-[15px] px-[15px] md:px-[20px] bg-stone-gray border-2 border-stone-gray text-sm md:text-base">
                          {error.current
                            ? error.current.replaceAll(
                                Constants.delimiter,
                                ', '
                              )
                            : ''}
                        </div>
                      </div>
                      <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_4fr] gap-2 md:gap-5 items-start md:items-center">
                        <div className="font-medium text-off-white text-sm md:text-md">
                          Correction
                        </div>
                        <input
                          type="text"
                          className="w-full h-[45px] md:h-[50px] px-[15px] md:px-[20px] flex items-center justify-start rounded-[15px] bg-white outline-none border-2 text-sm md:text-base"
                          style={{
                            borderColor:
                              error.correction != '' ? sunnyGold : vibrantRed,
                          }}
                          value={error.correction}
                          onChange={(e) => {
                            updateError(index, {
                              correction: e.target.value,
                            });
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            className="bg-beaming-orange text-black border-beaming-orange-dark mx-auto flex w-full md:w-64 justify-center items-center rounded-lg border-2 gap-4 p-2 md:p-3 font-medium self-end hover:cursor-pointer mt-4 md:mt-6 text-sm md:text-base"
            onClick={handleSubmit}
          >
            {language === 'es' ? 'Subir reporte' : 'Submit Report'}
          </button>
        </div>
      </div>
      {overlay.isVisible && (
        <InfoOverlay
          message={overlay.message}
          onClose={() => dispatch({ type: HIDE_INFO_OVERLAY })}
        />
      )}
    </div>
  );
};

export default FeedbackDialog;
