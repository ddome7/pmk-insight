'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AddAdvertiserModal from '@/components/AddAdvertiserModal'

interface Advertiser {
  id: string
  manager_name: string
  advertiser_name: string
  sheet_url: string
  created_at: string
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([])
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
    })
    loadAdvertisers()
  }, [])

  const loadAdvertisers = async () => {
    const { data } = await supabase.from('advertisers').select('*').order('created_at', { ascending: false })
    if (data) setAdvertisers(data)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">PMK Insight</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{user?.email}</span>
          <button onClick={handleSignOut} className="text-xs text-gray-500 hover:text-white transition-colors">
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-semibold">광고주 목록</h2>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + 광고주 추가
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {advertisers.map(adv => (
            <div
              key={adv.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-white">{adv.advertiser_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">담당: {adv.manager_name}</p>
                </div>
                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full">시트 연결됨</span>
              </div>
              <p className="text-xs text-gray-600 truncate">{adv.sheet_url}</p>
            </div>
          ))}

          <div
            onClick={() => setShowModal(true)}
            className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-gray-500 hover:border-gray-500 cursor-pointer transition-colors min-h-[120px]"
          >
            <span className="text-3xl">+</span>
            <span className="text-sm">광고주 추가</span>
          </div>
        </div>
      </main>

      {showModal && (
        <AddAdvertiserModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadAdvertisers() }}
        />
      )}
    </div>
  )
}
