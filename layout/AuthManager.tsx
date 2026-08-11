import { useRouter } from 'next/router';
import React, { ReactNode, useEffect, useCallback } from 'react';
import { logout } from '../store/actions/auth';
import { useStore } from '../store/store';
import { checkTokenExpiredStatus } from '../utils/utils';
import { refetchToken } from '../services/lib/admin';
import { refetchUserToken } from '../services/lib/user';

interface AuthManagerProps {
  children?: ReactNode;
}

const AuthManager = ({ children }: AuthManagerProps) => {
  const router = useRouter();
  const [state, dispatch] = useStore();
  const { auth } = state;

  const checkAuthStatus = useCallback(async () => {
    // Wait until the router is ready so that query parameters are available
    if (!router.isReady) return;

    const path = router.pathname;
    const asPath = router.asPath; // includes query parameters
    const isAdminRoute = path.includes('/admin');
    const isUserLoggedIn = auth.isUserLoggedIn;
    const isAdminLoggedIn = auth.isAdminLoggedIn;

    // Allow access to register and login pages without authentication
    if (
      (path === '/register' ||
        path === '/register/es' ||
        path === '/login' ||
        path === '/login/es') &&
      !isUserLoggedIn
    ) {
      return;
    }

    // *** Favorites routes check ***
    // We allow access if the URL contains query parameters (email and name)
    if (path.startsWith('/favorites')) {
      // Use asPath so that we can check the raw URL query string
      const hasEmailParam = asPath.includes('email=');
      const hasNameParam = asPath.includes('name=');
      if (hasEmailParam && hasNameParam) {
        // Allow access regardless of login
        return;
      } else if (!isUserLoggedIn) {
        // If on a favorites route without query params and not logged in, redirect to login.
        // You can adjust the language-specific redirect if needed.
        router.push(auth.chosenLanguage === 'es' ? '/login/es' : '/login');
        return;
      }
    }

    // Admin route logic (unchanged)
    if (isAdminRoute) {
      if (!isAdminLoggedIn) {
        if (path !== '/admin/register') {
          router.push('/admin/login');
        }
      } else {
        const isAdminTokenExpired = checkTokenExpiredStatus(true);
        if (isAdminTokenExpired) {
          try {
            await refetchToken(dispatch);
          } catch (error) {
            logout(true)(dispatch);
            router.push('/admin/login');
          }
        }
        if (path === '/admin/login') {
          router.push('/admin');
        }
      }
    } else {
      // For other (non-admin) pages
      // Allow access without login if not on login or register pages
      if (
        !isUserLoggedIn &&
        !path.includes('/login') &&
        !path.includes('/register')
      ) {
        return;
      }

      if (isUserLoggedIn) {
        const isUserTokenExpired = checkTokenExpiredStatus(false);
        if (isUserTokenExpired) {
          try {
            await refetchUserToken(dispatch);
          } catch (error) {
            logout(false)(dispatch);
            router.push('/login');
          }
        }
        if (path === '/login/es') {
          router.push('/es/mexico-city');
        } else if (path.includes('login')) {
          router.push('/mexico-city');
        }
      }
    }
  }, [
    auth.isAdminLoggedIn,
    auth.isUserLoggedIn,
    router.pathname,
    dispatch,
    router.isReady,
  ]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  return <>{children}</>;
};

export default AuthManager;
