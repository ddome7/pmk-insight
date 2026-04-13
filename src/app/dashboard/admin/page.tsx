'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AdminUser {
  user_id: string
  email: string
  created_at: string
}

interface AppUser {
  user_id: string
  manager_name: string
  agent_name: string
}

export default function AdminPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('pmk_isAdmin')
      if (cached === 'true') return true
      if (cached === 'false') return false
    }
    return null
  })
  const [adminList, setAdminList] = useState<AdminUser[]>([])
  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadAdminData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAdminData = async () => {
    const res = await fetch('/api/admin')
    if (!res.ok) { router.push('/dashboard'); return }
    const data = await res.json()
    if (!data.isAdmin) { router.push('/dashboard'); return }
    setIsAdmin(true)
    localStorage.setItem('pmk_isAdmin', 'true')
    setAdminList(data.admins || [])
    setAppUsers(data.users || [])
  }

  const handleGrant = async (userId: string, email: string) => {
    setLoading(true)
    await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email }),
    })
    await loadAdminData()
    setLoading(false)
  }

  const handleRevoke = async (userId: string) => {
    if (!confirm('어드민 권한을 회수하시겠습니까?')) return
    setLoading(true)
    await fetch('/api/admin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    await loadAdminData()
    setLoading(false)
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm">권한이 없습니다.</p>
      </div>
    )
  }

  const nonAdminUsers = appUsers.filter(u => !adminList.some(a => a.user_id === u.user_id))

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          &larr; 대시보드
        </button>
        <h1 className="text-lg font-bold">PMK Insight</h1>
        <span className="text-xs font-semibold text-amber-400 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded-md">관리자 패널</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Current Admins */}
        <div className="mb-10">
          <h2 className="text-base font-semibold text-white mb-1">현재 어드민</h2>
          <p className="text-xs text-gray-500 mb-4">어드민은 모든 광고주에 대한 전체 권한을 가집니다.</p>
          <div className="flex flex-col gap-2">
            {adminList.map(admin => (
              <div key={admin.user_id} className="flex items-center justify-between bg-gray-900 border border-amber-900/40 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-amber-400 bg-amber-950 border border-amber-800 px-1.5 py-0.5 rounded">관리자</span>
                  <div>
                    <p className="text-sm text-white">{admin.email || '(이메일 미확인)'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">등록일: {new Date(admin.created_at).toLocaleDateString('ko-KR')}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(admin.user_id)}
                  disabled={loading}
                  className="text-xs text-red-500 hover:text-red-400 border border-red-900 hover:border-red-700 rounded px-3 py-1.5 transition-colors disabled:opacity-50"
                >
                  권한 회수
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Grant Admin */}
        <div>
          <h2 className="text-base font-semibold text-white mb-1">어드민 권한 부여</h2>
          <p className="text-xs text-gray-500 mb-4">앱에 접속한 매니저 목록입니다. 어드민 권한을 부여할 수 있습니다.</p>
          {nonAdminUsers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {nonAdminUsers.map(u => (
                <div key={u.user_id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{u.manager_name || '(이름 미설정)'}</p>
                    {u.agent_name && (
                      <p className="text-xs text-gray-500 mt-0.5">에이전트: {u.agent_name}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleGrant(u.user_id, u.manager_name)}
                    disabled={loading}
                    className="text-xs text-amber-400 hover:text-amber-300 border border-amber-800 hover:border-amber-600 rounded px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    어드민 부여
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-6 text-center">
              <p className="text-sm text-gray-500">어드민을 부여할 수 있는 다른 매니저가 없습니다.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
