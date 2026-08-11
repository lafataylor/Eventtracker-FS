import React, { useState } from 'react';
import { useRouter } from 'next/router';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import { login } from '../../../store/actions/auth';
import { useStore } from '../../../store/store';
import InfoOverlay from '../../../components/Admin/InfoOverlay';
import { HIDE_INFO_OVERLAY } from '../../../store/actions/type';

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
  }

  return (
    <div className="p-5 h-full font-montserrat flex flex-col w-full text-off-white">
      <nav className="border-b-4 border-beaming-orange">
        <div className="text-3xl font-semibold pb-3 px-3">Login</div>
      </nav>
      <div className="flex justify-center flex-1 items-center ">
        <div className="relative rounded-lg px-12 py-12 overflow-clip">
          <div className="w-full h-full bg-beaming-orange opacity-20 absolute top-0 left-0"></div>

          <form
            className="relative z-10 flex flex-col gap-8 items-center justify-center"
            onSubmit={onLoginHandler}
          >
            <div className="flex flex-col gap-4 font-semibold">
              <div className="flex justify-between gap-8 items-center">
                <label htmlFor="email">Email</label>
                <input
                  className="rounded-xl h-14 px-3 min-w-[400px] border-2 border-slate-black text-sm text-black"
                  type="email"
                  name="email"
                  placeholder="Enter Email"
                  required={true}
                  value={loginForm['email']['value']}
                  onChange={(e) => onInputChangedHandler(e, 'email')}
                />
              </div>
              <div className="flex relative justify-between gap-8 items-center">
                <label htmlFor="password">Password</label>
                <input
                  className="rounded-xl h-14 px-3 min-w-[400px] border-2 border-slate-black text-sm text-black"
                  type={showPassword ? 'password' : 'text'}
                  name="password"
                  placeholder="Enter Password"
                  required={true}
                  value={loginForm['password']['value']}
                  onChange={(e) => onInputChangedHandler(e, 'password')}
                />
                <img
                  onClick={() => setShowPassword(!showPassword)}
                  className=" cursor-pointer absolute right-4 w-5"
                  src={
                    showPassword
                      ? '/images/visiblePassword.png'
                      : '/images/hiddenPassword.png'
                  }
                />
              </div>
              <div className="flex justify-end">
                <button className="text-sm font-medium underline underline-offset-4 ">
                  Forgot Password ?
                </button>
              </div>
            </div>
            <div className="flex justify-center items-center">
              <button
                type="submit"
                className=" bg-beaming-orange w-72 h-[3.3rem] text-black rounded-2xl "
              >
                Login
              </button>
            </div>

            <div className="flex gap-1 text-sm">
              <span>Don’t have an account?</span>
              

              <button className="font-semibold underline underline-offset-4" onClick={onRegisterHandler}>
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
