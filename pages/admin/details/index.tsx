import React, { useState, useEffect } from 'react';
import AdminSideBar from '../../../components/Admin/AdminSideBar';
import {
  readAdminAccounts,
  readAccountDetails,
  readDetailFields,
  createAccountDetail,
  updateAccountDetail,
  deleteAccountDetail,
  requestMiddleware,
} from '../../../services/lib/admin';
import {
  showLoadingDialog,
  hideLoadingDialog,
} from '../../../store/actions/loadingState';
import { useStore } from '../../../store/store';
import { Account } from '../../../interface/objects/simpleObject';
import {
  AccountDetail,
  DetailFieldOption,
  DetailFieldName,
  DetailMode,
} from '../../../interface/adminInterface';
import { FiTrash2, FiPlus, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import LoadingDialog from '../../../components/overlay/LoadingDialog';

const FIELD_LABELS: Record<string, string> = {
  venue_name: 'Venue Name',
  venue_city: 'City',
  venue_state: 'State',
  venue_country: 'Country',
  venue_address: 'Address',
  name: 'Event Name',
  artist: 'Artist',
  price: 'Price',
  age_barrier: 'Age Barrier',
  ticket_link: 'Ticket Link',
  forLocation: 'For Location',
  genres: 'Genres',
};

function normalizeAccountDetail(raw: any, fallbackAccountId?: number): AccountDetail | null {
  if (!raw || typeof raw !== 'object') return null;

  // API sometimes uses `account_id` instead of `account`
  const account =
    typeof raw.account === 'number'
      ? raw.account
      : typeof raw.account_id === 'number'
        ? raw.account_id
        : typeof fallbackAccountId === 'number'
          ? fallbackAccountId
          : null;

  if (account === null) return null;
  if (typeof raw.id !== 'number') return null;

  return {
    ...(raw as AccountDetail),
    account,
  };
}

interface AddDetailFormProps {
  accountId: number;
  existingFieldNames: string[];
  fieldOptions: DetailFieldOption[];
  onSaved: (detail: AccountDetail) => void;
  onCancel: () => void;
}

function AddDetailForm({
  accountId,
  existingFieldNames,
  fieldOptions,
  onSaved,
  onCancel,
}: AddDetailFormProps) {
  const availableFields = fieldOptions.filter(
    (f) => !existingFieldNames.includes(f.value)
  );

  const [fieldName, setFieldName] = useState<DetailFieldName | ''>(
    availableFields.length > 0 ? availableFields[0].value : ''
  );
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<DetailMode>('fallback');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!fieldName) {
      setError('Please select a field.');
      return;
    }
    if (!value.trim()) {
      setError('Value cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await createAccountDetail({
        account_id: accountId,
        field_name: fieldName as DetailFieldName,
        value: value.trim(),
        mode,
      });
      if (res.status === 200 || res.status === 201) {
        const rawDetail = res.data?.data ?? res.data;
        const normalized = normalizeAccountDetail(rawDetail, accountId);
        if (normalized) {
          onSaved(normalized);
        } else {
          setError('Saved, but response was unexpected. Please refresh.');
        }
      } else {
        setError('Failed to save. Please try again.');
      }
    } catch (e) {
      setError('An error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (availableFields.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-2 px-3">
        All fields have been configured for this account.
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 mt-2 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Field</label>
          <select
            className="!bg-white !text-black rounded-lg px-3 py-2 text-sm outline-none !border !border-slate-300 focus:!border-beaming-orange"
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value as DetailFieldName)}
          >
            {availableFields.map((f) => (
              <option key={f.value} value={f.value} className="bg-white text-black">
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Value</label>
          <input
            className="!bg-white !text-black placeholder:!text-slate-500 caret:!text-black rounded-lg px-3 py-2 text-sm outline-none !border !border-slate-300 focus:!border-beaming-orange w-full"
            placeholder="Enter value…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Mode</label>
          <div className="flex rounded-lg overflow-hidden border border-slate-600 text-sm bg-slate-900">
            <button
              type="button"
              onClick={() => setMode('fallback')}
              aria-pressed={mode === 'fallback'}
              className={`px-3 py-2 transition-colors focus:outline-none ${
                mode === 'fallback'
                  ? '!bg-beaming-orange !text-slate-900 font-semibold ring-2 ring-inset ring-beaming-orange'
                  : '!bg-transparent !text-slate-200 hover:!bg-slate-800'
              }`}
            >
              Fallback
            </button>
            <button
              type="button"
              onClick={() => setMode('enforce')}
              aria-pressed={mode === 'enforce'}
              className={`px-3 py-2 transition-colors focus:outline-none ${
                mode === 'enforce'
                  ? '!bg-beaming-orange !text-slate-900 font-semibold ring-2 ring-inset ring-beaming-orange'
                  : '!bg-transparent !text-slate-200 hover:!bg-slate-800'
              }`}
            >
              Enforce
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-beaming-orange text-black font-semibold rounded-lg text-sm hover:brightness-90 disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm hover:bg-slate-500 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <p className="text-xs text-gray-500">
        <span className="text-blue-400 font-medium">Fallback</span>: used only when AI extracts nothing.&nbsp;&nbsp;
        <span className="text-beaming-orange font-medium">Enforce</span>: always overwrites the AI value.
      </p>
    </div>
  );
}

interface DetailRowProps {
  detail: AccountDetail;
  fieldOptions: DetailFieldOption[];
  onUpdated: (updated: AccountDetail) => void;
  onDeleted: (id: number) => void;
}

function DetailRow({ detail, fieldOptions, onUpdated, onDeleted }: DetailRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(detail.value);
  const [editMode, setEditMode] = useState<DetailMode>(detail.mode);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fieldLabel =
    fieldOptions.find((f) => f.value === detail.field_name)?.label ||
    FIELD_LABELS[detail.field_name] ||
    detail.field_name;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateAccountDetail({
        id: detail.id,
        value: editValue.trim(),
        mode: editMode,
      });
      if (res.status === 200) {
        onUpdated(res.data.data);
        setEditing(false);
      }
    } catch (e) {
      console.error('Failed to update detail', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete the "${fieldLabel}" detail?`)) return;
    setDeleting(true);
    try {
      await deleteAccountDetail({ id: detail.id });
      onDeleted(detail.id);
    } catch (e) {
      console.error('Failed to delete detail', e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <tr className="border-t border-slate-700 hover:bg-slate-800/40 transition-colors">
      <td className="py-3 px-4 text-sm text-gray-200">{fieldLabel}</td>
      <td className="py-3 px-4">
        {editing ? (
          <input
            className="!bg-white !text-black placeholder:!text-slate-500 caret:!text-black rounded px-2 py-1 text-sm w-full outline-none !border !border-slate-300 focus:!border-beaming-orange"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          />
        ) : (
          <span
            className="text-sm text-white cursor-pointer hover:text-beaming-orange"
            onClick={() => setEditing(true)}
          >
            {detail.value}
          </span>
        )}
      </td>
      <td className="py-3 px-4">
        {editing ? (
          <div className="flex rounded overflow-hidden border border-slate-600 text-xs w-fit bg-slate-900">
            <button
              type="button"
              onClick={() => setEditMode('fallback')}
              aria-pressed={editMode === 'fallback'}
              className={`px-3 py-1 transition-colors focus:outline-none ${
                editMode === 'fallback'
                  ? '!bg-beaming-orange !text-slate-900 font-semibold ring-2 ring-inset ring-beaming-orange'
                  : '!bg-transparent !text-slate-200 hover:!bg-slate-800'
              }`}
            >
              Fallback
            </button>
            <button
              type="button"
              onClick={() => setEditMode('enforce')}
              aria-pressed={editMode === 'enforce'}
              className={`px-3 py-1 transition-colors focus:outline-none ${
                editMode === 'enforce'
                  ? '!bg-beaming-orange !text-slate-900 font-semibold ring-2 ring-inset ring-beaming-orange'
                  : '!bg-transparent !text-slate-200 hover:!bg-slate-800'
              }`}
            >
              Enforce
            </button>
          </div>
        ) : (
          <span
            className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${
              detail.mode === 'enforce'
                ? 'bg-beaming-orange/20 text-beaming-orange'
                : 'bg-blue-600/20 text-blue-400'
            }`}
            onClick={() => setEditing(true)}
          >
            {detail.mode === 'enforce' ? 'Enforce' : 'Fallback'}
          </span>
        )}
      </td>
      <td className="py-3 px-4">
        <div className="flex gap-2 items-center">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-xs px-3 py-1 bg-beaming-orange text-black font-semibold rounded hover:brightness-90 disabled:opacity-50"
              >
                {saving ? '…' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditValue(detail.value);
                  setEditMode(detail.mode);
                }}
                className="text-xs px-3 py-1 bg-slate-600 text-white rounded hover:bg-slate-500"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
              title="Delete"
            >
              <FiTrash2 size={16} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

interface AccountDetailCardProps {
  account: Account;
  details: AccountDetail[];
  fieldOptions: DetailFieldOption[];
  onDetailCreated: (detail: AccountDetail) => void;
  onDetailUpdated: (detail: AccountDetail) => void;
  onDetailDeleted: (id: number) => void;
}

function AccountDetailCard({
  account,
  details,
  fieldOptions,
  onDetailCreated,
  onDetailUpdated,
  onDetailDeleted,
}: AccountDetailCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const existingFieldNames = details.map((d) => d.field_name);

  return (
    <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-800 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white">@{account.user}</span>
          {account.forLocation && (
            <span className="text-xs bg-slate-700 text-gray-400 px-2 py-0.5 rounded">
              {account.forLocation}
            </span>
          )}
          {details.length > 0 && (
            <span className="text-xs bg-beaming-orange/20 text-beaming-orange px-2 py-0.5 rounded font-medium">
              {details.length} detail{details.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="text-gray-400">
          {expanded ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5">
          {details.length > 0 ? (
            <table className="w-full text-left mb-3">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className="py-2 px-4 w-1/4">Field</th>
                  <th className="py-2 px-4">Value</th>
                  <th className="py-2 px-4 w-32">Mode</th>
                  <th className="py-2 px-4 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d) => (
                  <DetailRow
                    key={d.id}
                    detail={d}
                    fieldOptions={fieldOptions}
                    onUpdated={onDetailUpdated}
                    onDeleted={onDetailDeleted}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500 mb-3">No details configured yet.</p>
          )}

          {showAddForm ? (
            <AddDetailForm
              accountId={account.id}
              existingFieldNames={existingFieldNames}
              fieldOptions={fieldOptions}
              onSaved={(detail) => {
                onDetailCreated(detail);
                setShowAddForm(false);
              }}
              onCancel={() => setShowAddForm(false)}
            />
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAddForm(true);
              }}
              className="flex items-center gap-2 text-sm text-beaming-orange hover:brightness-90 transition-all mt-1"
            >
              <FiPlus size={16} />
              Add detail
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminDetailsPage() {
  const [state, dispatch] = useStore();
  const { loader } = state;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [details, setDetails] = useState<AccountDetail[]>([]);
  const [fieldOptions, setFieldOptions] = useState<DetailFieldOption[]>([]);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!(await requestMiddleware(dispatch))) return;

      showLoadingDialog()(dispatch);
      let timedOut = false;
      const watchdog = window.setTimeout(() => {
        timedOut = true;
        hideLoadingDialog()(dispatch);
        if (!cancelled) {
          setLoadError('Request timed out. Please refresh (or check the API).');
        }
      }, 45000);

      try {
        const [accountsRes, detailsRes, fieldsRes] = await Promise.all([
          readAdminAccounts(),
          readAccountDetails(),
          readDetailFields(),
        ]);

        if (cancelled || timedOut) return;

        if (accountsRes.status === 200) {
          setAccounts(accountsRes.data as Account[]);
        }
        if (detailsRes.status === 200) {
          const detailsData = (detailsRes.data?.data ?? detailsRes.data) as unknown;
          const detailsArr = Array.isArray(detailsData) ? detailsData : [];
          setDetails(
            detailsArr
              .map((d) => normalizeAccountDetail(d))
              .filter((d): d is AccountDetail => !!d)
          );
        }
        if (fieldsRes.status === 200) {
          const fieldsData = (fieldsRes.data?.data ?? fieldsRes.data) as unknown;
          setFieldOptions(Array.isArray(fieldsData) ? (fieldsData as DetailFieldOption[]) : []);
        }
      } catch (e) {
        console.error('Error loading details page:', e);
        if (!cancelled) setLoadError('Failed to load data. Please refresh.');
      } finally {
        window.clearTimeout(watchdog);
        if (!timedOut) hideLoadingDialog()(dispatch);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredAccounts = accounts.filter((a) =>
    a.user.toLowerCase().includes(search.toLowerCase())
  );

  const getDetailsForAccount = (accountId: number) =>
    (details ?? []).filter((d) => d?.account === accountId);

  const handleDetailCreated = (detail: AccountDetail) => {
    const normalized = normalizeAccountDetail(detail);
    if (!normalized) return;
    setDetails((prev) => [...(prev ?? []), normalized]);
  };

  const handleDetailUpdated = (updated: AccountDetail) => {
    const normalized = normalizeAccountDetail(updated);
    if (!normalized) return;
    setDetails((prev) => (prev ?? []).map((d) => (d?.id === normalized.id ? normalized : d)));
  };

  const handleDetailDeleted = (id: number) => {
    setDetails((prev) => (prev ?? []).filter((d) => d?.id !== id));
  };

  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="details" />

      <div className="p-8 pb-0 h-full font-montserrat flex flex-col w-full text-off-white overflow-y-auto">
        <nav className="border-b-4 border-beaming-orange mb-6">
          <div className="text-5xl font-bold pb-3 px-3">Account Details</div>
        </nav>

        <p className="text-sm text-gray-400 mb-5 px-1 max-w-2xl">
          Store field overrides per account. <span className="text-beaming-orange font-medium">Enforce</span> always
          overwrites what the AI extracts. <span className="text-blue-400 font-medium">Fallback</span> is only used
          when the AI returns nothing for that field.
        </p>

        {loadError && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm mb-4">
            {loadError}
          </div>
        )}

        {/* Search */}
        <div className="mb-5">
          <input
            className="!bg-slate-900 !border !border-slate-700 rounded-xl px-4 py-2 !text-black placeholder:!text-slate-400 caret:!text-slate-100 text-sm w-64 outline-none !focus:!border-beaming-orange transition-colors"
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Account cards */}
        <div className="flex flex-col gap-3 pb-10">
          {filteredAccounts.length === 0 && !loader.isVisible && (
            <p className="text-gray-500 text-sm">No accounts found.</p>
          )}
          {filteredAccounts.map((account) => (
            <AccountDetailCard
              key={account.id}
              account={account}
              details={getDetailsForAccount(account.id)}
              fieldOptions={fieldOptions}
              onDetailCreated={handleDetailCreated}
              onDetailUpdated={handleDetailUpdated}
              onDetailDeleted={handleDetailDeleted}
            />
          ))}
        </div>
      </div>

      {loader.isVisible && <LoadingDialog />}
    </div>
  );
}
