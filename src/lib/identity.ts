import type { Participant } from '../types';
import { supabase } from './supabase';

const DISPLAY_NAME_KEY = 'weekend-vote-display-name';
const LEGACY_BROWSER_ID = 'username-primary';

export const getStoredDisplayName = () => localStorage.getItem(DISPLAY_NAME_KEY) ?? '';

export const storeDisplayName = (displayName: string) => {
  localStorage.setItem(DISPLAY_NAME_KEY, displayName.trim());
};

export const getOrCreateParticipant = async (displayName: string): Promise<Participant> => {
  const normalizedName = displayName.trim();

  if (!normalizedName) {
    throw new Error('请输入用户名');
  }

  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('display_name', normalizedName)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    storeDisplayName(normalizedName);
    return data;
  }

  const { data: created, error: insertError } = await supabase
    .from('participants')
    .insert({
      browser_id: LEGACY_BROWSER_ID,
      display_name: normalizedName,
    })
    .select('*')
    .single();

  if (insertError?.code === '23505') {
    const { data: retryData, error: retryError } = await supabase
      .from('participants')
      .select('*')
      .eq('display_name', normalizedName)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (retryError) {
      throw retryError;
    }

    storeDisplayName(normalizedName);
    return retryData;
  }

  if (insertError) {
    throw insertError;
  }

  storeDisplayName(normalizedName);
  return created;
};
