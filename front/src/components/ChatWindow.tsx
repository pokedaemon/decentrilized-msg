import React, { useState, useEffect, useRef } from "react";
import Message from "./Message.tsx";
import "./ChatWindow.css";

interface MessageItem {
  id: number;
  text: string;
  sender: "me" | "them";
}

interface ChatWindowProps {
  chatId: number | null;
  messages: Record<number, MessageItem[]>;
  sendMessage: (chatId: number, text: string) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  chatId,
  messages,
  sendMessage,
}) => {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const currentMsgs = messages[chatId ?? 0] ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatId, currentMsgs.length]);

  if (!chatId) {
    return (
      <div className="chat-window">
        <div className="empty-state">Выберите чат</div>
      </div>
    );
  }

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage(chatId, trimmed);
    setInput("");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-window">
      <div className="messages">
        {currentMsgs.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>
      <div className="input-area">
        <input
          type="text"
          placeholder="Введите сообщение…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKey}
        />
        <button onClick={send}>Отправить</button>
      </div>
    </div>
  );
};

export default ChatWindow;
