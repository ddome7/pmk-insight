'use client'

import { useState, useEffect } from 'react'

interface FeedbackButtonProps {
  pageId?: string
  defaultSection?: string
}

export default function FeedbackButton({ pageId = 'pmk-insight', defaultSection = '' }: FeedbackButtonProps) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [section, setSection] = useState(defaultSection)
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const cached = localStorage.getItem('pmk_isAdmin') === 'true'
    setIsAdmin(cached)
    // 서버에서 최신 상태 확인
    fetch('/api/admin').then(r => r.json()).then(d => {
      setIsAdmin(d.isAdmin)
      localStorage.setItem('pmk_isAdmin', d.isAdmin ? 'true' : 'false')
    }).catch(() => {})
  }, [])

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleSubmit = async () => {
    if (!content.trim()) { showToast('내용을 입력해주세요.', 'error'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: pageId, section, priority, content }),
      })
      if (!res.ok) throw new Error('저장 실패')
      setContent('')
      setSection(defaultSection)
      setPriority('medium')
      setIsOpen(false)
      showToast('피드백이 저장됐어요 ✓', 'success')
    } catch {
      showToast('저장에 실패했습니다.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) return null

  const PRIORITY_OPTIONS = [
    { value: 'high', label: '🔴 높음', bg: 'bg-red-950 border-red-800 text-red-300' },
    { value: 'medium', label: '🟡 보통', bg: 'bg-amber-950 border-amber-800 text-amber-300' },
    { value: 'low', label: '🟢 낮음', bg: 'bg-emerald-950 border-emerald-800 text-emerald-300' },
  ]

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-gray-700 hover:border-blue-600 text-gray-300 hover:text-white text-sm font-medium rounded-full shadow-lg transition-all hover:shadow-blue-900/30"
        title="피드백 작성"
      >
        <span>✏️</span>
        <span>피드백</span>
      </button>

      {/* 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* 슬라이드 패널 */}
      <div
        className={`fixed top-0 right-0 h-full w-80 z-50 bg-gray-950 border-l border-gray-800 shadow-2xl transition-transform duration-300 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <p className="text-sm font-semibold text-white">✏️ 피드백 작성</p>
            <p className="text-xs text-gray-500 mt-0.5">개선사항·버그·아이디어</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-white text-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 폼 */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {/* 섹션 */}
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-1.5">섹션 <span className="text-gray-600">(선택)</span></label>
            <input
              type="text"
              value={section}
              onChange={e => setSection(e.target.value)}
              placeholder="예: 인사이트 카드, 채팅 패널, 대시보드..."
              className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
            />
          </div>

          {/* 우선순위 */}
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-1.5">우선순위</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPriority(opt.value as 'high' | 'medium' | 'low')}
                  className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    priority === opt.value
                      ? opt.bg
                      : 'bg-gray-900 border-gray-700 text-gray-500 hover:border-gray-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 내용 */}
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-1.5">내용 <span className="text-red-500">*</span></label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="개선하고 싶은 점, 발견한 버그, 아이디어를 자유롭게 적어주세요."
              rows={6}
              className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder-gray-600"
            />
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-4 border-t border-gray-800">
          <button
            onClick={handleSubmit}
            disabled={submitting || !content.trim()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {submitting ? '저장 중...' : '피드백 저장'}
          </button>
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          className={`fixed bottom-20 right-6 z-[60] px-4 py-2.5 rounded-lg text-sm font-medium text-white shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  )
}
