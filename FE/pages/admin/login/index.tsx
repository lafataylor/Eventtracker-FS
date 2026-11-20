import React, { useState } from 'react';
import { useRouter } from 'next/router';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import { login } from '../../../store/actions/auth';
import { useStore } from '../../../store/store';
import InfoOverlay from '../../../components/Admin/InfoOverlay';
import { HIDE_INFO_OVERLAY } from '../../../store/actions/type';
import {
  adminAuthFieldRowClass,
  adminAuthInputClass,
} from '../../../utils/adminMobileLayout';

const Index = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [state, dispatch] = useStore();
  const { loader, auth } = state;
  const { overlay } = auth;
  const router = useRouter();

  const [loginForm, setLoginForm] = useState({
    email: {
      value: '',
    },
    password: {
      value: '',
    },
  });

  const onInputChangedHandler = (
    event: React.ChangeEvent<HTMLInputElement>,
    inputIdentifier: string
  ) => {
    const updatedLoginForm = { ...loginForm };
    const updatedFormElement = {
      ...(updatedLoginForm as any)[inputIdentifier],
    };
    updatedFormElement.value = event.target.value;
    (updatedLoginForm as any)[inputIdentifier] = updatedFormElement;
    setLoginForm(updatedLoginForm);
  };

  const onLoginHandler = (e: any) => {
    e.preventDefault();

    const loginEmail = loginForm['email']['value'];
    const loginPassword = loginForm['password']['value'];

    if (loginEmail !== '' && loginPassword !== '') {
      login(
        {
          email: loginEmail,
          password: loginPassword,
        },
        true
      )(dispatch);
    }
  };

  const onRegisterHandler = (e: any) => {
    e.preventDefault();

    router.push('/admin/register');
  };

  return (
    <div className="p-4 sm:p-5 h-full font-montserrat flex flex-col w-full max-w-full overflow-x-hidden text-off-white box-border">
      <nav className="border-b-4 border-beaming-orange">
        <div className="text-2xl sm:text-3xl font-semibold pb-3 px-3">Login</div>
      </nav>
      <div className="flex justify-center flex-1 items-center w-full min-w-0 px-1">
        <div className="relative rounded-lg px-4 py-8 sm:px-12 sm:py-12 overflow-clip w-full max-w-lg sm:max-w-none sm:w-auto">
          <div className="w-full h-full bg-beaming-orange opacity-20 absolute top-0 left-0"></div>

          <form
            className="relative z-10 flex flex-col gap-8 items-stretch sm:items-center justify-center w-full"
            onSubmit={onLoginHandler}
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
                  value={loginForm['email']['value']}
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
                    type={showPassword ? 'password' : 'text'}
                    id="password"
                    name="password"
                    placeholder="Enter Password"
                    required={true}
                    value={loginForm['password']['value']}
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
              <div className="flex justify-end w-full max-w-md sm:max-w-none">
                <button
                  type="button"
                  className="text-sm font-medium underline underline-offset-4 whitespace-nowrap"
                >
                  Forgot Password ?
                </button>
              </div>
            </div>
            <div className="flex justify-center items-center w-full">
              <button
                type="submit"
                className="bg-beaming-orange w-full max-w-xs sm:w-72 h-[3.3rem] text-black rounded-2xl"
              >
                Login
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-1 text-sm">
              <span>Don’t have an account?</span>

              <button
                type="button"
                className="font-semibold underline underline-offset-4"
                onClick={onRegisterHandler}
              >
                Sign Up
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
