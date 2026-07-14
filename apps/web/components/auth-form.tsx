'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/api';
import { ErrorMessage } from './ui';

const schema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(2).optional(),
});
type Values = z.infer<typeof schema>;

export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<Values>({ resolver: zodResolver(schema) });
  const submit = handleSubmit(async (values) => {
    try {
      await api(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      router.replace('/projects');
      router.refresh();
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Request failed',
      });
    }
  });
  return (
    <div className="auth-shell">
      <main className="auth-card">
        <div className="brand">
          <span className="brand-mark">H</span>HookRelay
        </div>
        <h1>{register ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted">Reliable webhooks without the black box.</p>
        <div className="panel">
          <ErrorMessage
            error={errors.root?.message ? new Error(errors.root.message) : null}
          />
          <form className="form" onSubmit={submit}>
            {register && (
              <div className="field">
                <label>Name</label>
                <input className="input" {...field('name')} />
                <span className="field-error">{errors.name?.message}</span>
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" {...field('email')} />
              <span className="field-error">{errors.email?.message}</span>
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" {...field('password')} />
              <span className="field-error">{errors.password?.message}</span>
            </div>
            <button className="button" disabled={isSubmitting}>
              {isSubmitting
                ? 'Please wait…'
                : register
                  ? 'Create account'
                  : 'Log in'}
            </button>
          </form>
        </div>
        <p className="auth-switch">
          {register ? 'Already registered?' : 'New to HookRelay?'}{' '}
          <Link href={register ? '/login' : '/register'}>
            {register ? 'Log in' : 'Create account'}
          </Link>
        </p>
      </main>
    </div>
  );
}
