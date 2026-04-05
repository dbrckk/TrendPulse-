import { supabase } from './supabase.js'

export async function getDeals(limit = 50) {
  const { data, error } = await supabase
    .from('deal_products')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching deals:', error)
    return []
  }

  return data
}
