import React, { useState } from 'react';
import { useRouter } from 'next/router';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import { register } from '../../../store/actions/auth'; // Changed from login to register
import { useStore } from '../../../store/store';
import InfoOverlay from '../../../components/Admin/InfoOverlay';
import { HIDE_INFO_OVERLAY } from '../../../store/actions/type';
import {
  adminAuthFieldRowClass,
  adminAuthInputClass,
} from '../../../utils/adminMobileLayout';

const Index = () => {
  const [showPassword, setShowPassword] = useState(false); // Single state for both password fields
  const [state, dispatch] = useStore();
  const { loader, auth } = state;
  const { overlay } = auth;

  const router = useRouter();

  const [registerForm, setRegisterForm] = useState({
    email: {
      value: '',
    },
    password: {
      value: '',
    },
    confirmPassword: {
      value: '',
    },
    secretKey: {
      // Added secretKey field
      value: '',
    },
  });

  const [passwordsMatch, setPasswordsMatch] = useState(true); // State to track password match

  const onInputChangedHandler = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, // Updated to handle textarea
    inputIdentifier: string
  ) => {
    const updatedRegisterForm = { ...registerForm };
    const updatedFormElement = {
      ...(updatedRegisterForm as any)[inputIdentifier],
    };
    updatedFormElement.value = event.target.value;
    (updatedRegisterForm as any)[inputIdentifier] = updatedFormElement;
    setRegisterForm(updatedRegisterForm);

    // Check if passwords match
    if (inputIdentifier === 'password' || inputIdentifier === 'confirmPassword') {
      setPasswordsMatch(
        updatedRegisterForm.password.value ===
          updatedRegisterForm.confirmPassword.value
      );
    }
  };

  const onRegisterHandler = (e: any) => {
    e.preventDefault();

    const registerEmail = registerForm['email']['value'];
    const registerPassword = registerForm['password']['value'];
    const confirmPassword = registerForm['confirmPassword']['value'];
    const secretKey = registerForm['secretKey']['value']; // Added secretKey

    if (
      registerEmail !== '' &&
      registerPassword !== '' &&
      secretKey !== '' &&
      passwordsMatch
    ) {
      // Added passwordsMatch check
      register(
        {
          email: registerEmail,
          password: registerPassword,
          secret_key: secretKey, // Added secretKey to registration
        },
        true,
        () => {
          router.push('/admin/login');
        }
      )(dispatch);
    }
  };

  return (
    <div className="p-4 sm:p-5 h-full font-montserrat flex flex-col w-full max-w-full overflow-x-hidden text-off-white box-border">
      <nav className="border-b-4 border-beaming-orange">
        <div className="text-2xl sm:text-3xl font-semibold pb-3 px-3">
          Register
        </div>
      </nav>
      <div className="flex justify-center flex-1 items-center w-full min-w-0 px-1">
        <div className="relative rounded-lg px-4 py-8 sm:px-12 sm:py-12 overflow-clip w-full max-w-lg sm:max-w-none sm:w-auto">
          <div className="w-full h-full bg-beaming-orange opacity-20 absolute top-0 left-0"></div>

          <form
            className="relative z-10 flex flex-col gap-8 items-stretch sm:items-center justify-center w-full"
            onSubmit={onRegisterHandler}
          >
            <div className="flex flex-col gap-4 font-semibold w-full items-stretch sm:items-center">
              <div className={adminAuthFieldRowClass()}>
                <label htmlFor="email" className="shrink-0">
                  Email
                </label>
                <input
                  className={adminAuthInputClass()}
                  type="email"
                  id="email"
                  name="email"
                  placeholder="Enter Email"
                  required={true}
                  value={registerForm['email']['value']}
                  onChange={(e) => onInputChangedHandler(e, 'email')}
                />
              </div>
              <div className={`relative ${adminAuthFieldRowClass()}`}>
                <label htmlFor="password" className="shrink-0">
                  Password
                </label>
                <div className="relative w-full sm:w-auto">
                  <input
                    className={adminAuthInputClass()}
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    placeholder="Enter Password"
                    required={true}
                    value={registerForm['password']['value']}
                    onChange={(e) => onInputChangedHandler(e, 'password')}
                  />
                  <img
                    onClick={() => setShowPassword(!showPassword)}
                    className="cursor-pointer absolute right-4 top-1/2 -translate-y-1/2 w-5"
                    alt=""
                    src={
                      showPassword
                        ? '/images/visiblePassword.png'
                        : '/images/hiddenPassword.png'
                    }
                  />
                </div>
              </div>
              <div className={`relative ${adminAuthFieldRowClass()}`}>
                <label htmlFor="confirmPassword" className="shrink-0">
                  Confirm Password
                </label>
                <div className="relative w-full sm:w-auto">
                  <input
                    className={adminAuthInputClass()}
                    type={showPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    name="confirmPassword"
                    placeholder="Confirm Password"
                    required={true}
                    value={registerForm['confirmPassword']['value']}
                    onChange={(e) =>
                      onInputChangedHandler(e, 'confirmPassword')
                    }
                  />
                  <img
                    onClick={() => setShowPassword(!showPassword)}
                    className="cursor-pointer absolute right-4 top-1/2 -translate-y-1/2 w-5"
                    alt=""
                    src={
                      showPassword
                        ? '/images/visiblePassword.png'
                        : '/images/hiddenPassword.png'
                    }
                  />
                </div>
              </div>
              {!passwordsMatch && (
                <div className="text-sacral-red text-sm w-full text-left sm:text-right">
                  Passwords do not match!
                </div>
              )}
              <div className="flex flex-col gap-2 w-full max-w-md sm:max-w-none">
                <label htmlFor="secretKey">Secret Key</label>
                <textarea
                  className={`${adminAuthInputClass()} min-h-[100px] h-auto py-3`}
                  id="secretKey"
                  name="secretKey"
                  placeholder="Enter Secret Key"
                  required={true}
                  value={registerForm['secretKey']['value']}
                  onChange={(e) => onInputChangedHandler(e, 'secretKey')}
                />
              </div>
            </div>
            <div className="flex justify-center items-center w-full">
              <button
                type="submit"
                className="bg-beaming-orange w-full max-w-xs sm:w-72 h-[3.3rem] text-black rounded-2xl"
              >
                Register
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-1 text-sm">
              <span>Already have an account?</span>
              <button
                type="button"
                className="font-semibold underline underline-offset-4"
                onClick={() => {
                  router.push('/admin/login');
                }}
              >
                Login
              </button>
            </div>
          </form>
        </div>
      </div>

      {loader.isVisible ? <LoadingDialog /> : <></>}
      {overlay.isVisible && (
        <InfoOverlay
          message={overlay.message}
          onClose={() => dispatch({ type: HIDE_INFO_OVERLAY })}
        />
      )}
    </div>
  );
};

export default Index;
