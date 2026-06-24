import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, UserPlus, Shield, ShieldOff, Trash2, Mail, ChevronDown } from 'lucide-react'
import { usersApi } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { User } from '@/types'

const ROLES = [
  { value: 'member',    label: 'Member' },
  { value: 'org-admin', label: 'Admin' },
]

function roleBadge(role: string) {
  if (role === 'org-admin' || role === 'super-admin')
    return 'bg-purple-100 text-purple-700'
  return 'bg-gray-100 text-gray-600'
}

function roleLabel(role: string) {
  if (role === 'super-admin') return 'Super Admin'
  if (role === 'org-admin') return 'Admin'
  return 'Member'
}

// ── Invite modal ─────────────────────────────────────────────────
function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [inviteLink, setInviteLink] = useState('')

  const invite = useMutation({
    mutationFn: () => usersApi.invite(email.trim(), role),
    onSuccess: (data) => {
      const link = `${window.location.origin}/accept-invite?token=${data.token}`
      setInviteLink(link)
      setDone(true)
      qc.invalidateQueries({ queryKey: ['org-users'] })
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail ?? 'Failed to send invitation.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600" />
            Invite user
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="px-6 py-6 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-green-800">Invite created</p>
                <p className="text-xs text-green-600">Share this link with {email}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Invite link</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 font-mono truncate"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                  className="px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
            <button onClick={onClose} className="w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              Close
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email address</label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <div className="relative">
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full appearance-none text-sm border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-blue-400 bg-white"
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={() => invite.mutate()}
                disabled={!email.trim() || invite.isPending}
                className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {invite.isPending && (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                Send invite
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────
function ConfirmDialog({
  message, onConfirm, onCancel, danger = false,
}: { message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <p className="text-sm text-gray-700">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<User | null>(null)

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['org-users'],
    queryFn: usersApi.list,
  })

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof usersApi.update>[1] }) =>
      usersApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-users'] }),
  })

  const removeUser = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      setConfirmRemove(null)
      qc.invalidateQueries({ queryKey: ['org-users'] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-500">Failed to load users. Make sure you have admin access.</p>
      </div>
    )
  }

  const isAdmin = me?.org_role === 'org-admin' || me?.org_role === 'super-admin'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Users</h1>
            <p className="text-xs text-gray-500">{users.length} member{users.length !== 1 ? 's' : ''} in your organisation</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite user
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3">User</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Role</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Joined</th>
              {isAdmin && <th className="px-4 py-3 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u => {
              const isMe = u.id === me?.id
              const isSuperAdmin = u.org_role === 'super-admin'
              return (
                <tr key={u.id} className={`transition-colors ${u.is_active ? 'hover:bg-gray-50/60' : 'opacity-50 bg-gray-50'}`}>
                  {/* User info */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        u.is_active ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-400'
                      }`}>
                        {u.full_name?.[0]?.toUpperCase() ?? u.email[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {u.full_name ?? u.email}
                          {isMe && <span className="ml-1.5 text-[10px] text-blue-500 font-normal">(you)</span>}
                        </p>
                        {u.full_name && (
                          <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                            <Mail className="w-3 h-3" />{u.email}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3.5">
                    {isAdmin && !isMe && !isSuperAdmin ? (
                      <div className="relative inline-block">
                        <select
                          value={u.org_role}
                          onChange={e => updateUser.mutate({ id: u.id, data: { org_role: e.target.value } })}
                          className={`appearance-none text-xs font-medium px-2.5 py-1 pr-6 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 ${roleBadge(u.org_role)}`}
                        >
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60" />
                      </div>
                    ) : (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleBadge(u.org_role)}`}>
                        {roleLabel(u.org_role)}
                      </span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    {isAdmin && !isMe ? (
                      <button
                        onClick={() => updateUser.mutate({ id: u.id, data: { is_active: !u.is_active } })}
                        title={u.is_active ? 'Deactivate user' : 'Activate user'}
                        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                          u.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {u.is_active
                          ? <><Shield className="w-3 h-3" />Active</>
                          : <><ShieldOff className="w-3 h-3" />Inactive</>
                        }
                      </button>
                    ) : (
                      <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full w-fit ${
                        u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {u.is_active ? <><Shield className="w-3 h-3" />Active</> : <><ShieldOff className="w-3 h-3" />Inactive</>}
                      </span>
                    )}
                  </td>

                  {/* Joined */}
                  <td className="px-4 py-3.5 text-xs text-gray-400">
                    {new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>

                  {/* Actions */}
                  {isAdmin && (
                    <td className="px-4 py-3.5">
                      {!isMe && !isSuperAdmin && (
                        <button
                          onClick={() => setConfirmRemove(u)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-400">
            No users yet. Invite your team members.
          </div>
        )}
      </div>

      {/* Modals */}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
      {confirmRemove && (
        <ConfirmDialog
          danger
          message={`Remove ${confirmRemove.full_name ?? confirmRemove.email} from the organisation? This cannot be undone.`}
          onConfirm={() => removeUser.mutate(confirmRemove.id)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  )
}
