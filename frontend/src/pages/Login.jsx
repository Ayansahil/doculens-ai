import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brain } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useApp } from '../context/AppContext';

const Login = () => {
  const { auth, addNotification } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    const result =
      mode === 'login'
        ? await auth.login({ email, password })
        : await auth.register({ name, email, password });

    setSubmitting(false);

    if (result.success) {
      addNotification({
        type: 'success',
        message: mode === 'login' ? 'Logged in successfully' : 'Account created. You are logged in.',
      });
      navigate('/', { replace: true });
    } else {
      setFormError(result.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-9 w-9 bg-primary-500 rounded-lg flex items-center justify-center">
            <Brain size={20} className="text-white" />
          </div>
          <span className="font-semibold text-lg">DocuLens AI</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="text-gray-600 text-sm mb-6">
          {mode === 'login' ? 'Sign in to continue.' : 'Sign up to get started.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <Input
              label="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
            />
          )}
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
          </Button>
        </form>

        <p className="text-sm text-gray-600 mt-4 text-center">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button className="text-primary-600 font-medium" onClick={() => setMode('signup')}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Have an account?{' '}
              <button className="text-primary-600 font-medium" onClick={() => setMode('login')}>
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="text-sm text-gray-500 mt-4 text-center">
          <Link to="/" className="hover:underline">Back to home</Link>
        </p>
      </Card>
    </div>
  );
};

export default Login;
