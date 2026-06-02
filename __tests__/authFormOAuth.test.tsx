/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthForm from '../app/components/AuthForm';
import OAuthProviderButtons from '../app/components/OAuthProviderButtons';

const push = jest.fn();
const refresh = jest.fn();
const signIn = jest.fn();
const signUp = jest.fn();
const signInWithOAuth = jest.fn();
let searchParams = new URLSearchParams('redirect=/account');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => searchParams,
}));

jest.mock('../app/components/AuthProvider', () => ({
  useAuth: () => ({
    configured: true,
    signIn,
    signUp,
    signInWithOAuth,
  }),
}));

describe('AuthForm OAuth', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams('redirect=/account');
    push.mockReset();
    refresh.mockReset();
    signIn.mockReset();
    signUp.mockReset();
    signInWithOAuth.mockReset();
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  });

  test('renders Continue with Google button', () => {
    render(<AuthForm />);

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  test('clicking Google calls signInWithOAuth with google provider context', async () => {
    signInWithOAuth.mockResolvedValue({ error: null });

    render(<OAuthProviderButtons redirectTo="/account" />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledWith('google', '/account');
    });
  });

  test('email/password sign in still works', async () => {
    signIn.mockResolvedValue({ error: null });

    render(<AuthForm />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'traveler@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret123' },
    });
    const submitButton = screen
      .getAllByRole('button', { name: 'Sign in' })
      .find((button) => button.getAttribute('type') === 'submit');
    expect(submitButton).toBeDefined();
    fireEvent.click(submitButton!);

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('traveler@example.com', 'secret123');
      expect(push).toHaveBeenCalledWith('/account');
      expect(refresh).toHaveBeenCalled();
    });
  });

  test('shows friendly OAuth error from login query param', () => {
    searchParams = new URLSearchParams('auth_error=oauth_failed');

    render(<AuthForm />);

    expect(
      screen.getByText(
        'Google sign-in did not complete. Please try again or use email and password.',
      ),
    ).toBeInTheDocument();
  });
});
