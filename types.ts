
export enum MessageStatus {
  PENDING = 'PENDING',
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  RECEIVED = 'RECEIVED'
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  group: string;
}

export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document';

export interface IncomingMessage {
  id: string;
  from: string;
  fromName?: string;
  text: string;
  timestamp: string;
  unread: boolean;
  isMe?: boolean;
  type?: MessageType;
  mediaUrl?: string;
  caption?: string;
}

export interface AutomationSettings {
  enabled: boolean;
  welcomeMessage: {
    enabled: boolean;
    text: string;
  };
  officeHours: {
    enabled: boolean;
    start: string; // HH:mm
    end: string;   // HH:mm
    awayMessage: string;
  };
  keywords: {
    enabled: boolean;
    rules: { trigger: string; response: string }[];
  };
}

export interface Campaign {
  id: string;
  name: string;
  message: string;
  status: 'draft' | 'scheduled' | 'running' | 'completed';
  totalContacts: number;
  sentCount: number;
  createdAt: string;
}
