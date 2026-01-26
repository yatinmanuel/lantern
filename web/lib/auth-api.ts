const API_BASE_URL = typeof window !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

export interface User {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  is_superuser: boolean;
  is_active: boolean;
  last_login?: string | null;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions?: { id: number; name: string }[];
}

export interface Permission {
  id: number;
  name: string;
  resource: string;
  action: string;
  description: string | null;
}

// Helper to get session ID from localStorage (fallback for cross-origin cookies)
const getSessionId = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('session_id');
  }
  return null;
};

// Helper to set session ID in localStorage
const setSessionId = (sessionId: string | null): void => {
  if (typeof window !== 'undefined') {
    if (sessionId) {
      localStorage.setItem('session_id', sessionId);
    } else {
      localStorage.removeItem('session_id');
    }
  }
};

export const authApi = {
  async login(username: string, password: string): Promise<{ user: User; session_id: string }> {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to login');
    }
    const data = await res.json();
    // Store session_id in localStorage as fallback for cross-origin cookies
    if (data.session_id) {
      setSessionId(data.session_id);
      console.log('[Auth] Stored session_id in localStorage:', data.session_id.substring(0, 10) + '...');
    } else {
      console.warn('[Auth] No session_id in login response:', data);
    }
    return data;
  },

  async register(username: string, password: string, email?: string, full_name?: string): Promise<{ user: User }> {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password, email, full_name }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to register');
    }
    return res.json();
  },

  async getCurrentUser(): Promise<User> {
    const sessionId = getSessionId();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    // Send session_id as header if we have it (fallback for cross-origin cookies)
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
      console.log('[Auth] Sending session_id in header:', sessionId.substring(0, 10) + '...');
    } else {
      console.log('[Auth] No session_id in localStorage, trying cookie only');
    }
    
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      if (res.status === 401) {
        // Clear localStorage on 401
        console.log('[Auth] 401 Unauthorized - clearing session');
        setSessionId(null);
        throw new Error('Not authenticated');
      }
      throw new Error(`Failed to get user: ${res.status}`);
    }
    const user = await res.json();
    console.log('[Auth] Successfully restored session for user:', user.username);
    return user;
  },

  async logout(): Promise<void> {
    const sessionId = getSessionId();
    const headers: HeadersInit = {};
    
    // Send session_id as header if we have it
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers,
    });
    
    // Clear localStorage
    setSessionId(null);
  },
};

export const userApi = {
  async getUsers(): Promise<(User & { roles: { id: number; name: string }[] })[]> {
    const sessionId = getSessionId();
    const headers: HeadersInit = {};
    
    // Send session_id as header if we have it (fallback for cross-origin cookies)
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users`, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to fetch users' }));
      throw new Error(error.error || 'Failed to fetch users');
    }
    return res.json();
  },

  async getUser(id: number): Promise<User & { roles: Role[]; permissions: Permission[]; allPermissions: Permission[] }> {
    const sessionId = getSessionId();
    const headers: HeadersInit = {};
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to fetch user' }));
      throw new Error(error.error || 'Failed to fetch user');
    }
    return res.json();
  },

  async createUser(data: {
    username: string;
    password: string;
    email?: string;
    full_name?: string;
    role_ids?: number[];
    permission_ids?: number[];
  }): Promise<User> {
    const sessionId = getSessionId();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to create user' }));
      throw new Error(error.error || 'Failed to create user');
    }
    return res.json();
  },

  async updateUser(id: number, data: {
    email?: string;
    password?: string;
    full_name?: string;
    is_active?: boolean;
    is_superuser?: boolean;
    role_ids?: number[];
    permission_ids?: number[];
  }): Promise<User> {
    const sessionId = getSessionId();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to update user' }));
      throw new Error(error.error || 'Failed to update user');
    }
    return res.json();
  },

  async deleteUser(id: number): Promise<void> {
    const sessionId = getSessionId();
    const headers: HeadersInit = {};
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to delete user' }));
      throw new Error(error.error || 'Failed to delete user');
    }
  },

  async getRoles(): Promise<Role[]> {
    const sessionId = getSessionId();
    const headers: HeadersInit = {};
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/roles/all`, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to fetch roles' }));
      throw new Error(error.error || 'Failed to fetch roles');
    }
    return res.json();
  },

  async getPermissions(): Promise<Permission[]> {
    const sessionId = getSessionId();
    const headers: HeadersInit = {};
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/permissions/all`, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to fetch permissions' }));
      throw new Error(error.error || 'Failed to fetch permissions');
    }
    return res.json();
  },

  async createRole(data: {
    name: string;
    description?: string;
    permission_ids?: number[];
  }): Promise<Role> {
    const sessionId = getSessionId();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/roles`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to create role' }));
      throw new Error(error.error || 'Failed to create role');
    }
    return res.json();
  },

  async updateRole(id: number, data: {
    name?: string;
    description?: string;
    permission_ids?: number[];
  }): Promise<Role> {
    const sessionId = getSessionId();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/roles/${id}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to update role' }));
      throw new Error(error.error || 'Failed to update role');
    }
    return res.json();
  },

  async deleteRole(id: number): Promise<void> {
    const sessionId = getSessionId();
    const headers: HeadersInit = {};
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/roles/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to delete role' }));
      throw new Error(error.error || 'Failed to delete role');
    }
  },

  async createPermission(data: {
    name: string;
    resource: string;
    action: string;
    description?: string;
  }): Promise<Permission> {
    const sessionId = getSessionId();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/permissions`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to create permission' }));
      throw new Error(error.error || 'Failed to create permission');
    }
    return res.json();
  },

  async updatePermission(id: number, data: {
    name?: string;
    resource?: string;
    action?: string;
    description?: string;
  }): Promise<Permission> {
    const sessionId = getSessionId();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/permissions/${id}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to update permission' }));
      throw new Error(error.error || 'Failed to update permission');
    }
    return res.json();
  },

  async deletePermission(id: number): Promise<void> {
    const sessionId = getSessionId();
    const headers: HeadersInit = {};
    
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/users/permissions/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to delete permission' }));
      throw new Error(error.error || 'Failed to delete permission');
    }
  },
};
