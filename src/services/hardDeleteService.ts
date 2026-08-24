import { supabase } from '../lib/supabase'
import type { TargetType } from '../types/database'
import { managementService } from './managementService'

export async function deleteExecutionData(
  assignmentIds: string[],
  treeIds: string[],
): Promise<void> {
  managementService.assertUnlocked()
  let batchIds: string[] = []
  if (assignmentIds.length) {
    const { data, error } = await supabase
      .from('task_execution_batches')
      .select('id')
      .in('task_assignment_id', assignmentIds)
    if (error) throw error
    batchIds = (data ?? []).map((row) => row.id)
  }

  if (batchIds.length) {
    const { error } = await supabase
      .from('task_execution_items')
      .delete()
      .in('execution_batch_id', batchIds)
    if (error) throw error
  }
  if (treeIds.length) {
    const { error } = await supabase.from('task_execution_items').delete().in('tree_id', treeIds)
    if (error) throw error
  }
  if (batchIds.length) {
    const { error } = await supabase
      .from('task_execution_batches')
      .delete()
      .in('id', batchIds)
    if (error) throw error
  }
}

export async function listAssignmentIdsByTarget(
  targetType: TargetType,
  targetIds: string[],
): Promise<string[]> {
  if (!targetIds.length) return []
  const { data, error } = await supabase
    .from('task_assignments')
    .select('id')
    .eq('target_type', targetType)
    .in('target_id', targetIds)
  if (error) throw error
  return (data ?? []).map((row) => row.id)
}
