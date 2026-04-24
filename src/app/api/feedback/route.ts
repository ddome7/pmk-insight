import { createClient } from '@/lib/supabase/server'

// GET: 어드민 → 전체 / 일반 → 본인 것만
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const { data, error } = await supabase
      .from('page_feedbacks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return Response.json({ feedbacks: data || [] })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// POST: 피드백 작성
export async function POST(request: Request) {
  try {
    const { section, priority, content, page_id } = await request.json()
    if (!content?.trim()) return Response.json({ error: '내용을 입력해주세요.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const { data, error } = await supabase.from('page_feedbacks').insert({
      user_id: user.id,
      user_email: user.email,
      page_id: page_id || 'pmk-insight',
      section: section || '',
      priority: priority || 'medium',
      content: content.trim(),
    }).select().single()

    if (error) throw error
    return Response.json({ feedback: data })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// PATCH: 상태 변경 (어드민 전용)
export async function PATCH(request: Request) {
  try {
    const { id, status } = await request.json()
    if (!id || !status) return Response.json({ error: 'id와 status가 필요합니다.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const { error } = await supabase
      .from('page_feedbacks')
      .update({ status })
      .eq('id', id)

    if (error) throw error
    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// DELETE: 삭제 (어드민 또는 본인)
export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    if (!id) return Response.json({ error: 'id가 필요합니다.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const { error } = await supabase
      .from('page_feedbacks')
      .delete()
      .eq('id', id)

    if (error) throw error
    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
