import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RoleGuard } from '@/components/auth/RoleGuard';

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

function renderWithRouter(element: React.ReactElement) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

describe('ProtectedRoute', () => {
  it('shows loader while auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, needsOnboarding: false, loading: true });
    const { container } = renderWithRouter(<ProtectedRoute><div>content</div></ProtectedRoute>);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('redirects to /auth when no user', () => {
    mockUseAuth.mockReturnValue({ user: null, needsOnboarding: false, loading: false });
    const { container } = renderWithRouter(<ProtectedRoute><div>content</div></ProtectedRoute>);
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('redirects to /onboarding when onboarding needed', () => {
    mockUseAuth.mockReturnValue({ user: { id: '1' }, needsOnboarding: true, loading: false });
    const { container } = renderWithRouter(<ProtectedRoute><div>content</div></ProtectedRoute>);
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated and onboarded', () => {
    mockUseAuth.mockReturnValue({ user: { id: '1' }, needsOnboarding: false, loading: false });
    renderWithRouter(<ProtectedRoute><div>content</div></ProtectedRoute>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});

describe('RoleGuard', () => {
  it('shows loader while auth is loading', () => {
    mockUseAuth.mockReturnValue({ role: null, loading: true });
    const { container } = renderWithRouter(<RoleGuard allowed={['super_admin']}><div>admin content</div></RoleGuard>);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });

  it('redirects to / when role not in allowed list', () => {
    mockUseAuth.mockReturnValue({ role: 'agent', loading: false });
    const { container } = renderWithRouter(<RoleGuard allowed={['super_admin', 'manager']}><div>admin content</div></RoleGuard>);
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });

  it('renders children when role is allowed', () => {
    mockUseAuth.mockReturnValue({ role: 'agent', loading: false });
    renderWithRouter(<RoleGuard allowed={['super_admin', 'agent']}><div>agent content</div></RoleGuard>);
    expect(screen.getByText('agent content')).toBeInTheDocument();
  });

  it('redirects to / when role is null', () => {
    mockUseAuth.mockReturnValue({ role: null, loading: false });
    const { container } = renderWithRouter(<RoleGuard allowed={['super_admin']}><div>content</div></RoleGuard>);
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });
});