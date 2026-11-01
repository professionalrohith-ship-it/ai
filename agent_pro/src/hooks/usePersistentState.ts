import { useCallback, useState } from 'react'

/** useState that remembers its value in localStorage (safely: storage may be unavailable). */
export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored === null ? initial : (JSON.parse(stored) as T)
    } catch {
      return initial
    }
  })

  const update = useCallback(
    (value: T) => {
      setState(value)
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // ignore: the preference simply will not persist
      }
    },
    [key],
  )

  return [state, update]
}
