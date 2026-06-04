import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui'

const schema = z.object({
  org_name: z.string().min(2, 'Organisation name required'),
  full_name: z.string().optional(),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
})

type FormValues = z.infer<typeof schema>

export default function RegisterPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: (v: FormValues) => authApi.register(v),
    onSuccess: (data) => { login(data.access_token) },
  })

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Quote<span className="text-blue-600">Me</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Create your organisation account</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Organisation name</label>
              <input {...register('org_name')} placeholder="Acme Corp" className="input-base" />
              {errors.org_name && <p className="text-red-500 text-xs mt-1">{errors.org_name.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Your full name</label>
              <input {...register('full_name')} placeholder="Jane Smith" className="input-base" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Work email</label>
              <input {...register('email')} type="email" placeholder="jane@acme.com" className="input-base" />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input {...register('password')} type="password" placeholder="Min. 8 characters" className="input-base" />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            {mutation.isError && (
              <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Registration failed. Email may already be registered.
              </p>
            )}

            <Button variant="primary" type="submit" loading={mutation.isPending} className="w-full justify-center">
              Create account
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
