import React from 'react';
import './AccountInfo.css';

interface AccountInfoProps {
  avatar: string;
  name: string;
  status?: 'online' | 'offline' | 'away';
}

const AccountInfo: React.FC<AccountInfoProps> = ({
  avatar,
  name,
  status = 'offline',
}) => {
  return (
    <div className="account-info">
      <img src={avatar} alt={name} className="avatar" />
      <div className="info">
        <div className="name">{name}</div>
        <div className={`status ${status}`} />
      </div>
    </div>
  );
};

export default AccountInfo;
