jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/AuthContext', () => {
  const actual = jest.requireActual('../context/AuthContext');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from './LoginScreen';
import { useAuth, AuthRoleError } from '../context/AuthContext';
import { ApiError } from '../services/apiClient';

const mockedUseAuth = useAuth as jest.Mock;

const baseAuthValue = {
  status: 'anonymous' as const,
  token: null,
  username: '',
  loading: false,
  api: {},
  logout: jest.fn(),
  requireAuthToken: jest.fn(() => null),
};

describe('LoginScreen/submit', () => {
  it('calls AuthContext.login with the entered username and password', async () => {
    const login = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({ ...baseAuthValue, login });

    await render(<LoginScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText('Usuario'), 'chofer1');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
    await fireEvent.press(screen.getByText('Iniciar sesion'));

    await waitFor(() => expect(login).toHaveBeenCalledWith('chofer1', 'secret'));
  });

  it('disables the submit button and shows a loading label while AuthContext.loading is true', async () => {
    mockedUseAuth.mockReturnValue({ ...baseAuthValue, login: jest.fn(), loading: true });

    await render(<LoginScreen />);

    expect(screen.getByText('Ingresando...')).toBeTruthy();
    expect(screen.queryByText('Iniciar sesion')).toBeNull();
  });
});

describe('LoginScreen/error handling', () => {
  it('renders a visible error message when login throws ApiError', async () => {
    const login = jest.fn().mockRejectedValue(new ApiError(401, 'invalid credentials'));
    mockedUseAuth.mockReturnValue({ ...baseAuthValue, login });

    await render(<LoginScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText('Usuario'), 'chofer1');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong');
    await fireEvent.press(screen.getByText('Iniciar sesion'));

    await waitFor(() => expect(screen.getByText('invalid credentials')).toBeTruthy());
  });

  it('renders a visible error message when login throws AuthRoleError', async () => {
    const login = jest.fn().mockRejectedValue(new AuthRoleError());
    mockedUseAuth.mockReturnValue({ ...baseAuthValue, login });

    await render(<LoginScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText('Usuario'), 'operador1');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
    await fireEvent.press(screen.getByText('Iniciar sesion'));

    await waitFor(() => expect(screen.getByText('Usuario sin permisos de chofer.')).toBeTruthy());
  });

  it('clears a previous error on a new submit attempt', async () => {
    const login = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(401, 'invalid credentials'))
      .mockResolvedValueOnce(undefined);
    mockedUseAuth.mockReturnValue({ ...baseAuthValue, login });

    await render(<LoginScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText('Usuario'), 'chofer1');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong');
    await fireEvent.press(screen.getByText('Iniciar sesion'));
    await waitFor(() => expect(screen.getByText('invalid credentials')).toBeTruthy());

    await fireEvent.press(screen.getByText('Iniciar sesion'));

    await waitFor(() => expect(screen.queryByText('invalid credentials')).toBeNull());
  });
});
