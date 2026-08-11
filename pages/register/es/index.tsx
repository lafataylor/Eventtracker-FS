import React, { useState } from 'react';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import { register } from '../../../store/actions/auth'; // Suponiendo que existe una acción de registro similar
import { useStore } from '../../../store/store';
import InfoOverlay from '../../../components/Admin/InfoOverlay';
import { HIDE_INFO_OVERLAY } from '../../../store/actions/type';
import { useRouter } from 'next/router';
import Image from 'next/image';

const Register = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordAgain, setShowPasswordAgain] = useState(false); // Estado para alternar la visibilidad de la contraseña para "Contraseña de nuevo"
  const [state, dispatch] = useStore();
  const { loader, auth } = state;
  const { overlay } = auth;

  const [registerForm, setRegisterForm] = useState({
    email: '',
    password: '',
    passwordAgain: '',
    first_name: '',
    last_name: '',
    description: '',
  });
  const router = useRouter();
  const [errorMessages, setErrorMessages] = useState({
    email: '',
    password: '',
    passwordAgain: '',
    first_name: '',
    last_name: '',
  });

  const handleLanguageChange = (language: string) => {
    localStorage.setItem('language', language);
    router.push('/register/');
  };

  const onInputChangedHandler = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    inputIdentifier: string
  ) => {
    setRegisterForm({
      ...registerForm,
      [inputIdentifier]: event.target.value,
    });
  };

  const onRegisterHandler = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessages({ email: '', password: '', passwordAgain: '', first_name: '', last_name: '' }); // Restablecer mensajes de error

    const {
      email,
      password,
      passwordAgain,
      first_name,
      last_name,
      description,
    } = registerForm;

    // Comprobaciones de validación
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Regex simple para email
    let valid = true;

    if (!email || !emailRegex.test(email)) {
      setErrorMessages(prev => ({ ...prev, email: 'Por favor, ingresa una dirección de correo electrónico válida.' }));
      valid = false;
    }
    if (!password || password.length < 6) {
      setErrorMessages(prev => ({ ...prev, password: 'La contraseña debe tener al menos 6 caracteres.' }));
      valid = false;
    }
    if (password !== passwordAgain) {
      setErrorMessages(prev => ({ ...prev, passwordAgain: 'Las contraseñas no coinciden.' }));
      valid = false;
    }
    if (!first_name) {
      setErrorMessages(prev => ({ ...prev, first_name: 'El nombre es obligatorio.' }));
      valid = false;
    }

    if (!valid) return; // Detener si la validación falla

    register(
      {
        email,
        password,
        first_name,
        last_name,
        description,
      },
      false
    )(dispatch);
    
    // Redirigir a la página de inicio de sesión tras un registro exitoso
    router.push('/login/es');
  };

  return (
    <div className="flex flex-col min-h-screen p-5  font-montserrat">
      <nav className="">
        <h2 className="text-2xl lg:text-4xl font-semibold text-mist-white pb-3 md:px-3 flex items-center">
          <Image
            src="/images/wordMark.png"
            alt="Lafa's List"
            width={240}
            height={80}
          />
        </h2>
      </nav>

      <div className="flex py-10 flex-col justify-center flex-1 items-center">
        <div className="w-full max-w-md p-6 bg-midnight-dark shadow-lg border rounded-lg relative">
          <div className="w-full h-full bg-beaming-orange opacity-30 absolute top-0 left-0 rounded-lg"></div>

          <h2 className="text-2xl font-semibold text-center text-off-white mb-3 relative z-10">
            Registrarse
          </h2>
          <p className="text-center text-off-white mb-6 relative z-10">
            Por favor, ingresa tus datos para crear una cuenta
          </p>

          <form
            className="space-y-4 flex flex-col"
            onSubmit={onRegisterHandler}
          >
            <div className="relative z-10">
              <input
                type="email"
                placeholder="Correo Electrónico"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={registerForm.email}
                onChange={(e) => onInputChangedHandler(e, 'email')}
              />
              {errorMessages.email && <p className="text-vibrant-red">{errorMessages.email}</p>}
            </div>
            <div className="relative z-10">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={registerForm.password}
                onChange={(e) => onInputChangedHandler(e, 'password')}
              />
              <img
                onClick={() => setShowPassword(!showPassword)}
                className="cursor-pointer absolute right-4 top-[1.1rem] w-5"
                src={
                  showPassword
                    ? '/images/visiblePassword.png'
                    : '/images/hiddenPassword.png'
                }
                alt="Alternar visibilidad de la contraseña"
              />
              {errorMessages.password && <p className="text-vibrant-red">{errorMessages.password}</p>}
            </div>
            <div className="relative z-10">
              <input
                type={showPasswordAgain ? 'text' : 'password'}
                placeholder="Contraseña de nuevo"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={registerForm.passwordAgain}
                onChange={(e) => onInputChangedHandler(e, 'passwordAgain')}
              />
              <img
                onClick={() => setShowPasswordAgain(!showPasswordAgain)}
                className="cursor-pointer absolute right-4 top-[1.1rem] w-5"
                src={
                  showPasswordAgain
                    ? '/images/visiblePassword.png'
                    : '/images/hiddenPassword.png'
                }
                alt="Alternar visibilidad de la contraseña"
              />
              {errorMessages.passwordAgain && <p className="text-vibrant-red">{errorMessages.passwordAgain}</p>}
            </div>
            <div className="relative z-10">
              <input
                type="text"
                placeholder="Nombre"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={registerForm.first_name}
                onChange={(e) => onInputChangedHandler(e, 'first_name')}
              />
              {errorMessages.first_name && <p className="text-vibrant-red">{errorMessages.first_name}</p>}
            </div>
            <div className="relative z-10">
              <input
                type="text"
                placeholder="Apellido"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={registerForm.last_name}
                onChange={(e) => onInputChangedHandler(e, 'last_name')}
              />
              {errorMessages.last_name && <p className="text-vibrant-red">{errorMessages.last_name}</p>}
            </div>
            {/* <div className="relative z-10">
              <textarea
                placeholder="Descripción (opcional)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={registerForm.description}
                onChange={(e) => onInputChangedHandler(e, 'description')}
              />
            </div> */}

            <button
              type="submit"
              className="w-full z-10 py-3 bg-beaming-orange hover:bg-beaming-orange-dark text-white rounded-lg font-semibold transition"
            >
              Registrarse
            </button>
          </form>

          <p className="mt-6 text-sm text-stone-gray text-center relative z-10">
            ¿Ya eres usuario?{' '}
            <a href="/login/es" className="text-beaming-orange hover:underline">
              Inicia sesión aquí
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

export default Register;
