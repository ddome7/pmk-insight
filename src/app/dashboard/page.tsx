'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AddAdvertiserModal from '@/components/AddAdvertiserModal'

interface Advertiser {
  id: string
  user_id: string
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

interface ManagerAgent {
  id: string
  manager_name: string
  agent_name: string
  persona: string
  tone: string
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<{ id?: string; email?: string } | null>(null)
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [showModal, setShowModal] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [showFolderInput, setShowFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [folderOrder, setFolderOrder] = useState<string[]>([])
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null)
  const [agent, setAgent] = useState<ManagerAgent | null>(null)
  const [showAgentEditor, setShowAgentEditor] = useState(false)
  const [agentNameDraft, setAgentNameDraft] = useState('')
  const [agentPersonaDraft, setAgentPersonaDraft] = useState('')
  const [agentToneDraft, setAgentToneDraft] = useState('')
  const [savingAgent, setSavingAgent] = useState(false)
  const [showMatchingView, setShowMatchingView] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
    })
    loadAdvertisers()
    loadFolders()
    loadAgent()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAgent = async () => {
    const res = await fetch('/api/agent')
    if (res.ok) {
      const data = await res.json()
      if (data.agent) {
        setAgent(data.agent)
        setAgentNameDraft(data.agent.agent_name || '')
        setAgentPersonaDraft(data.agent.persona || '')
        setAgentToneDraft(data.agent.tone || '')
      }
    }
  }

  const handleDeleteAgent = async () => {
    if (!confirm('에이전트를 삭제하시겠습니까?')) return
    const res = await fetch('/api/agent', { method: 'DELETE' })
    if (res.ok) {
      setAgent(null)
      setAgentNameDraft('')
      setAgentPersonaDraft('')
      setAgentToneDraft('')
      setShowAgentEditor(false)
    }
  }

  const handleSaveAgent = async () => {
    setSavingAgent(true)
    const res = await fetch('/api/agent', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: agentNameDraft,
        persona: agentPersonaDraft,
        tone: agentToneDraft,
        manager_name: user?.email || '매니저',
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setAgent(data.agent)
      setShowAgentEditor(false)
    }
    setSavingAgent(false)
  }

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
    if (data) {
      setFolders(data)
      const saved = localStorage.getItem('folderOrder')
      if (saved) {
        const savedOrder: string[] = JSON.parse(saved)
        const validOrder = savedOrder.filter(id => data.some(f => f.id === id))
        const newIds = data.map(f => f.id).filter(id => !validOrder.includes(id))
        setFolderOrder([...validOrder, ...newIds])
      } else {
        setFolderOrder(data.map(f => f.id))
      }
    }
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

  const handleUngroup = async (e: React.MouseEvent, advertiserId: string) => {
    e.stopPropagation()
    await supabase.from('advertisers').update({ folder_id: null }).eq('id', advertiserId)
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

  const handleFolderDragStart = useCallback((e: React.DragEvent, folderId: string) => {
    e.dataTransfer.setData('folder/id', folderId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingFolderId(folderId)
  }, [])

  const handleFolderDrop = useCallback((e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const draggedId = e.dataTransfer.getData('folder/id')
    if (!draggedId || draggedId === targetFolderId) { setDraggingFolderId(null); return }

    setFolderOrder(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(draggedId)
      const toIdx = next.indexOf(targetFolderId)
      if (fromIdx === -1 || toIdx === -1) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, draggedId)
      localStorage.setItem('folderOrder', JSON.stringify(next))
      return next
    })
    setDraggingFolderId(null)
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

  const sortedFolders = folderOrder.length > 0
    ? folderOrder.map(id => folders.find(f => f.id === id)).filter(Boolean) as typeof folders
    : folders

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
        {/* My Agent Section */}
        <div className="mb-8 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-400 bg-blue-950 border border-blue-800 px-2 py-0.5 rounded-md">내 에이전트</span>
              <span className="text-sm font-medium text-white">
                {agent?.agent_name ? agent.agent_name : '이름 미설정'}
              </span>
            </div>
            <button
              onClick={() => {
                setShowAgentEditor(!showAgentEditor)
                setAgentNameDraft(agent?.agent_name || '')
                setAgentPersonaDraft(agent?.persona || '')
                setAgentToneDraft(agent?.tone || '')
              }}
              className="text-xs text-gray-400 hover:text-white transition-colors border border-gray-700 hover:border-gray-500 rounded px-2 py-1"
            >
              {showAgentEditor ? '닫기' : '에이전트 설정'}
            </button>
          </div>

          {!showAgentEditor && (
            <div className="flex flex-col gap-1.5">
              {agent?.persona || agent?.tone ? (
                <>
                  {agent.persona && (
                    <p className="text-xs text-gray-500">
                      <span className="text-gray-600">페르소나 </span>{agent.persona}
                    </p>
                  )}
                  {agent.tone && (
                    <p className="text-xs text-gray-500">
                      <span className="text-gray-600">말투 </span>{agent.tone}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-600">에이전트 설정 버튼을 눌러 이름·페르소나·말투를 설정해보세요.</p>
              )}
            </div>
          )}

          {showAgentEditor && (
            <div className="flex flex-col gap-4 mt-1">
              {/* 에이전트 이름 */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">에이전트 이름</label>
                <input
                  type="text"
                  value={agentNameDraft}
                  onChange={(e) => setAgentNameDraft(e.target.value)}
                  placeholder="데이터 해적왕 / 숫자 탐정 / ROAS 사냥꾼 / 광고 저승사자 / 인사이트 기계"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 페르소나 */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">페르소나</label>
                <textarea
                  value={agentPersonaDraft}
                  onChange={(e) => setAgentPersonaDraft(e.target.value)}
                  placeholder={"분석 방향, 중점 지표, 선호하는 인사이트 유형 등을 적어주세요.\n예: ROAS와 CPA 중심으로 분석 / Meta 비중 높은 광고주 위주 / 보고서는 수치 중심으로"}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* 말투 */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">말투</label>
                <input
                  type="text"
                  value={agentToneDraft}
                  onChange={(e) => setAgentToneDraft(e.target.value)}
                  placeholder="예: 핵심만 간결하게 / 친근하고 쉽게 / 전문적이고 냉정하게 / 수치 중심으로 직설적으로"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveAgent}
                    disabled={savingAgent}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                  >
                    {savingAgent ? '저장 중...' : '저장'}
                  </button>
                  <button
                    onClick={() => setShowAgentEditor(false)}
                    className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
                  >
                    취소
                  </button>
                </div>
                {agent && (
                  <button
                    onClick={handleDeleteAgent}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors"
                  >
                    에이전트 삭제
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

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
              className={`px-6 py-3 rounded-xl text-sm font-medium transition-colors border ${
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
            {sortedFolders.map(folder => (
              <div
                key={folder.id}
                draggable
                onDragStart={(e) => handleFolderDragStart(e, folder.id)}
                onDragEnd={() => setDraggingFolderId(null)}
                onDragOver={(e) => { e.preventDefault(); if (!draggingFolderId || draggingFolderId === folder.id) handleDragOver(e) }}
                onDrop={(e) => {
                  if (draggingFolderId) handleFolderDrop(e, folder.id)
                  else handleDropOnFolder(e, folder.id)
                }}
                onDragEnter={() => setDragOverFolderId(folder.id)}
                onDragLeave={() => setDragOverFolderId(null)}
                className={`flex items-center gap-1 rounded-xl text-sm font-medium transition-colors border cursor-grab active:cursor-grabbing ${
                  selectedFolderId === folder.id
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : draggingFolderId === folder.id
                      ? 'opacity-40 bg-gray-800 border-gray-600 text-gray-400'
                      : dragOverFolderId === folder.id && !draggingFolderId
                        ? 'bg-gray-700 border-blue-400 text-white'
                        : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                <button
                  onClick={() => setSelectedFolderId(folder.id)}
                  className="px-5 py-3"
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
              {showMatchingView ? '매칭 현황' : selectedFolderId
                ? folders.find(f => f.id === selectedFolderId)?.name ?? '광고주 목록'
                : '광고주 목록'}
            </h2>
            {!showMatchingView && selectedFolderId === null && (
              <p className="text-xs text-gray-500 mt-1">
                내 광고주 {advertisers.filter(a => a.user_id === user?.id).length}개 · 전체 {advertisers.length}개
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMatchingView(!showMatchingView)}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors border ${
                showMatchingView
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
              }`}
            >
              매칭 현황
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + 광고주 추가
            </button>
          </div>
        </div>

        {/* Matching View */}
        {showMatchingView ? (
          <div className="flex flex-col gap-6">
            {Array.from(new Set(advertisers.map(a => a.manager_name))).map(managerName => {
              const managerAdvs = advertisers.filter(a => a.manager_name === managerName)
              const isMe = managerAdvs.some(a => a.user_id === user?.id)
              return (
                <div key={managerName} className={`rounded-xl border p-5 ${isMe ? 'border-blue-800 bg-blue-950/20' : 'border-gray-800 bg-gray-900'}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${isMe ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                      {isMe ? '나' : '매니저'}
                    </span>
                    <span className="text-sm font-semibold text-white">{managerName}</span>
                    <span className="text-xs text-gray-500">광고주 {managerAdvs.length}개</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {managerAdvs.map(adv => (
                      <div
                        key={adv.id}
                        onClick={() => router.push(`/dashboard/${adv.id}`)}
                        className="bg-gray-800 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-gray-500 transition-colors"
                      >
                        <p className="text-xs font-semibold text-white truncate">{adv.advertiser_name}</p>
                        <span className="text-xs text-gray-500 mt-1 block">시트 연결됨</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
        /* Advertiser Cards */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredAdvertisers.map(adv => {
            const isOwn = adv.user_id === user?.id
            return (
              <div
                key={adv.id}
                draggable={isOwn}
                onDragStart={(e) => isOwn && handleDragStart(e, adv.id)}
                onClick={() => router.push(`/dashboard/${adv.id}`)}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  isOwn
                    ? 'bg-gray-900 border-gray-800 hover:border-gray-600'
                    : 'bg-gray-900/50 border-gray-800/60 hover:border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="text-sm font-semibold text-white truncate">{adv.advertiser_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">담당: {adv.manager_name}</p>
                  </div>
                  {isOwn && (
                    <button
                      onClick={(e) => handleDeleteAdvertiser(e, adv.id)}
                      className="text-xs text-gray-700 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded w-fit">시트 연결됨</span>
                    {!isOwn && (
                      <span className="text-xs bg-purple-950 text-purple-400 border border-purple-900 px-1.5 py-0.5 rounded w-fit">타 매니저</span>
                    )}
                  </div>
                  {adv.folder_id && isOwn && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-gray-500">그룹 : {folders.find(f => f.id === adv.folder_id)?.name}</span>
                      <button
                        onClick={(e) => handleUngroup(e, adv.id)}
                        className="text-xs text-orange-400 hover:text-orange-300 transition-colors flex-shrink-0 border border-orange-800 hover:border-orange-400 rounded px-1.5 py-0.5"
                      >
                        그룹해제
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <div
            onClick={() => setShowModal(true)}
            className="bg-gray-900 border border-dashed border-gray-700 rounded-lg p-3 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-gray-500 cursor-pointer transition-colors min-h-[80px]"
          >
            <span className="text-2xl">+</span>
            <span className="text-sm">광고주 추가</span>
          </div>
        </div>
        )}
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
