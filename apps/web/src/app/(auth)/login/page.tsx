import { LoginForm } from './login-form';

export const metadata = { title: 'Entrar' };

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-ink-100/40">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold">Entrar en Converflow</h1>
          <p className="mt-2 text-sm text-ink-500">
            Accede a tu panel para gestionar agentes, conversaciones y resultados.
          </p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-ink-500">
          ¿Sin cuenta?{' '}
          <a href="/signup" className="text-primary-700">
            Crear una
          </a>
        </p>
      </div>
    </div>
  );
}
