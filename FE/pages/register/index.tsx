import React, { useState } from 'react';
import LoadingDialog from '../../components/overlay/LoadingDialog';
import { register } from '../../store/actions/auth'; // Assuming a similar register action exists
import { useStore } from '../../store/store';
import InfoOverlay from '../../components/Admin/InfoOverlay';
import { HIDE_INFO_OVERLAY } from '../../store/actions/type';
import { useRouter } from 'next/router';
import Image from 'next/image';

const Register = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordAgain, setShowPasswordAgain] = useState(false); // State for toggling password visibility for "Password Again"
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
    router.push('/register/es');
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
    setErrorMessages({ email: '', password: '', passwordAgain: '', first_name: '', last_name: '' }); // Reset error messages

    const {
      email,
      password,
      passwordAgain,
      first_name,
      last_name,
      description,
    } = registerForm;

    // Validation checks
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Simple email regex
    let valid = true;

    if (!email || !emailRegex.test(email)) {
      setErrorMessages(prev => ({ ...prev, email: 'Please enter a valid email address.' }));
      valid = false;
    }
    if (!password || password.length < 6) {
      setErrorMessages(prev => ({ ...prev, password: 'Password must be at least 6 characters long.' }));
      valid = false;
    }
    if (password !== passwordAgain) {
      setErrorMessages(prev => ({ ...prev, passwordAgain: 'Passwords do not match.' }));
      valid = false;
    }
    if (!first_name) {
      setErrorMessages(prev => ({ ...prev, first_name: 'First Name is required.' }));
      valid = false;
    }

    if (!valid) return; // Stop if validation fails

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
    
    // Redirect to login page on successful registration
    router.push('/login');
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
            Register
          </h2>
          <p className="text-center text-off-white mb-6 relative z-10">
            Please enter your details to create an account
          </p>

          <form
            className="space-y-4 flex flex-col"
            onSubmit={onRegisterHandler}
          >
            <div className="relative z-10">
              <input
                type="email"
                placeholder="Email"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={registerForm.email}
                onChange={(e) => onInputChangedHandler(e, 'email')}
              />
              {errorMessages.email && <p className="text-vibrant-red">{errorMessages.email}</p>}
            </div>
            <div className="relative z-10">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
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
                alt="Toggle password visibility"
              />
              {errorMessages.password && <p className="text-vibrant-red">{errorMessages.password}</p>}
            </div>
            <div className="relative z-10">
              <input
                type={showPasswordAgain ? 'text' : 'password'}
                placeholder="Password Again"
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
                alt="Toggle password visibility"
              />
              {errorMessages.passwordAgain && <p className="text-vibrant-red">{errorMessages.passwordAgain}</p>}
            </div>
            <div className="relative z-10">
              <input
                type="text"
                placeholder="First Name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={registerForm.first_name}
                onChange={(e) => onInputChangedHandler(e, 'first_name')}
              />
              {errorMessages.first_name && <p className="text-vibrant-red">{errorMessages.first_name}</p>}
            </div>
            <div className="relative z-10">
              <input
                type="text"
                placeholder="Last Name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={registerForm.last_name}
                onChange={(e) => onInputChangedHandler(e, 'last_name')}
              />
              {errorMessages.last_name && <p className="text-vibrant-red">{errorMessages.last_name}</p>}
            </div>
            {/* <div className="relative z-10">
              <textarea
                placeholder="Description (optional)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-beaming-orange transition"
                value={registerForm.description}
                onChange={(e) => onInputChangedHandler(e, 'description')}
              />
            </div> */}

            <button
              type="submit"
              className="w-full z-10 py-3 bg-beaming-orange hover:bg-beaming-orange-dark text-white rounded-lg font-semibold transition"
            >
              Register
            </button>
          </form>

          <p className="mt-6 text-sm text-stone-gray text-center relative z-10">
            Already a user?{' '}
            <a href="/login" className="text-beaming-orange hover:underline">
              Login here
            </a>
          </p>
        </div>
      </div>

      <span className="text-xs text-white text-beaming-orange-light hover:cursor-pointer pl-2 pb-2" onClick={()=>{handleLanguageChange("es")}}>Switch to 🇲🇽 Español</span>

      {loader.isVisible && <LoadingDialog />}
      {overlay.isVisible && (
        <InfoOverlay
          message={overlay.message}
          onClose={() => dispatch({ type: HIDE_INFO_OVERLAY })}
        />
      )}
    </div>
  );
};

export default Register;
