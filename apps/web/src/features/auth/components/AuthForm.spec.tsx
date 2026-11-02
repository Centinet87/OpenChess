import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { authApi } from '../api/auth.api';
import { AuthForm } from './AuthForm';

jest.mock('../api/auth.api', () => ({
  authApi: { login: jest.fn(), register: jest.fn() },
}));
const auth = jest.mocked(authApi);
beforeEach(() => {
  jest.clearAllMocks();
});

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'ana@test.local' },
  });
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'test-only-password' },
  });
}

it('inicia sesión con las credenciales y conserva el estado de envío', async () => {
  auth.login.mockResolvedValue({ data: {} } as Awaited<
    ReturnType<typeof auth.login>
  >);
  const onSuccess = jest.fn();
  render(<AuthForm onSuccess={onSuccess} />);
  fillCredentials();
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Entrar' }).disabled,
  ).toBe(true);
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  expect(auth.login).toHaveBeenCalledWith({
    email: 'ana@test.local',
    password: 'test-only-password',
  });
  expect(auth.register).not.toHaveBeenCalled();
});

it('registra con nombre y conserva las validaciones del formulario', async () => {
  auth.register.mockResolvedValue({ data: {} } as Awaited<
    ReturnType<typeof auth.register>
  >);
  const onSuccess = jest.fn();
  render(<AuthForm onSuccess={onSuccess} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
  expect(screen.getByLabelText('Contraseña').getAttribute('minlength')).toBe(
    '10',
  );
  expect(screen.getByLabelText('Nombre').hasAttribute('required')).toBe(true);
  fillCredentials();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Ana' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  expect(auth.register).toHaveBeenCalledWith({
    email: 'ana@test.local',
    password: 'test-only-password',
    displayName: 'Ana',
  });
});

it('muestra el error y permite volver a enviar cuando falla el acceso', async () => {
  auth.login.mockRejectedValue(new Error('Failed'));
  const onSuccess = jest.fn();
  render(<AuthForm onSuccess={onSuccess} />);
  fillCredentials();
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Algo salió mal'),
  );
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Entrar' }).disabled,
  ).toBe(false);
  expect(onSuccess).not.toHaveBeenCalled();
});
