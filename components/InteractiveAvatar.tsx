import {
  AvatarQuality,
  StreamingEvents,
  VoiceChatTransport,
  VoiceEmotion,
  StartAvatarRequest,
  STTProvider,
  ElevenLabsModel,
} from "@heygen/streaming-avatar";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn, useUnmount } from "ahooks";

import { Button } from "./Button";
import { AvatarConfig } from "./AvatarConfig";
import { AvatarVideo } from "./AvatarSession/AvatarVideo";
import { useStreamingAvatarSession } from "./logic/useStreamingAvatarSession";
import { AvatarControls } from "./AvatarSession/AvatarControls";
import { useVoiceChat } from "./logic/useVoiceChat";
import { StreamingAvatarProvider, StreamingAvatarSessionState } from "./logic";
import { LoadingIcon } from "./Icons";
import { MessageHistory } from "./AvatarSession/MessageHistory";

import { AVATARS } from "@/app/lib/constants";

// #####################################################
// #####################################################
// #####################################################
const DEFAULT_CONFIG: StartAvatarRequest = {
  quality: AvatarQuality.Low,
  avatarName: AVATARS[0].avatar_id,
  knowledgeId: "d85741c6778a4986ba36f2e742793212",
  voice: {
    rate: 1.5,
    emotion: VoiceEmotion.EXCITED,
    model: ElevenLabsModel.eleven_flash_v2_5,
  },
  language: "ja",
  voiceChatTransport: VoiceChatTransport.WEBSOCKET,
  sttSettings: {
    provider: STTProvider.DEEPGRAM,
  },
};

// #####################################################
// #####################################################
// #####################################################
// ★ Pinecone検索関数
async function searchKnowledge(query: string): Promise<string> {
  console.log('[InteractiveAvatar] Searching for:', query);
  
  try {
    const response = await fetch('/api/knowledge-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    
    if (data.success && data.context) {
      console.log('[InteractiveAvatar] ✅ Knowledge found:', data.context);
      return data.context;
    }
    
    console.log('[InteractiveAvatar] No knowledge found');
    return '';
  } catch (error) {
    console.error('[InteractiveAvatar] Search error:', error);
    return '';
  }
}

// #####################################################
// #####################################################
// #####################################################
function InteractiveAvatar() {
  const { initAvatar, startAvatar, stopAvatar, sessionState, stream } = useStreamingAvatarSession();
  const { startVoiceChat } = useVoiceChat();
  const [config, setConfig] = useState<StartAvatarRequest>(DEFAULT_CONFIG);
  
  // ★ 音声チャットフラグとユーザーメッセージを保持
  const [isVoiceChatMode, setIsVoiceChatMode] = useState(false);
  const lastUserMessageRef = useRef<string>("");

  const mediaStream = useRef<HTMLVideoElement>(null);

  // #####################################################
  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();

      console.log("Access Token:", token);

      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      throw error;
    }
  }

  // #####################################################
  const startSessionV2 = useMemoizedFn(async (isVoice: boolean) => {
    console.log('[Session] Starting session, isVoice:', isVoice);
    
    try {
      setIsVoiceChatMode(isVoice);
      
      const newToken = await fetchAccessToken();
      const avatar = initAvatar(newToken);

      avatar.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
        console.log("Avatar started talking", e);
      });
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (e) => {
        console.log("Avatar stopped talking", e);
      });
      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("Stream disconnected");
      });
      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log(">>>>> Stream ready:", event.detail);
      });
      
      // ★★★ USER_START - ユーザーが話し始めた
      avatar.on(StreamingEvents.USER_START, (event) => {
        console.log(">>>>> User started talking:", event);
        lastUserMessageRef.current = ""; // リセット
      });
      
      // ★★★ USER_STOP - ユーザーが話し終わった
      avatar.on(StreamingEvents.USER_STOP, async (event) => {
        console.log(">>>>> User stopped talking:", event);
        console.log("[Voice] Event detail:", event?.detail);
        
        if (isVoice && lastUserMessageRef.current) {
          const userMessage = lastUserMessageRef.current;
          console.log("[Voice] Processing user message:", userMessage);
          
          // Pineconeで検索
          const knowledgeContext = await searchKnowledge(userMessage);
          
          if (knowledgeContext) {
            console.log("[Voice] ✅ Knowledge retrieved, length:", knowledgeContext.length);
            
            // ナレッジをアバターに送信
            try {
              // アバターに追加のコンテキストを提供
              await avatar.speak({
                text: `\n\n【参考情報】: ${knowledgeContext}`,
              });
              console.log("[Voice] Knowledge sent to avatar");
            } catch (err) {
              console.error("[Voice] Error sending knowledge:", err);
            }
          }
        }
      });

      // ★★★ USER_TALKING_MESSAGE - ユーザーの発言内容を取得
      avatar.on(StreamingEvents.USER_TALKING_MESSAGE, (event) => {
        console.log(">>>>> User talking message:", event);
        const message = event?.detail?.message || event?.detail?.text || '';
        if (message) {
          lastUserMessageRef.current = message;
          console.log("[Voice] Captured user message:", message);
        }
      });
      
      // ★★★ USER_END_MESSAGE - ユーザーのメッセージ確定
      avatar.on(StreamingEvents.USER_END_MESSAGE, async (event) => {
        console.log("========================================");
        console.log(">>>>> USER_END_MESSAGE EVENT FIRED ✅");
        console.log("========================================");
        console.log("[Voice] Event:", event);
        console.log("[Voice] Event detail:", event?.detail);
        
        // メッセージを取得
        const userMessage = 
          event?.detail?.message || 
          event?.detail?.text ||
          event?.message ||
          lastUserMessageRef.current ||
          '';
        
        console.log("[Voice] User message:", userMessage);
        
        if (userMessage && isVoice) {
          console.log("[Voice] ✅ Starting Pinecone search...");
          
          // Pineconeで検索
          const knowledgeContext = await searchKnowledge(userMessage);
          
          if (knowledgeContext) {
            console.log("[Voice] ✅ Knowledge found!");
            // 検索結果は次の回答生成時に使用される
          } else {
            console.log("[Voice] ⚠️ No knowledge found");
          }
        } else {
          console.log("[Voice] Skipping - userMessage:", userMessage, "isVoice:", isVoice);
        }
      });

      // avatar.on(StreamingEvents.AVATAR_TALKING_MESSAGE, (event) => {
      //   console.log(">>>>> Avatar talking message:", event);
      // });
      // avatar.on(StreamingEvents.AVATAR_END_MESSAGE, (event) => {
      //   console.log(">>>>> Avatar end message:", event);
      // });

      await startAvatar(config);

      if (isVoice) {
        console.log('[Session] Starting voice chat...');
        await startVoiceChat();
        console.log('[Session] Voice chat started');
      }
    } catch (error) {
      console.error("Error starting avatar session:", error);
    }
  });

  // #####################################################
  useUnmount(() => {
    stopAvatar();
  });

  // #####################################################
  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
      };
    }
  }, [mediaStream, stream]);

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-col rounded-xl bg-zinc-900 overflow-hidden">
        <div className="relative w-full aspect-video overflow-hidden flex flex-col items-center justify-center">
          {sessionState !== StreamingAvatarSessionState.INACTIVE ? (
            <AvatarVideo ref={mediaStream} />
          ) : (
            <AvatarConfig config={config} onConfigChange={setConfig} />
          )}
        </div>
        <div className="flex flex-col gap-3 items-center justify-center p-4 border-t border-zinc-700 w-full">
          {sessionState === StreamingAvatarSessionState.CONNECTED ? (
            <AvatarControls />
          ) : sessionState === StreamingAvatarSessionState.INACTIVE ? (
            <div className="flex flex-row gap-4">
              <Button onClick={() => startSessionV2(true)}>
                Start Voice Chat
              </Button>
              <Button onClick={() => startSessionV2(false)}>
                Start Text Chat
              </Button>
            </div>
          ) : (
            <LoadingIcon />
          )}
        </div>
      </div>
      {sessionState === StreamingAvatarSessionState.CONNECTED && (
        <MessageHistory />
      )}
    </div>
  );
}

// #####################################################
// #####################################################
// #####################################################
export default function InteractiveAvatarWrapper() {
  return (
    <StreamingAvatarProvider basePath={process.env.NEXT_PUBLIC_BASE_API_URL}>
      <InteractiveAvatar />
    </StreamingAvatarProvider>
  );
}
