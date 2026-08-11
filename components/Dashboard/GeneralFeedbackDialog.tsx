import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/store';
import { FiX } from 'react-icons/fi';
import { shareFeedback } from '../../services/lib/user';
import { SHOW_INFO_OVERLAY } from '../../store/actions/type';

interface GeneralFeedbackDialogProps {
  onClose: () => void;
}

const GeneralFeedbackDialog: React.FC<GeneralFeedbackDialogProps> = ({ onClose }) => {
  const [state, dispatch] = useStore();
  const [feedbackText, setFeedbackText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState('');
  const language = localStorage.getItem('language');
  const firstName = localStorage.getItem('userFirstName') || '';
  const lastName = localStorage.getItem('userLastName') || '';
  const email = localStorage.getItem('userEmail') || '';

  const feedbackTitle = language === 'es' ? 'Comentarios' : 'Feedback';
  const placeholderText = language === 'es' ? 'Escribe tus comentarios aquí...' : 'Enter your feedback here...';
  const submitButtonText = language === 'es' ? 'Enviar Comentarios' : 'Submit Feedback';

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleEscape);

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      className="fixed top-0 left-0 z-30 flex justify-center items-center w-[100vw] h-[100vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 lg:w-[70vw] h-[70%] w-full flex flex-col px-6 py-6 gap-5 lg:rounded-lg rounded-sm rounded-3xl bg-slate-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between">
          <h1 className='text-2xl font-semibold text-white'>{feedbackTitle}</h1>
          <FiX
            onClick={onClose}
            className="flex justify-end w-5 h-5 lg:w-7 lg:h-7 hover:cursor-pointer text-mist-white"
          />
        </div>
        {!response && <textarea
          className={`w-full h-full p-4 rounded-lg border border-midnight-dark ${isLoading ? 'bg-midnight bg-opacity-60' : 'bg-midnight'} text-white`}
          placeholder={placeholderText}
          value={feedbackText}
          disabled={isLoading}
          onChange={(e) => setFeedbackText(e.target.value)}
        />}
        {response && <div className="text-white h-full flex flex-col justify-center items-center">{response}</div>}
        {!response && <div className="flex justify-end">
          <button
            className="mt-2 w-[200px] bg-beaming-orange text-black hover:bg-beaming-orange-dark border-beaming-orange-dark rounded-lg px-4 py-2 font-medium disabled:bg-opacity-60 disabled:cursor-not-allowed"
            disabled={isLoading}
            onClick={() => {

              setIsLoading(true);
              
              // Handle feedback submission logic here
              shareFeedback(feedbackText, email, firstName, lastName)
                .then(() => {
                  setResponse('Feedback submitted successfully!');
                })
                .catch((error) => {
                  setResponse('Failed to submit feedback. Please try again.');
                })
                .finally(() => {
                  setIsLoading(false); // Reset loading state after submission
                  //console.log(feedbackText);
                  setFeedbackText(''); // Clear the textarea after submission
                  //onClose(); // Close the dialog after submission
                });
              
            }}
          >
            {submitButtonText}
          </button>
        </div>}
      </div>
    </div>
  );
};

export default GeneralFeedbackDialog;
