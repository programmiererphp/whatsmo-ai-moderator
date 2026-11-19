import { invoke } from '@tauri-apps/api/core';
import { recordDiagnostic, recordDiagnosticError } from '$lib/diagnostics/logger';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification
} from '@tauri-apps/plugin-notification';
import type {
  AuthPayload,
  AccountDevicePayload,
  ConnectionPayload,
  ContactLookupPayload,
  ContactNumberChangedPayload,
  ContactProfilePayload,
  ContactSyncRequestedPayload,
  ContactUpdatedPayload,
  DownloadedMediaPayload,
  GroupMetadataPayload,
  HistorySyncPayload,
  HistorySyncProgressPayload,
  IncomingMessagePayload,
  IncomingReactionPayload,
  MediaKind,
  OutgoingMediaPayload,
  OutgoingMessagePayload,
  ReceiptPayload,
  SessionStatusPayload,
  StatusPrivacy,
  StatusPostPayload,
  TypingPayload
} from './types';

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

/** Never log command arguments or response bodies: they include message content,
 * phone identifiers, pairing codes, media keys and session information.
 */
async function loggedInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const startedAt = Date.now();
  recordDiagnostic('info', 'native', command + '.start');
  try {
    const result = await invoke<T>(command, args);
    recordDiagnostic('info', 'native', command + '.success', { durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    recordDiagnosticError('native', command + '.failure', error);
    throw error;
  }
}

function observedEvent<T>(name: string, handler: (payload: T) => void): (event: { payload: T }) => void {
  return (event) => {
    recordDiagnostic(name === 'connection' || name === 'auth' ? 'info' : 'debug', 'bridge', name + '.received');
    try { handler(event.payload); }
    catch (error) {
      recordDiagnosticError('bridge', name + '.handler_failed', error);
      throw error;
    }
  };
}

export async function readNativeDiagnostics(): Promise<string> {
  if (!isTauriRuntime()) return 'Browser preview; native logs are only available in installed Android app.';
  return loggedInvoke<string>('read_native_diagnostics');
}


export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as TauriWindow);
}

export async function startQrAuth(): Promise<AuthPayload> {
  if (!isTauriRuntime()) {
    return {
      mode: 'qr',
      qrCode: 'whatsmo-dev-preview-qr',
      message: 'Browser preview is using a demo QR. Run inside Tauri to pair WhatsApp.'
    };
  }

  return loggedInvoke<AuthPayload>('start_qr_auth');
}

export async function requestPairCode(phoneNumber: string): Promise<AuthPayload> {
  if (!isTauriRuntime()) {
    return {
      mode: 'pair-code',
      pairCode: 'MOCK-248',
      phoneNumber,
      message: 'Browser preview pair code. Run inside Tauri to request a real WhatsApp code.'
    };
  }

  return loggedInvoke<AuthPayload>('request_pair_code', { phoneNumber });
}

export async function disconnectSession(): Promise<ConnectionPayload> {
  if (!isTauriRuntime()) {
    return { connected: false, message: 'Preview session cleared.' };
  }

  return loggedInvoke<ConnectionPayload>('disconnect_session');
}

export async function logoutSession(): Promise<ConnectionPayload> {
  if (!isTauriRuntime()) {
    return { connected: false, message: 'Preview session unlinked.' };
  }

  return loggedInvoke<ConnectionPayload>('logout_session');
}

export async function getSessionStatus(): Promise<SessionStatusPayload> {
  if (!isTauriRuntime()) {
    return {
      connected: false,
      running: false,
      message: 'Browser preview is not connected to WhatsApp.'
    };
  }

  return loggedInvoke<SessionStatusPayload>('get_session_status');
}

export async function getAccountDevice(): Promise<AccountDevicePayload> {
  if (!isTauriRuntime()) {
    return {
      connected: false,
      loggedIn: false,
      running: false,
      deviceName: 'Browser preview',
      phoneJid: '6281299012345@s.whatsapp.net',
      lidJid: '100000012345678@lid',
      pushName: 'Preview account',
      message: 'Browser preview is not connected to WhatsApp.'
    };
  }

  return loggedInvoke<AccountDevicePayload>('get_account_device');
}

export async function resumeSavedSession(): Promise<SessionStatusPayload> {
  if (!isTauriRuntime()) {
    return {
      connected: false,
      running: false,
      message: 'Browser preview has no saved WhatsApp session.'
    };
  }

  return loggedInvoke<SessionStatusPayload>('resume_saved_session');
}

export async function sendTextMessage(
  chatId: string,
  text: string,
  ephemeralDuration?: number,
  quotedMessageId?: string,
  quotedSender?: string,
  quotedText?: string
): Promise<OutgoingMessagePayload> {
  if (!isTauriRuntime()) {
    return {
      id: crypto.randomUUID(),
      chatId,
      text,
      timestampMs: Date.now()
    };
  }

  return loggedInvoke<OutgoingMessagePayload>('send_text_message', { chatId, text, ephemeralDuration, quotedMessageId, quotedSender, quotedText });
}

export async function revokeMessage(chatId: string, messageId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return loggedInvoke<void>('revoke_message', { chatId, messageId });
}

export async function editMessage(chatId: string, messageId: string, newText: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return loggedInvoke<void>('edit_message', { chatId, messageId, newText });
}

export async function sendReaction(chatId: string, messageId: string, senderId: string, emoji: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return loggedInvoke<void>('send_reaction', { chatId, messageId, senderId, emoji });
}

export async function sendChatPresence(chatId: string, composing: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  return loggedInvoke<void>('send_chat_presence', { chatId, composing });
}

export async function markChatRead(chatId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return loggedInvoke<void>('mark_chat_read', { chatId });
}

export async function sendMediaMessage(
  chatId: string,
  kind: MediaKind,
  data: number[],
  mimeType: string,
  fileName: string,
  caption?: string,
  durationSeconds?: number,
  viewOnce?: boolean,
  ptt?: boolean,
  ephemeralDuration?: number
): Promise<OutgoingMediaPayload> {
  if (!isTauriRuntime()) {
    return {
      id: crypto.randomUUID(),
      chatId,
      kind,
      name: fileName,
      caption,
      timestampMs: Date.now()
    };
  }

  return loggedInvoke<OutgoingMediaPayload>('send_media_message', {
    chatId,
    kind,
    data,
    mimeType,
    fileName,
    caption,
    durationSeconds,
    viewOnce,
    ptt,
    ephemeralDuration
  });
}

export async function downloadMediaAttachment(media: {
  kind: MediaKind;
  name: string;
  mimeType?: string;
  directPath?: string;
  mediaKey?: number[];
  fileSha256?: number[];
  fileEncSha256?: number[];
  fileLength?: number;
}): Promise<DownloadedMediaPayload> {
  if (!media.directPath || !media.mediaKey || !media.fileSha256 || !media.fileEncSha256 || !media.fileLength) {
    throw new Error('Attachment is missing download metadata.');
  }

  if (!isTauriRuntime()) {
    return {
      kind: media.kind,
      name: media.name,
      mimeType: media.mimeType ?? 'application/octet-stream',
      size: 0,
      data: []
    };
  }

  return loggedInvoke<DownloadedMediaPayload>('download_media_attachment', {
    kind: media.kind,
    name: media.name,
    mimeType: media.mimeType ?? 'application/octet-stream',
    directPath: media.directPath,
    mediaKey: media.mediaKey,
    fileSha256: media.fileSha256,
    fileEncSha256: media.fileEncSha256,
    fileLength: media.fileLength
  });
}

export async function sendTextStatus(
  text: string,
  backgroundArgb: number,
  font: number,
  recipients: string[],
  privacy: StatusPrivacy
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return {
      id: crypto.randomUUID(),
      text,
      timestampMs: Date.now()
    };
  }

  return loggedInvoke<StatusPostPayload>('send_text_status', {
    text,
    backgroundArgb,
    font,
    recipients,
    privacy
  });
}

export async function sendRawStatus(
  text: string,
  recipients: string[],
  privacy: StatusPrivacy
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return { id: crypto.randomUUID(), text, timestampMs: Date.now() };
  }

  return loggedInvoke<StatusPostPayload>('send_raw_status', { text, recipients, privacy });
}

export async function sendImageStatus(
  data: number[],
  thumbnail: number[] | null,
  caption: string,
  recipients: string[],
  privacy: StatusPrivacy
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return { id: crypto.randomUUID(), text: caption || 'Image status', timestampMs: Date.now() };
  }

  return loggedInvoke<StatusPostPayload>('send_image_status', {
    data,
    thumbnail,
    caption,
    recipients,
    privacy
  });
}

export async function sendVideoStatus(
  data: number[],
  thumbnail: number[],
  durationSeconds: number,
  caption: string,
  recipients: string[],
  privacy: StatusPrivacy
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return { id: crypto.randomUUID(), text: caption || 'Video status', timestampMs: Date.now() };
  }

  return loggedInvoke<StatusPostPayload>('send_video_status', {
    data,
    thumbnail,
    durationSeconds,
    caption,
    recipients,
    privacy
  });
}

export async function revokeStatus(
  messageId: string,
  recipients: string[],
  privacy: StatusPrivacy
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return { id: crypto.randomUUID(), text: `Revoked ${messageId}`, timestampMs: Date.now() };
  }

  return loggedInvoke<StatusPostPayload>('revoke_status', { messageId, recipients, privacy });
}

export async function sendStatusReaction(
  statusOwner: string,
  serverId: number,
  reaction: string
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return { id: String(serverId), text: reaction ? `Reacted with ${reaction}` : 'Reaction removed', timestampMs: Date.now() };
  }

  return loggedInvoke<StatusPostPayload>('send_status_reaction', { statusOwner, serverId, reaction });
}

export async function syncContacts(phones: string[]): Promise<ContactLookupPayload[]> {
  if (!isTauriRuntime()) {
    return phones.map((phone) => ({
      id: `${phone.replace(/\D/g, '')}@s.whatsapp.net`,
      phone: phone.replace(/\D/g, ''),
      about: 'Browser preview contact',
      isBusiness: false,
      isRegistered: true
    }));
  }

  return loggedInvoke<ContactLookupPayload[]>('sync_contacts', { phones });
}

export async function syncContactProfiles(jids: string[]): Promise<ContactProfilePayload[]> {
  if (!isTauriRuntime()) {
    return jids.map((jid) => ({
      id: jid,
      phone: jid.split('@')[0] ?? jid,
      about: 'Browser preview profile',
      isBusiness: false,
      updatedAtMs: Date.now()
    }));
  }

  return loggedInvoke<ContactProfilePayload[]>('sync_contact_profiles', { jids });
}

export async function syncGroupMetadata(groupIds: string[]): Promise<GroupMetadataPayload[]> {
  if (!isTauriRuntime()) {
    return groupIds.map((groupId) => ({
      id: groupId,
      subject: groupId.includes('@g.us') ? 'Browser preview group' : groupId,
      description: 'Preview group metadata',
      participantCount: 3,
      adminCount: 1,
      isLocked: false,
      isAnnouncement: false,
      participants: []
    }));
  }

  return loggedInvoke<GroupMetadataPayload[]>('sync_group_metadata', { groupIds });
}

export async function enableNotifications(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return true;
  }

  const alreadyGranted = await isPermissionGranted();
  if (alreadyGranted) {
    return true;
  }

  const permission = await requestPermission();
  return permission === 'granted';
}

export function notifyNewMessage(title: string, body: string, chatId: string): void {
  if (!isTauriRuntime()) {
    return;
  }

  sendNotification({
    title,
    body,
    extra: { chatId },
    group: chatId
  });
}

export async function connectNotificationActions(onOpenChat: (chatId: string) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  const listener = await onAction((notification) => {
    const chatId = notification.extra?.chatId;
    if (typeof chatId === 'string' && chatId.length > 0) {
      onOpenChat(chatId);
    }
  });

  return () => {
    void listener.unregister();
  };
}

export interface BridgeHandlers {
  onAuth: (payload: AuthPayload) => void;
  onConnection: (payload: ConnectionPayload) => void;
  onMessage: (payload: IncomingMessagePayload) => void;
  onReaction: (payload: IncomingReactionPayload) => void;
  onHistorySync: (payload: HistorySyncPayload) => void;
  onHistoryProgress: (payload: HistorySyncProgressPayload) => void;
  onContactUpdated: (payload: ContactUpdatedPayload) => void;
  onContactNumberChanged: (payload: ContactNumberChangedPayload) => void;
  onContactSyncRequested: (payload: ContactSyncRequestedPayload) => void;
  onTyping: (payload: TypingPayload) => void;
  onReceipt: (payload: ReceiptPayload) => void;
}

export async function connectBridge(handlers: BridgeHandlers): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  const unlisteners = await Promise.all([
    listen<AuthPayload>('whatsmo://auth', observedEvent('auth', handlers.onAuth)),
    listen<ConnectionPayload>('whatsmo://connection', observedEvent('connection', handlers.onConnection)),
    listen<IncomingMessagePayload>('whatsmo://message', observedEvent('message', handlers.onMessage)),
    listen<IncomingReactionPayload>('whatsmo://reaction', observedEvent('reaction', handlers.onReaction)),
    listen<HistorySyncPayload>('whatsmo://history-sync', observedEvent('history-sync', handlers.onHistorySync)),
    listen<HistorySyncProgressPayload>('whatsmo://history-progress', observedEvent('history-progress', handlers.onHistoryProgress)),
    listen<ContactUpdatedPayload>('whatsmo://contact-updated', observedEvent('contact-updated', handlers.onContactUpdated)),
    listen<ContactNumberChangedPayload>('whatsmo://contact-number-changed', observedEvent('contact-number-changed', handlers.onContactNumberChanged)),
    listen<ContactSyncRequestedPayload>('whatsmo://contact-sync-requested', observedEvent('contact-sync-requested', handlers.onContactSyncRequested)),
    listen<TypingPayload>('whatsmo://typing', observedEvent('typing', handlers.onTyping)),
    listen<ReceiptPayload>('whatsmo://receipt', observedEvent('receipt', handlers.onReceipt))
  ]);

  return () => {
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}

export interface DeviceContact {
  name: string;
  phone: string;
}

export async function getDeviceContacts(): Promise<DeviceContact[]> {
  if (!isTauriRuntime()) {
    return [];
  }

  try {
    const result = await loggedInvoke<{ contacts: string }>('plugin:contacts|get_contacts');
    return JSON.parse(result.contacts) as DeviceContact[];
  } catch {
    return [];
  }
}

export async function checkContactsPermission(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }

  try {
    const result = await loggedInvoke<{ granted: boolean }>('plugin:contacts|check_permission');
    return result.granted;
  } catch {
    return false;
  }
}
