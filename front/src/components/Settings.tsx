import React, { useState } from "react";
import "./Settings.css";

interface Section {
  title: string;
  description: string;
}

const sections: Section[] = [
  { title: "Аккаунт", description: "Настройки профиля и авторизации" },
  { title: "Сообщения", description: "Параметры чат‑окна и файлов" },
  { title: "Безопасность", description: "Ключи и шифрование" },
  { title: "Уведомления", description: "Голос, вибрация и звук" },
  { title: "Медиа и данные", description: "Хранение и очистка" },
];

const Settings: React.FC = () => {
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (title: string) => {
    setOpen(open === title ? null : title);
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>Настройки</h2>
      </div>
      <ul className="settings-list">
        {sections.map((s) => (
          <li key={s.title} className="settings-item">
            <div
              className="item-title"
              onClick={() => toggle(s.title)}
              style={{ cursor: "pointer" }}
            >
              {s.title}
            </div>
            <div className="item-desc">{s.description}</div>
            {open === s.title && (
              <div className="settings-modal">
                <div className="modal-content">
                  <h3>{s.title}</h3>
                  <p>Контент для настройки "{s.title}" будет здесь.</p>
                  <button onClick={() => setOpen(null)}>Закрыть</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Settings;
