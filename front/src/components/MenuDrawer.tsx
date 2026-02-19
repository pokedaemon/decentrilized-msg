import React from "react";
import "./MenuDrawer.css";

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (option: string) => void;
}

const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const options = ["chat", "profile", "group", "settings"];
  const titles: Record<string, string> = {
    chat: "Чаты",
    profile: "Профиль",
    group: "Новая группа",
    settings: "Настройки",
  };

  return (
    <>
      <div className={`menu-drawer ${isOpen ? "open" : ""}`}>
        <div className="menu-header">
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="menu-list">
          {options.map((opt) => (
            <button
              key={opt}
              className="menu-item"
              onClick={() => {
                onSelect(opt);
                onClose();
              }}
            >
              {titles[opt]}
            </button>
          ))}
        </div>
      </div>
      {isOpen && <div className="drawer-backdrop" onClick={onClose} />}
    </>
  );
};

export default MenuDrawer;
