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
  parent_id: string | null
  created_at: string
}

interface ManagerAgent {
  id: string
  manager_name: string
  agent_name: string
  persona: string
  tone: string
}

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
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderBreadcrumb, setFolderBreadcrumb] = useState<Folder[]>([])
  const [isAdmin, setIsAdmin] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('pmk_isAdmin') === 'true'
    return false
  })
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [adminList, setAdminList] = useState<AdminUser[]>([])
  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [loadingAdmin, setLoadingAdmin] = useState(false)
  const [draggingAdvertiserId, setDraggingAdvertiserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
    })
    loadAdvertisers()
    loadFolders()
    loadAgent()
    loadAdminStatus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAdminStatus = async () => {
    const res = await fetch('/api/admin')
    if (res.ok) {
      const data = await res.json()
      setIsAdmin(data.isAdmin)
      localStorage.setItem('pmk_isAdmin', data.isAdmin ? 'true' : 'false')
      setAdminList(data.admins || [])
      setAppUsers(data.users || [])
    }
  }

  const handleGrantAdmin = async (userId: string, email: string) => {
    setLoadingAdmin(true)
    await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email }),
    })
    await loadAdminStatus()
    setLoadingAdmin(false)
  }

  const handleRevokeAdmin = async (userId: string) => {
    if (!confirm('어드민 권한을 회수하시겠습니까?')) return
    setLoadingAdmin(true)
    await fetch('/api/admin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    await loadAdminStatus()
    setLoadingAdmin(false)
  }

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

    await supabase.from('folders').insert({ user_id: user.id, name: trimmed, parent_id: currentFolderId ?? null })
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

  const navigateToFolder = (folder: Folder | null) => {
    if (!folder) {
      setCurrentFolderId(null)
      setSelectedFolderId(null)
      setFolderBreadcrumb([])
      return
    }
    setCurrentFolderId(folder.id)
    setSelectedFolderId(folder.id)
    setFolderBreadcrumb(prev => {
      const idx = prev.findIndex(f => f.id === folder.id)
      if (idx !== -1) return prev.slice(0, idx + 1)
      return [...prev, folder]
    })
  }

  const handleUnparentFolder = async (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation()
    await supabase.from('folders').update({ parent_id: currentFolderId ?? null }).eq('id', folderId)
    loadFolders()
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
    setDraggingAdvertiserId(advertiserId)
  }, [])

  const handleAdvertiserDragEnd = useCallback(() => {
    setDraggingAdvertiserId(null)
    setDragOverFolderId(null)
  }, [])

  const handleFolderDragStart = useCallback((e: React.DragEvent, folderId: string) => {
    e.dataTransfer.setData('folder/id', folderId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingFolderId(folderId)
  }, [])

  const handleFolderDrop = useCallback(async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const draggedId = e.dataTransfer.getData('folder/id')
    if (!draggedId || draggedId === targetFolderId) { setDraggingFolderId(null); return }

    // 폴더를 폴더에 드롭 → 하위 폴더로 귀속
    await supabase.from('folders').update({ parent_id: targetFolderId }).eq('id', draggedId)
    setDraggingFolderId(null)
    loadFolders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // folderOrder는 레거시 - 트리 구조로 대체됨

  const filteredAdvertisers = currentFolderId
    ? advertisers.filter(a => a.folder_id === currentFolderId)
    : advertisers

  const uncategorizedCount = advertisers.filter(a => !a.folder_id).length

  const getFolderCount = (folderId: string) =>
    advertisers.filter(a => a.folder_id === folderId).length

  const FOLDER_COLORS = [
    { bg: 'bg-blue-950', border: 'border-blue-800', text: 'text-blue-300' },
    { bg: 'bg-purple-950', border: 'border-purple-800', text: 'text-purple-300' },
    { bg: 'bg-emerald-950', border: 'border-emerald-800', text: 'text-emerald-300' },
    { bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-300' },
    { bg: 'bg-rose-950', border: 'border-rose-800', text: 'text-rose-300' },
    { bg: 'bg-cyan-950', border: 'border-cyan-800', text: 'text-cyan-300' },
    { bg: 'bg-orange-950', border: 'border-orange-800', text: 'text-orange-300' },
    { bg: 'bg-teal-950', border: 'border-teal-800', text: 'text-teal-300' },
  ]
  const getFolderColor = (folderId: string) => {
    let hash = 0
    for (let i = 0; i < folderId.length; i++) {
      hash = folderId.charCodeAt(i) + ((hash << 5) - hash)
    }
    return FOLDER_COLORS[Math.abs(hash) % FOLDER_COLORS.length]
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">PMK Insight</h1>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <span className="text-xs font-semibold text-amber-400 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded-md">관리자</span>
          )}
          <span className="text-sm text-gray-400">{user?.email}</span>
          {isAdmin && (
            <button
              onClick={() => router.push('/dashboard/admin')}
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors border border-amber-800 hover:border-amber-600 rounded px-2 py-1"
            >
              관리자 패널
            </button>
          )}
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

        {/* Folder Tree Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-medium text-gray-400">폴더</h3>
            <button onClick={() => setShowFolderInput(true)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              + 폴더 만들기
            </button>
          </div>

          {/* Breadcrumb */}
          {folderBreadcrumb.length > 0 && (
            <div className="flex items-center gap-1 mb-3 text-xs text-gray-500">
              <button onClick={() => navigateToFolder(null)} className="hover:text-white transition-colors">전체</button>
              {folderBreadcrumb.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1">
                  <span className="text-gray-700">/</span>
                  <button
                    onClick={() => navigateToFolder(f)}
                    className={i === folderBreadcrumb.length - 1 ? 'text-blue-400' : 'hover:text-white transition-colors'}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {/* 전체 버튼 (최상위에서만) */}
            {currentFolderId === null && (
              <button
                onClick={() => navigateToFolder(null)}
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
            )}

            {/* 상위 폴더로 버튼 (하위 폴더 탐색 중일 때) */}
            {currentFolderId !== null && (
              <button
                onClick={() => {
                  const newCrumb = folderBreadcrumb.slice(0, -1)
                  const parent = newCrumb[newCrumb.length - 1] || null
                  setFolderBreadcrumb(newCrumb)
                  setCurrentFolderId(parent?.id ?? null)
                  setSelectedFolderId(parent?.id ?? null)
                }}
                className="px-4 py-3 rounded-xl text-sm font-medium transition-colors border bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500"
              >
                ← 상위 폴더
              </button>
            )}

            {/* 현재 레벨 폴더 목록 */}
            {folders
              .filter(f => f.parent_id === currentFolderId)
              .map(folder => {
                const subCount = folders.filter(f => f.parent_id === folder.id).length
                const isBeingDraggedOver = dragOverFolderId === folder.id
                const isDraggingThis = draggingFolderId === folder.id
                const isDropTarget = isBeingDraggedOver && (draggingFolderId || draggingAdvertiserId) && !isDraggingThis
                const color = getFolderColor(folder.id)
                return (
                  <div
                    key={folder.id}
                    draggable
                    onDragStart={(e) => handleFolderDragStart(e, folder.id)}
                    onDragEnd={() => { setDraggingFolderId(null); setDragOverFolderId(null) }}
                    onDragOver={(e) => { e.preventDefault() }}
                    onDrop={(e) => {
                      if (draggingFolderId) handleFolderDrop(e, folder.id)
                      else handleDropOnFolder(e, folder.id)
                    }}
                    onDragEnter={() => setDragOverFolderId(folder.id)}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolderId(null)
                    }}
                    className={`relative flex items-center gap-1 rounded-xl text-sm font-medium transition-all border cursor-grab active:cursor-grabbing ${
                      isDraggingThis
                        ? 'opacity-40 bg-gray-800 border-gray-600 text-gray-400 scale-95'
                        : isDropTarget
                          ? 'bg-blue-900/60 border-blue-400 text-white shadow-lg shadow-blue-900/50 scale-105'
                          : selectedFolderId === folder.id
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : `${color.bg} ${color.border} ${color.text} hover:brightness-125`
                    }`}
                  >
                    {isDropTarget && (
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-blue-300 bg-blue-900 border border-blue-700 px-2 py-0.5 rounded whitespace-nowrap pointer-events-none">
                        여기에 넣기
                      </span>
                    )}
                    <button onClick={() => navigateToFolder(folder)} className="px-4 py-3 flex items-center gap-1.5">
                      {subCount > 0 ? '📁' : '🗂️'} {folder.name} ({getFolderCount(folder.id)})
                      {subCount > 0 && <span className="text-xs text-gray-400">+{subCount}</span>}
                    </button>
                    {currentFolderId !== null && (
                      <button
                        onClick={(e) => handleUnparentFolder(e, folder.id)}
                        className="text-gray-500 hover:text-orange-400 transition-colors text-xs px-1"
                        title="상위 폴더로 이동"
                      >
                        ↑
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id) }}
                      className="pr-2 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      x
                    </button>
                  </div>
                )
              })
            }

            {/* 새 폴더 입력 */}
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
                <button onClick={handleCreateFolder} disabled={creatingFolder} className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {creatingFolder ? '...' : '확인'}
                </button>
                <button onClick={() => { setShowFolderInput(false); setNewFolderName('') }} className="px-2 py-2 text-gray-500 hover:text-white text-sm">
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
            const hasControl = isOwn || isAdmin
            return (
              <div
                key={adv.id}
                draggable={hasControl}
                onDragStart={(e) => hasControl && handleDragStart(e, adv.id)}
                onDragEnd={handleAdvertiserDragEnd}
                onClick={() => router.push(`/dashboard/${adv.id}`)}
                className={`border rounded-lg p-3 cursor-pointer transition-all ${
                  draggingAdvertiserId === adv.id
                    ? 'opacity-40 scale-95 bg-gray-800 border-gray-700'
                    : isOwn
                      ? 'bg-gray-900 border-gray-800 hover:border-gray-600'
                      : isAdmin
                        ? 'bg-gray-900 border-amber-900/40 hover:border-amber-700/60'
                        : 'bg-gray-900/50 border-gray-800/60 hover:border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="text-sm font-semibold text-white truncate">{adv.advertiser_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">담당: {adv.manager_name}</p>
                  </div>
                  {hasControl && (
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
                    {!isOwn && !isAdmin && (
                      <span className="text-xs bg-purple-950 text-purple-400 border border-purple-900 px-1.5 py-0.5 rounded w-fit">타 매니저</span>
                    )}
                    {!isOwn && isAdmin && (
                      <span className="text-xs bg-amber-950 text-amber-400 border border-amber-900 px-1.5 py-0.5 rounded w-fit">관리자 접근</span>
                    )}
                  </div>
                  {adv.folder_id && hasControl && (
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
