'use client'

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { logout } from '../../store/actions/auth';
import { useStore } from '../../store/store';
import GeneralFeedbackDialog from './GeneralFeedbackDialog';
import { FaBars } from 'react-icons/fa';

interface UserDropdownProps {
  isHomeSelected?: boolean; // Made optional
  isFavoritesSelected?: boolean; // Made optional
  isAboutSelected?: boolean; // Made optional
  language?: string;
  isLoggedOut?: boolean;
  setActiveDropdown?: (dropdown: string) => void;
  resetDropdowns?: boolean;
  hideDropdown?: boolean;
}

const UserDropdown: React.FC<UserDropdownProps> = ({ isHomeSelected = false, isFavoritesSelected = false, isAboutSelected = false, language = 'en', isLoggedOut = false, resetDropdowns = false, setActiveDropdown = () => {}, hideDropdown = false }) => {
  const [_, dispatch] = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const [initials, setInitials] = useState('');
  const [userFirstName, setUserFirstName] = useState('');
  const [userLastName, setUserLastName] = useState('');
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);

  useEffect(() => {
    const userFirstName = localStorage.getItem('userFirstName') || '';
    const userLastName = localStorage.getItem('userLastName') || '';
    setUserFirstName(userFirstName);
    setUserLastName(userLastName);
    setInitials((userFirstName.charAt(0) || '') + (userLastName.charAt(0) || ''));
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    setActiveDropdown('user');
  };
  
  useEffect(() => {
    if (resetDropdowns) {
      setIsOpen(false);
    }
  }, [resetDropdowns]);

  const handleNavigation = (path: string) => { 
    const curPath = router.asPath.split('?')[0]; // Get the current path without query parameters

    // If navigating to About/FAQ, remember the current city (if any)
    if (path === '/about') {
      try {
        const segments = curPath.split('/').filter(Boolean);
        let citySlug: string | null = null;

        if (segments.length === 1) {
          // e.g. "/mexico-city"
          const candidate = segments[0];
          if (!['about', 'favorites', 'login', 'register', 'admin', 'es'].includes(candidate)) {
            citySlug = candidate;
          }
        } else if (segments.length === 2 && segments[0] === 'es') {
          // e.g. "/es/mexico-city"
          const candidate = segments[1];
          if (!['about', 'favorites', 'login', 'register', 'admin'].includes(candidate)) {
            citySlug = candidate;
          }
        }

        if (citySlug) {
          localStorage.setItem('lastCity', citySlug);
        }
      } catch (e) {
        // fail silently if localStorage is unavailable
      }
    }

    const newPath = language === 'es' ? `${path}/es/` : path + '/';

    if (curPath == newPath) {
      const currentQuery = { ...router.query };
      currentQuery.email = 'null';
      router.push({
        pathname: router.pathname,
        query: currentQuery,
      }).then(() => {
        router.reload();
      });
    } else {
      router.push(newPath); // Navigate to the new path
    }
    setIsOpen(false);
  };

  const handleLogout = () => {
    logout(false)(dispatch);
    if (language === 'es') {
      router.push('/login/es');
    } else {
      router.push('/login');
    }
  };

  const handleLanguageChange = (lang: string) => {
    if (lang === 'es') {
      localStorage.setItem('language', 'es');
      router.push('/es/mexico-city');
    } else {
      localStorage.setItem('language', 'en');
      router.push('/mexico-city');
    }
  };

  const showGeneralFeedbackDialog = () => {
    setIsFeedbackDialogOpen(true);
  };

  const closeFeedbackDialog = () => {
    setIsFeedbackDialogOpen(false);
  };

  if (hideDropdown) {
    return null;
  }

  return (
    <div className="relative inline-block text-left">
      <div>
        {false && !isLoggedOut && <button
          onClick={toggleDropdown}
          className="ml-1 inline-flex justify-center items-center w-10 h-10 rounded-full border border-gray-300 shadow-sm bg-beaming-orange-dark text-sm font-semibold text-black hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-indigo-500"
        >
          {initials}
        </button>}
        {true && <button
            className="ml-[-5px] md:ml-[0px] flex items-center justify-center w-10 h-10 text-beaming-orange rounded-full"
            onClick={toggleDropdown}
          >
              <FaBars className="w-6 h-6" />
        </button>}
      </div>

      {isOpen && !isLoggedOut && (
        <div className="absolute right-0 z-10 mt-2 w-56 rounded-md shadow-lg bg-slate-black ring-1 ring-black ring-opacity-5 border border-2 border-midnight-transparent">
          <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
            <div className="px-4 flex flex-col justify-between items-center pt-2 text-sm text-white">
              <span className="block py-2 text-sm  text-white text-left"> {userFirstName} {userLastName}</span>
            </div>
            <button
              onClick={() => handleNavigation('/mexico-city')}
              className={`block w-full text-left px-4 py-2 mt-2 text-[16px] md:text-[16px] md:text-md font-semibold text-beaming-orange-light mx-3 w-[90%] text-center ${isHomeSelected ? 'bg-gunmetal-gray mx-2 rounded-lg border border-2 border-midnight-transparent' : ' hover:bg-gray-100'}`}
            >
              {language === 'es' ? 'Inicio' : 'Home'}
            </button>
            <button
              onClick={() => handleNavigation('/favorites')}
              className={`block w-full text-left px-4 py-2 text-[16px] md:text-[16px] md:text-md font-semibold text-beaming-orange-light mx-3 w-[90%] text-center ${isFavoritesSelected ? 'bg-gunmetal-gray mx-2 rounded-lg border border-2 border-midnight-transparent' : ' hover:bg-gray-100'}`}
            >
              {language === 'es' ? 'Favoritos' : 'Favorites'}
            </button>
            <button
              onClick={() => handleNavigation('/about')}
              className={`block w-full text-left px-4 py-2 text-[16px] md:text-[16px] md:text-md font-semibold text-beaming-orange-light mx-3 w-[90%] text-center hover:bg-gray-100 ${isAboutSelected ? 'bg-gunmetal-gray mx-2 rounded-lg border border-2 border-midnight-transparent' : ''}`}
            >
              {language === 'es' ? 'Acerca de' : 'About/FAQ'}
            </button>
            <button
              onClick={() => showGeneralFeedbackDialog()}
              className={`block w-full text-left px-4 py-2 text-[16px] md:text-[16px] md:text-md font-semibold text-beaming-orange-light mx-3 w-[90%] text-center ${false ? 'bg-gunmetal-gray mx-2 rounded-lg border border-2 border-midnight-transparent' : ' hover:bg-gray-100'}`}
            >
              {language === 'es' ? 'Enviar comentarios' : 'Submit Feedback'}
            </button>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2 mb-2 text-[16px] md:text-[16px] md:text-md text-muted-red hover:bg-gray-100 font-semibold text-center"
            >
              {language === 'es' ? 'Cerrar sesión' : 'Logout'}
            </button>
            <div className="px-4 flex flex-col justify-between items-center py-2 pb-4 text-sm text-white">
              {language != 'es' && <span className="text-xs text-white text-beaming-orange-light hover:cursor-pointer" onClick={() => handleLanguageChange('es')}>Switch to 🇲🇽 Español</span>}
              {language == 'es' && <span className="text-xs text-white text-beaming-orange-light hover:cursor-pointer" onClick={() => handleLanguageChange('en')}>Switch to 🇺🇸 English</span>}
            </div>
          </div>
        </div>
      )}

      {isOpen && isLoggedOut && (
        <div className="absolute right-0 z-10 mt-2 w-56 rounded-md shadow-lg bg-slate-black ring-1 ring-black ring-opacity-5 border border-2 border-midnight-transparent">
          <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
            <div className="px-4 flex flex-col justify-between items-center py-2 pb-4 text-sm text-white">
              <button
                onClick={() => router.push(language === 'es' ? '/login/es' : '/login')}
                className="block w-full text-left px-4 pt-2 pb-1 text-[16px] md:text-[16px] md:text-md font-semibold text-beaming-orange-light mx-3 w-[90%] text-center hover:bg-gray-100 mb-4"
              >
                {language === 'es' ? 'Iniciar sesión o registrarse' : 'Login or Sign Up'}
              </button>
              
              <button
                onClick={() => handleNavigation('/about')}
                className={`block rounded-lg w-full text-left px-4  text-[14px] md:text-md font-semibold text-beaming-orange mx-3 w-[90%] text-center mb-5 ${isAboutSelected ? 'bg-gunmetal-gray mx-2 rounded-lg border border-2 border-midnight-transparent' : ''}`}
              >
                {language === 'es' ? 'Acerca de' : 'About/FAQ'}
              </button>

              {language != 'es' && <span className="text-xs text-white text-beaming-orange-light hover:cursor-pointer" onClick={() => handleLanguageChange('es')}>Switch to 🇲🇽 Español</span>}
              {language == 'es' && <span className="text-xs text-white text-beaming-orange-light hover:cursor-pointer" onClick={() => handleLanguageChange('en')}>Switch to 🇺🇸 English</span>}

            </div>
          </div>
        </div>
      )}

      {isFeedbackDialogOpen && (
        <GeneralFeedbackDialog onClose={closeFeedbackDialog} />
      )}
    </div>
    
  );
};

export default UserDropdown;
