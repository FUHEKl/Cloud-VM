export type Role = "USER" | "ADMIN";

export type VmStatus =
  | "PENDING"
  | "RUNNING"
  | "STOPPED"
  | "SUSPENDED"
  | "ERROR"
  | "DELETED";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export interface SshKey {
  id: string;
  name: string;
  publicKey: string;
  fingerprint: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  cpu: number;
  ramMb: number;
  diskGb: number;
  priceMonthly: number;
  isActive: boolean;
}

export interface VirtualMachine {
  id: string;
  name: string;
  oneVmId: number | null;
  status: VmStatus;
  cpu: number;
  ramMb: number;
  diskGb: number;
  ipAddress: string | null;
  osTemplate: string;
  sshHost: string | null;
  sshPort: number | null;
  sshUsername: string | null;
  userId: string;
  planId: string | null;
  plan?: Plan;
  createdAt: string;
  updatedAt: string;
}

export interface UserQuota {
  maxVms: number;
  maxCpu: number;
  maxRamMb: number;
  maxDiskGb: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface VmStats {
  total: number;
  running: number;
  stopped: number;
  pending: number;
  error: number;
}

export interface UserStats {
  total: number;
  active: number;
  newThisMonth: number;
}
