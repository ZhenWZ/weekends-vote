import type { Participant } from '../types';
import { supabase } from './supabase';

const BROWSER_ID_KEY = 'weekend-vote-browser-id';
const DISPLAY_NAME_KEY = 'weekend-vote-display-name';

const createBrowserId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const getBrowserId = () => {
  const existing = localStorage.getItem(BROWSER_ID_KEY);
  if (existing) {
    return existing;
  }

  const next = createBrowserId();
  localStorage.setItem(BROWSER_ID_KEY, next);
  return next;
};

export const getStoredDisplayName = () => localStorage.getItem(DISPLAY_NAME_KEY) ?? '';

export const storeDisplayName = (displayName: string) => {
  localStorage.setItem(DISPLAY_NAME_KEY, displayName.trim());
};

export const getOrCreateParticipant = async (displayName: string): Promise<Participant> => {
  const normalizedName = displayName.trim();

  if (!normalizedName) {
    throw new Error('请输入用户名');
  }

  const browserId = getBrowserId();
  const { data, error } = await supabase
    .from('participants')
    .upsert(
      {
        browser_id: browserId,
        display_name: normalizedName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'browser_id,display_name' },
    )
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  storeDisplayName(normalizedName);
  return data;
};
