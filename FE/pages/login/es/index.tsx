import React, { useState } from 'react';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import { login } from '../../../store/actions/auth';
import { useStore } from '../../../store/store';
import { useRouter } from 'next/router';
import InfoOverlay from '../../../components/Admin/InfoOverlay';
import { HIDE_INFO_OVERLAY } from '../../../store/actions/type';
import Image from 'next/image';

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

  const handleLanguageChange = (language: string) => {
    localStorage.setItem('language', language);
    router.push('/login/');
  }

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

  const onLoginHandler = (e: React.FormEvent) => {
    e.preventDefault();

    const loginEmail = loginForm['email']['value'];
    const loginPassword = loginForm['password']['value'];

    if (loginEmail !== '' && loginPassword !== '') {
      login(
        {
          email: loginEmail,
          password: loginPassword,
        },
        false
      )(dispatch);
    }
  };

  return (
    <div className="flex flex-col min-h-screen p-5  font-montserrat">
      <nav className=" font-montserrat">
        <h2 
          onClick={() => router.push('/es/mexico-city')}
          className="text-2xl lg:text-4xl font-semibold text-mist-white pb-3 md:px-3 flex items-center">
          <Image
            src="/images/wordMark.png"
            alt="Lafa's List"
            width={240}
            height={80}
          />
        </h2>
      </nav>

      <div className="flex flex-col justify-center flex-1  items-center">
        <div className="w-full max-w-md p-6 bg-midnight-dark shadow-lg  rounded-lg relative">
          <div className="w-full h-full bg-beaming-orange opacity-30 absolute top-0 left-0 rounded-lg"></div>

          <h2 className="text-2xl font-semibold text-off-white text-center  mb-3 relative z-10">
            Iniciar sesión
          </h2>
          <p className="text-center text-off-white mb-6 relative z-10">
            Por favor, ingrese sus credenciales
          </p>

          <form className="space-y-4 flex flex-col" onSubmit={onLoginHandler}>
            <div className="relative z-10">
              <input
                type="email"
                placeholder="Correo electrónico"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={loginForm['email']['value']}
                onChange={(e) => onInputChangedHandler(e, 'email')}
              />
            </div>
            <div className="relative z-10">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={loginForm['password']['value']}
                onChange={(e) => onInputChangedHandler(e, 'password')}
              />
              <img
                onClick={() => setShowPassword(!showPassword)}
                className=" cursor-pointer absolute right-4 top-[1.1rem] w-5"
                src={
                  showPassword
                    ? '/images/visiblePassword.png'
                    : '/images/hiddenPassword.png'
                }
              />
            </div>

            <button
              type="submit"
              className="w-full z-10 py-3 bg-beaming-orange hover:bg-beaming-orange-dark text-white rounded-lg font-semibold transition"
            >
              Iniciar sesión
            </button>
          </form>

          <p className="mt-6 text-sm text-stone-gray text-center relative z-10">
            Nuevo usuario?{' '}
            <a href="/register/es" className="text-beaming-orange hover:underline">
              Registrarse aquí
            </a>
          </p>
        </div>
      </div>

      <span className="text-xs text-white text-beaming-orange-light hover:cursor-pointer pl-2 pb-2" onClick={()=>{handleLanguageChange("en")}}>Switch to 🇺🇸 English</span>

      {loader.isVisible && <LoadingDialog />}
      {overlay.isVisible && (
        <InfoOverlay
          message={overlay.message}
          onClose={() => dispatch({ type: HIDE_INFO_OVERLAY })}
          language="es"
        />
      )}
    </div>
  );
};

export default Index;
