import React, { useState } from "react";
import AccountInfo from "./AccountInfo";
import "./ChatList.css";

interface Contact {
  id: number;
  name: string;
}

interface Account {
  avatar: string;
  name: string;
  status?: "online" | "offline" | "away";
}

interface ChatListProps {
  contacts: Contact[];
  onSelect: (id: number) => void;
  selectedId: number | null;
  account: Account;
}

const ChatList: React.FC<ChatListProps> = ({
  contacts,
  onSelect,
  selectedId,
  account,
}) => {
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="chat-list">
      <AccountInfo
        avatar={account.avatar}
        name={account.name}
        status={account.status}
      />
      <input
        type="text"
        placeholder="Поиск…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div>
        {filtered.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`contact ${c.id === selectedId ? "selected" : ""}`}
          >
            {c.name}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatList;
