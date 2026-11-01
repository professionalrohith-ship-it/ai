import { getDependencies } from '../services/api/dependencies'
import type { DependencyData } from '../types/dependencies'
import { useAnalysis, type AnalysisView } from './useArchitectureAnalysis'

export function useDependencies(repositoryId: string | null): AnalysisView<DependencyData> {
  return useAnalysis(repositoryId, getDependencies)
}
