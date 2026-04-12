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
  mfaEnabled?: boolean;
  mfaEnabledAt?: string | null;
  mfaRecoveryCodesGeneratedAt?: string | null;
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

export interface GeneratedSshKeyResponse {
  key: SshKey;
  privateKey: string;
  filename: string;
  notice: string;
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

export type AssistantRole = "USER" | "ASSISTANT" | "SYSTEM";

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  provider?: string;
  model?: string;
  createdAt: string;
  pendingAction?: AssistantPendingAction;
}

export interface AssistantPendingAction {
  action: "start" | "stop" | "restart";
  vmId: string;
  vmName: string;
  confirmationToken: string;
}

export interface AssistantConfirmActionResponse {
  ok: boolean;
  action: "start" | "stop" | "restart";
  vmId: string;
  vmName: string;
  message: string;
}

export interface AssistantConversation {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    messages: number;
  };
}

export type AssistantSseEvent =
  | {
      conversationId: string;
      messageId?: string;
      provider?: string;
      model?: string;
      pendingAction?: AssistantPendingAction;
    }
  | {
      type: "chunk";
      token: string;
    }
  | {
      type: "done";
    }
  | {
      type: "error";
      message: string;
    };
