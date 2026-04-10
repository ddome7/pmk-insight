'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AddAdvertiserModal from '@/components/AddAdvertiserModal'

interface Advertiser {
  id: string
  manager_name: string
  advertiser_name: string
  sheet_url: string
  folder_id: string | null
  created_at: string
}

interface Folder {
  id: string
  name: string
  created_at: string
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [showModal, setShowModal] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [showFolderInput, setShowFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
    })
    loadAdvertisers()
    loadFolders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAdvertisers = async () => {
    const { data } = await supabase
      .from('advertisers')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setAdvertisers(data)
  }

  const loadFolders = async () => {
    const { data } = await supabase
      .from('folders')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setFolders(data)
  }

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim()
    if (!trimmed) return
    setCreatingFolder(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreatingFolder(false); return }

    await supabase.from('folders').insert({ user_id: user.id, name: trimmed })
    setNewFolderName('')
    setShowFolderInput(false)
    setCreatingFolder(false)
    loadFolders()
  }

  const handleDeleteAdvertiser = async (e: React.MouseEvent, advertiserId: string) => {
    e.stopPropagation()
    if (!confirm('광고주를 삭제하시겠습니까?')) return
    await supabase.from('advertisers').delete().eq('id', advertiserId)
    loadAdvertisers()
  }

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('폴더를 삭제하시겠습니까? 폴더 안의 광고주는 미분류로 이동됩니다.')) return
    await supabase
      .from('advertisers')
      .update({ folder_id: null })
      .eq('folder_id', folderId)
    await supabase.from('folders').delete().eq('id', folderId)
    if (selectedFolderId === folderId) setSelectedFolderId(null)
    loadFolders()
    loadAdvertisers()
  }

  const handleDragStart = useCallback((e: React.DragEvent, advertiserId: string) => {
    e.dataTransfer.setData('text/plain', advertiserId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDropOnFolder = useCallback(async (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    setDragOverFolderId(null)
    const advertiserId = e.dataTransfer.getData('text/plain')
    if (!advertiserId) return

    await supabase
      .from('advertisers')
      .update({ folder_id: folderId })
      .eq('id', advertiserId)
    loadAdvertisers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDropOnUncategorized = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverFolderId(null)
    const advertiserId = e.dataTransfer.getData('text/plain')
    if (!advertiserId) return

    await supabase
      .from('advertisers')
      .update({ folder_id: null })
      .eq('id', advertiserId)
    loadAdvertisers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const filteredAdvertisers = selectedFolderId
    ? advertisers.filter(a => a.folder_id === selectedFolderId)
    : advertisers

  const uncategorizedCount = advertisers.filter(a => !a.folder_id).length

  const getFolderCount = (folderId: string) =>
    advertisers.filter(a => a.folder_id === folderId).length

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
        {/* Folder Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-sm font-medium text-gray-400">폴더</h3>
            <button
              onClick={() => setShowFolderInput(true)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              + 폴더 만들기
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* "All" tab */}
            <button
              onClick={() => setSelectedFolderId(null)}
              onDragOver={handleDragOver}
              onDrop={handleDropOnUncategorized}
              onDragEnter={() => setDragOverFolderId('__uncategorized__')}
              onDragLeave={() => setDragOverFolderId(null)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors border ${
                selectedFolderId === null
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : dragOverFolderId === '__uncategorized__'
                    ? 'bg-gray-700 border-blue-400 text-white'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              전체 ({advertisers.length})
            </button>

            {/* Folder tabs */}
            {folders.map(folder => (
              <div
                key={folder.id}
                className={`flex items-center gap-1 rounded-lg text-sm transition-colors border ${
                  selectedFolderId === folder.id
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : dragOverFolderId === folder.id
                      ? 'bg-gray-700 border-blue-400 text-white'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600'
                }`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnFolder(e, folder.id)}
                onDragEnter={() => setDragOverFolderId(folder.id)}
                onDragLeave={() => setDragOverFolderId(null)}
              >
                <button
                  onClick={() => setSelectedFolderId(folder.id)}
                  className="px-3 py-2"
                >
                  {folder.name} ({getFolderCount(folder.id)})
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id) }}
                  className="pr-2 text-gray-500 hover:text-red-400 transition-colors"
                  title="폴더 삭제"
                >
                  x
                </button>
              </div>
            ))}

            {/* New Folder Input */}
            {showFolderInput && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="폴더명"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowFolderInput(false); setNewFolderName('') } }}
                  autoFocus
                  className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-32"
                />
                <button
                  onClick={handleCreateFolder}
                  disabled={creatingFolder}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingFolder ? '...' : '확인'}
                </button>
                <button
                  onClick={() => { setShowFolderInput(false); setNewFolderName('') }}
                  className="px-2 py-2 text-gray-500 hover:text-white text-sm"
                >
                  취소
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Advertiser Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">
              {selectedFolderId
                ? folders.find(f => f.id === selectedFolderId)?.name ?? '광고주 목록'
                : '광고주 목록'}
            </h2>
            {selectedFolderId === null && uncategorizedCount > 0 && uncategorizedCount < advertisers.length && (
              <p className="text-xs text-gray-500 mt-1">
                미분류 {uncategorizedCount}개 / 전체 {advertisers.length}개
              </p>
            )}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + 광고주 추가
          </button>
        </div>

        {/* Advertiser Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAdvertisers.map(adv => (
            <div
              key={adv.id}
              draggable
              onDragStart={(e) => handleDragStart(e, adv.id)}
              onClick={() => router.push(`/dashboard/${adv.id}`)}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-white">{adv.advertiser_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">담당: {adv.manager_name}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full">시트 연결됨</span>
                  {adv.folder_id && (
                    <span className="text-xs text-gray-600">
                      {folders.find(f => f.id === adv.folder_id)?.name}
                    </span>
                  )}
                  <button
                    onClick={(e) => handleDeleteAdvertiser(e, adv.id)}
                    className="text-xs text-gray-600 hover:text-red-400 transition-colors mt-1"
                  >
                    삭제
                  </button>
                </div>
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
