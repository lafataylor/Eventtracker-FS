import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useStore } from '../../../store/store';
import AdminSideBar from '../../../components/Admin/AdminSideBar';
import { requestMiddleware } from '../../../services/lib/admin';
import {
  showLoadingDialog,
  hideLoadingDialog,
} from '../../../store/actions/loadingState';
import { FaSearch, FaEdit, FaTrash, FaTimes } from 'react-icons/fa';
import { getAllUsers, editUser as updateUserAPI } from '../../../services/lib/admin';
import { IoMdSearch } from 'react-icons/io';
import { FiX } from 'react-icons/fi';
import Spinner from '../../../components/Spinner';

// User interface
interface User {
  id: string;
  email: string;
  usertype?: string;
  firstName?: string;
  lastName?: string;
  description?: string;
  linkedAccounts?: string;
  isActive?: boolean;
  lastLogin?: string;
}

function Users() {
  const [state, dispatch] = useStore();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [createUser, setCreateUser] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<string[]>([]);
  const [accountInput, setAccountInput] = useState('');
  const accountsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadUsers = async () => {
      if (await requestMiddleware(dispatch)) {
        try {
          showLoadingDialog()(dispatch);
          const response = await getAllUsers();
          setUsers(response?.data?.users || []);
          setIsLoading(false);
          hideLoadingDialog()(dispatch);
        } catch (error) {
          console.error('Error loading users:', error);
          alert('Failed to load users');
          hideLoadingDialog()(dispatch);
          setIsLoading(false);
        }
      }
    };

    loadUsers();
  }, [dispatch, state.auth?.users]);

  const filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.lastName?.toLowerCase().includes(searchTerm.toLowerCase())
  );


  const getFullName = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    } else if (user.firstName) {
      return user.firstName;
    } else if (user.lastName) {
      return user.lastName;
    }
    return 'N/A';
  };


  // Sort users alphabetically by name
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const nameA = getFullName(a).toLowerCase();
    const nameB = getFullName(b).toLowerCase();
    return nameA.localeCompare(nameB);
  });
  
  const handleEditUser = (user: User) => {
    setEditUser(user);
    // Parse and set linked accounts if they exist
    if (user.linkedAccounts) {
      try {
        const accounts = JSON.parse(user.linkedAccounts);
        setLinkedAccounts(Array.isArray(accounts) ? accounts : []);
      } catch (e) {
        // If not valid JSON, treat as comma-separated string
        console.log("!!!",user.linkedAccounts);
        setLinkedAccounts(user.linkedAccounts.split(',').map(acc => acc.trim()));
      }
    } else {
      setLinkedAccounts([]);
    }
  };

  const closeEditModal = () => {
    setEditUser(null);
    setLinkedAccounts([]);
    setAccountInput('');
  };

  const addAccount = (account: string) => {
    const normalizedAccount = account.trim().toLowerCase();
    if (normalizedAccount && !linkedAccounts.includes(normalizedAccount)) {
      setLinkedAccounts(prevAccounts => [...prevAccounts, normalizedAccount]);
    }
  };

  const removeAccount = (index: number) => {
    const updatedAccounts = [...linkedAccounts];
    updatedAccounts.splice(index, 1);
    setLinkedAccounts(updatedAccounts);
  };

  const handleAccountInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (accountInput) {
        addAccount(accountInput);
        setAccountInput('');
      }
    }
  };

  const handleUpdateUser = async () => {
    if (!editUser) return;

    if (await requestMiddleware(dispatch)) {
      try {
        showLoadingDialog()(dispatch);
        
        // Use the renamed function
        await updateUserAPI({
          user_id: editUser.id,
          usertype: editUser.usertype,
          linkedAccounts: JSON.stringify(linkedAccounts)
        });
        
        // Update local state after successful API call
        setUsers(users.map(user => 
          user.id === editUser.id ? 
            {...user, usertype: editUser.usertype, linkedAccounts: JSON.stringify(linkedAccounts)} : 
            user
        ));
        
        closeEditModal();
        hideLoadingDialog()(dispatch);
      } catch (error) {
        console.error('Error updating user:', error);
        alert('Failed to update user');
        hideLoadingDialog()(dispatch);
      }
    }
  };

  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="users" />
      <div className="h-full font-montserrat flex flex-col w-full text-off-white">
        <div className="px-8 pt-8 h-full flex flex-col w-full overflow-y-auto">
          <nav className="border-b-4 border-beaming-orange flex justify-start items-center pb-3 gap-4">
            <div className="text-5xl font-bold px-3">
              Manage Users <span className="text-xl font-semibold text-gray-300">({users.length})</span>
            </div>
          </nav>
          
          <div className="flex justify-between mt-5 mb-8 relative">
            <div></div>
            <div className="flex justify-evenly items-center gap-4 relative z-[3]">
              {state.loader?.isSpinnerVisible && (
                <Spinner colorClass={'text-beaming-orange mr-2 '} size={32} />
              )}
              <div className="flex items-center gap-2 px-4 p-2 rounded-lg bg-slate-black/60 border border-slate-black/50">
                <IoMdSearch className="w-4 h-4 text-gray-400" />
                <input
                  className="outline-none bg-transparent text-off-white w-[280px] border-none focus:ring-0 appearance-none"
                  style={{ backgroundColor: 'transparent' }}
                  placeholder="Search users by name or email"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <FiX
                    className="w-3 h-3 p-[0.05rem] hover:cursor-pointer text-gray-400 hover:text-white"
                    onClick={() => setSearchTerm('')}
                  />
                )}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <p>Loading users...</p>
            </div>
          ) : (
            <div className="bg-slate-black/30 rounded-lg shadow-md overflow-x-auto max-h-[calc(100vh-250px)]">
              <table className="min-w-full divide-y divide-slate-black">
                <thead className="bg-slate-black sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-beaming-orange uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-beaming-orange uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-beaming-orange uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-beaming-orange uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-black/50">
                  {sortedUsers.length > 0 ? (
                    sortedUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-black/20">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-off-white">{getFullName(user)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-300">{user.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-300 capitalize">{user.usertype || 'admin'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-3">
                            <button 
                              className="text-beaming-orange hover:text-beaming-orange-dark transition"
                              title="Edit User"
                              onClick={() => handleEditUser(user)}
                            >
                              <FaEdit />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-300">
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-black p-6 rounded-lg max-w-2xl w-full shadow-[8px_8px_32px_rgba(0,0,0,0.25)] shadow-transparent-black">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-off-white">Edit User</h2>
              <button 
                onClick={closeEditModal}
                className="text-white hover:text-white"
              >
                <FaTimes />
              </button>
            </div>

            <div className="space-y-6 mt-4">
              {/* User Information */}
              <div>
                <p className="text-off-white mb-1"><span className="font-semibold">Name:</span> {getFullName(editUser)}</p>
                <p className="text-off-white mb-1"><span className="font-semibold">Email:</span> {editUser.email}</p>
              </div>
              
              {/* User Type Selection */}
              <div>
                <label className="block text-off-white font-semibold mb-2">Role</label>
                <select 
                  className="w-full bg-midnight border-2 border-slate-black rounded-lg p-2 text-off-white focus:outline-none focus:border-beaming-orange"
                  value={editUser.usertype || 'admin'}
                  onChange={(e) => setEditUser({...editUser, usertype: e.target.value})}
                >
                  <option value="admin">Admin</option>
                  <option value="regular">Regular</option>
                </select>
              </div>
              
              {/* Linked Accounts - Similar to AddAccount.tsx */}
              <div className="flex flex-col">
                <span className="pb-1 font-semibold text-off-white">Linked Accounts</span>
                <div
                  ref={accountsContainerRef}
                  className="h-28 w-full border-2 border-slate-black rounded-lg flex flex-row flex-wrap px-3 py-3 gap-2 overflow-y-auto bg-midnight"
                >
                  {linkedAccounts.map((account, index) => (
                    <div
                      key={index}
                      className="h-9 w-fit bg-beaming-orange pl-3 pr-2 py-2 text-sm text-black font-medium flex flex-row items-center gap-4 rounded-md"
                    >
                      <span>{account}</span>
                      <img
                        className="w-[0.65rem] hover:cursor-pointer mr-[0.2em]"
                        src="/images/close.png"
                        onClick={() => removeAccount(index)}
                        alt="Remove"
                      />
                    </div>
                  ))}
                  <div className="border-[1px] w-40 h-9 border-solid border-beaming-orange px-2 py-1 flex flex-row items-center gap-2 rounded-md">
                    <span className="text-beaming-orange">@</span>
                    <input
                      className="w-full text-sm bg-midnight text-off-white"
                      type="text"
                      placeholder="Account Name"
                      value={accountInput}
                      onChange={(e) => setAccountInput(e.target.value)}
                      onKeyDown={handleAccountInputKeyDown}
                      onBlur={() => {
                        if (accountInput) {
                          addAccount(accountInput);
                          setAccountInput('');
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
              <button 
                onClick={closeEditModal}
                className="px-4 py-2 border border-slate-black bg-midnight text-white rounded-lg hover:bg-gray-700"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateUser}
                className="px-4 py-2 bg-beaming-orange text-midnight font-medium rounded-lg hover:bg-beaming-orange/80"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      
      {createUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-midnight p-6 rounded-lg max-w-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-off-white">Add New User</h2>
              <button 
                onClick={() => setCreateUser(false)}
                className="text-gray-400 hover:text-white"
              >
                <FaTimes />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button 
                onClick={() => setCreateUser(false)}
                className="px-4 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button className="px-4 py-2 bg-beaming-orange text-white rounded-lg hover:bg-beaming-orange/80">
                Create User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
