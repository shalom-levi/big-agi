import { shallow } from 'zustand/shallow';

import { backendCaps } from '~/modules/backend/state-backend';

import { AudioLivePlayer } from '~/common/util/AudioLivePlayer';
import { CapabilityElevenLabsSpeechSynthesis } from '~/common/components/useCapabilities';
import { playSoundBuffer } from '~/common/util/audioUtils';
import { useUIPreferencesStore } from '~/common/state/store-ui';

import type { SpeechInputSchema } from './elevenlabs.router';
import { useElevenlabsStore } from './store-elevenlabs';


export const isValidElevenLabsApiKey = (apiKey?: string) => !!apiKey && apiKey.trim()?.length >= 32;

export const isElevenLabsEnabled = (apiKey?: string) => apiKey
  ? isValidElevenLabsApiKey(apiKey)
  : backendCaps().hasVoiceElevenLabs;


export function useCapability(): CapabilityElevenLabsSpeechSynthesis {
  const [clientApiKey, hasVoices] = useElevenlabsStore(state => [state.elevenLabsApiKey, !!state.elevenLabsVoiceId], shallow);
  const isConfiguredServerSide = backendCaps().hasVoiceElevenLabs;
  const isConfiguredClientSide = clientApiKey ? isValidElevenLabsApiKey(clientApiKey) : false;
  const mayWork = isConfiguredServerSide || isConfiguredClientSide || hasVoices;
  return { mayWork, isConfiguredServerSide, isConfiguredClientSide };
}


export async function speakText(text: string, voiceId?: string) {
  if (!(text?.trim())) return;

  const { elevenLabsApiKey, elevenLabsVoiceId } = useElevenlabsStore.getState();
  if (!isElevenLabsEnabled(elevenLabsApiKey)) return;

  const { preferredLanguage } = useUIPreferencesStore.getState();
  const nonEnglish = !(preferredLanguage?.toLowerCase()?.startsWith('en'));

  try {
    const edgeResponse = await fetchApiElevenlabsSpeech(text, elevenLabsApiKey, voiceId || elevenLabsVoiceId, nonEnglish, false);
    const audioBuffer = await edgeResponse.arrayBuffer();
    await playSoundBuffer(audioBuffer);
  } catch (error) {
    console.error('Error playing first text:', error);
  }
}

// let liveAudioPlayer: LiveAudioPlayer | undefined = undefined;

export async function EXPERIMENTAL_speakTextStream(text: string, voiceId?: string) {
  if (!(text?.trim())) return;

  const { elevenLabsApiKey, elevenLabsVoiceId } = useElevenlabsStore.getState();
  if (!isElevenLabsEnabled(elevenLabsApiKey)) return;

  const { preferredLanguage } = useUIPreferencesStore.getState();
  const nonEnglish = !(preferredLanguage?.toLowerCase()?.startsWith('en'));

  const edgeResponse = await fetchApiElevenlabsSpeech(text, elevenLabsApiKey, voiceId || elevenLabsVoiceId, nonEnglish, true);

  // if (!liveAudioPlayer)
  const liveAudioPlayer = new AudioLivePlayer();
  // fire/forget
  void liveAudioPlayer.EXPERIMENTAL_playStream(edgeResponse);
}


/**
 * Note: we have to use this client-side API instead of TRPC because of ArrayBuffers..
 */
async function fetchApiElevenlabsSpeech(text: string, elevenLabsApiKey: string, elevenLabsVoiceId: string, nonEnglish: boolean, streaming: boolean): Promise<Response> {
  // NOTE: hardcoded 1000 as a failsafe, since the API will take very long and consume lots of credits for longer texts
  const speechInput: SpeechInputSchema = {
    elevenKey: elevenLabsApiKey,
    text: text.slice(0, 1000),
    voiceId: elevenLabsVoiceId,
    nonEnglish,
    ...(streaming && { streaming: true, streamOptimization: 4 }),
  };

  const response = await fetch('/api/elevenlabs/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(speechInput),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || errorData.message || 'Unknown error');
  }

  return response;
}