export interface StashedTab {
  id?: number;
  windowId: number;
  windowIndex: number;
  tabIndex: number;
  title: string;
  url: string;
  favIconUrl?: string;
  pinned: boolean;
}

export interface TabSession {
  id: string;
  name: string;
  createdAt: string;
  windowCount: number;
  tabCount: number;
  tabs: StashedTab[];
}

export const SESSIONS_STORAGE_KEY = 'tabBankruptcySessions';
