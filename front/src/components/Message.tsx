import React from 'react';
import './Message.css';

interface MessageProps {
  message: {
    id: number;
    text: string;
    sender: 'me' | 'them';
  };
}

const Message: React.FC<MessageProps> = ({ message }) => {
  const isMe = message.sender === 'me';
  return (
    <div className={`message ${isMe ? 'me' : ''}`}>
      <div className="bubble">{message.text}</div>
    </div>
  );
};

export default Message;
