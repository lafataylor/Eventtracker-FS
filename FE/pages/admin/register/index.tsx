import React, { useState } from 'react';
import { useRouter } from 'next/router';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import { register } from '../../../store/actions/auth'; // Changed from login to register
import { useStore } from '../../../store/store';
import InfoOverlay from '../../../components/Admin/InfoOverlay';
import { HIDE_INFO_OVERLAY } from '../../../store/actions/type';

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
    secretKey: { // Added secretKey field
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
      setPasswordsMatch(updatedRegisterForm.password.value === updatedRegisterForm.confirmPassword.value);
    }
  };

  const onRegisterHandler = (e: any) => {
    e.preventDefault();

    const registerEmail = registerForm['email']['value'];
    const registerPassword = registerForm['password']['value'];
    const confirmPassword = registerForm['confirmPassword']['value'];
    const secretKey = registerForm['secretKey']['value']; // Added secretKey

    if (registerEmail !== '' && registerPassword !== '' && secretKey !== '' && passwordsMatch) { // Added passwordsMatch check
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
    <div className="p-5 h-full font-montserrat flex flex-col w-full text-off-white">
      <nav className="border-b-4 border-beaming-orange">
        <div className="text-3xl font-semibold pb-3 px-3">Register</div>
      </nav>
      <div className="flex justify-center flex-1 items-center ">
        <div className="relative rounded-lg px-12 py-12 overflow-clip">
          <div className="w-full h-full bg-beaming-orange opacity-20 absolute top-0 left-0"></div>

          <form
            className="relative z-10 flex flex-col gap-8 items-center justify-center"
            onSubmit={onRegisterHandler}
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
                  value={registerForm['email']['value']}
                  onChange={(e) => onInputChangedHandler(e, 'email')}
                />
              </div>
              <div className="flex relative justify-between gap-8 items-center">
                <label htmlFor="password">Password</label>
                <input
                  className="rounded-xl h-14 px-3 min-w-[400px] border-2 border-slate-black text-sm text-black"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter Password"
                  required={true}
                  value={registerForm['password']['value']}
                  onChange={(e) => onInputChangedHandler(e, 'password')}
                />
                <img
                  onClick={() => setShowPassword(!showPassword)} // Toggle for password visibility
                  className=" cursor-pointer absolute right-4 w-5"
                  src={
                    showPassword
                      ? '/images/visiblePassword.png'
                      : '/images/hiddenPassword.png'
                  }
                />
              </div>
              <div className="flex relative justify-between gap-8 items-center">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  className="rounded-xl h-14 px-3 min-w-[400px] border-2 border-slate-black text-sm text-black"
                  type={showPassword ? 'text' : 'password'} // Use the same state for visibility
                  name="confirmPassword"
                  placeholder="Confirm Password"
                  required={true}
                  value={registerForm['confirmPassword']['value']}
                  onChange={(e) => onInputChangedHandler(e, 'confirmPassword')}
                />
                <img
                  onClick={() => setShowPassword(!showPassword)} // Toggle for confirm password visibility
                  className=" cursor-pointer absolute right-4 w-5"
                  src={
                    showPassword
                      ? '/images/visiblePassword.png'
                      : '/images/hiddenPassword.png'
                  }
                />
              </div>
              {!passwordsMatch && (
                <div className="text-sacral-red text-sm w-full text-right">Passwords do not match!</div> // Show error message if passwords do not match
              )}
              <div className="flex flex-col gap-2">
                <label htmlFor="secretKey">Secret Key</label>
                <textarea
                  className="rounded-xl h-14 p-3 min-w-[400px] min-h-[100px] border-2 border-slate-black text-sm text-black"
                  name="secretKey"
                  placeholder="Enter Secret Key"
                  required={true}
                  value={registerForm['secretKey']['value']}
                  onChange={(e) => onInputChangedHandler(e, 'secretKey')}
                />
              </div>
            </div>
            <div className="flex justify-center items-center">
              <button
                type="submit"
                className=" bg-beaming-orange w-72 h-[3.3rem] text-black rounded-2xl "
              >
                Register
              </button>
            </div>

            <div className="flex gap-1 text-sm">
              <span>Already have an account?</span>
              <button className="font-semibold underline underline-offset-4" onClick={()=>{router.push("/admin/login")}}>
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
