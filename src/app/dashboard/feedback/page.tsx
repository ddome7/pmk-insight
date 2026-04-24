'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Feedback {
  id: string
  user_email: string
  page_id: string
  section: string
  priority: 'high' | 'medium' | 'low'
  content: string
  status: 'pending' | 'in_progress' | 'done'
  created_at: string
}

const PRIORITY_LABEL: Record<string, { label: string; cls: string }> = {
  high:   { label: '🔴 높음', cls: 'bg-red-950 text-red-300 border-red-800' },
  medium: { label: '🟡 보통', cls: 'bg-amber-950 text-amber-300 border-amber-800' },
  low:    { label: '🟢 낮음', cls: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:     { label: '대기', cls: 'bg-gray-800 text-gray-400 border-gray-700' },
  in_progress: { label: '처리중', cls: 'bg-blue-950 text-blue-300 border-blue-800' },
  done:        { label: '완료', cls: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
}

const STATUS_NEXT: Record<string, string> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
}

export default function FeedbackPage() {
  const router = useRouter()
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // 어드민 체크
    fetch('/api/admin').then(r => r.json()).then(d => {
      if (!d.isAdmin) { router.push('/dashboard'); return }
      setIsAdmin(true)
      loadFeedbacks()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadFeedbacks = async () => {
    setLoading(true)
    const res = await fetch('/api/feedback')
    if (res.ok) {
      const data = await res.json()
      setFeedbacks(data.feedbacks || [])
    }
    setLoading(false)
  }

  const handleStatusToggle = async (fb: Feedback) => {
    const next = STATUS_NEXT[fb.status]
    await fetch('/api/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fb.id, status: next }),
    })
    setFeedbacks(prev => prev.map(f => f.id === fb.id ? { ...f, status: next as Feedback['status'] } : f))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('피드백을 삭제할까요?')) return
    await fetch('/api/feedback', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setFeedbacks(prev => prev.filter(f => f.id !== id))
  }

  const filtered = feedbacks.filter(f => {
    if (filterStatus !== 'all' && f.status !== filterStatus) return false
    if (filterPriority !== 'all' && f.priority !== filterPriority) return false
    return true
  })

  const countByStatus = (s: string) => feedbacks.filter(f => f.status === s).length

  if (!isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 헤더 */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-xs text-gray-500 hover:text-white transition-colors border border-gray-700 hover:border-gray-500 rounded px-2 py-1"
        >
          ← 대시보드
        </button>
        <h1 className="text-lg font-bold">📬 피드백 관리</h1>
        <span className="text-xs text-amber-400 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded-md font-semibold">관리자</span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { key: 'pending', label: '대기', color: 'border-gray-700 text-gray-300' },
            { key: 'in_progress', label: '처리중', color: 'border-blue-800 text-blue-300' },
            { key: 'done', label: '완료', color: 'border-emerald-800 text-emerald-300' },
          ].map(s => (
            <div key={s.key} className={`bg-gray-900 border rounded-xl p-4 ${s.color}`}>
              <p className="text-2xl font-bold">{countByStatus(s.key)}</p>
              <p className="text-xs mt-1 opacity-70">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 필터 */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">상태</span>
            {['all', 'pending', 'in_progress', 'done'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors border ${
                  filterStatus === s
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {s === 'all' ? '전체' : STATUS_LABEL[s].label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">우선순위</span>
            {['all', 'high', 'medium', 'low'].map(p => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors border ${
                  filterPriority === p
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {p === 'all' ? '전체' : PRIORITY_LABEL[p].label}
              </button>
            ))}
          </div>
          <button onClick={loadFeedbacks} className="ml-auto text-xs text-gray-500 hover:text-white transition-colors">
            새로고침
          </button>
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="text-center py-20 text-gray-600 text-sm">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-600 text-sm">피드백이 없습니다.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(fb => (
              <div key={fb.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* 메타 */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${PRIORITY_LABEL[fb.priority]?.cls}`}>
                        {PRIORITY_LABEL[fb.priority]?.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${STATUS_LABEL[fb.status]?.cls}`}>
                        {STATUS_LABEL[fb.status]?.label}
                      </span>
                      {fb.section && (
                        <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
                          {fb.section}
                        </span>
                      )}
                    </div>
                    {/* 내용 */}
                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{fb.content}</p>
                    {/* 작성자·날짜 */}
                    <p className="text-xs text-gray-600 mt-2">
                      {fb.user_email} · {new Date(fb.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {/* 액션 */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleStatusToggle(fb)}
                      className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded px-2 py-1 transition-colors"
                    >
                      {fb.status === 'pending' ? '처리중으로' : fb.status === 'in_progress' ? '완료로' : '대기로'}
                    </button>
                    <button
                      onClick={() => handleDelete(fb.id)}
                      className="text-xs text-gray-600 hover:text-red-400 border border-gray-800 hover:border-red-900 rounded px-2 py-1 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
