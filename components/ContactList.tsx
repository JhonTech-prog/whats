import React from 'react';

export interface Contact {
  id: string;
  name: string;
  lastMessage: string;
  lastMessageTime: string;
  avatarUrl?: string;
}

interface ContactListProps {
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ContactList: React.FC<ContactListProps> = ({ contacts, selectedId, onSelect }) => {
  return (
    <aside className="w-full md:w-80 bg-white border-r border-slate-200 h-full flex flex-col">
      <div className="p-4 border-b border-slate-100">
        <input
          type="text"
          placeholder="Buscar ou começar nova conversa"
          className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring focus:border-emerald-400"
        />
      </div>
      <ul className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-emerald-50 transition-all ${selectedId === contact.id ? 'bg-emerald-50' : ''}`}
            onClick={() => onSelect(contact.id)}
          >
            <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-500">
              {contact.avatarUrl ? (
                <img src={contact.avatarUrl} alt={contact.name} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                contact.name[0].toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-800 truncate">{contact.name}</span>
                <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">{contact.lastMessageTime}</span>
              </div>
              <span className="text-sm text-slate-500 truncate block">{contact.lastMessage}</span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default ContactList;
