'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function AddAdvertiserModal({ onClose, onSuccess }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState({
    manager_name: '',
    advertiser_name: '',
    sheet_url: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('로그인이 필요합니다.'); setLoading(false); return }

    if (!form.sheet_url.includes('docs.google.com/spreadsheets')) {
      setError('올바른 구글 스프레드시트 URL을 입력해주세요.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('advertisers').insert({
      user_id: user.id,
      manager_name: form.manager_name,
      advertiser_name: form.advertiser_name,
      sheet_url: form.sheet_url,
    })

    if (insertError) {
      setError('저장에 실패했습니다: ' + insertError.message)
    } else {
      onSuccess()
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">광고주 추가</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">담당자</label>
            <input
              type="text"
              placeholder="담당자 이름"
              value={form.manager_name}
              onChange={e => setForm(f => ({ ...f, manager_name: e.target.value }))}
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">광고주명</label>
            <input
              type="text"
              placeholder="광고주 이름"
              value={form.advertiser_name}
              onChange={e => setForm(f => ({ ...f, advertiser_name: e.target.value }))}
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">구글 스프레드시트 URL</label>
            <input
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={form.sheet_url}
              onChange={e => setForm(f => ({ ...f, sheet_url: e.target.value }))}
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 text-sm hover:text-white transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? '저장 중...' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
