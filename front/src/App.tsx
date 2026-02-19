import React, { useState, useContext } from "react";
import { AuthContext } from "./auth/AuthContext";
import { Login } from "./pages/Login";

import ChatList from "./components/ChatList";
import ChatWindow from "./components/ChatWindow";
import MenuDrawer from "./components/MenuDrawer";
import Settings from "./components/Settings";
import "./App.css";

interface Contact {
  id: number;
  name: string;
}

const contacts: Contact[] = [
  { id: 1, name: "Андрей" },
  { id: 2, name: "Борис" },
  { id: 3, name: "Валерия" },
  { id: 4, name: "Галина" },
];

interface MessageItem {
  id: number;
  text: string;
  sender: "me" | "them";
}

const App: React.FC = () => {
  const { isAuthenticated } = useContext(AuthContext);

  // Hook declarations before any early return
  const [selected, setSelected] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<number, MessageItem[]>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<"chat" | "profile" | "group" | "settings">(
    "chat",
  );

  const sendMessage = (chatId: number, text: string) => {
    setMessages((prev) => {
      const chatMsgs = prev[chatId] ?? [];
      const newMsg: MessageItem = { id: Date.now(), text, sender: "me" };
      return { ...prev, [chatId]: [...chatMsgs, newMsg] };
    });
  };

  const account = {
    avatar: "https://i.pravatar.cc/150?img=3",
    name: "Пользователь",
    status: "online" as const,
  };

  const handleSelect = (option: string) => {
    switch (option) {
      case "profile":
        setView("profile");
        break;
      case "group":
        setView("group");
        break;
      case "settings":
        setView("settings");
        break;
      case "chat":
      default:
        setView("chat");
        break;
    }
  };

  const renderContent = () => {
    if (view === "settings") {
      return <Settings />;
    }
    if (view === "profile") {
      return (
        <div style={{ padding: "1rem" }}>
          <h2>Профиль</h2>
          <p>Здесь будет информация о пользователе.</p>
        </div>
      );
    }
    if (view === "group") {
      return (
        <div style={{ padding: "1rem" }}>
          <h2>Новая группа</h2>
          <p>Заглушка для создания группы.</p>
        </div>
      );
    }
    // view === 'chat'
    return (
      <div style={{ display: "flex", height: "100%" }}>
        <div style={{ width: "260px", borderRight: "1px solid #ddd" }}>
          <ChatList
            contacts={contacts}
            onSelect={setSelected}
            selectedId={selected}
            account={account}
          />
        </div>
        <div style={{ flex: 1 }}>
          <ChatWindow
            chatId={selected}
            messages={messages}
            sendMessage={sendMessage}
          />
        </div>
      </div>
    );
  };

  // Authentication guard
  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <button className="burger" onClick={() => setDrawerOpen(true)}>
          ☰
        </button>
        <h1 className="title">Diploma Messenger</h1>
      </header>
      <MenuDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelect={handleSelect}
      />
      {renderContent()}
    </div>
  );
};

export default App;
