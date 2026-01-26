'use client';

import { useEffect, useState, useMemo } from 'react';
import { Save, RefreshCw, Plus, Trash2, Edit2, X, User as UserIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { userApi, User, Role, Permission } from '@/lib/auth-api';
import { useAuth } from '@/contexts/auth-context';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { ColumnDef } from '@tanstack/react-table';

export default function SettingsPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<(User & { roles: { id: number; name: string }[] })[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userRoles, setUserRoles] = useState<number[]>([]);
  const [userPermissions, setUserPermissions] = useState<number[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User & { password?: string }> | null>(null);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    full_name: '',
  });
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [editingRole, setEditingRole] = useState<Partial<Role> | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [rolePermissionIds, setRolePermissionIds] = useState<number[]>([]);
  const [newRole, setNewRole] = useState({ name: '', description: '' });
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);
  const [editingPermission, setEditingPermission] = useState<Partial<Permission> | null>(null);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [newPermission, setNewPermission] = useState({ name: '', resource: '', action: '', description: '' });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [usersData, rolesData, permissionsData] = await Promise.all([
        userApi.getUsers(),
        userApi.getRoles(),
        userApi.getPermissions(),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
      setPermissions(permissionsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleEditUser(user: User) {
    try {
      const userData = await userApi.getUser(user.id);
      setSelectedUser(userData);
      setUserRoles(userData.roles.map(r => r.id));
      setUserPermissions(userData.permissions.map(p => p.id));
      setEditingUser({
        email: userData.email || '',
        full_name: userData.full_name || '',
        is_active: userData.is_active,
        is_superuser: userData.is_superuser,
      });
      setDialogOpen(true);
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  }

  async function handleSaveUser() {
    if (!selectedUser || !editingUser) return;
    
    try {
      await userApi.updateUser(selectedUser.id, {
        email: editingUser.email || undefined,
        full_name: editingUser.full_name || undefined,
        password: editingUser.password,
        is_active: editingUser.is_active,
        is_superuser: editingUser.is_superuser,
        role_ids: userRoles,
        permission_ids: userPermissions,
      });
      setDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Failed to update user:', error);
      alert(error instanceof Error ? error.message : 'Failed to update user');
    }
  }

  async function handleCreateUser() {
    try {
      await userApi.createUser({
        ...newUser,
        role_ids: [],
        permission_ids: [],
      });
      setDialogOpen(false);
      setNewUser({ username: '', password: '', email: '', full_name: '' });
      loadData();
    } catch (error) {
      console.error('Failed to create user:', error);
      alert(error instanceof Error ? error.message : 'Failed to create user');
    }
  }

  async function handleDeleteUser(userId: number) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
      await userApi.deleteUser(userId);
      loadData();
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete user');
    }
  }

  async function handleEditRole(role: Role) {
    try {
      const roleData = await userApi.getRoles();
      const fullRole = roleData.find(r => r.id === role.id);
      if (fullRole) {
        setSelectedRole(fullRole);
        setEditingRole({
          name: fullRole.name,
          description: fullRole.description || '',
        });
        setRolePermissionIds(fullRole.permissions?.map(p => p.id) || []);
        setRoleDialogOpen(true);
      }
    } catch (error) {
      console.error('Failed to load role:', error);
    }
  }

  async function handleSaveRole() {
    if (!selectedRole || !editingRole) return;
    
    try {
      await userApi.updateRole(selectedRole.id, {
        name: editingRole.name || undefined,
        description: editingRole.description ? (editingRole.description === null ? undefined : editingRole.description) : undefined,
        permission_ids: rolePermissionIds,
      });
      setRoleDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Failed to update role:', error);
      alert(error instanceof Error ? error.message : 'Failed to update role');
    }
  }

  async function handleCreateRole() {
    try {
      await userApi.createRole({
        ...newRole,
        permission_ids: rolePermissionIds,
      });
      setRoleDialogOpen(false);
      setNewRole({ name: '', description: '' });
      setRolePermissionIds([]);
      loadData();
    } catch (error) {
      console.error('Failed to create role:', error);
      alert(error instanceof Error ? error.message : 'Failed to create role');
    }
  }

  async function handleDeleteRole(roleId: number) {
    if (!confirm('Are you sure you want to delete this role?')) return;
    
    try {
      await userApi.deleteRole(roleId);
      loadData();
    } catch (error) {
      console.error('Failed to delete role:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete role');
    }
  }

  async function handleEditPermission(permission: Permission) {
    setSelectedPermission(permission);
    setEditingPermission({
      name: permission.name,
      resource: permission.resource,
      action: permission.action,
      description: permission.description || '',
    });
    setPermissionDialogOpen(true);
  }

  async function handleSavePermission() {
    if (!selectedPermission || !editingPermission) return;
    
    try {
      await userApi.updatePermission(selectedPermission.id, {
        name: editingPermission.name || undefined,
        resource: editingPermission.resource || undefined,
        action: editingPermission.action || undefined,
        description: editingPermission.description ? (editingPermission.description === null ? undefined : editingPermission.description) : undefined,
      });
      setPermissionDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Failed to update permission:', error);
      alert(error instanceof Error ? error.message : 'Failed to update permission');
    }
  }

  async function handleCreatePermission() {
    try {
      await userApi.createPermission(newPermission);
      setPermissionDialogOpen(false);
      setNewPermission({ name: '', resource: '', action: '', description: '' });
      loadData();
    } catch (error) {
      console.error('Failed to create permission:', error);
      alert(error instanceof Error ? error.message : 'Failed to create permission');
    }
  }

  async function handleDeletePermission(permissionId: number) {
    if (!confirm('Are you sure you want to delete this permission?')) return;
    
    try {
      await userApi.deletePermission(permissionId);
      loadData();
    } catch (error) {
      console.error('Failed to delete permission:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete permission');
    }
  }

  // Group permissions by resource
  const permissionsByResource = permissions.reduce((acc, perm) => {
    if (!acc[perm.resource]) {
      acc[perm.resource] = [];
    }
    acc[perm.resource].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  type UserWithRoles = User & { roles: { id: number; name: string }[] };

  const userColumns: ColumnDef<UserWithRoles>[] = useMemo(() => [
    {
      accessorKey: "username",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Username" />
      ),
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white font-semibold text-sm">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <span className="font-medium">{user.username}</span>
          </div>
        )
      },
    },
    {
      accessorKey: "full_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Full Name" />
      ),
      cell: ({ row }) => {
        const user = row.original;
        return <span>{user.full_name || '-'}</span>
      },
    },
    {
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Email" />
      ),
      cell: ({ row }) => {
        const user = row.original;
        return <span className="text-muted-foreground">{user.email || '-'}</span>
      },
    },
    {
      id: "roles",
      header: "Roles",
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex flex-wrap gap-1">
            {user.roles.length > 0 ? (
              user.roles.map(role => (
                <Badge key={role.id} variant="outline" className="text-xs">
                  {role.name}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">-</span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "is_active",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const user = row.original;
        return (
          <Badge variant={user.is_active ? "default" : "destructive"}>
            {user.is_active ? "Active" : "Inactive"}
          </Badge>
        )
      },
      sortingFn: (rowA, rowB) => {
        return (rowA.original.is_active ? 1 : 0) - (rowB.original.is_active ? 1 : 0);
      },
    },
    {
      accessorKey: "is_superuser",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Superuser" />
      ),
      cell: ({ row }) => {
        const user = row.original;
        return user.is_superuser ? (
          <Badge variant="default">Yes</Badge>
        ) : (
          <span className="text-muted-foreground text-sm">No</span>
        )
      },
      sortingFn: (rowA, rowB) => {
        return (rowA.original.is_superuser ? 1 : 0) - (rowB.original.is_superuser ? 1 : 0);
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEditUser(user)}
              title="Edit User"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            {user.id !== currentUser?.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteUser(user.id)}
                className="text-destructive hover:text-destructive"
                title="Delete User"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )
      },
    },
  ], [currentUser]);

  const roleColumns: ColumnDef<Role & { permissions?: { id: number; name: string }[] }>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const role = row.original;
        return <span className="font-medium">{role.name}</span>
      },
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Description" />
      ),
      cell: ({ row }) => {
        const role = row.original;
        return <span className="text-muted-foreground">{role.description || '-'}</span>
      },
    },
    {
      id: "permissions",
      header: "Permissions",
      cell: ({ row }) => {
        const role = row.original;
        return (
          <div className="flex flex-wrap gap-1">
            {role.permissions && role.permissions.length > 0 ? (
              role.permissions.map(perm => (
                <Badge key={perm.id} variant="secondary" className="text-xs">
                  {perm.name}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">-</span>
            )}
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const role = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEditRole(role)}
              title="Edit Role"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteRole(role.id)}
              className="text-destructive hover:text-destructive"
              title="Delete Role"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      },
    },
  ], []);

  const permissionColumns: ColumnDef<Permission>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const perm = row.original;
        return <span className="font-medium">{perm.name}</span>
      },
    },
    {
      accessorKey: "resource",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Resource" />
      ),
      cell: ({ row }) => {
        const perm = row.original;
        return <Badge variant="outline">{perm.resource}</Badge>
      },
    },
    {
      accessorKey: "action",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Action" />
      ),
      cell: ({ row }) => {
        const perm = row.original;
        return <span>{perm.action}</span>
      },
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Description" />
      ),
      cell: ({ row }) => {
        const perm = row.original;
        return <span className="text-muted-foreground text-sm">{perm.description || '-'}</span>
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const perm = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEditPermission(perm)}
              title="Edit Permission"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeletePermission(perm.id)}
              className="text-destructive hover:text-destructive"
              title="Delete Permission"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      },
    },
  ], []);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading configuration...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage users, roles, and permissions</p>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Users</CardTitle>
                  <CardDescription>Manage user accounts and access</CardDescription>
                </div>
                <Dialog open={dialogOpen && !selectedUser} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => {
                      setSelectedUser(null);
                      setEditingUser(null);
                      setNewUser({ username: '', password: '', email: '', full_name: '' });
                    }}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create New User</DialogTitle>
                      <DialogDescription>Add a new user account to the system</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-username">Username *</Label>
                        <Input
                          id="new-username"
                          value={newUser.username}
                          onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">Password *</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-email">Email</Label>
                        <Input
                          id="new-email"
                          type="email"
                          value={newUser.email}
                          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-fullname">Full Name</Label>
                        <Input
                          id="new-fullname"
                          value={newUser.full_name}
                          onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                        />
                      </div>
                      <Button onClick={handleCreateUser} className="w-full">
                        <Save className="mr-2 h-4 w-4" />
                        Create User
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="rounded-full bg-muted p-6 mb-4">
                    <UserIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No users</h3>
                  <p className="text-muted-foreground text-center max-w-md mb-6">
                    Create your first user account to get started.
                  </p>
                </div>
              ) : (
                <DataTable
                  columns={userColumns}
                  data={users}
                  searchKey="username"
                  searchPlaceholder="Search by username..."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Roles</CardTitle>
              <CardDescription>System roles and their permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {roles.map((role) => (
                  <div key={role.id} className="rounded-lg border p-4">
                    <div className="font-semibold mb-2">{role.name}</div>
                    <div className="text-sm text-muted-foreground mb-3">{role.description}</div>
                    <div className="flex flex-wrap gap-2">
                      {role.permissions?.map(perm => (
                        <Badge key={perm.id} variant="secondary">{perm.name}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit User Dialog */}
      <Dialog open={dialogOpen && !!selectedUser} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User: {selectedUser?.username}</DialogTitle>
            <DialogDescription>Manage user roles and permissions</DialogDescription>
          </DialogHeader>
          {selectedUser && editingUser && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-fullname">Full Name</Label>
                  <Input
                    id="edit-fullname"
                    value={editingUser.full_name || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-password">New Password (leave blank to keep current)</Label>
                  <Input
                    id="edit-password"
                    type="password"
                    onChange={(e) => {
                      const password = e.target.value;
                      setEditingUser(prev => prev ? { ...prev, password: password || undefined } : null);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-active"
                      checked={editingUser.is_active ?? true}
                      onCheckedChange={(checked) => setEditingUser({ ...editingUser, is_active: checked as boolean })}
                    />
                    <Label htmlFor="edit-active" className="cursor-pointer">Active</Label>
                  </div>
                  {currentUser?.is_superuser && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="edit-superuser"
                        checked={editingUser.is_superuser ?? false}
                        onCheckedChange={(checked) => setEditingUser({ ...editingUser, is_superuser: checked as boolean })}
                      />
                      <Label htmlFor="edit-superuser" className="cursor-pointer">Superuser</Label>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Roles</Label>
                  <div className="mt-2 space-y-2">
                    {roles.map((role) => (
                      <div key={role.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`role-${role.id}`}
                          checked={userRoles.includes(role.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setUserRoles([...userRoles, role.id]);
                            } else {
                              setUserRoles(userRoles.filter(id => id !== role.id));
                            }
                          }}
                        />
                        <Label htmlFor={`role-${role.id}`} className="cursor-pointer">
                          <span className="font-medium">{role.name}</span>
                          <span className="text-sm text-muted-foreground"> - {role.description}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Permissions</Label>
                  <div className="mt-2 space-y-4">
                    {Object.entries(permissionsByResource).map(([resource, perms]) => (
                      <div key={resource} className="rounded-lg border p-4">
                        <div className="font-semibold mb-3 capitalize">{resource}</div>
                        <div className="grid grid-cols-2 gap-2">
                          {perms.map((perm) => (
                            <div key={perm.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`perm-${perm.id}`}
                                checked={userPermissions.includes(perm.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setUserPermissions([...userPermissions, perm.id]);
                                  } else {
                                    setUserPermissions(userPermissions.filter(id => id !== perm.id));
                                  }
                                }}
                              />
                              <Label htmlFor={`perm-${perm.id}`} className="cursor-pointer text-sm">
                                {perm.action}
                                {perm.description && (
                                  <span className="text-xs text-muted-foreground"> - {perm.description}</span>
                                )}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleSaveUser}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={roleDialogOpen && !!selectedRole} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Role: {selectedRole?.name}</DialogTitle>
            <DialogDescription>Manage role permissions</DialogDescription>
          </DialogHeader>
          {selectedRole && editingRole && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-role-name">Name</Label>
                  <Input
                    id="edit-role-name"
                    value={editingRole.name || ''}
                    onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-role-description">Description</Label>
                  <Input
                    id="edit-role-description"
                    value={editingRole.description || ''}
                    onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <Label>Permissions</Label>
                <div className="mt-2 space-y-4 max-h-96 overflow-y-auto border rounded p-4">
                  {Object.entries(permissionsByResource).map(([resource, perms]) => (
                    <div key={resource} className="rounded-lg border p-4">
                      <div className="font-semibold mb-3 capitalize">{resource}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {perms.map((perm) => (
                          <div key={perm.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`edit-role-perm-${perm.id}`}
                              checked={rolePermissionIds.includes(perm.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setRolePermissionIds([...rolePermissionIds, perm.id]);
                                } else {
                                  setRolePermissionIds(rolePermissionIds.filter(id => id !== perm.id));
                                }
                              }}
                            />
                            <Label htmlFor={`edit-role-perm-${perm.id}`} className="cursor-pointer text-sm">
                              {perm.action}
                              {perm.description && (
                                <span className="text-xs text-muted-foreground"> - {perm.description}</span>
                              )}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleSaveRole}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Permission Dialog */}
      <Dialog open={permissionDialogOpen && !!selectedPermission} onOpenChange={setPermissionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Permission: {selectedPermission?.name}</DialogTitle>
            <DialogDescription>Update permission details</DialogDescription>
          </DialogHeader>
          {selectedPermission && editingPermission && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-perm-name">Name</Label>
                <Input
                  id="edit-perm-name"
                  value={editingPermission.name || ''}
                  onChange={(e) => setEditingPermission({ ...editingPermission, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-perm-resource">Resource</Label>
                  <Input
                    id="edit-perm-resource"
                    value={editingPermission.resource || ''}
                    onChange={(e) => setEditingPermission({ ...editingPermission, resource: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-perm-action">Action</Label>
                  <Input
                    id="edit-perm-action"
                    value={editingPermission.action || ''}
                    onChange={(e) => setEditingPermission({ ...editingPermission, action: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-perm-description">Description</Label>
                <Input
                  id="edit-perm-description"
                  value={editingPermission.description || ''}
                  onChange={(e) => setEditingPermission({ ...editingPermission, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPermissionDialogOpen(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleSavePermission}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
