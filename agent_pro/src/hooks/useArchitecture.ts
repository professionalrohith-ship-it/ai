import { getArchitecture } from '../services/api/architecture'
import type { ArchitectureData } from '../types/architecture'
import { useAnalysis, type AnalysisView } from './useArchitectureAnalysis'

export function useArchitecture(repositoryId: string | null): AnalysisView<ArchitectureData> {
  return useAnalysis(repositoryId, getArchitecture)
}
