import { TaskType, TaskMode } from "@heygen/streaming-avatar";
import React, { useCallback, useEffect, useState } from "react";
import { usePrevious } from "ahooks";

import { Select } from "../Select";
import { Button } from "../Button";
import { SendIcon } from "../Icons";
import { useTextChat } from "../logic/useTextChat";
import { Input } from "../Input";
import { useConversationState } from "../logic/useConversationState";

// #####################################################
// #####################################################
// #####################################################
// ★ 新規追加: Pinecone検索関数
async function searchKnowledge(query: string): Promise<string> {
  try {
    const response = await fetch('/api/knowledge-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    
    if (data.success && data.context) {
      console.log('[TextInput] Knowledge found:', data.context);
      return data.context;
    }
    
    return '';
  } catch (error) {
    console.error('[TextInput] Knowledge search error:', error);
    return '';
  }
}

// #####################################################
// #####################################################
// #####################################################
export const TextInput: React.FC = () => {
  const { sendMessage, sendMessageSync, repeatMessage, repeatMessageSync } = useTextChat();
  const { startListening, stopListening } = useConversationState();
  const [taskType, setTaskType] = useState<TaskType>(TaskType.TALK);
  const [taskMode, setTaskMode] = useState<TaskMode>(TaskMode.ASYNC);
  const [message, setMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false); // ★ 新規追加

  // #####################################################
  // ★ 修正: Pinecone検索を統合
  const handleSend = useCallback(async () => {
    if (message.trim() === "") {
      return;
    }

    setIsSearching(true);

    try {
      let finalMessage = message;

      // TALKモードの場合のみPinecone検索を実行
      if (taskType === TaskType.TALK) {
        console.log('[TextInput] Searching knowledge for:', message);
        
        const knowledgeContext = await searchKnowledge(message);
        
        // ナレッジが見つかった場合、メッセージに追加
        if (knowledgeContext) {
          finalMessage = `${message}\n\n以下の情報を参考にしてください:\n${knowledgeContext}`;
          console.log('[TextInput] Enhanced message with knowledge');
        }
      }

      // アバターにメッセージを送信
      if (taskType === TaskType.TALK) {
        taskMode === TaskMode.SYNC
          ? sendMessageSync(finalMessage)
          : sendMessage(finalMessage);
      } else {
        taskMode === TaskMode.SYNC
          ? repeatMessageSync(finalMessage)
          : repeatMessage(finalMessage);
      }

      setMessage("");
    } catch (error) {
      console.error('[TextInput] Error sending message:', error);
      // エラーが発生しても元のメッセージを送信
      if (taskType === TaskType.TALK) {
        taskMode === TaskMode.SYNC
          ? sendMessageSync(message)
          : sendMessage(message);
      } else {
        taskMode === TaskMode.SYNC
          ? repeatMessageSync(message)
          : repeatMessage(message);
      }
      setMessage("");
    } finally {
      setIsSearching(false);
    }
  }, [
    taskType,
    taskMode,
    message,
    sendMessage,
    sendMessageSync,
    repeatMessage,
    repeatMessageSync,
  ]);

  // #####################################################
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !isSearching) {
        handleSend();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSend, isSearching]);

  const previousText = usePrevious(message);

  // #####################################################
  useEffect(() => {
    if (!previousText && message) {
      startListening();
    } else if (previousText && !message) {
      stopListening();
    }
  }, [message, previousText, startListening, stopListening]);

  return (
    <div className="flex flex-row gap-2 items-end w-full">
      <Select
        isSelected={(option) => option === taskType}
        options={Object.values(TaskType)}
        renderOption={(option) => option.toUpperCase()}
        value={taskType.toUpperCase()}
        onSelect={setTaskType}
      />
      <Select
        isSelected={(option) => option === taskMode}
        options={Object.values(TaskMode)}
        renderOption={(option) => option.toUpperCase()}
        value={taskMode.toUpperCase()}
        onSelect={setTaskMode}
      />
      <Input
        className="min-w-[500px]"
        placeholder={`Type something for the avatar to ${taskType === TaskType.REPEAT ? "repeat" : "respond"}...`}
        value={message}
        onChange={setMessage}
      />
      <Button 
        className="!p-2" 
        onClick={handleSend}
        disabled={isSearching} // ★ 新規追加: 検索中は無効化
      >
        {isSearching ? (
          <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
        ) : (
          <SendIcon size={20} />
        )}
      </Button>
    </div>
  );
};
