import React, { useState } from 'react';

interface AuthModalProps {
  isOpen: boolean;
  onSubmit: (data: { phoneId: string; accessToken: string; apiUrl: string }) => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onSubmit }) => {
  const [phoneId, setPhoneId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [apiUrl, setApiUrl] = useState('https://whatsapp-nrx3.onrender.com');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-center">Conectar ao WhatsJhonTechAI</h2>
        <form
          onSubmit={e => {
            e.preventDefault();
            onSubmit({ phoneId, accessToken, apiUrl });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium">PHONE ID</label>
            <input
              className="w-full border rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:border-blue-400"
              value={phoneId}
              onChange={e => setPhoneId(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">ACCESS TOKEN (META)</label>
            <input
              className="w-full border rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:border-blue-400"
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              required
              type="password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">API URL</label>
            <input
              className="w-full border rounded px-3 py-2 mt-1 focus:outline-none focus:ring focus:border-blue-400"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-green-600 text-white py-2 rounded font-semibold hover:bg-green-700 transition"
          >
            Conectar
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;
