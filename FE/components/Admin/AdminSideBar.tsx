const { useRouter } = require('next/router');
import React, { useState, useEffect } from 'react';
import {
  requestMiddleware,
  deleteAdminAccounts,
  deleteEvents,
  checkNewErrors,
} from '../../services/lib/admin';
import { logout } from '../../store/actions/auth';
import {
  showLoadingDialog,
  hideLoadingDialog,
} from '../../store/actions/loadingState';
import { resetSelections } from '../../store/actions/selections';
import { useStore } from '../../store/store';
import { IoIosInformationCircle } from 'react-icons/io';
import { HiOutlineMenu, HiOutlineX } from 'react-icons/hi';
import { isSuperAdminEmail } from '../../utils/superAdmin';

interface AdminSideBarProps {
  currentPage: string;
  /** Shown in the mobile top bar (defaults to "Admin"). */
  mobileTitle?: string;
  /** Right-side control in the mobile top bar (e.g. Accounts "+ Add"). */
  mobileTrailing?: React.ReactNode;
}

function AdminSideBar({
  currentPage,
  mobileTitle = 'Admin',
  mobileTrailing,
}: AdminSideBarProps) {
  const router = useRouter();
  const [state, dispatch] = useStore();
  const { selections } = state;

  const [haveUnseenErrors, setHaveUnseenErrors] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [adminEmail, setAdminEmail] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    checkNewErrors().then((res) => {
      setHaveUnseenErrors(res.data.data['has_errors']);
    });

    setAdminEmail(localStorage.getItem('adminEmail') || '');

    const adminEmailFromSession = localStorage.getItem('adminEmail');

    if (isSuperAdminEmail(adminEmailFromSession)) {
      setIsSuperAdmin(true);
    } else {
      setIsSuperAdmin(false);
    }
  }, []);

  // Close the drawer when the route changes (mobile nav).
  useEffect(() => {
    setMenuOpen(false);
  }, [currentPage]);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const deleteSelectedItemsOnNav = async (callback: Function) => {
    const data = Object.keys(selections.accounts.items);

    if (await requestMiddleware(dispatch)) {
      showLoadingDialog()(dispatch);
      (selections.accounts.type == 'account'
        ? deleteAdminAccounts({ accounts: data })
        : deleteEvents({ events: data })
      )
        .then(() => {
          hideLoadingDialog()(dispatch);
          callback();
        })
        .catch((error) => {
          alert(error);
          hideLoadingDialog()(dispatch);
        });
    }
  };

  const onTabClickedHandler = (page: string, link: string) => {
    setMenuOpen(false);
    if ('items' in selections.accounts) {
      deleteSelectedItemsOnNav(() => {
        resetSelections()(dispatch);
        if (currentPage != page) {
          router.push(link);
        }
      });
    } else {
      resetSelections()(dispatch);
      if (currentPage != page) {
        router.push(link);
      }
    }
  };

  const navItemClass = (page: string) =>
    currentPage == page
      ? 'bg-beaming-orange-dark py-4 rounded-lg w-full flex pl-10 '
      : 'hover:bg-beaming-orange-dark py-4 rounded-lg w-full flex pl-10 hover:cursor-pointer';

  const renderNavPanel = () => (
    <div className="bg-slate-black flex flex-col justify-between pb-8 w-full text-lg text-mist-white h-full">
      <div></div>
      <div>
        {isSuperAdmin && (
          <div
            onClick={() => onTabClickedHandler('accounts', '/admin')}
            className={navItemClass('accounts')}
          >
            Accounts
          </div>
        )}
        <div
          onClick={() => onTabClickedHandler('events', '/admin/events')}
          className={navItemClass('events')}
        >
          Events
        </div>
        {isSuperAdmin && (
          <div
            onClick={() => onTabClickedHandler('users', '/admin/users')}
            className={navItemClass('users')}
          >
            Users
          </div>
        )}
        <div
          onClick={() => onTabClickedHandler('errors', '/admin/errors')}
          className={
            'flex items-center flex-row gap-4 ' + navItemClass('errors')
          }
        >
          Errors{' '}
          {haveUnseenErrors ? (
            <IoIosInformationCircle className="text-beaming-orange w-6 h-6" />
          ) : (
            <></>
          )}
        </div>
        {isSuperAdmin && (
          <div
            onClick={() => onTabClickedHandler('runs', '/admin/runs')}
            className={navItemClass('runs')}
          >
            Runs
          </div>
        )}
        <div
          onClick={() => onTabClickedHandler('duplicates', '/admin/duplicates')}
          className={navItemClass('duplicates')}
        >
          Duplicates
        </div>
        {isSuperAdmin && (
          <div
            onClick={() => onTabClickedHandler('feedback', '/admin/feedback')}
            className={navItemClass('feedback')}
          >
            Feedback
          </div>
        )}
        {isSuperAdmin && (
          <div
            onClick={() => onTabClickedHandler('details', '/admin/details')}
            className={navItemClass('details')}
          >
            Details
          </div>
        )}
        {isSuperAdmin && (
          <div
            onClick={() => onTabClickedHandler('settings', '/admin/settings')}
            className={navItemClass('settings')}
          >
            Settings
          </div>
        )}
      </div>

      <div
        onClick={() => {
          setMenuOpen(false);
          if ('items' in selections.accounts) {
            deleteSelectedItemsOnNav(() => {
              resetSelections()(dispatch);
              logout(true)(dispatch);
            });
          } else {
            resetSelections()(dispatch);
            logout(true)(dispatch);
          }
        }}
        className="hover:bg-beaming-orange-dark py-4 rounded-lg w-full flex pl-10 hover:cursor-pointer"
      >
        Logout
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar: hamburger + title + optional action. Desktop unchanged. */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between gap-2 px-3 py-3 bg-midnight border-b-4 border-beaming-orange">
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="relative z-10 flex items-center justify-center w-11 h-11 rounded-lg text-mist-white hover:bg-beaming-orange-dark"
        >
          {menuOpen ? (
            <HiOutlineX className="w-6 h-6" />
          ) : (
            <HiOutlineMenu className="w-6 h-6" />
          )}
        </button>
        <span className="absolute left-0 right-0 text-center pointer-events-none text-mist-white font-bold text-xl truncate px-16">
          {mobileTitle}
        </span>
        <div className="relative z-10 min-w-[2.75rem] flex justify-end items-center">
          {mobileTrailing ?? <span className="w-11" aria-hidden />}
        </div>
      </div>

      {/* Backdrop when the drawer is open */}
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-40 bg-transparent-black"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      {/* Mobile drawer */}
      <aside
        className={
          'md:hidden fixed top-0 left-0 z-50 h-full w-[min(80vw,16rem)] transform transition-transform duration-200 ease-out ' +
          (menuOpen ? 'translate-x-0' : '-translate-x-full')
        }
        aria-hidden={!menuOpen}
      >
        {renderNavPanel()}
      </aside>

      {/* Desktop sidebar — same width and look as before */}
      <aside className="hidden md:flex md:flex-col md:shrink-0 md:w-[17vw] md:h-full">
        {renderNavPanel()}
      </aside>
    </>
  );
}

export default AdminSideBar;
