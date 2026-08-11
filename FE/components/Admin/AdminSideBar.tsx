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

interface AdminSideBarProps {
  currentPage: string;
}

function AdminSideBar({ currentPage }: AdminSideBarProps) {
  const router = useRouter();
  const [state, dispatch] = useStore();
  const { selections } = state;

  const [haveUnseenErrors, setHaveUnseenErrors] = useState(false);

  const [adminEmail, setAdminEmail] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  

  useEffect(() => {
    checkNewErrors().then((res) => {
      setHaveUnseenErrors(res.data.data['has_errors']);
    });

    setAdminEmail(localStorage.getItem('adminEmail') || '');

    const adminEmailFromSession = localStorage.getItem('adminEmail');

    if (adminEmailFromSession == "dummy_@gmail.com" || adminEmailFromSession == 'superadmin@eventtracker.lafaslist.com'){
      setIsSuperAdmin(true);
    }else{
      setIsSuperAdmin(false);
    }
  }, []);

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

  return (
    <div className=" bg-slate-black flex flex-col justify-between pb-8 w-[17vw] text-lg  text-mist-white h-full ">
      <div></div>
      <div>
        {isSuperAdmin && <div
          onClick={() => onTabClickedHandler('accounts', '/admin')}
          className={
            currentPage == 'accounts'
              ? 'bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 '
              : 'hover:bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 hover:cursor-pointer'
          }
        >
          Accounts
        </div>}
        <div
          onClick={() => onTabClickedHandler('events', '/admin/events')}
          className={
            currentPage == 'events'
              ? 'bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 '
              : 'hover:bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 hover:cursor-pointer'
          }
        >
          Events
        </div>
        {isSuperAdmin && <div
          onClick={() => onTabClickedHandler('users', '/admin/users')}
          className={
            currentPage == 'users'
              ? 'bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 '
              : 'hover:bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 hover:cursor-pointer'
          }
        >
          Users
        </div>}
        <div
          onClick={() => onTabClickedHandler('errors', '/admin/errors')}
          className={
            'flex items-center flex-row gap-4 ' +
            (currentPage == 'errors'
              ? 'bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 '
              : 'hover:bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 hover:cursor-pointer')
          }
        >
          Errors{' '}
          {haveUnseenErrors ? (
            <IoIosInformationCircle className="text-beaming-orange w-6 h-6" />
          ) : (
            <></>
          )}
        </div>
        {isSuperAdmin && <div
          onClick={() => onTabClickedHandler('runs', '/admin/runs')}
          className={
            currentPage == 'runs'
              ? 'bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 '
              : 'hover:bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 hover:cursor-pointer'
          }
        >
          Runs
        </div>}
        <div
          onClick={() => onTabClickedHandler('duplicates', '/admin/duplicates')}
          className={
            currentPage == 'duplicates'
              ? 'bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 '
              : 'hover:bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 hover:cursor-pointer'
          }
        >
          Duplicates
        </div>
        {isSuperAdmin && <div
          onClick={() => onTabClickedHandler('feedback', '/admin/feedback')}
          className={
            currentPage == 'feedback'
              ? 'bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 '
              : 'hover:bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 hover:cursor-pointer'
          }
        >
          Feedback
        </div>}
        {isSuperAdmin && <div
          onClick={() => onTabClickedHandler('details', '/admin/details')}
          className={
            currentPage == 'details'
              ? 'bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 '
              : 'hover:bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 hover:cursor-pointer'
          }
        >
          Details
        </div>}
        {isSuperAdmin && <div
          onClick={() => onTabClickedHandler('settings', '/admin/settings')}
          className={
            currentPage == 'settings'
              ? 'bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 '
              : 'hover:bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 hover:cursor-pointer'
          }
        >
          Settings
        </div>}
      </div>

      <div
        onClick={() => {
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
        className="hover:bg-beaming-orange-dark py-4 rounded-lg w-full  flex pl-10 hover:cursor-pointer"
      >
        Logout
      </div>
    </div>
  );
}

export default AdminSideBar;
