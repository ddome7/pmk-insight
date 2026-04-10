import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Use getUser() instead of getSession() for reliable server-side auth check.
  // getUser() validates the token with the Supabase Auth server.
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">PMK Insight</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{user.email}</span>
          <form action="/auth/signout" method="post">
            <button className="text-xs text-gray-500 hover:text-white transition-colors">
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-semibold">광고주 목록</h2>
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + 광고주 추가
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-gray-500 hover:border-gray-500 cursor-pointer transition-colors min-h-[160px]">
            <span className="text-3xl">+</span>
            <span className="text-sm">첫 번째 광고주 추가</span>
          </div>
        </div>
      </main>
    </div>
  )
}
