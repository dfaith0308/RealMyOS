'use server'

import { detectChurnRisk, detectDormant } from '@/actions/admin/growth-engine'

export async function submitGrowthChurnEnqueue() {
  await detectChurnRisk()
}

export async function submitGrowthDormantEnqueue() {
  await detectDormant()
}

