import { useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui'

const schema = z.object({
  full_name: z.string().min(1, 'Name required'),
  password: z.string().min(8, 'Minimum 8 characters'),
})

type FormValues = z.infer<typeof schema>

export default function AcceptInvitePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { login } = useAuth()
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: (v: FormValues) => authApi.acceptInvite(token, v.password, v.full_name),
    onSuccess: async (data) => {
      await login(data.access_token)
      navigate('/')
    },
  })

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">Invalid or missing invite link.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Quote<span className="text-blue-600">Me</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Accept your invitation</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Your full name</label>
              <input {...register('full_name')} placeholder="Jane Smith" className="input-base" />
              {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Set a password</label>
              <input
                {...register('password')}
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                className="input-base"
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            {mutation.isError && (
              <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Invalid or expired invitation link.
              </p>
            )}

            <Button variant="primary" type="submit" loading={mutation.isPending} className="w-full justify-center">
              Create account
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
