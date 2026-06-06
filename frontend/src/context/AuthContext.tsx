import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { User } from '@/types'
import { authApi } from '@/api'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('pl_token'))
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (token) {
      setIsLoading(true)
      authApi.me()
        .then(setUser)
        .catch(() => { setToken(null); localStorage.removeItem('pl_token') })
        .finally(() => setIsLoading(false))
    } else {
      setUser(null)
      setIsLoading(false)
    }
  }, [token])

  const login = (newToken: string) => {
    localStorage.setItem('pl_token', newToken)
    setToken(newToken)
    // useEffect watches token and calls authApi.me() — no duplicate call here
  }

  const logout = () => {
    localStorage.removeItem('pl_token')
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
