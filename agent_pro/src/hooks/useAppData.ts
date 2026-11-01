import { useContext } from 'react'

import { AppDataContext, type AppDataValue } from '../context/appDataContext'

export function useAppData(): AppDataValue {
  const value = useContext(AppDataContext)
  if (!value) throw new Error('useAppData must be used inside <AppDataProvider>')
  return value
}
