import { useEffect, useState } from 'react'

/**
 * Trails `value` by `delay` ms. Used to keep a search box from firing a request
 * on every keystroke — feed the debounced value to the query, the raw one to the
 * input so typing stays responsive.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timeoutId)
  }, [value, delay])

  return debounced
}

export default useDebouncedValue
